// src/toy-audio.js — shared per-toy mute/volume policy (<=300 lines)
import { ensureAudioContext, setToyVolume, setToyMuted } from './audio-core.js';
import { syncVolumeUI } from './volume-ui.js';

/** In-memory mirror so UI can query without hitting AudioParams */
const __toyState = new Map(); // id -> { muted:boolean, volume:number }

function keyOf(id){ return String(id || 'master').toLowerCase(); }
function getState(id){
  const k = keyOf(id);
  if (!__toyState.has(k)) __toyState.set(k, { muted:false, volume:1.0 });
  return __toyState.get(k);
}

function clamp01(v){ return Math.max(0, Math.min(1, Number(v))); }

function getPanelToyId(panel){
  return panel?.dataset?.toyid || panel?.id || panel?.dataset?.toy || '';
}

function findToyPanel(id){
  if (!id || typeof document === 'undefined') return null;
  const byId = document.getElementById(id);
  if (byId) return byId;
  return document.querySelector(`.toy-panel[data-toyid="${id}"], .toy-panel[data-toy="${id}"]`);
}

function isChainHead(panel){
  if (!panel) return false;
  const hasParent = !!(panel.dataset?.chainParent || panel.dataset?.prevToyId);
  return !hasParent;
}

function collectChainDescendants(rootId){
  const descendants = [];
  if (!rootId || typeof document === 'undefined') return descendants;
  const panels = Array.from(document.querySelectorAll('.toy-panel'));
  const visited = new Set();
  const queue = [String(rootId)];
  visited.add(String(rootId));

  while (queue.length) {
    const currentId = queue.shift();
    for (const panel of panels) {
      const parentId = panel?.dataset?.chainParent || panel?.dataset?.prevToyId;
      if (!parentId || String(parentId) !== String(currentId)) continue;
      const childId = getPanelToyId(panel);
      if (!childId) continue;
      if (visited.has(String(childId))) continue;
      visited.add(String(childId));
      descendants.push({ id: String(childId), panel });
      queue.push(String(childId));
    }
  }

  return descendants;
}

function applyChainVolumeMute(rootId, { volume, muted } = {}){
  const hasVolume = Number.isFinite(volume);
  const hasMuted = typeof muted === 'boolean';
  if (!hasVolume && !hasMuted) return;
  const targets = collectChainDescendants(rootId);
  for (const { id, panel } of targets) {
    const st = getState(id);
    if (hasVolume) {
      st.volume = clamp01(volume);
      try { setToyVolume(id, st.volume); } catch {}
      try { panel.dataset.toyVolume = String(st.volume); } catch {}
    }
    if (hasMuted) {
      st.muted = !!muted;
      try { setToyMuted(id, st.muted); } catch {}
      try { panel.dataset.toyMuted = st.muted ? '1' : '0'; } catch {}
    }
    try { syncVolumeUI(panel, { volume: hasVolume ? st.volume : undefined, muted: hasMuted ? st.muted : undefined }); } catch {}
  }
}

// Listen for UI events from toyui.js and drive audio-core
try {
  window.addEventListener('toy-mute', (e)=>{
    const d = (e && e.detail) || {};
    const rawId = String(d.toyId || '');
    const id = keyOf(rawId);
    const st = getState(id);
    st.muted = !!d.muted;
    try { setToyMuted(id, st.muted); } catch {}
    const panel = findToyPanel(rawId) || findToyPanel(id);
    if (panel && isChainHead(panel) && id !== 'master') {
      applyChainVolumeMute(getPanelToyId(panel), { muted: st.muted });
    }
  });
} catch {}

try {
  window.addEventListener('toy-volume', (e)=>{
    const d = (e && e.detail) || {};
    const rawId = String(d.toyId || '');
    const id = keyOf(rawId);
    const v = Number(d.value);
    if (!Number.isNaN(v)){
      const st = getState(id);
      st.volume = clamp01(v);
      try { setToyVolume(id, st.volume); } catch {}
      const panel = findToyPanel(rawId) || findToyPanel(id);
      if (panel && isChainHead(panel) && id !== 'master') {
        applyChainVolumeMute(getPanelToyId(panel), { volume: st.volume });
      }
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
    const muted = isToyMuted(id);
    if (muted) {
      let shouldAllow = false;
      if (Number.isFinite(when)) {
        try {
          const ctx = ensureAudioContext();
          const now = ctx?.currentTime ?? 0;
          if (when > (now + 0.001)) shouldAllow = true;
        } catch {}
      }
      if (!shouldAllow) return; // swallow immediate hits when muted
    } else {
      try { window.dispatchEvent(new CustomEvent('toy-hit', { detail: { id, note: noteName, when } })); } catch {}
    }
    try { return triggerFn(inst, noteName, when, id); } catch (err) { /* noop */ }
  };
}
