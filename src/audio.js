// src/audio.js
import { noteToFreq, freqRatio } from './utils.js';

export const DEFAULT_BPM = 120;
export const NUM_STEPS = 8;
export const BEATS_PER_BAR = 4;

export const TOYS = [
  { name: 'Kick',  url: './assets/samples/RP4_KICK_1.mp3' },
  { name: 'Snare', url: './assets/samples/Brk_Snr.mp3' },
  { name: 'Hat',   url: './assets/samples/Cev_H2.mp3' },
  { name: 'Clap',  url: './assets/samples/Heater-6.mp3' }
];

export let ac;
export let buffers = {};         // sampleName -> AudioBuffer
export let bpm = DEFAULT_BPM;

let currentStep = 0;
let nextNoteTime = 0;
let loopStartTime = 0;

const scheduleAheadTime = 0.12;
const lookahead = 25; // ms

export function setBpm(val){ bpm = val; }
export function beatSeconds(){ return 60 / bpm; }
export function barSeconds(){ return beatSeconds() * BEATS_PER_BAR; }
export function stepSeconds(){ return barSeconds() / NUM_STEPS; }

async function loadSample(url){
  const res = await fetch(url);
  const ab = await res.arrayBuffer();
  return new Promise((ok, err) => ac.decodeAudioData(ab, ok, err));
}
export async function loadBuffers(){
  for (const t of TOYS) buffers[t.name] = await loadSample(t.url);
}

export function ensureAudioContext(){
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!ac) ac = new Ctx({ latencyHint: 'interactive' });
  return ac;
}

export function playSampleAt(buffer, when, rate=1){
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate; // TODO: replace with time-preserving pitch engine
  src.connect(ac.destination);
  src.start(when);
}

// --- Additional global synth voices ---
function envGain(ac, startTime, points){
  const g = ac.createGain();
  const p0 = points[0];
  g.gain.setValueAtTime(p0.v, startTime + p0.t);
  for (let i=1;i<points.length;i++){
    const p = points[i];
    g.gain.linearRampToValueAtTime(p.v, startTime + p.t);
  }
  return g;
}

function playKeypadAt(freq, when){
  const t0 = when;
  const acx = ac;
  // base sine + triangle + high overtone ping
  const osc1 = acx.createOscillator(); osc1.type='sine';    osc1.frequency.value=freq;
  const osc2 = acx.createOscillator(); osc2.type='triangle';osc2.frequency.value=freq*2;
  const ping = acx.createOscillator(); ping.type='sine';    ping.frequency.value=freq*3.2;

  const bp = acx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=freq*2; bp.Q.value=6;

  const g = envGain(acx, t0, [
    {t:0.00, v:0.0001},
    {t:0.01, v:0.28},
    {t:0.18, v:0.14},
    {t:0.45, v:0.0008},
  ]);

  osc1.connect(bp); osc2.connect(bp); ping.connect(bp);
  bp.connect(g).connect(acx.destination);

  osc1.start(t0); osc2.start(t0); ping.start(t0+0.005);
  osc1.stop(t0+0.55); osc2.stop(t0+0.55); ping.stop(t0+0.25);
}

function playPopAt(freq, when){
  const t0 = when;
  const acx = ac;
  // simple noise burst through bandpass
  const noise = acx.createBufferSource();
  const len = Math.max(1, Math.floor(acx.sampleRate * 0.25));
  const buffer = acx.createBuffer(1, len, acx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i=0;i<data.length;i++){
    const amp = 1 - i/len;
    data[i] = (Math.random()*2-1) * amp;
  }
  noise.buffer = buffer;

  const bp = acx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=freq; bp.Q.value=10;
  const g = envGain(acx, t0, [
    {t:0.00, v:0.0001},
    {t:0.004, v:0.6},
    {t:0.20, v:0.001},
  ]);

  noise.connect(bp).connect(g).connect(acx.destination);
  noise.start(t0); noise.stop(t0+0.22);
}

function playPadAt(freq, when){
  const t0 = when;
  const acx = ac;
  const osc = acx.createOscillator(); osc.type='triangle'; osc.frequency.value=freq;
  const lp  = acx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=freq*3;
  const g = envGain(acx, t0, [
    {t:0.00, v:0.0001},
    {t:0.05, v:0.20},
    {t:0.35, v:0.10},
    {t:0.65, v:0.0008},
  ]);
  osc.connect(lp).connect(g).connect(acx.destination);
  osc.start(t0); osc.stop(t0+0.7);
}

function playRetroAt(freq, when, wave){
  const t0 = when;
  const acx = ac;
  const osc = acx.createOscillator(); osc.type=wave; osc.frequency.value=freq;
  const g = envGain(acx, t0, [
    {t:0.00, v:0.0001},
    {t:0.01, v:0.22},
    {t:0.18, v:0.0008},
  ]);
  // light high-cut to smooth aliasing a touch
  const lp = acx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value = Math.min(12000, freq*6);
  osc.connect(lp).connect(g).connect(acx.destination);
  osc.start(t0); osc.stop(t0+0.25);
}

