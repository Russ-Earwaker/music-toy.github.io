// src/toy-audio.js — shared per-toy mute/volume policy (<=300 lines)
import { setToyVolume, setToyMuted } from './audio-core.js';

/** In-memory mirror so UI can query without hitting AudioParams */
const __toyState = new Map(); // id -> { muted:boolean, volume:number }

function keyOf(id){ return String(id || 'master').toLowerCase(); }
function getState(id){
  const k = keyOf(id);
  if (!__toyState.has(k)) __toyState.set(k, { muted:false, volume:1.0 });
  return __toyState.get(k);
}

// Listen for UI events from toyui.js and drive audio-core
try {
  window.addEventListener('toy-mute', (e)=>{
    const d = (e && e.detail) || {};
    const id = keyOf(d.toyId);
    const st = getState(id);
    st.muted = !!d.muted;
    try { setToyMuted(id, st.muted); } catch {}
  });
} catch {}

try {
  window.addEventListener('toy-volume', (e)=>{
    const d = (e && e.detail) || {};
    const id = keyOf(d.toyId);
    const v = Number(d.value);
    if (!Number.isNaN(v)){
      const st = getState(id);
      st.volume = Math.max(0, Math.min(1, v));
      try { setToyVolume(id, st.volume); } catch {}
    }
  });
} catch {}

export function isToyMuted(id){ return getState(id).muted === true; }
export function toyVolume(id){ return getState(id).volume; }

/**
 * Gate a trigger function so it respects mute policy and publishes toy-hit,
 * while preserving the original trigger signature. Crucially, it forwards
 * the captured toyId to the trigger function as the 4th argument so routing
 * uses the correct per-toy bus (not 'master').
 */
export function gateTriggerForToy(toyId, triggerFn){
  const id = keyOf(toyId);
  return function(inst, noteName, when){
    if (isToyMuted(id)) return;                // swallow when muted
    try { window.dispatchEvent(new CustomEvent('toy-hit', { detail: { id, note: noteName, when } })); } catch {}
    try { return triggerFn(inst, noteName, when, id); } catch (err) { /* noop */ }
  };
}