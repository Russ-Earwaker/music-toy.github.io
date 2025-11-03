// Generic viewport guard for particle-driven overlays.
// - Provides normalized-to-pixel mapping helpers.
// - Snaps immediately on size changes to avoid lerped camera transitions.
// - Listens to overview transitions to toggle non-reactive mode.
//   Non-reactive should only suppress size/home resets; physics continues ticking.
export function createParticleViewport(getSize) {
  let w = 1;
  let h = 1;
  let nonReactive = false;
  let manualOverride = null;

  function refreshSize({ snap = false } = {}) {
    const s = typeof getSize === 'function' ? getSize() : null;
    if (!s) return;
    if (snap) {
      w = Number.isFinite(s?.w) && s.w > 0 ? s.w : 1;
      h = Number.isFinite(s?.h) && s.h > 0 ? s.h : 1;
      return;
    }
    // Default to snap behaviour; avoid lerping when camera/overview jumps.
    w = Number.isFinite(s?.w) && s.w > 0 ? s.w : 1;
    h = Number.isFinite(s?.h) && s.h > 0 ? s.h : 1;
  }

  const map = {
    n2x(n) {
      return (Number.isFinite(n) ? n : 0) * w;
    },
    n2y(n) {
      return (Number.isFinite(n) ? n : 0) * h;
    },
    scale() {
      return Math.min(w, h);
    },
    size() {
      return { w, h };
    }
  };

  function setNonReactive(on) {
    if (on === null || typeof on === 'undefined') {
      manualOverride = null;
    } else {
      manualOverride = !!on;
      nonReactive = manualOverride;
    }
  }
  function isNonReactive() {
    return nonReactive;
  }

  function onOverview(e) {
    if (manualOverride === null) {
      nonReactive = !!e?.detail?.active;
    }
    refreshSize({ snap: true });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('overview:transition', onOverview);
  }

  refreshSize({ snap: true });

  function allowImmediateDraw() { /* hint for callers; no-op */ }
  function cancelHoldNextFrame() { /* inverse of any hold; no-op */ }

  return { map, refreshSize, setNonReactive, isNonReactive, allowImmediateDraw, cancelHoldNextFrame };
}
