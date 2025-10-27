const root = document.documentElement;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const isTouchDevice = () => {
  try {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 1 || navigator.msMaxTouchPoints > 1;
  } catch {
    return false;
  }
};

const isIOS = (() => {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
})();

let pending = null;

// Keep a stable reading window so iOS toolbar animation can't blow up scale
const bootStart = performance.now();
let lastScale = 1;

// If visualViewport jitters > N% in a single frame, treat it as unstable and ignore
const MAX_DELTA_PER_FRAME = 0.18;

// After this window, we consider viewport "stable"
const STABILISE_MS = 700;

function computeScale(width, height) {
  const minDim = Math.max(1, Math.min(width, height));
  let scale = clamp(minDim / 900, 0.65, 1);

  if (isTouchDevice()) {
    if (minDim >= 1080) {
      scale = Math.min(scale, 0.70);
    } else if (minDim >= 960) {
      scale = Math.min(scale, 0.76);
    } else if (minDim >= 820) {
      scale = Math.min(scale, 0.84);
    } else if (minDim >= 720) {
      scale = Math.min(scale, 0.90);
    }
  }

  return clamp(scale, 0.6, 1);
}

function stableViewportDims() {
  // Prefer the layout viewport on iOS during boot; vv jitters when toolbars hide
  const vv = window.visualViewport;

  if (isIOS && performance.now() - bootStart < STABILISE_MS) {
    const w = document.documentElement.clientWidth || window.innerWidth || 0;
    const h = document.documentElement.clientHeight || window.innerHeight || 0;
    return { width: w, height: h };
  }

  const width  = vv?.width  ?? document.documentElement.clientWidth  ?? window.innerWidth  ?? 0;
  const height = vv?.height ?? document.documentElement.clientHeight ?? window.innerHeight ?? 0;
  return { width, height };
}

function measureViewport() {
  const { width, height } = stableViewportDims();
  let next = computeScale(width, height);

  // Ignore wild swings caused by iOS UI collapsing/expanding
  const delta = Math.abs(next - lastScale);
  if (delta > MAX_DELTA_PER_FRAME && performance.now() - bootStart < STABILISE_MS) {
    // keep previous scale during the jitter window
    next = lastScale;
  } else {
    // ease large transitions slightly to avoid perceptual pop
    next = lastScale + clamp(next - lastScale, -MAX_DELTA_PER_FRAME, MAX_DELTA_PER_FRAME);
  }

  lastScale = clamp(next, 0.6, 1);
  root.style.setProperty('--ui-scale', lastScale.toFixed(3));
}

function queueUpdate() {
  if (pending != null) return;
  pending = requestAnimationFrame(() => {
    pending = null;
    measureViewport();
  });
}

// Initial pass
measureViewport();

// Listen, but let things settle on iOS
window.addEventListener('resize', queueUpdate, { passive: true });
window.addEventListener('orientationchange', () => {
  // reset stabilisation window on hard orientation flips
  lastScale = clamp(lastScale, 0.6, 1);
  queueUpdate();
}, { passive: true });

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', queueUpdate, { passive: true });
}
