// src/audio-core.js — transport + per‑toy buses (<=300 lines)
export const DEFAULT_BPM = 120;
export const NUM_STEPS = 8;
export const BEATS_PER_BAR = 4;
export const MIN_BPM = 30;
export const MAX_BPM = 200;

let __ctx;
export let bpm = DEFAULT_BPM;
const __activeNodes = new Set();

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

  // Preserve musical phase when changing tempo while running:
  // The bar length changes with BPM, so adjust the epoch so (now-epoch) maps
  // to the same phase within the new bar length (i.e. speed changes, position doesn't jump).
  try{
    if (__started && __epochStart){
      const ctx = __ctx || null;
      const now = ctx?.currentTime ?? 0;
      const oldBarLen = (60 / bpm) * BEATS_PER_BAR;
      if (Number.isFinite(now) && Number.isFinite(oldBarLen) && oldBarLen > 0){
        const phase01 = ((now - __epochStart) % oldBarLen + oldBarLen) % oldBarLen / oldBarLen;
        bpm = next;
        const newBarLen = (60 / bpm) * BEATS_PER_BAR;
        if (Number.isFinite(newBarLen) && newBarLen > 0){
          __epochStart = now - phase01 * newBarLen;
          return;
        }
      }
    }
  }catch{}

  bpm = next;
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
let __masterGain = null;

function ensureMasterGain() {
  if (__masterGain) return __masterGain;
  const ctx = ensureAudioContext();
  const g = ctx.createGain();
  const masterVol = __vol.get('master') ?? 1.0;
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
  try{ stopAllActiveNodes(); }catch{}
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

export function resumeAudioContextIfNeeded() {
  const ctx = ensureAudioContext();
  if (ctx.state === 'suspended') {
    return ctx.resume();
  }
  return Promise.resolve();
}
