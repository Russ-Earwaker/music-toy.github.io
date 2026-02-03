// src/particles/field-generic.js
// Generic background particle field derived from DrawGrid's particle backdrop.
// Keeps viewport behaviour in sync with DrawGrid by reusing the same particle
// viewport helper and honoring board zoom / overview state.
//
// API:
//   const field = createField({ canvas, viewport, pausedRef }, opts)
//   field.tick(dtSeconds)
//   field.pulse(intensity)
//   field.resize()
//   field.destroy()

import { createParticleViewport } from './particle-viewport.js';
import {
  BASE_AREA,
  BASE_COUNT,
  BASE_RADIUS_PX,
  GRID_RELAX,
  MAX_COUNT,
  MIN_COUNT,
  RNG_SEED_PER_TOY,
  computeParticleLayout,
  particleRadiusPx,
  screenRadiusToWorld,
  seededRandomFactory,
} from './particle-density.js';
import { getParticleCap } from './ParticleQuality.js';
import { makeDebugLogger } from '../debug-flags.js';

const fieldLog = makeDebugLogger('mt_debug_logs', 'log');

// Backing-store DPR cap (area + max-side), with hysteresis to avoid thrash.
// Mirrors DrawGrid's strategy so particle fields don't explode pixel cost on high-DPR screens.
function capDprForBackingStore(cssW = 0, cssH = 0, desiredDpr = 1, prevDpr = null, opts = null) {
  const w = Number.isFinite(cssW) ? cssW : 0;
  const h = Number.isFinite(cssH) ? cssH : 0;
  let dpr = Number.isFinite(desiredDpr) ? desiredDpr : 1;
  const minDpr = (() => {
    try {
      const vField = (typeof window !== 'undefined') ? Number(window.__FIELD_MIN_DPR) : NaN;
      if (Number.isFinite(vField) && vField > 0) return vField;
    } catch {}
    try {
      const vDg = (typeof window !== 'undefined') ? Number(window.__DG_MIN_PANEL_DPR) : NaN;
      if (Number.isFinite(vDg) && vDg > 0) return vDg;
    } catch {}
    return 0.6;
  })();
  if (w <= 0 || h <= 0) return Math.max(minDpr, dpr);

  // Pixel budget cap (area-based).
  let maxPx = Number.isFinite(opts?.maxBackingPx) ? opts.maxBackingPx : 3_000_000;
  try {
    const v = (typeof window !== 'undefined') ? Number(window.__FIELD_MAX_BACKING_PX) : NaN;
    if (Number.isFinite(v) && v > 200_000) maxPx = v;
  } catch {}
  try {
    const v = (typeof window !== 'undefined') ? Number(window.__DG_MAX_PANEL_BACKING_PX) : NaN;
    if (Number.isFinite(v) && v > 200_000) maxPx = v;
  } catch {}
  const capFromPx = Math.sqrt(maxPx / (w * h));

  // Side cap (dimension-based) to avoid huge single-axis backing stores.
  let maxSide = Number.isFinite(opts?.maxBackingSidePx) ? opts.maxBackingSidePx : 3200;
  try {
    const v = (typeof window !== 'undefined') ? Number(window.__FIELD_MAX_SIDE_PX) : NaN;
    if (Number.isFinite(v) && v > 600) maxSide = v;
  } catch {}
  try {
    const v = (typeof window !== 'undefined') ? Number(window.__DG_MAX_PANEL_SIDE_PX) : NaN;
    if (Number.isFinite(v) && v > 600) maxSide = v;
  } catch {}
  const capFromSide = Math.min(maxSide / w, maxSide / h);

  let capped = Math.min(dpr, capFromPx, capFromSide);
  capped = Math.max(minDpr, Math.min(dpr, capped));

  // Hysteresis to avoid DPR thrash around thresholds.
  const prev = (Number.isFinite(prevDpr) && prevDpr > 0) ? prevDpr : null;
  if (prev !== null) {
    if (capped > prev && (capped - prev) < 0.12) return prev;
    if (capped < prev && (prev - capped) < 0.06) return prev;
  }
  return capped;
}

// -----------------------------------------------------------------------------
// Visual + pressure DPR multipliers (mirrors DrawGrid so fields scale consistently)
// -----------------------------------------------------------------------------

// Visual backing-store DPR reduction when visually small (generic, not gesture)
window.__FIELD_VISUAL_DPR_ZOOM_THRESHOLD ??= 0.9;
window.__FIELD_VISUAL_DPR_MIN_MUL ??= 0.6;

function __fieldComputeVisualBackingMul(boardScale) {
  const threshold = window.__FIELD_VISUAL_DPR_ZOOM_THRESHOLD;
  const minMul = window.__FIELD_VISUAL_DPR_MIN_MUL;
  if (!boardScale || boardScale >= threshold) return 1;
  const t = Math.max(0, Math.min(1, boardScale / threshold));
  return minMul + (1 - minMul) * t;
}

// Pressure-based backing-store DPR reduction (generic, keys off FPS)
window.__FIELD_PRESSURE_DPR_ENABLED ??= true;
window.__FIELD_PRESSURE_DPR_START_MS ??= 20;
window.__FIELD_PRESSURE_DPR_END_MS ??= 34;
window.__FIELD_PRESSURE_DPR_MIN_MUL ??= 0.6;
window.__FIELD_PRESSURE_DPR_EWMA_ALPHA ??= 0.07;
window.__FIELD_PRESSURE_DPR_COOLDOWN_MS ??= 800;

let __fieldPressureFrameMsEwma = null;
let __fieldPressureDprMul = 1;
let __fieldPressureMulLastChangeTs = 0;

function __fieldComputePressureMul(frameMs) {
  const startMs = Number.isFinite(window.__FIELD_PRESSURE_DPR_START_MS)
    ? window.__FIELD_PRESSURE_DPR_START_MS
    : (Number.isFinite(window.__DG_PRESSURE_DPR_START_MS) ? window.__DG_PRESSURE_DPR_START_MS : 20);
  const endMs = Number.isFinite(window.__FIELD_PRESSURE_DPR_END_MS)
    ? window.__FIELD_PRESSURE_DPR_END_MS
    : (Number.isFinite(window.__DG_PRESSURE_DPR_END_MS) ? window.__DG_PRESSURE_DPR_END_MS : 34);
  const minMul = Number.isFinite(window.__FIELD_PRESSURE_DPR_MIN_MUL)
    ? window.__FIELD_PRESSURE_DPR_MIN_MUL
    : (Number.isFinite(window.__DG_PRESSURE_DPR_MIN_MUL) ? window.__DG_PRESSURE_DPR_MIN_MUL : 0.6);

  if (!Number.isFinite(frameMs) || frameMs <= startMs) return 1;
  if (frameMs >= endMs) return minMul;
  const t = Math.max(0, Math.min(1, (frameMs - startMs) / Math.max(1e-6, (endMs - startMs))));
  return 1 - (1 - minMul) * t;
}

function __fieldUpdatePressureMulFromFrameMs(frameMs, nowTs) {
  if (!(window.__FIELD_PRESSURE_DPR_ENABLED ?? true)) {
    __fieldPressureFrameMsEwma = null;
    __fieldPressureDprMul = 1;
    return;
  }
  if (!Number.isFinite(frameMs) || frameMs <= 0) return;

  const alpha = Number.isFinite(window.__FIELD_PRESSURE_DPR_EWMA_ALPHA)
    ? window.__FIELD_PRESSURE_DPR_EWMA_ALPHA
    : (Number.isFinite(window.__DG_PRESSURE_DPR_EWMA_ALPHA) ? window.__DG_PRESSURE_DPR_EWMA_ALPHA : 0.07);
  __fieldPressureFrameMsEwma = (__fieldPressureFrameMsEwma == null)
    ? frameMs
    : (__fieldPressureFrameMsEwma * (1 - alpha) + frameMs * alpha);

  const targetMul = __fieldComputePressureMul(__fieldPressureFrameMsEwma);
  const cooldown = Number.isFinite(window.__FIELD_PRESSURE_DPR_COOLDOWN_MS)
    ? window.__FIELD_PRESSURE_DPR_COOLDOWN_MS
    : (Number.isFinite(window.__DG_PRESSURE_DPR_COOLDOWN_MS) ? window.__DG_PRESSURE_DPR_COOLDOWN_MS : 800);

  const cur = __fieldPressureDprMul;
  if (targetMul < (cur - 0.02)) {
    __fieldPressureDprMul = targetMul;
    __fieldPressureMulLastChangeTs = nowTs;
  } else if (targetMul > (cur + 0.02)) {
    if (!__fieldPressureMulLastChangeTs || (nowTs - __fieldPressureMulLastChangeTs) >= cooldown) {
      __fieldPressureDprMul = targetMul;
      __fieldPressureMulLastChangeTs = nowTs;
    }
  }
}

// Back-compat: some callers may still pass FPS.
function __fieldUpdatePressureMulFromFps(fps, nowTs) {
  if (!Number.isFinite(fps) || fps <= 0) return;
  __fieldUpdatePressureMulFromFrameMs(1000 / fps, nowTs);
}