function playLaserAt(freq, when){
  const acx = ac; const t0 = when;
  const osc = acx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(freq*2, t0);
  osc.frequency.exponentialRampToValueAtTime(freq/4, t0+0.3);
  const g = envGain(acx, t0, [
    {t:0.00, v:0.0001},
    {t:0.01, v:0.35},
    {t:0.3, v:0.0008},
  ]);
  osc.connect(g).connect(acx.destination);
  osc.start(t0); osc.stop(t0+0.31);
}

function playWindyAt(freq, when){
  const acx = ac; const t0 = when;
  const noise = acx.createBufferSource();
  const len = Math.floor(acx.sampleRate * 0.4);
  const buffer = acx.createBuffer(1, len, acx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * (1 - i/len);
  noise.buffer = buffer;
  const bp = acx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value = freq; bp.Q.value=1;
  const g = envGain(acx, t0, [
    {t:0.00, v:0.0001},
    {t:0.05, v:0.28},
    {t:0.4, v:0.0008},
  ]);
  noise.connect(bp).connect(g).connect(acx.destination);
  noise.start(t0); noise.stop(t0+0.42);
}

function playAlienAt(freq, when){
  const acx = ac; const t0 = when;
  const carrier = acx.createOscillator(); carrier.type='sine'; carrier.frequency.value=freq;
  const mod = acx.createOscillator(); mod.type='sine'; mod.frequency.value=6;
  const modGain = acx.createGain(); modGain.gain.value = freq*0.5;
  mod.connect(modGain).connect(carrier.frequency);
  const g = envGain(acx, t0, [
    {t:0.00, v:0.0001},
    {t:0.01, v:0.25},
    {t:0.6, v:0.0008},
  ]);
  carrier.connect(g).connect(acx.destination);
  carrier.start(t0); mod.start(t0);
  carrier.stop(t0+0.62); mod.stop(t0+0.62);
}

function playOrganishAt(freq, when){
  const acx = ac; const t0 = when;
  const g = envGain(acx, t0, [
    {t:0.00, v:0.0001},
    {t:0.02, v:0.22},
    {t:0.4, v:0.0008},
  ]);
  [0,0.5,-0.5].forEach(detune => {
    const osc = acx.createOscillator(); osc.type='triangle'; osc.frequency.value=freq * Math.pow(2, detune/12);
    osc.connect(g);
    osc.start(t0); osc.stop(t0+0.42);
  });
  g.connect(acx.destination);
}

function playDropletAt(freq, when){
  const acx = ac; const t0 = when;
  const osc = acx.createOscillator(); osc.type='sine';
  osc.frequency.setValueAtTime(freq*2, t0);
  osc.frequency.exponentialRampToValueAtTime(freq/3, t0+0.25);
  const g = envGain(acx, t0, [
    {t:0.00, v:0.0001},
    {t:0.01, v:0.3},
    {t:0.25, v:0.0008},
  ]);
  osc.connect(g).connect(acx.destination);
  osc.start(t0); osc.stop(t0+0.26);
}

export function playToneAt(freq, when){
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.22, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.25);
  o.connect(g); g.connect(ac.destination);
  o.start(when); o.stop(when + 0.26);
}

export function getLoopInfo(){ return { loopStartTime, barLen: barSeconds() }; }

export function createScheduler(scheduleCallback, onLoop){
  let timer = null;

  function tick(){
    while (nextNoteTime < ac.currentTime + scheduleAheadTime){
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
      ensureAudioContext();
      if (ac.state === 'suspended') await ac.resume();

      // tiny blip (iOS unlock), non-blocking
      const g = ac.createGain(); g.gain.value = 0.0001; g.connect(ac.destination);
      const o = ac.createOscillator(); o.connect(g);
      const t = ac.currentTime + 0.01; o.start(t); o.stop(t+0.02);

      if (!Object.keys(buffers).length) { loadBuffers().catch(()=>{}); }

      nextNoteTime = loopStartTime = ac.currentTime + 0.05;
      currentStep = 0;
      timer = setInterval(tick, lookahead);
    },
    stop(){
      clearInterval(timer); timer = null;
      currentStep = 0;
    },
    get currentStep(){ return currentStep; }
  };
}

// instrument helper used by scheduler and bouncer
export function triggerInstrument(instrument, noteName, when){
  const freq = noteToFreq(noteName);
  if (instrument === 'tone') {
    playToneAt(freq, when);
  } else if (instrument === 'keypad' || instrument === 'chime') {
    playKeypadAt(freq, when);
  } else if (instrument === 'pop' || instrument === 'pluck') {
    playPopAt(freq, when);
  } else if (instrument === 'pad') {
    playPadAt(freq, when);
  } else if (instrument === 'retro-square') {
    playRetroAt(freq, when, 'square');
  } else if (instrument === 'retro-saw') {
    playRetroAt(freq, when, 'sawtooth');
  } else if (instrument === 'retro-tri') {
    playRetroAt(freq, when, 'triangle');
  } else if (instrument === 'laser') {
    playLaserAt(freq, when);
  } else if (instrument === 'windy') {
    playWindyAt(freq, when);
  } else if (instrument === 'alien') {
    playAlienAt(freq, when);
  } else if (instrument === 'organish') {
    playOrganishAt(freq, when);
  } else if (instrument === 'droplet') {
    playDropletAt(freq, when);
  } else {
    const buf = buffers[instrument];
    if (buf) playSampleAt(buf, when, freqRatio('C4', noteName)); // base C4
  }
}

