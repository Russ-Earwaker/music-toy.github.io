// src/toy-hit-relay.js — runtime hook that emits 'toy-hit' whenever triggerInstrument plays
// Works even if toys don't use gateTriggerForToy. Safe, dev-friendly.

let lastToyId = 'master';

// Track which toy panel the user last interacted with (best-effort attribution)
document.addEventListener('pointerdown', (e)=>{
  const p = e.target && e.target.closest && e.target.closest('.toy-panel');
  if (p && p.dataset && p.dataset.toy){
    lastToyId = String(p.dataset.toy).toLowerCase();
  }
}, true);

// Also watch focus change (keyboard users)
document.addEventListener('focusin', (e)=>{
  const p = e.target && e.target.closest && e.target.closest('.toy-panel');
  if (p && p.dataset && p.dataset.toy){
    lastToyId = String(p.dataset.toy).toLowerCase();
  }
}, true);

// Wrap a function while preserving arity/name for debuggers
function wrapTrigger(fn){
  if (typeof fn !== 'function') return fn;
  if (fn.__wrapped) return fn;
  function wrapped(inst, noteName, when){
    try {
      const id = (lastToyId || String(inst || 'master')).toLowerCase();
      window.dispatchEvent(new CustomEvent('toy-hit', { detail: { id, note: noteName, when } }));
    } catch {}
    return fn.apply(this, arguments);
  }
  try { Object.defineProperty(wrapped, 'name', { value: 'triggerInstrument_wrapped' }); } catch {}
  wrapped.__wrapped = true;
  return wrapped;
}

// Try to hook global triggerInstrument on load; retry if not yet defined.
function tryHook(){
  const g = window;
  // Common places to find the function
  const candidates = [
    g.triggerInstrument,
    g.APP && g.APP.triggerInstrument,
  ].filter(Boolean);

  if (candidates.length){
    // Hook window.triggerInstrument in place (most callers use this global)
    if (typeof g.triggerInstrument === 'function'){
      g.triggerInstrument = wrapTrigger(g.triggerInstrument);
    }
    // Optionally hook APP namespace too
    if (g.APP && typeof g.APP.triggerInstrument === 'function'){
      g.APP.triggerInstrument = wrapTrigger(g.APP.triggerInstrument);
    }
    return true;
  }
  return false;
}

let retries = 0, maxRetries = 50;
function boot(){
  if (tryHook()) return;
  const t = setInterval(()=>{
    if (tryHook() || ++retries >= maxRetries) clearInterval(t);
  }, 200);
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot);
else boot();


// Generic audio hook: fire toy-hit when any BufferSource/Oscillator starts (best-effort)
(function(){
  const g = window;
  const AC = g.AudioContext || g.webkitAudioContext;
  if (!AC) return;
  const ACp = AC.prototype;

  const origCreateBuf = ACp.createBufferSource;
  ACp.createBufferSource = function(){
    const node = origCreateBuf.apply(this, arguments);
    if (node && typeof node.start === 'function' && !node.start.__patched){
      const origStart = node.start;
      node.start = function(){
        try {
          const id = (window.__lastToyId || 'master');
          window.dispatchEvent(new CustomEvent('toy-hit', { detail: { id, note: '(buf)', when: arguments[0] } }));
        } catch {}
        return origStart.apply(this, arguments);
      };
      try { node.start.__patched = true; } catch {}
    }
    return node;
  };

  const origCreateOsc = ACp.createOscillator;
  if (origCreateOsc){
    ACp.createOscillator = function(){
      const node = origCreateOsc.apply(this, arguments);
      if (node && typeof node.start === 'function' && !node.start.__patched){
        const origStart = node.start;
        node.start = function(){
          try {
            const id = (window.__lastToyId || 'master');
            window.dispatchEvent(new CustomEvent('toy-hit', { detail: { id, note: '(osc)', when: arguments[0] } }));
          } catch {}
          return origStart.apply(this, arguments);
        };
        try { node.start.__patched = true; } catch {}
      }
      return node;
    };
  }
})();
