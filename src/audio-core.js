// src/audio-core.js — transport + per‑toy buses (<=300 lines)
export const DEFAULT_BPM = 120;
export const NUM_STEPS = 8;
export const BEATS_PER_BAR = 4;

let __ctx;
export let bpm = DEFAULT_BPM;

export function ensureAudioContext(){
  if (__ctx) return __ctx;
  const C = window.AudioContext || window.webkitAudioContext;
  __ctx = new C({ latencyHint: 'interactive' });
  return __ctx;
}

export function setBpm(v){
  bpm = Math.max(40, Math.min(240, Number(v)||DEFAULT_BPM));
}

export function beatSeconds(){ return 60 / bpm; }
export function barSeconds(){ return beatSeconds() * BEATS_PER_BAR; }
export function stepSeconds(){ return barSeconds() / NUM_STEPS; }

// Simple epoch-based loop info
let __epochStart = 0;
let __barIndex = 0;

export function getLoopInfo(){
  const ctx = ensureAudioContext();
  const now = ctx.currentTime;
  const bl = barSeconds();
  if (!__epochStart) __epochStart = now;
  const phase01 = ((now - __epochStart) % bl + bl) % bl / bl;
  return { loopStartTime: __epochStart, barLen: bl, beatLen: beatSeconds(), phase01, now, barIndex: __barIndex };
}

// Per‑toy gain routing
const __buses = new Map();       // id -> GainNode
const __vol = new Map();         // id -> volume [0..1]
const __mute = new Map();        // id -> bool

export function getToyGain(id='master'){
  const key = String(id||'master').toLowerCase();
  if (!__buses.has(key)){
    const ctx = ensureAudioContext();
    const g = ctx.createGain();
    g.gain.value = __mute.get(key) ? 0 : (__vol.get(key) ?? 1.0);
    g.connect(ctx.destination);
    __buses.set(key, g);
  }
  return __buses.get(key);
}

export function setToyVolume(id='master', v=1){
  const key = String(id||'master').toLowerCase();
  const ctx = ensureAudioContext();
  const g = getToyGain(key);
  const vv = Math.max(0, Math.min(1, Number(v)||0));
  __vol.set(key, vv);
  g.gain.setValueAtTime(__mute.get(key) ? 0 : vv, ctx.currentTime);
}

export function setToyMuted(id='master', muted=false, rampTime = 0){
  const key = String(id||'master').toLowerCase();
  const ctx = ensureAudioContext();
  const g = getToyGain(key);
  __mute.set(key, !!muted);
  const vv = __vol.get(key) ?? 1.0;
  const targetVol = muted ? 0 : vv;
  g.gain.cancelScheduledValues(ctx.currentTime);
  if (rampTime > 0.001) {
    g.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + rampTime);
  } else {
    g.gain.setValueAtTime(targetVol, ctx.currentTime);
  }
}

// Transport helpers
let __started = false;
export function start(){
  const ctx = ensureAudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  __started = true;
  __epochStart = ctx.currentTime; // Always reset epoch on start for clean sync.
  __barIndex = 0;
  try{ window.__ripplerUserArmed = true; }catch{}
  try{
    if (localStorage.getItem('mt_audio_dbg')==='1') console.log('[audio] transport:resume');
    document.dispatchEvent(new CustomEvent('transport:resume', { detail:{ now: ctx.currentTime }}));
  }catch{}
}
export function stop(){
  __started = false;
  __epochStart = 0; // Reset epoch on stop to ensure clean restart.
  try{ const ctx = ensureAudioContext(); ctx && ctx.suspend && ctx.suspend(); }catch{}
  try{
    if (localStorage.getItem('mt_audio_dbg')==='1') console.log('[audio] transport:pause');
    const ctx = __ctx || null;
    document.dispatchEvent(new CustomEvent('transport:pause', { detail:{ now: ctx?.currentTime || 0 }}));
  }catch{}
}

export function isRunning(){ return __started; }

export function getToyVolume(id='master'){ const key=String(id||'master').toLowerCase(); return (__mute.get(key)?0:(__vol.get(key)??1)); }
export function isToyMuted(id='master'){ const key=String(id||'master').toLowerCase(); return !!__mute.get(key); }
