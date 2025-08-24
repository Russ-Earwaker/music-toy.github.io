// src/audio-core.js — epoch-based transport + per‑toy buses (<=300 lines)
export const DEFAULT_BPM = 120;
export const NUM_STEPS = 8;       // scheduler grid (eighths by default)
export const BEATS_PER_BAR = 4;

export let ac;
export let bpm = DEFAULT_BPM;

export function setBpm(v){ bpm = Math.max(40, Math.min(240, Number(v)||DEFAULT_BPM)); }
export function beatSeconds(){ return 60 / bpm; }
export function barSeconds(){ return beatSeconds() * BEATS_PER_BAR; }
export function stepSeconds(){ return barSeconds() / NUM_STEPS; }

export function ensureAudioContext(){
  const C = window.AudioContext || window.webkitAudioContext;
  if (!ac) ac = new C({ latencyHint: 'interactive' });
  return ac;
}

// --- epoch-based scheduler (bar-synchronous, step granularity) ---
let timer = null, currentStep = 0, nextNoteTime = 0;
let __epochStart = 0;         // NEVER mutates after start; used by getLoopInfo
let __barIndex = 0;           // current bar index from the epoch

export function createScheduler(onStep, onLoop){
  const lookahead = 25;       // ms
  const scheduleAhead = 0.12; // s
  function tick(){
    const ctx = ensureAudioContext();
    while (nextNoteTime < ctx.currentTime + scheduleAhead){
      try { onStep && onStep(currentStep, nextNoteTime); } catch(e){}
      // advance
      currentStep = (currentStep + 1) % NUM_STEPS;
      const elapsed = nextNoteTime + stepSeconds() - __epochStart;
      const newBarIndex = Math.floor(elapsed / barSeconds());
      if (newBarIndex !== __barIndex){
        __barIndex = newBarIndex;
        const thisBarStart = __epochStart + __barIndex * barSeconds();
        try { onLoop && onLoop(thisBarStart); } catch(e){}
      }
      nextNoteTime += stepSeconds();
    }
  }
  return {
    async start(){
      const ctx = ensureAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();
      // tiny unlock nudge
      try{
        const o = ctx.createOscillator(), g = ctx.createGain();
        g.gain.value = 0.0001; o.connect(g).connect(ctx.destination);
        const t = ctx.currentTime + 0.01; o.start(t); o.stop(t+0.02);
      }catch{}
      // Align epoch to the next step boundary for a clean downbeat
      const now = ctx.currentTime + 0.05;
      const grid = stepSeconds();
      const k = Math.ceil(now / grid);
      __epochStart = k * grid;
      __barIndex = 0;
      currentStep = 0;
      nextNoteTime = __epochStart;
      if (timer) clearInterval(timer);
      timer = setInterval(tick, lookahead);
    },
    stop(){ if (timer){ clearInterval(timer); timer=null; } currentStep=0; },
    get currentStep(){ return currentStep; }
  };
}

// Back-compat: expose loopStartTime as the fixed epoch
export function getLoopInfo(){
  const ctx = ensureAudioContext();
  const now = ctx.currentTime;
  const bl = barSeconds();
  const phase01 = ((now - __epochStart) % bl + bl) % bl / bl;
  return { loopStartTime: __epochStart, barLen: bl, beatLen: beatSeconds(), phase01, now, barIndex: __barIndex };
}

// --- per‑toy buses ---
const __toyGains = new Map();      // id -> GainNode
const __toyGainValues = new Map(); // id -> desired volume (0..1)
const __toyMutes = new Map();      // id -> boolean
let __master = null;

function getMaster(){
  const ctx = ensureAudioContext();
  if (!__master){
    __master = ctx.createGain();
    __master.gain.value = 1;
    __master.connect(ctx.destination);
  }
  return __master;
}

export function getToyGain(id='master'){
  const ctx = ensureAudioContext();
  const key = String(id||'master').toLowerCase();
  let g = __toyGains.get(key);
  if (!g){
    g = ctx.createGain();
    g.gain.value = __toyGainValues.has(key) ? __toyGainValues.get(key) : 1.0;
    g.connect(getMaster());
    __toyGains.set(key, g);
    if (!__toyGainValues.has(key)) __toyGainValues.set(key, 1.0);
  }
  return g;
}

export function setToyVolume(id='master', vol=1){
  const key = String(id||'master').toLowerCase();
  const v = Math.max(0, Math.min(1, Number(vol)||0));
  __toyGainValues.set(key, v);
  const g = getToyGain(key);
  const muted = __toyMutes.get(key) === true;
  g.gain.value = muted ? 0 : v;
}

export function setToyMuted(id='master', muted=false){
  const key = String(id||'master').toLowerCase();
  __toyMutes.set(key, !!muted);
  const g = getToyGain(key);
  const v = __toyGainValues.has(key) ? __toyGainValues.get(key) : 1.0;
  g.gain.value = muted ? 0 : v;
}

export function getToyVolume(id='master'){
  const key = String(id||'master').toLowerCase();
  return __toyGainValues.has(key) ? __toyGainValues.get(key) : 1.0;
}

export function isToyMuted(id='master'){
  const key = String(id||'master').toLowerCase();
  return __toyMutes.get(key) === true;
}
