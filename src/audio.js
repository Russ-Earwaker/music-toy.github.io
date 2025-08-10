// src/audio.js (consolidated: CSV loader + legacy tones)
export const DEFAULT_BPM = 120;
export const NUM_STEPS = 8;
export const BEATS_PER_BAR = 4;

export let ac;
export let bpm = DEFAULT_BPM;

// ---------- Time helpers ----------
export function setBpm(v){ bpm = v; }
export function beatSeconds(){ return 60 / bpm; }
export function barSeconds(){ return beatSeconds() * BEATS_PER_BAR; }
export function stepSeconds(){ return barSeconds() / NUM_STEPS; }

// ---------- AudioContext ----------
export function ensureAudioContext(){
  const C = window.AudioContext || window.webkitAudioContext;
  if (!ac) ac = new C({ latencyHint: 'interactive' });
  return ac;
}

// ---------- Note helpers ----------
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export function noteToFreq(note='C4'){
  const m = /^([A-G]#?)(-?\d)$/.exec(String(note).trim());
  if (!m){ return 440; }
  const [_, n, o] = m;
  const idx = NOTE_NAMES.indexOf(n);
  const midi = (Number(o) + 1) * 12 + idx;
  return 440 * Math.pow(2, (midi - 69)/12);
}
export function freqRatio(fromNote='C4', toNote='C4'){
  const f1 = noteToFreq(fromNote);
  const f2 = noteToFreq(toNote);
  return f2 / f1;
}

// ---------- CSV-backed instruments ----------
const FALLBACK_SAMPLES = [
  { name: 'RP4 Kick',      url: './assets/samples/RP4_KICK_1.mp3' },
  { name: 'Break Snare',   url: './assets/samples/Brk_Snr.mp3' },
  { name: 'Hi-Hat Closed', url: './assets/samples/Cev_H2.mp3' },
  { name: 'Clap Heater',   url: './assets/samples/Heater-6.mp3' },
];

let entries = new Map(); // name -> { url? , synth? }
let buffers = new Map(); // name -> AudioBuffer
let csvOk = false;

function dispatchReady(src){
  const names = getInstrumentNames();
  window.dispatchEvent(new CustomEvent('samples-ready', { detail: { ok: csvOk, names, src } }));
}

function dirname(url){
  const i = url.lastIndexOf('/');
  return i === -1 ? '' : url.slice(0, i);
}

function parseCsvSmart(text, csvUrl){
  const lines = text.trim().split(/[\r\n]+/).filter(Boolean);
  if (!lines.length) throw new Error('CSV empty');
  const headRaw = lines[0];
  const head = headRaw.split(',').map(s => s.trim().toLowerCase());

  // Schema A: name,url
  if (head.includes('name') && head.includes('url')){
    const rest = lines.slice(1);
    const out = [];
    for (const line of rest){
      if (!line || line.startsWith('#')) continue;
      const parts = line.split(',');
      const name = (parts.shift() || '').trim();
      const url  = parts.join(',').trim();
      if (name && url) out.push({ name, url });
    }
    if (!out.length) throw new Error('CSV had no valid rows (name,url)');
    return out;
  }

  // Schema B: filename,*,*,*,display_name,synth_id
  const fnIdx = head.indexOf('filename');
  const dnIdx = head.indexOf('display_name');
  const siIdx = head.indexOf('synth_id');
  if (fnIdx !== -1 && dnIdx !== -1){
    const base = dirname(csvUrl);
    const rest = lines.slice(1);
    const out = [];
    for (const line of rest){
      if (!line || line.startsWith('#')) continue;
      const cols = line.split(',');
      const filename = (cols[fnIdx] || '').trim();
      const display  = (cols[dnIdx] || '').trim() || filename;
      const synth    = siIdx !== -1 ? (cols[siIdx] || '').trim() : '';
      if (synth && !filename){
        out.push({ name: display, synth });
      } else if (filename){
        const url = (base ? (base + '/') : './') + filename;
        out.push({ name: display || filename, url });
      }
    }
    if (!out.length) throw new Error('CSV had no valid rows (filename/display_name/synth_id)');
    return out;
  }

  throw new Error('Unrecognized CSV headers');
}

async function fetchCsvList(csvUrl){
  const res = await fetch(csvUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
  const text = await res.text();
  return parseCsvSmart(text, csvUrl);
}
async function loadSample(url){
  const res = await fetch(url);
  const ab = await res.arrayBuffer();
  return new Promise((ok, err)=> ensureAudioContext().decodeAudioData(ab, ok, err));
}
async function loadFromList(list){
  buffers.clear();
  entries.clear();
  for (const it of list){
    entries.set(it.name, { url: it.url, synth: it.synth });
    if (it.url){
      try{
        const b = await loadSample(it.url);
        buffers.set(it.name, b);
      }catch(e){
        console.warn('[audio] decode failed', it, e);
      }
    }
  }
}

async function tryCsvPaths(paths){
  for (const p of paths){
    try{
      const list = await fetchCsvList(p);
      await loadFromList(list);
      if (entries.size > 0){
        csvOk = true;
        dispatchReady(p);
        return true;
      }
    }catch(e){
      console.warn('[audio] CSV try failed', p, e.message || e);
    }
  }
  return false;
}

export async function initAudioAssets(csvUrl){
  ensureAudioContext();
  csvOk = false;
  entries.clear();
  buffers.clear();

  const candidates = csvUrl
    ? [csvUrl]
    : ['./instruments.csv','./samples.csv','./samples/samples.csv','./assets/samples/samples.csv'];

  const ok = await tryCsvPaths(candidates);
  if (!ok){
    await loadFromList(FALLBACK_SAMPLES).catch(()=>{});
    csvOk = false;
    dispatchReady('fallback');
  }
}

export function getInstrumentNames(){
  return ['tone', ...entries.keys()];
}

// ---------- Legacy tone engine ----------
function envGain(acx, startTime, points){
  const g = acx.createGain();
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

// Simple sine "tone" used elsewhere
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

// ---------- Scheduler ----------
let currentStep = 0;
let nextNoteTime = 0;
let loopStartTime = 0;
const scheduleAheadTime = 0.12;
const lookahead = 25; // ms

export function createScheduler(scheduleCallback, onLoop){
  let timer = null;

  function tick(){
    while (nextNoteTime < ensureAudioContext().currentTime + scheduleAheadTime){
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

      // iOS unlock blip
      const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(ctx.destination);
      const o = ctx.createOscillator(); o.connect(g);
      const t = ctx.currentTime + 0.01; o.start(t); o.stop(t+0.02);

      nextNoteTime = loopStartTime = ctx.currentTime + 0.05;
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

export function getLoopInfo(){ return { loopStartTime, barLen: barSeconds() }; }

// ---------- Dispatcher ----------
function playSampleAt(name, when, rate=1){
  const ctx = ensureAudioContext();
  const buf = buffers.get(name);
  if (!buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  src.connect(ctx.destination);
  src.start(when);
}

export function triggerInstrument(instrument, noteName, when){
  const freq = noteToFreq(noteName);
  if (instrument === 'tone'){ playToneAt(freq, when); return; }

  // Lookup CSV entry (if any)
  const e = entries.get(instrument);
  const id = (e && e.synth) ? e.synth.toLowerCase() : (instrument||'').toLowerCase();

  // Map to legacy tone functions (by synth_id or display_name)
  if (id.includes('keypad') || id.includes('chime')) { playKeypadAt(freq, when); return; }
  if (id.includes('pop')   || id.includes('pluck')) { playPopAt(freq, when); return; }
  if (id.includes('pad')) { playPadAt(freq, when); return; }
  if (id.includes('retro-square')) { playRetroAt(freq, when, 'square'); return; }
  if (id.includes('retro-saw'))    { playRetroAt(freq, when, 'sawtooth'); return; }
  if (id.includes('retro-tri') || id.includes('retro-triangle')) { playRetroAt(freq, when, 'triangle'); return; }
  if (id.includes('laser')) { playLaserAt(freq, when); return; }
  if (id.includes('wind') || id.includes('windy')) { playWindyAt(freq, when); return; }
  if (id.includes('alien')) { playAlienAt(freq, when); return; }
  if (id.includes('organ')) { playOrganishAt(freq, when); return; }
  if (id.includes('drop'))  { playDropletAt(freq, when); return; }

  // Sample-based?
  if (buffers.has(instrument)){ playSampleAt(instrument, when, freqRatio('C4', noteName)); return; }

  // Fallback
  playToneAt(freq, when);
}
