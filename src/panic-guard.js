// PANIC GUARD — include this as the FIRST <script> on the page.
// Purpose: prevent auto-boot loops and keep page responsive so you can open DevTools.

// Keep logs minimal
window.BOUNCER_DBG_LEVEL = 1;
// Silence init warnings
window.BOUNCER_NO_INIT_WARN = true;
// Do not autorun any bouncer boot helpers
window.BOUNCER_NO_AUTORUN = true;

// Optional: lightweight safety net to stop repeated boot attempts if some code ignores flags
(function(){
  // Prevent tight loops: make requestAnimationFrame no-op if it's called > 5k times before load
  let rafCount = 0, capped = false;
  const origRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = function(cb){
    if (!capped && ++rafCount > 5000){
      capped = true;
      console.warn('[panic-guard] Excessive RAF detected; temporarily throttling.');
      return setTimeout(()=>cb(performance.now()), 16);
    }
    return origRAF.call(this, cb);
  };
})();
