// src/intensity.js — global intensity service (per-toy analysers + event-based fallback)
import { ensureAudioContext } from './audio-core.js';
import { getToyGain } from './audio-core.js'; // if not present, analyser taps will be inert (event fallback still works)

const perToy = new Map(); // id -> { analyser, data, smoothed, connected, hits: number[] }
let globalIntensity = 0, raf = 0;

// Config
const WINDOW_S = 1.5;
const SMOOTH = 0.7; // 0=raw, 1=very smooth
const REFRESH_HZ = 30;

// Helpers
function clamp01(v){ return Math.max(0, Math.min(1, v)); }

function ensureToyState(id){
  const key = String(id || 'master').toLowerCase();
  if (!perToy.has(key)){
    const ctx = ensureAudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.5;
    perToy.set(key, { analyser, data: new Uint8Array(analyser.frequencyBinCount), smoothed:0, connected:false, hits: [] });
  }
  const st = perToy.get(key);
  if (!st.connected){
    try {
      const g = getToyGain(key);
      if (g && typeof g.connect === 'function'){
        g.connect(st.analyser); // tap as a side-branch (read-only)
        st.connected = true;
      }
    } catch(e){ /* silently ignore if API not available */ }
  }
  return st;
}

// Frequency-domain loudness estimate (mid band)
function measure(analyser, data){
  analyser.getByteFrequencyData(data);
  let sum = 0, n = data.length, lo = Math.floor(n*0.05), hi = Math.floor(n*0.7);
  for (let i = lo; i < hi; i++) sum += data[i];
  const avg = sum / Math.max(1, (hi-lo));
  return clamp01(avg / 160); // empirical scale
}

// Event-based fallback: count toy-hit events in a sliding window
function noteIntensityFor(st, now){
  const WIN_MS = Math.floor(WINDOW_S * 1000);
  st.hits = (st.hits || []).filter(t => now - t <= WIN_MS);
  const rate = st.hits.length / WINDOW_S; // hits per second
  // ~6 hits/sec feels "busy" => intensity ~1
  return clamp01(rate / 6);
}

// Tick
function tick(){
  const dt = 1 / REFRESH_HZ;
  let g = 0, count = 0;
  for (const [id, st] of perToy){
    const now = performance.now();
    const audioAmt = measure(st.analyser, st.data);
    const noteAmt  = noteIntensityFor(st, now);
    const amt = Math.max(audioAmt, noteAmt);
    st.smoothed = st.smoothed * SMOOTH + amt * (1 - SMOOTH);
    g += st.smoothed; count++;
  }
  globalIntensity = clamp01(count ? (g / count) : 0);
  const detail = { perToy: Object.fromEntries([...perToy.entries()].map(([k,v]) => [k, v.smoothed])), global: globalIntensity };
  window.dispatchEvent(new CustomEvent('intensity-update', { detail }));
  raf = window.setTimeout(tick, dt * 1000);
}

// Public
export function startIntensityMonitor(){
  if (raf) return;
  // Seed from known toys
  document.querySelectorAll('.toy-panel[data-toy]').forEach((el, i) => {
    const id = (el.dataset.toy || ('toy'+i)).toLowerCase();
    ensureToyState(id);
  });
  ensureToyState('master');
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

export function listToys(){ return [...perToy.keys()]; }

// Listen for toy-hit events to build event-based intensity
window.addEventListener('toy-hit', (e)=>{
  const id = e?.detail?.id || 'master';
  const st = ensureToyState(id);
  try { st.hits.push(performance.now()); } catch { st.hits = [performance.now()]; }
});
