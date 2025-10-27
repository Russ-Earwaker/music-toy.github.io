// src/mobile-viewport.js
(function () {
  const root = document.documentElement;
  const body = document.body;

  function applyOrientationClass() {
    const isPortrait = window.matchMedia("(orientation: portrait)").matches;
    root.classList.toggle('portrait', isPortrait);
    root.classList.toggle('landscape', !isPortrait);
  }

  // iOS Safari sometimes needs a nudge for dvh after UI chrome changes
  function reflowForIOS() {
    // Force layout by reading/writing; cheap & safe
    body.style.transform = 'translateZ(0)';
    void body.offsetHeight;
    body.style.transform = '';
  }

  // Run at start and on change
  applyOrientationClass();
  window.addEventListener('orientationchange', () => {
    applyOrientationClass();
    // Give iOS time to settle the address bar
    setTimeout(() => {
      applyOrientationClass();
      reflowForIOS();
    }, 250);
  });

  // Also react to resize (Android toolbars, desktop window resize)
  window.addEventListener('resize', () => {
    applyOrientationClass();
  });

  // Expose a helper to lock the page scroll (if your app uses modal/fullscreen)
  window.__AppViewport = {
    lockScroll(on) {
      document.documentElement.classList.toggle('noscroll', !!on);
      document.body.classList.toggle('noscroll', !!on);
    }
  };
})();