// src/audio-core.js — transport + per‑toy buses (<=300 lines)
export const DEFAULT_BPM = 120;
export const NUM_STEPS = 8;
export const BEATS_PER_BAR = 4;
export const TICKS_PER_BEAT = 96;
export const TICKS_PER_BAR = TICKS_PER_BEAT * BEATS_PER_BAR;
export const ticksPerBeat = TICKS_PER_BEAT;
export const beatsPerBar = BEATS_PER_BAR;
export const ticksPerBar = TICKS_PER_BAR;
export const MIN_BPM = 30;
export const MAX_BPM = 200;

// Master output volume defaults + persistence (NOT part of scene save/load).
export const DEFAULT_MASTER_VOLUME = 0.2; // 20%
const LS_MASTER_VOL_KEY  = 'rhythmake_master_volume_v1';
const LS_MASTER_MUTE_KEY = 'rhythmake_master_mute_v1';

let __ctx;
export let bpm = DEFAULT_BPM;
const __activeNodes = new Set();

export let transportState = 'stopped';
export let positionTick = 0;
export let currentTick = 0;
export let currentBeat = 0;
export let currentBar = 0;
let __mapping = { originTick: 0, originAudioTime: 0, bpm: DEFAULT_BPM };
let __playPromise = null;

function clampTick(value){
  const n = Number(value);
  return Math.max(0, Number.isFinite(n) ? Math.round(n) : 0);
}
function ticksPerSecond(atBpm = bpm){
  return (TICKS_PER_BEAT * Math.max(MIN_BPM, Math.min(MAX_BPM, Number(atBpm) || DEFAULT_BPM))) / 60;
}
export function audioTimeToTick(audioTime){
  const time = Number(audioTime);
  if (!Number.isFinite(time)) return clampTick(positionTick);
  return clampTick(__mapping.originTick + ((time - __mapping.originAudioTime) * ticksPerSecond(__mapping.bpm)));
}
export function tickToAudioTime(tick){
  const target = clampTick(tick);
  return __mapping.originAudioTime + ((target - __mapping.originTick) / ticksPerSecond(__mapping.bpm));
}
export function getPositionAtAudioTime(audioTime){ return audioTimeToTick(audioTime); }
export function nextBeatTick(tick = currentTick, { strict = true } = {}){
  const value = clampTick(tick);
  const beat = Math.floor(value / TICKS_PER_BEAT);
  if (!strict && value % TICKS_PER_BEAT === 0) return value;
  return (beat + 1) * TICKS_PER_BEAT;
}
function refreshPosition(audioTime = null){
  const now = Number.isFinite(Number(audioTime)) ? Number(audioTime) : Number(__ctx?.currentTime);
  if (transportState === 'playing' && Number.isFinite(now)) positionTick = audioTimeToTick(now);
  currentTick = clampTick(positionTick);
  currentBeat = Math.floor(currentTick / TICKS_PER_BEAT);
  currentBar = Math.floor(currentTick / TICKS_PER_BAR);
  return currentTick;
}
function rebaseMapping(tick, audioTime, atBpm = bpm){
  __mapping = {
    originTick: clampTick(tick),
    originAudioTime: Number.isFinite(Number(audioTime)) ? Number(audioTime) : 0,
    bpm: Math.max(MIN_BPM, Math.min(MAX_BPM, Number(atBpm) || DEFAULT_BPM)),
  };
}
function emitTransportChange(detail){
  const payload = Object.freeze({ ...detail });
  try { document.dispatchEvent(new CustomEvent('transport:change', { detail: payload })); } catch {}
  return payload;
}
function emitLegacyEvent(name, detail){
  try { document.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
}
export function getTransportState(){
  refreshPosition(__ctx?.currentTime);
  return {
    state: transportState, positionTick: currentTick, currentTick, currentBeat, currentBar, bpm,
    ticksPerBeat: TICKS_PER_BEAT, beatsPerBar: BEATS_PER_BAR, ticksPerBar: TICKS_PER_BAR,
    mapping: { ...__mapping },
  };
}
export const transport = Object.freeze({
  get state(){ return transportState; },
  get positionTick(){ return getTransportState().positionTick; },
  get currentTick(){ return getTransportState().currentTick; },
  get currentBeat(){ return getTransportState().currentBeat; },
  get currentBar(){ return getTransportState().currentBar; },
  get bpm(){ return bpm; },
  ticksPerBeat: TICKS_PER_BEAT,
  beatsPerBar: BEATS_PER_BAR,
  ticksPerBar: TICKS_PER_BAR,
  play: (...args) => play(...args),
  pause: (...args) => pause(...args),
  seekTick: (...args) => seekTick(...args),
  returnToStart: (...args) => returnToStart(...args),
  getPositionAtAudioTime,
  tickToAudioTime,
  audioTimeToTick,
  nextBeatTick,
  getState: getTransportState,
});

export function ensureAudioContext(){
  if (__ctx) return __ctx;
  const C = window.AudioContext || window.webkitAudioContext;
  __ctx = new C({ latencyHint: 'interactive' });
  return __ctx;
}

// Return the existing AudioContext without creating a new one (used by unlockers).
export function peekAudioContext(){
  return __ctx || null;
}

export function setBpm(v){
  const next = Math.max(MIN_BPM, Math.min(MAX_BPM, Number(v)||DEFAULT_BPM));
  if (next === bpm) return;
  const oldBpm = bpm;
  const now = Number(__ctx?.currentTime) || 0;
  const tick = refreshPosition(now);
  bpm = next;
  rebaseMapping(tick, now, bpm);
  emitTransportChange({ type: 'tempo', tick, oldBpm, bpm, audioTime: now });
}

export function beatSeconds(){ return 60 / bpm; }
export function barSeconds(){ return beatSeconds() * BEATS_PER_BAR; }
export function stepSeconds(){ return barSeconds() / NUM_STEPS; }

export function getLoopInfo(){
  const ctx = ensureAudioContext();
  const now = ctx.currentTime;
  const bl = barSeconds();
  const tick = refreshPosition(now);
  const tickInBar = tick % TICKS_PER_BAR;
  return {
    loopStartTime: tickToAudioTime(0),
    barLen: bl,
    barSec: bl,
    beatLen: beatSeconds(),
    phase01: tickInBar / TICKS_PER_BAR,
    now,
    tick,
    currentTick: tick,
    tickInBar,
    beatIndex: currentBeat,
    beatInBar: Math.floor(tickInBar / TICKS_PER_BEAT),
    barIndex: currentBar,
    state: transportState,
  };
}

// Per‑toy gain routing
const __buses = new Map();       // id -> GainNode
const __vol = new Map();         // id -> volume [0..1]
const __mute = new Map();        // id -> bool
let __masterGain = null;

function __readMasterPersistedVolume(){
  try{
    const raw = window?.localStorage?.getItem?.(LS_MASTER_VOL_KEY);
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const clamped = Math.max(0, Math.min(1, n));

    // IMPORTANT:
    // If master volume is persisted as 0, we treat that as an invalid "silent boot"
    // state and reset to default. (Mute is the supported "silent" state.)
    if (clamped <= 0) return null;

    return clamped;
  }catch{ return null; }
}

function __readMasterPersistedMute(){
  try{
    const raw = window?.localStorage?.getItem?.(LS_MASTER_MUTE_KEY);
    if (raw == null) return null;
    const s = String(raw).toLowerCase();
    if (s === '1' || s === 'true') return true;
    if (s === '0' || s === 'false') return false;
    return null;
  }catch{ return null; }
}

function __writeMasterPersistedVolume(v){
  try{
    const vv = Math.max(0, Math.min(1, Number(v)||0));
    window?.localStorage?.setItem?.(LS_MASTER_VOL_KEY, String(vv));
  }catch{}
}

function __writeMasterPersistedMute(m){
  try{ window?.localStorage?.setItem?.(LS_MASTER_MUTE_KEY, m ? '1' : '0'); }catch{}
}

// Initialise master state once per page load (so refreshes persist).
{
  const pv = __readMasterPersistedVolume();
  const initVol = (pv != null) ? pv : DEFAULT_MASTER_VOLUME;
  __vol.set('master', initVol);
  // If we had to reset away from 0/invalid, write back the default so itch embeds don't stay silent.
  if (pv == null) __writeMasterPersistedVolume(initVol);
  const pm = __readMasterPersistedMute();
  if (pm != null) __mute.set('master', !!pm);
}

function ensureMasterGain() {
  if (__masterGain) return __masterGain;
  const ctx = ensureAudioContext();
  const g = ctx.createGain();
  const masterVol = __vol.get('master') ?? DEFAULT_MASTER_VOLUME;
  g.gain.value = __mute.get('master') ? 0 : masterVol;
  g.connect(ctx.destination);
  __masterGain = g;
  __buses.set('master', g);
  return g;
}

export function getToyGain(id='master'){
  const key = String(id||'master').toLowerCase();
  if (__buses.has(key)) return __buses.get(key);

  const ctx = ensureAudioContext();
  const g = ctx.createGain();
  g.gain.value = __mute.get(key) ? 0 : (__vol.get(key) ?? 1.0);

  if (key === 'master') {
    g.connect(ctx.destination);
    __masterGain = g;
  } else {
    const master = ensureMasterGain();
    g.connect(master);
  }

  __buses.set(key, g);
  return g;
}

export function setToyVolume(id='master', v=1){
  const key = String(id||'master').toLowerCase();
  const ctx = ensureAudioContext();
  const g = getToyGain(key);
  const vv = Math.max(0, Math.min(1, Number(v)||0));
  __vol.set(key, vv);
  if (key === 'master') __writeMasterPersistedVolume(vv);
  g.gain.setValueAtTime(__mute.get(key) ? 0 : vv, ctx.currentTime);
}

export function setToyMuted(id='master', muted=false, rampTime = 0){
  const key = String(id||'master').toLowerCase();
  const ctx = ensureAudioContext();
  const g = getToyGain(key);
  __mute.set(key, !!muted);
  if (key === 'master') __writeMasterPersistedMute(!!muted);
  const vv = __vol.get(key) ?? (key === 'master' ? DEFAULT_MASTER_VOLUME : 1.0);
  const targetVol = muted ? 0 : vv;
  g.gain.cancelScheduledValues(ctx.currentTime);
  if (rampTime > 0.001) {
    g.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + rampTime);
  } else {
    g.gain.setValueAtTime(targetVol, ctx.currentTime);
  }
}

