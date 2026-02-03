// src/drawgrid/dg-dpr.js
// DrawGrid DPR/backing-store policy helpers.
import { getAutoQualityScale } from '../perf/AutoQualityController.js';

// -----------------------------------------------------------------------------
// Visual backing-store DPR reduction when visually small (generic, not gesture)
// -----------------------------------------------------------------------------
window.__DG_VISUAL_DPR_ZOOM_THRESHOLD ??= 0.9;   // below this, start reducing DPR
window.__DG_VISUAL_DPR_MIN_MUL        ??= 0.5;   // lowest visual multiplier
window.__DG_MIN_PANEL_DPR             ??= 0.5;   // absolute floor for backing DPR

// Zoom-commit DPR policy (Option C):
// Avoid visible "snap" at the end of zoom/pan by only changing backing-store DPR
// when it's a meaningful change OR when zoomed far enough out to justify it.
window.__DG_ZOOM_COMMIT_DPR_MIN_DELTA     ??= 0.18; // minimum DPR change to apply at commit
window.__DG_ZOOM_COMMIT_SCALE_THRESHOLD  ??= 0.8;  // if commitScale <= this, always allow DPR change

// Adaptive DPR (idle-time backing-store DPR changes)
// This can cause visible "late snaps" (layers appear to jump after zoom/pan settles),
// because it changes paintDpr while the camera is idle.
// Default OFF; we can re-enable later once it's hysteresis-stable and visually safe.
window.__DG_ADAPTIVE_DPR_ENABLED      ??= true;
// If adaptive DPR is enabled, do we allow it to run even when only a single DrawGrid is visible?
// (Useful for PerfLab focus runs, but usually want OFF for normal play.)
window.__DG_ADAPTIVE_DPR_ALLOW_SINGLE ??= false;

// Size-trace logging (DPR / canvas resize churn). Keep console OFF by default.
// PerfLab can enable __DG_REFRESH_SIZE_TRACE to collect to the perf buffer without spamming devtools.
window.__DG_REFRESH_SIZE_TRACE_TO_CONSOLE ??= false;
window.__DG_GESTURE_VISUAL_DPR_MUL ??= 0.85;
// Static layers (grid/nodes/base) can be reduced further during active gesture.
// These are visually stable and safe to blur temporarily.
// Tunable:
//   window.__DG_GESTURE_STATIC_DPR_MUL (default 0.7)
window.__DG_GESTURE_STATIC_DPR_MUL ??= 0.7;

export function __dgComputeVisualBackingMul(boardScale) {
  const threshold = window.__DG_VISUAL_DPR_ZOOM_THRESHOLD;
  const minMul    = window.__DG_VISUAL_DPR_MIN_MUL;

  if (!boardScale || boardScale >= threshold) return 1;

  // Smooth linear falloff from threshold -> 0
  const t = Math.max(0, Math.min(1, boardScale / threshold));
  return minMul + (1 - minMul) * t;
}

// During active zoom/pan gestures, we can temporarily reduce backing-store DPR
// to lower raster/compositor pressure without affecting layout.
// This is intentionally subtle and only applies while gesture motion is active.
//
// Tunable (defaults are conservative):
//   window.__DG_GESTURE_VISUAL_DPR_MUL = 0.85
export function __dgComputeGestureBackingMul(isGestureMoving) {
  try {
    if (!isGestureMoving) return 1;
    const mul = (typeof window !== 'undefined' && Number.isFinite(window.__DG_GESTURE_VISUAL_DPR_MUL))
      ? window.__DG_GESTURE_VISUAL_DPR_MUL
      : 0.85;
    return Math.max(0.35, Math.min(1, mul));
  } catch {
    return 1;
  }
}

export function __dgComputeGestureStaticMul(isGestureMoving) {
  try {
    if (!isGestureMoving) return 1;
    const mul = (typeof window !== 'undefined' && Number.isFinite(window.__DG_GESTURE_STATIC_DPR_MUL))
      ? window.__DG_GESTURE_STATIC_DPR_MUL
      : 0.7;
    return Math.max(0.35, Math.min(1, mul));
  } catch {
    return 1;
  }
}

// -----------------------------------------------------------------------------
// Size-based backing-store DPR reduction for very small panels
// -----------------------------------------------------------------------------
// When a toy is physically small on screen, backing-store resolution can be
// reduced without visible quality loss. This targets raster/compositor cost.
//
// Tunables (optional):
//   window.__DG_SMALL_PANEL_PX_THRESHOLD  (default 260k CSS px)
//   window.__DG_SMALL_PANEL_MIN_MUL       (default 0.6)
//
// Example:
//   threshold=260k: a 400x400 panel (160k px) gets a multiplier ~0.846.
window.__DG_SMALL_PANEL_PX_THRESHOLD ??= 260_000;
window.__DG_SMALL_PANEL_MIN_MUL      ??= 0.5;

