// AutoQualityController.js
// Centralised quality signal for particles and other scalable visuals.
// - FPS-based with hysteresis (prevents oscillation)
// - Memory pressure acts as a hard clamp
// - Emergency mode (very low FPS) forces aggressive reduction immediately

import { getMemoryPressureLevel } from '../baseMusicToy/index.js';

const AUTO_QUALITY_ENABLED = true;

// Rolling window config
const SAMPLE_WINDOW_MS = 2500;
const MIN_SAMPLES = 20;

// Thresholds (frame time in ms)
const DOWN_P95_MS = 22.0;     // ~45fps
const UP_P95_MS = 19.5;       // ~51fps (allow recovery in stable 60fps scenes)
const EMERGENCY_P95_MS = 40.0;// ~25fps

// Hysteresis timings
const DOWN_HOLD_MS = 900;
const UP_HOLD_MS = 1200;
const EMERGENCY_HOLD_MS = 250;

// Rate of change
const STEP_DOWN = 0.08;
const STEP_UP = 0.06;

// Clamp range
const MIN_SCALE = 0.25;
const MAX_SCALE = 1.0;

function readForcedQualityScale() {
  // Accept either the newer Quality Lab container or the legacy global.
  // - window.__QUALITY_LAB.forceScale: null | number
  // - window.__QUALITY_FORCE_SCALE: null | number
  const lab = window.__QUALITY_LAB;
  const v =
    (lab && typeof lab.forceScale === 'number') ? lab.forceScale :
    (typeof window.__QUALITY_FORCE_SCALE === 'number') ? window.__QUALITY_FORCE_SCALE :
    null;
  if (typeof v !== 'number' || !isFinite(v)) return null;
  return v;
}

let _samples = []; // {t, dt}
let _lastT = 0;

let _scale = 1.0;
let _downBadSince = 0;
let _upGoodSince = 0;
let _emergencySince = 0;

let _debugLast = 0;
let _lastP95 = null;
let _lastMemLevel = 0;
let _lastForced = null;
let _lastForcedValue = null;

function nowMs() {
  return (performance?.now?.() ?? Date.now());
}

function pruneSamples(tNow) {
  const tMin = tNow - SAMPLE_WINDOW_MS;
  while (_samples.length && _samples[0].t < tMin) _samples.shift();
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  const idx = Math.min(a.length - 1, Math.max(0, Math.floor((a.length - 1) * p)));
  return a[idx];
}

export function autoQualityOnFrame() {
  if (!AUTO_QUALITY_ENABLED) return;
  const t = nowMs();
  if (_lastT) {
    const dt = Math.max(0, Math.min(200, t - _lastT));
    _samples.push({ t, dt });
    pruneSamples(t);
  }
  _lastT = t;

  // --- Quality Lab override -----------------------------------------------
  // When forced, we still collect dt samples so the controller can resume
  // smoothly when the override is cleared, but we do NOT modify internal _scale.
  const forced = readForcedQualityScale();
  if (typeof forced === 'number') {
    const effective = Math.max(MIN_SCALE, Math.min(MAX_SCALE, forced));
    window.__AUTO_QUALITY_EFFECTIVE = effective;
    _lastForced = true;
    _lastForcedValue = effective;
    window.__AUTO_QUALITY_DEBUG = {
      enabled: AUTO_QUALITY_ENABLED,
      forced: true,
      forcedValue: effective,
      p95: _lastP95,
      memLevel: _lastMemLevel,
      samples: _samples.length,
      scale: effective,
    };
    return;
  }
  _lastForced = false;
  _lastForcedValue = null;

  if (_samples.length < MIN_SAMPLES) return;

  const dts = _samples.map(s => s.dt);
  const p95 = percentile(dts, 0.95);
  _lastP95 = p95;

  // Track quality conditions with hysteresis
  if (p95 >= EMERGENCY_P95_MS) {
    if (!_emergencySince) _emergencySince = t;
  } else {
    _emergencySince = 0;
  }

  if (p95 >= DOWN_P95_MS) {
    if (!_downBadSince) _downBadSince = t;
    _upGoodSince = 0;
  } else if (p95 <= UP_P95_MS) {
    if (!_upGoodSince) _upGoodSince = t;
    _downBadSince = 0;
  } else {
    // In the deadband; decay timers so we don't accidentally fire transitions
    _downBadSince = 0;
    _upGoodSince = 0;
  }

  const memLevel = getMemoryPressureLevel?.() ?? 0; // 0 ok, 1 warn, 2 critical
  _lastMemLevel = memLevel;

  // Emergency mode: clamp fast and hard
  if (_emergencySince && (t - _emergencySince) >= EMERGENCY_HOLD_MS) {
    _scale = Math.max(MIN_SCALE, _scale - (STEP_DOWN * 2.5));
  } else if (_downBadSince && (t - _downBadSince) >= DOWN_HOLD_MS) {
    _scale = Math.max(MIN_SCALE, _scale - STEP_DOWN);
    _downBadSince = t; // step again after hold window
  } else if (_upGoodSince && (t - _upGoodSince) >= UP_HOLD_MS) {
    _scale = Math.min(MAX_SCALE, _scale + STEP_UP);
    _upGoodSince = t;
  }

  // Memory pressure clamp (hard safety)
  let memClamp = 1.0;
  // Apply memory pressure clamp only when performance actually needs it.
  if (memLevel >= 1 && p95 > UP_P95_MS) {
    if (memLevel >= 2) memClamp = 0.5;
    else memClamp = 0.75;
  }

  // Apply clamp (but keep internal scale so we can recover smoothly)
  const effective = Math.max(MIN_SCALE, Math.min(MAX_SCALE, _scale * memClamp));

  // Optional debug
  if (window.__SHOW_QUALITY) {
    if (!_debugLast || (t - _debugLast) > 500) {
      _debugLast = t;
      console.log('[quality]', { p95: Math.round(p95 * 10) / 10, memLevel, scale: Math.round(effective * 100) / 100 });
    }
  }

  window.__AUTO_QUALITY_EFFECTIVE = effective;
  window.__AUTO_QUALITY_DEBUG = {
    enabled: AUTO_QUALITY_ENABLED,
    forced: false,
    forcedValue: null,
    p95,
    memLevel,
    memClamp,
    samples: _samples.length,
    scale: effective,
  };
}

export function getAutoQualityScale() {
  // Default full quality until we have enough samples to justify changes.
  const v = window.__AUTO_QUALITY_EFFECTIVE;
  if (typeof v === 'number' && isFinite(v)) return v;
  return 1.0;
}
