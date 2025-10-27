// src/mobile-viewport.js
(function () {
  const root = document.documentElement;
  const body = document.body;

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

    document.documentElement.classList.toggle('portrait', isPortrait);
    document.documentElement.classList.toggle('landscape', !isPortrait);
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

  window.addEventListener('resize', () => {
    applyOrientationClass();
    setTimeout(applyOrientationClass, 120);
  });

  // Expose a helper to lock the page scroll (if your app uses modal/fullscreen)
  window.__AppViewport = {
    lockScroll(on) {
      document.documentElement.classList.toggle('noscroll', !!on);
      document.body.classList.toggle('noscroll', !!on);
    }
  };
})();