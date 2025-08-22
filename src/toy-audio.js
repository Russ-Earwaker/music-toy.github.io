// src/toy-audio.js — shared per-toy mute/volume policy (keeps mute while scrubbing)
import { setToyVolume, setToyMuted } from './audio-core.js';

const __toyState = new Map(); // id -> { muted:boolean, volume:number }

function getState(id){
  const key = String(id || 'master').toLowerCase();
  if (!__toyState.has(key)) __toyState.set(key, { muted:false, volume:1.0 });
  return __toyState.get(key);
}

// Listener: update state + drive audio-core; do NOT auto-unmute on volume changes.
try {
  window.addEventListener('toy-mute', function(e){
    const d = (e && e.detail) || {};
    const id = String(d.toyId || 'master').toLowerCase();
    const st = getState(id);
    st.muted = !!d.muted;
    try { setToyMuted(id, st.muted); } catch {}
  });
  window.addEventListener('toy-volume', function(e){
    const d = (e && e.detail) || {};
    const id = String(d.toyId || 'master').toLowerCase();
    const v = Number(d.value);
    const st = getState(id);
    if (!Number.isNaN(v)) st.volume = Math.max(0, Math.min(1, v));
    try { setToyVolume(id, st.volume); } catch {}
  });
} catch {}

// Query helpers
export function isToyMuted(id){ return getState(id).muted === true; }
export function toyVolume(id){ return getState(id).volume; }

// Gate a trigger function so it respects mute policy but keeps scheduling logic unchanged.
export function gateTriggerForToy(toyId, triggerFn){
  const id = String(toyId || 'master').toLowerCase();
  return function(inst, noteName, when){
    if (!isToyMuted(id)) return triggerFn(inst, noteName, when);
    // muted: swallow the trigger (visuals can still respond elsewhere)
  };
}