// Fade tuning
const FADE_IN_RATE = 1.6;   // per second
const FADE_OUT_RATE = 0.9;  // per second (base)
const TWINKLE_PER_SEC = 5;  // always fade this many in/out per second (soft twinkle)
const TWINKLE_MIN = 0.25;
const TWINKLE_MAX = 0.75;
const ADJUST_PER_SEC = 10;  // when scaling up/down for LOD
const MIN_PARTICLES = 50;   // never drop below this
const MAX_FADE_OUT_FRACTION = 0.04; // cap how many fade-outs per reconcile step
const MAX_FADE_OUT_STEP = 16;
const MIN_FADE_STEP = 2;
const MEASURE_MIN_MS = 120; // throttle layout reads to reduce reflows
const VISIBILITY_MIN_MS = 220; // throttle viewport checks
const VISIBILITY_ENTER_MARGIN_PX = 30; // stricter for re-enter
const VISIBILITY_EXIT_MARGIN_PX = -60; // lenient for staying visible
const ZOOM_DENSITY_MIN = 0.4;
const ZOOM_DENSITY_MAX = 2.2;
const ZOOM_DENSITY_SMOOTH = 0.2;
const ZOOM_DENSITY_REBUILD_DELTA = 0.08;
const ZOOM_DENSITY_REBUILD_MS = 180;

function perfSection(name, fn) {
  if (!(window.__PERF_PARTICLE_FIELD_PROFILE && window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now)) {
    return fn();
  }
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    try { window.__PerfFrameProf.mark(name, performance.now() - t0); } catch {}
  }
}

function isZoomGesturing() {
  try {
    return !!(typeof window !== 'undefined' && window.__mtZoomGesturing);
  } catch {
    return false;
  }
}

function readPerfBudgetMul() {
  // Prefer new ParticleQuality API if available
  try {
    if (window.__ParticleQuality && typeof window.__ParticleQuality.budgetMul === 'number' && Number.isFinite(window.__ParticleQuality.budgetMul)) {
      return Math.max(0, window.__ParticleQuality.budgetMul);
    }
  } catch {}
  // Fallback to legacy window.__PERF_PARTICLES
  try {
    const v = window.__PERF_PARTICLES?.budgetMul;
    return (typeof v === 'number' && Number.isFinite(v)) ? Math.max(0, v) : 1;
  } catch {
    return 1;
  }
}

function readPerfFreezeUnfocused() {
  try {
    return !!window.__PERF_PARTICLES?.freezeUnfocusedDuringGesture;
  } catch {
    return false;
  }
}

function readPerfLogFreeze() {
  try {
    return !!window.__PERF_PARTICLES?.logFreeze;
  } catch {
    return false;
  }
}

function shouldLogFreeze() {
  // Off by default. Only turn on when diagnosing freeze behaviour.
  return readPerfLogFreeze();
}

// Color stops for particles as they fade back home after a poke.
// Sequence: bright cyan punch -> pink -> clean white settle.
export const PARTICLE_RETURN_GRADIENT = Object.freeze([
  { stop: 0.0, rgb: [51, 153, 255] },   // Bright cyan blue at impact
  { stop: 0.55, rgb: [255, 255, 255] }, // Pink mid fade
  { stop: 1.0, rgb: [255, 108, 196] },  // White as it settles
]);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function sampleReturnGradient(t) {
  const stops = PARTICLE_RETURN_GRADIENT;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const next = stops[i];
    if (clamped <= next.stop) {
      const span = Math.max(1e-6, next.stop - prev.stop);
      const localT = (clamped - prev.stop) / span;
      return [
        Math.round(lerp(prev.rgb[0], next.rgb[0], localT)),
        Math.round(lerp(prev.rgb[1], next.rgb[1], localT)),
        Math.round(lerp(prev.rgb[2], next.rgb[2], localT)),
      ];
    }
  }
  const last = stops[stops.length - 1];
  return [last.rgb[0], last.rgb[1], last.rgb[2]];
}