export function registerActiveNode(node){
  if (!node) return;
  __activeNodes.add(node);
  const cleanup = ()=>{ __activeNodes.delete(node); };
  try{ node.addEventListener?.('ended', cleanup); }catch{}
  try{
    const prev = node.onended;
    node.onended = (e)=>{ try{ cleanup(); } finally { if (typeof prev === 'function') prev.call(node, e); } };
  }catch{}
}

export function stopAllActiveNodes(){
  const ctx = __ctx || null;
  const now = ctx?.currentTime ?? 0;
  const nodes = Array.from(__activeNodes);
  __activeNodes.clear();
  for (const node of nodes){
    try{ node.stop?.(now); }catch{}
    try{ node.disconnect?.(); }catch{}
  }
}

// Transport helpers
export function play(){
  const ctx = ensureAudioContext();
  if (transportState === 'playing') return Promise.resolve(false);
  if (__playPromise) return __playPromise;
  const fromState = transportState;
  const retainedTick = clampTick(positionTick);
  const resumePromise = (ctx.state === 'suspended') ? ctx.resume() : Promise.resolve();

  // Audio time may stop while paused, so every play establishes a fresh mapping
  // from the retained musical tick after the context is running.
  __playPromise = resumePromise.then(() => {
    const now = ctx.currentTime;
    rebaseMapping(retainedTick, now, bpm);
    positionTick = retainedTick;
    transportState = 'playing';
    refreshPosition(now);
    try{ window.__ripplerUserArmed = true; }catch{}

    // Let compatibility schedulers know audio can be scheduled from `now`.
    try { window.__NOTE_SCHED_LAST_RESUME_AT = now; } catch {}
    const detail = { type: 'play', positionTick: currentTick, audioTime: now, fromState };
    emitTransportChange(detail);
    emitLegacyEvent('transport:play', detail);
    emitLegacyEvent('transport:resume', detail);
    return true;
  }).catch(() => false).finally(() => { __playPromise = null; });
  return __playPromise;
}
export function start(){ return play(); }
export function pause(){
  if (transportState !== 'playing') return false;
  const ctx = ensureAudioContext();
  const now = ctx.currentTime;
  const tick = refreshPosition(now);
  positionTick = tick;
  transportState = 'paused';

  // Cancel queued sources, but retain the captured musical position.
  try{ stopAllActiveNodes(); }catch{}
  try{ ctx && ctx.suspend && ctx.suspend(); }catch{}
  try { window.__NOTE_SCHED_LAST_RESUME_AT = NaN; } catch {}
  const detail = { type: 'pause', positionTick: tick, audioTime: now };
  emitTransportChange(detail);
  emitLegacyEvent('transport:pause', detail);
  return true;
}
export function stop(){ return pause(); }