export function __dgComputeSmallPanelBackingMul(cssW, cssH) {
  const w = Number.isFinite(cssW) ? cssW : 0;
  const h = Number.isFinite(cssH) ? cssH : 0;
  if (w <= 0 || h <= 0) return 1;

  const area = w * h;
  const threshold = Number(window.__DG_SMALL_PANEL_PX_THRESHOLD) || 260_000;
  const minMul = Number(window.__DG_SMALL_PANEL_MIN_MUL) || 0.6;

  if (!Number.isFinite(threshold) || threshold <= 10_000) return 1;
  if (!Number.isFinite(minMul) || minMul <= 0 || minMul > 1) return 1;

  if (area >= threshold) return 1;
  const t = Math.max(0, Math.min(1, area / threshold));
  return minMul + (1 - minMul) * t;
}

// -----------------------------------------------------------------------------
// Pressure-based backing-store DPR reduction (generic, not "gesture mode")
// -----------------------------------------------------------------------------
//
// Goal: when overall framerate is low (for any reason), reduce backing-store DPR
// smoothly to cut raster/compositor cost. This applies regardless of gesture.
//
// Tunables:
//   window.__DG_PRESSURE_DPR_ENABLED     (default true)
//   window.__DG_PRESSURE_DPR_START_MS    (default 20)  // start reducing above this
//   window.__DG_PRESSURE_DPR_END_MS      (default 34)  // hit min at/above this
//   window.__DG_PRESSURE_DPR_MIN_MUL     (default 0.6) // lowest multiplier from pressure
//   window.__DG_PRESSURE_DPR_EWMA_ALPHA  (default 0.12)
//   window.__DG_PRESSURE_DPR_COOLDOWN_MS (default 350) // delay recover to avoid thrash
//
window.__DG_PRESSURE_DPR_ENABLED     ??= true;
window.__DG_PRESSURE_DPR_START_MS    ??= 20;
window.__DG_PRESSURE_DPR_END_MS      ??= 34;
window.__DG_PRESSURE_DPR_MIN_MUL     ??= 0.5;
window.__DG_PRESSURE_DPR_EWMA_ALPHA  ??= 0.12;
window.__DG_PRESSURE_DPR_COOLDOWN_MS ??= 350;

// -----------------------------------------------------------------------------
// AutoQualityController integration (Quality Lab + adaptive quality scale)
// -----------------------------------------------------------------------------
// When enabled, DrawGrid's backing-store DPR participates in the global
// auto-quality signal (window.__AUTO_QUALITY_EFFECTIVE) driven by
// AutoQualityController + Quality Lab.
window.__DG_USE_AUTO_QUALITY ??= true;

export function __dgGetAutoQualityMul() {
  try {
    if (!(window.__DG_USE_AUTO_QUALITY ?? true)) return 1;
    const v = getAutoQualityScale?.();
    if (!Number.isFinite(v) || v <= 0) return 1;
    return Math.max(0.25, Math.min(1.0, v));
  } catch {
    return 1;
  }
}

// -----------------------------------------------------------------------------
// Overlay-first pressure DPR (aggressive on transient layers)
// -----------------------------------------------------------------------------
// Overlays (flash/ghost/tutorial/playhead) are alpha-heavy and the biggest
// compositor/raster cost in focus runs. We bias pressure-DPR to reduce their
// backing-store resolution earlier and more aggressively than static layers.
//
// Tunables:
//   window.__DG_OVERLAY_PRESSURE_DPR_MIN_MUL   (default 0.45)
//   window.__DG_OVERLAY_PRESSURE_DPR_BIAS      (default 0.85)
//   window.__DG_OVERLAY_DPR_QUANT_PX           (default 32)   // backing-size bucketing
//
window.__DG_OVERLAY_PRESSURE_DPR_MIN_MUL ??= 0.45;
window.__DG_OVERLAY_PRESSURE_DPR_BIAS    ??= 0.85;
window.__DG_OVERLAY_DPR_QUANT_PX         ??= 32;

let __dgPressureFrameMsEwma = null;
let __dgPressureDprMul = 1;
let __dgPressureMulLastChangeTs = 0;

