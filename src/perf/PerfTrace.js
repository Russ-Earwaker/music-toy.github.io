// src/perf/PerfTrace.js
// Lightweight, opt-in tracing for "frame.nonScript" / "unattributed" demons.
// Uses global flags so Perf Lab can capture the state in JSON results.

function getTraceState() {
  // Keep a single global object, like __PERF_PARTICLES.
  // Easy to toggle from DevTools and easy to serialize into perf-lab results.
  const st = (window.__PERF_TRACE = window.__PERF_TRACE || {
    traceCanvasResize: false,
    traceDomInRaf: false,
  });
  return st;
}

const __lastCanvasSizes = new WeakMap();

export function installRafBoundaryFlag() {
  // Idempotent: safe to call multiple times.
  if (window.__mtRafBoundaryInstalled) return;
  window.__mtRafBoundaryInstalled = true;

  const orig = window.requestAnimationFrame?.bind(window);
  if (!orig) return;

  window.requestAnimationFrame = (cb) => {
    // Keep behavior identical; only mark when traceDomInRaf is enabled.
    const wrapped = (ts) => {
      const st = getTraceState();
      if (st.traceDomInRaf) window.__mtInRaf = true;
      try {
        cb(ts);
      } finally {
        if (st.traceDomInRaf) window.__mtInRaf = false;
      }
    };
    return orig(wrapped);
  };
}

export function traceCanvasResize(canvas, label) {
  const st = getTraceState();
  if (!st.traceCanvasResize) return;
  if (!canvas) return;

  const w = canvas.width | 0;
  const h = canvas.height | 0;
  const last = __lastCanvasSizes.get(canvas);

  if (!last || last.w !== w || last.h !== h) {
    console.warn(
      `[perf][canvas-resize] ${label}`,
      last ? `${last.w}x${last.h} -> ${w}x${h}` : `${w}x${h}`
    );
    __lastCanvasSizes.set(canvas, { w, h });
  }
}

export function traceDomWrite(label) {
  const st = getTraceState();
  if (!st.traceDomInRaf) return;
  if (!window.__mtInRaf) return;
  console.warn(`[perf][dom-in-raf] ${label}`);
}