export function seekTick(tick, reason = 'seek'){
  const now = Number(__ctx?.currentTime) || 0;
  const fromTick = refreshPosition(now);
  const toTick = clampTick(tick);
  positionTick = toTick;
  rebaseMapping(toTick, now, bpm);
  currentTick = toTick;
  currentBeat = Math.floor(toTick / TICKS_PER_BEAT);
  currentBar = Math.floor(toTick / TICKS_PER_BAR);
  try { stopAllActiveNodes(); } catch {}
  const detail = { type: 'seek', fromTick, toTick, positionTick: toTick, audioTime: now, reason };
  emitTransportChange(detail);
  emitLegacyEvent('transport:seek', detail);
  return toTick;
}

export function returnToStart(){ return seekTick(0, 'return-to-start'); }

export function hardStop(){
  if (transportState === 'playing') pause();
  transportState = 'stopped';
  try{ stopAllActiveNodes(); }catch{}
  try{ const ctx = ensureAudioContext(); ctx && ctx.suspend && ctx.suspend(); }catch{}
  try { window.__NOTE_SCHED_LAST_RESUME_AT = NaN; } catch {}
}

export function isRunning(){ return transportState === 'playing'; }

export function getToyVolume(id='master'){
  const key = String(id||'master').toLowerCase();
  const fallback = (key === 'master') ? DEFAULT_MASTER_VOLUME : 1.0;
  return (__mute.get(key) ? 0 : (__vol.get(key) ?? fallback));
}
export function isToyMuted(id='master'){ const key=String(id||'master').toLowerCase(); return !!__mute.get(key); }
export function getToyVolumeRaw(id='master'){
  const key = String(id||'master').toLowerCase();
  const fallback = (key === 'master') ? DEFAULT_MASTER_VOLUME : 1.0;
  return (__vol.get(key) ?? fallback);
}

export function resumeAudioContextIfNeeded() {
  const ctx = ensureAudioContext();
  if (ctx.state === 'suspended') {
    return ctx.resume();
  }
  return Promise.resolve();
}
