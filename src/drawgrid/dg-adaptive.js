// src/drawgrid/dg-adaptive.js
import { getAdaptiveFrameBudget } from '../particles/ParticleQuality.js';

// Shared global state across all drawgrid instances (keeps counts for LOD decisions).
const globalDrawgridState = (() => {
  if (typeof window !== 'undefined') {
    window.__DRAWGRID_GLOBAL = window.__DRAWGRID_GLOBAL || { visibleCount: 0 };
    return window.__DRAWGRID_GLOBAL;
  }
  return { visibleCount: 0 };
})();

const DG_ADAPTIVE_SHARED_MIN_MS = 900;
const DG_ADAPTIVE_SHARED_GESTURE_MS = 260;
const DG_ADAPTIVE_FPS_DELTA_MIN = 2;

function __dgIsGesturing() {
  try { return !!window.__GESTURE_ACTIVE; } catch {}
  return false;
}

function getGlobalAdaptiveState() {
  return globalDrawgridState?.__adaptiveShared?.value || null;
}

function __dgAdaptiveTickMs() {
  return __dgIsGesturing() ? DG_ADAPTIVE_SHARED_GESTURE_MS : DG_ADAPTIVE_SHARED_MIN_MS;
}

function updateAdaptiveShared(force = false) {
  const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
  const shared = globalDrawgridState.__adaptiveShared || { ts: 0, value: null };
  const minMs = __dgAdaptiveTickMs();
  if (!force && shared.value && (now - shared.ts) < minMs) {
    return shared.value;
  }
  if (
    shared.value &&
    Number.isFinite(shared.value.smoothedFps) &&
    Number.isFinite(shared.lastFps) &&
    Math.abs(shared.value.smoothedFps - shared.lastFps) < DG_ADAPTIVE_FPS_DELTA_MIN &&
    (now - shared.ts) < (minMs * 2)
  ) {
    shared.ts = now;
    globalDrawgridState.__adaptiveShared = shared;
    return shared.value;
  }
  let value = null;
  try {
    value = getAdaptiveFrameBudget();
  } catch {}
  if (value) {
    shared.value = value;
    if (Number.isFinite(value.smoothedFps)) {
      shared.lastFps = value.smoothedFps;
    }
  }
  shared.ts = now;
  globalDrawgridState.__adaptiveShared = shared;
  return shared.value || value;
}

function startAdaptiveSharedTicker() {
  if (typeof window === 'undefined') return;
  if (globalDrawgridState.__adaptiveTimer) return;
  const tick = () => {
    updateAdaptiveShared(false);
    const delay = __dgAdaptiveTickMs();
    globalDrawgridState.__adaptiveTimer = setTimeout(tick, delay);
  };
  globalDrawgridState.__adaptiveTimer = setTimeout(tick, __dgAdaptiveTickMs());
  updateAdaptiveShared(true);
}


function __dgZoomScale() {
  if (typeof window === 'undefined') return 1;
  const scale = Number.isFinite(window.__boardScale) && window.__boardScale > 0 ? window.__boardScale : null;
  return scale || 1;
}

export {
  __dgIsGesturing,
  getGlobalAdaptiveState,
  __dgAdaptiveTickMs,
  updateAdaptiveShared,
  startAdaptiveSharedTicker,
  __dgZoomScale,
  globalDrawgridState,
};