function rgbToRgbaString(rgb, alpha = 1) {
  const [r, g, b] = Array.isArray(rgb) ? rgb : [255, 255, 255];
  const a = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

const __zoomCache = { value: 1, ts: 0 };
function readZoom(viewport) {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if (__zoomCache.ts && (now - __zoomCache.ts) < 120) return __zoomCache.value;
  let z = 1;
  if (viewport && typeof viewport.getZoom === 'function') {
    const v = Number(viewport.getZoom());
    if (Number.isFinite(v) && v > 0) z = v;
  } else {
    const fallback = Number(window.__boardScale);
    if (Number.isFinite(fallback) && fallback > 0) z = fallback;
  }
  __zoomCache.value = z;
  __zoomCache.ts = now;
  return z;
}

function clampZoomForDensity(zoom) {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return Math.max(ZOOM_DENSITY_MIN, Math.min(ZOOM_DENSITY_MAX, z));
}

const __overviewCache = { value: false, ts: 0 };
function readOverview(viewport) {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if (__overviewCache.ts && (now - __overviewCache.ts) < 160) return __overviewCache.value;
  let isOn = false;
  if (viewport && typeof viewport.isOverview === 'function') {
    try { isOn = !!viewport.isOverview(); } catch { /* noop */ }
  } else {
    try {
      isOn = document.documentElement.classList.contains('overview-outline');
    } catch {
      isOn = false;
    }
  }
  __overviewCache.value = isOn;
  __overviewCache.ts = now;
  return isOn;
}

const __toyCountCache = { value: 0, ts: 0 };
const __toyVisibleCache = { value: 0, ts: 0 };
function getToyCountCached() {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if ((now - __toyCountCache.ts) < 500) return __toyCountCache.value || 0;
  let count = 0;
  try { count = document.querySelectorAll('.toy-panel').length; } catch {}
  __toyCountCache.value = count || 0;
  __toyCountCache.ts = now;
  return __toyCountCache.value;
}
function getVisibleToyCountCached() {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if ((now - __toyVisibleCache.ts) < 500) return __toyVisibleCache.value || 0;
  let count = 0;
  try {
    const panels = document.querySelectorAll('.toy-panel');
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    for (const el of panels) {
      const r = el.getBoundingClientRect?.();
      if (!r) continue;
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
      count++;
    }
  } catch {}
  __toyVisibleCache.value = count || 0;
  __toyVisibleCache.ts = now;
  return __toyVisibleCache.value;
}

function readPerfFpsHint() {
  // Try new ParticleQuality API first
  try {
    if (window.__ParticleQuality && typeof window.__ParticleQuality.fpsValue === 'number' && Number.isFinite(window.__ParticleQuality.fpsValue)) {
      return window.__ParticleQuality.fpsValue;
    }
  } catch {}
  // Fallback to legacy APIs
  try {
    const auto = window.__PERF_PARTICLES?.__gestureAuto;
    if (auto && Number.isFinite(auto.fps)) return auto.fps;
  } catch {}
  try {
    const v = window.__dgFpsValue;
    if (Number.isFinite(v)) return v;
  } catch {}
  return null;
}

function readMemoryPressureLevel() {
  // Read from new ParticleQuality API
  try {
    if (window.__ParticleQuality && typeof window.__ParticleQuality.memoryPressureLevel === 'number') {
      return Math.max(0, Math.min(3, window.__ParticleQuality.memoryPressureLevel));
    }
  } catch {}
  // Fallback: compute from performance.memory if available
  try {
    if (performance?.memory?.usedJSHeapSize && performance?.memory?.jsHeapSizeLimit) {
      const ratio = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;
      if (ratio > 0.85) return 3;
      if (ratio > 0.70) return 2;
      if (ratio > 0.55) return 1;
      return 0;
    }
  } catch {}
  return 0;
}

function readPerfFpsBuckets() {
  // Get FPS bucket info from ParticleQuality API
  try {
    if (window.__ParticleQuality && typeof window.__ParticleQuality.getFpsBuckets === 'function') {
      return window.__ParticleQuality.getFpsBuckets();
    }
  } catch {}
  return null;
}

function canGestureThrottle() {
  try {
    if (window.__PERF_FORCE_GESTURE_THROTTLE) return true;
    const visible = getVisibleToyCountCached();
    if (visible <= 4) return false;
    const total = getToyCountCached();
    if (total <= 4) return false;
    const fpsHint = readPerfFpsHint();
    if (Number.isFinite(fpsHint) && fpsHint >= 52) return false;
    return true;
  } catch {
    return true;
  }
}

export function createField({ canvas, viewport, pausedRef, isFocusedRef, debugLabel } = {}, opts = {}) {
  if (!canvas) throw new Error('createField requires a canvas reference');
  // Static mode: no ambient noise, no radial "kick" gravity. Only reacts to pokes.
  const STATIC_MODE = !!opts.staticMode;
  const ctx = canvas.getContext('2d', { alpha: true });
  const fieldLabel =
    opts?.debugLabel ??
    debugLabel ??
    opts?.id ??
    opts?.seed ??
    (canvas?.closest?.('.toy-panel')?.dataset?.toy) ??
    (canvas?.id) ??
    'field-unknown';
  const fieldId = hashSeed(fieldLabel + ':' + (opts.seed ?? '') + ':' + (opts.debugLabel ?? '')) >>> 0;

  const sizeCache = { w: Math.max(1, canvas.clientWidth || canvas.width || 1), h: Math.max(1, canvas.clientHeight || canvas.height || 1), ts: 0 };
  let __fgLastDprTraceSig = '';
  let __resizeDeferred = false;
  let __rebuildRetryRaf = 0;
  let __lastVisible = true;
  let __lastVisCheck = 0;

  function shouldSkipResize() {
    try { return !!window.__ZOOM_COMMIT_PHASE; } catch {}
    return false;
  }
  const updateSizeCache = () => {
    try {
      // Avoid forced layout: read from style + attrs first; fall back to client sizes if needed.
      // NOTE: During zoom commits / DOM normalization, some canvases briefly report 0–1px.
      // We MUST NOT let that collapse our backing store (it nukes particles + causes churn).
      const prevW = sizeCache.w;
      const prevH = sizeCache.h;
      const styleW = parseFloat(getComputedStyle(canvas).width) || 0;
      const styleH = parseFloat(getComputedStyle(canvas).height) || 0;
      const w = Math.max(1, Math.round(styleW || canvas.width || canvas.clientWidth || 1));
      const h = Math.max(1, Math.round(styleH || canvas.height || canvas.clientHeight || 1));

      // Treat tiny sizes as transient/invalid if we previously had a real size.
      // (We still allow initial startup to populate from tiny → real.)
      if ((w <= 2 || h <= 2) && (prevW > 2 && prevH > 2)) {
        return;
      }

      sizeCache.w = w;
      sizeCache.h = h;
      sizeCache.ts = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    } catch {}
  };
  try {
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => updateSizeCache());
      ro.observe(canvas);
      canvas.__particleRO = ro;
    }
  } catch {}

  const measure = () => {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    // Fresh cache within ~400ms: reuse to avoid layout.
    if (sizeCache.w > 0 && sizeCache.h > 0 && (now - (sizeCache.ts || 0)) < 400) {
      return { w: sizeCache.w, h: sizeCache.h };
    }
    // Avoid forced layout during live zoom gestures; reuse cache instead.
    if (isZoomGesturing()) {
      return { w: sizeCache.w, h: sizeCache.h };
    }
    // Throttle layout reads; if stale, update once.
    updateSizeCache();
    return { w: sizeCache.w, h: sizeCache.h };
  };

  // If an external viewport was provided (from Draw Toy, etc.), reuse it.
  const pv = viewport && viewport.map && typeof viewport.map.size === 'function'
    ? viewport
    : createParticleViewport(() => measure());

    const config = {
      density: opts.density ?? 0.0002,
      layoutOverrides: opts.layout && typeof opts.layout === 'object' ? opts.layout : null,
      seed: opts.seed ?? 'particle-field',
      cap: opts.cap ?? getParticleCap(),
      noise: STATIC_MODE ? 0.0 : (opts.noise ?? 0.0),
      kick: STATIC_MODE ? 0.0 : (opts.kick ?? 0.0),
      kickDecay: opts.kickDecay ?? 6.0,
      vmaxMul: Number.isFinite(opts.vmaxMul) ? opts.vmaxMul : 1,
    /**
     * Target return time (seconds) for particles to settle ~critically damped.
     * 2.0 gives a nice "float back in" feel.
     */
    returnSeconds: Math.max(0.3, Number(opts.returnSeconds ?? 2.0)),
    sizePx: typeof opts.sizePx === 'number' ? opts.sizePx : BASE_RADIUS_PX,
    minAlpha: opts.minAlpha ?? 0.25,
    maxAlpha: opts.maxAlpha ?? 0.85,
    lineAlpha: opts.lineAlpha ?? 0.1,
    drawMode: opts.drawMode ?? 'dots',
    linkDist: opts.linkDist ?? 42,
    strokeStyle: opts.strokeStyle ?? 'rgba(143,168,255,0.35)',
    fillStyle: opts.fillStyle ?? '#9fb7ff',
    forceMul: typeof opts.forceMul === 'number' ? opts.forceMul : 1.3,
    debugLabel: fieldLabel,
  };

  const state = {
    w: 1,
    h: 1,
    dpr: 1,
    __lastXformDpr: 0,
    lastDt: 1 / 60,
    particles: [],
    particlePool: [],    // Object pool for reusing particle objects
    targetDesired: 0,
    pulseEnergy: 0,
    lodScale: 1,
    capScale: 1,
    minParticles: MIN_PARTICLES,
    emergencyFade: false,
    emergencyFadeSeconds: 5,
    __fullyOffWanted: false,
    __fullyOff: false,
    smoothRecoverUntil: 0,
    emergencyDbg: { ticks: 0, fades: 0, lastTs: 0 },
    tickModulo: 1,
    tickModuloCounter: 0,
    tickAccumDt: 0,
    spacing: 18,
    gestureSkip: 0,
    gestureDrawCounter: 0,
    drawCounter: 0,
    lastMeasureTs: 0,
    zoomForDensity: 1,
    lastZoomRebuildTs: 0,
    wasHidden: false,
    clipRect: null,
    clipDirty: false,
  };
  const baseSizePx = config.sizePx;
  const PARTICLE_HIGHLIGHT_DURATION = 1800; // ms
  const PARTICLE_HIGHLIGHT_INTENSITY = 0.6; // base cap
  const PARTICLE_HIGHLIGHT_SIZE_BUMP = 0.25; // relative radius increase at peak highlight
  const highlightEvents = [];
  // evt: {x,y,radius,t,amp,dur}

  // Object pool helpers for particle recycling (reduces GC pressure)
  function acquireParticle(x, y, hx, hy, a, rPx, fade = 1, fadeTarget = 1, fadeRate = FADE_IN_RATE) {
    let p;
    if (state.particlePool.length > 0) {
      p = state.particlePool.pop();
    } else {
      p = {};
    }
    p.x = x; p.y = y; p.hx = hx; p.hy = hy; p.vx = 0; p.vy = 0; p.a = a; p.rPx = rPx;
    p.fade = fade; p.fadeTarget = fadeTarget; p.fadeRate = fadeRate; p._fadeReturn = false;
    return p;
  }

  function releaseParticle(p) {
    // Reset and return to pool for reuse
    p.x = 0; p.y = 0; p.hx = 0; p.hy = 0; p.vx = 0; p.vy = 0; p.a = 0; p.rPx = 0;
    p.fade = 0; p.fadeTarget = 1; p.fadeRate = FADE_IN_RATE; p._fadeReturn = false;
    state.particlePool.push(p);
  }

  function hashSeed(value) {
    const key = String(value ?? '');
    let h = 2166136261 >>> 0;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) || 1;
  }

  function makeRng(token) {
    const key = String(token ?? '');
    if (RNG_SEED_PER_TOY) return seededRandomFactory(key);
    let s = hashSeed(key);
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
  }

  function normalizedKick(distPx, spacing) {
    const s = Math.max(8, spacing || 18);
    const span = Math.max(1, s * 1.5);
    const ratio = Math.min(1, distPx / span);
    return Math.max(0.2, 1 - ratio);
  }

  function rebuild() {
    const size = pv?.map?.size?.() || measure();
    const prevW = state.w;
    const prevH = state.h;

    // NOTE: During boot/refresh/DOM churn we can transiently read 0/1px sizes.
    // Resizing backing stores to 1x1 then back up creates compositor churn and
    // can amplify `frame.nonScript` spikes.
    //
    // Strategy:
    // - If we already had a real size (>2px), keep it when we read tiny sizes.
    // - If we're still in boot (no real size yet) and we read tiny sizes, DON'T commit 1x1;
    //   schedule a retry next frame and bail.
    const rawW = Math.round(size.w || 0);
    const rawH = Math.round(size.h || 0);

    if ((rawW <= 2 || rawH <= 2) && prevW <= 2 && prevH <= 2) {
      if (!__rebuildRetryRaf && typeof requestAnimationFrame === 'function') {
        __rebuildRetryRaf = requestAnimationFrame(() => {
          __rebuildRetryRaf = 0;
          try { rebuild(); } catch {}
        });
      }
      return;
    }

    const nextCssWRaw = Math.max(1, (rawW || 1));
    const nextCssHRaw = Math.max(1, (rawH || 1));
    const nextCssW = (nextCssWRaw <= 2 && prevW > 2) ? prevW : nextCssWRaw;
    const nextCssH = (nextCssHRaw <= 2 && prevH > 2) ? prevH : nextCssHRaw;
    state.w = nextCssW;
    state.h = nextCssH;

    const deviceDpr = Math.max(1, Math.min(((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1), 3));
    const zoomNow = readZoom(viewport || pv);
    const visualMul = __fieldComputeVisualBackingMul(zoomNow);
    const fallbackDt =
      (Number.isFinite(window.__MT_SM_FPS) && window.__MT_SM_FPS > 0) ? (1 / window.__MT_SM_FPS) :
        ((Number.isFinite(window.__MT_FPS) && window.__MT_FPS > 0) ? (1 / window.__MT_FPS) : (1 / 60));
    const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const dtMsFallback = (Number.isFinite(state.lastDt) ? state.lastDt : fallbackDt) * 1000;

    // Prefer wall-clock deltas so "pressure DPR" can see real frame stalls even if dt is clamped elsewhere.
    const rawWallMs = Number.isFinite(state.__lastPressureNowTs) ? (nowTs - state.__lastPressureNowTs) : dtMsFallback;
    state.__lastPressureNowTs = nowTs;

    const frameMsSample = Math.max(0, Math.min(250, rawWallMs));
    __fieldUpdatePressureMulFromFrameMs(frameMsSample, nowTs);
    const pressureMul = (Number.isFinite(__fieldPressureDprMul) && __fieldPressureDprMul > 0) ? __fieldPressureDprMul : 1;
    // Store for debug traces (no perf impact when tracing is off).
    state.deviceDpr = deviceDpr;
    state.visualMul = visualMul;
    state.pressureMul = pressureMul;
    const desiredDprRaw = deviceDpr * visualMul * pressureMul;
    const desiredDpr = Math.min(deviceDpr, desiredDprRaw);
    state.dpr = capDprForBackingStore(state.w, state.h, desiredDpr, state.dpr, {
      maxBackingPx: opts?.maxBackingPx,
      maxBackingSidePx: opts?.maxBackingSidePx,
    });

    // Quantize DPR to avoid tiny float jitter causing 1–2px backing-store oscillation.
    const __quantizeDpr = (v) => {
      const n = Number.isFinite(v) ? v : 1;
      return Math.max(0.25, Math.round(n * 64) / 64);
    };
    state.dpr = __quantizeDpr(state.dpr);

    // Quantize backing-store pixel sizes to integers (NOT even numbers).
    // Even-quantization can introduce a 1px mismatch vs CSS size (e.g. 599 -> 600),
    // which creates resize churn and a subtle effective-DPR distortion.
    const __quantPx = (v) => Math.max(1, Math.round(v));
    const pxW = __quantPx(state.w * state.dpr);
    const pxH = __quantPx(state.h * state.dpr);
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;
    if (state.__lastXformDpr !== state.dpr) {
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      state.__lastXformDpr = state.dpr;
    }

    // Effective DPR / backing-store trace (debug-only; driven by PerfLab 'traceDprOn').
    try {
      if (typeof window !== 'undefined' && window.__FG_EFFECTIVE_DPR_TRACE) {
        const effDprW = (state.w > 0 && pxW > 0) ? (pxW / state.w) : null;
        const effDprH = (state.h > 0 && pxH > 0) ? (pxH / state.h) : null;
        const payload = {
          tag: 'field-generic',
          id: fieldLabel,
          cssW: state.w,
          cssH: state.h,
          dpr: state.dpr,
          backingW: pxW,
          backingH: pxH,
          effDprW,
          effDprH,
          pressureMul: state.pressureMul,
          visualMul: state.visualMul,
          deviceDpr: state.deviceDpr,
        };
        const sig = JSON.stringify(payload);
        if (sig !== __fgLastDprTraceSig) {
          __fgLastDprTraceSig = sig;
          // Prefer buffered trace (PerfLab) to avoid console stalls during perf runs.
          try {
            const push = (typeof window !== 'undefined') ? window.__PERF_TRACE_PUSH : null;
            if (typeof push === 'function') push('FG.dpr', payload);
          } catch {}

          // Console is opt-in only (debugging, not perf).
          try {
            const toConsole = (typeof window !== 'undefined') ? !!window.__PERF_TRACE_TO_CONSOLE : true;
            if (toConsole) console.log('[FG][dpr]', payload);
          } catch {}
        }
      }
    } catch {}

    const layoutOpts = config.layoutOverrides || {};
    const rawZoom = readZoom(viewport || pv);
    const clampedZoom = clampZoomForDensity(rawZoom);
    const prevZoomForDensity = Number.isFinite(state.zoomForDensity) ? state.zoomForDensity : clampedZoom;
    const nextZoomForDensity = prevZoomForDensity + (clampedZoom - prevZoomForDensity) * ZOOM_DENSITY_SMOOTH;
    state.zoomForDensity = nextZoomForDensity;
    const densityZoom = Math.max(0.01, nextZoomForDensity);
    const layoutBaseArea = Number.isFinite(layoutOpts.baseArea) ? layoutOpts.baseArea : BASE_AREA;
    const layoutBaseCount = Number.isFinite(layoutOpts.baseCount) ? layoutOpts.baseCount : BASE_COUNT;
    const layoutMinCount = Number.isFinite(layoutOpts.minCount) ? layoutOpts.minCount : MIN_COUNT;
    const layoutMaxCount = Number.isFinite(layoutOpts.maxCount) ? layoutOpts.maxCount : MAX_COUNT;
    const computedLayout = computeParticleLayout({
      widthPx: state.w / densityZoom,
      heightPx: state.h / densityZoom,
      baseArea: layoutBaseArea,
      baseCount: layoutBaseCount,
      minCount: layoutMinCount,
      maxCount: layoutMaxCount,
      debugLabel: opts.debugLabel || config.seed || 'field',
    });
    const layoutArea = Math.max(1, (state.w / densityZoom) * (state.h / densityZoom));
    const idealCount = (layoutArea / layoutBaseArea) * layoutBaseCount;
    const resolvedCount = Number.isFinite(layoutOpts.count)
      ? Math.max(1, Math.round(layoutOpts.count))
      : computedLayout.count;
    let spacingCandidate = Number.isFinite(layoutOpts.spacing)
      ? layoutOpts.spacing
      : computedLayout.spacing;
    if (!Number.isFinite(layoutOpts.spacing) && idealCount > layoutMaxCount) {
      const baseSpacing = Math.sqrt(layoutBaseArea / layoutBaseCount) * GRID_RELAX;
      spacingCandidate = Math.min(spacingCandidate, baseSpacing);
    }
    const lodScale = Math.max(0.15, Math.min(1, state.lodScale || 1));
    const spacingScale = lodScale > 0 ? (1 / Math.sqrt(lodScale)) : 1;
    state.spacing = Math.max(8, (spacingCandidate || computedLayout.spacing || 8) * spacingScale);
    const minParticles = Number.isFinite(state.minParticles) ? Math.max(0, Math.round(state.minParticles)) : MIN_PARTICLES;
    const capBase = Number.isFinite(config.cap) ? config.cap : Number.POSITIVE_INFINITY;
    const capScale = Math.max(0, Math.min(1.25, state.capScale || 1));
    const cap = Math.max(1, Math.round(capBase * capScale));
    let target = Math.max(minParticles, Math.min(cap, Math.max(1, Math.round(resolvedCount * lodScale))));
    if (state.emergencyFade && minParticles === 0) target = 0;
    state.targetDesired = target;

    if (state.particles.length) {
      const scaleX = prevW > 0 ? (state.w / prevW) : 1;
      const scaleY = prevH > 0 ? (state.h / prevH) : 1;
      for (let i = 0; i < state.particles.length; i++) {
        const p = state.particles[i];
        const homeX = Number.isFinite(p.hx) ? p.hx : p.x;
        const homeY = Number.isFinite(p.hy) ? p.hy : p.y;
        const dispX = Number.isFinite(p.x) ? (p.x - homeX) : 0;
        const dispY = Number.isFinite(p.y) ? (p.y - homeY) : 0;
        const u = prevW > 0 ? (homeX / prevW) : 0.5;
        const v = prevH > 0 ? (homeY / prevH) : 0.5;
        const clampedU = Math.min(Math.max(u, 0), 1);
        const clampedV = Math.min(Math.max(v, 0), 1);
        const nextHx = clampedU * state.w;
        const nextHy = clampedV * state.h;
        const nextX = nextHx + dispX * scaleX;
        const nextY = nextHy + dispY * scaleY;
        p.hx = nextHx;
        p.hy = nextHy;
        p.x = Math.min(Math.max(nextX, 0), state.w);
        p.y = Math.min(Math.max(nextY, 0), state.h);
      }
    }

    const nowTs2 = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    const smoothRecover = !state.emergencyFade && state.smoothRecoverUntil && nowTs2 < state.smoothRecoverUntil;

    // Initial fill: if empty, seed to the target immediately so we don't draw blanks.
    if (!state.particles.length && target > 0) {
      const seedKey = `${config.seed}:${state.w}x${state.h}`;
      const rng = makeRng(seedKey);
      const seedCount = smoothRecover ? Math.max(6, Math.round(target * 0.12)) : target;
      while (state.particles.length < seedCount) {
        const x = rng() * state.w;
        const y = rng() * state.h;
        const a = rng();
        const rPx = particleRadiusPx(rng);
        const fade = smoothRecover ? 0 : 1;
        state.particles.push(acquireParticle(x, y, x, y, a, rPx, fade, 1, smoothRecover ? FADE_IN_RATE * 0.6 : FADE_IN_RATE));
      }
    }
    reconcileParticleCount(0, !smoothRecover);
  }

  function resize() {
    if (shouldSkipResize()) {
      __resizeDeferred = true;
      return;
    }
    if (__resizeDeferred) __resizeDeferred = false;
    pv?.refreshSize?.({ snap: true });
    rebuild();
  }

  function maybeResizeFromLayout() {
    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    if (state.lastMeasureTs && (now - state.lastMeasureTs) < MEASURE_MIN_MS) return;
    if (isZoomGesturing()) return;
    state.lastMeasureTs = now;
    const rect = measure();
    if (rect.w !== state.w || rect.h !== state.h) {
      resize();
    }
  }

  function isFieldVisible() {
    try {
      if (typeof opts.isVisibleRef === 'function') return !!opts.isVisibleRef();
    } catch {}
    if (typeof window === 'undefined' || !canvas?.getBoundingClientRect) return true;
    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    if (__lastVisCheck && (now - __lastVisCheck) < VISIBILITY_MIN_MS) return __lastVisible;
    __lastVisCheck = now;
    const rect = canvas.getBoundingClientRect();
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    const marginPx = __lastVisible ? VISIBILITY_EXIT_MARGIN_PX : VISIBILITY_ENTER_MARGIN_PX;
    let left = marginPx;
    let top = marginPx;
    let right = vw - marginPx;
    let bottom = vh - marginPx;
    if (right < left) right = left;
    if (bottom < top) bottom = top;
    const visible = !!rect && rect.width > 0 && rect.height > 0 &&
      rect.right >= left && rect.bottom >= top && rect.left <= right && rect.top <= bottom;
    __lastVisible = visible;
    return visible;
  }

  let __lodLastTs = 0;
  let __lodLastZoom = 1;
  let __lodLastOverview = false;
  let __lodLastPaused = false;
  let __lodLastPerf = 1;
  function setLODFromView() {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const zoom = readZoom(viewport || pv);
    const inOverview = readOverview(viewport);
    const paused = pausedRef?.() ?? false;
    const perfMul = readPerfBudgetMul();

    if (
      __lodLastTs &&
      (now - __lodLastTs) < 140 &&
      Math.abs(zoom - __lodLastZoom) < 0.01 &&
      inOverview === __lodLastOverview &&
      paused === __lodLastPaused &&
      Math.abs(perfMul - __lodLastPerf) < 0.01
    ) {
      return;
    }

    __lodLastTs = now;
    __lodLastZoom = zoom;
    __lodLastOverview = inOverview;
    __lodLastPaused = paused;
    __lodLastPerf = perfMul;

    const zoomFactor = zoom < 0.6 ? 0.85 : 1.0;
    const overviewFactor = inOverview ? 0.85 : 1.0;
    const pauseFactor = paused ? 0.85 : 1.0;
    state.lodScale = overviewFactor * zoomFactor * pauseFactor * Math.max(0.05, perfMul);

    const densityZoom = clampZoomForDensity(zoom);
    const prevZoomForDensity = Number.isFinite(state.zoomForDensity) ? state.zoomForDensity : densityZoom;
    const diff = Math.abs(densityZoom - prevZoomForDensity);
    if (!isZoomGesturing() && diff > ZOOM_DENSITY_REBUILD_DELTA) {
      if (!state.lastZoomRebuildTs || (now - state.lastZoomRebuildTs) > ZOOM_DENSITY_REBUILD_MS) {
        state.lastZoomRebuildTs = now;
        rebuild();
      }
    }
  }

  function pulse(intensity = 0.6) {
    state.pulseEnergy = Math.min(2.0, state.pulseEnergy + Math.max(0, intensity));
  }

  function step(dt) {
    // If velocities ever become NaN (from bad math), reset gracefully
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;

    const spacing = Math.max(8, state.spacing || 18);
    const spacingScale = spacing / 18;

    // Derive spring constants from target return time (critical-ish damping).
    // For x'' + 2ζω x' + ω² x = 0 with ζ≈1, T_settle ≈ 2/ω to 4/ω depending on definition.
    // Empirically ω = 3 / T gives a good ~2s visual settle.
    const T = Math.max(0.3, config.returnSeconds);
    const w0 = 3.0 / T;
    const k = (w0 * w0) * spacingScale; // spring to home
    const c = 2.0 * w0;
    const hum = STATIC_MODE ? 0.0 : (config.noise ?? 0.0);
    const kick = STATIC_MODE ? 0.0 : (state.pulseEnergy * (config.kick ?? 0.0));

    const cx = state.w * 0.5;
    const cy = state.h * 0.5;

    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];

      const ax = (p.hx - p.x) * k;
      const ay = (p.hy - p.y) * k;

      p.a += 0.35 * dt;
      if (p.a > 1) p.a -= 1;
      const ang = p.a * Math.PI * 2;
      const nx = hum ? Math.cos(ang) * hum : 0;
      const ny = hum ? Math.sin(ang) * hum : 0;

      const rx = p.x - cx;
      const ry = p.y - cy;
      const rl = Math.hypot(rx, ry) || 1;
      const kx = (rx / rl) * kick;
      const ky = (ry / rl) * kick;

      p.vx += (ax - p.vx * c + nx - kx) * dt;
      p.vy += (ay - p.vy * c + ny - ky) * dt;

      // Cap velocities relative to spacing so the field doesn't sling particles wildly.
      // vmax is expressed in px/sec; dt already scales movement when applied.
      const defaultVmax = Math.max(60, spacing * 18);
      const staticVmax = Math.max(90, spacing * 28);
        const vmaxMul = Number.isFinite(config.vmaxMul) ? config.vmaxMul : 1;
        const vmaxBase = STATIC_MODE ? staticVmax : defaultVmax;
        const vmax = vmaxBase * vmaxMul;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > vmax && speed > 0) {
        const scale = vmax / speed;
        p.vx *= scale;
        p.vy *= scale;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Snap to home a bit earlier to feel "short settle"
      const dxh = p.hx - p.x;
      const dyh = p.hy - p.y;
      const dist2 = dxh * dxh + dyh * dyh;
      const vel2  = p.vx * p.vx + p.vy * p.vy;
      if (dist2 < 1.0 && vel2 < 0.09) { // ~1px and ~0.3px/s
        p.x = p.hx; p.y = p.hy;
        p.vx = 0; p.vy = 0;
      }
    }

    if (state.pulseEnergy > 0) {
      state.pulseEnergy = Math.max(0, state.pulseEnergy - config.kickDecay * dt);
    }
  }

  function draw() {
    const clip = state.clipRect;
    if (clip && clip.w > 0 && clip.h > 0) {
      if (state.clipDirty) {
        ctx.clearRect(0, 0, state.w, state.h);
        state.clipDirty = false;
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.w, clip.h);
      ctx.clip();
      ctx.clearRect(clip.x, clip.y, clip.w, clip.h);
    } else {
      ctx.clearRect(0, 0, state.w, state.h);
    }

    // Canvas is sized from getBoundingClientRect (CSS space), so use screen-px radius directly.
    const fallbackRadiusPx = config.sizePx ?? BASE_RADIUS_PX;
    const baseWorldRadius = Math.max(0.5, fallbackRadiusPx);
    const zoom = readZoom(pv);
    const now = performance?.now?.() ?? Date.now();
    while (
      highlightEvents.length &&
      now - highlightEvents[0].t >= (highlightEvents[0].dur || PARTICLE_HIGHLIGHT_DURATION)
    ) {
      highlightEvents.shift();
    }

    const gestureActive = isZoomGesturing();

    if (!gestureActive && config.drawMode === 'dots+links' && state.particles.length <= 1500) {
      ctx.strokeStyle = config.strokeStyle;
      ctx.lineWidth = Math.max(0.6, baseWorldRadius * 0.8);
      for (let i = 0; i < state.particles.length; i++) {
        const a = state.particles[i];
        const fadeA = Number.isFinite(a.fade) ? Math.max(0, Math.min(1, a.fade)) : 1;
        if (fadeA <= 0.001) continue;
        for (let j = i + 1; j < state.particles.length; j++) {
          const b = state.particles[j];
          const fadeB = Number.isFinite(b.fade) ? Math.max(0, Math.min(1, b.fade)) : 1;
          if (fadeB <= 0.001) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          if (dx * dx + dy * dy < config.linkDist * config.linkDist) {
            ctx.globalAlpha = config.lineAlpha * Math.min(fadeA, fadeB);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
    }

    const baseFillStyle = config.fillStyle;
    const glowFillStyle = 'rgba(201, 228, 255, 0.96)';
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      const fadeAlpha = Number.isFinite(p.fade) ? Math.max(0, Math.min(1, p.fade)) : 1;
      if (fadeAlpha <= 0.001) continue;
      const alpha =
        config.minAlpha +
        (config.maxAlpha - config.minAlpha) *
          (0.5 + 0.5 * Math.sin(p.a * Math.PI * 2));
      let highlight = 0;
      let highlightAmp = 0;
      let highlightProgress = 0;
      if (highlightEvents.length) {
        for (const evt of highlightEvents) {
          const dt = now - evt.t;
          const evtDur = evt.dur || PARTICLE_HIGHLIGHT_DURATION;
          if (dt >= evtDur) continue;
          const life = 1 - dt / evtDur;
          const dx = p.x - evt.x;
          const dy = p.y - evt.y;
          const distSq = dx * dx + dy * dy;
          if (distSq >= evt.radius * evt.radius) continue;
          const dist = Math.sqrt(distSq);
          const radial = 1 - Math.min(1, dist / evt.radius);
          const candidate = radial * life;
          if (candidate > highlight) {
            highlight = candidate;
            highlightAmp = Math.max(0, Math.min(1, evt.amp ?? 0.6));
            // Track how far through the highlight we are to drive color fade.
            highlightProgress = 1 - life;
          }
        }
      }
      const particleRadius = Math.max(0.5, screenRadiusToWorld(p.rPx ?? fallbackRadiusPx, zoom));
      const highlightSizeScale = 1 + highlight * PARTICLE_HIGHLIGHT_SIZE_BUMP;
      const drawRadius = particleRadius * highlightSizeScale;
      const accent = Math.min(
        1,
        highlight *
          PARTICLE_HIGHLIGHT_INTENSITY *
          (1 + 0.5 * highlightAmp)
      );
      const accentRgb = highlight > 0 ? sampleReturnGradient(highlightProgress) : null;
      ctx.globalAlpha = Math.min(1, alpha + accent) * fadeAlpha;
      ctx.fillStyle = (highlight > 0 && accentRgb)
        ? rgbToRgbaString(accentRgb, 1)
        : baseFillStyle;
      ctx.beginPath();
      ctx.arc(p.x, p.y, drawRadius, 0, Math.PI * 2);
      ctx.fill();
      if (highlight > 0) {
        const glowAlpha = Math.min(0.85, accent * 1.2);
        const glowRgb = accentRgb || sampleReturnGradient(1);
        ctx.globalAlpha = glowAlpha * fadeAlpha;
        ctx.fillStyle = glowRgb ? rgbToRgbaString(glowRgb, 0.95) : glowFillStyle;
        ctx.beginPath();
        ctx.arc(p.x, p.y, drawRadius * (1 + highlight * 0.8), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;
    if (clip && clip.w > 0 && clip.h > 0) {
      ctx.restore();
    }
  }

function tick(dt = 1 / 60) {
  if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;
  state.lastDt = dt;
    const nowTs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    const frameMs = Number.isFinite(state.__lastPressureNowTs)
      ? (nowTs - state.__lastPressureNowTs)
      : (dt * 1000);
    state.__lastPressureNowTs = nowTs;
    const prevPressureMul = Number.isFinite(state.pressureMul) ? state.pressureMul : __fieldPressureDprMul;
    __fieldUpdatePressureMulFromFrameMs(Math.max(0, Math.min(250, frameMs)), nowTs);
    state.pressureMul = __fieldPressureDprMul;
    // If pressure DPR meaningfully recovers or drops, rebuild backing store.
    const diff = Math.abs(__fieldPressureDprMul - prevPressureMul);
    const lastResizeTs = Number.isFinite(state.__lastPressureResizeTs) ? state.__lastPressureResizeTs : 0;
    if (diff >= 0.08 && (!lastResizeTs || (nowTs - lastResizeTs) > 600) && !isZoomGesturing()) {
      state.__lastPressureResizeTs = nowTs;
      try { resize(); } catch {}
    }
      const __perfOn = !!window.__PERF_PARTICLE_FIELD_PROFILE;
      const __perfStart = __perfOn && typeof performance !== 'undefined' ? performance.now() : 0;
      try {
        const visible = isFieldVisible();
        if (!visible) {
          state.wasHidden = true;
          return;
        }
        // Ultra-cheap hard off: once a field has fully collapsed to 0 particles,
        // skip all per-frame work until budgets rise again.
        if (state.__fullyOff) return;
        if (state.wasHidden) {
          state.wasHidden = false;
          try { snapToBudget(); } catch {}
        }
        perfSection('particle.field.layout', () => {
          maybeResizeFromLayout();
          setLODFromView();
        });

        // If budgets have ramped the field down to "effectively off", avoid *all* per-frame
        // simulation cost once there are no live particles. This keeps toys smooth (no cadence
        // stepping) while eliminating the expensive physics/reconcile loops for empty fields.
        //
        // We only do this when:
        // - minParticles is 0 (so we are allowed to fully disable),
        // - emergencyFade is active (we're intentionally collapsing),
        // - there are no particles left,
        // - there are no transient effects that need ticking (pulse/highlights).
        const __minP = Number.isFinite(state.minParticles) ? state.minParticles : MIN_PARTICLES;
        if (
          state.emergencyFade &&
          __minP <= 0 &&
          (!state.particles || state.particles.length === 0) &&
          (!Array.isArray(highlightEvents) || highlightEvents.length === 0) &&
          (!Number.isFinite(state.pulseEnergy) || state.pulseEnergy <= 0.0001)
        ) {
          return;
        }

    const gestureActive = isZoomGesturing();
    // Gesture-based throttling removed: we do not change cadence/updates during pan/zoom.
    
    // Get memory pressure level and FPS buckets for adaptive behavior
    const memoryPressureLevel = readMemoryPressureLevel();
    const fpsBuckets = readPerfFpsBuckets();
    
    // Adjust emergency fade behavior based on memory pressure
    let memoryAdjustedFadeSeconds = state.emergencyFadeSeconds;
    if (state.emergencyFade && memoryPressureLevel >= 2) {
      // Critical memory pressure: reduce fade time for faster recovery
      memoryAdjustedFadeSeconds = Math.max(1.5, state.emergencyFadeSeconds * 0.5);
    } else if (state.emergencyFade && memoryPressureLevel >= 1) {
      // Moderate memory pressure: slightly reduce fade time
      memoryAdjustedFadeSeconds = Math.max(2.0, state.emergencyFadeSeconds * 0.75);
    }
    
    if (state.emergencyFade) {
      // Allow emergency fades to progress even during heavy gestures.
      state.gestureSkip = 0;
      state.gestureDrawCounter = 0;
      try {
        const dbg = state.emergencyDbg || (state.emergencyDbg = { ticks: 0, fades: 0, lastTs: 0 });
        dbg.ticks += 1;
        const now = performance?.now?.() ?? Date.now();
        if (now - dbg.lastTs > 800) {
          dbg.lastTs = now;
          const active = Array.isArray(state.particles) ? state.particles.length : 0;
          const desired = Number.isFinite(state.targetDesired) ? Math.round(state.targetDesired) : null;
          if (window.__PERF_LAB_VERBOSE) {
            console.log('[Particles][emergency] tick', { label: fieldLabel, ticks: dbg.ticks, fades: dbg.fades, active, desired, min: state.minParticles, emergency: state.emergencyFade });
          }
        }
      } catch {}
    }

    // Gestures no longer freeze particle fields; LOD + fade handles perf instead.
    let skipUpdate = false;
    let skipDraw = false;
    try {
      const perf = window.__PERF_PARTICLES || null;
      skipUpdate = !!perf?.skipUpdate;
      skipDraw = !!perf?.skipDraw;
    } catch {}
      if (skipUpdate) {
        if (!skipDraw) perfSection('particle.field.draw', () => draw());
        return;
      }
    let effectiveDt = dt;
    if (state.tickModulo > 1) {
      state.tickModuloCounter = (state.tickModuloCounter + 1) % state.tickModulo;
      state.tickAccumDt += dt;
      if (state.tickModuloCounter !== 0) {
          perfSection('particle.field.fades', () => updateFades(dt));
          perfSection('particle.field.twinkle', () => twinkle(dt));
          if (!skipDraw) {
            // If we're in a throttled tickModulo phase, also avoid drawing every frame.
            const dm = gestureThrottlingActive ? readPerfGestureDrawModulo() : 2;
            state.drawCounter = (state.drawCounter + 1) % Math.max(1, dm);
            if (state.drawCounter === 0) perfSection('particle.field.draw', () => draw());
          }
          perfSection('particle.field.cleanup', () => cleanupFaded());
          return;
        }
        effectiveDt = state.tickAccumDt;
        state.tickAccumDt = 0;
    }
    effectiveDt = Math.min(0.12, effectiveDt); // avoid huge leaps when heavily throttled

      perfSection('particle.field.reconcile', () => reconcileParticleCount(effectiveDt));
      // If we're trying to fully collapse and have reached 0, lock into hard-off.
      if (state.__fullyOffWanted && (!state.particles || state.particles.length === 0)) {
        state.__fullyOff = true;
        return;
      }
      if (state.emergencyFade) {
        try {
          const dbg = state.emergencyDbg || (state.emergencyDbg = { ticks: 0, fades: 0, lastTs: 0 });
          dbg.fades += 1;
        } catch {}
      }
      perfSection('particle.field.fades', () => updateFades(effectiveDt));
      perfSection('particle.field.step', () => step(effectiveDt));
      perfSection('particle.field.twinkle', () => twinkle(effectiveDt));
      if (!skipDraw) {
        perfSection('particle.field.draw', () => draw());
      }
      perfSection('particle.field.cleanup', () => cleanupFaded());
    } finally {
    if (__perfOn && __perfStart) {
      const __perfEnd = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
      if (__perfEnd) {
        try { window.__PerfFrameProf?.mark?.('particle.field', __perfEnd - __perfStart); } catch {}
      }
    }
  }
  }

  function applyBudget(budget = {}) {
    let { maxCountScale, capScale, tickModulo, sizeScale, minCount, emergencyFade, emergencyFadeSeconds } = budget;

    // If Perf-Lab (or ParticleQuality) exposes FPS buckets, use them to shed particles
    // more aggressively at very low FPS. This keeps animation smooth by reducing detail,
    // rather than freezing or lowering tick rates.
    try {
      const b = readPerfFpsBuckets();
      let fps = null;
      if (Number.isFinite(b)) {
        fps = b;
      } else if (b && typeof b === 'object') {
        // Be robust to different bucket shapes
        fps =
          (Number.isFinite(b.p50) ? b.p50 : null) ??
          (Number.isFinite(b.p50Fps) ? b.p50Fps : null) ??
          (Number.isFinite(b.avg) ? b.avg : null) ??
          (Number.isFinite(b.avgFps) ? b.avgFps : null) ??
          (Number.isFinite(b.fps) ? b.fps : null) ??
          (Number.isFinite(b.recentFps) ? b.recentFps : null);
      }

      if (Number.isFinite(fps)) {
        // Clamp budgets harder the worse FPS is.
        // - <=15fps: "panic" — dump particles fast
        // - <=24fps: strong shedding
        // - <=30fps: mild shedding
        if (fps <= 15) {
          if (Number.isFinite(maxCountScale)) maxCountScale = Math.min(maxCountScale, 0.25);
          if (Number.isFinite(capScale)) capScale = Math.min(capScale, 0.25);
          if (Number.isFinite(emergencyFadeSeconds)) emergencyFadeSeconds = Math.min(emergencyFadeSeconds, 1.2);
        } else if (fps <= 24) {
          if (Number.isFinite(maxCountScale)) maxCountScale = Math.min(maxCountScale, 0.5);
          if (Number.isFinite(capScale)) capScale = Math.min(capScale, 0.5);
          if (Number.isFinite(emergencyFadeSeconds)) emergencyFadeSeconds = Math.min(emergencyFadeSeconds, 2.0);
        } else if (fps <= 30) {
          if (Number.isFinite(maxCountScale)) maxCountScale = Math.min(maxCountScale, 0.75);
          if (Number.isFinite(capScale)) capScale = Math.min(capScale, 0.75);
        }
      }
    } catch {}
    let changed = false;
    if (Number.isFinite(minCount) || (emergencyFade === true && !Number.isFinite(minCount))) {
      const nextMin = Math.max(0, Math.round(Number.isFinite(minCount) ? minCount : 0));
      if (state.minParticles !== nextMin) {
        state.minParticles = nextMin;
        changed = true;
      }
    }
    if (typeof emergencyFade === 'boolean') {
      if (state.emergencyFade !== emergencyFade) {
        const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        if (state.emergencyFade && !emergencyFade) {
          state.smoothRecoverUntil = now + 3000;
        }
        state.emergencyFade = emergencyFade;
        try { if (window.__PERF_LAB_VERBOSE) console.log('[Particles][emergency] field', { label: fieldLabel, active: emergencyFade }); } catch {}
        changed = true;
      }
    }

    // If budgets are explicitly driving this field to "zero", mark a fully-off intent.
    // Once all particles are gone we can skip the entire tick() path cheaply.
    const bMax = Number(budget.maxCountScale ?? 1);
    const bCap = Number(budget.capScale ?? 1);
    const bSpawn = Number(budget.spawnScale ?? 1);
    const wantZero =
      state.emergencyFade &&
      bMax <= 0.0001 &&
      bCap <= 0.0001 &&
      bSpawn <= 0.0001;

    state.__fullyOffWanted = wantZero;
    if (wantZero) {
      // Allow full collapse (no minimum particle floor).
      state.minParticles = 0;
    } else {
      // Budgets came back up; allow tick again.
      state.__fullyOff = false;
    }
    if (Number.isFinite(emergencyFadeSeconds)) {
      const nextSeconds = Math.max(0.2, emergencyFadeSeconds);
      if (state.emergencyFadeSeconds !== nextSeconds) {
        state.emergencyFadeSeconds = nextSeconds;
        changed = true;
      }
    }
    if (Number.isFinite(maxCountScale)) {
      const minScale = (Number.isFinite(state.minParticles) && state.minParticles <= 0) ? 0 : 0.15;
      const target = Math.max(minScale, Math.min(1.0, maxCountScale));
      if (!Number.isFinite(state.lodScale)) state.lodScale = target;
      const alpha = target > state.lodScale ? 0.12 : 0.05; // ease down slower to avoid sudden drops
      state.lodScale = state.lodScale + (target - state.lodScale) * alpha;
      changed = true;
    }
    if (Number.isFinite(capScale)) {
      const minCap = (Number.isFinite(state.minParticles) && state.minParticles <= 0) ? 0 : 0.1;
      const target = Math.max(minCap, Math.min(1.25, capScale));
      if (!Number.isFinite(state.capScale)) state.capScale = target;
      const alpha = target > state.capScale ? 0.12 : 0.05;
      state.capScale = state.capScale + (target - state.capScale) * alpha;
      changed = true;
    }
    if (Number.isFinite(tickModulo)) {
      state.tickModulo = Math.max(1, Math.round(tickModulo));
      state.tickModuloCounter = 0;
      state.tickAccumDt = 0;
      changed = true;
    }
    if (Number.isFinite(sizeScale)) {
      const scaled = Math.max(0.4, baseSizePx * sizeScale);
      if (scaled !== config.sizePx) {
        config.sizePx = scaled;
        changed = true;
      }
    }
    if (changed) rebuild();
  }

  function snapToBudget() {
    rebuild();
    const minParticles = Number.isFinite(state.minParticles) ? Math.max(0, Math.round(state.minParticles)) : MIN_PARTICLES;
    let desired = Math.max(minParticles, Math.round(state.targetDesired || 0));
    if (state.emergencyFade && minParticles === 0) desired = 0;
    const current = state.particles.length;
    if (current > desired) {
      state.particles.length = desired;
      return;
    }
    if (current < desired) {
      const seedKey = `${config.seed}:${state.w}x${state.h}:snap:${desired}:${current}`;
      const rng = makeRng(seedKey);
      while (state.particles.length < desired) {
        const x = rng() * state.w;
        const y = rng() * state.h;
        const a = rng();
        const rPx = particleRadiusPx(rng);
        state.particles.push(acquireParticle(x, y, x, y, a, rPx, 1, 1, FADE_IN_RATE));
      }
    }
  }

  function forceSeed() {
    try {
      pv?.refreshSize?.({ snap: true });
    } catch {}
    rebuild();
    snapToBudget();
    return state.particles.length;
  }

function reconcileParticleCount(dt = 1 / 60, immediate = false) {
   const minParticles = Number.isFinite(state.minParticles) ? Math.max(0, Math.round(state.minParticles)) : MIN_PARTICLES;
   let desired = Math.max(minParticles, Math.round(state.targetDesired || 0));
   if (state.emergencyFade && minParticles === 0) desired = 0;
    // Gesture-based throttling removed (keeps updates consistent during pan/zoom).

    // Avoid per-tick allocations (filter/splice) in worst-case scenes.
    // "Active" means: either still targeted to be visible, or still visibly fading out.
    let active = 0;
    const parts = state.particles;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p) continue;
      const ft = (p.fadeTarget ?? 1);
      const f = (p.fade ?? 0);
      if (ft > 0 || f > 0.05) active++;
    }

    if (immediate && !state.particles.length) {
      const seedKey = `${config.seed}:${state.w}x${state.h}:init:${desired}`;
      const rng = makeRng(seedKey);
      while (state.particles.length < desired) {
        const x = rng() * state.w;
        const y = rng() * state.h;
        const a = rng();
        const rPx = particleRadiusPx(rng);
        state.particles.push(acquireParticle(x, y, x, y, a, rPx, 1, 1, FADE_IN_RATE));
      }
      return;
    }

    let adjustStep = Math.max(1, Math.round(ADJUST_PER_SEC * dt));
    if (state.emergencyFade) {
      const emergencyTarget = Math.ceil(active * Math.max(0.05, dt / Math.max(0.5, state.emergencyFadeSeconds || 5)));
      adjustStep = Math.max(adjustStep, emergencyTarget);
    }

    if (active < desired) {
      const need = desired - active;
      const toAdd = Math.min(need, adjustStep);
      const seedKey = `${config.seed}:${state.w}x${state.h}:grow:${state.particles.length}`;
      const rng = makeRng(seedKey);
      for (let i = 0; i < toAdd; i++) {
        const x = rng() * state.w;
        const y = rng() * state.h;
        const a = rng();
        const rPx = particleRadiusPx(rng);
        state.particles.push(acquireParticle(x, y, x, y, a, rPx, 0, 1, FADE_IN_RATE));
      }
    } else if (active > desired) {
      // In emergencyFade we want to shed particle count quickly (without lowering tick cadence).
      // Allow much larger fade-out batches when emergencyFade is active.
      const maxTrimFrac = state.emergencyFade ? 0.55 : MAX_FADE_OUT_FRACTION;
      const maxTrim = Math.max(MIN_FADE_STEP, Math.round(active * maxTrimFrac));
      const maxStep = state.emergencyFade ? 320 : MAX_FADE_OUT_STEP;
      const trimBudget = Math.min(adjustStep, maxStep, maxTrim, active - minParticles);
      const budget = Math.max(0, Math.min(trimBudget, parts.length));
      // Randomly sample particles to fade out without building candidate arrays.
      // We cap attempts to avoid pathological looping when most are already fading.
      let faded = 0;
      let attempts = 0;
      const maxAttempts = Math.max(12, Math.min(parts.length * 2, 6000));
      while (faded < budget && attempts < maxAttempts) {
        attempts++;
        const idx = (Math.random() * parts.length) | 0;
        const p = parts[idx];
        if (!p) continue;
        const ft = (p.fadeTarget ?? 1);
        if (ft <= 0) continue; // already fading / off
        p.fadeTarget = 0;
        if (state.emergencyFade) {
          const secs = Number.isFinite(state.emergencyFadeSeconds) ? state.emergencyFadeSeconds : 2.2;
          // Shorter emergency seconds => faster dissolve.
          const mul =
            secs <= 1.0 ? 7.0 :
            secs <= 1.3 ? 5.5 :
            secs <= 2.0 ? 3.5 :
            2.4;
          p.fadeRate = FADE_OUT_RATE * mul;
        } else {
          p.fadeRate = FADE_OUT_RATE;
        }
        faded++;
      }
    }
  }

  function updateFades(dt) {
    const len = state.particles.length;
    for (let i = 0; i < len; i++) {
      const p = state.particles[i];
      if (!p) continue;
      const target = Number.isFinite(p.fadeTarget) ? p.fadeTarget : 1;
      const rate = Number.isFinite(p.fadeRate) ? p.fadeRate : FADE_IN_RATE;
      if (!Number.isFinite(p.fade)) p.fade = target;
      const diff = target - p.fade;
      if (Math.abs(diff) < 1e-4) {
        p.fade = target;
        if (p._fadeReturn && target < 0.999) {
          p.fadeTarget = 1;
          p.fadeRate = FADE_IN_RATE * 0.75;
        } else if (p._fadeReturn && target >= 0.999) {
          p._fadeReturn = false;
        }
        continue;
      }
      const step = Math.sign(diff) * rate * dt;
      if (Math.abs(step) >= Math.abs(diff)) {
        p.fade = target;
      } else {
        p.fade += step;
      }
      if (p.fade < 0) p.fade = 0;
      if (p.fade > 1) p.fade = 1;
    }
  }

  function twinkle(dt) {
    if (!state.particles.length) return;
    const twinkleBudget = Math.max(1, Math.round(TWINKLE_PER_SEC * dt));
    for (let i = 0; i < twinkleBudget; i++) {
      const idx = Math.floor(Math.random() * state.particles.length);
      const p = state.particles[idx];
      if (!p || (p.fadeTarget ?? 1) === 0) continue;
      const next = TWINKLE_MIN + Math.random() * (TWINKLE_MAX - TWINKLE_MIN);
      p.fadeTarget = next;
      p.fadeRate = FADE_OUT_RATE * 0.5;
      p._fadeReturn = true;
    }
  }

  function cleanupFaded() {
    if (!state.particles.length) return;
    // Compact array in-place to avoid GC from creating new arrays
    let writeIdx = 0;
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      if (!p) continue;
      if ((p.fadeTarget ?? 1) === 0 && (p.fade ?? 0) <= 0.01) {
        // Release particle to pool before skipping
        releaseParticle(p);
        continue;
      }
      if (writeIdx !== i) {
        state.particles[writeIdx] = p;
      }
      writeIdx++;
    }
    if (writeIdx < state.particles.length) {
      state.particles.length = writeIdx;
    }
  }

  function poke(x, y, opts = {}) {
    const isPlow = opts && opts.mode === 'plow';
    if (!window.__PF_DIAG) window.__PF_DIAG = { count: 0 };
    window.__PF_DIAG.count++;
    const pokeTime = performance?.now?.() ?? Date.now();
    window.__PF_LAST_POKE__ = {
      x,
      y,
      r: Number.isFinite(opts.radius) ? opts.radius : NaN,
      s: Number.isFinite(opts.strength) ? opts.strength : NaN,
      t: pokeTime,
    };
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const radiusCss = Number.isFinite(opts.radius) ? opts.radius : 64;
    // Caller passes toy-relative radius; do not rescale here.
    const radius = Math.max(1, radiusCss);
    const strength = Number.isFinite(opts.strength) ? opts.strength : 28;
    const rim = isPlow ? (radius + Math.max(1, state.spacing * 0.15)) : radius;
    const highlightEnabled = opts.highlight !== false;
    const highlightRadius = Math.max(8, radius * 1.15);
    const highlightAmp = Math.max(
      0,
      Math.min(
        1,
        Number.isFinite(opts.highlightAmp) ? opts.highlightAmp : 0.8
      )
    );
    const highlightDur = Number.isFinite(opts.highlightDur)
      ? opts.highlightDur
      : Number.isFinite(opts.highlightMs)
      ? opts.highlightMs
      : PARTICLE_HIGHLIGHT_DURATION;
    const highlightTime = pokeTime;
    let highlightQueued = false;
    const enqueueHighlight = (cx, cy) => {
      if (!highlightEnabled || highlightQueued) return;
      highlightEvents.push({
        x: cx,
        y: cy,
        radius: highlightRadius,
        t: highlightTime,
        dur: highlightDur,
        amp: highlightAmp,
      });
      highlightQueued = true;
      if (highlightEvents.length > 32) {
        highlightEvents.shift();
      }
    };
    const radiusSq = radius * radius;
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      const dx = p.x - x;
      const dy = p.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq > radiusSq) continue;
      const dist = Math.sqrt(distSq) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      if (isPlow) {
        // 1) Snap to the rim (true snow-plow push)
        p.x = x + nx * rim;
        p.y = y + ny * rim;

        // 2) Small outward kick so it glides a touch then springs back
        const influence = 1 - Math.min(1, dist / radius);
        const falloff   = influence * influence * influence; // tight & local
        const kickScale = Math.max(0.25, normalizedKick(dist, state.spacing));
        const force     = strength * 0.35 * falloff * kickScale * (config.forceMul || 1.0);
        p.vx += nx * force;
        p.vy += ny * force;
        enqueueHighlight(p.x, p.y);
      } else {
        // Legacy local impulse
        const influence = 1 - Math.min(1, dist / radius);
        const falloff   = influence * influence * influence;
        const kickScale = Math.max(0.25, normalizedKick(dist, state.spacing));
        const force = strength * falloff * kickScale * (config.forceMul || 1.0);
        p.vx += nx * force;
        p.vy += ny * force;
        enqueueHighlight(p.x, p.y);
      }
    }
  }

  function pushDirectional(x, y, dirX, dirY, opts = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const radius = Math.max(1, Number.isFinite(opts.radius) ? opts.radius : 40);
    const strength = Number.isFinite(opts.strength) ? opts.strength : 1200;
    const falloffMode = opts.falloff === 'linear' ? 'linear' : 'gaussian';
    const highlightOn = !!opts.highlight;
    if (highlightOn) {
      const highlightRadius = Math.max(8, radius * 1.15);
      const highlightAmp = Math.max(
        0,
        Math.min(
          1,
          Number.isFinite(opts.highlightAmp) ? opts.highlightAmp : 0.8
        )
      );
      const highlightDur = Number.isFinite(opts.highlightDur)
        ? opts.highlightDur
        : Number.isFinite(opts.highlightMs)
        ? opts.highlightMs
        : PARTICLE_HIGHLIGHT_DURATION;
      const highlightTime = performance?.now?.() ?? Date.now();
      highlightEvents.push({
        x,
        y,
        radius: highlightRadius,
        t: highlightTime,
        dur: highlightDur,
        amp: highlightAmp,
      });
      if (highlightEvents.length > 32) {
        highlightEvents.shift();
      }
    }
    let ux = Number.isFinite(dirX) ? dirX : 0;
    let uy = Number.isFinite(dirY) ? dirY : 0;
    const len = Math.hypot(ux, uy);
    if (len > 1e-6) {
      ux /= len;
      uy /= len;
    } else {
      ux = 1;
      uy = 0;
    }
    const radiusSq = radius * radius;
    const particles = state.particles;
    const forceMul = Number.isFinite(opts.forceMul) ? opts.forceMul : (config.forceMul || 1);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const dx = p.x - x;
      const dy = p.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq > radiusSq) continue;
      const dist = Math.sqrt(distSq) || 0;
      let weight = 0;
      if (falloffMode === 'linear') {
        weight = Math.max(0, 1 - dist / radius);
      } else {
        const k = radius > 0 ? dist / radius : 0;
        weight = Math.exp(-4.5 * k * k);
      }
      if (weight <= 0) continue;
      const mass = Number.isFinite(p.mass) && p.mass > 0 ? p.mass : 1;
      const impulse = (strength * forceMul * weight) / mass;
      p.vx += ux * impulse;
      p.vy += uy * impulse;
    }
  }

  function setStyle(style = {}) {
    if (!style || typeof style !== 'object') return;
    if (style.fillStyle) config.fillStyle = style.fillStyle;
    if (style.strokeStyle) config.strokeStyle = style.strokeStyle;
    if (typeof style.drawMode === 'string') config.drawMode = style.drawMode;
    if (typeof style.sizePx === 'number') config.sizePx = style.sizePx;
    if (typeof style.minAlpha === 'number') config.minAlpha = style.minAlpha;
    if (typeof style.maxAlpha === 'number') config.maxAlpha = style.maxAlpha;
  }

  function destroy() {
    // Release all particles back to pool before clearing
    for (let i = 0; i < state.particles.length; i++) {
      releaseParticle(state.particles[i]);
    }
    state.particles.length = 0;
    // Also clear the pool
    state.particlePool.length = 0;
    ctx.clearRect(0, 0, state.w, state.h);
  }

  function resetHome() {
    state.pulseEnergy = 0;
    highlightEvents.length = 0;
    state.tickModuloCounter = 0;
    state.tickAccumDt = 0;
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      p.x = p.hx;
      p.y = p.hy;
      p.vx = 0;
      p.vy = 0;
      p.fade = 1;
      p.fadeTarget = 1;
      p.fadeRate = FADE_IN_RATE;
    }
    draw();
  }

  resize();
  fieldLog('[FIELD][init]', {
    id: fieldLabel,
    widthPx: state.w,
    heightPx: state.h,
    config,
  });

  // Bootstrap: on a brand-new scene/panel the canvas can report a tiny/zero CSS size
  // for a frame (layout not settled yet). If we lock in that size, desired particle
  // count can compute to ~0 and the field appears "empty" until a manual refresh or
  // later interaction forces a resize.
  //
  // We schedule a couple of deferred resizes and then snap to budget so visuals
  // start at the best quality the machine can afford.
  try {
    const bootstrapTries = Number.isFinite(window.__FG_BOOTSTRAP_TRIES)
      ? Math.max(0, Math.round(window.__FG_BOOTSTRAP_TRIES))
      : 2;
    let triesLeft = bootstrapTries;
    const bootstrapOnce = () => {
      try {
        if (!canvas || !canvas.isConnected) return;
        // Pull the latest CSS size into the cache, then run our normal resize path.
        updateSizeCache();
        resize();
        // If we were initialized before layout settled, ensure we actually populate.
        if ((state.w > 2 && state.h > 2) && (!state.particles || state.particles.length === 0)) {
          try { snapToBudget(); } catch {}
          try { draw(); } catch {}
        }
      } catch {}
    };
    const raf = (fn) => (typeof requestAnimationFrame === 'function')
      ? requestAnimationFrame(fn)
      : setTimeout(fn, 16);
    const run = () => {
      bootstrapOnce();
      triesLeft -= 1;
      if (triesLeft > 0) raf(run);
    };
    if (bootstrapTries > 0) raf(run);
  } catch {}

  function setClipRect(rect) {
    if (!rect || !Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rect.w) || !Number.isFinite(rect.h) || rect.w <= 0 || rect.h <= 0) {
      if (state.clipRect) {
        state.clipRect = null;
        state.clipDirty = true;
      }
      return;
    }
    const next = {
      x: Math.max(0, Math.round(rect.x)),
      y: Math.max(0, Math.round(rect.y)),
      w: Math.max(0, Math.round(rect.w)),
      h: Math.max(0, Math.round(rect.h)),
    };
    const prev = state.clipRect;
    if (!prev || prev.x !== next.x || prev.y !== next.y || prev.w !== next.w || prev.h !== next.h) {
      state.clipRect = next;
      state.clipDirty = true;
    }
  }

  return {
    tick,
    pulse,
    resize,
    destroy,
    poke,
    pushDirectional,
    setStyle,
    applyBudget,
    setClipRect,
    resetHome,
    forceSeed,
    canvas,
    _state: state,
    _config: config,
    // expose static flag for diagnostics
    _static: STATIC_MODE,
  };
}
