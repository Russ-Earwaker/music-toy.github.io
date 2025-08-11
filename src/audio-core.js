// src/audio-core.js — core clock + context + channel
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

// Optional per-toy channel (GainNode). You can ignore and just connect to destination.
export function createChannel(gain=1){
  const ctx = ensureAudioContext();
  const g = ctx.createGain();
  g.gain.value = gain;
  g.connect(ctx.destination);
  return g;
}

// Scheduler
let currentStep = 0;
let nextNoteTime = 0;
let loopStartTime = 0;
const scheduleAheadTime = 0.12;
const lookahead = 25; // ms

export function createScheduler(scheduleCallback, onLoop){
  let timer = null;
  function tick(){
    const ctx = ensureAudioContext();
    while (nextNoteTime < ctx.currentTime + scheduleAheadTime){
      scheduleCallback(currentStep, nextNoteTime);
      nextNoteTime += stepSeconds();
      currentStep = (currentStep + 1) % NUM_STEPS;
      if (currentStep === 0){
        loopStartTime = nextNoteTime;
        onLoop && onLoop(loopStartTime);
      }
    }
  }
  return {
    async start(){
      const ctx = ensureAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();
      // iOS unlock tick
      const o = ctx.createOscillator(); const g = ctx.createGain();
      g.gain.value = 0.0001; o.connect(g).connect(ctx.destination);
      const t = ctx.currentTime + 0.01; o.start(t); o.stop(t+0.02);

      nextNoteTime = loopStartTime = ctx.currentTime + 0.05;
      currentStep = 0;
      timer = setInterval(tick, lookahead);
    },
    stop(){ clearInterval(timer); timer=null; currentStep = 0; },
    get currentStep(){ return currentStep; }
  };
}

export function getLoopInfo(){ return { loopStartTime, barLen: barSeconds() }; }
