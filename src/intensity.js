// src/intensity.js — global intensity service (per-toy analysers + event-based fallback)
// Keep under 300 lines
import { ensureAudioContext, getToyGain } from './audio-core.js';

const perToy = new Map(); // id -> { analyser, buf, smoothed, connected, hits:number[] }
let globalIntensity = 0;
let intervalId = 0;

// Config
const WINDOW_S   = 1.5;   // lookback window for event hits
const SMOOTH     = 0.75;  // 0=raw, 1=very smooth
const REFRESH_HZ = 30;    // UI update rate

function clamp01(v){ return Math.max(0, Math.min(1, v)); }
function nowMs(){ return performance.now(); }

function ensureToyState(id){
  const key = String(id || 'master').toLowerCase();
  if (!perToy.has(key)){
    const ctx = ensureAudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    an.smoothingTimeConstant = 0.5;
    const buf = new Uint8Array(an.fftSize);
    perToy.set(key, { analyser: an, buf, smoothed: 0, connected:false, hits: [] });
  }
  const st = perToy.get(key);
  if (!st.connected){
    try {
      const g = getToyGain(key);
      if (g && typeof g.connect === 'function'){
        g.connect(st.analyser); // tap as a side-branch (read-only)
        st.connected = true;
      }
    } catch {}
  }
  return st;
}

// Audio amplitude -> 0..1
function measureAnalyser(st){
  try{
    st.analyser.getByteTimeDomainData(st.buf);
    // Compute RMS around 128 (silence), normalize
    let sum=0;
    for (let i=0;i<st.buf.length;i++){
      const v = (st.buf[i] - 128) / 128;
      sum += v*v;
    }
    const rms = Math.sqrt(sum / st.buf.length);
    // Map RMS (typ ~0..0.5) into 0..1 with a gentle curve
    return clamp01(Math.pow(rms*2.0, 0.9));
  }catch{ return 0; }
}

// Event-based note-rate -> 0..1
function measureNoteRate(st, tNow){
  const cutoff = tNow - WINDOW_S*1000;
  // prune old hits
  st.hits = st.hits.filter(t => t >= cutoff);
  const rate = st.hits.length / WINDOW_S; // hits per second
  // map 0..(~6/sec) to 0..1
  return clamp01(rate / 6);
}

function tick(){
  let g=0, n=0;
  const tNow = nowMs();
  for (const [id, st] of perToy){
    const a = measureAnalyser(st);
    const r = measureNoteRate(st, tNow);
    const amt = Math.max(a, r);
    st.smoothed = st.smoothed*SMOOTH + amt*(1-SMOOTH);
    g += st.smoothed; n++;
  }
  globalIntensity = clamp01(n ? g/n : 0);
  // broadcast
  try {
    const detail = { global: globalIntensity, perToy: Object.fromEntries([...perToy].map(([k,v])=>[k, v.smoothed])) };
    window.dispatchEvent(new CustomEvent('intensity-update', { detail }));
  } catch {}
}


/* --- Discover toy ids from DOM so analyser taps work even without toy-hit --- */
function seedFromDOM(){
  try{
    const panels = Array.from(document.querySelectorAll('.toy-panel'));
    for (const p of panels){
      const id = (p && p.dataset && (p.dataset.toyid || p.dataset.toy)) ? String(p.dataset.toyid || p.dataset.toy).toLowerCase() : null;
      if (id) ensureToyState(id);
    }
  } catch {}
}
function watchDOM(){
  try {
    const board = document.getElementById('board') || document.querySelector('.board') || document.body;
    const mo = new MutationObserver(()=> seedFromDOM());
    mo.observe(board, { childList:true, subtree:true, attributes:true, attributeFilter:['data-toy','class'] });
  } catch {}
}
export function startIntensityMonitor(){
  if (!intervalId){
    ensureToyState('master');
    seedFromDOM();
    watchDOM();
    intervalId = setInterval(tick, 1000/REFRESH_HZ);
  }
}
export function stopIntensityMonitor(){
  if (intervalId){ clearInterval(intervalId); intervalId=0; }
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
  st.hits.push(nowMs());
});
