// src/toy-hit-relay.js — maintain last toy focus + safe fallback (under 300 lines)

// Track last focused panel so other modules can attribute events if needed.
window.__lastToyId = 'master';

function panelFromEventTarget(t){
  try { return t && t.closest && t.closest('.toy-panel'); } catch { return null; }
}

document.addEventListener('pointerdown', (e)=>{
  const p = panelFromEventTarget(e.target);
  if (p && p.dataset && p.dataset.toy){
    window.__lastToyId = String(p.dataset.toy).toLowerCase();
  }
}, true);

document.addEventListener('focusin', (e)=>{
  const p = panelFromEventTarget(e.target);
  if (p && p.dataset && p.dataset.toy){
    window.__lastToyId = String(p.dataset.toy).toLowerCase();
  }
}, true);

// NOTE: gateTriggerForToy in toy-audio.js already dispatches 'toy-hit' events.
// We deliberately avoid double-dispatching here to keep signals clean.
