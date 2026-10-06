import { createTickTransport } from './tick-transport.js';
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
export let positionTick = 0, currentTick = 0, currentBeat = 0, currentBar = 0;

function syncCompatibility(state) {
  bpm = state.bpm; transportState = state.state; positionTick = currentTick = state.currentTick;
  currentBeat = state.currentBeat; currentBar = state.currentBar;
  return state;
}
function emitLegacyEvent(name, detail) {
  try { document.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
}
const mainClock = createTickTransport({ id: 'main-heartbeat', getContext: () => __ctx, ensureContext: ensureAudioContext,
  emit(detail) {
    syncCompatibility(mainClock.getState());
    if (detail.type === 'play') {
      try { window.__ripplerUserArmed = true; window.__NOTE_SCHED_LAST_RESUME_AT = detail.audioTime; } catch {}
    } else if (detail.type === 'pause') {
      try { window.__NOTE_SCHED_LAST_RESUME_AT = NaN; } catch {}
    }
    emitLegacyEvent('transport:change', Object.freeze(detail));
    if (detail.type === 'play') {
      emitLegacyEvent('transport:play', detail); emitLegacyEvent('transport:resume', detail);
    } else if (['pause', 'seek'].includes(detail.type)) emitLegacyEvent('transport:' + detail.type, detail);
  }
});
export const audioTimeToTick = mainClock.audioTimeToTick;
export const tickToAudioTime = mainClock.tickToAudioTime;
export const getPositionAtAudioTime = mainClock.getPositionAtAudioTime;
export const nextBeatTick = mainClock.nextBeatTick;
export function getTransportState() { return syncCompatibility(mainClock.getState()); }
export const transport = Object.freeze({
  id: 'main-heartbeat',
  get state(){ return mainClock.state; },
  get positionTick(){ return getTransportState().positionTick; },
  get currentTick(){ return getTransportState().currentTick; },
  get currentBeat(){ return getTransportState().currentBeat; },
  get currentBar(){ return getTransportState().currentBar; },
  get bpm(){ return mainClock.bpm; },
  get originTick(){ return mainClock.originTick; },
  get originAudioTime(){ return mainClock.originAudioTime; },
  ticksPerBeat: TICKS_PER_BEAT, beatsPerBar: BEATS_PER_BAR, ticksPerBar: TICKS_PER_BAR,
  play: (...args) => play(...args), pause: (...args) => pause(...args),
  seekTick: (...args) => seekTick(...args), returnToStart: (...args) => returnToStart(...args),
  setBpm: (...args) => setBpm(...args),
  getPositionAtAudioTime, tickToAudioTime, audioTimeToTick, nextBeatTick, getState: getTransportState,
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

export function setBpm(v){ return mainClock.setBpm(v); }

export function beatSeconds(){ return 60 / bpm; }
export function barSeconds(){ return beatSeconds() * BEATS_PER_BAR; }
export function stepSeconds(){ return barSeconds() / NUM_STEPS; }

export function getLoopInfo(){
  const ctx = ensureAudioContext();
  const now = ctx.currentTime;
  const bl = barSeconds();
  const tick = getTransportState().currentTick;
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

let activeNodeCollector = null;
// Synchronous synth construction can associate its registered voices with a
// toy's cancellable lookahead, without changing clocks or sound envelopes.
export function withActiveNodeCollector(onNode, createNodes) {
  const previous = activeNodeCollector;
  activeNodeCollector = onNode;
  try { return createNodes(); } finally { activeNodeCollector = previous; }
}

export function registerActiveNode(node){
  if (!node) return;
  try { activeNodeCollector?.(node); } catch {}
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

// Legacy exports address Main; all domains use the same tick mapping implementation.
export function play(){ return mainClock.play(); }
export function start(){ return play(); }
export function pause(){ return mainClock.pause(); }
export function stop(){ return pause(); }
export function seekTick(tick, reason = 'seek'){ return mainClock.seekTick(tick, reason); }
export function returnToStart(){ return mainClock.returnToStart(); }
export function hardStop(){
  mainClock.hardStop(); syncCompatibility(mainClock.getState());
}
export function isRunning(){ return mainClock.state === 'playing'; }

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
