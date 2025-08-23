// src/audio-core.js — core clock + per‑toy buses (<=300 lines)
export const DEFAULT_BPM = 120;
export const NUM_STEPS = 8;
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

// --- scheduler (bar-synchronous, step granularity) ---
let timer = null, currentStep = 0, nextNoteTime = 0, loopStartTime = 0;
export function createScheduler(onStep, onLoop){
  const lookahead = 25;            // ms
  const scheduleAhead = 0.10;      // s
  function tick(){
    const ctx = ensureAudioContext();
    while (nextNoteTime < ctx.currentTime + scheduleAhead){
      try { onStep && onStep(currentStep, nextNoteTime); } catch(e){}
      currentStep = (currentStep + 1) % NUM_STEPS;
      if (currentStep === 0){
        loopStartTime = nextNoteTime + stepSeconds();
        try { onLoop && onLoop(loopStartTime); } catch(e){}
      }
      nextNoteTime += stepSeconds();
    }
  }
  return {
    async start(){
      const ctx = ensureAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();
      // nudge unlock
      try{
        const o = ctx.createOscillator(), g = ctx.createGain();
        g.gain.value = 0.0001; o.connect(g).connect(ctx.destination);
        const t = ctx.currentTime + 0.01; o.start(t); o.stop(t+0.02);
      }catch{}
      nextNoteTime = loopStartTime = ensureAudioContext().currentTime + 0.05;
      currentStep = 0;
      timer = setInterval(tick, lookahead);
    },
    stop(){ if (timer) clearInterval(timer); timer=null; currentStep=0; },
    get currentStep(){ return currentStep; }
  };
}

export function getLoopInfo(){ return { loopStartTime, barLen: barSeconds() }; }

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
