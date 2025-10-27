// src/mobile-viewport.js
(function () {
  const root = document.documentElement;
  const body = document.body;
  const bootStart = performance.now();
  const STABILISE_MS = 700;

  function applyOrientationClass() {
    const mqPortrait = window.matchMedia("(orientation: portrait)");
    // VisualViewport is more honest on iOS; fall back to inner sizes
    const vv = window.visualViewport;
    const vw = Math.round((vv?.width || window.innerWidth));
    const vh = Math.round((vv?.height || window.innerHeight));

    // Heuristic to avoid false portrait when toolbars are animating:
    // treat as portrait only if height is meaningfully larger than width
    const heuristicPortrait = vh > vw + 80;

    const isPortrait = mqPortrait.matches && heuristicPortrait;
    const alreadyTagged = root.classList.contains('portrait') || root.classList.contains('landscape');

    // During early iOS toolbar animation, freeze the first detected orientation
    if (performance.now() - bootStart < STABILISE_MS) {
      if (!alreadyTagged) {
        root.classList.toggle('portrait', isPortrait);
        root.classList.toggle('landscape', !isPortrait);
      }
      return;
    }

    root.classList.toggle('portrait', isPortrait);
    root.classList.toggle('landscape', !isPortrait);
  }

  // Run at start and on change
  applyOrientationClass();
  window.addEventListener('orientationchange', () => {
    applyOrientationClass();
    setTimeout(() => {
      applyOrientationClass();
      // small iOS reflow
      document.body.style.transform = 'translateZ(0)';
      void document.body.offsetHeight;
      document.body.style.transform = '';
    }, 300);
  });

  let ovpTimer = 0;
  function queueOvp() {
    if (ovpTimer) cancelAnimationFrame(ovpTimer);
    ovpTimer = requestAnimationFrame(() => {
      applyOrientationClass();
      setTimeout(applyOrientationClass, 120);
    });
  }
  window.addEventListener('resize', queueOvp, { passive: true });

  // Expose a helper to lock the page scroll (if your app uses modal/fullscreen)
  window.__AppViewport = {
    lockScroll(on) {
      document.documentElement.classList.toggle('noscroll', !!on);
      document.body.classList.toggle('noscroll', !!on);
    }
  };
})();
