// src/intensity.js — global intensity service (per-toy analysers + smoothed 0–1 values)
// Non-destructive: taps each toy's GainNode via getToyGain(id) and adds an AnalyserNode branch.
import { ensureAudioContext } from './audio-core.js';
import { getToyGain } from './audio-core.js'; // assumed to exist in your build

// Public state
const perToy = new Map(); // id -> { analyser, data, last, smoothed, autoGain?, connected: boolean }
let globalIntensity = 0;
let raf = 0;

// Config
const WINDOW_S = 1.5;
const SMOOTH = 0.7; // 0=raw, 1=very smooth
const REFRESH_HZ = 30;

// Helpers
function clamp01(v){ return Math.max(0, Math.min(1, v)); }

function ensureToyAnalyser(id){
  const key = String(id || 'master').toLowerCase();
  if (!perToy.has(key)){
    const ctx = ensureAudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.5;
    perToy.set(key, { analyser, data: new Uint8Array(analyser.frequencyBinCount), last:0, smoothed:0, connected:false });
  }
  const st = perToy.get(key);
  if (!st.connected){
    try {
      const g = getToyGain(key);
      if (g && typeof g.connect === 'function'){
        g.connect(st.analyser); // branch tap
        st.connected = true;
      }
    } catch(e){ /* silent */ }
  }
  return perToy.get(key);
}

// Estimate instantaneous loudness from frequency bins (simple mean over mid band)
function measure(analyser, data){
  analyser.getByteFrequencyData(data);
  let sum = 0, n = data.length, lo = Math.floor(n*0.05), hi = Math.floor(n*0.7);
  for (let i = lo; i < hi; i++) sum += data[i];
  const avg = sum / Math.max(1, (hi-lo));
  return clamp01(avg / 160); // 160 is a loose empirical scale
}

function tick(){
  const ctx = ensureAudioContext();
  const dt = 1 / REFRESH_HZ;
  let g = 0, count = 0;
  for (const [id, st] of perToy){
    const amt = measure(st.analyser, st.data);
    st.smoothed = st.smoothed * SMOOTH + amt * (1 - SMOOTH);
    g += st.smoothed; count++;
  }
  globalIntensity = clamp01(count ? (g / count) : 0);
  const detail = { perToy: Object.fromEntries([...perToy.entries()].map(([k,v]) => [k, v.smoothed])), global: globalIntensity };
  window.dispatchEvent(new CustomEvent('intensity-update', { detail }));
  raf = window.setTimeout(tick, dt * 1000);
}

// Public API
export function startIntensityMonitor(){
  if (raf) return; // already running
  // Fallback 'master'
  ensureToyAnalyser('master');
  // Seed from any panels we can find
  document.querySelectorAll('.toy-panel[data-toy]').forEach((el, i) => {
    const id = (el.id || el.dataset.toy || ('toy'+i)).toLowerCase();
    ensureToyAnalyser(id);
  });
  // Also learn toy ids from toy-ui events
  window.addEventListener('toy-volume', (e)=>{
    const id = e?.detail?.id; if (id) ensureToyAnalyser(id);
  });
  window.addEventListener('toy-mute', (e)=>{
    const id = e?.detail?.id; if (id) ensureToyAnalyser(id);
  });

  tick();
}

export function stopIntensityMonitor(){
  if (raf){ window.clearTimeout(raf); raf = 0; }
}

export function getIntensity(id){
  if (!id) return globalIntensity;
  const st = perToy.get(String(id).toLowerCase());
  return st ? st.smoothed : 0;
}

// Activity "budget" in [0..1], where 1 means plenty of headroom, 0 means packed.
export function getActivityBudget(){
  // Invert with a gentle curve so busy mixes still leave some room
  const g = getIntensity();
  return clamp01(1 - Math.pow(g, 0.8));
}

export function listToys(){ return [...perToy.keys()]; }