function __dgComputePressureDprMul(frameMs) {
  const startMs = Number.isFinite(window.__DG_PRESSURE_DPR_START_MS) ? window.__DG_PRESSURE_DPR_START_MS : 20;
  const endMs   = Number.isFinite(window.__DG_PRESSURE_DPR_END_MS) ? window.__DG_PRESSURE_DPR_END_MS : 34;
  const minMul  = Number.isFinite(window.__DG_PRESSURE_DPR_MIN_MUL) ? window.__DG_PRESSURE_DPR_MIN_MUL : 0.6;

  if (!Number.isFinite(frameMs) || frameMs <= startMs) return 1;
  if (frameMs >= endMs) return minMul;

  // Smooth linear ramp from 1.0 -> minMul between startMs and endMs.
  const t = Math.max(0, Math.min(1, (frameMs - startMs) / Math.max(1e-6, (endMs - startMs))));
  return 1 - (1 - minMul) * t;
}

export function __dgUpdatePressureDprMulFromFps(fps, nowTs) {
  if (!(window.__DG_PRESSURE_DPR_ENABLED ?? true)) {
    __dgPressureFrameMsEwma = null;
    __dgPressureDprMul = 1;
    return;
  }
  if (!Number.isFinite(fps) || fps <= 0) return;

  const frameMs = 1000 / fps;
  const alpha = Number.isFinite(window.__DG_PRESSURE_DPR_EWMA_ALPHA) ? window.__DG_PRESSURE_DPR_EWMA_ALPHA : 0.12;
  __dgPressureFrameMsEwma = (__dgPressureFrameMsEwma == null)
    ? frameMs
    : (__dgPressureFrameMsEwma * (1 - alpha) + frameMs * alpha);

  const targetMul = __dgComputePressureDprMul(__dgPressureFrameMsEwma);
  const cooldown = Number.isFinite(window.__DG_PRESSURE_DPR_COOLDOWN_MS) ? window.__DG_PRESSURE_DPR_COOLDOWN_MS : 350;

  // Hysteresis:
  // - degrade quickly when things get worse
  // - recover slowly (cooldown) to avoid DPR thrash
  const cur = __dgPressureDprMul;
  if (targetMul < (cur - 0.02)) {
    __dgPressureDprMul = targetMul;
    __dgPressureMulLastChangeTs = nowTs;
  } else if (targetMul > (cur + 0.02)) {
    if (!__dgPressureMulLastChangeTs || (nowTs - __dgPressureMulLastChangeTs) >= cooldown) {
      __dgPressureDprMul = targetMul;
      __dgPressureMulLastChangeTs = nowTs;
    }
  }
}

export function __dgGetPressureDprMul() {
  return __dgPressureDprMul;
}

export function __dgComputeAdaptivePaintDpr({ boardScale = 1, isFocused = false, isZoomed = false }) {
  if (isFocused || isZoomed) return null;
  let cap = null;
  // IMPORTANT: do not key DPR caps off visible panel count (device-dependent).
  // We can still cap when visually small (zoomed out), and rely on pressure-DPR (FPS-based)
  // for machine-specific scaling.
  if (boardScale <= 0.35) {
    cap = 1.0;
  } else if (boardScale <= 0.45) {
    cap = 1.25;
  } else if (boardScale <= 0.6) {
    cap = 1.5;
  }
  return cap;
}

// Size-based DPR cap:
// Prevents massive backing stores when a panel is physically large on screen.
// This stacks *on top of* adaptive DPR and device DPR.
//
// Tunables (optional):
//   window.__DG_MAX_PANEL_BACKING_PX  (default 2.2M pixels)
//   window.__DG_MAX_PANEL_SIDE_PX    (default 2600 px)
export function __dgCapDprForBackingStore(cssW = 0, cssH = 0, desiredDpr = 1, prevDpr = null) {
  const w = Number.isFinite(cssW) ? cssW : 0;
  const h = Number.isFinite(cssH) ? cssH : 0;
  let dpr = Number.isFinite(desiredDpr) ? desiredDpr : 1;
  const minDpr = (typeof window !== 'undefined' && window.__DG_MIN_PANEL_DPR !== undefined)
    ? window.__DG_MIN_PANEL_DPR
    : 0.6;
  if (w <= 0 || h <= 0) return Math.max(minDpr, dpr);

  // Pixel budget cap (area-based).
  let maxPx = 2_200_000; // default pixel budget for backing store
  try {
    const v = (typeof window !== 'undefined') ? Number(window.__DG_MAX_PANEL_BACKING_PX) : NaN;
    if (Number.isFinite(v) && v > 200_000) maxPx = v;
  } catch {}
  const capFromPx = Math.sqrt(maxPx / (w * h));

  // Side cap (dimension-based) to avoid huge single-axis backing stores.
  let maxSide = 2600;
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
