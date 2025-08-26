// src/scale-lock-register.js
// Deterministic scale-lock: marks known visual canvases so board zoom doesn't change their on-screen size.
// Safe (read-only) and idempotent. < 200 lines.
(function(){
  function lockAll(){
    const q = (sel)=> Array.from(document.querySelectorAll(sel));
    const lock = (el)=> { if (el && !el.hasAttribute('data-lock-scale')) el.setAttribute('data-lock-scale',''); };
    // Known visuals by class
    q('.wheel-canvas,.rippler-canvas,.grid-canvas').forEach(lock);
    // Bouncer: first canvas within the toy body
    document.querySelectorAll('[data-toy="bouncer"]').forEach(panel=>{
      const body = panel.querySelector('.toy-body') || panel;
      const c = body.querySelector('canvas');
      if (c) lock(c);
    });
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', lockAll);
  } else {
    lockAll();
  }
})();