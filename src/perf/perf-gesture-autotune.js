// src/perf/perf-gesture-autotune.js
// Dynamic gesture throttling: only reduce gesture draw/field work when load is high.

import { getSmoothedFps } from '../particles/ParticleQuality.js';

const AUTO_KEY = 'perf_gesture_auto';

function isEnabled() {
  try {
    const v = localStorage.getItem(AUTO_KEY);
    if (v === null) return true;
    return v !== '0' && v !== 'false';
  } catch {
    return true;
  }
}

function getToyCount() {
  try { return document.querySelectorAll('.toy-panel').length; } catch { return 0; }
}

const state = {
  mode: 'full', // full | field | draw
  lastSet: 0,
};

function applyMode(mode, meta) {
  const st = (window.__PERF_PARTICLES = window.__PERF_PARTICLES || {});
  if (mode === 'draw') {
    st.gestureFieldModulo = 2;
    st.gestureDrawModulo = 2;
  } else if (mode === 'field') {
    st.gestureFieldModulo = 2;
    st.gestureDrawModulo = 1;
  } else {
    st.gestureFieldModulo = 1;
    st.gestureDrawModulo = 1;
  }
  st.__gestureAuto = meta;
  state.mode = mode;
  state.lastSet = performance.now();
}

function sampleFps() {
  const smoothed = getSmoothedFps();
  if (Number.isFinite(smoothed) && smoothed > 0) return smoothed;
  const raw = window.__dgFpsValue;
  return (Number.isFinite(raw) && raw > 0) ? raw : null;
}

function tick() {
  if (!isEnabled()) return;
  if (window.__PERF_GESTURE_AUTO_LOCK) return;
  if (window.__PERF_PARTICLES__TEMP_PATCH) return; // avoid fighting PerfLab A/B tests

  const fps = sampleFps();
  if (!fps) return;

  const toys = getToyCount();
  // Keep full quality for small scenes; avoid throttling based on transient FPS dips.
  if (toys <= 4) {
    if (state.mode !== 'full') applyMode('full', { toys, fps, mode: 'full' });
    return;
  }
  const mode = state.mode;

  let nextMode = mode;
  if (mode === 'full') {
    if (toys >= 12 || (toys >= 8 && fps < 45)) nextMode = 'field';
  } else if (mode === 'field') {
    if (toys >= 18 || (toys >= 12 && fps < 42)) nextMode = 'draw';
    else if (toys <= 8 && fps > 50) nextMode = 'full';
  } else if (mode === 'draw') {
    if (toys <= 8 && fps > 50) nextMode = 'full';
    else if (toys <= 12 && fps > 50) nextMode = 'field';
  }

  if (nextMode !== mode) {
    applyMode(nextMode, { toys, fps, mode: nextMode });
  }
}

// Sample once per second to avoid churn.
setInterval(tick, 1000);
