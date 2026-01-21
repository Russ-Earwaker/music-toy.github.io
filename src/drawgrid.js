// src/drawgrid.js
// Minimal, scoped Drawing Grid -- 16x12, draw strokes, build snapped nodes on release.
// Strictly confined to the provided panel element.
import { buildPalette, midiToName } from './note-helpers.js';
import { drawBlock } from './toyhelpers.js';
import { getLoopInfo, isRunning } from './audio-core.js';
import { onZoomChange, getZoomState, getFrameStartState, onFrameStart, namedZoomListener } from './zoom/ZoomCoordinator.js';
import { createParticleViewport } from './particles/particle-viewport.js';
import { createField } from './particles/field-generic.js';
import { getParticleBudget, getAdaptiveFrameBudget, getParticleCap } from './particles/ParticleQuality.js';
import { overviewMode } from './overview-mode.js';
import { boardScale as boardScaleHelper } from './board-scale-helpers.js';
import { beginFrameLayoutCache, getRect } from './layout-cache.js';
import { makeDebugLogger } from './debug-flags.js';
import { startSection } from './perf-meter.js';
import { traceCanvasResize } from './perf/PerfTrace.js';
import {
  fillGapsInNodeArray,
  findChainHead,
  chainHasSequencedNotes,
  normalizeMapColumns,
} from './drawgrid/dg-chain-utils.js';
import {
  __dgIsGesturing,
  getGlobalAdaptiveState,
  __dgAdaptiveTickMs,
  updateAdaptiveShared,
  startAdaptiveSharedTicker,
  __dgZoomScale,
  globalDrawgridState,
} from './drawgrid/dg-adaptive.js';
import {
  HeaderSweepForce,
  createDGTuning,
  dbgPoke,
  __dgLogFirstPoke,
} from './drawgrid/dg-tuning.js';
import {
  createDrawLabelOverlay,
  updateDrawLabelLayout,
  destroyDrawLabelOverlay,
} from './drawgrid/dg-dom-label.js';
import { installGeneratorButtons } from './drawgrid/dg-generators-ui.js';
import { createActiveCanvasHelpers } from './drawgrid/dg-canvas-active.js';
import { createDgPaintBuffers } from './drawgrid/dg-paint-buffers.js';
import { createDgPlayheadSprites } from './drawgrid/dg-playhead-sprites.js';
import {
  createDgPersist,
  computeCurrentMapNodeStats,
  computeSerializedNodeStats,
} from './drawgrid/dg-persist.js';
import { createDgRenderUtils } from './drawgrid/dg-render-utils.js';
import { createDgFlowTrace } from './drawgrid/dg-flow-trace.js';
import { createDgFlowDebug } from './drawgrid/dg-flow-debug.js';
import { createDgHydrationHelpers } from './drawgrid/dg-hydration-helpers.js';
import { createDgParticles } from './drawgrid/dg-particles.js';
import { createDgFieldForces } from './drawgrid/dg-field-forces.js';
import { createDgRandomizers } from './drawgrid/dg-randomizers.js';
import { requestPanelPulse } from './pulse-border.js';
import { queueClassToggle, markPanelForDomCommit } from './dom-commit.js';
import {
  DRAWGRID_ENABLE_PARTICLE_FIELD,
  DG_ALPHA_DEBUG,
  DG_ALPHA_SPAM_MS,
  DG_DEBUG,
  DG_FRAME_DEBUG,
  DG_GHOST_DEBUG,
  DG_LAYOUT_DEBUG,
  DG_SWAP_DEBUG,
  DG_TRACE_DEBUG,
  DG,
  DBG_DRAW,
  DG_CLEAR_DEBUG,
  DG_INK_DEBUG,
  createDGDebugHelpers,
  dbg,
  dbgCounters,
  dgAlphaState,
  dgLogLine,
  dgTraceLog,
  dgTraceWarn,
  dglog,
  dgf,
  dgs,
} from './drawgrid/dg-debug.js';

const drawgridLog = makeDebugLogger('mt_debug_logs', 'log');

const gridAreaLogical = { w: 0, h: 0 };

// Lightweight profiling for drawGrid; flip to true when testing.
const DG_PROFILE = false;
// Turn on to log slow drawgrid frames (full rAF body).
const DG_FRAME_PROFILE = false;
const DG_FRAME_SLOW_THRESHOLD_MS = 10;
// (moved into createDrawGrid - per-instance)
// Overlay compositor mode (module-scope so helper functions can read it safely).
const DG_SINGLE_CANVAS_OVERLAYS = (() => {
  try {
    if (typeof window !== 'undefined' && window.__DG_SINGLE_CANVAS_OVERLAYS !== undefined) {
      return !!window.__DG_SINGLE_CANVAS_OVERLAYS;
    }
  } catch {}
  return true;
})();
try { if (typeof window !== 'undefined') window.__DG_SINGLE_CANVAS_OVERLAYS = DG_SINGLE_CANVAS_OVERLAYS; } catch {}

try { startAdaptiveSharedTicker(); } catch {}

// --- Performance / LOD tuning ----------------------------------------

// Below this FPS we start aggressively disabling the fancy background field.
// Hysteresis means we only re-enable once FPS climbs comfortably above.
const DG_MIN_FPS_FOR_PARTICLE_FIELD = 32;  // degrade if we live below this
const DG_FPS_PARTICLE_HYSTERESIS_UP = 38;  // re-enable once we're above this
const DG_PLAYHEAD_FPS_SIMPLE_ENTER = 28;
const DG_PLAYHEAD_FPS_SIMPLE_EXIT = 34;

// IntersectionObserver visibility threshold - panels with <5% on-screen area
// are treated as "offscreen" and have their heavy work culled.
const DG_VISIBILITY_THRESHOLD = 0.05;

let dgProfileFrames = 0;
let dgProfileSumMs = 0;
let dgProfileMinMs = Infinity;
let dgProfileMaxMs = 0;

if (typeof window !== 'undefined' && typeof window.DG_ZOOM_AUDIT === 'undefined') {
  window.DG_ZOOM_AUDIT = false;
}

// -----------------------------------------------------------------------------
// Visual backing-store DPR reduction when visually small (generic, not gesture)
// -----------------------------------------------------------------------------

window.__DG_VISUAL_DPR_ZOOM_THRESHOLD ??= 0.9;   // below this, start reducing DPR
window.__DG_VISUAL_DPR_MIN_MUL        ??= 0.6;   // lowest visual multiplier
window.__DG_MIN_PANEL_DPR             ??= 0.6;   // absolute floor for backing DPR

function __dgComputeVisualBackingMul(boardScale) {
  const threshold = window.__DG_VISUAL_DPR_ZOOM_THRESHOLD;
  const minMul    = window.__DG_VISUAL_DPR_MIN_MUL;

  if (!boardScale || boardScale >= threshold) return 1;

  // Smooth linear falloff from threshold → 0
  const t = Math.max(0, Math.min(1, boardScale / threshold));
  return minMul + (1 - minMul) * t;
}

// -----------------------------------------------------------------------------
// Pressure-based backing-store DPR reduction (generic, not “gesture mode”)
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
window.__DG_PRESSURE_DPR_MIN_MUL     ??= 0.6;
window.__DG_PRESSURE_DPR_EWMA_ALPHA  ??= 0.12;
window.__DG_PRESSURE_DPR_COOLDOWN_MS ??= 350;

let __dgPressureFrameMsEwma = null;
let __dgPressureDprMul = 1;
let __dgPressureMulLastChangeTs = 0;

function __dgComputePressureDprMul(frameMs) {
  const startMs = Number.isFinite(window.__DG_PRESSURE_DPR_START_MS) ? window.__DG_PRESSURE_DPR_START_MS : 20;
  const endMs   = Number.isFinite(window.__DG_PRESSURE_DPR_END_MS) ? window.__DG_PRESSURE_DPR_END_MS : 34;
  const minMul  = Number.isFinite(window.__DG_PRESSURE_DPR_MIN_MUL) ? window.__DG_PRESSURE_DPR_MIN_MUL : 0.6;

  if (!Number.isFinite(frameMs) || frameMs <= startMs) return 1;
  if (frameMs >= endMs) return minMul;

  // Smooth linear ramp from 1.0 → minMul between startMs and endMs.
  const t = Math.max(0, Math.min(1, (frameMs - startMs) / Math.max(1e-6, (endMs - startMs))));
  return 1 - (1 - minMul) * t;
}

function __dgUpdatePressureDprMulFromFps(fps, nowTs) {
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

// === DRAWGRID TUNING (single source of truth) ===
const {
  ghostRadiusToy,
  headerRadiusToy,
  DG_KNOCK,
} = createDGTuning(gridAreaLogical);

const { dgGridAlphaLog, dgDumpCanvasMetrics, emitDG } = createDGDebugHelpers({
  boardScaleHelper,
  getPanel: () => {
    try { return (typeof panel !== 'undefined') ? panel : null; } catch { return null; }
  },
  getUsingBackBuffers: () => {
    try { return (typeof usingBackBuffers !== 'undefined') ? usingBackBuffers : null; } catch { return null; }
  },
  getDGSingleCanvas: () => {
    try { return (typeof DG_SINGLE_CANVAS !== 'undefined') && DG_SINGLE_CANVAS; } catch { return false; }
  },
  getPaintDpr: () => {
    try { return (typeof paintDpr !== 'undefined') ? paintDpr : null; } catch { return null; }
  },
  getCssW: () => {
    try { return (typeof cssW !== 'undefined') ? cssW : null; } catch { return null; }
  },
  getCssH: () => {
    try { return (typeof cssH !== 'undefined') ? cssH : null; } catch { return null; }
  },
});

const STROKE_COLORS = [
  'rgba(95,179,255,0.95)',  // Blue
  'rgba(255,95,179,0.95)',  // Pink
  'rgba(95,255,179,0.95)',  // Green
  'rgba(255,220,95,0.95)', // Yellow
];

// Opacity for decorative/visual-only strokes
const VISUAL_ONLY_ALPHA = 0.35; // decorative lines (non-generator)
const SECONDARY_ALPHA   = 0.6; // reserved for future use (e.g. alt styles)

/**
 * Visual-only strokes:
 * - do NOT generate nodes (no isSpecial, no generatorId)
 * - are not overlay colorize passes
 */
function isVisualOnlyStroke(s) {
  return !s?.isSpecial && !s?.generatorId && !s?.overlayColorize;
}

/**
 * Compute alpha for a stroke path.
 * - All generator/special lines (Line 1, Line 2, …) stay fully opaque.
 * - Visual-only strokes are semi-transparent, both on paint and overlay.
 * - Demoted overlay passes (overlayColorize) stay more subtle on overlay.
 */
function getPathAlpha({ isOverlay, wantsSpecial, isVisualOnly, generatorId }) {
  // Any special/generator line stays fully opaque (Line 1, Line 2, etc.)
  if (wantsSpecial) return 1;

  // Decorative / visual-only strokes are semi-transparent
  if (isVisualOnly) return VISUAL_ONLY_ALPHA;

  // Non-special but not decorative (e.g., overlay colorize passes)
  return isOverlay ? VISUAL_ONLY_ALPHA : 1;
}

let colorIndex = 0;

function createViewportBridgeDG(hostEl) {
  return {
    getZoom: () => {
      try {
        const raw = boardScaleHelper(hostEl);
        const value = Number(raw);
        if (Number.isFinite(value) && value > 0) return value;
      } catch {}
      return 1;
    },
    isOverview: () => {
      try {
        return !!overviewMode?.isActive?.();
      } catch {
        return false;
      }
    },
  };
}

let usingBackBuffers = false;
let __dgDrawingActive = false;
let paintDpr = __dgCapDprForBackingStore(
  0,
  0,
  Math.max(1, Math.min((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1, 3)),
  null
);

let cssW = 0, cssH = 0, cw = 0, ch = 0, topPad = 0;
let layoutSizeDirty = true;

// Playhead sprite caching + idle warming (extracted)
const __dgPlayhead = createDgPlayheadSprites({
  isGesturing: () => __dgIsGesturing(),
  getVisibleCount: () => Number.isFinite(globalDrawgridState?.visibleCount) ? globalDrawgridState.visibleCount : 0,
  getFps: () => (Number.isFinite(window.__MT_FPS) ? window.__MT_FPS :
    (Number.isFinite(window.__MT_SM_FPS) ? window.__MT_SM_FPS : 60)),
});

const pickPlayheadHue = __dgPlayhead.pickPlayheadHue;
const getPlayheadBandSprite = __dgPlayhead.getPlayheadBandSprite;
const getPlayheadLineSprite = __dgPlayhead.getPlayheadLineSprite;
const getPlayheadCompositeSprite = __dgPlayhead.getPlayheadCompositeSprite;
const __dgIdleCallback = __dgPlayhead.idleCallback;

// --- Commit/settle gating for overlay clears ---
let __dgDeferUntilTs = 0;
let __dgBypassCommitUntil = 0;
let __dgNeedsUIRefresh = false;
let __dgForceFullDrawUntil = 0;
let __dgForceFullDrawNext = false;
let __dgForceFullDrawFrames = 0;
let __dgForceOverlayClearNext = false;
let __dgForceSwapNext = false;
let __dgPostReleaseRaf = 0;
let __dgPostReleaseRaf2 = 0;
let __hydrationJustApplied = false;
let __dgLayoutStableFrames = 0;
let __dgLastLayoutKey = '';
let __dgHydrationPendingRedraw = false;
let __dgAdaptivePaintDpr = null;
let __dgAdaptivePaintLastTs = 0;
// Per-panel (multi-instance safe) dirty helpers.
// We store the actual dirty flags on the panel object so multiple draw toys don't fight.
let __dgProbeDidFirstDraw = false;
try {
  if (typeof window !== 'undefined' && window.__DG_PROBE_ON === undefined) {
    window.__DG_PROBE_ON = false;
  }
} catch {}
let __dgLayerDebugLastTs = 0;
let __dgRegenSource = '';
let __dgLayerTraceLastTs = 0;
let __dgSampleCanvas = null;
let __dgSampleCtx = null;
let __dgStableFramesAfterCommit = 0;

function __dgComputeAdaptivePaintDpr({ boardScale = 1, visiblePanels = 0, isFocused = false, isZoomed = false }) {
  if (isFocused || isZoomed) return null;
  let cap = null;
  if (boardScale <= 0.35 && visiblePanels >= 16) {
    cap = 1.0;
  } else if (boardScale <= 0.45 && visiblePanels >= 12) {
    cap = 1.25;
  } else if (boardScale <= 0.6 && visiblePanels >= 8) {
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
function __dgCapDprForBackingStore(cssW = 0, cssH = 0, desiredDpr = 1, prevDpr = null) {
  const w = Number.isFinite(cssW) ? cssW : 0;
  const h = Number.isFinite(cssH) ? cssH : 0;
  let dpr = Number.isFinite(desiredDpr) ? desiredDpr : 1;
  const minDpr = (typeof window !== 'undefined' && window.__DG_MIN_PANEL_DPR !== undefined)
    ? window.__DG_MIN_PANEL_DPR
    : 0.6;
  if (w <= 0 || h <= 0) return Math.max(minDpr, dpr);

  // Pixel budget cap (area-based).
  let maxPx = 2_200_000; // ~1483x1483 backing store at 1.0 DPR
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
    // Ramp UP slowly (prevents oscillation when hovering near a threshold).
    if (capped > prev && (capped - prev) < 0.12) return prev;
    // Don't flap DOWN on tiny deltas either.
    if (capped < prev && (prev - capped) < 0.06) return prev;
  }
  return capped;
}

/**
 * For a sparse array of nodes, fills in the empty columns by interpolating
 * and extrapolating from the existing nodes to create a continuous line.
 * @param {Array<Set<number>>} nodes - The sparse array of node rows.
 * @param {number} numCols - The total number of columns in the grid.
 * @returns {Array<Set<number>>} A new array with all columns filled.
 */
export function createDrawGrid(panel, { cols: initialCols = 8, rows = 12, toyId, bpm = 120 } = {}) {
  // Per-instance state (WAS module-level; moving fixes cross-toy leakage)
  let currentMap = null;                // { active:boolean[], nodes:Set[], disabled:Set[] }
  let usingBackBuffers = false;
  // Cached layout size to avoid forced reflow from offsetWidth/clientWidth during rAF.
  // Updated by ResizeObserver; used by measureCSSSize(wrap).
  let __dgLayoutW = 0;
  let __dgLayoutH = 0;
  let __dgLayoutObs = null;
  // Per-instance (was module-level; caused cross-toy size/throttle leakage)
  let __dgFrameIdx = 0;
  let __dgLastResizeTargetW = 0;
  let __dgLastResizeTargetH = 0;
  let __dgLastResizeDpr = 0;
  let __dgCommitResizeCount = 0;
  let currentCols = 0;
  let nodeCoordsForHitTest = [];        // For draggable nodes (hit tests, drags)
  let dgViewport = null;
  let dgMap = null;
  let dgField = null;
  let backCtx = null;
  let headerSweepDirX = 1;
  const hydrationState = { retryRaf: 0, retryCount: 0 };
  const particleState = { field: null };
  if (DG_DEBUG) console.log('[DG] instance sizing locals init', panel.id, {
    __dgLastResizeTargetW, __dgLastResizeTargetH, __dgLastResizeDpr
  });
  // Visibility + LOD state
  let isPanelVisible = true;          // IntersectionObserver will keep this updated
  let particleFieldEnabled = true;    // driven by FPS + zoom with hysteresis
  let particleCanvasVisible = true;
  let pendingResnapOnVisible = false;
  let lastResnapTs = 0;
  let countedVisible = false;
  const updateGlobalVisibility = (visible) => {
    const next = !!visible;
    if (next && !countedVisible) {
      countedVisible = true;
      globalDrawgridState.visibleCount = Math.max(0, (globalDrawgridState.visibleCount || 0) + 1);
    } else if (!next && countedVisible) {
      countedVisible = false;
      globalDrawgridState.visibleCount = Math.max(0, (globalDrawgridState.visibleCount || 0) - 1);
    }
  };
  updateGlobalVisibility(isPanelVisible);

  // DEBUG: prove these are per-instance
  dgTraceLog('[drawgrid] instance-state', panel.id, { scope: 'per-instance' });
  // The init script now guarantees the panel is a valid HTMLElement with the correct dataset.
  // The .toy-body is now guaranteed to exist by initToyUI, which runs first.
  const body = panel.querySelector('.toy-body');
  const drawToyBg = '#000413ff';

  if (!body) {
    return;
  }
  body.style.position = 'relative';
  if (body.style) {
    body.style.background = drawToyBg;
  }
  if (panel?.style) {
    panel.style.background = drawToyBg;
    panel.style.backgroundColor = drawToyBg;
  }

  const resolvedToyId = toyId || panel.id || panel.dataset.toyid || panel.dataset.toyid || panel.dataset.toyName || 'drawgrid';
  const storageKey = resolvedToyId ? `drawgrid:saved:${resolvedToyId}` : null;
  // --- DEBUG: verify unique key per panel
  if (DG_TRACE_DEBUG) {
    if (DG_DEBUG) {
      console.log('[drawgrid] init', { panelId: panel.id, resolvedToyId, storageKey });
      console.log('[drawgrid][storage-key]', { panelId: panel.id, storageKey });
    }
  }
  // Expose a safe way for persistence.js to inspect our saved state on demand.
  function __loadPersistedStateRaw() {
    // Block legacy global key patterns to avoid cross-panel contamination
    try {
      if (storageKey && storageKey.endsWith(':drawgrid') && panel.id !== 'drawgrid') {
        if (DG_DEBUG) console.warn('[drawgrid] ignoring legacy global key for', panel.id, storageKey);
        return null;
      }
    } catch {}
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const state = parsed?.state || parsed;
      return (state && typeof state === 'object') ? state : null;
    } catch {
      return null;
    }
  }
  try { panel.__getDrawgridPersistedState = __loadPersistedStateRaw; } catch {}
  const dgPersist = createDgPersist({
    panel,
    storageKey,
    dgTraceLog,
    DG_DEBUG,
    DG_TRACE_DEBUG,
    captureState,
    getStrokes: () => strokes,
    getCurrentMap: () => currentMap,
    warn: (...args) => {
      try {
        if (DG && typeof DG.warn === 'function') {
          DG.warn(...args);
          return;
        }
      } catch {}
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn(...args);
      }
    },
  });
  const {
    dgNow,
    getHydrateState,
    getFallbackHydrationState,
    inboundWasNonEmpty,
    loadPersistedState,
    markUserChange,
    persistBeforeUnload,
    persistStateNow,
    schedulePersistState,
    updateHydrateInboundFromState,
  } = dgPersist;
  const DG_HYDRATE = getHydrateState();
  let overlayCamState = getFrameStartState?.() || { scale: 1, x: 0, y: 0 };
  let unsubscribeFrameStart = null;

  function getZoomScale(el) {
    // Compare transformed rect to layout box to infer CSS transform scale.
    // Fallback to 1 to remain stable if values are 0 or unavailable.
    if (!el) return { x: 1, y: 1 };
    const rect = el.getBoundingClientRect?.();
    const cw = el.clientWidth || 0;
    const ch = el.clientHeight || 0;
    if (!rect || cw <= 0 || ch <= 0) return { x: 1, y: 1 };
    const inferredX = rect.width  / cw;
    const inferredY = rect.height / ch;
    const cam = typeof getFrameStartState === 'function' ? getFrameStartState() : null;
    const committedScale = Number.isFinite(cam?.scale) ? cam.scale :
      (Number.isFinite(boardScale) ? boardScale : NaN);
    const sx = Number.isFinite(committedScale) ? committedScale : inferredX;
    const sy = Number.isFinite(committedScale) ? committedScale : inferredY;
    const clampedX = Math.max(0.1, Math.min(4, sx));
    const clampedY = Math.max(0.1, Math.min(4, sy));
    return {
      x: (isFinite(clampedX) ? clampedX : 1),
      y: (isFinite(clampedY) ? clampedY : 1)
    };
  }

  // Layers (z-index order) — particles behind the art layers
  const DG_SINGLE_CANVAS = true;
  try { if (typeof window !== 'undefined') window.__DG_SINGLE_CANVAS = DG_SINGLE_CANVAS; } catch {}
  try {
    if (typeof window !== 'undefined' && window.__DG_PLAYHEAD_SEPARATE_CANVAS === undefined) {
      window.__DG_PLAYHEAD_SEPARATE_CANVAS = false;
    }
  } catch {}
  const DG_COMBINE_GRID_NODES = false;
  // TODO: consider single-canvas draw order (grid/nodes/overlays) after merge validation.
  const particleCanvas = document.createElement('canvas');
  particleCanvas.className = 'toy-particles';
  particleCanvas.setAttribute('data-role', 'drawgrid-particles');
  const grid = document.createElement('canvas'); grid.setAttribute('data-role','drawgrid-grid');
  const paint = document.createElement('canvas'); paint.setAttribute('data-role','drawgrid-paint');
  const nodesCanvas = DG_COMBINE_GRID_NODES ? grid : document.createElement('canvas');
  if (!DG_COMBINE_GRID_NODES) nodesCanvas.setAttribute('data-role', 'drawgrid-nodes');
  const flashCanvas = document.createElement('canvas'); flashCanvas.setAttribute('data-role', 'drawgrid-flash');
  const ghostCanvas = document.createElement('canvas'); ghostCanvas.setAttribute('data-role','drawgrid-ghost');
  const tutorialCanvas = document.createElement('canvas'); tutorialCanvas.setAttribute('data-role', 'drawgrid-tutorial-highlight');
  const playheadCanvas = document.createElement('canvas'); playheadCanvas.setAttribute('data-role', 'drawgrid-playhead');
  // Tag canvases so shared helper code can locate the owning panel.
  try {
    particleCanvas.__dgPanel = panel;
    grid.__dgPanel = panel;
    paint.__dgPanel = panel;
    nodesCanvas.__dgPanel = panel;
    flashCanvas.__dgPanel = panel;
    ghostCanvas.__dgPanel = panel;
    tutorialCanvas.__dgPanel = panel;
    playheadCanvas.__dgPanel = panel;
  } catch {}
  if (DG_COMBINE_GRID_NODES) {
    try { panel.classList.add('drawgrid-combined'); } catch {}
  } else {
    try { panel.classList.remove('drawgrid-combined'); } catch {}
  }
  if (DG_SINGLE_CANVAS) {
    try { panel.classList.add('drawgrid-single'); } catch {}
  } else {
    try { panel.classList.remove('drawgrid-single'); } catch {}
  }
  if (DG_SINGLE_CANVAS) {
    panel.__dgCompositeBaseDirty = true;
    panel.__dgCompositeOverlayDirty = true;
    panel.__dgCompositeBaseCanvas = null;
    panel.__dgCompositeBaseCtx = null;
  }
  // Init per-panel dirty flags used by compositeSingleCanvas().
  panel.__dgSingleCompositeDirty = true;
  panel.__dgCompositeBaseDirty = true;
  panel.__dgCompositeOverlayDirty = true;

  function __dgProbeDump(tag = 'probe') {
    try {
      const gridEl = grid;
      const nodesEl = nodesCanvas;
      const paintEl = paint;
      const dump = {
        tag,
        panelId: panel?.id || null,
        singleCanvas: DG_SINGLE_CANVAS,
        combineGridNodes: DG_COMBINE_GRID_NODES,
        cssW,
        cssH,
        gridArea: gridArea ? { ...gridArea } : null,
        gridAreaLogical: gridAreaLogical ? { ...gridAreaLogical } : null,
        canvases: {
          paint: {
            display: paintEl?.style?.display || null,
            z: paintEl?.style?.zIndex || null,
            role: paintEl?.getAttribute?.('data-role') || null,
          },
          grid: {
            display: gridEl?.style?.display || null,
            z: gridEl?.style?.zIndex || null,
            role: gridEl?.getAttribute?.('data-role') || null,
          },
          nodes: {
            display: nodesEl?.style?.display || null,
            z: nodesEl?.style?.zIndex || null,
            role: nodesEl?.getAttribute?.('data-role') || null,
          },
        },
        ctx: {
          gctxRole: gctx?.canvas?.getAttribute?.('data-role') || null,
          nctxRole: nctx?.canvas?.getAttribute?.('data-role') || null,
        },
        nodes: {
          cols: cols || 0,
          nodeCount: (() => {
            let count = 0;
            if (Array.isArray(currentMap?.nodes)) {
              for (const col of currentMap.nodes) count += col?.size || 0;
            }
            return count;
          })(),
          groupStacks: (() => {
            let stacks = 0;
            if (Array.isArray(nodeGroupMap)) {
              for (const m of nodeGroupMap) {
                if (!m || typeof m.forEach !== 'function') continue;
                m.forEach((arr) => { if (Array.isArray(arr) && arr.length > 1) stacks++; });
              }
            }
            return stacks;
          })(),
        },
      };
      if (typeof window !== 'undefined' && window.__DG_PROBE_ON) {
        console.log('[DG][probe]', dump);
      }
    } catch {}
  }
  try { panel.__dgProbe = __dgProbeDump; } catch {}
  try { window.__DG_PROBE__ = window.__DG_PROBE__ || __dgProbeDump; } catch {}
  Object.assign(particleCanvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 0, pointerEvents: 'none' });
  particleCanvas.style.background = 'transparent';
  Object.assign(grid.style,           { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: DG_COMBINE_GRID_NODES ? 5 : 1 });
  grid.style.background = 'transparent';
  if (DG_COMBINE_GRID_NODES) grid.style.pointerEvents = 'none';
  Object.assign(paint.style,          { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: DG_COMBINE_GRID_NODES ? 1 : 2 });
  paint.style.background = 'transparent';
  paint.style.pointerEvents = 'auto';
  Object.assign(ghostCanvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: DG_COMBINE_GRID_NODES ? 2 : 3, pointerEvents: 'none' });
  ghostCanvas.style.background = 'transparent';
  Object.assign(flashCanvas.style,  { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: DG_COMBINE_GRID_NODES ? 3 : 4, pointerEvents: 'none' });
  flashCanvas.style.background = 'transparent';
  if (!DG_COMBINE_GRID_NODES) {
    Object.assign(nodesCanvas.style,  { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 5, pointerEvents: 'none' });
    nodesCanvas.style.background = 'transparent';
  }
  Object.assign(tutorialCanvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 6, pointerEvents: 'none' });
  tutorialCanvas.style.background = 'transparent';
  Object.assign(playheadCanvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 7, pointerEvents: 'none' });
  playheadCanvas.style.background = 'transparent';
  body.appendChild(particleCanvas);
  body.appendChild(grid);
  body.appendChild(paint);
  body.appendChild(ghostCanvas);
  body.appendChild(flashCanvas);
  if (!DG_COMBINE_GRID_NODES) body.appendChild(nodesCanvas);
  body.appendChild(tutorialCanvas);
  body.appendChild(playheadCanvas);
  if (DG_SINGLE_CANVAS) {
    grid.style.display = 'none';
    if (nodesCanvas !== grid) nodesCanvas.style.display = 'none';
    ghostCanvas.style.display = 'none';
    flashCanvas.style.display = 'none';
    playheadCanvas.style.display = 'none';
  }

  
  // debugCanvas.setAttribute('data-role','drawgrid-debug');
  // Object.assign(debugCanvas.style, {
  //   position: 'absolute',
  //   inset: '0',
  //   width: '100%',
  //   height: '100%',
  //   display: DG_DEBUG ? 'block' : 'none',
  //   zIndex: 9999,
  //   pointerEvents: 'none',
  // });
  // body.appendChild(debugCanvas);
  const debugCanvas = null;
  const debugCtx = null;

  function drawDebugHUD(extraLines = []) { /* no-op */ }

  const wrap = document.createElement('div');
  wrap.className = 'drawgrid-size-wrap';
  wrap.style.position = 'relative';
  wrap.style.width = '100%';
  wrap.style.height = '100%';
  wrap.style.overflow = 'hidden';
  wrap.style.background = drawToyBg;

  // Move all existing elements from body into the new wrapper
  [...body.childNodes].forEach(node => wrap.appendChild(node));
  
  body.appendChild(wrap);

  const drawLabelState = createDrawLabelOverlay(
    panel,
    () => {
      let gridAreaValue = null;
      let gridAreaLogicalValue = null;
      let isPanelVisibleValue = true;
      let dgViewportValue = null;
      try { gridAreaValue = gridArea; } catch {}
      try { gridAreaLogicalValue = gridAreaLogical; } catch {}
      try { isPanelVisibleValue = isPanelVisible; } catch {}
      try { dgViewportValue = dgViewport; } catch {}
      return {
        gridArea: gridAreaValue,
        gridAreaLogical: gridAreaLogicalValue,
        isPanelVisible: isPanelVisibleValue,
        dgViewport: dgViewportValue,
      };
    },
    { wrap, grid }
  );
  const {
    updateDrawLabel,
    fadeOutDrawLabel,
    knockLettersAt,
    ensureLetterPhysicsLoop,
    getDrawLabelYRange,
  } = drawLabelState;

  function getToyLogicalSize() {
    let width = Math.max(1, Math.round(wrap?.clientWidth || 0));
    let height = Math.max(1, Math.round(wrap?.clientHeight || 0));
    if (width <= 1 || height <= 1) {
      const fallback = measureCSSSize(wrap || body);
      width = Math.max(width, Math.round(fallback?.w || 0));
      height = Math.max(height, Math.round(fallback?.h || 0));
      dgSizeTrace('getToyLogicalSize:fallback', {
        wrapClientW: wrap?.clientWidth || 0,
        wrapClientH: wrap?.clientHeight || 0,
        fallbackW: fallback?.w || 0,
        fallbackH: fallback?.h || 0,
      });
    }
    return { w: Math.max(1, width), h: Math.max(1, height) };
  }

  function getToyCssSizeForParticles() {
    // IMPORTANT: avoid getBoundingClientRect() in hot paths (can trigger forced layout).
    // Prefer cached ResizeObserver measurements (wrap) or cheap clientWidth/clientHeight.
    const w = (wrap && __dgLayoutW > 0)
      ? __dgLayoutW
      : Math.max(1, Math.round(wrap?.clientWidth || panel?.clientWidth || 1));
    const h = (wrap && __dgLayoutH > 0)
      ? __dgLayoutH
      : Math.max(1, Math.round(wrap?.clientHeight || panel?.clientHeight || 1));
    return { w, h };
  }

  function __auditZoomSizes(tag = 'audit') {
    if (typeof window === 'undefined' || !window.DG_ZOOM_AUDIT) return;
    try {
      const rect = wrap?.getBoundingClientRect?.();
      const clientW = wrap?.clientWidth || 0;
      const clientH = wrap?.clientHeight || 0;

      const zoomState = (typeof getZoomState === 'function') ? getZoomState() : null;
      const zoomScale = Number.isFinite(dgViewport?.getZoom?.())
        ? dgViewport.getZoom()
        : (Number.isFinite(zoomState?.scale) ? zoomState.scale : 1);

      // --- Common area basis (logical toy size) ---
      const areaW = Number.isFinite(gridAreaLogical?.w) && gridAreaLogical.w > 0
        ? gridAreaLogical.w
        : Math.round(rect?.width || clientW || 0);
      const areaH = Number.isFinite(gridAreaLogical?.h) && gridAreaLogical.h > 0
        ? gridAreaLogical.h
        : Math.round(rect?.height || clientH || 0);

      // --- DRAW label sizing (DOM text) ---
      const minDim = Math.max(1, Math.min(areaW || 0, areaH || 0));
      const labelZoomScale = Math.max(0.1, __dgZoomScale());
      const rawLbl = Math.max(48, Math.min(240, minDim * 0.26));
      const drawLabelPx = Math.max(12, Math.round(rawLbl * labelZoomScale));

      // --- Grid scale + grid line thickness ---
      const gridCellW = cw || 0;
      const gridCellH = ch || 0;
      const gridLineWidthPx = (gridCellW > 0 && gridCellH > 0)
        ? Math.max(0.5, Math.min(gridCellW, gridCellH) * 0.05 * zoomScale)
        : 0;

      // --- Drawn animated line thickness ---
      let drawLineWidthPx = null;
      try {
        drawLineWidthPx = typeof R.getLineWidth === 'function' ? R.getLineWidth() : null;
      } catch {
        drawLineWidthPx = null;
      }

      // --- Ghost finger / disturbance radii (world-space, based on toy area) ---
      const areaForRadii = { w: areaW || 0, h: areaH || 0 };
      const ghostRadius =
        (typeof ghostRadiusToy === 'function')
          ? ghostRadiusToy(areaForRadii)
          : null;
      const headerRadius =
        (typeof headerRadiusToy === 'function')
          ? headerRadiusToy(areaForRadii)
          : null;

      DG_LOG({
        tag: 'ZOOM-AUDIT',
        source: tag,
        zoomScale,
        rectW: Math.round(rect?.width || 0),
        rectH: Math.round(rect?.height || 0),
        clientW,
        clientH,
        gridAreaLogical: { ...gridAreaLogical },

        // Element-specific zoom diagnostics:
        drawLabelPx,
        drawLabelRawPx: rawLbl,
        gridCellW,
        gridCellH,
        gridLineWidthPx,
        drawLineWidthPx,
        ghostRadiusToy: ghostRadius,
        headerRadiusToy: headerRadius,
      });
    } catch (err) {
      console.warn('[DG][ZOOM-AUDIT] failed', err);
    }
  }

  // --- Particle viewport / field init after wrap is ready ---
  const pausedRef = () => !!panel?.dataset?.paused;
  const viewportBridge = createViewportBridgeDG(panel);

  // IMPORTANT:
  // Use the logical toy size for the particle viewport so that:
  // - grid, ghost path, and particles all share the same world-space basis, and
  // - camera zoom (board scale) just scales the whole toy visually.
  dgViewport = createParticleViewport(() => {
    return getToyLogicalSize();
  });
  Object.assign(dgViewport, viewportBridge);
  dgMap = dgViewport.map;
  const panelSeed = panel?.dataset?.toyid || panel?.id || 'drawgrid';
  let gridArea = { x: 0, y: 0, w: 0, h: 0 };
  const getRenderState = () => ({
    paintDpr,
    cssW,
    cssH,
    cw,
    ch,
    topPad,
    usingBackBuffers,
    backCtx,
    DG_SINGLE_CANVAS,
    gridArea,
    __dgDrawingActive,
    isVisualOnlyStroke,
    getPathAlpha,
    __dgMarkSingleCanvasDirty,
  });
  const R = createDgRenderUtils(getRenderState);
  const flowDebugState = {
    get panel() { return panel; },
    get paint() { return paint; },
    get backCanvas() { return backCanvas; },
    get flashCanvas() { return flashCanvas; },
    get flashBackCanvas() { return flashBackCanvas; },
    get usingBackBuffers() { return usingBackBuffers; },
    get __dgPaintRev() { return __dgPaintRev; },
    get __dgDrawingActive() { return __dgDrawingActive; },
    get __dgDeferUntilTs() { return __dgDeferUntilTs; },
    set __dgDeferUntilTs(value) { __dgDeferUntilTs = value; },
    get __dgBypassCommitUntil() { return __dgBypassCommitUntil; },
    set __dgBypassCommitUntil(value) { __dgBypassCommitUntil = value; },
    get __dgHydrationPendingRedraw() { return __dgHydrationPendingRedraw; },
    set __dgHydrationPendingRedraw(value) { __dgHydrationPendingRedraw = value; },
    get __dgLayerDebugLastTs() { return __dgLayerDebugLastTs; },
    set __dgLayerDebugLastTs(value) { __dgLayerDebugLastTs = value; },
    get __dgLayerTraceLastTs() { return __dgLayerTraceLastTs; },
    set __dgLayerTraceLastTs(value) { __dgLayerTraceLastTs = value; },
    get __dgRegenSource() { return __dgRegenSource; },
    set __dgRegenSource(value) { __dgRegenSource = value; },
    get DG_SINGLE_CANVAS_OVERLAYS() { return DG_SINGLE_CANVAS_OVERLAYS; },
    get __dgSampleCanvas() { return __dgSampleCanvas; },
    set __dgSampleCanvas(value) { __dgSampleCanvas = value; },
    get __dgSampleCtx() { return __dgSampleCtx; },
    set __dgSampleCtx(value) { __dgSampleCtx = value; },
    get __dgSkipSwapsDuringDrag() { return __dgSkipSwapsDuringDrag; },
    get cur() { return cur; },
    get previewGid() { return previewGid; },
    get nextDrawTarget() { return nextDrawTarget; },
    get strokes() { return strokes; },
    get getActiveFlashCanvas() { return getActiveFlashCanvas; },
    get hasOverlayStrokesCached() { return hasOverlayStrokesCached; },
  };
  const getFlowDebugState = () => flowDebugState;
  const FD = createDgFlowDebug(getFlowDebugState);
  const getHydrationState = () => ({
    hydrationState,
    __dgHydrationPendingRedraw,
    __dgBypassCommitUntil,
    __dgDeferUntilTs,
  });
  const HY = createDgHydrationHelpers(getHydrationState);
  const getFieldForceState = () => ({
    panel,
    R,
    dgField,
    dgMap,
    gridArea,
    gridAreaLogical,
    cssW,
    cssH,
    DG_KNOCK,
    DG_DEBUG,
    HeaderSweepForce,
    headerSweepDirX,
    ghostCtx,
    getOverlayZoomSnapshot,
    headerPushSuppressed,
    dbgPoke,
    knockLettersAt,
    __auditZoomSizes,
    drawgridLog,
    __dgLogFirstPoke,
    cw,
    cols,
    get __dgParticlePokeTs() { return __dgParticlePokeTs; },
    set __dgParticlePokeTs(v) { __dgParticlePokeTs = v; },
  });
  const FF = createDgFieldForces(getFieldForceState);
  const getParticleState = () => ({
    panel,
    wrap,
    particleCanvas,
    dgViewport,
    particleState,
    panelSeed,
    getToyLogicalSize,
    gridAreaLogical,
    drawgridLog,
    __auditZoomSizes,
    globalDrawgridState,
    getParticleBudget,
    getParticleCap,
    getAdaptiveFrameBudget,
    createField,
    pausedRef,
    __lastZoomMotionTs,
    ZOOM_STALL_MS,
  });
  const P = createDgParticles(getParticleState);

  function makeFlowCtx() {
    return {
      panel,
      paint,
      backCanvas,
      flashCanvas,
      flashBackCanvas,
      activeFlashCanvas: (typeof getActiveFlashCanvas === 'function') ? getActiveFlashCanvas() : null,
      strokes,
      usingBackBuffers,
      paintRev: __dgPaintRev,
      compositeDirty: panel.__dgSingleCompositeDirty,
      hasOverlayStrokesCached,
    };
  }

  const getRandomizerState = () => ({
    get panel() { return panel; },
    get DG_SINGLE_CANVAS() { return DG_SINGLE_CANVAS; },
    get isPanelVisible() { return isPanelVisible; },
    get cols() { return cols; },
    get strokes() { return strokes; },
    set strokes(value) { strokes = value; },
    get currentMap() { return currentMap; },
    set currentMap(value) { currentMap = value; },
    get persistentDisabled() { return persistentDisabled; },
    set persistentDisabled(value) { persistentDisabled = value; },
    get pctx() { return pctx; },
    set pctx(value) { pctx = value; },
    get drawFullStroke() { return drawFullStroke; },
    get regenerateMapFromStrokes() { return regenerateMapFromStrokes; },
    get drawGrid() { return drawGrid; },
    get drawNodes() { return drawNodes; },
    get emitDrawgridUpdate() { return emitDrawgridUpdate; },
    get stopAutoGhostGuide() { return stopAutoGhostGuide; },
    get updateDrawLabel() { return updateDrawLabel; },
    get updateGeneratorButtons() { return updateGeneratorButtons; },
    get __dgMarkSingleCanvasDirty() { return __dgMarkSingleCanvasDirty; },
    get compositeSingleCanvas() { return compositeSingleCanvas; },
    get markUserChange() { return markUserChange; },
    get FD() { return FD; },
    get makeFlowCtx() { return makeFlowCtx; },
    get dgTraceWarn() { return dgTraceWarn; },
    get dgTraceLog() { return dgTraceLog; },
    get gridArea() { return gridArea; },
    get topPad() { return topPad; },
    get ch() { return ch; },
    get rows() { return rows; },
    get cw() { return cw; },
    get getActivePaintCtx() { return getActivePaintCtx; },
    get resetPaintBlend() { return resetPaintBlend; },
    get setDrawingState() { return setDrawingState; },
    get R() { return R; },
    get emitDG() { return emitDG; },
    get nctx() { return nctx; },
    get fctx() { return fctx; },
    get getActiveFlashCanvas() { return getActiveFlashCanvas; },
    get flashBackCtx() { return flashBackCtx; },
    get flashFrontCtx() { return flashFrontCtx; },
    get backCtx() { return backCtx; },
    get frontCtx() { return frontCtx; },
    get markFlashLayerCleared() { return markFlashLayerCleared; },
    get __dgMarkSingleCanvasOverlayDirty() { return __dgMarkSingleCanvasOverlayDirty; },
    get __dgOverlayStrokeListCache() { return __dgOverlayStrokeListCache; },
    set __dgOverlayStrokeListCache(value) { __dgOverlayStrokeListCache = value; },
    get __dgOverlayStrokeCache() { return __dgOverlayStrokeCache; },
    set __dgOverlayStrokeCache(value) { __dgOverlayStrokeCache = value; },
    get __dgSkipSwapsDuringDrag() { return __dgSkipSwapsDuringDrag; },
    set __dgSkipSwapsDuringDrag(value) { __dgSkipSwapsDuringDrag = value; },
    get cur() { return cur; },
    set cur(value) { cur = value; },
    get pendingNodeTap() { return pendingNodeTap; },
    set pendingNodeTap(value) { pendingNodeTap = value; },
    get nodeGroupMap() { return nodeGroupMap; },
    set nodeGroupMap(value) { nodeGroupMap = value; },
    get manualOverrides() { return manualOverrides; },
    set manualOverrides(value) { manualOverrides = value; },
    get previewGid() { return previewGid; },
    set previewGid(value) { previewGid = value; },
    get nextDrawTarget() { return nextDrawTarget; },
    set nextDrawTarget(value) { nextDrawTarget = value; },
    get clearAndRedrawFromStrokes() { return clearAndRedrawFromStrokes; },
    get usingBackBuffers() { return usingBackBuffers; },
  });

  const RNG = createDgRandomizers(getRandomizerState);

  function __dgGridReady() {
    return !!(gridArea && gridArea.w > 0 && gridArea.h > 0 && cw > 0 && ch > 0);
  }
  const gridFrontCtx = grid.getContext('2d', { willReadFrequently: true });
  const gridBackCanvas = document.createElement('canvas');
  const gridBackCtx = gridBackCanvas.getContext('2d', { willReadFrequently: true });
  let gctx = DG_SINGLE_CANVAS ? gridBackCtx : gridFrontCtx;

  const frontCanvas = paint;
  frontCanvas.classList.add('toy-canvas');
  const frontCtx = frontCanvas.getContext('2d', { willReadFrequently: true });
  const backCanvas = document.createElement('canvas');
  backCanvas.setAttribute('data-role', 'drawgrid-paint-back');
  backCtx = backCanvas.getContext('2d', { alpha: true, desynchronized: true });
  let pctx = DG_SINGLE_CANVAS ? backCtx : frontCtx;

  const nodesFrontCtx = nodesCanvas.getContext('2d', { willReadFrequently: true });
  const nodesBackCanvas = document.createElement('canvas');
  const nodesBackCtx = nodesBackCanvas.getContext('2d', { willReadFrequently: true });
  let nctx = (DG_SINGLE_CANVAS && DG_SINGLE_CANVAS_OVERLAYS && nodesCanvas !== grid)
    ? nodesFrontCtx
    : (DG_SINGLE_CANVAS ? nodesBackCtx : nodesFrontCtx);

  const flashFrontCtx = flashCanvas.getContext('2d', { willReadFrequently: true });
  const flashBackCanvas = document.createElement('canvas');
  const flashBackCtx = flashBackCanvas.getContext('2d', { willReadFrequently: true });
  let fctx = flashFrontCtx;

  const ghostFrontCtx = ghostCanvas.getContext('2d');
  const ghostBackCanvas = document.createElement('canvas');
  const ghostBackCtx = ghostBackCanvas.getContext('2d');
  let ghostCtx = ghostFrontCtx;
  const playheadFrontCtx = playheadCanvas.getContext('2d');
  panel.__dgFlashLayerEmpty = true;
  panel.__dgGhostLayerEmpty = true;
  panel.__dgTutorialLayerEmpty = true;
  panel.__dgPlayheadLayerEmpty = true;

  const markFlashLayerActive = () => { panel.__dgFlashLayerEmpty = false; __dgMarkSingleCanvasOverlayDirty(panel); };
  const markFlashLayerCleared = () => { panel.__dgFlashLayerEmpty = true; __dgMarkSingleCanvasOverlayDirty(panel); };
  const markGhostLayerActive = () => { panel.__dgGhostLayerEmpty = false; __dgMarkSingleCanvasOverlayDirty(panel); };
  const markGhostLayerCleared = () => { panel.__dgGhostLayerEmpty = true; __dgMarkSingleCanvasOverlayDirty(panel); };
  const markTutorialLayerActive = () => { panel.__dgTutorialLayerEmpty = false; __dgMarkSingleCanvasOverlayDirty(panel); };
  const markTutorialLayerCleared = () => { panel.__dgTutorialLayerEmpty = true; __dgMarkSingleCanvasOverlayDirty(panel); };
  const markPlayheadLayerActive = () => { panel.__dgPlayheadLayerEmpty = false; __dgMarkSingleCanvasOverlayDirty(panel); };
  const markPlayheadLayerCleared = () => { panel.__dgPlayheadLayerEmpty = true; __dgMarkSingleCanvasOverlayDirty(panel); };

  function drawColumnFlashesOverlay(ctx) {
    if (!ctx) return;
    if (!gridArea || gridArea.w <= 0 || gridArea.h <= 0) return;
    if (!flashes || flashes.length === 0) return;
    const height = rows * ch;
    if (!Number.isFinite(height) || height <= 0) return;
    const y = gridArea.y + topPad;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < flashes.length; i++) {
      const alpha = flashes[i];
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha * 0.25;
      const x = gridArea.x + i * cw;
      ctx.fillRect(x, y, cw, height);
    }
    ctx.restore();
  }

  const handleChainActiveChange = (isActive) => {
    try {
      panel.__dgShowPlaying = null;
      panel.classList?.toggle?.('toy-playing', !!isActive);
    } catch {}
    try {
      if (!isActive) {
        panel.__dgPlayheadLastX = null;
        panel.__dgPlayheadLayer = null;
        if (playheadFrontCtx?.canvas && playheadCanvas?.width && playheadCanvas?.height) {
          R.resetCtx(playheadFrontCtx);
          R.withDeviceSpace(playheadFrontCtx, () => {
            playheadFrontCtx.clearRect(0, 0, playheadCanvas.width, playheadCanvas.height);
          });
          markPlayheadLayerCleared();
        }
      }
    } catch {}
    __dgNeedsUIRefresh = true;
  };
  try {
    let lastChainActive = panel?.dataset?.chainActive;
    handleChainActiveChange(lastChainActive === 'true');
    const chainObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type !== 'attributes' || m.attributeName !== 'data-chain-active') continue;
        const next = panel?.dataset?.chainActive;
        if (next === lastChainActive) continue;
        lastChainActive = next;
        handleChainActiveChange(next === 'true');
      }
    });
    chainObserver.observe(panel, { attributes: true });
    panel.addEventListener('toy:remove', () => chainObserver.disconnect(), { once: true });
  } catch {}

  function updateFlatLayerVisibility() {
    const flat = !!(typeof window !== 'undefined' && window.__PERF_DRAWGRID_FLAT_LAYERS);
    const separatePlayhead = !!(typeof window !== 'undefined' && window.__DG_PLAYHEAD_SEPARATE_CANVAS);
    const modeKey = `${flat ? 1 : 0}-${DG_SINGLE_CANVAS ? 1 : 0}-${separatePlayhead ? 1 : 0}`;
    if (panel.__dgFlatLayerMode === modeKey) return;
    panel.__dgFlatLayerMode = modeKey;
    const toggle = (el, visible) => {
      if (!el || !el.style) return;
      el.style.display = visible ? 'block' : 'none';
      if (!visible) el.style.opacity = '0';
    };
    const showGrid = !flat && !DG_SINGLE_CANVAS;
    const showOverlayBase = !flat && (!DG_SINGLE_CANVAS || DG_SINGLE_CANVAS_OVERLAYS);
    // Hide overlay canvases when they're empty to reduce compositor/layer work.
    // (These flags are maintained by mark*LayerActive/Cleared.)
    const showGhost = showOverlayBase && !panel.__dgGhostLayerEmpty;
    const showFlash = showOverlayBase && !panel.__dgFlashLayerEmpty;
    const showTutorial = !flat && !panel.__dgTutorialLayerEmpty;
    const chainActive = (panel?.dataset?.chainActive === 'true') || panel?.classList?.contains?.('toy-playing');
    const showPlayhead = !flat && separatePlayhead && chainActive && !panel.__dgPlayheadLayerEmpty && (!DG_SINGLE_CANVAS || DG_SINGLE_CANVAS_OVERLAYS);
    // Keep the main paint canvas visible; hide auxiliary layers in flat mode.
    toggle(paint, true);
    toggle(grid, showGrid);
    if (nodesCanvas !== grid) toggle(nodesCanvas, showGrid);
    toggle(ghostCanvas, showGhost);
    toggle(flashCanvas, showFlash);
    toggle(tutorialCanvas, showTutorial);
    toggle(particleCanvas, !flat);
    toggle(playheadCanvas, showPlayhead);
    if (DG_SINGLE_CANVAS) {
      toggle(grid, false);
      if (nodesCanvas !== grid) toggle(nodesCanvas, DG_SINGLE_CANVAS_OVERLAYS);
      toggle(ghostCanvas, DG_SINGLE_CANVAS_OVERLAYS && !panel.__dgGhostLayerEmpty);
      toggle(flashCanvas, DG_SINGLE_CANVAS_OVERLAYS && !panel.__dgFlashLayerEmpty);
      toggle(playheadCanvas, DG_SINGLE_CANVAS_OVERLAYS && separatePlayhead && chainActive && !panel.__dgPlayheadLayerEmpty);
    }
  }
  updateFlatLayerVisibility();

  const tutorialFrontCtx = tutorialCanvas.getContext('2d');
  const tutorialBackCanvas = document.createElement('canvas');
  const tutorialBackCtx = tutorialBackCanvas.getContext('2d');
  let tutorialCtx = tutorialFrontCtx;
  // Tag back-buffer canvases so helpers can resolve the owning panel.
  try {
    gridBackCanvas.__dgPanel = panel;
    backCanvas.__dgPanel = panel;
    nodesBackCanvas.__dgPanel = panel;
    flashBackCanvas.__dgPanel = panel;
    ghostBackCanvas.__dgPanel = panel;
    tutorialBackCanvas.__dgPanel = panel;
  } catch {}

// ===== Paint lifecycle tracing (disabled by default) =====
// Flip manually in console if needed:
//   window.__DG_PAINT_TRACE = true
try {
  if (typeof window !== 'undefined' && window.__DG_PAINT_TRACE === undefined) {
    window.__DG_PAINT_TRACE = false;
  }
} catch {}
  function dgPaintTrace(event, data = null) {
    try {
      const on = __dgFlag('paintTrace') || !!(window && window.__DG_PAINT_TRACE);
      if (!on) return;
    } catch { return; }

    try {
      dgLogLine?.('paint-trace', {
        event,
        panelId: panel?.id || null,
        usingBackBuffers,
        zoomGestureActive,
        zoomMode,
        cssW,
        cssH,
        paintDpr,
        front: { w: frontCanvas?.width || 0, h: frontCanvas?.height || 0 },
        back: { w: backCanvas?.width || 0, h: backCanvas?.height || 0 },
        // This helps detect “double scaling” issues:
        frontRect: (() => { try { const r = frontCanvas?.getBoundingClientRect?.(); return r ? { w: r.width, h: r.height } : null; } catch {} return null; })(),
        data
      });
    } catch {}
  }

// Size/scale trace for refresh flicker debugging (disabled by default).
// Enable manually if required:
//   window.__DG_REFRESH_SIZE_TRACE = true
try {
  if (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE === undefined) {
    window.__DG_REFRESH_SIZE_TRACE = false;
  }
  if (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE_LIMIT === undefined) {
    window.__DG_REFRESH_SIZE_TRACE_LIMIT = 200;
  }
} catch {}
  let __dgSizeTraceCount = 0;
  function dgSizeTrace(event, data = null) {
    try {
      const on = (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE);
      if (!on) return;
    } catch { return; }
    try {
      const limit = (typeof window !== 'undefined') ? window.__DG_REFRESH_SIZE_TRACE_LIMIT : null;
      if (Number.isFinite(limit) && limit >= 0 && __dgSizeTraceCount >= limit) return;
      __dgSizeTraceCount++;
    } catch {}
    try {
      const payload = data && typeof data === 'object' ? data : {};
      payload.panelId = panel?.id || null;
      const text = (() => {
        try { return JSON.stringify(payload); } catch { return null; }
      })();
      if (text) console.log('[DG][size-trace]', event, text);
      else console.log('[DG][size-trace]', event, payload);
    } catch {}
  }

  function dgSizeTraceCanvas(tag, extra = null) {
    try {
      const on = (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE);
      if (!on) return;
    } catch { return; }
    try {
      const rect = frontCanvas?.getBoundingClientRect?.();
      const panelRect = panel?.getBoundingClientRect?.();
      const payload = {
        tag,
        cssW,
        cssH,
        paintDpr,
        frontCanvas: {
          w: frontCanvas?.width || 0,
          h: frontCanvas?.height || 0,
          rectW: rect?.width || 0,
          rectH: rect?.height || 0,
        },
        gridBack: {
          w: gridBackCanvas?.width || 0,
          h: gridBackCanvas?.height || 0,
        },
        panelRect: {
          w: panelRect?.width || 0,
          h: panelRect?.height || 0,
        },
        toyScale: (() => {
          try {
            const raw = panel ? getComputedStyle(panel).getPropertyValue('--toy-scale') : '';
            const n = parseFloat(raw);
            return Number.isFinite(n) ? n : null;
          } catch { return null; }
        })(),
        boardScale: (() => {
          try {
            const host = panel?.closest?.('.board-viewport') || document.querySelector('.board-viewport');
            const raw = host ? boardScaleHelper(host) : (Number.isFinite(window?.__boardScale) ? window.__boardScale : 1);
            return Number.isFinite(raw) ? raw : null;
          } catch { return null; }
        })(),
        extra: extra || null,
      };
      dgSizeTrace('canvas-sizes', payload);
    } catch {}
  }

  function debugPaintSizes(tag, extra = null) {
    if (!DG_LAYOUT_DEBUG) return;
    try {
      const targetW = Math.max(1, Math.round(cssW * paintDpr));
      const targetH = Math.max(1, Math.round(cssH * paintDpr));
      dgLogLine('paint-sizes', {
        tag,
        panelId: panel?.id || null,
        cssW,
        cssH,
        paintDpr,
        targetW,
        targetH,
        front: {
          w: frontCanvas?.width || 0,
          h: frontCanvas?.height || 0,
          cssW: frontCanvas?.style?.width || '',
          cssH: frontCanvas?.style?.height || '',
        },
        back: {
          w: backCanvas?.width || 0,
          h: backCanvas?.height || 0,
          cssW: backCanvas?.style?.width || '',
          cssH: backCanvas?.style?.height || '',
        },
        extra,
      });
    } catch {}
  }

  // Used by dg-paint-buffers to avoid re-entrant post-commit redraw scheduling.
  // NOTE: must be declared before createDgPaintBuffers() host snapshot to avoid TDZ.
  let __dgSuppressPostCommitOnPaintResize = false;

  // === Paint/backbuffer subsystem (extracted) ===
  const dgPaintBuffers = createDgPaintBuffers(() => ({
    // Flags + sizing
    DG_LAYOUT_DEBUG,
    cssW,
    cssH,
    paintDpr,
    zoomGestureActive,

    // Required callbacks / debug
    withDeviceSpace: R.withDeviceSpace,
    dgPaintTrace,
    dgLogLine,
    debugPaintSizes,

    // Redraw scheduling
    strokes,
    __dgSuppressPostCommitOnPaintResize,
    ensurePostCommitRedraw,

    // The specific contexts/canvases used by swapBackToFront
    backCtx,
    frontCtx,
    backCanvas,
    frontCanvas,

    // All contexts to resize (front/back)
    frontCtxs: [
      { ctx: gridFrontCtx, label: 'gridFront' },
      { ctx: nodesFrontCtx, label: 'nodesFront' },
      { ctx: flashFrontCtx, label: 'flashFront' },
      { ctx: ghostFrontCtx, label: 'ghostFront' },
      { ctx: tutorialFrontCtx, label: 'tutorialFront' },
    ],
    backCtxs: [
      { ctx: gridBackCtx, label: 'gridBack' },
      { ctx: nodesBackCtx, label: 'nodesBack' },
      { ctx: flashBackCtx, label: 'flashBack' },
      { ctx: ghostBackCtx, label: 'ghostBack' },
      { ctx: tutorialBackCtx, label: 'tutorialBack' },
    ],

    // Back/front pairs for sync
    backFrontPairs: [
      [gridBackCtx, gridFrontCtx],
      [nodesBackCtx, nodesFrontCtx],
      [flashBackCtx, flashFrontCtx],
      [ghostBackCtx, ghostFrontCtx],
      [tutorialBackCtx, tutorialFrontCtx],
    ],
  }));

  const syncBackBufferSizes = dgPaintBuffers.syncBackBufferSizes;
  const updatePaintBackingStores = dgPaintBuffers.updatePaintBackingStores;
  const swapBackToFront = dgPaintBuffers.swapBackToFront;
  let __dgPostCommitRaf = 0;
  let __dgPostCommitTries = 0;
  function __dgReprojectNormalizedStrokesIfNeeded(tag = 'reproject') {
    try {
      if (!strokes || strokes.length === 0) return false;
      if (!gridArea || !Number.isFinite(gridArea.x) || !Number.isFinite(gridArea.w) || !Number.isFinite(gridArea.h)) return false;

      const gh = Math.max(1, (gridArea.h - (topPad || 0)));
      let changed = 0;

      const reprojectList = (list) => {
        if (!Array.isArray(list) || list.length === 0) return;
        for (const s of list) {
          if (!s || !Array.isArray(s.__ptsN) || s.__ptsN.length === 0) continue;
          const needsPts = (!Array.isArray(s.pts) || s.pts.length === 0);
          if (!needsPts) continue;
          s.pts = s.__ptsN.map(np => ({
            x: gridArea.x + (Number(np?.nx) || 0) * gridArea.w,
            y: (gridArea.y + (topPad || 0)) + (Number(np?.ny) || 0) * gh,
          }));
          changed++;
        }
      };

      reprojectList(strokes);
      if (changed && DG_LAYOUT_DEBUG) {
        try {
          dgLogLine?.('reproject-normalized-strokes', {
            panelId: panel?.id || null,
            tag,
            changed,
            strokes: Array.isArray(strokes) ? strokes.length : 0,
          });
        } catch {}
      }

      return changed > 0;
    } catch {}
    return false;
  }

  function ensurePostCommitRedraw(reason = 'post-commit') {
    if (__dgPostCommitRaf) return;
    if (!Array.isArray(strokes) || strokes.length === 0) return;
    const tick = () => {
      __dgPostCommitRaf = 0;
      dgPaintTrace('postCommit:tick', { tries: __dgPostCommitTries, inCommit: (() => { try { return !!window.__ZOOM_COMMIT_PHASE; } catch {} return false; })() });
      const inCommit = (() => { try { return !!window.__ZOOM_COMMIT_PHASE; } catch {} return false; })();
      if (inCommit && __dgPostCommitTries < 20) {
        __dgPostCommitTries++;
        __dgPostCommitRaf = requestAnimationFrame(tick);
        return;
      }
      __dgPostCommitTries = 0;
      try { useFrontBuffers(); } catch {}
      try {
        __dgSuppressPostCommitOnPaintResize = true;
        updatePaintBackingStores({ force: true, target: 'both' });
      } catch {} finally {
        __dgSuppressPostCommitOnPaintResize = false;
      }
      // IMPORTANT: if we're about to redraw from strokes, make sure normalized strokes
      // have been reprojected into live `pts` first. Otherwise this path can clear
      // the paint canvas and draw nothing (line "vanishes" until next interaction).
      try { __dgReprojectNormalizedStrokesIfNeeded(`post-commit:${reason}`); } catch {}
      dgPaintTrace('postCommit:redraw-from-strokes:begin', { strokes: strokes?.length || 0 });
      try { clearAndRedrawFromStrokes(DG_SINGLE_CANVAS ? backCtx : frontCtx, `post-commit:${reason}`); } catch {}
      dgPaintTrace('postCommit:redraw-from-strokes:end', { strokes: strokes?.length || 0 });
      try { ensureBackVisualsFreshFromFront?.(); } catch {}
      if (DG_LAYOUT_DEBUG) {
        dgLogLine('post-commit-redraw', { panelId: panel?.id || null, reason });
      }
    };
    __dgPostCommitRaf = requestAnimationFrame(tick);
  }

  // === Active canvas helpers (front/back safe) ===
  const {
    getActivePaintCanvas,
    getActivePaintCtx,
    resetPaintBlend,
    pointerToPaintLogical,
  } = createActiveCanvasHelpers(() => ({
    DG_SINGLE_CANVAS,
    usingBackBuffers,
    backCanvas,
    frontCanvas,
    backCtx,
    frontCtx,
    cssW,
    cssH,
    paintDpr,
  }));

  function resizeSurfacesFor(nextCssW, nextCssH, nextDpr) {
    return F.perfMarkSection('drawgrid.resize', () => {
      if (!__dgCommitResizeCount && (() => { try { return !!window.__ZOOM_COMMIT_PHASE; } catch {} return false; })()) {
        __dgCommitResizeCount = 1;
        if (DG_DEBUG) { try { console.warn('[DG] resizeSurfacesFor during commit'); } catch {} }
      }
      const dpr = Math.max(1, Number.isFinite(nextDpr) ? nextDpr : (window.devicePixelRatio || 1));
      paintDpr = __dgCapDprForBackingStore(nextCssW, nextCssH, Math.min(dpr, 3), paintDpr);
      const targetW = Math.max(1, Math.round(nextCssW * paintDpr));
      const targetH = Math.max(1, Math.round(nextCssH * paintDpr));
      if (frontCanvas) {
        frontCanvas.style.width = `${nextCssW}px`;
        frontCanvas.style.height = `${nextCssH}px`;
      }
      if (backCanvas) {
        backCanvas.style.width = `${nextCssW}px`;
        backCanvas.style.height = `${nextCssH}px`;
      }
      const resize = (canvas) => {
        if (!canvas) return;
        if (canvas.width === targetW && canvas.height === targetH) return;
        canvas.width = targetW;
        canvas.height = targetH;
      };
      resize(gridFrontCtx?.canvas);
      resize(gridBackCanvas);
      // particleCanvas sizing is managed by field-generic (it owns DPR/size)
      resize(nodesFrontCtx?.canvas);
      resize(nodesBackCanvas);
      resize(flashFrontCtx?.canvas);
      resize(flashBackCanvas);
      resize(ghostFrontCtx?.canvas);
      resize(ghostBackCanvas);
      resize(tutorialFrontCtx?.canvas);
      resize(tutorialBackCanvas);
      resize(frontCanvas);
      resize(backCanvas);
      const dprChanged = Math.abs(paintDpr - __dgLastResizeDpr) > 0.001;
      const sizeChanged = targetW !== __dgLastResizeTargetW || targetH !== __dgLastResizeTargetH;
      dgSizeTrace('resizeSurfacesFor', {
        nextCssW,
        nextCssH,
        nextDpr,
        paintDpr,
        targetW,
        targetH,
        sizeChanged,
        dprChanged,
      });
      dgSizeTraceCanvas('after-resizeSurfacesFor', {
        targetW,
        targetH,
      });
      __dgLastResizeTargetW = targetW;
      __dgLastResizeTargetH = targetH;
      __dgLastResizeDpr = paintDpr;
      if (dprChanged || sizeChanged) {
        try { markStaticDirty('resize-surfaces'); } catch {}
        updatePaintBackingStores({ force: true, target: 'both' });
        if (Array.isArray(strokes) && strokes.length > 0) {
          try { useFrontBuffers(); } catch {}
          try { clearAndRedrawFromStrokes(DG_SINGLE_CANVAS ? backCtx : frontCtx, 'resize-surfaces'); } catch {}
          try { ensureBackVisualsFreshFromFront?.(); } catch {}
        }
      } else {
        updatePaintBackingStores({ force: false, target: 'both' });
      }
      debugPaintSizes('resizeSurfacesFor');
      try { ensureBackVisualsFreshFromFront?.(); } catch {}
    });
  }

  let __forceSwipeVisible = null; // null=auto, true/false=forced by tutorial
  let __swapRAF = null;
  let __dgSkipSwapsDuringDrag = false;

  // helper: request a single swap this frame
  function requestFrontSwap(andThen) {
    if (__swapRAF || __dgSkipSwapsDuringDrag) {
      if (DG_SWAP_DEBUG && __dgSkipSwapsDuringDrag) dgs('skip', 'live drag in progress');
      return;
    }
    const mark = `DG.swapRAF@${performance.now().toFixed(2)}`;
    if (DG_SWAP_DEBUG) dgs('request', { usingBackBuffers, pendingPaintSwap, pendingSwap, zoomCommitPhase, zoomGestureActive });
    __swapRAF = requestAnimationFrame(() => {
      __swapRAF = null;
      FD.layerEvent('frontSwap:raf', {
        panelId: panel?.id || null,
        panelRef: panel,
        usingBackBuffers,
        pendingPaintSwap,
        pendingSwap,
        singleCanvas: !!DG_SINGLE_CANVAS,
        overlays: !!DG_SINGLE_CANVAS_OVERLAYS,
      });
      dgPaintTrace('requestFrontSwap:raf-begin', { pendingPaintSwap, pendingSwap, zoomCommitPhase, zoomGestureActive });
      if (DG_SWAP_DEBUG) console.time(mark);
      // SWAP GUARD:
      // On refresh/hydrate we sometimes see the front canvas temporarily sized to the *scaled* DOM rect
      // (e.g. 479x359 when the backing store should be 798x599). That resize clears the canvas and
      // can make strokes "disappear" until a later interaction triggers a redraw.
      try {
        const expW = (__dgLastResizeTargetW || (cssW ? Math.max(1, Math.round(cssW * paintDpr)) : 0));
        const expH = (__dgLastResizeTargetH || (cssH ? Math.max(1, Math.round(cssH * paintDpr)) : 0));
        if (frontCanvas && expW && expH) {
          const rect = getRect(frontCanvas);
          const rectW = Math.max(1, Math.round(rect?.width || 0));
          const rectH = Math.max(1, Math.round(rect?.height || 0));
          const looksLikeScaledRect = (frontCanvas.width === rectW && frontCanvas.height === rectH && (rectW !== expW || rectH !== expH));
          const wrongBackingStore = (frontCanvas.width !== expW || frontCanvas.height !== expH);
          if (wrongBackingStore && looksLikeScaledRect) {
            dgPaintTrace('swapGuard:frontBackingStoreWrong', { expW, expH, rectW, rectH, frontW: frontCanvas.width, frontH: frontCanvas.height });
            if (DG_SWAP_DEBUG || DG_DEBUG) {
              console.warn('[DG][swapGuard] front canvas backing store was scaled-rect sized; restoring + redrawing', { expW, expH, rectW, rectH, frontW: frontCanvas.width, frontH: frontCanvas.height });
              console.trace('[DG][swapGuard] stack (who resized front canvas?)');
            }
            // Restore the correct backing store size (clears, so immediately redraw strokes).
            frontCanvas.width = expW;
            frontCanvas.height = expH;
            if (Array.isArray(strokes) && strokes.length > 0) {
              try { clearAndRedrawFromStrokes(DG_SINGLE_CANVAS ? backCtx : frontCtx, 'swap-guard'); } catch {}
            }
          }
        }
      } catch {}
      // NEW: if we're currently drawing to FRONT, make back visuals fresh to prevent a blank frame.
      if (!usingBackBuffers) { ensureBackVisualsFreshFromFront(); if (DG_SWAP_DEBUG) dgs('ensureBackVisualsFreshFromFront()'); }

      if (DG_SINGLE_CANVAS) {
        pendingPaintSwap = false;
        FD.layerEvent('frontSwap:composite', {
          panelId: panel?.id || null,
          panelRef: panel,
          singleCanvas: !!DG_SINGLE_CANVAS,
          overlays: !!DG_SINGLE_CANVAS_OVERLAYS,
        });
        compositeSingleCanvas();
      } else if (pendingPaintSwap) {
        swapBackToFront(); if (DG_SWAP_DEBUG) dgs('swapBackToFront()'); if (DG_DEBUG) drawDebugHUD(['swapBackToFront()']); pendingPaintSwap = false;
      }
      dgPaintTrace('requestFrontSwap:after-swapBackToFront', { pendingPaintSwap });
      if (typeof flushVisualBackBuffersToFront === 'function') {
        flushVisualBackBuffersToFront(); if (DG_SWAP_DEBUG) dgs('flushVisualBackBuffersToFront()'); if (DG_DEBUG) drawDebugHUD(['flushVisualBackBuffersToFront()']);
        dgPaintTrace('requestFrontSwap:after-flushVisualBackBuffersToFront');
      }
      if (DG_SWAP_DEBUG) console.timeEnd(mark);
      if (DG_DEBUG) drawDebugHUD(['swap: FRONT painted']);
      if (andThen) {
        requestAnimationFrame(andThen);
      }
      dgPaintTrace('requestFrontSwap:raf-end');
    });
  }
  let isRestoring = false;
  const handleInstrumentPersist = () => {
    if (isRestoring) return;
    schedulePersistState({ source: 'instrument-change', bypassGuard: true });
  };
  try { panel.addEventListener('toy-instrument', handleInstrumentPersist); } catch {}

  // Double-buffer + DPR tracking
  let pendingPaintSwap = false;
  const __dgDeviceDpr = Math.max(
    1,
    Math.min(((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1), 3)
  );
  paintDpr = __dgCapDprForBackingStore(cssW, cssH, __dgDeviceDpr, paintDpr);
  let zoomCommitPhase = 'idle';

  // State
  let cols = initialCols;
  currentCols = cols;
  function emitDrawgridUpdate({ activityOnly = false, steps } = {}) {
    const stepCount = Number.isFinite(steps)
      ? steps | 0
      : (Number.isFinite(currentCols) && currentCols > 0
          ? currentCols | 0
          : (currentMap?.nodes?.length ?? 0));
    currentCols = stepCount;
    currentMap = normalizeMapColumns(currentMap, stepCount);
    if (Array.isArray(currentMap.nodes) && Array.isArray(currentMap.active)) {
      for (let c = 0; c < stepCount; c++) {
        const nodes = currentMap.nodes[c] || new Set();
        const dis = currentMap.disabled?.[c] || new Set();
        let anyOn = false;
        if (nodes.size > 0) {
          for (const r of nodes) {
            if (!dis.has(r)) { anyOn = true; break; }
          }
        }
        currentMap.active[c] = anyOn;
      }
    }
    const strokeCount = Array.isArray(strokes) ? strokes.length : 0;
    const trapHydrateFlip =
      DG_HYDRATE.guardActive &&
      prevStrokeCount === 1 &&
      strokeCount === 0 &&
      !DG_HYDRATE.seenUserChange;
    DG.log('emit update', {
      steps: stepCount,
      strokeCount,
      activeCount: currentMap.active?.filter(Boolean).length,
      nonEmptyCols: currentMap.nodes?.reduce((n, s)=>n + (s && s.size ? 1 : 0), 0)
    });
    const updateDetail = { map: currentMap, steps: stepCount, activityOnly };
    if (trapHydrateFlip) {
      if (DG_DEBUG) console.warn('[drawgrid][trap] 1->0 during hydrate window; DROP persist this frame', {
        prevStrokeCount,
        strokeCount,
        guardActive: DG_HYDRATE.guardActive,
        inbound: { ...DG_HYDRATE.inbound },
        seenUserChange: DG_HYDRATE.seenUserChange,
      });
      panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: updateDetail }));
      prevStrokeCount = strokeCount;
      return;
    }
    panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: updateDetail }));
    prevStrokeCount = strokeCount;
    if (!activityOnly) schedulePersistState({ source: 'emit-update' });
  }

  let lastBoardScale = 1;
  let boardScale = 1;
  let zoomMode = 'idle';
  let pendingZoomResnap = false;
  let zoomGestureActive = false;
  const nowMs = () => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  };
  const ZOOM_STALL_MS = 420;
  function extractZoomSnapshot(z) {
    const scale = Number.isFinite(z?.targetScale) ? z.targetScale :
      (Number.isFinite(z?.currentScale) ? z.currentScale : null);
    const x = Number.isFinite(z?.targetX) ? z.targetX :
      (Number.isFinite(z?.currentX) ? z.currentX : null);
    const y = Number.isFinite(z?.targetY) ? z.targetY :
      (Number.isFinite(z?.currentY) ? z.currentY : null);
    return { scale, x, y };
  }
  function getOverlayZoomSnapshot() {
    const camSource = overlayCamState || (typeof getFrameStartState === 'function' ? getFrameStartState() : null);
    const snapshot = extractZoomSnapshot(camSource);
    const fallbackScale = Number.isFinite(boardScale) ? boardScale : 1;
    const rawScale = Number.isFinite(snapshot?.scale) ? snapshot.scale : fallbackScale;
    const clampedScale = Math.max(0.1, rawScale);
    return {
      scale: clampedScale,
      x: Number.isFinite(snapshot?.x) ? snapshot.x : 0,
      y: Number.isFinite(snapshot?.y) ? snapshot.y : 0,
    };
  }
  const initialZoomState = (typeof getZoomState === 'function') ? getZoomState() : null;
  let __zoomActive = false; // true while pinch/wheel gesture is in progress
  let __zoomActiveSince = 0;
  let __dgLastZoomDoneScale = null;
  let __lastZoomMotionTs = 0;
  P.initDrawgridParticles();
  dgField = particleState.field;
  P.installParticleResizeObserver();
  // Suppress header sweep pushes while zoom/pan gestures are active.
  let suppressHeaderPushUntil = 0;
  const HEADER_PUSH_SUPPRESS_MS = 180; // cooldown after zoom motion/commit
  function readHeaderFpsHint() {
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
  function allowHeaderPushDuringGesture() {
    try {
      if (window.__PERF_FORCE_HEADER_SUPPRESS) return false;
      const fps = readHeaderFpsHint();
      return Number.isFinite(fps) && fps >= 52;
    } catch {}
    return false;
  }
  function headerPushSuppressed() {
    try {
      if (window.__PERF_FORCE_HEADER_SUPPRESS) return true;
    } catch {}
    return false;
  }
  let __lastZoomEventTs = 0;
  let __lastZoomSnapshot = extractZoomSnapshot(initialZoomState);
  let __overviewActive = false;
  const zoomFreezeActive = () => {
    if (!__zoomActive) return false;
    const anchor = __lastZoomMotionTs || __zoomActiveSince || __lastZoomEventTs;
    if (!anchor) return true;
    return (nowMs() - anchor) < ZOOM_STALL_MS;
  };
  const dgNonReactive = () => false;
  function resetZoomFreezeTracking() {
    __zoomActiveSince = 0;
    __lastZoomMotionTs = 0;
    __lastZoomSnapshot = extractZoomSnapshot((typeof getZoomState === 'function') ? getZoomState() : null);
  }
  function markZoomActive() {
    const now = nowMs();
    __zoomActiveSince = now;
    if (!__lastZoomMotionTs) {
      __lastZoomMotionTs = now;
    }
  }
  function noteZoomMotion(z) {
    if (!z) return;
    __lastZoomEventTs = nowMs();
    const snapshot = extractZoomSnapshot(z);
    const prev = __lastZoomSnapshot || {};
    const moved =
      (__zoomActive && snapshot.scale != null && prev.scale != null && Math.abs(snapshot.scale - prev.scale) > 1e-4) ||
      (__zoomActive && snapshot.x != null && prev.x != null && Math.abs(snapshot.x - prev.x) > 0.4) ||
      (__zoomActive && snapshot.y != null && prev.y != null && Math.abs(snapshot.y - prev.y) > 0.4);
    if (moved) {
      __lastZoomMotionTs = nowMs();
    }
    if (snapshot.scale != null || snapshot.x != null || snapshot.y != null) {
      __lastZoomSnapshot = snapshot;
    }
  }
  function releaseZoomFreeze({ reason = 'generic', refreshLayout = false, zoomPayload = null } = {}) {
    if (!__zoomActive && zoomMode !== 'gesturing') return;
    if (DG_DEBUG) dglog('zoom-freeze:release', {
      reason,
      since: __zoomActiveSince,
      lastMotion: __lastZoomMotionTs,
      mode: zoomMode
    });
    __zoomActive = false;
    zoomGestureActive = false;
    zoomCommitPhase = 'idle';
    pendingPaintSwap = false;
    pendingSwap = false;
    __dgNeedsUIRefresh = true;
    __dgForceFullDrawUntil = nowMs() + 220;
    __dgBypassCommitUntil = nowMs() + 220;
    __dgForceFullDrawNext = true;
    __dgForceFullDrawFrames = 8;
    __dgForceOverlayClearNext = true;
    __dgForceSwapNext = true;
    __dgStableFramesAfterCommit = 2;
    __dgDeferUntilTs = 0;
    if (__dgPostReleaseRaf) { try { cancelAnimationFrame(__dgPostReleaseRaf); } catch {} }
    __dgPostReleaseRaf = requestAnimationFrame(() => {
      __dgPostReleaseRaf = 0;
      const redrawNow = () => {
        if (!panel?.isConnected) return;
        if (!isPanelVisible) return;
        try {
          markStaticDirty('external-state-change');
          __dgNeedsUIRefresh = true;
          __dgFrontSwapNextDraw = true;
          if (typeof requestFrontSwap === 'function') requestFrontSwap(useFrontBuffers);
        } catch {}
      };
      redrawNow();
      if (__dgPostReleaseRaf2) { try { cancelAnimationFrame(__dgPostReleaseRaf2); } catch {} }
      __dgPostReleaseRaf2 = requestAnimationFrame(() => {
        __dgPostReleaseRaf2 = 0;
        redrawNow();
      });
    });
    zoomMode = zoomPayload?.mode && zoomPayload.mode !== 'gesturing' ? zoomPayload.mode : 'idle';
    try { dgViewport?.setNonReactive?.(null); } catch {}
    resetZoomFreezeTracking();
    __dgFrontSwapNextDraw = true;
    if (refreshLayout) {
      const deferBase = nowMs();
      const deferUntil = deferBase + 160;
      __dgDeferUntilTs = Math.max(__dgDeferUntilTs || 0, deferUntil);
      __dgStableFramesAfterCommit = 0;
      __dgNeedsUIRefresh = true;
      const commitScale = Number.isFinite(zoomPayload?.currentScale)
        ? zoomPayload.currentScale
        : (Number.isFinite(zoomPayload?.targetScale)
          ? zoomPayload.targetScale
          : (Number.isFinite(boardScale) ? boardScale : 1));
      const visualMul = __dgComputeVisualBackingMul(commitScale);
      const pressureMul = (Number.isFinite(__dgPressureDprMul) && __dgPressureDprMul > 0) ? __dgPressureDprMul : 1;
      const layoutSize = getLayoutSize();
      if (layoutSize.w && layoutSize.h) {
        cssW = Math.max(1, layoutSize.w);
        cssH = Math.max(1, layoutSize.h);
        progressMeasureW = cssW;
        progressMeasureH = cssH;
        try { dgViewport?.refreshSize?.({ snap: true }); } catch {}
        // IMPORTANT: zoom-commit refreshLayout must also respect size-based DPR caps.
        // Otherwise a commit can allocate huge backing stores and spike compositor time.
        const deviceDpr = Math.max(
          1,
          Number.isFinite(window?.devicePixelRatio) ? window.devicePixelRatio : 1
        );
        let desiredDpr =
          (typeof __dgAdaptivePaintDpr !== 'undefined' &&
            Number.isFinite(__dgAdaptivePaintDpr) &&
            __dgAdaptivePaintDpr > 0)
            ? __dgAdaptivePaintDpr
            : (Number.isFinite(paintDpr) && paintDpr > 0)
              ? paintDpr
              : Math.max(1, Math.min(deviceDpr, 3));
        desiredDpr = Math.min(deviceDpr, desiredDpr * visualMul * pressureMul);
        const cappedDpr = __dgCapDprForBackingStore(cssW, cssH, desiredDpr, paintDpr);
        paintDpr = cappedDpr;
        resizeSurfacesFor(cssW, cssH, cappedDpr);
      }
      layout(true);
      dglog('zoom:commit', { scale: commitScale, reason });
    }
  }
  function forceReleaseZoomFreeze(reason = 'stall') {
    releaseZoomFreeze({ reason });
  }
  function maybeReleaseStalledZoom() {
    if (!__zoomActive) return;
    const anchor = __lastZoomMotionTs || __zoomActiveSince || __lastZoomEventTs;
    if (!anchor) return;
    if ((nowMs() - anchor) < ZOOM_STALL_MS) return;
    forceReleaseZoomFreeze('stall');
  }
  try { dgViewport?.setNonReactive?.(zoomFreezeActive() ? true : null); } catch {}
  if (initialZoomState) {
    const initialScale =
      initialZoomState.currentScale ?? initialZoomState.targetScale;
    if (Number.isFinite(initialScale)) {
      boardScale = initialScale;
    }
  }
  // Debug helper for Overview tuning
  const DG_OV_DBG = !!(location.search.includes('dgov=1') || localStorage.getItem('DG_OV_DBG') === '1');
  function ovlog(...a){ try { if (DG_OV_DBG) console.debug('[DG][overview]', ...a); } catch {} }

  // Force a front swap after the next successful draw - used on boot and overview toggles.
  let __dgFrontSwapNextDraw = true;
  // Draw a tiny corner probe (debug only) so we can see the visible canvas is active.
  const DG_CORNER_PROBE = !!(location.search.includes('dgprobe=1') || localStorage.getItem('DG_CORNER_PROBE') === '1');

  let __dgLastEnsureSizeChanged = false;
  let __dgLastEnsureSizeAtMs = 0;
  const DG_ENSURE_SIZE_COOLDOWN_MS = 250;
  // Hysteresis: avoid 1-frame resize churn from transient/oscillating CSS measurements.
  let __dgEnsureSizeCandW = 0;
  let __dgEnsureSizeCandH = 0;
  let __dgEnsureSizeCandSinceMs = 0;
  const DG_ENSURE_SIZE_HYSTERESIS_MS = 120;

function ensureSizeReady({ force = false } = {}) {
  let changed = false;
  if (!force && zoomFreezeActive()) return true;
  if (!force && !layoutSizeDirty) return true;
  const nowTs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
  if (!force) {
    try {
      // Never resize surfaces during zoom commit pipeline; it causes backing-store churn.
      if (window.__ZOOM_COMMIT_PHASE) return true;
    } catch {}
  }
  if (!force && HY.inCommitWindow(nowTs)) {
    return true;
  }
  const host = wrap || body || frontCanvas?.parentElement;
  const measured = host ? measureCSSSize(host) : { w: 0, h: 0 };
  let { w, h } = measured;
  if (!w || !h) return false;
  layoutSizeDirty = false;
  // Prevent resize jitter from fractional CSS pixels (and downstream DPR rounding).
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));

  if (!force) {
    // If the measured size flips briefly (e.g. during gesture/zoom settle), wait for it to
    // remain stable for a short window before committing an expensive backing-store resize.
    const wouldChange = (w !== cssW) || (h !== cssH);
    if (wouldChange) {
      const bigDelta = (Math.abs(w - cssW) >= 8) || (Math.abs(h - cssH) >= 8);
      if (!bigDelta) {
        if (__dgEnsureSizeCandW !== w || __dgEnsureSizeCandH !== h) {
          __dgEnsureSizeCandW = w;
          __dgEnsureSizeCandH = h;
          __dgEnsureSizeCandSinceMs = nowTs;
          layoutSizeDirty = true;
          return true;
        }
        if ((nowTs - (__dgEnsureSizeCandSinceMs || 0)) < DG_ENSURE_SIZE_HYSTERESIS_MS) {
          layoutSizeDirty = true;
          return true;
        }
      }
    } else {
      __dgEnsureSizeCandW = 0;
      __dgEnsureSizeCandH = 0;
      __dgEnsureSizeCandSinceMs = 0;
    }
  }

  // Cooldown: avoid repeated backing-store churn during camera/overview turbulence.
  // If we *do* see a size change during cooldown, keep dirty=true so we try again soon.
  if (!force) {
    const dt = nowTs - (__dgLastEnsureSizeAtMs || 0);
    if (dt >= 0 && dt < DG_ENSURE_SIZE_COOLDOWN_MS) {
      // If size would change, defer it to the next window.
      const wouldChange = (w !== cssW) || (h !== cssH);
      if (wouldChange) {
        layoutSizeDirty = true;
      }
      return true;
    }
  }

  // IMPORTANT: "force" should bypass cooldown/hysteresis, but must NOT cause a resize
  // when the size is already correct. Otherwise we churn backing stores and spam
  // [perf][canvas-resize] even at stable dimensions.
  const sizeDiff = (w !== cssW) || (h !== cssH);
  const forceResize = !!force && (cssW === 0 || cssH === 0);
  changed = sizeDiff || forceResize;
  if (changed) {
    dgSizeTrace('ensureSizeReady:apply', {
      force,
      prevCssW: cssW,
      prevCssH: cssH,
      nextCssW: w,
      nextCssH: h,
      sizeDiff,
      forceResize,
    });
    __dgLastEnsureSizeAtMs = nowTs;
    // Snapshot current paint to preserve drawn lines across resize.
    let paintSnapshot = null;
    try {
      const snapSrc = (DG_SINGLE_CANVAS && backCanvas)
        ? backCanvas
        : ((typeof getActivePaintCanvas === 'function' ? getActivePaintCanvas() : paint) || paint);
      if (snapSrc && snapSrc.width > 0 && snapSrc.height > 0) {
        paintSnapshot = document.createElement('canvas');
        paintSnapshot.width = snapSrc.width;
        paintSnapshot.height = snapSrc.height;
        paintSnapshot.getContext('2d')?.drawImage(snapSrc, 0, 0);
      }
    } catch {}

    cssW = w; cssH = h;
    progressMeasureW = cssW; progressMeasureH = cssH;

    try { dgViewport?.refreshSize?.({ snap: true }); } catch {}

    // If ensureSize changes canvas dimensions frequently, this can cause huge nonScript stalls.
    traceCanvasResize(frontCanvas || paint || backCanvas, 'drawgrid.ensureSize');
    const __dprFallback =
      (typeof __dgAdaptivePaintDpr !== 'undefined' && Number.isFinite(__dgAdaptivePaintDpr) && __dgAdaptivePaintDpr > 0)
        ? __dgAdaptivePaintDpr
        : (Number.isFinite(paintDpr) && paintDpr > 0 ? paintDpr : (Number.isFinite(window?.devicePixelRatio) ? window.devicePixelRatio : 1));
    resizeSurfacesFor(cssW, cssH, __dprFallback);
    try { markStaticDirty('ensure-size'); } catch {}
    if (paintSnapshot) {
      try {
        const ctx = (DG_SINGLE_CANVAS && backCtx)
          ? backCtx
          : ((typeof getActivePaintCtx === 'function' ? getActivePaintCtx() : pctx) || pctx);
        if (ctx) {
          resetPaintBlend?.(ctx);
          ctx.clearRect(0, 0, cssW, cssH);
          ctx.drawImage(
            paintSnapshot,
            0, 0, paintSnapshot.width, paintSnapshot.height,
            0, 0, cssW, cssH
          );
        }
      } catch {}
    }

    __dgFrontSwapNextDraw = true;
    dglog('ensureSizeReady:update', { cssW, cssH });
  }
  __dgLastEnsureSizeChanged = changed;
  return true;
}

  function wireOverviewTransitions(panelEl) {
    if (!panelEl) return;
    panelEl.addEventListener('overview:precommit', () => {
      // Particle field handles its own throttling; no extra hooks needed.
    });
    panelEl.addEventListener('overview:commit', () => {
      const t0 = performance?.now?.() ?? Date.now();
      try {
        try { dgViewport?.setNonReactive?.(zoomFreezeActive() ? true : null); } catch {}
        __dgDeferUntilTs = 0;
        __dgStableFramesAfterCommit = 0;
        __dgNeedsUIRefresh = true;
        __dgFrontSwapNextDraw = true;
        const sync = () => {
          try {
            // Mark dirty so ensureSizeReady can resize IF needed, but avoid forced resize
            // (forced resize clears the paint canvas and nukes drawn lines)
        try { markLayoutSizeDirty(); } catch {}
        ensureSizeReady({ force: false });
        const sizeChanged = !!__dgLastEnsureSizeChanged;
        try { if (DG_OV_DBG) console.debug('[DG] overview:commit sizeReady', { sizeChanged, cssW, cssH }); } catch {}
        // Always resnap/redraw to refresh paint + grid in overview, but avoid relayout
        resnapAndRedraw(false, { preservePaintIfNoStrokes: true, skipLayout: true });
        const t1 = performance?.now?.() ?? Date.now();
        try {
          if (DG_OV_DBG) console.debug('[DG][overview] commit redraw ms=', (t1 - t0).toFixed(1), { cssW, cssH, sizeChanged });
        } catch {}
      } catch (err) {
        dglog('overview:commit:sync-error', String((err && err.message) || err));
      }
        };
        requestAnimationFrame(() => requestAnimationFrame(sync));
      } catch (err) {
        dglog('overview:commit:error', String((err && err.message) || err));
      }
    });
  }

  // Zoom signal hygiene
  let lastCommittedScale = boardScale;
  let drawing = false;
  const setDrawingState = (state) => {
    drawing = !!state;
    __dgDrawingActive = !!state;
  };
  setDrawingState(false);
  // The `strokes` array is removed. The paint canvas is now the source of truth.
  let cur = null;
  let strokes = []; // Store all completed stroke objects
  let __dgOverlayStrokeCache = { value: false, len: 0, ts: 0 };
  let __dgOverlayStrokeListCache = { paintRev: -1, len: 0, special: [], colorized: [] };

  function hasOverlayStrokesCached() {
    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    const len = Array.isArray(strokes) ? strokes.length : 0;
    if (__dgOverlayStrokeCache.len === len && (now - (__dgOverlayStrokeCache.ts || 0)) < 120) {
      return __dgOverlayStrokeCache.value;
    }
    let hasOverlay = false;
    for (let i = 0; i < len; i++) {
      const s = strokes[i];
      if (!s) continue;
      if (s.isSpecial || s.overlayColorize) { hasOverlay = true; break; }
    }
    __dgOverlayStrokeCache = { value: hasOverlay, len, ts: now };
    return hasOverlay;
  }
  let prevStrokeCount = Array.isArray(strokes) ? strokes.length : 0;
  // Debug-only: trap suspicious clears that cause 1->0 flips
  let __dbgStrokesProxyInstalled = false;
  (function installStrokesProxyOnce(){
    if (typeof window === 'undefined' || __dbgStrokesProxyInstalled) return;
    try {
      let _strokes = strokes || [];
      Object.defineProperty(window, '__dgGetStrokes', { get: () => _strokes });
      Object.defineProperty(window, '__dgSetStrokes', { value: (v)=>{ _strokes = v; }});
      Object.defineProperty(window, 'strokes', {
        get(){ return _strokes; },
        set(v){
          const prevLen = Array.isArray(_strokes) ? _strokes.length : 0;
          const nextLen = Array.isArray(v) ? v.length : 0;
          if (DG_HYDRATE.guardActive && prevLen === 1 && nextLen === 0 && !DG_HYDRATE.seenUserChange) {
            if (DG_DEBUG) {
              console.warn('[drawgrid][probe] strokes cleared during guard window', { prevLen, nextLen });
              try { console.trace(); } catch {}
            }
          }
          _strokes = v;
        }
      });
      __dbgStrokesProxyInstalled = true;
    } catch {}
  })();
  // DEV SENTINEL: watch for unexpected zeroing of strokes
  let __dgPrevStrokeLen = Array.isArray(strokes) ? strokes.length : 0;
  function __dgCheckStrokeLen(tag) {
    const len = Array.isArray(strokes) ? strokes.length : 0;
    if (__dgPrevStrokeLen > 0 && len === 0) {
      let stackSnippet = null;
      try {
        const stackRaw = (new Error('flip')).stack;
        if (stackRaw) stackSnippet = stackRaw.split('\n').slice(0, 6).join('\n');
      } catch {}
      if (DG_DEBUG) console.warn('[DG][SENTINEL] strokes flipped >0 -> 0', {
        tag,
        prev: __dgPrevStrokeLen,
        now: len,
        stack: stackSnippet,
      });
    }
    __dgPrevStrokeLen = len;
  }
  let cellFlashes = []; // For flashing grid squares on note play
  let noteToggleEffects = []; // For tap feedback ring animations
  let noteBurstEffects = [];  // For short-range radial particle bursts on note hits
  let __dgPaintRev = 0;
  function markPaintDirty() {
    __dgPaintRev = (__dgPaintRev + 1) | 0;
  }

  function spawnNoteRingEffect(cx, cy, baseRadius) {
    const r =
      Math.max(
        6,
        baseRadius ||
          (Number.isFinite(cw) && Number.isFinite(ch)
            ? Math.min(cw, ch) * 0.5
            : 12),
      );
    noteToggleEffects.push({ x: cx, y: cy, radius: r, progress: 0 });

    // Keep a reasonable cap so we don't leak
    if (noteToggleEffects.length > 48) {
      noteToggleEffects.splice(0, noteToggleEffects.length - 48);
    }
  }

  function spawnNoteBurst(cx, cy, baseRadius) {
    // We want small particles that travel about half a grid cell
    const cell =
      (Number.isFinite(cw) && cw > 0)
        ? cw
        : (Number.isFinite(ch) && ch > 0 ? ch : 24);
    const lowFps = __dgLowFpsMode || (() => {
      const fpsSample = Number.isFinite(window.__MT_SM_FPS)
        ? window.__MT_SM_FPS
        : (Number.isFinite(window.__MT_FPS) ? window.__MT_FPS : null);
      return Number.isFinite(fpsSample) && fpsSample <= DG_PLAYHEAD_FPS_SIMPLE_ENTER;
    })();
    const emergency = __dgLowFpsMode;
    const count = emergency ? 20 : (lowFps ? 28 : 48);
    const sizeBoost = emergency ? 2.0 : (lowFps ? 1.7 : 1);
    const lifeBase = emergency ? 0.42 : (lowFps ? 0.55 : 0.8);

    // Travel radius target: ~0.5 of a grid square
    const travelRadius =
      Math.max(
        6,
        baseRadius && baseRadius > 0
          ? baseRadius * 0.5
          : cell * 0.5
      );

    const particles = [];

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;

      // Speed tuned so, over the particle lifetime, they move visibly across the cell
      const speed = travelRadius * (10.0 + Math.random() * 10.0);

      // Bigger jitter so motion is obvious from the start
      const jitter = travelRadius * 0.3 * Math.random();

      particles.push({
        x: cx + Math.cos(angle) * jitter,
        y: cy + Math.sin(angle) * jitter,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        // Enough life so the faster particles can travel visibly
        life: lifeBase,
        // Larger, more obvious dots
        size: (0.25 + Math.random() * 2) * sizeBoost,
      });
    }

    noteBurstEffects.push({ particles });

    // Cap the number of active bursts so we don't leak
    const maxBursts = emergency ? 16 : (lowFps ? 24 : 32);
    if (noteBurstEffects.length > maxBursts) {
      noteBurstEffects.splice(0, noteBurstEffects.length - maxBursts);
    }
  }
  let nodeGroupMap = []; // Per-column Map(row -> groupId or [groupIds]) to avoid cross-line connections and track z-order
  let nextDrawTarget = null; // Per-instance arming for generator buttons (1 or 2).
  let flashes = new Float32Array(cols);
  let __dgHadNodeFlash = false;
  let playheadCol = -1;
  let localLastPhase = 0; // For chain-active race condition
  let manualOverrides = Array.from({ length: initialCols }, () => new Set()); // per-column node rows overridden by drags
  let draggedNode = null; // { col, row, group? }
  let pendingNodeTap = null; // potential tap for toggle
  let pendingActiveMask = null; // preserve active columns across resolution changes
  let dragScaleHighlightCol = null; // column index currently showing pentatonic hints
  let previewGid = null; // 1 or 2 while drawing a special line preview
  const flowState = {
    get panel() { return panel; },
    get usingBackBuffers() { return usingBackBuffers; },
    get __dgSkipSwapsDuringDrag() { return __dgSkipSwapsDuringDrag; },
    get __dgDrawingActive() { return __dgDrawingActive; },
    get cur() { return cur; },
    get previewGid() { return previewGid; },
    get nextDrawTarget() { return nextDrawTarget; },
    get strokes() { return strokes; },
    get currentMap() { return currentMap; },
    get paint() { return paint; },
    get backCanvas() { return backCanvas; },
    get flashCanvas() { return flashCanvas; },
    get flashBackCanvas() { return flashBackCanvas; },
    get getActiveFlashCanvas() { return getActiveFlashCanvas; },
    get hasOverlayStrokesCached() { return hasOverlayStrokesCached; },
    get __dgPaintRev() { return __dgPaintRev; },
    get __dgHydrationPendingRedraw() { return __dgHydrationPendingRedraw; },
    get __dgDeferUntilTs() { return __dgDeferUntilTs; },
    get __dgBypassCommitUntil() { return __dgBypassCommitUntil; },
    get __dgLayerDebugLastTs() { return __dgLayerDebugLastTs; },
    set __dgLayerDebugLastTs(value) { __dgLayerDebugLastTs = value; },
    get __dgLayerTraceLastTs() { return __dgLayerTraceLastTs; },
    set __dgLayerTraceLastTs(value) { __dgLayerTraceLastTs = value; },
    get __dgRegenSource() { return __dgRegenSource; },
    set __dgRegenSource(value) { __dgRegenSource = value; },
    get __dgSampleCanvas() { return __dgSampleCanvas; },
    set __dgSampleCanvas(value) { __dgSampleCanvas = value; },
    get __dgSampleCtx() { return __dgSampleCtx; },
    set __dgSampleCtx(value) { __dgSampleCtx = value; },
    get dgProfileFrames() { return dgProfileFrames; },
    set dgProfileFrames(value) { dgProfileFrames = value; },
    get dgProfileSumMs() { return dgProfileSumMs; },
    set dgProfileSumMs(value) { dgProfileSumMs = value; },
    get dgProfileMinMs() { return dgProfileMinMs; },
    set dgProfileMinMs(value) { dgProfileMinMs = value; },
    get dgProfileMaxMs() { return dgProfileMaxMs; },
    set dgProfileMaxMs(value) { dgProfileMaxMs = value; },
  };
  const getFlowState = () => flowState;
  const F = createDgFlowTrace(getFlowState);
  function __dgMarkSingleCanvasDirty(panel) {
    if (!panel) return;
    panel.__dgCompositeBaseDirty = true;
    panel.__dgSingleCompositeDirty = true;
    FD.maybeLogStall(panel, 'markDirty');
  }
  function __dgMarkSingleCanvasOverlayDirty(panel) {
    if (!panel) return;
    panel.__dgCompositeOverlayDirty = true;
    if (!DG_SINGLE_CANVAS_OVERLAYS) {
      panel.__dgSingleCompositeDirty = true;
    }
    FD.maybeLogStall(panel, 'markDirty');
  }
  function __dgMarkSingleCanvasCompositeDirty(panel) {
    if (!panel) return;
    panel.__dgSingleCompositeDirty = true;
  }
  let persistentDisabled = Array.from({ length: initialCols }, () => new Set()); // survives view changes
  let autoTune = true; // Default to on
  // Proportional safe area so the grid keeps the same relative size at any zoom.
  // Start with ~5% of the smaller dimension; clamp to a sensible px range.
  const SAFE_AREA_FRACTION = 0.05;
  let tutorialHighlightMode = 'none'; // 'none' | 'notes' | 'drag'
  let tutorialHighlightRaf = null;
  let tutorialHighlightOverride = false;
  const isTutorialActive = () => {
    return typeof document !== 'undefined' && !!document.body?.classList?.contains('tutorial-active');
  };
  const isHighlightActive = () => isTutorialActive() || tutorialHighlightOverride;
  const isPanelCulled = () => !isPanelVisible;
  let pendingSwap = false;
  let pendingWrapSize = null;
  let progressMeasureW = 0;
  let progressMeasureH = 0;
  const PROGRESS_SIZE_THRESHOLD = 4;
  const PROGRESS_AREA_THRESHOLD = 64 * 64;

  const initialSize = getLayoutSize();
  if (initialSize.w && initialSize.h) {
    cssW = Math.max(1, initialSize.w);
    cssH = Math.max(1, initialSize.h);
    progressMeasureW = cssW;
    progressMeasureH = cssH;
    resizeSurfacesFor(cssW, cssH, paintDpr);
  }

  ensureSizeReady({ force: true });
  try { refreshHomes({ resetPositions: true }); } catch {}
  try {
    [grid, paint, particleCanvas, ghostCanvas, flashCanvas, nodesCanvas, tutorialCanvas]
      .filter(Boolean)
      .forEach((cv) => {
        const s = cv.style || {};
        if (s.visibility === 'hidden') s.visibility = '';
        if (s.opacity === '0') s.opacity = '';
        if (s.display === 'none') s.display = '';
      });
  } catch {}

  try {
    if (DG_CORNER_PROBE) {
      const ctx = particleCanvas?.getContext?.('2d');
      if (ctx && cssW && cssH) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(0, 0, 3, 3);
        ctx.restore();
      }
    }
    if (typeof requestFrontSwap === 'function') {
      requestFrontSwap();
    }
    __dgNeedsUIRefresh = true;
    __dgStableFramesAfterCommit = 0;
    try {
      markStaticDirty('external-state-change');
    } catch {}
    __dgNeedsUIRefresh = true;
    __dgStableFramesAfterCommit = 0;
  } catch {}

  const __dgGetDrawLabelYRange = () => getDrawLabelYRange?.();

  // --- ghost path helper: off-screen left->right with random Y inside safe area
  function __dgComputeGhostSweepLR() {
    if (!gridArea || gridArea.w <= 0 || gridArea.h <= 0) {
      const fallbackY = gridArea?.y || 0;
      const fallbackX = gridArea?.x || 0;
      return {
        from: { x: fallbackX, y: fallbackY },
        to: { x: fallbackX + (gridArea?.w || 0), y: fallbackY },
        safeMinY: fallbackY,
        safeMaxY: fallbackY,
      };
    }
    // Push the ghost further off-screen so the trail fully exits before fading.
    const marginBase = Math.min(gridArea.w, gridArea.h);
    const margin = Math.max(32, Math.round(marginBase * 0.24));
    const leftX = gridArea.x - margin;
    const rightX = gridArea.x + gridArea.w + margin;
    const cellH = rows > 0 ? gridArea.h / rows : gridArea.h;
    const safeMargin = Math.max(6, Math.round(cellH * 0.5));
    const safeMinY = gridArea.y + safeMargin;
    const safeMaxY = Math.max(safeMinY, gridArea.y + gridArea.h - safeMargin);

    const range = Math.max(1, safeMaxY - safeMinY);
    const startY = Math.round(safeMinY + Math.random() * range);
    const letterRange = __dgGetDrawLabelYRange();
    const crossY = (letterRange && letterRange.maxY > letterRange.minY)
      ? Math.round((Math.max(safeMinY, letterRange.minY) + Math.min(safeMaxY, letterRange.maxY)) * 0.5)
      : Math.round(safeMinY + range * 0.5);

    const clampedY = Math.max(safeMinY, Math.min(safeMaxY, startY));
    return {
      from: { x: leftX, y: clampedY },
      to: { x: rightX, y: clampedY },
      crossY,
      safeMinY,
      safeMaxY,
    };
  }

  wireOverviewTransitions(panel);

  (function wireOverviewTransitionForDrawgrid(){
    try {
      window.addEventListener('overview:transition', (e) => {
        const active = !!e?.detail?.active;
        __overviewActive = active;
        const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        const deferUntil = now + 32;
        __dgDeferUntilTs = Math.max(__dgDeferUntilTs || 0, deferUntil);
        __dgStableFramesAfterCommit = 0;
        __dgNeedsUIRefresh = true;
        dglog('overview:transition', { active });
        try { dgViewport?.setNonReactive?.(zoomFreezeActive() ? true : null); } catch {}
        try { dgViewport?.refreshSize?.({ snap: true }); } catch {}
        try { dgField?.resize?.(); } catch {}
        try {
          // Ensure all layers are visible & transparent
          [grid, paint, particleCanvas, ghostCanvas, flashCanvas, nodesCanvas, tutorialCanvas]
            .filter(Boolean)
            .forEach((cv) => {
              const s = cv.style || {};
              if (s.visibility === 'hidden') s.visibility = '';
              if (s.opacity === '0') s.opacity = '';
              if (s.display === 'none') s.display = '';
              s.background = 'transparent';
            });

          const body = panel.querySelector('.toy-body');
          if (body && body.style) {
            body.style.background = drawToyBg;
          }
          if (panel?.style) {
            panel.style.background = drawToyBg;
            panel.style.backgroundColor = drawToyBg;
          }
          if (wrap && wrap.style) {
            wrap.style.background = drawToyBg;
          }
        } catch {}
        try {
          __dgFrontSwapNextDraw = true;
          __dgNeedsUIRefresh = true;
          __dgStableFramesAfterCommit = 0;

          let __dgGridStart = null;
          if (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf) {
            __dgGridStart = performance.now();
          }
          drawGrid();
          if (__dgGridStart !== null) {
            const __dgGridDt = performance.now() - __dgGridStart;
            try { window.__PerfFrameProf?.mark?.('drawgrid.grid', __dgGridDt); } catch {}
          }

          if (currentMap) {
            let __dgNodesStart = null;
            if (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf) {
              __dgNodesStart = performance.now();
            }
            drawNodes(currentMap.nodes);
            if (__dgNodesStart !== null) {
              const __dgNodesDt = performance.now() - __dgNodesStart;
              try { window.__PerfFrameProf?.mark?.('drawgrid.nodes', __dgNodesDt); } catch {}
            }
          }

          const flashTarget = getActiveFlashCanvas();
          R.resetCtx(fctx);
          R.withLogicalSpace(fctx, () => {
            const { x, y, w, h } = R.getOverlayClearRect({
              canvas: flashTarget,
              pad: R.getOverlayClearPad(),
              allowFull: !!panel.__dgFlashOverlayOutOfGrid,
              gridArea,
            });
            fctx.clearRect(x, y, w, h);
          });
          markFlashLayerCleared();

          const ghostTarget = getActiveGhostCanvas();
          R.resetCtx(ghostCtx);
          R.withLogicalSpace(ghostCtx, () => {
            const { x, y, w, h } = R.getOverlayClearRect({
              canvas: ghostTarget,
              pad: R.getOverlayClearPad() * 1.2,
              gridArea,
            });
            ghostCtx.clearRect(x, y, w, h);
          });
          markGhostLayerCleared();
        } catch {}
        // Don't re-home during overview toggles -- avoids visible lerp.
        // refreshHomes({ resetPositions: false });
        __dgFrontSwapNextDraw = true;
        try {
          if (typeof ovlog === 'function') ovlog('overview:transition handled', { active, cssW, cssH });
        } catch {}
      }, { passive: true });
    } catch {}
  })();

  function headerProgress() {
    try {
      const li = (typeof getLoopInfo === 'function') ? (getLoopInfo() || {}) : {};
      if (Number.isFinite(li.progress)) return li.progress;
      if (Number.isFinite(li.phase01)) return li.phase01;
      if (Number.isFinite(li.step) && Number.isFinite(li.steps) && li.steps > 0) {
        const steps = Math.max(1, li.steps);
        return ((li.step || 0) % steps) / steps;
      }
      const bpmSafe = Math.max(30, Math.min(200, Number.isFinite(bpm) ? bpm : 120));
      const stepCount = Math.max(1, currentCols || initialCols || 8);
      const loopSeconds = (60 / bpmSafe) * stepCount;
      if (!Number.isFinite(loopSeconds) || loopSeconds <= 0) return null;
      const nowMs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      const t = nowMs / 1000;
      return (t % loopSeconds) / loopSeconds;
    } catch {
      return null;
    }
  }

  if (typeof onFrameStart === 'function') {
    unsubscribeFrameStart?.();
    unsubscribeFrameStart = onFrameStart((camState) => {
      overlayCamState = camState; // keep for HUD/other use
      try {
        if (!isRunning?.()) return;
        if (!isActiveInChain) return;
        const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        if (panel.__dgPlayheadLastRenderTs && (now - panel.__dgPlayheadLastRenderTs) < 24) {
          return;
        }
        const prog = headerProgress();
        if (!Number.isFinite(prog)) return;
        const clampedProgress = Math.max(0, Math.min(1, prog));
        const area = (gridArea && gridArea.w > 0 && gridArea.h > 0)
          ? gridArea
          : { x: 0, y: 0, w: cssW || 0, h: cssH || 0 };
        const usableWidth = area?.w || 0;
        if (!Number.isFinite(usableWidth) || usableWidth <= 0) return;
        const startX = area?.x || 0;
        const xToy = startX + clampedProgress * usableWidth;
        FF.pushHeaderSweepAt(xToy);
      } catch {}
    });
  }

  const clearTutorialHighlight = () => {
    if (!tutorialCtx) return;
    R.resetCtx(tutorialCtx);
    R.withLogicalSpace(tutorialCtx, () => {
      const tutorialSurface = getActiveTutorialCanvas();
      if (!tutorialSurface) return;
      const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
      const width = cssW || (tutorialSurface.width ?? 0) / scale;
      const height = cssH || (tutorialSurface.height ?? 0) / scale;
      tutorialCtx.clearRect(0, 0, width, height);
    });
    markTutorialLayerCleared();
  };

  const renderTutorialHighlight = () => {
    if (!tutorialCtx) return;
    const tutorialSurface = getActiveTutorialCanvas();
    R.resetCtx(tutorialCtx);
    R.withLogicalSpace(tutorialCtx, () => {
      const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
      const width = cssW || (tutorialSurface?.width ?? 0) / scale;
      const height = cssH || (tutorialSurface?.height ?? 0) / scale;
      tutorialCtx.clearRect(0, 0, width, height);
      if (tutorialHighlightMode === 'none' || !nodeCoordsForHitTest?.length) {
        markTutorialLayerCleared();
        return;
      }
      markTutorialLayerActive();
      const baseRadius = Math.max(6, Math.min(cw || 0, ch || 0) * 0.55);
      tutorialCtx.save();
      tutorialCtx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      tutorialCtx.shadowBlur = Math.max(4, baseRadius * 0.3);
      const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      const pulsePhase = (now / 480) % (Math.PI * 2);
      const pulseScale = 1 + Math.sin(pulsePhase) * 0.24;
      const highlightNodes = nodeCoordsForHitTest;
      let anchorNode = null;
      if (tutorialHighlightMode === 'drag') {
        const effectiveWidth = (gridArea.w && gridArea.w > 0) ? gridArea.w : (cw * cols);
        const effectiveHeight = (gridArea.h && gridArea.h > 0) ? gridArea.h : (ch * rows);
        const fallbackX = gridArea.x + (effectiveWidth / 2);
        const fallbackY = gridArea.y + topPad + Math.max(0, effectiveHeight - topPad) / 2;
        const activeNode = nodeCoordsForHitTest.find(node => !node?.disabled);
        anchorNode = activeNode || (nodeCoordsForHitTest.length ? nodeCoordsForHitTest[0] : { x: fallbackX, y: fallbackY });
      }

      highlightNodes.forEach((node) => {
        if (!node) return;
        tutorialCtx.globalAlpha = node.disabled ? 0.45 : 1;
        tutorialCtx.lineWidth = Math.max(2, baseRadius * 0.22);
        tutorialCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        tutorialCtx.beginPath();
        tutorialCtx.arc(node.x, node.y, baseRadius * pulseScale, 0, Math.PI * 2);
        tutorialCtx.stroke();
      });

      if (tutorialHighlightMode === 'drag' && anchorNode) {
        const bob = Math.sin(now / 420) * Math.min(12, ch * 0.35);
        const arrowColor = 'rgba(255, 255, 255, 0.9)';
        const arrowWidth = Math.max(10, Math.min(cw, ch) * 0.45);
        const arrowHeight = arrowWidth * 1.25;

        const drawArrow = (x, y, direction) => {
          tutorialCtx.beginPath();
          if (direction < 0) {
            tutorialCtx.moveTo(x, y);
            tutorialCtx.lineTo(x - arrowWidth * 0.5, y + arrowHeight);
            tutorialCtx.lineTo(x + arrowWidth * 0.5, y + arrowHeight);
          } else {
            tutorialCtx.moveTo(x, y);
            tutorialCtx.lineTo(x - arrowWidth * 0.5, y - arrowHeight);
            tutorialCtx.lineTo(x + arrowWidth * 0.5, y - arrowHeight);
          }
          tutorialCtx.closePath();
          tutorialCtx.globalAlpha = 0.9;
          tutorialCtx.fillStyle = arrowColor;
          tutorialCtx.fill();
        };

        highlightNodes.forEach((node) => {
          if (!node) return;
          const topY = node.y - baseRadius - arrowHeight - 16 - bob;
          const bottomY = node.y + baseRadius + arrowHeight + 16 + bob;
          drawArrow(node.x, topY, -1);
          drawArrow(node.x, bottomY, 1);
        });
        tutorialCtx.globalAlpha = 1;
      }
      tutorialCtx.restore();
      tutorialCtx.shadowBlur = 0;
      tutorialCtx.globalAlpha = 1;
    });
  };

  const startTutorialHighlightLoop = () => {
    if (tutorialHighlightMode === 'none') return;
    if (!isHighlightActive() || isPanelCulled()) return;
    if (tutorialHighlightRaf !== null) return;
    const tick = () => {
      if (tutorialHighlightMode === 'none' || !isTutorialActive() || isPanelCulled()) {
        tutorialHighlightRaf = null;
        return;
      }
      renderTutorialHighlight();
      tutorialHighlightRaf = requestAnimationFrame(tick);
    };
    renderTutorialHighlight();
    tutorialHighlightRaf = requestAnimationFrame(tick);
  };

  const stopTutorialHighlightLoop = () => {
    if (tutorialHighlightRaf !== null) {
      cancelAnimationFrame(tutorialHighlightRaf);
      tutorialHighlightRaf = null;
    }
    clearTutorialHighlight();
  };

  panel.setSwipeVisible = (show, { immediate = false } = {}) => {
  __forceSwipeVisible = !!show;
};

  function syncLetterFade({ immediate = false } = {}) {
    // Legacy hook retained for future use; no-op now that particles manage themselves.
  }

  if (!panel.__drawgridHelpModeChecker) {
    panel.__drawgridHelpModeChecker = setInterval(() => {
      const imm = !zoomGestureActive; // never force during gesture
      syncLetterFade({ immediate: imm });
    }, 250);
  }

  panel.dataset.steps = String(cols);

  panel.dataset.steps = String(cols);

  const { updateGeneratorButtons } = installGeneratorButtons(panel, {
    getNextDrawTarget: () => nextDrawTarget,
    setNextDrawTarget: (value) => { nextDrawTarget = value; },
    getStrokes: () => strokes,
    getAutoTune: () => autoTune,
    setAutoTune: (value) => { autoTune = !!value; },
    resnapAndRedraw,
    getCols: () => cols,
    setCols: (value) => { cols = value; },
    setCurrentCols: (value) => { currentCols = value; },
    setFlashes: (value) => { flashes = value; },
    setPendingActiveMask: (value) => { pendingActiveMask = value; },
    setManualOverrides: (value) => { manualOverrides = value; },
    setPersistentDisabled: (value) => { persistentDisabled = value; },
    getCurrentMapActive: () => (currentMap?.active ? [...currentMap.active] : null),
  });

  // New central helper to redraw the paint canvas and regenerate the node map from the `strokes` array.
  function clearAndRedrawFromStrokes(targetCtx, reason) {
    return F.perfMarkSection('drawgrid.paint.redraw', () => {
      if (reason) FD.markRegenSource(reason);
      const resolvedTarget = (DG_SINGLE_CANVAS && targetCtx === frontCtx) ? backCtx : targetCtx;
      const ctx = resolvedTarget || (typeof getActivePaintCtx === 'function' ? getActivePaintCtx() : null) || backCtx || pctx;
      if (!ctx) return;
      dgPaintTrace('clearAndRedrawFromStrokes:enter', {
        ctxIsFront: ctx === frontCtx,
        ctxIsBack: ctx === backCtx,
        canvasW: ctx?.canvas?.width || 0,
        canvasH: ctx?.canvas?.height || 0
      });
      if (DG_LAYOUT_DEBUG) {
        const expectedW = Math.max(1, Math.round(cssW * paintDpr));
        const expectedH = Math.max(1, Math.round(cssH * paintDpr));
        if (ctx.canvas?.width !== expectedW || ctx.canvas?.height !== expectedH) {
          debugPaintSizes('clearAndRedrawFromStrokes:canvas-mismatch', { ctxW: ctx.canvas?.width, ctxH: ctx.canvas?.height });
        }
      }
      const normalStrokes = strokes.filter(s => !s.justCreated);
      const newStrokes = strokes.filter(s => s.justCreated);
      R.resetCtx(ctx);
      R.withLogicalSpace(ctx, () => {
        const surface = ctx.canvas;
        const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
        const width = cssW || (surface?.width ?? 0) / scale;
        const height = cssH || (surface?.height ?? 0) / scale;
        ctx.clearRect(0, 0, width, height);
        dgPaintTrace('clearAndRedrawFromStrokes:about-to-draw', { paintDpr, cssW, cssH });

        // 1. Draw all existing, non-new strokes first.
        for (const s of normalStrokes) {
          drawFullStroke(ctx, s);
        }
        // 2. Draw the brand new strokes on top.
        for (const s of newStrokes) {
          drawFullStroke(ctx, s);
        }
      });

      regenerateMapFromStrokes();
      try { (panel.__dgUpdateButtons || updateGeneratorButtons || function(){})() } catch(e) { }
      syncLetterFade();
      __dgMarkSingleCanvasDirty(panel);
      if (DG_SINGLE_CANVAS) {
        try { compositeSingleCanvas(); } catch {}
      }
        if (!DG_SINGLE_CANVAS && usingBackBuffers) {
          pendingPaintSwap = true;
          requestFrontSwap();
        }
        markPaintDirty();
        dgPaintTrace('clearAndRedrawFromStrokes:exit');
      });
    }

  function drawIntoBackOnly(includeCurrentStroke = false) {
    if (!backCtx || !cssW || !cssH) return;
    clearAndRedrawFromStrokes(backCtx, 'zoom-recompute-back');
    if (includeCurrentStroke && cur && Array.isArray(cur.pts) && cur.pts.length > 0) {
      drawFullStroke(backCtx, cur);
    }
    __dgMarkSingleCanvasDirty(panel);
    if (!DG_SINGLE_CANVAS) {
      pendingPaintSwap = true;
    }
  }

  /**
   * Processes a single generator stroke, fills in gaps to create a full line,
   * and marks the interpolated nodes as disabled.
   */
  function processGeneratorStroke(stroke, newMap, newGroups) {
    const partial = snapToGridFromStroke(stroke);
    const filledNodes = fillGapsInNodeArray(partial.nodes, cols);

    for (let c = 0; c < cols; c++) {
        if (filledNodes[c]?.size > 0) {
            filledNodes[c].forEach(row => {
                newMap.nodes[c].add(row);
                if (stroke.generatorId) {
                    const stack = newGroups[c].get(row) || [];
                    if (!stack.includes(stroke.generatorId)) stack.push(stroke.generatorId);
                    newGroups[c].set(row, stack);
                }
            });

            if (partial.nodes[c]?.size === 0) {
                if (!newMap.disabled[c]) newMap.disabled[c] = new Set();
                filledNodes[c].forEach(row => newMap.disabled[c].add(row));
            }
            // Add any nodes that were explicitly marked as disabled by the snapping logic (e.g., out of bounds)
            if (partial.disabled && partial.disabled[c]?.size > 0) {
                if (!newMap.disabled[c]) newMap.disabled[c] = new Set();
                partial.disabled[c].forEach(row => newMap.disabled[c].add(row));
            }
        }
    }
  }

  // Regenerates the node map by snapping all generator strokes.
function regenerateMapFromStrokes() {
      const isZoomed = panel.classList.contains('toy-zoomed');
      const newMap = { active: Array(cols).fill(false), nodes: Array.from({ length: cols }, () => new Set()), disabled: Array.from({ length: cols }, () => new Set()) };
      const newGroups = Array.from({ length: cols }, () => new Map());

      if (isZoomed) {
        // Advanced view: snap each generator line separately and union nodes.
        const gens = strokes.filter(s => s.generatorId);
        gens.forEach(s => processGeneratorStroke(s, newMap, newGroups));
      } else {
        // Standard view: keep a single generator line to avoid double nodes.
        const gens = strokes.filter(s => s.generatorId);
        if (gens.length > 0){
          const specialGen = gens.find(s => s.isSpecial) || gens[gens.length - 1];
          if (specialGen) processGeneratorStroke(specialGen, newMap, newGroups);
        } else {
          // Prefer a special stroke, otherwise use the latest stroke.
          const specialStroke = strokes.find(s => s.isSpecial) || (strokes.length ? strokes[strokes.length - 1] : null);
          if (specialStroke) processGeneratorStroke(specialStroke, newMap, newGroups);
        }
        // ...manual overrides (unchanged)...
        try {
          if (manualOverrides && Array.isArray(manualOverrides)) {
            for (let c = 0; c < cols; c++) {
              const ov = manualOverrides[c];
              if (ov && ov.size > 0) {
                newMap.nodes[c] = new Set(ov);
                // recompute active based on disabled set
                const dis = newMap.disabled?.[c] || new Set();
                const anyOn = Array.from(newMap.nodes[c]).some(r => !dis.has(r));
                newMap.active[c] = anyOn;
                // carry over groups from nodeGroupMap so we still avoid cross-line connections
                if (nodeGroupMap && nodeGroupMap[c] instanceof Map) {
                  for (const r of newMap.nodes[c]) {
                    const g = nodeGroupMap[c].get(r);
                    if (g != null) {
                      const stack = Array.isArray(g) ? g.slice() : [g];
                      newGroups[c].set(r, stack);
                    }
                  }
                }
              }
            }
          }
        } catch {}
      }

      // Finalize active mask: a column is active if it has at least one non-disabled node
      for (let c = 0; c < cols; c++) {
        const nodes = newMap.nodes?.[c] || new Set();
        const dis = newMap.disabled?.[c] || new Set();
        let anyOn = false;
        if (nodes.size > 0) {
          for (const r of nodes) { if (!dis.has(r)) { anyOn = true; break; } }
        }
        newMap.active[c] = anyOn;
      }

      // If NOTHING is active but there are nodes, default to active for columns that have nodes.
      if (!newMap.active.some(Boolean)) {
        for (let c = 0; c < cols; c++) {
          if ((newMap.nodes?.[c] || new Set()).size > 0) newMap.active[c] = true;
        }
      }

      // If a pending active mask exists (e.g., after steps change), map it to new cols
      if (pendingActiveMask && Array.isArray(pendingActiveMask.prevActive)) {
        const prevCols = pendingActiveMask.prevCols || newMap.active.length;
        const prevActive = pendingActiveMask.prevActive;
        const newCols = cols;
        const mapped = Array(newCols).fill(false);
        if (prevCols === newCols) {
          for (let i = 0; i < newCols; i++) mapped[i] = !!prevActive[i];
        } else if (newCols > prevCols && newCols % prevCols === 0) { // Upscaling (e.g., 8 -> 16)
          const factor = newCols / prevCols;
          for (let i = 0; i < prevCols; i++) {
            for (let j = 0; j < factor; j++) mapped[i * factor + j] = !!prevActive[i];
          }
        } else if (prevCols > newCols && prevCols % newCols === 0) { // Downscaling (e.g., 16 -> 8)
          const factor = prevCols / newCols;
          for (let i = 0; i < newCols; i++) {
            let any = false;
            for (let j = 0; j < factor; j++) any = any || !!prevActive[i * factor + j];
            mapped[i] = any;
          }
        } else {
          // fallback proportional map
          for (let i = 0; i < newCols; i++) {
            const src = Math.floor(i * prevCols / newCols);
            mapped[i] = !!prevActive[src];
          }
        }
        newMap.active = mapped;
        // Rebuild the disabled sets based on the new active state
        for (let c = 0; c < newCols; c++) {
            if (newMap.active[c]) {
                newMap.disabled[c].clear();
            } else if (newMap.nodes[c]) {
                newMap.nodes[c].forEach(r => newMap.disabled[c].add(r));
            }
        }
        pendingActiveMask = null; // consume
      } else {
          // Preserve disabled nodes from the persistent set where positions still exist
          for (let c = 0; c < cols; c++) {
            const prevDis = persistentDisabled[c] || new Set();
            for (const r of prevDis) {
              if (newMap.nodes[c]?.has(r)) newMap.disabled[c].add(r);
            }
          }
      }

      const regenSource = __dgRegenSource || 'unknown';
      __dgRegenSource = '';
      if (DG_DEBUG) {
        console.log('[DG][regen]', {
          panelId: panel?.id || null,
          source: regenSource,
          strokes: Array.isArray(strokes) ? strokes.length : 0,
          generators: Array.isArray(strokes) ? strokes.filter(s => s && s.generatorId).length : 0,
          cols: cols,
          nodeCount: newMap.nodes.reduce((n, s) => n + (s?.size || 0), 0),
        });
      }
      DG.log('rebuild map', {
        cols: newMap.nodes.length,
        activeCount: newMap.active.filter(Boolean).length
      });

      const prevActive = currentMap?.active ? currentMap.active.slice() : null;
      const prevNodes = currentMap?.nodes ? currentMap.nodes.map(s => s ? new Set(s) : new Set()) : null;

      currentMap = newMap;
      nodeGroupMap = newGroups;
      persistentDisabled = currentMap.disabled; // Update persistent set
      try { (panel.__dgUpdateButtons || function(){})() } catch {}

      let didChange = true;
      if (prevActive && Array.isArray(currentMap.active) && prevActive.length === currentMap.active.length){
        didChange = currentMap.active.some((v,i)=> v !== prevActive[i]);
        if (!didChange && prevNodes && Array.isArray(currentMap.nodes) && prevNodes.length === currentMap.nodes.length){
          didChange = currentMap.nodes.some((set,i)=>{
            const a = prevNodes[i], b = set || new Set();
            if (a.size !== b.size) return true;
            for (const v of a) if (!b.has(v)) return true;
            return false;
          });
        }
      }

      if (didChange){
        emitDrawgridUpdate({ activityOnly: false });
      } else {
        // noise-free activity: do not notify the guide as a progress update
        emitDrawgridUpdate({ activityOnly: true });
      }

      try {
        dgTraceLog('[drawgrid] drawNodes', panel.id, {
          cols: currentCols,
          nodesCols: currentMap?.nodes?.length ?? 0,
        });
      } catch {}
      drawNodes(currentMap.nodes);
      drawGrid();
      if (DG_SINGLE_CANVAS) {
        __dgMarkSingleCanvasDirty(panel);
        try { compositeSingleCanvas(); } catch {}
      }
  }

  function capturePaintSnapshot() {
    try {
      const snapSrc = (DG_SINGLE_CANVAS && backCanvas) ? backCanvas : paint;
      if (snapSrc && snapSrc.width > 0 && snapSrc.height > 0) {
        const snap = document.createElement('canvas');
        snap.width = snapSrc.width;
        snap.height = snapSrc.height;
        snap.getContext('2d')?.drawImage(snapSrc, 0, 0);
        return snap;
      }
    } catch {}
    return null;
  }

  function restorePaintSnapshot(snap) {
    if (!snap) return;
    try {
      updatePaintBackingStores({ target: usingBackBuffers ? 'back' : 'both' });
      pctx = getActivePaintCtx();
      resetPaintBlend(pctx);
      R.clearCanvas(pctx);
      emitDG('paint-clear', { reason: 'restore-snapshot' });
      R.resetCtx(pctx);
      R.resetCtx(pctx);
      R.withLogicalSpace(pctx, () => {
        pctx.drawImage(snap, 0, 0, snap.width, snap.height, 0, 0, cssW, cssH);
        markPaintDirty();
      });
    } catch {}
  }

  function scheduleZoomRecompute() {
    if (zoomRAF) return;
    zoomRAF = requestAnimationFrame(() => {
      zoomRAF = 0;
      try {
        if (window.__ZOOM_COMMIT_PHASE) return;
      } catch {}
      {
        const deviceDpr = Math.max(1, Number.isFinite(window?.devicePixelRatio) ? window.devicePixelRatio : 1);
        const visualMul = __dgComputeVisualBackingMul(Number.isFinite(boardScale) ? boardScale : 1);
        const pressureMul = (Number.isFinite(__dgPressureDprMul) && __dgPressureDprMul > 0) ? __dgPressureDprMul : 1;
        // Prefer the most recent adaptive DPR (already includes non-gesture caps),
        // then apply size-based capping to avoid huge backing stores.
        let desiredDpr =
          (Number.isFinite(__dgAdaptivePaintDpr) && __dgAdaptivePaintDpr > 0)
            ? __dgAdaptivePaintDpr
            : Math.max(1, Math.min(deviceDpr, 3));
        desiredDpr = Math.min(deviceDpr, desiredDpr * visualMul * pressureMul);
        paintDpr = __dgCapDprForBackingStore(cssW, cssH, desiredDpr, paintDpr);
      }
      pendingZoomResnap = false;

      // IMPORTANT:
      // Zoom recompute can rebuild/resize backing stores (and resnap can clear paint if it
      // thinks there's "no content"). In DrawGrid, the paint canvas may be the source of truth,
      // so we must preserve it across this path.
      const snap = capturePaintSnapshot();
      const hadInk = !!snap;
      const hadStrokes = Array.isArray(strokes) && strokes.length > 0;
      const hadNodes =
        currentMap &&
        Array.isArray(currentMap.nodes) &&
        currentMap.nodes.some(set => set && set.size > 0);

      useBackBuffers();
      updatePaintBackingStores({ force: true, target: 'back' });

      // If paint is non-empty but there are no reconstructible sources, never clear it here.
      resnapAndRedraw(true, { preservePaintIfNoStrokes: hadInk && !hadStrokes && !hadNodes });

      // After backing-store churn, restore paint if it was our only source of truth.
      if (hadInk && !hadStrokes && !hadNodes) {
        restorePaintSnapshot(snap);
      }
      drawIntoBackOnly();
      pendingSwap = true;
    });
  }

  const handleZoom = (z = {}) => {
    __lastZoomEventTs = nowMs();
    noteZoomMotion(z);
    __auditZoomSizes('zoom-change');
    const phase = z?.phase;
    const mode = z?.mode;
    if (mode) {
      zoomMode = mode;
    }
    const currentlyGesturing = zoomMode === 'gesturing';
    if (currentlyGesturing && !__zoomActive) {
      __zoomActive = true;
      markZoomActive();
      zoomGestureActive = true;
      try { dgViewport?.setNonReactive?.(true); } catch {}
    } else if (!currentlyGesturing && !phase && __zoomActive && zoomMode === 'idle') {
      suppressHeaderPushUntil = nowMs() + HEADER_PUSH_SUPPRESS_MS;
      releaseZoomFreeze({ reason: 'mode-idle', zoomPayload: z });
    } else {
      zoomGestureActive = currentlyGesturing;
    }

    if (phase === 'begin') {
      if (!__zoomActive) {
        __zoomActive = true;
        zoomGestureActive = true;
        markZoomActive();
      }
      try { dgViewport?.setNonReactive?.(true); } catch {}
      const beginScale = Number.isFinite(z?.currentScale) ? z.currentScale : (Number.isFinite(z?.targetScale) ? z.targetScale : null);
      dglog('zoom:begin', { scale: beginScale });
      suppressHeaderPushUntil = nowMs() + HEADER_PUSH_SUPPRESS_MS;
      return;
    }

    if (phase === 'commit' || phase === 'idle' || phase === 'done') {
      markLayoutSizeDirty();
      try { particles?.snapAllToHomes?.(); } catch {}
      suppressHeaderPushUntil = nowMs() + HEADER_PUSH_SUPPRESS_MS;

      // Let ZoomCoordinator know we're done with the freeze,
      // but only request a heavy layout on 'done'.
      releaseZoomFreeze({
        reason: `phase-${phase}`,
        refreshLayout: phase === 'done',
        zoomPayload: z
      });

      if (phase === 'done') {
        // Ensure we end commit on front buffers so paint isn't stuck scaled in back buffers.
        try { useFrontBuffers(); } catch {}
        // Only do heavy layout + field resize once commit fully settles.
        try { layout(true); } catch {}
        try { dgField?.resize?.(); } catch {}
        layoutSizeDirty = true;
        ensureSizeReady({ force: true });
        const zoomSnapshot = extractZoomSnapshot(z);
        const doneScale = Number.isFinite(zoomSnapshot?.scale) ? zoomSnapshot.scale : null;
        const scaleChanged =
          Number.isFinite(doneScale) &&
          (!Number.isFinite(__dgLastZoomDoneScale) || Math.abs(doneScale - __dgLastZoomDoneScale) > 1e-4) &&
          (Number.isFinite(lastCommittedScale) ? Math.abs(doneScale - lastCommittedScale) > 1e-4 : true);
        if (Number.isFinite(doneScale)) {
          __dgLastZoomDoneScale = doneScale;
        }
        if (scaleChanged && Array.isArray(strokes) && strokes.length > 0) {
          try { clearAndRedrawFromStrokes(DG_SINGLE_CANVAS ? backCtx : frontCtx, 'zoom-done'); } catch {}
          try { ensureBackVisualsFreshFromFront?.(); } catch {}
          try { markStaticDirty('zoom-done'); } catch {}
          __dgForceFullDrawNext = true;
        }
      }

      return;
    }
  };

  // Tag for zoom profiling readability
  handleZoom.__zcName = `drawgrid:${panel.id || 'unknown'}`;
  const unsubscribeZoom = onZoomChange(namedZoomListener('drawgrid:zoom', handleZoom));

  let zoomRAF = null;

function resnapAndRedraw(forceLayout = false, opts = {}) {
    const preservePaintIfNoStrokes = !!opts.preservePaintIfNoStrokes;
    const skipLayout = !!opts.skipLayout;
    if (zoomMode === 'gesturing' && !forceLayout) {
      pendingZoomResnap = true;
      return;
    }
    if (!isPanelVisible && !forceLayout) {
      pendingResnapOnVisible = true;
      return;
    }

    const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (!forceLayout && (nowTs - lastResnapTs) < 50) {
      // Too soon; coalesce into a single resnap after the cooldown.
      pendingResnapOnVisible = true;
      return;
    }
    lastResnapTs = nowTs;

    const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
    const hasNodes =
      currentMap &&
      Array.isArray(currentMap.nodes) &&
      currentMap.nodes.some(set => set && set.size > 0);

    syncLetterFade({ immediate: true });
    if (!skipLayout) {
      layout(!!forceLayout);
    }

    requestAnimationFrame(() => {
      if (!panel.isConnected) return;
      __dgNeedsUIRefresh = true;
      __dgStableFramesAfterCommit = 0;

      if (hasStrokes) {
        FD.markRegenSource('resnap');
        regenerateMapFromStrokes();
        R.resetCtx(pctx);
        R.withLogicalSpace(pctx, () => {
          R.clearCanvas(pctx);
          emitDG('paint-clear', { reason: 'resnap-redraw' });
          for (const s of strokes) {
            drawFullStroke(pctx, s);
          }
        });
        if (DG_SINGLE_CANVAS) {
          __dgMarkSingleCanvasDirty(panel);
          try { compositeSingleCanvas(); } catch {}
          panel.__dgSingleCompositeDirty = false;
        }
        updateGeneratorButtons();
        return;
      }

      if (hasNodes) {
        drawGrid();
        drawNodes(currentMap.nodes);
        if (DG_SINGLE_CANVAS) {
          __dgMarkSingleCanvasDirty(panel);
          try { compositeSingleCanvas(); } catch {}
          panel.__dgSingleCompositeDirty = false;
        }
        emitDrawgridUpdate({ activityOnly: false });
        updateGeneratorButtons();
        return;
      }

      const inboundNonEmpty = inboundWasNonEmpty();
      if (preservePaintIfNoStrokes) {
        dgTraceWarn('[drawgrid][resnap] preserve paint (no strokes/nodes)', {
          guardActive: DG_HYDRATE.guardActive,
          inboundNonEmpty,
        });
        updateGeneratorButtons();
        return;
      }
      if (!inboundNonEmpty && !DG_HYDRATE.guardActive) {
        api.clear({ reason: 'resnap-empty' });
      } else {
        dgTraceWarn('[drawgrid][boot] skip clear', {
          reason: 'resnap-empty',
          guardActive: DG_HYDRATE.guardActive,
          inboundNonEmpty,
        });
      }
      updateGeneratorButtons();
    });
  }




  panel.addEventListener('toy-zoom', (e)=>{
    const z = e?.detail;
    if (!z) return;

    if (z.phase === 'prepare') {
      zoomGestureActive = true;
      zoomMode = 'gesturing';
      // during gesture we render via CSS transforms only
      useBackBuffers();
      return;
    }

  if (z.phase === 'recompute') {
    // During gesture, we rely on CSS transforms; schedule a resnap so the
    // backing stores catch up safely outside the current event.
    // dglog('toy-zoom:recompute', { zoomGestureActive, zoomMode, __zoomActive, __overviewActive });
    scheduleZoomRecompute();
    return;
  }

    if (z.phase === 'commit') {
      // one-time swap & finalize
      useFrontBuffers();
      // copy ghost back -> front exactly once after swap
      const front = ghostFrontCtx?.canvas, back = ghostBackCtx?.canvas;
      if (front && back) {
        R.withDeviceSpace(ghostFrontCtx, () => ghostFrontCtx.drawImage(back, 0, 0, back.width, back.height, 0, 0, front.width, front.height));
      }
      // NEW: also copy other overlays back -> front once to avoid a 1-frame size pop
      copyCanvas(gridBackCtx,      gridFrontCtx);
      emitDG('blit', { from: 'back', to: 'front', layer: 'grid' });
      copyCanvas(nodesBackCtx,     nodesFrontCtx);
      emitDG('blit', { from: 'back', to: 'front', layer: 'nodes' });
      copyCanvas(flashBackCtx,     flashFrontCtx);
      emitDG('blit', { from: 'back', to: 'front', layer: 'flash' });
      copyCanvas(tutorialBackCtx,  tutorialFrontCtx);
      emitDG('blit', { from: 'back', to: 'front', layer: 'tutorial' });

      resnapAndRedraw(true);
      try { clearAndRedrawFromStrokes(pctx, 'zoom-commit'); } catch {}
      try { markStaticDirty('zoom-commit'); } catch {}
      __dgForceFullDrawNext = true;
      zoomGestureActive = false;
      zoomMode = 'idle'; // ensure we fully exit zoom mode 
      lastCommittedScale = boardScale;
      return;
    }
  });

  // PERF: ResizeObserver can fire repeatedly even when the effective layout size didn't change
  // (or when changes are sub-pixel / shadow-only). Treating every callback as "dirty" can
  // create a feedback loop: markLayoutSizeDirty -> ensureSizeReady -> resizeSurfacesFor -> RO.
  let __dgLastObservedBodyW = 0;
  let __dgLastObservedBodyH = 0;
  const observer = new ResizeObserver(() => {
    // Prefer cheap size reads; avoid getBoundingClientRect here.
    const w = body?.clientWidth || body?.offsetWidth || 0;
    const h = body?.clientHeight || body?.offsetHeight || 0;
    if (w > 0 && h > 0) {
      if (w === __dgLastObservedBodyW && h === __dgLastObservedBodyH) {
        return; // ignore spurious callback
      }
      __dgLastObservedBodyW = w;
      __dgLastObservedBodyH = h;
    }

    markLayoutSizeDirty();
    if (zoomMode === 'gesturing') {
      pendingZoomResnap = true;
      return;
    }
    resnapAndRedraw(false);
  });

  // Visibility culling: turn off heavy work when the panel is completely offscreen.
  // Hard-cull should treat "barely intersecting" as not visible, otherwise
  // toys keep their rAF loop alive while only a tiny sliver is on-screen.
  if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
    try {
      let lastVisibleState = isPanelVisible;
      let visRoot = null;
      try {
        visRoot = panel?.closest?.('.board-viewport') || null;
      } catch {}
      const visObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.target !== panel) continue;
            // Require a minimum intersection ratio to count as visible.
            const visible =
              entry.isIntersecting &&
              (typeof entry.intersectionRatio !== 'number'
                ? true
                : entry.intersectionRatio >= DG_VISIBILITY_THRESHOLD);
            isPanelVisible = !!visible;
            try {
              const debugCull = (typeof window !== 'undefined' && window.__DG_DEBUG_CULL);
              if (debugCull && isPanelVisible !== lastVisibleState) {
                console.log('[DG][cull] VIS', {
                  panelId: panel?.id || null,
                  from: lastVisibleState,
                  to: isPanelVisible,
                  ratio: entry?.intersectionRatio,
                  isIntersecting: entry?.isIntersecting,
                });
              }
            } catch {}
            const becameVisible = (isPanelVisible && !lastVisibleState);
            if (becameVisible) {
              // Force a real redraw/composite the moment we come back on-screen.
              try {
                __dgMarkSingleCanvasDirty(panel);
                panel.__dgSingleCompositeDirty = true;
                panel.__dgCompositeBaseDirty = true;
                panel.__dgCompositeOverlayDirty = true;
              } catch {}

              // Restart the per-panel render loop if it was hard-culled while offscreen.
              ensureRenderLoopRunning();

              try { __dgForceFullDrawNext = true; } catch {}
              try { __dgForceFullDrawUntil = nowMs() + 200; } catch {}

              // If we're using the single-canvas path, actually run it once immediately.
              try {
                if (DG_SINGLE_CANVAS) {
                  requestAnimationFrame(() => {
                    try { compositeSingleCanvas(); } catch {}
                    try { panel.__dgSingleCompositeDirty = false; } catch {}
                  });
                }
              } catch {}
            }
            if (isPanelVisible && pendingResnapOnVisible) {
              pendingResnapOnVisible = false;
              resnapAndRedraw(true);
            }
            updateGlobalVisibility(isPanelVisible);
            if (isPanelVisible && drawLabelState.drawLabelVisible) {
              ensureLetterPhysicsLoop();
            }
            if (isPanelVisible !== lastVisibleState) {
              lastVisibleState = isPanelVisible;
              try {
                drawgridLog('[DG][cull] visibility change', {
                  id: panel.id || null,
                  visible: isPanelVisible,
                  ratio: Number.isFinite(entry.intersectionRatio)
                    ? Number(entry.intersectionRatio.toFixed(3))
                    : null,
                });
              } catch {}
            }
          }
        },
        {
          root: visRoot,
          threshold: [0, DG_VISIBILITY_THRESHOLD],
        }
      );
      visObserver.observe(panel);
      panel.__dgVisibilityObserver = visObserver;
    } catch (e) {
      // If anything goes wrong, assume visible so we don't break rendering
      isPanelVisible = true;
    }
  }

  // IMPORTANT: ensure there is NOT a second/duplicate IntersectionObserver visibility block
  // elsewhere in this file. If one exists (often using `entry.intersectionRatio > DG_VISIBILITY_THRESHOLD`
  // without the "minimum ratio" comment), delete it. Having two observers causes conflicting
  // isPanelVisible updates and makes panels become "visible" at ~1-2%.
  // Also respond to generic toy visibility events (shared culler)
  panel.addEventListener('toy:visibility', (e) => {
    if (typeof e?.detail?.visible === 'boolean') {
      isPanelVisible = !!e.detail.visible;
      updateGlobalVisibility(isPanelVisible);
      if (isPanelVisible && pendingResnapOnVisible) {
        pendingResnapOnVisible = false;
        resnapAndRedraw(true);
      }
      if (isPanelVisible && drawLabelState.drawLabelVisible) {
        ensureLetterPhysicsLoop();
      }
    }
  });
  const onGlobalDrawgridRefresh = (e) => {
    if (e?.detail?.sourcePanelId === panel?.id) return;
    panel.__dgForceNodesRefresh = true;
  };
  try {
    window.addEventListener('drawgrid:refresh-all', onGlobalDrawgridRefresh);
    panel.addEventListener('toy:remove', () => {
      try { window.removeEventListener('drawgrid:refresh-all', onGlobalDrawgridRefresh); } catch {}
    }, { once: true });
  } catch {}

  const onGlobalPointerUp = () => {
    const now = nowMs();
    let wasGesturing = false;
    try {
      wasGesturing = !!(window.__mtZoomGesturing || window.__GESTURE_ACTIVE || document.body?.classList?.contains?.('is-gesturing'));
    } catch {}
    let inSettle = false;
    try {
      const settle = window.__GESTURE_SETTLE_UNTIL_TS;
      if (Number.isFinite(settle) && now < settle) inSettle = true;
    } catch {}
    if (!wasGesturing && !inSettle) return;
    __dgBypassCommitUntil = now + 240;
    __dgForceFullDrawUntil = now + 240;
    __dgForceFullDrawNext = true;
    __dgForceFullDrawFrames = Math.max(__dgForceFullDrawFrames || 0, 8);
    __dgForceOverlayClearNext = true;
    __dgForceSwapNext = true;
    __dgNeedsUIRefresh = true;
    __dgStableFramesAfterCommit = 2;
    __dgDeferUntilTs = 0;
  };
  try {
    window.addEventListener('pointerup', onGlobalPointerUp, true);
    panel.addEventListener('toy:remove', () => {
      try { window.removeEventListener('pointerup', onGlobalPointerUp, true); } catch {}
    }, { once: true });
  } catch {}

  let lastZoomX = 1;
  let lastZoomY = 1;

  function getLayoutSize() {
    return measureCSSSize(wrap);
  }

  function markLayoutSizeDirty() {
    layoutSizeDirty = true;
  }

  function __installLayoutObserver() {
    try {
      if (!wrap) return;
      if (typeof ResizeObserver === 'undefined') return;
      __dgLayoutObs = new ResizeObserver((entries) => {
        const e = entries && entries[0];
        const cr = e && e.contentRect;
        if (!cr) return;
        const w = Math.max(1, Math.round(cr.width || 0));
        const h = Math.max(1, Math.round(cr.height || 0));
        if (!w || !h) return;
        if (w === __dgLayoutW && h === __dgLayoutH) return;
        __dgLayoutW = w;
        __dgLayoutH = h;
        layoutSizeDirty = true;
      });
      __dgLayoutObs.observe(wrap);
      panel?.addEventListener?.('toy:remove', () => {
        try { __dgLayoutObs?.disconnect?.(); } catch {}
        __dgLayoutObs = null;
      }, { once: true });
    } catch {}
  }

  __installLayoutObserver();

  function measureCSSSize(el) {
    if (!el) return { w: 0, h: 0 };

    // If we're measuring the drawgrid wrap, prefer cached RO size (no layout read).
    if (el === wrap && __dgLayoutW > 0 && __dgLayoutH > 0) {
      return { w: __dgLayoutW, h: __dgLayoutH };
    }

    const w = el.offsetWidth || el.clientWidth || 0;
    const h = el.offsetHeight || el.clientHeight || 0;
    if (w > 0 && h > 0) return { w, h };
    const rect = el.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      let scale = 1;
      try {
        const host = el.closest?.('.board-viewport') || document.querySelector('.board-viewport');
        const raw = host ? boardScaleHelper(host) : (Number.isFinite(window?.__boardScale) ? window.__boardScale : 1);
        if (Number.isFinite(raw) && raw > 0) scale *= raw;
      } catch {}
      try {
        const panelEl = (el.classList?.contains?.('toy-panel'))
          ? el
          : el.closest?.('.toy-panel');
        if (panelEl) {
          const toyScaleRaw = getComputedStyle(panelEl).getPropertyValue('--toy-scale');
          const toyScale = parseFloat(toyScaleRaw);
          if (Number.isFinite(toyScale) && toyScale > 0) scale *= toyScale;
        }
      } catch {}
      const inv = scale !== 0 ? (1 / scale) : 1;
      return { w: rect.width * inv, h: rect.height * inv };
    }
    return { w: 0, h: 0 };
  }

  function useBackBuffers() {
    if (usingBackBuffers) return;
    usingBackBuffers = true;
    syncBackBufferSizes();
    gctx = gridBackCtx;
    nctx = nodesBackCtx;
    if (DG_SINGLE_CANVAS) {
      gctx = gridBackCtx;
      nctx = (DG_SINGLE_CANVAS_OVERLAYS && nodesCanvas !== grid) ? nodesFrontCtx : nodesBackCtx;
    }
    fctx = flashBackCtx;
    ghostCtx = ghostBackCtx;
    tutorialCtx = tutorialBackCtx;
    emitDG('buffers', { action: 'useBackBuffers', usingBackBuffers });
  }

  function useFrontBuffers() {
    if (!usingBackBuffers) return;
    usingBackBuffers = false;
    gctx = gridFrontCtx;
    nctx = nodesFrontCtx;
    if (DG_SINGLE_CANVAS) {
      gctx = gridBackCtx;
      nctx = (DG_SINGLE_CANVAS_OVERLAYS && nodesCanvas !== grid) ? nodesFrontCtx : nodesBackCtx;
    }
    fctx = flashFrontCtx;
    ghostCtx = ghostFrontCtx;
    tutorialCtx = tutorialFrontCtx;
    emitDG('buffers', { action: 'useFrontBuffers', usingBackBuffers });
  }

  function syncGhostBackToFront() {
    if (!ghostFrontCtx || !ghostBackCtx) return;
    const front = ghostFrontCtx.canvas;
    const back = ghostBackCtx.canvas;
    if (!front || !back || !front.width || !front.height) return;
    R.withDeviceSpace(ghostFrontCtx, () => {
      ghostFrontCtx.globalCompositeOperation = 'source-over';
      ghostFrontCtx.globalAlpha = 1;
      ghostFrontCtx.clearRect(0, 0, front.width, front.height);
      ghostFrontCtx.drawImage(
        back,
        0, 0, back.width, back.height,
        0, 0, front.width, front.height
      );
    });
  }

function copyCanvas(backCtx, frontCtx) {
  if (!backCtx || !frontCtx) return;
  const front = frontCtx.canvas, back = backCtx.canvas;
  if (!front || !back || !front.width || !front.height || !back.width || !back.height) return;
  R.withDeviceSpace(frontCtx, () => {
    frontCtx.clearRect(0, 0, front.width, front.height);
    frontCtx.drawImage(back, 0, 0, back.width, back.height, 0, 0, front.width, front.height);
  });
}

  function getActiveFlashCanvas() {
    return usingBackBuffers ? flashBackCanvas : flashCanvas;
  }

  function getActiveGhostCanvas() {
    return usingBackBuffers ? ghostBackCanvas : ghostCanvas;
  }

  function getActiveTutorialCanvas() {
    return usingBackBuffers ? tutorialBackCanvas : tutorialCanvas;
  }

  function __dgSampleAlpha(ctx, xCss, yCss) {
    if (!ctx || !ctx.canvas) return null;
    const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
    const px = Math.max(0, Math.min(ctx.canvas.width - 1, Math.round(xCss * scale)));
    const py = Math.max(0, Math.min(ctx.canvas.height - 1, Math.round(yCss * scale)));
    try {
      const data = ctx.getImageData(px, py, 1, 1).data;
      return { r: data[0], g: data[1], b: data[2], a: data[3], px, py };
    } catch {
      return { error: true, px, py };
    }
  }

  function __dgSampleCanvasStyles(canvas) {
    if (!canvas) return null;
    try {
      const cs = getComputedStyle(canvas);
      return {
        display: cs?.display || null,
        visibility: cs?.visibility || null,
        opacity: cs?.opacity || null,
        transform: cs?.transform || null,
      };
    } catch {
      return null;
    }
  }


  function compositeSingleCanvas() {
    if (!DG_SINGLE_CANVAS || !frontCtx) return;
    if (!__dgGridReady()) return;
    const surface = frontCtx.canvas;
    if (!surface || !surface.width || !surface.height) return;
    const sampleX = gridArea ? (gridArea.x + 2) : null;
    const sampleY = gridArea ? (gridArea.y + topPad + 2) : null;
    // Guard: if the front backing store was resized to the scaled DOM rect,
    // fix sizes before compositing to avoid "scaled up" strokes.
    try {
      const expW = (__dgLastResizeTargetW || (cssW ? Math.max(1, Math.round(cssW * paintDpr)) : 0));
      const expH = (__dgLastResizeTargetH || (cssH ? Math.max(1, Math.round(cssH * paintDpr)) : 0));
      if (expW && expH) {
        const rect = getRect(surface);
        const rectW = Math.max(1, Math.round(rect?.width || 0));
        const rectH = Math.max(1, Math.round(rect?.height || 0));
        const looksLikeScaledRect =
          (surface.width === rectW && surface.height === rectH && (rectW !== expW || rectH !== expH));
        const wrongBackingStore = (surface.width !== expW || surface.height !== expH);
        if (wrongBackingStore && looksLikeScaledRect) {
          dgSizeTrace('composite:front-guard', {
            cssW,
            cssH,
            paintDpr,
            expW,
            expH,
            rectW,
            rectH,
            frontW: surface.width,
            frontH: surface.height,
          });
          resizeSurfacesFor(cssW, cssH, paintDpr);
          markStaticDirty('front-size-guard');
          __dgForceFullDrawNext = true;
          return;
        }
      }
    } catch {}
    if (!panel.__dgSingleCompositeDirty && !panel.__dgCompositeBaseDirty && !panel.__dgCompositeOverlayDirty) {
      return;
    }
    FD.layerEvent('composite:begin', {
      panelId: panel?.id || null,
      panelRef: panel,
      singleCanvas: !!DG_SINGLE_CANVAS,
      overlays: !!DG_SINGLE_CANVAS_OVERLAYS,
      baseDirty: !!panel.__dgCompositeBaseDirty,
      overlayDirty: !!panel.__dgCompositeOverlayDirty,
      singleDirty: !!panel.__dgSingleCompositeDirty,
    });
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
    dgGridAlphaLog('composite:begin', frontCtx);
    FD.layerTrace('composite:enter', {
      panelId: panel?.id || null,
      usingBackBuffers,
      frontRole: frontCtx?.canvas?.getAttribute?.('data-role') || null,
      frontSize: frontCtx?.canvas ? { w: frontCtx.canvas.width, h: frontCtx.canvas.height } : null,
    });
    if (!panel.__dgGridHasPainted) {
      try { drawGrid(); } catch {}
    }
    if (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE && gridBackCtx && gridArea) {
      const sample = (sampleX !== null && sampleY !== null)
        ? __dgSampleAlpha(gridBackCtx, sampleX, sampleY)
        : null;
      dgSizeTrace('gridBack-sample', {
        cssW,
        cssH,
        gridHasPainted: !!panel.__dgGridHasPainted,
        baseDirty: !!panel.__dgCompositeBaseDirty,
        sample,
        sampleX,
        sampleY,
        gridArea: gridArea ? { ...gridArea } : null,
      });
    }
    dgSizeTraceCanvas('before-composite');
    const width = surface.width;
    const height = surface.height;
    const baseCanvas = panel.__dgCompositeBaseCanvas;
    let compositeBaseCanvas = baseCanvas;
    if (!compositeBaseCanvas) {
      compositeBaseCanvas = document.createElement('canvas');
      panel.__dgCompositeBaseCanvas = compositeBaseCanvas;
      panel.__dgCompositeBaseDirty = true;
    }
    if (compositeBaseCanvas.width !== width || compositeBaseCanvas.height !== height) {
      compositeBaseCanvas.width = width;
      compositeBaseCanvas.height = height;
      panel.__dgCompositeBaseDirty = true;
    }
    let compositeBaseCtx = panel.__dgCompositeBaseCtx;
    if (!compositeBaseCtx) {
      compositeBaseCtx = compositeBaseCanvas.getContext('2d');
      panel.__dgCompositeBaseCtx = compositeBaseCtx;
      panel.__dgCompositeBaseDirty = true;
    }

      if (panel.__dgCompositeBaseDirty && compositeBaseCtx) {
        const __baseStart = __perfOn ? performance.now() : 0;
        const baseCtx = compositeBaseCtx;
      R.withDeviceSpace(baseCtx, () => {
        baseCtx.globalCompositeOperation = 'source-over';
        baseCtx.globalAlpha = 1;
        baseCtx.clearRect(0, 0, width, height);
        if (gridBackCanvas && gridBackCanvas.width && gridBackCanvas.height) {
          baseCtx.drawImage(
            gridBackCanvas,
            0, 0, gridBackCanvas.width, gridBackCanvas.height,
            0, 0, width, height
          );
        }
        if (backCanvas && backCanvas.width && backCanvas.height) {
          baseCtx.drawImage(
            backCanvas,
            0, 0, backCanvas.width, backCanvas.height,
            0, 0, width, height
          );
        }
      });
      panel.__dgCompositeBaseDirty = false;
      if (__perfOn && __baseStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.composite.base', performance.now() - __baseStart); } catch {}
      }
      dgSizeTrace('composite:base-rebuild', {
        cssW,
        cssH,
        paintDpr,
        surfaceW: width,
        surfaceH: height,
        gridArea: gridArea ? { ...gridArea } : null,
      });
    }

    const __finalStart = __perfOn ? performance.now() : 0;
    R.withDeviceSpace(frontCtx, () => {
      frontCtx.globalCompositeOperation = 'source-over';
      frontCtx.globalAlpha = 1;
      frontCtx.clearRect(0, 0, width, height);
      if (compositeBaseCanvas && compositeBaseCanvas.width && compositeBaseCanvas.height) {
        const __baseBlitStart = __perfOn ? performance.now() : 0;
        frontCtx.drawImage(
          compositeBaseCanvas,
          0, 0, compositeBaseCanvas.width, compositeBaseCanvas.height,
          0, 0, width, height
        );
        if (__perfOn && __baseBlitStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.composite.base.blit', performance.now() - __baseBlitStart); } catch {}
        }
      }
      if (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE && sampleX !== null && sampleY !== null) {
        const frontSample = __dgSampleAlpha(frontCtx, sampleX, sampleY);
        dgSizeTrace('front-sample', {
          cssW,
          cssH,
          gridHasPainted: !!panel.__dgGridHasPainted,
          baseDirty: !!panel.__dgCompositeBaseDirty,
          sample: frontSample,
          sampleX,
          sampleY,
          frontStyle: __dgSampleCanvasStyles(surface),
        });
      }
      const flashSource = getActiveFlashCanvas();
      if (!DG_SINGLE_CANVAS_OVERLAYS && !panel.__dgFlashLayerEmpty && flashSource && flashSource.width && flashSource.height) {
        const __flashStart = __perfOn ? performance.now() : 0;
        const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
        const allowFullFlash = !!panel.__dgFlashOverlayOutOfGrid;
        const bounds = (allowFullFlash || !(gridArea && gridArea.w > 0 && gridArea.h > 0))
          ? {
              x: 0,
              y: 0,
              w: Math.round(width),
              h: Math.round(height),
            }
          : {
              x: Math.round(gridArea.x * scale),
              y: Math.round(gridArea.y * scale),
              w: Math.round(gridArea.w * scale),
              h: Math.round(gridArea.h * scale),
            };
        let sx = 0;
        let sy = 0;
        let sw = flashSource.width;
        let sh = flashSource.height;
        if (bounds) {
          const maxX = flashSource.width;
          const maxY = flashSource.height;
          const bx = Math.max(0, Math.min(bounds.x, maxX));
          const by = Math.max(0, Math.min(bounds.y, maxY));
          const bw = Math.max(0, Math.min(bounds.w, maxX - bx));
          const bh = Math.max(0, Math.min(bounds.h, maxY - by));
          if (bw > 0 && bh > 0) {
            sx = bx;
            sy = by;
            sw = bw;
            sh = bh;
          }
        }
        frontCtx.drawImage(flashSource, sx, sy, sw, sh, sx, sy, sw, sh);
        if (__perfOn && __flashStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.composite.flash', performance.now() - __flashStart); } catch {}
        }
      }
      if (!DG_SINGLE_CANVAS_OVERLAYS) {
        const nodesFrontCanvas = nodesFrontCtx?.canvas;
        const nodeSources = [];
        if (nodesBackCanvas && nodesBackCanvas.width && nodesBackCanvas.height) {
          nodeSources.push(nodesBackCanvas);
        }
        if (
          !DG_SINGLE_CANVAS &&
          nodesFrontCanvas &&
          nodesFrontCanvas !== nodesBackCanvas &&
          nodesFrontCanvas.width &&
          nodesFrontCanvas.height
        ) {
          nodeSources.push(nodesFrontCanvas);
        }
        for (const nodeCanvas of nodeSources) {
          const __nodesStart = __perfOn ? performance.now() : 0;
          frontCtx.drawImage(
            nodeCanvas,
            0, 0, nodeCanvas.width, nodeCanvas.height,
            0, 0, width, height
          );
          if (__perfOn && __nodesStart) {
            try { window.__PerfFrameProf?.mark?.('drawgrid.composite.nodes', performance.now() - __nodesStart); } catch {}
          }
        }
      }
      const ghostSource = getActiveGhostCanvas();
      if (!DG_SINGLE_CANVAS_OVERLAYS && !panel.__dgGhostLayerEmpty && ghostSource && ghostSource.width && ghostSource.height) {
        const __ghostStart = __perfOn ? performance.now() : 0;
        frontCtx.drawImage(
          ghostSource,
          0, 0, ghostSource.width, ghostSource.height,
          0, 0, width, height
        );
        if (__perfOn && __ghostStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.composite.ghost', performance.now() - __ghostStart); } catch {}
        }
      }
      const tutorialSource = getActiveTutorialCanvas();
      if (!DG_SINGLE_CANVAS_OVERLAYS && !panel.__dgTutorialLayerEmpty && tutorialSource && tutorialSource.width && tutorialSource.height) {
        const __tutorialStart = __perfOn ? performance.now() : 0;
        frontCtx.drawImage(
          tutorialSource,
          0, 0, tutorialSource.width, tutorialSource.height,
          0, 0, width, height
        );
        if (__perfOn && __tutorialStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.composite.tutorial', performance.now() - __tutorialStart); } catch {}
        }
      }
      if (!DG_SINGLE_CANVAS_OVERLAYS && !panel.__dgPlayheadLayerEmpty && playheadCanvas && playheadCanvas.width && playheadCanvas.height) {
        const __playheadStart = __perfOn ? performance.now() : 0;
        frontCtx.drawImage(
          playheadCanvas,
          0, 0, playheadCanvas.width, playheadCanvas.height,
          0, 0, width, height
        );
        if (__perfOn && __playheadStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.composite.playhead', performance.now() - __playheadStart); } catch {}
        }
      }
    });
    panel.__dgCompositeOverlayDirty = false;
    if (__perfOn && __finalStart) {
      try { window.__PerfFrameProf?.mark?.('drawgrid.composite.final', performance.now() - __finalStart); } catch {}
    }
    try { panel.__dgLastCompositeTs = (performance?.now ? performance.now() : Date.now()); } catch {}
    dgGridAlphaLog('composite:end', frontCtx);
    FD.layerTrace('composite:exit', {
      panelId: panel?.id || null,
      usingBackBuffers,
    });
  }

  function ensureBackVisualsFreshFromFront() {
    try {
      const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
      const logicalWidth = Math.max(1, cssW || ((frontCanvas?.width ?? 1) / scale));
      const logicalHeight = Math.max(1, cssH || ((frontCanvas?.height ?? 1) / scale));
      const pixelW = Math.max(1, Math.round(logicalWidth * scale));
      const pixelH = Math.max(1, Math.round(logicalHeight * scale));

      const styleCanvases = [
        frontCanvas,
        gridFrontCtx?.canvas,
        nodesFrontCtx?.canvas,
        flashFrontCtx?.canvas,
        ghostFrontCtx?.canvas,
        tutorialFrontCtx?.canvas,
        particleCanvas,
        playheadCanvas
      ].filter(Boolean);

      const cssWpx = `${logicalWidth}px`;
      const cssHpx = `${logicalHeight}px`;
      for (const canvas of styleCanvases) {
        if (canvas.style.width !== cssWpx) canvas.style.width = cssWpx;
        if (canvas.style.height !== cssHpx) canvas.style.height = cssHpx;
      }

      const allCanvases = [
        frontCanvas,
        backCanvas,
        gridFrontCtx?.canvas,
        gridBackCanvas,
        nodesFrontCtx?.canvas,
        nodesBackCanvas,
        flashFrontCtx?.canvas,
        flashBackCanvas,
        ghostFrontCtx?.canvas,
        ghostBackCanvas,
        tutorialFrontCtx?.canvas,
        tutorialBackCanvas,
        playheadCanvas,
      ].filter(Boolean);

      // NOTE: avoid per-canvas getContext() calls here (can be surprisingly costly).
      // We only reset contexts we already hold references to.
      let resizedAny = false;
      for (const canvas of allCanvases) {
        if (canvas.width !== pixelW) { canvas.width = pixelW; resizedAny = true; }
        if (canvas.height !== pixelH) { canvas.height = pixelH; resizedAny = true; }
        // style width/height is already set via styleCanvases above
      }
      if (resizedAny) {
        // Resizing clears grid/nodes backing stores; force a static redraw.
        panel.__dgGridHasPainted = false;
        try { markStaticDirty('sync-back-resize'); } catch {}
        __dgForceFullDrawNext = true;
      }

      // Reset known contexts after resize
      try { R.resetCtx(frontCtx); } catch {}
      try { R.resetCtx(backCtx); } catch {}
      try { R.resetCtx(gridFrontCtx); } catch {}
      try { R.resetCtx(gridBackCtx); } catch {}
      try { R.resetCtx(nodesFrontCtx); } catch {}
      try { R.resetCtx(nodesBackCtx); } catch {}
      try { R.resetCtx(flashFrontCtx); } catch {}
      try { R.resetCtx(flashBackCtx); } catch {}
      try { R.resetCtx(ghostFrontCtx); } catch {}
      try { R.resetCtx(ghostBackCtx); } catch {}
      try { R.resetCtx(tutorialFrontCtx); } catch {}
      try { R.resetCtx(tutorialBackCtx); } catch {}
      try { R.resetCtx(playheadFrontCtx); } catch {}

      const copyCtx = (srcCtx, dstCtx) => {
        if (!srcCtx || !dstCtx) return;
        if (srcCtx === dstCtx || srcCtx.canvas === dstCtx.canvas) return;
        if (DG_SINGLE_CANVAS && (srcCtx === gridFrontCtx || srcCtx === nodesFrontCtx)) return;
        R.withDeviceSpace(dstCtx, () => {
          dstCtx.clearRect(0, 0, pixelW, pixelH);
          dstCtx.drawImage(
            srcCtx.canvas,
            0, 0, srcCtx.canvas.width, srcCtx.canvas.height,
            0, 0, pixelW, pixelH
          );
        });
      };

      if (!DG_SINGLE_CANVAS) {
        copyCtx(pctx, backCtx);
        copyCtx(gridFrontCtx, gridBackCtx);
        copyCtx(nodesFrontCtx, nodesBackCtx);
        copyCtx(flashFrontCtx, flashBackCtx);
        copyCtx(ghostFrontCtx, ghostBackCtx);
        copyCtx(tutorialFrontCtx, tutorialBackCtx);
      }
    } catch {}
  }

  function flushVisualBackBuffersToFront() {
    const w = Math.max(1, Math.round(cssW));
    const h = Math.max(1, Math.round(cssH));
    FD.layerEvent('flushVisualBackBuffersToFront', {
      panelId: panel?.id || null,
      panelRef: panel,
      singleCanvas: !!DG_SINGLE_CANVAS,
      overlays: !!DG_SINGLE_CANVAS_OVERLAYS,
      usingBackBuffers,
    });

    if (pendingWrapSize) {
      wrap.style.width = `${pendingWrapSize.width}px`;
      wrap.style.height = `${pendingWrapSize.height}px`;
      pendingWrapSize = null;
    }
    grid.width = w; grid.height = h;
    nodesCanvas.width = w; nodesCanvas.height = h;
    flashCanvas.width = w; flashCanvas.height = h;
    ghostCanvas.width = w; ghostCanvas.height = h;
    tutorialCanvas.width = w; tutorialCanvas.height = h;
    if (debugCanvas) { debugCanvas.width = w; debugCanvas.height = h; }

    R.withDeviceSpace(gridFrontCtx, () => {
      const surface = gridFrontCtx.canvas;
      const width = surface?.width ?? w;
      const height = surface?.height ?? h;
      gridFrontCtx.clearRect(0, 0, width, height);
      gridFrontCtx.drawImage(
        gridBackCanvas,
        0, 0, gridBackCanvas.width, gridBackCanvas.height,
        0, 0, width, height
      );
    });

    R.withDeviceSpace(nodesFrontCtx, () => {
      const surface = nodesFrontCtx.canvas;
      const width = surface?.width ?? w;
      const height = surface?.height ?? h;
      nodesFrontCtx.clearRect(0, 0, width, height);
      nodesFrontCtx.drawImage(
        nodesBackCanvas,
        0, 0, nodesBackCanvas.width, nodesBackCanvas.height,
        0, 0, width, height
      );
    });

    R.withDeviceSpace(flashFrontCtx, () => {
      const surface = flashFrontCtx.canvas;
      const width = surface?.width ?? w;
      const height = surface?.height ?? h;
      flashFrontCtx.clearRect(0, 0, width, height);
      flashFrontCtx.drawImage(
        flashBackCanvas,
        0, 0, flashBackCanvas.width, flashBackCanvas.height,
        0, 0, width, height
      );
    });

    R.withDeviceSpace(ghostFrontCtx, () => {
      const surface = ghostFrontCtx.canvas;
      const width = surface?.width ?? w;
      const height = surface?.height ?? h;
      ghostFrontCtx.clearRect(0, 0, width, height);
      ghostFrontCtx.drawImage(
        ghostBackCanvas,
        0, 0, ghostBackCanvas.width, ghostBackCanvas.height,
        0, 0, width, height
      );
    });

    R.withDeviceSpace(tutorialFrontCtx, () => {
      const surface = tutorialFrontCtx.canvas;
      const width = surface?.width ?? w;
      const height = surface?.height ?? h;
      tutorialFrontCtx.clearRect(0, 0, width, height);
      tutorialFrontCtx.drawImage(
        tutorialBackCanvas,
        0, 0, tutorialBackCanvas.width, tutorialBackCanvas.height,
        0, 0, width, height
      );
    });
  }

  function layout(force = false){
    return F.perfMarkSection('drawgrid.layout', () => {
    const bodySize = measureCSSSize(body);
    const bodyW = bodySize.w;
    const bodyH = bodySize.h;
    // Always keep wrap sized in CSS so measurement is stable during zoom.
    // pendingWrapSize is still useful as a fallback for the commit flush path.
    wrap.style.width  = bodyW + 'px';
    wrap.style.height = bodyH + 'px';
    if (usingBackBuffers) {
      pendingWrapSize = { width: bodyW, height: bodyH };
    } else {
      pendingWrapSize = null;
    }


    // Measure transform-immune base...
    const { w: baseW, h: baseH } = getLayoutSize();
    const { x: zoomX, y: zoomY } = getZoomScale(panel); // tracking only for logs/debug
    const newW = Math.max(1, Math.round(baseW));
    const newH = Math.max(1, Math.round(baseH));
    try {
      const rect = panel?.getBoundingClientRect?.();
      const toyScaleRaw = panel ? getComputedStyle(panel).getPropertyValue('--toy-scale') : '';
      const toyScale = parseFloat(toyScaleRaw);
      dgSizeTrace('layout:measure', {
        force,
        bodyW,
        bodyH,
        baseW,
        baseH,
        newW,
        newH,
        wrapClientW: wrap?.clientWidth || 0,
        wrapClientH: wrap?.clientHeight || 0,
        panelRectW: rect?.width || 0,
        panelRectH: rect?.height || 0,
        toyScale: Number.isFinite(toyScale) ? toyScale : null,
        zoomMode,
        zoomGestureActive,
        overview: !!__overviewActive,
      });
    } catch {}

    if (newW === 0 || newH === 0) {
      requestAnimationFrame(() => resnapAndRedraw(force));
      return;
    }

      if ((!zoomGestureActive && (force || Math.abs(newW - cssW) > 1 || Math.abs(newH - cssH) > 1)) || (force && zoomGestureActive)) {
        const oldW = cssW;
        const oldH = cssH;
        dgSizeTrace('layout:apply', {
          force,
          oldW,
          oldH,
          newW,
          newH,
          zoomMode,
          zoomGestureActive,
          overview: !!__overviewActive,
        });
        // Snapshot current paint to preserve drawn content across resize.
      // IMPORTANT: snapshot the ACTIVE paint surface (front/back), not just `paint`,
      // otherwise wheel-zoom / overview can wipe the user's line.
      let paintSnapshot = null;
      try {
        const snapSrc = (typeof getActivePaintCanvas === 'function' ? getActivePaintCanvas() : null) || paint;
        if (snapSrc && snapSrc.width > 0 && snapSrc.height > 0) {
          paintSnapshot = document.createElement('canvas');
          paintSnapshot.width = snapSrc.width;
          paintSnapshot.height = snapSrc.height;
          paintSnapshot.getContext('2d')?.drawImage(snapSrc, 0, 0);
        }
      } catch {}

      cssW = newW;
      cssH = newH;
      progressMeasureW = cssW;
      progressMeasureH = cssH;
      if (dgViewport?.refreshSize) dgViewport.refreshSize({ snap: true });
      const __dprFallback =
        (typeof __dgAdaptivePaintDpr !== 'undefined' && Number.isFinite(__dgAdaptivePaintDpr) && __dgAdaptivePaintDpr > 0)
          ? __dgAdaptivePaintDpr
          : (Number.isFinite(paintDpr) && paintDpr > 0 ? paintDpr : (Number.isFinite(window?.devicePixelRatio) ? window.devicePixelRatio : 1));
      resizeSurfacesFor(cssW, cssH, __dprFallback);
      if (tutorialHighlightMode !== 'none') renderTutorialHighlight();

      // Layout changes invalidate static layers (grid geometry / node positions).
      try { markStaticDirty('layout'); } catch {}
      __dgForceFullDrawNext = true;


      lastZoomX = zoomX;
      lastZoomY = zoomY;

      // Scale stroke geometry ONLY when this is a “real” panel resize.
      // During zoom/overview transitions we must NOT mutate stroke points,
      // or lines will drift/vanish permanently.
      const recentlyHydrated =
        __hydrationJustApplied ||
        (DG_HYDRATE.hydratedAt && (dgNow() - DG_HYDRATE.hydratedAt < 1200));
      const okToScaleStrokeGeometry =
        !zoomGestureActive &&
        zoomMode !== 'gesturing' &&
        !__zoomActive &&
        !__overviewActive &&
        !recentlyHydrated;

      if (okToScaleStrokeGeometry && strokes.length > 0 && oldW > 4 && oldH > 4 && !isRestoring) {
        const scaleX = cssW / oldW;
        const scaleY = cssH / oldH;
        if (scaleX !== 1 || scaleY !== 1) {
          for (const s of strokes) {
            if (Array.isArray(s?.__ptsN)) continue;
            s.pts = s.pts.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));
          }
        }
      } else if (!okToScaleStrokeGeometry && strokes.length > 0 && oldW > 0 && oldH > 0) {
        // Optional debug:
        // dgTraceLog?.('[DG][layout] skip stroke scaling (zoom/overview)', { zoomGestureActive, zoomMode, __zoomActive, __overviewActive, oldW, oldH, cssW, cssH });
      }

      const logicalSize = getToyLogicalSize();
      const logicalW = logicalSize.w;
      const logicalH = logicalSize.h;
      gridAreaLogical.w = logicalW;
      gridAreaLogical.h = logicalH;

      const minGridArea = 20; // px floor so it never fully collapses
      // Compute proportional margin in *logical* CSS px.
      // IMPORTANT: this must NOT depend on board zoom / transforms. If we use any
      // zoom-derived value here (e.g. a map scale), the gridArea changes during
      // zoom/refresh boot and strokes will appear to “re-scale” incorrectly.
      const safeScale = Math.min(logicalW, logicalH);
      const dynamicSafeArea = Math.max(
        12,                               // lower bound so lines don't hug edges on tiny panels
        Math.round(SAFE_AREA_FRACTION * safeScale)
      );

      gridArea = {
        x: dynamicSafeArea,
        y: dynamicSafeArea,
        w: Math.max(minGridArea, logicalW - 2 * dynamicSafeArea),
        h: Math.max(minGridArea, logicalH - 2 * dynamicSafeArea),
      };
    
      // All calculations are now relative to the gridArea
      // Remove the top cube row; use a minimal padding
      topPad = 0;
      cw = gridArea.w / cols;
      ch = (gridArea.h - topPad) / rows;
      if (__dgGridReady()) {
        if (__dgGridCache) __dgGridCache.key = '';
        if (__dgNodesCache) __dgNodesCache.key = '';
        if (__dgBlocksCache) __dgBlocksCache.key = '';
        try {
          if (gridBackCtx?.canvas) R.withDeviceSpace(gridBackCtx, () => gridBackCtx.clearRect(0, 0, gridBackCtx.canvas.width, gridBackCtx.canvas.height));
          if (nodesBackCtx?.canvas) R.withDeviceSpace(nodesBackCtx, () => nodesBackCtx.clearRect(0, 0, nodesBackCtx.canvas.width, nodesBackCtx.canvas.height));
        } catch {}
        panel.__dgGridHasPainted = false;
        try { markStaticDirty('layout-clear'); } catch {}
        __dgForceFullDrawNext = true;
      }
      const layoutKey = `${Math.round(cssW)}x${Math.round(cssH)}:${Math.round(gridArea.w)}x${Math.round(gridArea.h)}`;
      if (layoutKey === __dgLastLayoutKey) __dgLayoutStableFrames++;
      else {
        __dgLayoutStableFrames = 0;
        __dgLastLayoutKey = layoutKey;
        if (DG_LAYOUT_DEBUG) {
          try {
            dgLogLine('layout-change', {
              panelId: panel.id || null,
              cssW,
              cssH,
              gridW: gridArea.w,
              gridH: gridArea.h,
              zoomGestureActive,
              zoomMode,
              overview: !!__overviewActive,
              recentlyHydrated,
            });
            dgDumpCanvasMetrics(panel, 'layout-change', frontCanvas, wrap, body);
          } catch {}
        }
      }
      // Reproject strokes from normalized coords once layout is stable.
      if (strokes.length > 0) {
        const gh = Math.max(1, gridArea.h - topPad);
        let reprojected = false;
        for (const s of strokes) {
          if (!Array.isArray(s?.__ptsN)) continue;
          reprojected = true;
          s.pts = s.__ptsN.map(np => ({
            x: gridArea.x + (Number(np?.nx) || 0) * gridArea.w,
            y: (gridArea.y + topPad) + (Number(np?.ny) || 0) * gh,
          }));
        }
        if (reprojected) {
          if (DG_LAYOUT_DEBUG) {
            try {
              dgLogLine('layout-reproject', {
                panelId: panel.id || null,
                layoutKey,
              });
              dgDumpCanvasMetrics(panel, 'layout-reproject', frontCanvas, wrap, body);
            } catch {}
          }
          try { clearAndRedrawFromStrokes(null, 'layout-reproject'); } catch {}
        }
        __dgHydrationPendingRedraw = false;
        hydrationState.retryCount = 0;
      }

      // === DRAW label responsive sizing tied to toy, not viewport ===
      updateDrawLabelLayout(drawLabelState, { gridAreaLogical, wrap });


      drawGrid();
      // Restore paint snapshot scaled to new size (preserves erasures) — but never during an active stroke
      // Skip snapshot restore when hydrated strokes are present; redraw from data instead.
      const hasHydratedStroke = strokes.some(s => Array.isArray(s?.__ptsN));
      if (paintSnapshot && !hasHydratedStroke && zoomCommitPhase !== 'recompute') {
        try {
          if (!drawing) {
            // When using back buffers, keep BOTH in sync so front/back swaps don't "lose" the line.
            updatePaintBackingStores({ target: usingBackBuffers ? 'both' : 'both' });
            const ctx = (typeof getActivePaintCtx === 'function' ? getActivePaintCtx() : null) || pctx;
            if (ctx) {
              resetPaintBlend?.(ctx);
              ctx.clearRect(0, 0, cssW, cssH);
              ctx.drawImage(
                paintSnapshot,
                0, 0, paintSnapshot.width, paintSnapshot.height,
                0, 0, cssW, cssH
              );
            }
            // If we have explicit front/back contexts, mirror the snapshot into both.
            try {
              if (usingBackBuffers && typeof getPaintCtxFront === 'function' && typeof getPaintCtxBack === 'function') {
                const f = getPaintCtxFront();
                const b = getPaintCtxBack();
                for (const c of [f, b]) {
                  if (!c) continue;
                  resetPaintBlend?.(c);
                  c.clearRect(0, 0, cssW, cssH);
                  c.drawImage(
                    paintSnapshot,
                    0, 0, paintSnapshot.width, paintSnapshot.height,
                    0, 0, cssW, cssH
                  );
                }
              }
            } catch {}
          }
        } catch {}
      }
      if (DG_SINGLE_CANVAS) {
        __dgMarkSingleCanvasDirty(panel);
        try { compositeSingleCanvas(); } catch {}
      }
      // Clear other content canvases. The caller is responsible for redrawing nodes/overlay.
      // Defer overlay clears if we are in/near a gesture commit; renderLoop will clear safely.
      const __now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if ((HY.inCommitWindow(__now) || __dgStableFramesAfterCommit < 2) && !__dgForceOverlayClearNext) {
        __dgNeedsUIRefresh = true;
      } else {
        __dgForceOverlayClearNext = false;
        R.clearCanvas(nctx);
        const flashTarget = getActiveFlashCanvas();
        R.resetCtx(fctx);
        R.withLogicalSpace(fctx, () => {
          const { x, y, w, h } = R.getOverlayClearRect({
            canvas: flashTarget,
            pad: R.getOverlayClearPad(),
            allowFull: !!panel.__dgFlashOverlayOutOfGrid,
            gridArea,
          });
          fctx.clearRect(x, y, w, h);
        });
        markFlashLayerCleared();
        const ghostTarget = getActiveGhostCanvas();
        R.resetCtx(ghostCtx);
        R.withLogicalSpace(ghostCtx, () => {
          const { x, y, w, h } = R.getOverlayClearRect({
            canvas: ghostTarget,
            pad: R.getOverlayClearPad() * 1.2,
            gridArea,
          });
          ghostCtx.clearRect(x, y, w, h);
        });
        markGhostLayerCleared();
      }
    }
  });
  }

  function flashColumn(col) {
    // Save current grid state to restore after flash
    const gridSurface = usingBackBuffers ? gridBackCanvas : grid;
    const currentGridData = gctx.getImageData(0, 0, gridSurface.width, gridSurface.height);

    const x = gridArea.x + col * cw;
    const w = cw;
    try {
      const xToy = x + w * 0.5;
      FF.pushHeaderSweepAt(xToy, { lineWidthPx: w });
    } catch {}
    gctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    gctx.fillRect(x, gridArea.y, w, gridArea.h);

    setTimeout(() => {
        // A fade-out effect for a "fancier" feel
        let opacity = 0.6;
        const fade = setInterval(() => {
            gctx.putImageData(currentGridData, 0, 0); // Restore grid
            opacity -= 0.1;
            if (opacity <= 0) {
                clearInterval(fade);
                drawGrid(); // Final clean redraw
            } else {
                gctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                gctx.fillRect(x, gridArea.y, w, gridArea.h);
            }
        }, 30);
    }, 100); // Start fade after a short hold
  }

  let __dgGridPath = null;
  let __dgGridPathKey = '';
  let __dgGridCache = { canvas: null, ctx: null, key: '' };
  function buildGridPath(noteGridY) {
    const path = new Path2D();
    // Verticals (including outer lines)
    for (let i = 0; i <= cols; i++) {
      const x = crisp(gridArea.x + i * cw);
      path.moveTo(x, noteGridY);
      path.lineTo(x, gridArea.y + gridArea.h);
    }
    // Horizontals (including outer lines)
    for (let j = 0; j <= rows; j++) {
      const y = crisp(noteGridY + j * ch);
      path.moveTo(gridArea.x, y);
      path.lineTo(gridArea.x + gridArea.w, y);
    }
    return path;
  }

  function renderGridTo(ctx, width, height, noteGridY, noteGridH, hasTwoLines) {
    if (!ctx) return;
    R.resetCtx(ctx);
    R.withLogicalSpace(ctx, () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Draw the note grid area below the top padding
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(gridArea.x, noteGridY, gridArea.w, noteGridH);

      // 2. Subtle fill for active columns
      if (currentMap) {
        for (let c = 0; c < cols; c++) {
          if (currentMap.nodes[c]?.size > 0 && currentMap.active[c]) {
            let fillOpacity = 0.1;
            if (hasTwoLines) {
              const totalNodes = currentMap.nodes[c].size;
              const disabledNodes = currentMap.disabled[c]?.size || 0;
              const activeNodes = totalNodes - disabledNodes;
              if (activeNodes === 1) fillOpacity = 0.05;
            }
            ctx.fillStyle = `rgba(143, 168, 255, ${fillOpacity})`;
            const x = gridArea.x + c * cw;
            ctx.fillRect(x, noteGridY, cw, noteGridH);
          }
        }
      }

      // 3. Draw all grid lines with the base color
      const cellW = cw || 24;
      const cellH = ch || 24;
      const cell = Math.max(4, Math.min(cellW, cellH));
      const gridLineWidthPx = Math.max(1, Math.min(cell * 0.03, 8));
      ctx.strokeStyle = 'rgba(143, 168, 255, 0.35)';
      ctx.lineWidth = gridLineWidthPx;
      if (typeof Path2D !== 'undefined') {
        const key = [
          gridArea.x, gridArea.y, gridArea.w, gridArea.h,
          rows, cols, cw, ch, topPad, noteGridY,
        ].join('|');
        if (key !== __dgGridPathKey || !__dgGridPath) {
          __dgGridPath = buildGridPath(noteGridY);
          __dgGridPathKey = key;
        }
        ctx.stroke(__dgGridPath);
      } else {
        // Verticals (including outer lines)
        for (let i = 0; i <= cols; i++) {
          const x = crisp(gridArea.x + i * cw);
          ctx.beginPath();
          ctx.moveTo(x, noteGridY);
          ctx.lineTo(x, gridArea.y + gridArea.h);
          ctx.stroke();
        }
        // Horizontals (including outer lines)
        for (let j = 0; j <= rows; j++) {
          const y = crisp(noteGridY + j * ch);
          ctx.beginPath();
          ctx.moveTo(gridArea.x, y);
          ctx.lineTo(gridArea.x + gridArea.w, y);
          ctx.stroke();
        }
      }

      // 4. Highlight active columns by thickening their vertical lines
      if (currentMap) {
        ctx.strokeStyle = 'rgba(143, 168, 255, 0.7)';
        for (let c = 0; c < cols; c++) {
          if (currentMap.nodes[c]?.size > 0 && currentMap.active[c]) {
            const x1 = crisp(gridArea.x + c * cw);
            ctx.beginPath();
            ctx.moveTo(x1, noteGridY);
            ctx.lineTo(x1, gridArea.y + gridArea.h);
            ctx.stroke();

            const x2 = crisp(gridArea.x + (c + 1) * cw);
            ctx.beginPath();
            ctx.moveTo(x2, noteGridY);
            ctx.lineTo(x2, gridArea.y + gridArea.h);
            ctx.stroke();
          }
        }
      }
    });
  }

  function drawGrid(){
    if (typeof window !== 'undefined' && window.__PERF_DG_DISABLE_GRID) {
      panel.__dgGridHasPainted = false;
      return;
    }
    if (!__dgGridReady()) {
      dgGridAlphaLog('drawGrid:skip-not-ready', gctx, {
        gridArea: gridArea ? { ...gridArea } : null,
        cw,
        ch,
        cssW,
        cssH,
      });
      dgSizeTrace('drawGrid:skip-not-ready', {
        cssW,
        cssH,
        gridArea: gridArea ? { ...gridArea } : null,
        cw,
        ch,
      });
      panel.__dgGridHasPainted = false;
      return;
    }
    dgGridAlphaLog('drawGrid:begin', gctx, {
      cacheKey: __dgGridCache?.key || null,
    });
    dgSizeTrace('drawGrid:begin', {
      cssW,
      cssH,
      gridArea: gridArea ? { ...gridArea } : null,
      cw,
      ch,
      cacheKey: __dgGridCache?.key || null,
    });
    FD.layerTrace('drawGrid:enter', {
      panelId: panel?.id || null,
      usingBackBuffers,
      gctxRole: gctx?.canvas?.getAttribute?.('data-role') || null,
      gctxSize: gctx?.canvas ? { w: gctx.canvas.width, h: gctx.canvas.height } : null,
    });
    let __dgProfileStart = null;
    if (DG_PROFILE && typeof performance !== 'undefined' && performance.now) {
      __dgProfileStart = performance.now();
    }
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);

    const surface = gctx.canvas;
    const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
    const width = cssW || (surface?.width ?? 0) / scale;
    const height = cssH || (surface?.height ?? 0) / scale;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 1 || height <= 1) {
      panel.__dgGridHasPainted = false;
      return;
    }
    if (!__dgProbeDidFirstDraw && typeof window !== 'undefined' && window.__DG_PROBE_ON !== false) {
      __dgProbeDidFirstDraw = true;
      try { __dgProbeDump('first-draw:grid'); } catch {}
    }
    const noteGridY = gridArea.y + topPad;
    const noteGridH = gridArea.h - topPad;
    const hasTwoLines = strokes.some(s => s.generatorId === 2);

    let __dgHash = 2166136261;
    const __dgHashStep = (h, v) => {
      const n = (Number.isFinite(v) ? v : 0) | 0;
      return ((h ^ n) * 16777619) >>> 0;
    };
    __dgHash = __dgHashStep(__dgHash, rows);
    __dgHash = __dgHashStep(__dgHash, cols);
    __dgHash = __dgHashStep(__dgHash, Math.round(cw * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round(ch * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round(topPad * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round((gridArea?.x || 0) * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round((gridArea?.y || 0) * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round((gridArea?.w || 0) * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round((gridArea?.h || 0) * 1000));
    __dgHash = __dgHashStep(__dgHash, hasTwoLines ? 1 : 0);
    if (currentMap) {
      for (let c = 0; c < cols; c++) {
        const nodes = currentMap.nodes[c];
        const totalNodes = nodes ? nodes.size : 0;
        const disabledNodes = currentMap.disabled[c]?.size || 0;
        const active = currentMap.active[c] ? 1 : 0;
        __dgHash = __dgHashStep(__dgHash, totalNodes);
        __dgHash = __dgHashStep(__dgHash, disabledNodes);
        __dgHash = __dgHashStep(__dgHash, active);
      }
    }

    const cache = __dgGridCache;
    const surfacePxW = surface?.width ?? gctx.canvas?.width ?? 0;
    const surfacePxH = surface?.height ?? gctx.canvas?.height ?? 0;
    if (!cache.canvas) cache.canvas = document.createElement('canvas');
    if (cache.canvas.width !== surfacePxW) cache.canvas.width = surfacePxW;
    if (cache.canvas.height !== surfacePxH) cache.canvas.height = surfacePxH;
    if (!cache.ctx) cache.ctx = cache.canvas.getContext('2d');
    const cacheKey = `${__dgHash}|${surfacePxW}x${surfacePxH}`;

    if (cache.key !== cacheKey) {
      FD.layerDebugLog('grid-cache-miss', {
        panelId: panel?.id || null,
        cacheKey,
        surfacePxW,
        surfacePxH,
        cssW,
        cssH,
        gridArea: gridArea ? { ...gridArea } : null,
      });
      const __cacheStart = __perfOn ? performance.now() : 0;
      renderGridTo(cache.ctx, width, height, noteGridY, noteGridH, hasTwoLines);
      if (__perfOn && __cacheStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.grid.cache', performance.now() - __cacheStart); } catch {}
      }
      cache.key = cacheKey;
    }

    R.resetCtx(gctx);
    const __blitStart = __perfOn ? performance.now() : 0;
    R.withDeviceSpace(gctx, () => {
      gctx.clearRect(0, 0, surfacePxW, surfacePxH);
      if (cache.canvas) gctx.drawImage(cache.canvas, 0, 0, surfacePxW, surfacePxH);
    });
    dgGridAlphaLog('drawGrid:blit', gctx, {
      cacheKey,
      cacheHit: cache.key === cacheKey,
    });
    if (DG_SINGLE_CANVAS && gridFrontCtx?.canvas) {
      const frontSurface = gridFrontCtx.canvas;
      R.withDeviceSpace(gridFrontCtx, () => {
        gridFrontCtx.clearRect(0, 0, frontSurface.width, frontSurface.height);
      });
    }
    if (__perfOn && __blitStart) {
      try { window.__PerfFrameProf?.mark?.('drawgrid.grid.blit', performance.now() - __blitStart); } catch {}
    }

    if (__dgProfileStart !== null) {
      const dt = performance.now() - __dgProfileStart;
      F.dgProfileSample(dt);
    }
    panel.__dgGridReadyForNodes = true;
    panel.__dgGridHasPainted = true;
    __dgMarkSingleCanvasDirty(panel);
    dgGridAlphaLog('drawGrid:end', gctx);
    dgSizeTrace('drawGrid:end', {
      cssW,
      cssH,
      gridArea: gridArea ? { ...gridArea } : null,
      cw,
      ch,
      cacheKey: cache.key || null,
    });
    FD.layerTrace('drawGrid:exit', {
      panelId: panel?.id || null,
      usingBackBuffers,
      gctxRole: gctx?.canvas?.getAttribute?.('data-role') || null,
    });
  }

  function crisp(v) {
    return Math.round(v) + 0.5;
  }

  function getStrokePath(stroke) {
    if (!stroke || !stroke.pts || stroke.pts.length < 2) return null;
    if (typeof Path2D === 'undefined') return null;
    const pts = stroke.pts;
    const last = pts[pts.length - 1];
    const needsRebuild =
      !stroke.__overlayPath ||
      stroke.__overlayPathPts !== pts ||
      stroke.__overlayPathLen !== pts.length ||
      stroke.__overlayPathLastX !== last.x ||
      stroke.__overlayPathLastY !== last.y;
    if (needsRebuild) {
      const path = new Path2D();
      path.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        path.lineTo(pts[i].x, pts[i].y);
      }
      stroke.__overlayPath = path;
      stroke.__overlayPathPts = pts;
      stroke.__overlayPathLen = pts.length;
      stroke.__overlayPathLastX = last.x;
      stroke.__overlayPathLastY = last.y;
    }
    return stroke.__overlayPath;
  }

  // A helper to draw a complete stroke from a point array.
  // This is used to create a clean image for snapping.
  function drawFullStroke(ctx, stroke, opts = {}) {
    if (!stroke || !stroke.pts || stroke.pts.length < 1) return;
    if (DG_SINGLE_CANVAS && ctx?.canvas?.getAttribute?.('data-role') === 'drawgrid-paint' && backCtx && ctx !== backCtx) {
      ctx = backCtx;
    }
    const color = stroke.color || STROKE_COLORS[0];
    const wasOverlay = (ctx === fctx) || !!ctx.__dgIsOverlay;
    const skipReset = !!opts.skipReset;
    const skipTransform = !!opts.skipTransform;

    const drawCore = () => {
      ctx.save();
      const isOverlay = (ctx === fctx) || !!ctx.__dgIsOverlay;
      const wantsSpecial = !!stroke.isSpecial;
      const visualOnly = isVisualOnlyStroke(stroke);
      const alpha = getPathAlpha({
        isOverlay,
        wantsSpecial,
        isVisualOnly: visualOnly,
        generatorId: stroke.generatorId ?? null,
      });

      emitDG('path-alpha', {
        layer: (ctx === fctx) ? 'overlay' : 'paint',
        wantsSpecial: !!stroke.isSpecial,
        visualOnly,
        alpha,
        overlayColorize: !!stroke.overlayColorize,
        hasGeneratorId: !!stroke.generatorId,
        pts: stroke.pts?.length || 0
      });

      if (DG_ALPHA_DEBUG) {
        const now = performance?.now?.() ?? Date.now();
        if (now - dgAlphaState.pathLastTs > DG_ALPHA_SPAM_MS) {
          dgAlphaState.pathLastTs = now;
          console.debug('[DG][alpha:path]', {
            isOverlay,
            wantsSpecial,
            VISUAL_ONLY_ALPHA,
          });
        }
      }

      ctx.globalAlpha = alpha;

      const useMultiColour = wantsSpecial && isOverlay;

      if (!useMultiColour) {
        if (isOverlay) {
          ctx.strokeStyle = stroke.overlayColor || '#ffffff';
          ctx.fillStyle = ctx.strokeStyle;
        } else {
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
        }
      }

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      ctx.beginPath();
      if (stroke.pts.length === 1) {
        const lineWidth = R.getLineWidth();
        const p = stroke.pts[0];
        if (useMultiColour) {
          const r = lineWidth / 2;
          const t = (performance.now ? performance.now() : Date.now());
          const gid = stroke.generatorId ?? 1;
          const hue = gid === 1
            ? (200 + 20 * Math.sin((t / 1600) * Math.PI * 2))
            : (20 + 20 * Math.sin((t / 1800) * Math.PI * 2));
          const hueKey = Math.round(hue * 0.5) * 2;
          const gradKey = `${hueKey}|${p.x.toFixed(1)}|${p.y.toFixed(1)}|${r.toFixed(2)}`;
          let grad = stroke.__overlayRadialGrad;
          if (!grad || stroke.__overlayRadialGradKey !== gradKey) {
            grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            if (gid === 1) {
              grad.addColorStop(0, `hsl(${hueKey}, 100%, 75%)`);
              grad.addColorStop(0.7, `hsl(${(hueKey + 60) % 360}, 100%, 68%)`);
              grad.addColorStop(1, `hsla(${(hueKey + 120) % 360}, 100%, 60%, 0.35)`);
            } else {
              grad.addColorStop(0, `hsl(${hueKey}, 100%, 70%)`);
              grad.addColorStop(0.7, `hsl(${(hueKey - 25 + 360) % 360}, 100%, 65%)`);
              grad.addColorStop(1, `hsla(${(hueKey - 45 + 360) % 360}, 100%, 55%, 0.35)`);
            }
            stroke.__overlayRadialGrad = grad;
            stroke.__overlayRadialGradKey = gradKey;
          }
          ctx.fillStyle = grad;
        }
        ctx.arc(p.x, p.y, lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const lw = R.getLineWidth() + (isOverlay ? 1.25 : 0);
        ctx.lineWidth = lw;
        if (useMultiColour) {
          const p1 = stroke.pts[0];
          const pLast = stroke.pts[stroke.pts.length - 1];
          const t = (performance.now ? performance.now() : Date.now());
          const gid = stroke.generatorId ?? 1;
          const hue = gid === 1
            ? (200 + 20 * Math.sin((t / 1600) * Math.PI * 2))
            : (20 + 20 * Math.sin((t / 1800) * Math.PI * 2));
          const hueKey = Math.round(hue * 0.5) * 2;
          const gradKey = `${hueKey}|${p1.x.toFixed(1)}|${p1.y.toFixed(1)}|${pLast.x.toFixed(1)}|${pLast.y.toFixed(1)}`;
          let grad = stroke.__overlayLinearGrad;
          if (!grad || stroke.__overlayLinearGradKey !== gradKey) {
            grad = ctx.createLinearGradient(p1.x, p1.y, pLast.x, pLast.y);
            if (gid === 1) {
              grad.addColorStop(0, `hsl(${hueKey}, 100%, 70%)`);
              grad.addColorStop(0.5, `hsl(${(hueKey + 45) % 360}, 100%, 70%)`);
              grad.addColorStop(1, `hsl(${(hueKey + 90) % 360}, 100%, 68%)`);
            } else {
              grad.addColorStop(0, `hsl(${hueKey}, 100%, 68%)`);
              grad.addColorStop(0.5, `hsl(${(hueKey - 25 + 360) % 360}, 100%, 66%)`);
              grad.addColorStop(1, `hsl(${(hueKey - 50 + 360) % 360}, 100%, 64%)`);
            }
            stroke.__overlayLinearGrad = grad;
            stroke.__overlayLinearGradKey = gradKey;
          }
          ctx.strokeStyle = grad;
        }
        const path = getStrokePath(stroke);
        if (path) {
          ctx.stroke(path);
        } else {
          ctx.moveTo(stroke.pts[0].x, stroke.pts[0].y);
          for (let i = 1; i < stroke.pts.length; i++) {
            ctx.lineTo(stroke.pts[i].x, stroke.pts[i].y);
          }
          ctx.stroke();
        }
      }

      ctx.restore();
    };

    if (!skipReset) R.resetCtx(ctx);
    if (skipTransform) {
      drawCore();
    } else {
      R.withLogicalSpace(ctx, drawCore);
    }
    if (!wasOverlay) markPaintDirty();
  }
  let __dgNodesCache = { canvas: null, ctx: null, key: '' };
  let __dgBlocksCache = { canvas: null, ctx: null, key: '' };

  function drawNodes(nodes) {
    if (!__dgGridReady()) {
      return;
    }
    FD.layerTrace('drawNodes:enter', {
      panelId: panel?.id || null,
      usingBackBuffers,
      nctxRole: nctx?.canvas?.getAttribute?.('data-role') || null,
      nctxSize: nctx?.canvas ? { w: nctx.canvas.width, h: nctx.canvas.height } : null,
    });
    const nodeCoords = [];
    nodeCoordsForHitTest = [];
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
    const __layoutStart = __perfOn ? performance.now() : 0;
    R.resetCtx(nctx);
    R.resetCtx(nctx);
    if (DG_COMBINE_GRID_NODES) {
      if (!panel.__dgGridReadyForNodes) {
        drawGrid();
      }
      panel.__dgGridReadyForNodes = false;
    }
    const surface = nctx.canvas;
    const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
    const width = cssW || (surface?.width ?? 0) / scale;
    const height = cssH || (surface?.height ?? 0) / scale;
    if (!DG_COMBINE_GRID_NODES) {
      const surfacePxW = surface?.width ?? 0;
      const surfacePxH = surface?.height ?? 0;
      R.withDeviceSpace(nctx, () => {
        nctx.clearRect(0, 0, surfacePxW, surfacePxH);
      });
    }
    if (DG_SINGLE_CANVAS && nodesFrontCtx?.canvas) {
      const frontSurface = nodesFrontCtx.canvas;
      R.withDeviceSpace(nodesFrontCtx, () => {
        nodesFrontCtx.clearRect(0, 0, frontSurface.width, frontSurface.height);
      });
    }
    if (!__dgProbeDidFirstDraw && typeof window !== 'undefined' && window.__DG_PROBE_ON !== false) {
      __dgProbeDidFirstDraw = true;
      try { __dgProbeDump('first-draw:nodes'); } catch {}
    }
    R.withLogicalSpace(nctx, () => {
      if (!nodes) {
        return;
      }

      const radius = Math.max(4, Math.min(cw, ch) * 0.20);
      const isZoomed = panel.classList.contains('toy-zoomed');
      let __dgHash = 2166136261;
      const __dgHashStep = (h, v) => {
        const n = (Number.isFinite(v) ? v : 0) | 0;
        return ((h ^ n) * 16777619) >>> 0;
      };
      __dgHash = __dgHashStep(__dgHash, rows);
      __dgHash = __dgHashStep(__dgHash, cols);
      __dgHash = __dgHashStep(__dgHash, Math.round(cw * 1000));
      __dgHash = __dgHashStep(__dgHash, Math.round(ch * 1000));
      __dgHash = __dgHashStep(__dgHash, Math.round(topPad * 1000));
      __dgHash = __dgHashStep(__dgHash, Math.round((gridArea?.x || 0) * 1000));
      __dgHash = __dgHashStep(__dgHash, Math.round((gridArea?.y || 0) * 1000));
      __dgHash = __dgHashStep(__dgHash, Math.round((gridArea?.w || 0) * 1000));
      __dgHash = __dgHashStep(__dgHash, Math.round((gridArea?.h || 0) * 1000));
      __dgHash = __dgHashStep(__dgHash, isZoomed ? 1 : 0);

      const activeCols = currentMap?.active || [];
      for (let c = 0; c < cols; c++) {
        __dgHash = __dgHashStep(__dgHash, activeCols[c] ? 1 : 0);
      }
      const dragCol = (typeof dragScaleHighlightCol === 'number') ? dragScaleHighlightCol : -1;
      const dragRow = (draggedNode && typeof draggedNode.row === 'number') ? draggedNode.row : -1;
      __dgHash = __dgHashStep(__dgHash, dragCol);
      __dgHash = __dgHashStep(__dgHash, dragRow);

      for (let c = 0; c < cols; c++) {
        if (!nodes[c] || nodes[c].size === 0) continue;
        for (const r of nodes[c]) {
          const x = gridArea.x + c * cw + cw * 0.5;
          const y = gridArea.y + topPad + r * ch + ch * 0.5;
          const groupEntry = nodeGroupMap?.[c]?.get(r) ?? null;
          const disabledSet = currentMap?.disabled?.[c];
          const isDisabled = !!(disabledSet && disabledSet.has(r));
          if (Array.isArray(groupEntry) && groupEntry.length > 0) {
            for (let i = groupEntry.length - 1; i >= 0; i--) {
              const gid = groupEntry[i];
              __dgHash = __dgHashStep(__dgHash, c);
              __dgHash = __dgHashStep(__dgHash, r);
              __dgHash = __dgHashStep(__dgHash, isDisabled ? 1 : 0);
              __dgHash = __dgHashStep(__dgHash, (gid == null ? -1 : gid));
            const nodeData = { x, y, col: c, row: r, radius: radius * 1.5, group: gid, disabled: isDisabled };
            nodeCoords.push(nodeData);
            nodeCoordsForHitTest.push(nodeData);
          }
        } else {
          const groupId = typeof groupEntry === 'number' ? groupEntry : null;
          __dgHash = __dgHashStep(__dgHash, c);
          __dgHash = __dgHashStep(__dgHash, r);
          __dgHash = __dgHashStep(__dgHash, isDisabled ? 1 : 0);
          __dgHash = __dgHashStep(__dgHash, (groupId == null ? -1 : groupId));
          const nodeData = { x, y, col: c, row: r, radius: radius * 1.5, group: groupId, disabled: isDisabled };
          nodeCoords.push(nodeData);
          nodeCoordsForHitTest.push(nodeData);
        }
      }
      }

      if (__perfOn && __layoutStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.layout', performance.now() - __layoutStart); } catch {}
      }

    const cache = __dgNodesCache;
      const surfacePxW = surface?.width ?? nctx.canvas?.width ?? 0;
      const surfacePxH = surface?.height ?? nctx.canvas?.height ?? 0;
      if (!cache.canvas) cache.canvas = document.createElement('canvas');
      if (cache.canvas.width !== surfacePxW) cache.canvas.width = surfacePxW;
      if (cache.canvas.height !== surfacePxH) cache.canvas.height = surfacePxH;
      if (!cache.ctx) cache.ctx = cache.canvas.getContext('2d');
    const cacheKey = `${__dgHash}|${Math.round(radius * 1000)}|${surfacePxW}x${surfacePxH}`;
    const cacheMiss = cache.key !== cacheKey;

    if (cacheMiss) {
      FD.layerDebugLog('nodes-cache-miss', {
        panelId: panel?.id || null,
        cacheKey,
        surfacePxW,
        surfacePxH,
        cssW,
        cssH,
        nodeCount: nodeCoords.length,
      });
      const __drawStart = __perfOn ? performance.now() : 0;
      renderDragScaleBlueHints(nctx);
      nctx.lineWidth = 3;
      const colsMap = new Map();
      for (const node of nodeCoords) {
        if (!colsMap.has(node.col)) colsMap.set(node.col, []);
        colsMap.get(node.col).push(node);
      }

      const colorFor = (gid, active = true) => {
        if (!active) return 'rgba(80, 100, 160, 0.6)';
        if (gid === 1) return 'rgba(125, 180, 255, 0.9)';
        if (gid === 2) return 'rgba(255, 160, 120, 0.9)';
        return 'rgba(255, 255, 255, 0.85)';
      };

      const matchGroup = (value, gid) => {
        if (gid == null) return value == null;
        return value === gid;
      };

      const __connStart = __perfOn ? performance.now() : 0;
      for (let c = 0; c < cols - 1; c++) {
        const currentColNodes = colsMap.get(c);
        const nextColNodes = colsMap.get(c + 1);
        if (!currentColNodes || !nextColNodes) continue;
        const currentIsActive = currentMap?.active?.[c] ?? false;
        const nextIsActive = currentMap?.active?.[c + 1] ?? true;
        const advanced = panel.classList.contains('toy-zoomed');

        const drawGroupConnections = (gid) => {
          for (const nodeA of currentColNodes) {
            if (!matchGroup(nodeA.group ?? null, gid)) continue;
            for (const nodeB of nextColNodes) {
              if (!matchGroup(nodeB.group ?? null, gid)) continue;
              const eitherDisabled = nodeA.disabled || nodeB.disabled;
              nctx.strokeStyle = colorFor(gid, currentIsActive && nextIsActive && !eitherDisabled);
              if (gid && advanced && !eitherDisabled) {
                nctx.shadowColor = nctx.strokeStyle;
                nctx.shadowBlur = 12;
              } else {
                nctx.shadowColor = 'transparent';
                nctx.shadowBlur = 0;
              }
              nctx.beginPath();
              nctx.moveTo(nodeA.x, nodeA.y);
              nctx.lineTo(nodeB.x, nodeB.y);
              nctx.stroke();
            }
          }
        };

        drawGroupConnections(1);
        drawGroupConnections(2);
        drawGroupConnections(null);
      }
      if (__perfOn && __connStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.connections', performance.now() - __connStart); } catch {}
      }

      nctx.shadowColor = 'transparent';
      nctx.shadowBlur = 0;

      const gradientCache = new Map();
      const getGradient = (ctx, x, y, r, color) => {
        const key = `${color}-${r}`;
        if (!gradientCache.has(key)) {
          const grad = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
          grad.addColorStop(0, color);
          grad.addColorStop(0.92, 'rgba(143, 168, 255, 0)');
          grad.addColorStop(1, 'rgba(143, 168, 255, 0)');
          gradientCache.set(key, grad);
        }
        return gradientCache.get(key);
      };

      const __circleStart = __perfOn ? performance.now() : 0;
      for (const node of nodeCoords) {
        const disabled = node.disabled || currentMap?.disabled?.[node.col]?.has(node.row);
        const group = node.group ?? null;
        const advanced = panel.classList.contains('toy-zoomed');
        const isSpecialLine1 = group === 1;
        const isSpecialLine2 = group === 2;
        const mainColor = disabled
          ? 'rgba(143, 168, 255, 0.4)'
          : isSpecialLine1
            ? 'rgba(125, 180, 255, 0.92)'
            : isSpecialLine2
              ? 'rgba(255, 160, 120, 0.92)'
              : 'rgba(255, 255, 255, 0.92)';

        if (advanced && (isSpecialLine1 || isSpecialLine2) && !disabled) {
          const glowRadius = node.radius * 1.6;
          const glowColor = isSpecialLine1 ? 'rgba(125, 180, 255, 0.4)' : 'rgba(255, 160, 120, 0.4)';
          nctx.fillStyle = glowColor;
          nctx.beginPath();
          nctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
          nctx.fill();
        }

        nctx.fillStyle = getGradient(nctx, node.x, node.y, node.radius, mainColor);
        nctx.beginPath();
        nctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        nctx.fill();

        nctx.beginPath();
        nctx.fillStyle = disabled ? 'rgba(90, 110, 150, 0.65)' : 'rgba(255, 255, 255, 0.9)';
        nctx.arc(node.x, node.y, node.radius * 0.55, 0, Math.PI * 2);
        nctx.fill();

        nctx.fillStyle = disabled ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.5)';
        nctx.beginPath();
        nctx.arc(node.x, node.y - node.radius * 0.3, node.radius * 0.3, 0, Math.PI * 2);
        nctx.fill();
      }
      if (__perfOn && __circleStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.circles', performance.now() - __circleStart); } catch {}
      }

      if (panel.classList.contains('toy-zoomed')) {
        const __outlineStart = __perfOn ? performance.now() : 0;
        for (const node of nodeCoords) {
          if (!node.group) continue;
          const disabled = node.disabled || currentMap?.disabled?.[node.col]?.has(node.row);
          const outlineColor = node.group === 1
            ? 'rgba(125, 180, 255, 0.95)'
            : node.group === 2
              ? 'rgba(255, 160, 120, 0.95)'
              : 'rgba(255, 255, 255, 0.85)';
          const strokeAlpha = disabled ? 0.65 : 1;
          nctx.lineWidth = disabled ? 2 : 3.5;
          nctx.strokeStyle = outlineColor.replace(/0\.[0-9]+\)$/, `${strokeAlpha})`);
          nctx.beginPath();
          nctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          nctx.stroke();
        }
        if (__perfOn && __outlineStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.outlines', performance.now() - __outlineStart); } catch {}
        }
      }

      if (cache.ctx) {
        cache.ctx.setTransform(1, 0, 0, 1, 0, 0);
        cache.ctx.clearRect(0, 0, cache.canvas.width, cache.canvas.height);
        cache.ctx.drawImage(nctx.canvas, 0, 0);
      }
      cache.key = cacheKey;
      if (__perfOn && __drawStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.draw', performance.now() - __drawStart); } catch {}
      }
      } else if (cache.canvas) {
        const __cacheBlitStart = __perfOn ? performance.now() : 0;
        nctx.drawImage(cache.canvas, 0, 0);
        if (__perfOn && __cacheBlitStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.cacheBlit', performance.now() - __cacheBlitStart); } catch {}
        }
      }

      const blockCache = __dgBlocksCache;
      if (!blockCache.canvas) blockCache.canvas = document.createElement('canvas');
      if (blockCache.canvas.width !== surfacePxW) blockCache.canvas.width = surfacePxW;
      if (blockCache.canvas.height !== surfacePxH) blockCache.canvas.height = surfacePxH;
      if (!blockCache.ctx) blockCache.ctx = blockCache.canvas.getContext('2d');
      const blockKey = `${__dgHash}|${Math.round(radius * 1000)}|${surfacePxW}x${surfacePxH}|blocks`;
      if (blockCache.key !== blockKey && blockCache.ctx) {
        const __blocksBuildStart = __perfOn ? performance.now() : 0;
        blockCache.key = blockKey;
        R.resetCtx(blockCache.ctx);
        R.withLogicalSpace(blockCache.ctx, () => {
          blockCache.ctx.clearRect(0, 0, width, height);
          for (const node of nodeCoords) {
            const colActive = currentMap?.active?.[node.col] ?? true;
            const nodeOn = colActive && !node.disabled;
            const size = radius * 2;
            const cubeRect = { x: node.x - size / 2, y: node.y - size / 2, w: size, h: size };
            drawBlock(blockCache.ctx, cubeRect, {
              baseColor: nodeOn ? '#ff8c00' : '#333',
              active: nodeOn,
              variant: 'button',
              noteLabel: null,
              showArrows: false,
            });
          }
          drawNoteLabelsTo(blockCache.ctx, nodes);
        });
        if (__perfOn && __blocksBuildStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.blocks.build', performance.now() - __blocksBuildStart); } catch {}
        }
      }

      if (blockCache.canvas) {
        const __blocksBlitStart = __perfOn ? performance.now() : 0;
        nctx.drawImage(blockCache.canvas, 0, 0);
        if (__perfOn && __blocksBlitStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.blocks.blit', performance.now() - __blocksBlitStart); } catch {}
        }
      }

      const __flashStart = __perfOn ? performance.now() : 0;
      for (const node of nodeCoords) {
        const flash = flashes[node.col] || 0;
        if (flash <= 0) continue;
        const size = radius * 2;
        const cubeRect = { x: node.x - size / 2, y: node.y - size / 2, w: size, h: size };
        nctx.save();
        const scale = 1 + 0.15 * Math.sin(flash * Math.PI);
        nctx.translate(node.x, node.y);
        nctx.scale(scale, scale);
        nctx.translate(-node.x, -node.y);
        drawBlock(nctx, cubeRect, {
          baseColor: '#FFFFFF',
          active: true,
          variant: 'button',
          noteLabel: null,
          showArrows: false,
        });
        nctx.restore();
      }
      if (__perfOn && __flashStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.flash', performance.now() - __flashStart); } catch {}
      }
      if (tutorialHighlightMode !== 'none') {
        const __tutorialStart = __perfOn ? performance.now() : 0;
        renderTutorialHighlight();
        if (__perfOn && __tutorialStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.tutorial', performance.now() - __tutorialStart); } catch {}
        }
      } else {
        const __tutorialStart = __perfOn ? performance.now() : 0;
        clearTutorialHighlight();
        if (__perfOn && __tutorialStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.tutorial', performance.now() - __tutorialStart); } catch {}
        }
      }

      nodeCoordsForHitTest = nodeCoords;
    });
    if (DG_SINGLE_CANVAS && !DG_SINGLE_CANVAS_OVERLAYS) {
      __dgMarkSingleCanvasCompositeDirty(panel);
    }
    FD.layerTrace('drawNodes:exit', {
      panelId: panel?.id || null,
      usingBackBuffers,
      nctxRole: nctx?.canvas?.getAttribute?.('data-role') || null,
    });
  }

  function drawNoteLabelsTo(ctx, nodes) {
    if (!ctx) return;
    R.withLogicalSpace(ctx, () => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const labelY = Math.round((cssH || 0) - 10);

      for (let c = 0; c < cols; c++) {
        if (!nodes[c] || nodes[c].size === 0) continue;
        let r = undefined;
        const disabledSet = currentMap?.disabled?.[c] || new Set();
        for (const row of nodes[c]) {
          if (!disabledSet.has(row)) { r = row; break; }
        }
        if (r === undefined) continue;
        const midiNote = chromaticPalette[r];
        if (midiNote === undefined) continue;
        const tx = Math.round(gridArea.x + c * cw + cw * 0.5);
        ctx.fillText(midiToName(midiNote), tx, labelY);
      }
    });
  }

  function drawNoteLabels(nodes) {
    drawNoteLabelsTo(nctx, nodes);
  }

  // --- Note Palettes for Snapping ---
  const pentatonicOffsets = [0, 3, 5, 7, 10];
  const chromaticOffsets = Array.from({length: 12}, (_, i) => i);
  // Create palettes of MIDI numbers. Reversed so top row is highest pitch.
  const chromaticPalette = buildPalette(48, chromaticOffsets, 1).reverse(); // MIDI 59 (B3) down to 48 (C3)
  const pentatonicPalette = buildPalette(48, pentatonicOffsets, 2).reverse(); // 10 notes from C3-C5 range
  const pentatonicPitchClasses = new Set(pentatonicOffsets.map(offset => ((offset % 12) + 12) % 12));

  function renderDragScaleBlueHints(ctx) {
    if (!ctx) return;
    if (typeof dragScaleHighlightCol !== 'number' || dragScaleHighlightCol < 0 || dragScaleHighlightCol >= cols) return;
    if (cw <= 0 || ch <= 0) return;
    const noteGridY = gridArea.y + topPad;
    const colX = gridArea.x + dragScaleHighlightCol * cw;
    const activeRow = (draggedNode && draggedNode.col === dragScaleHighlightCol) ? draggedNode.row : null;
    ctx.save();
    const strokeWidth = Math.max(1, Math.min(cw, ch) * 0.045);
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    for (let r = 0; r < rows; r++) {
      const midi = chromaticPalette[r];
      if (typeof midi !== 'number') continue;
      const pitchClass = ((midi % 12) + 12) % 12;
      if (!pentatonicPitchClasses.has(pitchClass)) continue;
      const y = noteGridY + r * ch;
      const alpha = (activeRow === r) ? 0.6 : 0.35;
      ctx.fillStyle = `rgba(90, 200, 255, ${alpha})`;
      ctx.fillRect(colX, y, cw, ch);
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = activeRow === r ? 'rgba(160, 240, 255, 0.95)' : 'rgba(130, 220, 255, 0.85)';
      ctx.strokeRect(colX, y, cw, ch);
    }
    ctx.restore();
  }

  function setDragScaleHighlight(col) {
    const next = (typeof col === 'number' && col >= 0 && col < cols) ? col : null;
    if (dragScaleHighlightCol === next) return;
    dragScaleHighlightCol = next;
    drawGrid();
    drawNodes(currentMap?.nodes || null);
  }

  function snapToGrid(sourceCtx = pctx){
    // build a map: for each column, choose at most one row where line crosses
    const active = Array(cols).fill(false);
    const nodes = Array.from({length:cols}, ()=> new Set());
    const disabled = Array.from({length:cols}, ()=> new Set());
    const w = paint.width;
    const h = paint.height;
    if (!w || !h) return { active, nodes, disabled }; // Abort if canvas is not ready
    const data = sourceCtx.getImageData(0, 0, w, h).data;

    for (let c=0;c<cols;c++){
      // Define the scan area strictly to the visible grid column to avoid phantom nodes
      const xStart_css = gridArea.x + c * cw;
      const xEnd_css = gridArea.x + (c + 1) * cw;
      const xStart = Math.round(xStart_css);
      const xEnd = Math.round(xEnd_css);
      
      let ySum = 0;
      let inkCount = 0;

      // Scan the column for all "ink" pixels to find the average Y position
      // We scan the full canvas height because the user can draw above or below the visual grid.
      for (let x = xStart; x < xEnd; x++) {
        for (let y = 0; y < h; y++) {
          const i = (y * w + x) * 4;
          if (data[i + 3] > 10) { // alpha threshold
            ySum += y;
            inkCount++;
          }
        }
      }

      if (inkCount > 0) {
        const avgY_dpr = ySum / inkCount;
        const avgY_css = avgY_dpr;

        const noteGridTop = gridArea.y + topPad;
        const noteGridBottom = noteGridTop + rows * ch;
        const isOutside = avgY_css <= noteGridTop || avgY_css >= noteGridBottom;

        if (isOutside) {
            // Find a default "in-key" row for out-of-bounds drawing.
            // This ensures disabled notes are still harmonically related.
            let safeRow = 7; // Fallback to a middle-ish row
            try {
                const visiblePentatonicNotes = pentatonicPalette.filter(p => chromaticPalette.includes(p));
                if (visiblePentatonicNotes.length > 0) {
                    // Pick a note from the middle of the available pentatonic notes.
                    const middleIndex = Math.floor(visiblePentatonicNotes.length / 2);
                    const targetMidi = visiblePentatonicNotes[middleIndex];
                    const targetRow = chromaticPalette.indexOf(targetMidi);
                    if (targetRow !== -1) safeRow = targetRow;
                }
            } catch {}
            nodes[c].add(safeRow);
            disabled[c].add(safeRow);
            active[c] = false; // This will be recomputed later, but good to be consistent
        } else {
            // Map average Y to nearest row, clamped to valid range.
            const r_clamped = Math.max(0, Math.min(rows - 1, Math.round((avgY_css - (gridArea.y + topPad)) / ch)));
            let r_final = r_clamped;

            if (autoTune) {
              // 1. Get the MIDI note for the visually-drawn row
              const drawnMidi = chromaticPalette[r_clamped];

              // 2. Find the nearest note in the pentatonic scale
              let nearestMidi = pentatonicPalette[0];
              let minDiff = Math.abs(drawnMidi - nearestMidi);
              for (const pNote of pentatonicPalette) {
                const diff = Math.abs(drawnMidi - pNote);
                if (diff < minDiff) { minDiff = diff; nearestMidi = pNote; }
              }

              // 3. Map that pentatonic note into the visible chromatic range by octave wrapping
              try {
                const minC = chromaticPalette[chromaticPalette.length - 1];
                const maxC = chromaticPalette[0];
                let wrapped = nearestMidi|0;
                while (wrapped > maxC) wrapped -= 12;
                while (wrapped < minC) wrapped += 12;
                const correctedRow = chromaticPalette.indexOf(wrapped);
                if (correctedRow !== -1) r_final = correctedRow;
              } catch {}
            }

            nodes[c].add(r_final);
            active[c] = true;
        }
      }
    }
    if (typeof window !== 'undefined' && window.DG_DRAW_DEBUG) {
      const totalNodes = nodes.reduce((n, set) => n + ((set && set.size) || 0), 0);
      console.debug('[DG][SNAP] summary', { w, h, totalNodes, anyInk: totalNodes > 0 });
    }
    return {active, nodes, disabled};
  }

  function onPointerDown(e){
    e.stopPropagation();
    FD.flowLog('pointer:down:entry', {
      focusedId: window.gFocusedToy?.id || null,
      focusMismatch: !!(window.gFocusedToy && window.gFocusedToy !== panel),
      unfocused: panel?.classList?.contains?.('toy-unfocused') || false,
    });
    if (window.gFocusedToy && window.gFocusedToy !== panel) {
      // If another toy is focused, request focus here but still allow drawing.
      try { window.requestToyFocus?.(panel, { center: false }); } catch {}
    }
    stopAutoGhostGuide({ immediate: false });
    markUserChange('pointerdown');
    FD.flowLog('pointer:down', {});
    const p = pointerToPaintLogical(e);

    // (Top cubes removed)

    // Check for node hit first using full grid cell bounds (bigger tap area)
    for (const node of nodeCoordsForHitTest) {
      const cellX = gridArea.x + node.col * cw;
      const cellY = gridArea.y + topPad + node.row * ch;
      if (p.x >= cellX && p.x <= cellX + cw && p.y >= cellY && p.y <= cellY + ch) {
        pendingNodeTap = { col: node.col, row: node.row, x: p.x, y: p.y, group: node.group ?? null };
        setDrawingState(true); // capture move/up
        try { paint.setPointerCapture?.(e.pointerId); } catch {}
        e.preventDefault?.();
        return; // Defer deciding until move/up
      }
    }

    setDrawingState(true);
    try { paint.setPointerCapture?.(e.pointerId); } catch {}
    e.preventDefault?.();

    // Live ink should draw straight to the visible canvas; suppress swaps during drag.
    __dgSkipSwapsDuringDrag = true;
    if (typeof useFrontBuffers === 'function') useFrontBuffers();
    pctx = getActivePaintCtx();
    if (typeof window !== 'undefined' && window.DG_DRAW_DEBUG && pctx && pctx.canvas) {
      const c = pctx.canvas;
      console.debug('[DG][PAINT/ctx]', {
        role: c.getAttribute?.('data-role') || c.id || 'unknown',
        w: c.width,
        h: c.height,
        cssW,
        cssH,
        dpr: paintDpr,
        alpha: pctx.globalAlpha,
        comp: pctx.globalCompositeOperation,
      });
    }
    resetPaintBlend(pctx);

      // When starting a new line, don't clear the canvas. This makes drawing additive.
      // If we are about to draw a special line (previewGid decided), demote any existing line of that kind.
      try {
        const isZoomed = panel.classList.contains('toy-zoomed');
        const hasLine1 = strokes.some(s => s.generatorId === 1);
        const hasLine2 = strokes.some(s => s.generatorId === 2);
        let intendedGid = null;
        if (!isZoomed) {
          if (!hasLine1 && !hasLine2) intendedGid = 1;
        } else {
          if (!hasLine1) intendedGid = 1; else if (nextDrawTarget) intendedGid = nextDrawTarget;
        }
        if (intendedGid) {
          const existing = strokes.find(s => s.generatorId === intendedGid);
          if (existing) {
            existing.isSpecial = false;
            existing.generatorId = null;
            existing.overlayColorize = true;
            // assign a random palette color
            const idx = Math.floor(Math.random() * STROKE_COLORS.length);
            existing.color = STROKE_COLORS[idx];
          }
        }
      } catch {}
      const paintStart = p;
      const { x: x0, y: y0 } = paintStart;
      // Particle push on gesture start — snowplow a full-width band even before movement.
      try {
        const area = (gridArea && gridArea.w > 0 && gridArea.h > 0)
          ? gridArea
          : { w: cssW || 0, h: cssH || 0 };
        const baseRadius = DG_KNOCK.ghostTrail.radiusToy(area);
        const lw = (typeof R.getLineWidth === 'function') ? R.getLineWidth() : 12;
        FF.pokeAlongStrokeBand(x0, y0, x0, y0, lw, DG_KNOCK.ghostTrail);
        const pushRadius = baseRadius * 1.5;
        FF.pokeFieldToy('pointerDown', x0, y0, pushRadius, DG_KNOCK.ghostTrail.strength, { mode: 'plow' });
      } catch {}
      cur = {
        pts:[paintStart],
        color: STROKE_COLORS[colorIndex++ % STROKE_COLORS.length]
      };
      try {
        knockLettersAt(
          p.x - (gridArea?.x || 0),
          p.y - (gridArea?.y || 0),
          { radius: 100, strength: 14, source: 'line' }
        );
      } catch {}
      // The full stroke will be drawn on pointermove.
  }
  let __dgMoveRAF = 0;
  let __dgPendingMoveEvt = null;
  function onPointerMove(e){
    __dgPendingMoveEvt = e;
    if (__dgMoveRAF) return;
    __dgMoveRAF = requestAnimationFrame(() => {
      __dgMoveRAF = 0;
      const evt = __dgPendingMoveEvt;
      __dgPendingMoveEvt = null;
      handlePointerMove(evt || e);
    });
  }

  function handlePointerMove(e){
    const p = pointerToPaintLogical(e);
    if (!pctx) {
      DG.warn('pctx missing; forcing front buffers');
      if (typeof useFrontBuffers === 'function') useFrontBuffers();
    }
    
    // Update cursor for draggable nodes
    if (!draggedNode) {
      let onNode = false;
      for (const node of nodeCoordsForHitTest) {
        const cellX = gridArea.x + node.col * cw;
        const cellY = gridArea.y + topPad + node.row * ch;
        if (p.x >= cellX && p.x <= cellX + cw && p.y >= cellY && p.y <= cellY + ch) { onNode = true; break; }
      }
      paint.style.cursor = onNode ? 'grab' : 'default';
    }

    // Promote pending tap to drag if moved sufficiently
    if (pendingNodeTap && drawing && !draggedNode) {
      const dx = p.x - pendingNodeTap.x;
      const dy = p.y - pendingNodeTap.y;
      if (Math.hypot(dx, dy) > 6) {
        draggedNode = {
          col: pendingNodeTap.col,
          row: pendingNodeTap.row,
          group: pendingNodeTap.group ?? null,
          moved: false,
          originalRow: pendingNodeTap.row
        };
        paint.style.cursor = 'grabbing';
        pendingNodeTap = null;
        setDragScaleHighlight(draggedNode.col);
      }
    }

    if (draggedNode && drawing) {
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      const newRow = clamp(Math.round((p.y - (gridArea.y + topPad)) / ch), 0, rows - 1);

      if (newRow !== draggedNode.row && currentMap) {
          const col = draggedNode.col;
          const oldRow = draggedNode.row;
          const gid = draggedNode.group ?? null;

          // Ensure group map exists for this column
          if (!nodeGroupMap[col]) nodeGroupMap[col] = new Map();
          const colGroupMap = nodeGroupMap[col];

          // Remove this group's presence from the old row's stack
          if (gid != null) {
            const oldArr = (colGroupMap.get(oldRow) || []).filter(g => g !== gid);
            if (oldArr.length > 0) colGroupMap.set(oldRow, oldArr); else colGroupMap.delete(oldRow);
          } else {
            // Ungrouped move: nothing in group map to update
          }

          // Update nodes set for old row only if no groups remain there
          if (!(colGroupMap.has(oldRow))) {
            // If some other ungrouped logic wants to keep it, ensure we don't remove erroneously
            currentMap.nodes[col].delete(oldRow);
          }

          // Add/move to new row; place on top of z-stack
          if (gid != null) {
            const newArr = colGroupMap.get(newRow) || [];
            // Remove any existing same gid first to avoid dupes, then push to end (top)
            const filtered = newArr.filter(g => g !== gid);
            filtered.push(gid);
            colGroupMap.set(newRow, filtered);
          }
          currentMap.nodes[col].add(newRow);

          // record manual override for standard view preservation
          try {
            if (!manualOverrides[col]) manualOverrides[col] = new Set();
            manualOverrides[col] = new Set(currentMap.nodes[col]);
          } catch {}

          draggedNode.row = newRow;
          draggedNode.moved = true;
          try {
            panel.dispatchEvent(new CustomEvent('drawgrid:node-drag', { detail: { col, row: newRow, group: gid } }));
          } catch {}
          
          // Redraw only the nodes canvas; the blue line on the paint canvas is untouched.
          drawNodes(currentMap.nodes);
          drawGrid();
          // We just redrew static layers, so treat them as clean.
          panel.__dgStaticDirty = false;
          __dgMarkSingleCanvasDirty(panel);
          if (DG_SINGLE_CANVAS && isPanelVisible) {
            try { compositeSingleCanvas(); } catch {}
            panel.__dgSingleCompositeDirty = false;
          }
      } else if (dragScaleHighlightCol === null) {
          setDragScaleHighlight(draggedNode.col);
      }
      return;
    }

    if (!drawing) return; // Guard for drawing logic below

    if (cur) {
      pctx = getActivePaintCtx();
      resetPaintBlend(pctx);
      const paintPt = p;
      const pt = paintPt;
      try {
        if (!previewGid && pctx) {
          const sz = Math.max(1, Math.floor(R.getLineWidth() / 6));
          R.withLogicalSpace(pctx, () => {
            pctx.fillStyle = '#ffffff';
            pctx.fillRect(paintPt.x, paintPt.y, sz, sz);
          });
        }
        if (DG_TRACE_DEBUG) {
          console.debug('[DG][ink] livemove', {
            id: panel.id,
            w: pctx?.canvas?.width ?? null,
            h: pctx?.canvas?.height ?? null,
            cssW,
            cssH,
            dpr: paintDpr,
            usingBackBuffers,
            previewGid,
            nextDrawTarget,
          });
        }
      } catch {}
      cur.pts.push(paintPt);
      // Determine if current stroke should show a special-line preview
      const isAdvanced = panel.classList.contains('toy-zoomed');
      const hasLine1 = strokes.some(s => s.generatorId === 1);
      const hasLine2 = strokes.some(s => s.generatorId === 2);

      previewGid = null;
      // Only show preview in advanced mode or when a line button is explicitly armed.
      if (isAdvanced) {
        if (!hasLine1) previewGid = 1;
        else if (nextDrawTarget) previewGid = nextDrawTarget;
      } else if (nextDrawTarget) {
        previewGid = nextDrawTarget;
      }
      // If overlay strokes are disabled, fall back to paint so live lines remain visible.
      if (previewGid && typeof window !== 'undefined' && window.__PERF_DG_OVERLAY_STROKES_OFF) {
        previewGid = null;
      }
      dbgCounters.pointerMoves++;
      // Debug: track preview vs paint to ensure live line visibility
      try {
        if ((dbgCounters.pointerMoves % 7) === 1) {
          dgTraceLog('[drawgrid] liveMove', {
            id: panel.id,
            advanced: isAdvanced,
            nextDrawTarget,
            previewGid,
            hasLine1,
            hasLine2,
          });
        }
      } catch {}
      if ((dbgCounters.pointerMoves % 12) === 1) {
        FD.flowLog('draw:move', { previewGid, nextDrawTarget, advanced: isAdvanced });
      }
      // For normal lines (no previewGid), paint segment onto paint; otherwise, overlay will show it
      if (!previewGid) {
        const lastIdx = cur.pts.length - 1;
        const prevIdx = Math.max(0, cur.pts.length - 2);
        const lastPt = cur.pts[lastIdx];
        const prevPt = cur.pts[prevIdx];
        // ensure we're actually painting opaque pixels in normal mode
        resetPaintBlend(pctx);
        const hasSpecialLine = strokes.some(s => s.isSpecial || s.generatorId);
        const wantsSpecialLive = !isAdvanced && !hasSpecialLine;
        const liveStrokeMeta = { ...cur, isSpecial: wantsSpecialLive, liveAlphaOverride: 1 };
        R.drawLiveStrokePoint(pctx, lastPt, prevPt, liveStrokeMeta);

        __dgNeedsUIRefresh = false; // don't trigger overlay clears during draw
      }
      try {
        const lastIdx = cur.pts.length - 1;
        const lastPt = cur.pts[lastIdx];
        if (lastPt) {
          const area = (gridArea && gridArea.w > 0 && gridArea.h > 0)
            ? gridArea
            : { w: cssW || 0, h: cssH || 0 };
          let baseRadius = typeof DG_KNOCK?.ghostTrail?.radiusToy === 'function'
            ? DG_KNOCK.ghostTrail.radiusToy(area)
            : 0;
          if (!Number.isFinite(baseRadius) || baseRadius <= 0) baseRadius = 18;
          const pointerR = baseRadius * 1.5;
          const logicalW = (Number.isFinite(gridAreaLogical?.w) && gridAreaLogical.w > 0)
            ? gridAreaLogical.w
            : (area?.w || cssW || 0);
          const logicalH = (Number.isFinite(gridAreaLogical?.h) && gridAreaLogical.h > 0)
            ? gridAreaLogical.h
            : (area?.h || cssH || 0);
          const logicalMin = Math.min(
            Number.isFinite(logicalW) && logicalW > 0 ? logicalW : 0,
            Number.isFinite(logicalH) && logicalH > 0 ? logicalH : 0,
          );
          const capR = Math.max(8, logicalMin > 0 ? logicalMin * 0.25 : pointerR * 1.25);
          const disturbanceRadius = Math.min(pointerR, capR);
          FF.pokeFieldToy('ghostTrail', lastPt.x, lastPt.y, disturbanceRadius, DG_KNOCK.ghostTrail.strength, {
            mode: 'plow',
            highlightMs: 900,
          });
          const lettersRadius = Math.max(
            disturbanceRadius * 2.25,
            logicalMin * 0.2,
            40,
          );
          const localX = lastPt.x - (gridArea?.x || 0);
          const localY = lastPt.y - (gridArea?.y || 0);
          knockLettersAt(localX, localY, {
            radius: lettersRadius,
            strength: 12,
            source: 'line',
          });
        }
      } catch {}
      const includeCurrent = !previewGid;
      // drawIntoBackOnly(includeCurrent);
      // pendingPaintSwap = true;
    }
  }
  function onPointerUp(e){
    __dgSkipSwapsDuringDrag = false;
    // Only defer/blank if a *zoom commit* is actually settling.
    const now = performance?.now?.() ?? Date.now();
    const settleTs = (typeof window !== 'undefined') ? window.__GESTURE_SETTLE_UNTIL_TS : 0;
    const inZoomCommit = Number.isFinite(settleTs) && settleTs > now;

    if (inZoomCommit) {
      __dgDeferUntilTs = Math.max(__dgDeferUntilTs, settleTs);
      __dgStableFramesAfterCommit = 0;          // only reset when a zoom commit is settling
      __dgNeedsUIRefresh = true;                // schedule safe clears
    } else {
      // No zoom commit -> do NOT schedule the deferred clears here
      // (avoids one-frame blank/freeze of particles/text on simple pointerup)
    }
    // IMPORTANT: do not clear here; renderLoop will do it safely.
    if (draggedNode) {
      const finalDetail = { col: draggedNode.col, row: draggedNode.row, group: draggedNode.group ?? null };
      const didMove = !!draggedNode.moved;
      if (didMove || inZoomCommit) __dgNeedsUIRefresh = true;
      emitDrawgridUpdate({ activityOnly: false });
      if (didMove) {
        try { panel.dispatchEvent(new CustomEvent('drawgrid:node-drag-end', { detail: finalDetail })); } catch {}
        try {
          const cx = gridArea.x + draggedNode.col * cw + cw * 0.5;
          const cy = gridArea.y + topPad + draggedNode.row * ch + ch * 0.5;
          const baseRadius = Math.max(6, Math.min(cw, ch) * 0.5);
          spawnNoteRingEffect(cx, cy, baseRadius);
          dgField?.pulse?.(0.25);
          const wrapRect = wrap?.getBoundingClientRect?.();
          if (wrapRect && wrapRect.width && wrapRect.height) {
            const localX = (wrapRect.width * 0.5) - (gridArea?.x || 0);
            const localY = (wrapRect.height * 0.5) - (gridArea?.y || 0);
            knockLettersAt(localX, localY, { radius: 80, strength: 10 });
          }
        } catch {}
      }
      draggedNode = null;
      setDragScaleHighlight(null);
      setDrawingState(false);
      paint.style.cursor = 'default';
      return;
    }

    // Tap on a node toggles column active state
    if (pendingNodeTap) {
      const col = pendingNodeTap.col;
      const row = pendingNodeTap.row;
      if (!currentMap) {
        currentMap = {
          active:Array(cols).fill(false),
          nodes:Array.from({length:cols},()=>new Set()),
          disabled:Array.from({length:cols},()=>new Set()),
        };
      }

      const dis = persistentDisabled[col] || new Set();
      if (dis.has(row)) dis.delete(row); else dis.add(row);
      persistentDisabled[col] = dis;
      currentMap.disabled[col] = dis;
      // Recompute column active: any node present and not disabled
      const anyOn = Array.from(currentMap.nodes[col] || []).some(r => !dis.has(r));
      currentMap.active[col] = anyOn;

      // Flash feedback on toggle
      flashes[col] = 1.0;
      useBackBuffers();
      drawGrid();
      drawNodes(currentMap.nodes);
      // We just redrew static layers, so treat them as clean.
      panel.__dgStaticDirty = false;
      __dgNeedsUIRefresh = true;
      FD.flowLog('node-toggle', {
        col,
        row,
        active: currentMap?.active?.[col] ?? null,
        disabledCount: currentMap?.disabled?.[col]?.size ?? null,
      });
      requestFrontSwap(useFrontBuffers);
      emitDrawgridUpdate({ activityOnly: false });
      panel.dispatchEvent(new CustomEvent('drawgrid:node-toggle', { detail: { col, row, disabled: dis.has(row) } }));
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('drawgrid:refresh-all', {
            detail: { sourcePanelId: panel?.id || null }
          }));
        }
      } catch {}

      const cx = gridArea.x + col * cw + cw * 0.5;
      const cy = gridArea.y + topPad + row * ch + ch * 0.5;
      const baseRadius = Math.max(6, Math.min(cw, ch) * 0.5);
      spawnNoteRingEffect(cx, cy, baseRadius);
      try {
        dgField?.pulse?.(0.25);
        const wrapRect = wrap?.getBoundingClientRect?.();
        if (wrapRect && wrapRect.width && wrapRect.height) {
          const localX = (wrapRect.width * 0.5) - (gridArea?.x || 0);
          const localY = (wrapRect.height * 0.5) - (gridArea?.y || 0);
          knockLettersAt(localX, localY, { radius: 80, strength: 10 });
        }
      } catch {}

      pendingNodeTap = null;
      setDrawingState(false);
      return; // handled as a tap, skip stroke handling
    }

    // If we were capturing the pointer but ended up not drawing or toggling anything,
    // we may still be in back-buffer mode from pointerdown. Do a safe no-op swap to
    // avoid a single-frame blank on release.
    if (!drawing) {
      // Background tap: only swap if we truly staged something.
      const needSwap = usingBackBuffers || pendingPaintSwap;
      if (needSwap) {
        if (!usingBackBuffers) ensureBackVisualsFreshFromFront();
        __dgNeedsUIRefresh = true;
        DG.log('onPointerUp: coalesced swap (staged)', { usingBackBuffers, pendingPaintSwap });
        pendingPaintSwap = true;
        requestFrontSwap(useFrontBuffers);
      } else {
        __dgNeedsUIRefresh = false;
        // Nothing staged - don't poke the overlay clears; keeping visuals intact avoids a one-frame blank.
        DG.log('onPointerUp: no-op (no swap needed)');
      }
      return;
    }
    setDrawingState(false);
    if (cur) {
      try {
        const finalPaintPt = pointerToPaintLogical(e);
        const lastPt = cur.pts[cur.pts.length - 1];
        if (!lastPt || Math.hypot((lastPt.x ?? 0) - finalPaintPt.x, (lastPt.y ?? 0) - finalPaintPt.y) > 0.25) {
          cur.pts.push(finalPaintPt);
        }
      } catch {}
    }
    const strokeToProcess = cur;
    cur = null;
    FD.flowLog('pointer:up', {
      strokePts: strokeToProcess?.pts?.length || 0,
      hadPreview: !!previewGid,
    });

    // If we were previewing a special line, mark it but let the commit redraw handle visibility.
    if (strokeToProcess && previewGid) {
      try {
        if (!strokeToProcess.generatorId) {
          strokeToProcess.generatorId = previewGid;
        }
      } catch {}
      try { previewGid = null; } catch {}
    }

    if (!strokeToProcess) {
      // This was a background tap, not a drag that started on a node.
      // Fire activity event but don't modify strokes.
      emitDrawgridUpdate({ activityOnly: true });
      return;
    }

    // If the stroke was just a tap, don't treat it as a drawing.
    if (strokeToProcess.pts.length <= 1) {
      emitDrawgridUpdate({ activityOnly: true });
      return;
    }

    const isZoomed = panel.classList.contains('toy-zoomed');
    let shouldGenerateNodes = true;
    let generatorId = null;

    if (isZoomed) {
        const hasLine1 = strokes.some(s => s.generatorId === 1);
        const hasLine2 = strokes.some(s => s.generatorId === 2);

        if (!hasLine1) {
            // No lines exist, this new one is Line 1.
            shouldGenerateNodes = true;
            isSpecial = true;
            generatorId = 1;
        } else if (nextDrawTarget) {
            // A "Draw Line" button was explicitly clicked.
            shouldGenerateNodes = true;
            isSpecial = true;
            generatorId = nextDrawTarget;
            nextDrawTarget = null; // consume target so subsequent swipes follow natural order
        } else {
            // No target armed: decorative line (no nodes)
            shouldGenerateNodes = false;
        }
        nextDrawTarget = null; // Always reset after a draw completes
        try { (panel.__dgUpdateButtons || updateGeneratorButtons)(); } catch(e){ }
    } else { // Standard view logic (unchanged)
        const hasNodes = currentMap && currentMap.nodes.some(s => s.size > 0);
        // If a special line already exists, this new line is decorative.
        // If the user wants to draw a *new* generator line, they should clear first.
        const hasSpecialLine = strokes.some(s => s.isSpecial || s.generatorId);
        if (hasSpecialLine) {
            shouldGenerateNodes = false;
        } else {
            shouldGenerateNodes = true; // Explicitly set to true
            generatorId = 1; // Standard view's first line is functionally Line 1
            // In standard view, a new generator line should replace any old decorative lines.
            strokes = [];
        }
    }
    
    const isSpecial = !!shouldGenerateNodes;
    strokeToProcess.isSpecial = isSpecial;
    strokeToProcess.justCreated = true;

    if (isSpecial) {
      strokeToProcess.generatorId = generatorId || 1;
    } else {
      delete strokeToProcess.generatorId;
      strokeToProcess.overlayColorize = false;
    }

    if (DG_DEBUG) {
      console.debug('[DG][commit]', {
        mode: panel.classList.contains('toy-zoomed') ? 'zoomed' : 'standard',
        shouldGenerateNodes,
        isSpecial,
        generatorId: strokeToProcess.generatorId ?? null,
      });
    }

    emitDG('commit', {
      mode: panel.classList.contains('toy-zoomed') ? 'zoomed' : 'standard',
      shouldGenerateNodes,
      isSpecial,
      generatorId: strokeToProcess.generatorId ?? null,
      pts: strokeToProcess.pts?.length || 0
    });

    strokes.push(strokeToProcess);
    markUserChange('stroke-commit');

    // Redraw back for consistency, and regenerate nodes
    clearAndRedrawFromStrokes(null, 'stroke-commit');
    pendingPaintSwap = usingBackBuffers;

    // Commit: redraw ink to the visible paint surface (front).
    // In single-canvas mode, the composite pass already handles this.
    if (!DG_SINGLE_CANVAS) {
      pctx = getActivePaintCtx();
      resetPaintBlend(pctx);
      if (pctx) {
        R.withLogicalSpace(pctx, () => {
          // Clear the front paint canvas before redrawing all strokes so
          // we don't leave the full-opacity live stroke underneath.
          const surface = pctx.canvas;
          const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
          const width = cssW || (surface?.width ?? 0) / scale;
          const height = cssH || (surface?.height ?? 0) / scale;
          pctx.clearRect(0, 0, width, height);

          // Now redraw all strokes with the correct alpha (visual-only lines
          // use VISUAL_ONLY_ALPHA via getPathAlpha in drawFullStroke).
          for (const s of strokes) drawFullStroke(pctx, s);
        });
      }
    }
    // Keep back buffer fresh if we use it
    if (usingBackBuffers && typeof ensureBackVisualsFreshFromFront === 'function') {
      try { ensureBackVisualsFreshFromFront(); } catch {}
    }
    __dgMarkSingleCanvasDirty(panel);
    if (DG_SINGLE_CANVAS && isPanelVisible) {
      try {
        markStaticDirty('external-state-change');
        compositeSingleCanvas();
      } catch {}
      panel.__dgSingleCompositeDirty = false;
    }
    // No swap needed
    __dgNeedsUIRefresh = true;
    // After drawing, unmark all strokes so they become part of the normal background for the next operation.
    strokes.forEach(s => delete s.justCreated);
    schedulePersistState({ source: 'stroke-commit' });
    try { window.Persistence?.flushAutosaveNow?.(); } catch {}

    // First successful line -> fade out the DRAW label.
    try {
      if (!drawLabelState.hasDrawnFirstLine && strokeToProcess?.pts?.length > 1) {
        fadeOutDrawLabel({ immediate: false });
      }
    } catch {}

    try {
      syncLetterFade();
    } catch (e) { /* ignore */ }
    try { previewGid = null; } catch {}
    nextDrawTarget = null;
    try {
      const updateButtons = panel.__dgUpdateButtons || updateGeneratorButtons;
      if (typeof updateButtons === 'function') updateButtons();
    } catch {}
  }

  // A version of snapToGrid that analyzes a single stroke object instead of the whole canvas
  function snapToGridFromStroke(stroke) {
    // Check for cached nodes, but only if the column count matches.
    if (stroke.cachedNodes && stroke.cachedCols === cols) {
      return stroke.cachedNodes;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = paint.width;
    tempCanvas.height = paint.height;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    if (!tempCtx) return {
        active: Array(cols).fill(false),
        nodes: Array.from({length:cols}, ()=> new Set()),
        disabled: Array.from({length:cols}, ()=> new Set())
    };

    tempCtx.save();
    tempCtx.globalCompositeOperation = 'source-over';
    tempCtx.globalAlpha = 1;
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.restore();

    drawFullStroke(tempCtx, stroke);
    // Pass the temporary context to the main snapToGrid function
    const result = snapToGrid(tempCtx);
    // Cache the result against the current column count.
    try { stroke.cachedNodes = result; stroke.cachedCols = cols; } catch {}
    return result;
  }

  paint.addEventListener('pointerdown', onPointerDown);
  paint.addEventListener('pointermove', onPointerMove);
  paint.addEventListener('pointerleave', () => {
    paint.style.cursor = 'default';
  });
  window.addEventListener('pointerup', onPointerUp);
  // Coalesce relayouts on wheel/resize to keep pointer math in sync with zoom changes
  let relayoutScheduled = false;
  function scheduleRelayout(force = true){
    if (relayoutScheduled) return; relayoutScheduled = true;
    requestAnimationFrame(() => { relayoutScheduled = false; layout(force); });
  }
  observer.observe(body);

  panel.addEventListener('drawgrid:playcol', (e) => {
    const col = e?.detail?.col;
    playheadCol = col;
    if (col >= 0 && col < cols) {
        if (currentMap?.active[col]) {
            let pulseTriggered = false;
            flashes[col] = 1.0;
            // Add flashes for the grid cells that are playing
            const nodesToFlash = currentMap.nodes[col];
            if (nodesToFlash && nodesToFlash.size > 0) {
                for (const row of nodesToFlash) {
                    const isDisabled = currentMap.disabled?.[col]?.has(row);
                    if (!isDisabled) {
                        if (!pulseTriggered) {
                            requestPanelPulse(panel, { rearm: true });
                            pulseTriggered = true;
                        }
                          cellFlashes.push({ col, row, age: 1.0 });
                          try {
                              const x = gridArea.x + col * cw + cw * 0.5;
                              const y = gridArea.y + topPad + row * ch + ch * 0.5;

                              // Radius roughly the size of a grid square
                              const nodeRadiusToy = Math.max(10, Math.min(cw, ch) * 0.55);

                              // New local pink burst (no knockback, just visuals)
                              spawnNoteBurst(x, y, nodeRadiusToy);

                              // Existing ring effect
                              const ringRadius = Math.max(6, Math.min(cw, ch) * 0.5);
                              spawnNoteRingEffect(x, y, ringRadius);

                              // Keep the subtle global "breathe" pulse if you like
                              dgField?.pulse?.(0.8);
                          } catch (e) {}
                    }
                }
            }
        }
    }
  });

  let rafId = 0;

  // Hard offscreen culling:
  // Stop the per-panel rAF loop entirely when the panel is offscreen and nothing is pending.
  // Resume when the panel becomes visible again (IntersectionObserver) or when work is requested.
  function ensureRenderLoopRunning() {
    if (rafId) return;
    rafId = requestAnimationFrame(renderLoop);
  }

  // Static layer caching:
  // "Static" = grid + nodes (and anything that doesn't animate every frame).
  // We redraw static layers only when marked dirty, never because of gestures.
  panel.__dgStaticDirty = true;
  function markStaticDirty(reason) {
    panel.__dgStaticDirty = true;
    // Composite base depends on static layers.
    try { panel.__dgCompositeBaseDirty = true; } catch {}
    try { panel.__dgSingleCompositeDirty = true; } catch {}
    // If you later add any other "base" caches, mark them here too.
    try { panel.__dgLastStaticDirtyReason = reason || 'unknown'; } catch {}
    ensureRenderLoopRunning();
  }

  // Debug FPS (per-panel)
  // Only used when DG_DEBUG && window.DEBUG_DRAWGRID === 1.
  let __dgFpsLastTs = 0;
  let __dgFpsFrameCount = 0;
  let __dgFpsValue = 0;

  // Per-panel lightweight profiling for renderLoop + drawGrid.
  // This is separate from the global DG_PROFILE sampling at the top,
  // and logs once per panel per ~1 second when DG_PROFILE is true.
  let __dgFrameProfileFrames = 0;
  let __dgFrameProfileSumMs = 0;
  let __dgFrameProfileMinMs = Infinity;
  let __dgFrameProfileMaxMs = 0;
  let __dgFrameProfileLastLogTs = 0;

  let __dgParticleStateCache = { key: '', ts: 0, value: null, hadField: false };
  function updatePanelParticleState(boardScaleValue, panelVisible) {
    const nowTs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    const recentPoke = Number.isFinite(__dgParticlePokeTs) && (nowTs - __dgParticlePokeTs) <= DG_PARTICLE_POKE_GRACE_MS;
    if (!panelVisible && !recentPoke) {
      particleFieldEnabled = false;
      return __dgParticleStateCache?.value || null;
    }
    const overviewState = (typeof window !== 'undefined' && window.__overviewMode) ? window.__overviewMode : { isActive: () => false, state: { zoomThreshold: 0.36 } };
    const inOverview = !!overviewState?.isActive?.();
    const visiblePanels = Math.max(0, Number(globalDrawgridState?.visibleCount) || 0);
    const hasField = !!dgField;
    const cacheKey = `${visiblePanels}|${inOverview ? 1 : 0}|${hasField ? 1 : 0}`;
    if (
      __dgParticleStateCache &&
      __dgParticleStateCache.key === cacheKey &&
      __dgParticleStateCache.hadField === hasField &&
      (nowTs - __dgParticleStateCache.ts) < 350
    ) {
      return __dgParticleStateCache.value;
    }
    let adaptive = getGlobalAdaptiveState();
    if (!adaptive) adaptive = updateAdaptiveShared(true);
    const particleBudget = adaptive?.particleBudget;
    const threshold = Number.isFinite(overviewState?.state?.zoomThreshold) ? overviewState.state.zoomThreshold : 0.36;
    const zoomTooWide = Number.isFinite(boardScaleValue) && boardScaleValue < threshold;
      const allowField = !inOverview && !zoomTooWide;
      const fpsSample = Number.isFinite(adaptive?.smoothedFps)
        ? adaptive.smoothedFps
        : (Number.isFinite(adaptive?.fps) ? adaptive.fps : null);
      const emergencyMode = !!adaptive?.emergencyMode;
      // Keep fields on, but thin them out when many panels are visible.
      // Do not vary by focus state so particles feel consistent across panels.
      particleFieldEnabled = !!allowField;
    panel.__dgParticleStateFlags = { inOverview, zoomTooWide };

    if (dgField && typeof dgField.applyBudget === 'function' && particleBudget) {
      const round = (v) => Math.round((Number.isFinite(v) ? v : 0) * 10000) / 10000;
      const maxCountScaleBase = (particleBudget.maxCountScale ?? 1) * (particleBudget.capScale ?? 1);
      const zoomGesturing = (typeof window !== 'undefined' && window.__mtZoomGesturing === true);
      const zoomGestureMoving = !!(zoomGesturing && __lastZoomMotionTs && (nowTs - __lastZoomMotionTs) < ZOOM_STALL_MS);
      const fpsDamp = (() => {
        if (!Number.isFinite(fpsSample)) return 1;
        if (fpsSample >= 55) return 1;
        if (fpsSample <= 35) return 0.45;
        return 0.45 + ((fpsSample - 35) / 20) * 0.55;
      })();
      const gestureDamp = zoomGestureMoving
        ? (visiblePanels >= 12 ? 0.5 : (visiblePanels >= 6 ? 0.62 : 0.72))
        : 1;
      // Crowd-based attenuation: more visible panels -> fewer particles per panel.
      const crowdScale = (() => {
        const base = 1 / Math.max(1, visiblePanels);
        if (visiblePanels <= 6) return Math.max(0.14, base);
        const minScale =
          visiblePanels >= 36 ? 0.03 :
          visiblePanels >= 24 ? 0.04 :
          visiblePanels >= 16 ? 0.055 :
          0.075;
        return Math.max(minScale, base);
      })();
      // If we're cruising near 60fps with few panels, allow a modest boost above nominal.
      const fpsBoost = (Number.isFinite(fpsSample) && fpsSample >= 58 && visiblePanels <= 2)
        ? Math.min(1.3, 1 + 0.02 * (fpsSample - 58))
        : 1;

      const emergencyScale = emergencyMode ? 0.45 : 1;
      const emergencySize = emergencyMode ? 1.1 : 1;
      const perfDamp = Math.min(fpsDamp, gestureDamp);
      panel.__dgParticleKnockbackMul = Math.min(8, 1 / Math.max(0.2, perfDamp));
      if (dgField?._config) {
        if (!Number.isFinite(panel.__dgFieldBaseReturnSeconds)) {
          panel.__dgFieldBaseReturnSeconds = Number(dgField._config.returnSeconds) || 2.4;
        }
        if (!Number.isFinite(panel.__dgFieldBaseForceMul)) {
          panel.__dgFieldBaseForceMul = Number(dgField._config.forceMul) || 2.5;
        }
        const baseReturn = panel.__dgFieldBaseReturnSeconds;
        const returnMul = Math.min(3, panel.__dgParticleKnockbackMul || 1);
        dgField._config.returnSeconds = Math.max(0.35, baseReturn / returnMul);
        const baseForce = panel.__dgFieldBaseForceMul;
        dgField._config.forceMul = Math.min(10, baseForce * (panel.__dgParticleKnockbackMul || 1));
      }
      // "Perf panic" = we're overloaded but not necessarily at catastrophic FPS.
      // We respond by shedding particle count quickly (not throttling cadence).
      const __dgCurFpsSample =
        Number.isFinite(fpsSample) ? fpsSample :
        ((typeof window !== 'undefined' && Number.isFinite(window.__MT_SM_FPS)) ? window.__MT_SM_FPS :
        ((typeof window !== 'undefined' && Number.isFinite(window.__MT_FPS)) ? window.__MT_FPS : 60));
      const perfPanic =
        (visiblePanels >= 12 && __dgCurFpsSample < 45) ||
        (visiblePanels >= 18 && __dgCurFpsSample < 50) ||
        (__dgCurFpsSample < 35);

      const panicScale = perfPanic ? 0.22 : 1;
      const maxCountScale = Math.max(0.0, maxCountScaleBase * crowdScale * fpsBoost * emergencyScale * perfDamp * panicScale);
      const capScale = Math.max(0.0, (particleBudget.capScale ?? 1) * crowdScale * fpsBoost * emergencyScale * perfDamp * panicScale);
      const sizeScale = (particleBudget.sizeScale ?? 1) * emergencySize * (perfDamp < 0.8 ? 1.05 : 1);
      const spawnScale = Math.max(0.0, (particleBudget.spawnScale ?? 1) * crowdScale * fpsBoost * emergencyScale * perfDamp * (perfPanic ? 0.0 : 1));

      // Persist resolved scalars for the tick gate (avoids expensive tick when effectively off).
      panel.__dgParticleBudgetMaxCountScale = maxCountScale;
      panel.__dgParticleBudgetCapScale = capScale;
      panel.__dgParticleBudgetSpawnScale = spawnScale;
      // Keep tick cadence steady for smooth lerps; rely on lower counts for performance.
      const tickModulo = 1;
      // If budgets drop to ~0, fully disable particle SIM for this panel (draw stays smooth).
      // We allow counts to ramp down to zero, then stop ticking the field to avoid per-frame cost.
      //
      // IMPORTANT: In worst-case scenes, the adaptive scalars may not naturally reach ~0,
      // so add a "hard emergency" off-ramp that triggers only when we are clearly overwhelmed
      // (very low FPS + many visible drawgrids). This preserves smoothness (no cadence stepping)
      // while eliminating the expensive dgField.tick() work.
      const __dgCurFps =
        (typeof window !== 'undefined' && Number.isFinite(window.__MT_SM_FPS)) ? window.__MT_SM_FPS :
        ((typeof window !== 'undefined' && Number.isFinite(window.__MT_FPS)) ? window.__MT_FPS : 60);
      const __dgVisible = Number.isFinite(globalDrawgridState?.visibleCount) ? globalDrawgridState.visibleCount : 0;
      // "Hard emergency" off-ramp: only used when we are clearly overwhelmed.
      // This should trigger in the perf-lab worst-case scenes so we can fully skip dgField.tick().
      const __dgHardEmergencyOff =
        (__dgCurFps < 14) || // catastrophic FPS, regardless of count
        (__dgVisible >= 12 && __dgCurFps < 22) ||
        (__dgVisible >= 20 && __dgCurFps < 28);

      const particlesOffWanted =
        __dgHardEmergencyOff ||
        (maxCountScale < 0.02 && capScale < 0.02 && spawnScale < 0.02) ||
        !particleFieldEnabled;

      if (particlesOffWanted && !panel.__dgParticlesOff) {
        panel.__dgParticlesOff = true;
        // Ensure the tick gate sees "effectively off" immediately, even before the next adaptive pass.
        panel.__dgParticleBudgetMaxCountScale = 0;
        panel.__dgParticleBudgetCapScale = 0;
        panel.__dgParticleBudgetSpawnScale = 0;
        // Force a final budget apply so any existing particles can fade out quickly.
        panel.__dgParticleBudgetKey = '';
        dgField.applyBudget({
          maxCountScale: 0,
          capScale: 0,
          sizeScale,
          spawnScale: 0,
          tickModulo,
          minCount: 0,
          emergencyFade: true,
          emergencyFadeSeconds: 1.0,
        });
      } else if (!particlesOffWanted && panel.__dgParticlesOff) {
        // Re-enable; normal budget application below will regen naturally.
        panel.__dgParticlesOff = false;
        // Clear persisted scalars; they will be repopulated by the normal adaptive budget path.
        panel.__dgParticleBudgetMaxCountScale = null;
        panel.__dgParticleBudgetCapScale = null;
        panel.__dgParticleBudgetSpawnScale = null;
        panel.__dgParticleBudgetKey = '';
      }
      const budgetKey = [
        round(maxCountScale),
        round(capScale),
        round(sizeScale),
        round(spawnScale),
        tickModulo,
        __dgLowFpsMode ? 1 : 0,
        emergencyMode ? 1 : 0,
        particleFieldEnabled ? 1 : 0,
      ].join('|');
      if (!panel.__dgParticlesOff && panel.__dgParticleBudgetKey !== budgetKey) {
        panel.__dgParticleBudgetKey = budgetKey;
        dgField.applyBudget({
          maxCountScale,
          capScale,
          tickModulo,
          sizeScale,
          spawnScale,
          // When overloaded, shed particle count quickly (still ticking every frame).
          emergencyFade: !!perfPanic,
          emergencyFadeSeconds: perfPanic ? 1.1 : 2.2,
          // Make sure the field can recover its normal minimum when not panicking.
          minCount: perfPanic ? 0 : 50,
        });
      }
    }

    __dgParticleStateCache = { key: cacheKey, ts: nowTs, value: adaptive, hadField: hasField };
    return adaptive;
  }

  // Warn (debug only) if we end up throttling particles for too long during a zoom gesture.
  let __dgParticleZoomThrottleSince = 0;
  let __dgParticleZoomThrottleWarned = false;
  let __dgParticlePokeTs = 0;
  let __dgPlayheadSimpleMode = false;
  let __dgPlayheadModeWanted = null;
  let __dgPlayheadModeWantedSince = 0;
  let __dgLowFpsMode = false;
  const DG_PARTICLE_ZOOM_THROTTLE_WARN_MS = 250;
  const DG_PARTICLE_POKE_GRACE_MS = 220;
  const DG_PLAYHEAD_MODE_MIN_MS = 650;

  function getChainHasNotesCached(panel, hasActiveNotes) {
    if (!panel) return hasActiveNotes;
    const prevId = panel.dataset?.prevToyId || null;
    const nextId = panel.dataset?.nextToyId || null;
    if (!prevId && !nextId) return hasActiveNotes;
    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    const cache = panel.__dgChainCache;
    if (
      cache &&
      cache.prevId === prevId &&
      cache.nextId === nextId &&
      (now - cache.ts) < 250
    ) {
      return cache.hasNotes;
    }
    const head = findChainHead(panel);
    const hasNotes = head ? chainHasSequencedNotes(head) : hasActiveNotes;
    panel.__dgChainCache = {
      ts: now,
      prevId,
      nextId,
      headId: head?.id || null,
      hasNotes,
    };
    return hasNotes;
  }

  function renderLoop() {
    // Clear scheduled id at start so we can safely re-schedule via ensureRenderLoopRunning().
    rafId = 0;
    const endPerf = startSection('drawgrid:render');
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
    const __rafStart = __perfOn ? performance.now() : 0;
    const __frameStart = (__perfOn && typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : 0;
    try {
      if (!panel.__dgFrame) panel.__dgFrame = 0;
      panel.__dgFrame++;
      beginFrameLayoutCache(panel.__dgFrame);
      if (!panel.__dgGridAlphaSeen) {
        panel.__dgGridAlphaSeen = true;
        try {
          if (typeof window !== 'undefined' && window.__DG_GRID_ALPHA_DEBUG) {
            console.warn('[DG][grid-alpha] renderLoop active', { panelId: panel?.id || null });
          }
        } catch {}
      }
      const __dgFrameProfileStart = (DG_FRAME_PROFILE && typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : null;
      const nowTs = performance?.now?.() ?? Date.now();
      updateFlatLayerVisibility();

    // --- FPS accumulation (per panel, debug only) ---
    if (DG_DEBUG && window.DEBUG_DRAWGRID === 1) {
      if (!__dgFpsLastTs) {
        __dgFpsLastTs = nowTs;
        __dgFpsFrameCount = 0;
      }
      __dgFpsFrameCount++;
      const elapsed = nowTs - __dgFpsLastTs;
      if (elapsed >= 500) { // update every ~0.5s
        __dgFpsValue = (__dgFpsFrameCount * 1000) / elapsed;
        __dgFpsFrameCount = 0;
        __dgFpsLastTs = nowTs;
      }
    }
    // ------------------------------------------------

    const __prepStart = __perfOn ? performance.now() : 0;
    let inCommitWindow = HY.inCommitWindow(nowTs);
        const forcePostRelease = (__dgForceFullDrawNext || (__dgForceFullDrawFrames > 0) || __dgForceOverlayClearNext || __dgForceSwapNext);
        if (forcePostRelease) inCommitWindow = false;
        if (inCommitWindow) {
          __dgStableFramesAfterCommit = 0; // still settling - do nothing destructive
        } else if (__dgStableFramesAfterCommit < 2) {
          __dgStableFramesAfterCommit++; // count a couple of stable frames
        }

        const waitingForStable = inCommitWindow;

      const __visibilityStart = __perfOn ? performance.now() : 0;
      const shouldSkipOffscreen = !isPanelVisible &&
        !__dgFrontSwapNextDraw &&
        !__dgNeedsUIRefresh &&
        !__hydrationJustApplied;
      if (__perfOn && __visibilityStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.prep.visibility', performance.now() - __visibilityStart); } catch {}
      }
      if (shouldSkipOffscreen) {
        // Hard cull: do not schedule another frame while fully offscreen with no pending work.
        // IntersectionObserver (or explicit work requests) will restart the loop.
        rafId = 0;
        return;
      }

      const __cameraStart = __perfOn ? performance.now() : 0;
      const frameCam = overlayCamState || (typeof getFrameStartState === 'function' ? getFrameStartState() : null);
      const boardScaleValue = Number.isFinite(frameCam?.scale) ? frameCam.scale : __dgZoomScale();
      if (Number.isFinite(boardScaleValue)) {
        if (!Number.isFinite(boardScale) || Math.abs(boardScale - boardScaleValue) > 1e-4) {
          boardScale = boardScaleValue;
        }
      }
      if (__perfOn && __cameraStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.prep.camera', performance.now() - __cameraStart); } catch {}
      }

      const zoomDebugFreeze = !!(typeof window !== 'undefined' && window.__zoomDebugFreeze);

      // Update per-panel LOD state from global FPS + zoom.
      const __adaptiveStart = __perfOn ? performance.now() : 0;
      const overviewState = (typeof window !== 'undefined' && window.__overviewMode) ? window.__overviewMode : { isActive: () => false, state: { zoomThreshold: 0.36 } };
      const inOverview = !!overviewState?.isActive?.();
      const threshold = Number.isFinite(overviewState?.state?.zoomThreshold) ? overviewState.state.zoomThreshold : 0.36;
      const zoomTooWide = Number.isFinite(boardScaleValue) && boardScaleValue < threshold;
      const flags = panel.__dgParticleStateFlags || {};
      const flagsChanged = (flags.inOverview !== inOverview) || (flags.zoomTooWide !== zoomTooWide);
      const sharedTs = globalDrawgridState?.__adaptiveShared?.ts || 0;
      let adaptiveState = null;
      if (!flagsChanged && panel.__dgLastAdaptiveSharedTs === sharedTs) {
        adaptiveState = panel.__dgParticleStateCache?.value || getGlobalAdaptiveState();
      } else {
        panel.__dgLastAdaptiveSharedTs = sharedTs;
        adaptiveState = updatePanelParticleState(boardScaleValue, isPanelVisible);
      }
      __dgLowFpsMode = !!adaptiveState?.emergencyMode;
      const fpsSample = Number.isFinite(adaptiveState?.smoothedFps)
        ? adaptiveState.smoothedFps
        : (Number.isFinite(adaptiveState?.fps) ? adaptiveState.fps : null);
        const fpsLiveRaw = Number.isFinite(fpsSample)
          ? fpsSample
          : (Number.isFinite(__dgFpsValue) ? __dgFpsValue : null);
      const fpsLive = (Number.isFinite(fpsLiveRaw) && fpsLiveRaw >= 5) ? fpsLiveRaw : null;
      // Update global pressure DPR multiplier (generic: keys off low FPS, not gestures).
      if (Number.isFinite(fpsLive)) {
        __dgUpdatePressureDprMulFromFps(fpsLive, nowTs);
      }
      if (Number.isFinite(fpsLive)) {
        let desiredSimple = null;
        if (fpsLive <= DG_PLAYHEAD_FPS_SIMPLE_ENTER) {
          desiredSimple = true;
        } else if (fpsLive >= DG_PLAYHEAD_FPS_SIMPLE_EXIT) {
          desiredSimple = false;
        }
        if (desiredSimple !== null && desiredSimple !== __dgPlayheadSimpleMode) {
          if (__dgPlayheadModeWanted !== desiredSimple) {
            __dgPlayheadModeWanted = desiredSimple;
            __dgPlayheadModeWantedSince = nowTs;
          }
        } else if (desiredSimple === null) {
          __dgPlayheadModeWanted = null;
          __dgPlayheadModeWantedSince = 0;
        }
      }
      if (__perfOn && __adaptiveStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.prep.adaptive', performance.now() - __adaptiveStart); } catch {}
      }

      // We never draw overlays or particles if the panel is completely offscreen.
      const canDrawAnything = !waitingForStable && isPanelVisible;
      try {
        if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW && !panel.__dgFlowBootLogged) {
          panel.__dgFlowBootLogged = true;
          console.log('[DG][flow] boot', {
            panelId: panel?.id || null,
            visible: isPanelVisible,
            usingBackBuffers,
            singleCanvas: DG_SINGLE_CANVAS,
          });
        }
      } catch {}
      const renderEvery = Math.max(1, adaptiveState?.renderBudget?.skipNonCriticalEvery || 1);
      const skipNonCritical = false;

      // Extra throttling for "idle" panels when lots of toys are visible.
      const visiblePanels = Math.max(0, Number(globalDrawgridState?.visibleCount) || 0);
      const gesturing = __dgIsGesturing();
      const gestureMoving = !!(gesturing && __lastZoomMotionTs && (nowTs - __lastZoomMotionTs) < ZOOM_STALL_MS);
      const isFocused = panel.classList?.contains('toy-focused') || panel.classList?.contains('focused');
      const isZoomed = panel.classList?.contains('toy-zoomed');
      const hasAnyNotes = !!(currentMap && currentMap.active && currentMap.active.some(Boolean));
      const disableOverlayCore = !!(typeof window !== 'undefined' && window.__PERF_DG_OVERLAY_CORE_OFF);
      const zoomForOverlay = Number.isFinite(boardScale) ? boardScale : 1;
      const overlayFlashesEnabled = !disableOverlayCore;
      const overlayBurstsEnabled = !disableOverlayCore && zoomForOverlay > 0.45 && !__dgLowFpsMode;
      const hasOverlayFx =
        (overlayFlashesEnabled && ((noteToggleEffects?.length || 0) > 0 || (cellFlashes?.length || 0) > 0)) ||
        (overlayBurstsEnabled && (noteBurstEffects?.length || 0) > 0);
      const hasNodeFlash = (() => {
        for (let i = 0; i < flashes.length; i++) {
          if (flashes[i] > 0) return true;
        }
        return false;
      })();
      const transportRunning = (typeof isRunning === 'function') && isRunning();
      const hasChainLink = panel.dataset.nextToyId || panel.dataset.prevToyId;
      const isChained = !!hasChainLink;
      const isActiveInChain = isChained ? (panel.dataset.chainActive === 'true') : true;
      const hasActiveNotes = currentMap && currentMap.active && currentMap.active.some(a => a);
      const chainHasNotes = isChained ? getChainHasNotesCached(panel, hasActiveNotes) : hasActiveNotes;

      const isTrulyIdle =
        !hasAnyNotes &&
        !hasOverlayFx &&
        !hasNodeFlash &&
        !transportRunning &&
        !__dgFrontSwapNextDraw &&
        !__dgNeedsUIRefresh &&
        !__hydrationJustApplied;

      const adaptiveCap = __dgComputeAdaptivePaintDpr({
        boardScale: Number.isFinite(boardScale) ? boardScale : 1,
        visiblePanels,
        isFocused,
        isZoomed,
      });
      const deviceDpr = Math.max(1, Number.isFinite(window?.devicePixelRatio) ? window.devicePixelRatio : 1);
      const visualMul = __dgComputeVisualBackingMul(Number.isFinite(boardScale) ? boardScale : 1);
      const pressureMul = (Number.isFinite(__dgPressureDprMul) && __dgPressureDprMul > 0) ? __dgPressureDprMul : 1;
      const desiredDprRaw = (adaptiveCap ? Math.min(deviceDpr, adaptiveCap) : deviceDpr) * visualMul * pressureMul;
      const desiredDpr = __dgCapDprForBackingStore(cssW, cssH, desiredDprRaw, __dgAdaptivePaintDpr);
      const nowAdaptiveTs = nowTs || (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
      const canAdjustDpr =
        !gesturing &&
        !HY.inCommitWindow(nowAdaptiveTs) &&
        __dgStableFramesAfterCommit >= 2 &&
        cssW > 0 &&
        cssH > 0;
      if (
        canAdjustDpr &&
        Number.isFinite(desiredDpr) &&
        Math.abs(desiredDpr - paintDpr) >= 0.15 &&
        (nowAdaptiveTs - __dgAdaptivePaintLastTs) > 240
      ) {
        __dgAdaptivePaintLastTs = nowAdaptiveTs;
        __dgAdaptivePaintDpr = desiredDpr;
        try { resizeSurfacesFor(cssW, cssH, desiredDpr); } catch {}
      }

      let effectiveRenderEvery = renderEvery;
      if (isTrulyIdle && canDrawAnything && visiblePanels >= 4) {
        // For many visible idle panels, only do a "heavy" frame every few RAF ticks.
        // (We still tick RAF every frame, but most frames early-out before heavy work.)
        effectiveRenderEvery = Math.max(effectiveRenderEvery, 3);
      }

      const disableOverlays = !!(typeof window !== 'undefined' && window.__PERF_DG_DISABLE_OVERLAYS);
      // Auto overlay suppression (unfocused only) during heavy gesture situations.
      // We *don't* clear overlays when suppressed, so the toy stays visually stable.
      const __autoOverlayOff = (typeof window !== 'undefined')
        ? (window.__DG_AUTO_DISABLE_OVERLAYS_DURING_GESTURE ?? true)
        : true;
      const __autoOverlayThreshold = (typeof window !== 'undefined' && Number.isFinite(window.__DG_AUTO_DISABLE_OVERLAYS_THRESHOLD))
        ? window.__DG_AUTO_DISABLE_OVERLAYS_THRESHOLD
        : 12;
      const disableOverlaysEffective =
        disableOverlays ||
        (__autoOverlayOff && gestureMoving && !isFocused && visiblePanels >= __autoOverlayThreshold);

      // Overlays (notes, playhead, flashes) respect visibility & hydrations guard,
      // but are otherwise always on - they're core UX.
      const __overlayGateStart = __perfOn ? performance.now() : 0;
      const allowOverlayDraw = canDrawAnything && !disableOverlaysEffective;
      const disableOverlayStrokes = !!(typeof window !== 'undefined' && window.__PERF_DG_OVERLAY_STROKES_OFF);
      let hasOverlayStrokes = false;
      if (allowOverlayDraw && !disableOverlayStrokes) {
        hasOverlayStrokes = hasOverlayStrokesCached();
      }
      // Safety: if cache says no overlay but we have special strokes, don't clear overlays.
      let hasOverlayStrokesLive = hasOverlayStrokes;
      if (!hasOverlayStrokesLive && Array.isArray(strokes) && strokes.length) {
        for (let i = 0; i < strokes.length; i++) {
          const s = strokes[i];
          if (s && (s.isSpecial || s.overlayColorize)) { hasOverlayStrokesLive = true; break; }
        }
      }
      const overlayTransport = disableOverlayCore
        ? false
        : (transportRunning && (isChained ? (isActiveInChain && chainHasNotes) : hasActiveNotes));
      let overlayActive = allowOverlayDraw && (hasOverlayFx || overlayTransport || hasOverlayStrokesLive || (cur && previewGid));
      let overlayEvery = 1;
      if (gestureMoving && visiblePanels >= 6 && !isFocused) {
        overlayEvery = (visiblePanels >= 18) ? 4 : (visiblePanels >= 12) ? 3 : 2;
      }
      if (overlayEvery > 1) {
        panel.__dgOverlayFrame = (panel.__dgOverlayFrame || 0) + 1;
      }
      const skipOverlayHeavy = overlayEvery > 1 && ((panel.__dgOverlayFrame % overlayEvery) !== 0);
      let allowOverlayDrawHeavy = allowOverlayDraw && (!skipOverlayHeavy || __dgNeedsUIRefresh);
      let overlayCoreWanted = (hasOverlayFx || hasOverlayStrokesLive || (cur && previewGid));
      let overlayCoreActive = allowOverlayDrawHeavy && overlayCoreWanted;
      let overlayCompositeNeeded = false;
      let overlayClearedThisFrame = false;
      let __dbgOverlaySpecialCount = null;
      let __dbgOverlayColorizedCount = null;
      let __dbgOverlayHasPreview = null;
      if (__perfOn && __overlayGateStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.prep.overlayGate', performance.now() - __overlayGateStart); } catch {}
      }
      if (__perfOn && __prepStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.render.prep', performance.now() - __prepStart); } catch {}
      }

      if (allowOverlayDraw) {
        const lastTransportRunning = !!panel.__dgLastTransportRunning;
        if ((allowOverlayDrawHeavy || (lastTransportRunning && !transportRunning)) && !transportRunning && !overlayActive) {
          const __overlayClearStart = __perfOn ? performance.now() : 0;
          try {
          const flashSurface = getActiveFlashCanvas();
          R.resetCtx(fctx);
          R.withLogicalSpace(fctx, () => {
              const { x, y, w, h } = R.getOverlayClearRect({
                canvas: flashSurface,
                pad: R.getOverlayClearPad(),
                allowFull: !!panel.__dgFlashOverlayOutOfGrid,
                gridArea,
              });
              fctx.clearRect(x, y, w, h);
            });
            markFlashLayerCleared();
            overlayCompositeNeeded = true;
          } catch {}
          if (__perfOn && __overlayClearStart) {
            try { window.__PerfFrameProf?.mark?.('drawgrid.prep.overlayClear', performance.now() - __overlayClearStart); } catch {}
          }
        }
        panel.__dgLastTransportRunning = transportRunning;
      }

      // Particle field visibility is driven by global allow/overview/zoom state.
      // Do NOT toggle visibility just because we're in a brief commit window; that caused resets on pan/zoom release.
      const __particlePrepStart = __perfOn ? performance.now() : 0;
      const disableParticles = !!(typeof window !== 'undefined' && window.__PERF_DG_DISABLE_PARTICLES);
      const particleStateAllowed =
        DRAWGRID_ENABLE_PARTICLE_FIELD &&
        !zoomDebugFreeze &&
        particleFieldEnabled;

      const zoomGesturing = (typeof window !== 'undefined' && window.__mtZoomGesturing === true);
      const zoomGestureMoving = !!(zoomGesturing && __lastZoomMotionTs && (nowTs - __lastZoomMotionTs) < ZOOM_STALL_MS);
      // Only throttle particles during zoom if the scene is busy.
      // With 1-2 toys, keep particles running for responsiveness.
      const shouldThrottleForZoom = zoomGestureMoving && (visiblePanels >= 4);
      if (shouldThrottleForZoom) {
        if (!__dgParticleZoomThrottleSince) __dgParticleZoomThrottleSince = nowTs;
        if (!__dgParticleZoomThrottleWarned && (nowTs - __dgParticleZoomThrottleSince) > DG_PARTICLE_ZOOM_THROTTLE_WARN_MS) {
          __dgParticleZoomThrottleWarned = true;
          dglog('particle-field:throttle zoom gesture (still active)', { visiblePanels });
        }
      } else {
        __dgParticleZoomThrottleSince = 0;
        __dgParticleZoomThrottleWarned = false;
      }

      const recentPoke = Number.isFinite(__dgParticlePokeTs) && (nowTs - __dgParticlePokeTs) <= DG_PARTICLE_POKE_GRACE_MS;
      const emergencyMode = !!adaptiveState?.emergencyMode;
      const allowParticleDraw =
        !disableParticles &&
        particleStateAllowed &&
        isPanelVisible &&
        (!shouldThrottleForZoom || recentPoke || emergencyMode);
      const skipDomUpdates =
        !!(typeof window !== 'undefined' && window.__PERF_NO_DOM_UPDATES) &&
        (typeof window !== 'undefined' && window.__mtZoomGesturing === true);
      const nextParticleVisible = !!particleStateAllowed && !disableParticles;
      if (!skipDomUpdates && particleCanvas && particleCanvasVisible !== nextParticleVisible) {
        const __particleToggleStart = __perfOn ? performance.now() : 0;
        particleCanvasVisible = nextParticleVisible;
        particleCanvas.style.opacity = nextParticleVisible ? '1' : '0';
        if (!nextParticleVisible) {
          const ctx = particleCanvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, particleCanvas.width || 0, particleCanvas.height || 0);
        } else {
          try { dgField?.resetHome?.(); } catch {}
        }
        if (__perfOn && __particleToggleStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.prep.particleToggle', performance.now() - __particleToggleStart); } catch {}
        }
      }
      if (__perfOn && __particlePrepStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.render.particles', performance.now() - __particlePrepStart); } catch {}
      }

      if (dgField) {
        if (!disableParticles && gridArea && gridArea.w > 0 && gridArea.h > 0 && cssW > 0 && cssH > 0) {
          const pad = 6;
          const x = Math.max(0, gridArea.x - pad);
          const y = Math.max(0, gridArea.y - pad);
          const w = Math.max(0, Math.min(cssW - x, gridArea.w + pad * 2));
          const h = Math.max(0, Math.min(cssH - y, gridArea.h + pad * 2));
          const key = `${Math.round(x)}|${Math.round(y)}|${Math.round(w)}|${Math.round(h)}`;
          if (panel.__dgParticleClipKey !== key) {
            panel.__dgParticleClipKey = key;
            try { dgField.setClipRect({ x, y, w, h }); } catch {}
          }
        } else if (panel.__dgParticleClipKey) {
          panel.__dgParticleClipKey = '';
          try { dgField.setClipRect(null); } catch {}
        }
      }

      // If we're offscreen and nothing is pending (no swaps or deferred clears),
      // skip the heavy draw work and let the next visible frame catch up.
      const singleCompositeNeeded = DG_SINGLE_CANVAS && canDrawAnything;
      const skipFrame =
        !canDrawAnything &&
        !__dgFrontSwapNextDraw &&
        !__dgNeedsUIRefresh &&
        !__hydrationJustApplied &&
        !singleCompositeNeeded;
      const throttleFrame =
        effectiveRenderEvery > 1 &&
        (panel.__dgFrame % effectiveRenderEvery !== 0) &&
        canDrawAnything &&
        !__dgFrontSwapNextDraw &&
        !__dgNeedsUIRefresh &&
        !__hydrationJustApplied &&
        !singleCompositeNeeded &&
        !hasNodeFlash;
      maybeReleaseStalledZoom();
      dgf('start', { f: panel.__dgFrame|0, cssW, cssH, allowOverlayDraw, allowParticleDraw });
      const __ensureSizeStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
        ? performance.now()
        : 0;
      if (!ensureSizeReady()) {
        rafId = requestAnimationFrame(renderLoop);
        return;
      }
      if (DG_SINGLE_CANVAS && !DG_SINGLE_CANVAS_OVERLAYS) {
        if (flashCanvas?.style?.display !== 'none') flashCanvas.style.display = 'none';
        if (ghostCanvas?.style?.display !== 'none') ghostCanvas.style.display = 'none';
      }
      if (__ensureSizeStart) {
        const __ensureSizeDt = performance.now() - __ensureSizeStart;
        try { window.__PerfFrameProf?.mark?.('drawgrid.ensureSize', __ensureSizeDt); } catch {}
      }
      if ((skipFrame || throttleFrame) && panel.__dgGridHasPainted) {
        rafId = requestAnimationFrame(renderLoop);
        return;
      }
      const __perfZoomOn = !!window.__PERF_ZOOM_PROFILE;
      const __perfRenderStart = __perfZoomOn && typeof performance !== 'undefined' ? performance.now() : 0;
      if (frameCam && !panel.__dgFrameCamLogged) {
        const isProd = (typeof process !== 'undefined') && (process?.env?.NODE_ENV === 'production');
        if (!isProd && DG_DEBUG && DBG_DRAW) {
          try { console.debug('[DG][overlay] frameStart camera', frameCam); } catch {}
        }
        panel.__dgFrameCamLogged = true;
      }
      __dgFrameIdx++;
      // Static redraw cadence must NOT change during gestures.
      // Static layers (grid + nodes) should redraw only when dirty or explicitly forced.
      // If we need perf headroom, we reduce detail (particles / playhead detail), not frames.
      let doFullDraw = !!panel.__dgStaticDirty;
      let forceFullDraw = false;
      if (__dgForceFullDrawNext) {
        __dgForceFullDrawNext = false;
        doFullDraw = true;
        forceFullDraw = true;
      }
      if (__dgForceFullDrawFrames > 0) {
        __dgForceFullDrawFrames -= 1;
        doFullDraw = true;
        forceFullDraw = true;
      }
      if (Number.isFinite(__dgForceFullDrawUntil) && nowTs < __dgForceFullDrawUntil) {
        doFullDraw = true;
        forceFullDraw = true;
      }
      if (!panel.__dgGridHasPainted && __dgGridReady()) {
        doFullDraw = true;
      }
      // IMPORTANT:
      // Node flashes are an overlay effect and must NOT force a full static redraw.
      // (Static = grid + nodes). Only tutorial highlight can still require static redraw.
      // Tutorial highlight needs redraw even if static isn't dirty.
      if (tutorialHighlightMode !== 'none') {
        doFullDraw = true;
      }
      const overlayFxWanted = hasOverlayFx || (overlayFlashesEnabled && hasNodeFlash);
      overlayActive = allowOverlayDraw && (overlayFxWanted || overlayTransport || hasOverlayStrokesLive || (cur && previewGid));
      allowOverlayDrawHeavy = allowOverlayDraw && (!skipOverlayHeavy || __dgNeedsUIRefresh || hasNodeFlash);
      overlayCoreWanted = (overlayFxWanted || hasOverlayStrokesLive || (cur && previewGid));
      overlayCoreActive = allowOverlayDrawHeavy && overlayCoreWanted;
      const needsFx = overlayCoreActive || __dgNeedsUIRefresh || hasNodeFlash;
      if (DG_SINGLE_CANVAS && canDrawAnything) {
        const needsFullDraw =
          panel.__dgSingleCompositeDirty ||
          __dgNeedsUIRefresh ||
          __dgFrontSwapNextDraw ||
          __hydrationJustApplied ||
          forceFullDraw ||
          !panel.__dgGridHasPainted ||
          tutorialHighlightMode !== 'none';
        if (!needsFullDraw) doFullDraw = false;
      }
      if (doFullDraw && isTrulyIdle && canDrawAnything && !__dgNeedsUIRefresh && !__dgFrontSwapNextDraw && !__hydrationJustApplied && !(Number.isFinite(__dgForceFullDrawUntil) && nowTs < __dgForceFullDrawUntil)) {
        doFullDraw = false;
      }
      let __dgUpdateStart = null;
      if (typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf) {
        __dgUpdateStart = performance.now();
      }
      try {
        if (allowParticleDraw) {
          const dtMs = Number.isFinite(frameCam?.dt) ? frameCam.dt : 16.6;
          const dt = Number.isFinite(dtMs) ? dtMs / 1000 : (1 / 60);
          const __pfStart = __perfZoomOn && typeof performance !== 'undefined' ? performance.now() : 0;
          const __pfDbgOn = !!(typeof window !== 'undefined' && window.__PERF_PARTICLE_DBG);
          const __pfDbgState = __pfDbgOn ? (dgField?._state || null) : null;
          const __pfDbgConfig = __pfDbgOn ? (dgField?._config || null) : null;
          const __pfUpdateStart = (__perfOn && typeof performance !== 'undefined' && performance.now)
            ? performance.now()
            : 0;
          // Hard emergency gate (renderLoop-local): ensure we can skip dgField.tick(dt) immediately
          // even if the adaptive budget pass is cached/skipped for this frame.
          const __dgCurFpsNow =
            (typeof window !== 'undefined' && Number.isFinite(window.__MT_SM_FPS)) ? window.__MT_SM_FPS :
            ((typeof window !== 'undefined' && Number.isFinite(window.__MT_FPS)) ? window.__MT_FPS : 60);
          const __dgVisibleNow = Number.isFinite(globalDrawgridState?.visibleCount) ? globalDrawgridState.visibleCount : 0;
          const __dgHardEmergencyOffNow =
            (__dgCurFpsNow < 14) || // catastrophic FPS regardless of count
            (__dgVisibleNow >= 12 && __dgCurFpsNow < 22) ||
            (__dgVisibleNow >= 20 && __dgCurFpsNow < 28);
          const __dgParticlesEffectivelyOff =
            (!particleFieldEnabled) ||
            (panel.__dgParticlesOff === true) ||
            (__dgHardEmergencyOffNow === true) ||
            (
              panel.__dgParticleBudgetMaxCountScale != null &&
              panel.__dgParticleBudgetCapScale != null &&
              panel.__dgParticleBudgetSpawnScale != null &&
              panel.__dgParticleBudgetMaxCountScale < 0.02 &&
              panel.__dgParticleBudgetCapScale < 0.02 &&
              panel.__dgParticleBudgetSpawnScale < 0.02
            );

          // Only tick the particle sim when it's actually doing meaningful work.
          if (!__dgParticlesEffectivelyOff) {
            dgField?.tick?.(dt);
          } else if (__dgHardEmergencyOffNow && !panel.__dgParticlesOff) {
            // Flip off immediately (don't wait for adaptive), and force a quick fade-out budget.
            panel.__dgParticlesOff = true;
            panel.__dgParticleBudgetMaxCountScale = 0;
            panel.__dgParticleBudgetCapScale = 0;
            panel.__dgParticleBudgetSpawnScale = 0;
            panel.__dgParticleBudgetKey = '';
            try {
              dgField?.applyBudget?.({
                maxCountScale: 0,
                capScale: 0,
                sizeScale: 1,
                spawnScale: 0,
                tickModulo: 1,
                emergencyFade: true,
              });
            } catch {}
          }
          if (__perfOn && __pfUpdateStart) {
            try { window.__PerfFrameProf?.mark?.('drawgrid.update.particles', performance.now() - __pfUpdateStart); } catch {}
          }
          if (__perfZoomOn && __pfStart && !window.__PERF_PARTICLE_FIELD_PROFILE) {
            const __pfEnd = performance.now();
            try { window.__PerfFrameProf?.mark?.('drawgrid.particle', __pfEnd - __pfStart); } catch {}
          }

          // Debug snapshot (only when enabled via __PERF_PARTICLE_DBG).
          if (__pfDbgOn) {
            try {
              window.__DG_PARTICLE_DBG_LAST = {
                t: nowTs,
                allowParticleDraw: true,
                disableParticles: false,
                isPanelVisible: !!isPanelVisible,
                particles: Array.isArray(__pfDbgState?.particles) ? __pfDbgState.particles.length : null,
                targetDesired: Number.isFinite(__pfDbgState?.targetDesired) ? __pfDbgState.targetDesired : null,
                capScale: Number.isFinite(__pfDbgState?.capScale) ? __pfDbgState.capScale : null,
                lodScale: Number.isFinite(__pfDbgState?.lodScale) ? __pfDbgState.lodScale : null,
                tickModulo: Number.isFinite(__pfDbgConfig?.tickModulo) ? __pfDbgConfig.tickModulo : null,
              };
            } catch {}
          }
        }
        else {
          // Particles skipped this frame. Mark it so we can verify NoParticles truly disables work.
          const __pfDbgOn = !!(typeof window !== 'undefined' && window.__PERF_PARTICLE_DBG);
          if (__perfOn) {
            try {
              window.__PerfFrameProf?.mark?.('drawgrid.update.particles.skipped', 0);
            } catch {}
          }
          if (__pfDbgOn) {
            try {
              window.__DG_PARTICLE_DBG_LAST = {
                t: nowTs,
                allowParticleDraw: false,
                disableParticles: !!disableParticles,
                isPanelVisible: !!isPanelVisible,
                particleStateAllowed: !!particleStateAllowed,
                zoomGestureMoving: !!zoomGestureMoving,
              };
            } catch {}
          }
        }
      } catch (e) {
        dglog('particle-field.tick:error', String((e && e.message) || e));
      }

      const __dgUpdateDt = (__dgUpdateStart !== null) ? (performance.now() - __dgUpdateStart) : 0;

      try {
        if (window.__ZOOM_COMMIT_PHASE) {
          F.perfMark(__dgUpdateDt, 0);
          rafId = requestAnimationFrame(renderLoop);
          return;
        }
      } catch {}

      let __dgDrawDt = 0;
      if (doFullDraw) {
        try {
          // Measure just the visual work for this panel: grid + nodes.
          let __dgDrawStart = null;
          let __dgDrawStartPerf = null;
          if (typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf) {
            __dgDrawStartPerf = performance.now();
          }
          if (DG_PROFILE && typeof performance !== 'undefined' && performance.now) {
            __dgDrawStart = performance.now();
          }

          const __gridDrawStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
            ? performance.now()
            : 0;
          dgGridAlphaLog('renderLoop:drawGrid', gctx, {
            doFullDraw,
            canDrawAnything,
            gridHasPainted: !!panel.__dgGridHasPainted,
            gridReady: __dgGridReady(),
          });
          drawGrid();
          if (__gridDrawStart) {
            const __gridDrawDt = performance.now() - __gridDrawStart;
            try { window.__PerfFrameProf?.mark?.('drawgrid.draw.grid', __gridDrawDt); } catch {}
          }

          if (currentMap) {
            const __nodesDrawStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
              ? performance.now()
              : 0;
            drawNodes(currentMap.nodes);
            if (__nodesDrawStart) {
              const __nodesDrawDt = performance.now() - __nodesDrawStart;
              try { window.__PerfFrameProf?.mark?.('drawgrid.draw.nodes', __nodesDrawDt); } catch {}
            }
          }

          // Static layers are now up to date.
          // (Even after force draws, treat as clean unless something marks it dirty again.)
          panel.__dgStaticDirty = false;

          if (__dgDrawStart !== null) {
          const now = performance.now();
          const dt = now - __dgDrawStart;

          __dgFrameProfileFrames++;
          __dgFrameProfileSumMs += dt;
          if (dt < __dgFrameProfileMinMs) __dgFrameProfileMinMs = dt;
          if (dt > __dgFrameProfileMaxMs) __dgFrameProfileMaxMs = dt;

          // Log about once a second per panel
          if (!__dgFrameProfileLastLogTs || (now - __dgFrameProfileLastLogTs) >= 1000) {
            const avg = __dgFrameProfileFrames > 0
              ? (__dgFrameProfileSumMs / __dgFrameProfileFrames)
              : 0;

            console.log('[DG][profile:panel]', {
              panelId: panel.id || null,
              frames: __dgFrameProfileFrames,
              avgFrameMs: Number(avg.toFixed(3)),
              minFrameMs: Number(__dgFrameProfileMinMs.toFixed(3)),
              maxFrameMs: Number(__dgFrameProfileMaxMs.toFixed(3)),
            });

            __dgFrameProfileFrames = 0;
            __dgFrameProfileSumMs = 0;
            __dgFrameProfileMinMs = Infinity;
            __dgFrameProfileMaxMs = 0;
            __dgFrameProfileLastLogTs = now;
          }
        }

        if (__dgDrawStartPerf !== null) {
          __dgDrawDt = performance.now() - __dgDrawStartPerf;
        }
      } catch (e) {
        dglog('drawGrid:error', String((e && e.message) || e));
      }
    }

      const forceNodesRefresh = !!panel.__dgForceNodesRefresh;
      if (!doFullDraw && canDrawAnything && currentMap && (hasNodeFlash || __dgHadNodeFlash || forceNodesRefresh)) {
        try { drawNodes(currentMap.nodes); } catch {}
        if (forceNodesRefresh) panel.__dgForceNodesRefresh = false;
      }
      __dgHadNodeFlash = hasNodeFlash;

      if (DG_SINGLE_CANVAS && overlayCompositeNeeded) {
        __dgMarkSingleCanvasOverlayDirty(panel);
      }
    F.perfMark(__dgUpdateDt, __dgDrawDt);
    if (__perfZoomOn && __perfRenderStart) {
      const __perfEnd = performance.now();
      try { window.__PerfFrameProf?.mark?.('drawgrid.render', __perfEnd - __perfRenderStart); } catch {}
    }


    if (__dgFrontSwapNextDraw && typeof requestFrontSwap === 'function') {
      __dgFrontSwapNextDraw = false;
      const __frontSwapStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
        ? performance.now()
        : 0;
      try { requestFrontSwap(); } catch (err) { dgs('error', String((err && err.message) || err)); }
      if (__frontSwapStart) {
        const __frontSwapDt = performance.now() - __frontSwapStart;
        try { window.__PerfFrameProf?.mark?.('drawgrid.frontSwap', __frontSwapDt); } catch {}
      }
    }
    // const dgr = panel?.getBoundingClientRect?.();
    //console.debug('[DIAG][DG] frame', {
      //f: panel.__dgFrame,
      //lastPointerup: window.__LAST_POINTERUP_DIAG__,
      //box: dgr ? { x: dgr.left, y: dgr.top, w: dgr.width, h: dgr.height } : null,
    //});
    const __uiRefreshStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
      ? performance.now()
      : 0;
    if (__dgNeedsUIRefresh && __dgStableFramesAfterCommit >= 2) {
      __dgNeedsUIRefresh = false;
      __dgDeferUntilTs = 0;
      try {
        if (!__hydrationJustApplied) {
          if (typeof ensureBackVisualsFreshFromFront === 'function') {
            const __backSyncStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
              ? performance.now()
              : 0;
            ensureBackVisualsFreshFromFront();
            if (__backSyncStart) {
              const __backSyncDt = performance.now() - __backSyncStart;
              try { window.__PerfFrameProf?.mark?.('drawgrid.ui.backSync', __backSyncDt); } catch {}
            }
          }
          const __uiClearStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
            ? performance.now()
            : 0;
          if (ghostCtx?.canvas) {
            const ghostSurface = getActiveGhostCanvas();
            R.resetCtx(ghostCtx);
            R.withLogicalSpace(ghostCtx, () => {
              const { x, y, w, h } = R.getOverlayClearRect({
                canvas: ghostSurface || ghostCtx.canvas,
                pad: R.getOverlayClearPad() * 1.2,
                gridArea,
              });
              ghostCtx.clearRect(x, y, w, h);
            });
            markGhostLayerCleared();
          }
          if (fctx?.canvas) {
            const flashSurface = getActiveFlashCanvas();
            R.resetCtx(fctx);
            R.withLogicalSpace(fctx, () => {
              const { x, y, w, h } = R.getOverlayClearRect({
                canvas: flashSurface || fctx.canvas,
                pad: R.getOverlayClearPad(),
                allowFull: !!panel.__dgFlashOverlayOutOfGrid,
                gridArea,
              });
              fctx.clearRect(x, y, w, h);
            });
            markFlashLayerCleared();
          }
          if (tutorialCtx?.canvas) {
            R.resetCtx(tutorialCtx);
            R.withLogicalSpace(tutorialCtx, () => {
              const active = getActiveTutorialCanvas();
              const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
              const tw = cssW || (active?.width ?? tutorialCtx.canvas.width ?? 0) / scale;
              const th = cssH || (active?.height ?? tutorialCtx.canvas.height ?? 0) / scale;
              tutorialCtx.clearRect(0, 0, tw, th);
            });
            markTutorialLayerCleared();
          }
          if (__uiClearStart) {
            const __uiClearDt = performance.now() - __uiClearStart;
            try { window.__PerfFrameProf?.mark?.('drawgrid.ui.clear', __uiClearDt); } catch {}
          }
        }
      } catch (err) {
        DG.warn('deferred UI clear failed', err);
      }
    }
    if (__uiRefreshStart) {
      const __uiRefreshDt = performance.now() - __uiRefreshStart;
      try { window.__PerfFrameProf?.mark?.('drawgrid.ui.refresh', __uiRefreshDt); } catch {}
    }
    if (!panel.isConnected) {
      if (__frameStart) {
        const __frameDt = performance.now() - __frameStart;
        try { window.__PerfFrameProf?.mark?.('drawgrid.frame.total', __frameDt); } catch {}
      }
      cancelAnimationFrame(rafId);
      return;
    }

    // Set playing class for border highlight
    // Only show the steady highlight while the transport is running.
    // Chained toys require both an active chain link and notes somewhere in the chain.
    const showPlaying = transportRunning
      ? (isChained ? (isActiveInChain && chainHasNotes) : hasActiveNotes)
      : false;
    const __domPlayingStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
      ? performance.now()
      : 0;
    if (!skipDomUpdates) {
      const lastPlaying = !!panel.__dgShowPlaying;
      if (showPlaying !== lastPlaying) {
        // Avoid DOM writes in rAF: queue for deferred commit.
        markPanelForDomCommit(panel);
        queueClassToggle(panel, 'toy-playing', showPlaying);
        panel.__dgShowPlaying = showPlaying;
      }
    }
    if (__domPlayingStart) {
      const __domPlayingDt = performance.now() - __domPlayingStart;
      try { window.__PerfFrameProf?.mark?.('drawgrid.dom.playing', __domPlayingDt); } catch {}
    }

    // --- other overlay layers still respect allowOverlayDraw ---
    if (allowOverlayDrawHeavy && needsFx) {
      overlayCompositeNeeded = true;
      const __flashPassStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
        ? performance.now()
        : 0;
      const __dgOverlayStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
        ? performance.now()
        : 0;
      // Clear flash canvas for this frame's animations
      const __overlayClearStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
        ? performance.now()
        : 0;
      const flashSurface = getActiveFlashCanvas();
      R.resetCtx(fctx);
      R.withLogicalSpace(fctx, () => {
        const { x, y, w, h } = R.getOverlayClearRect({
          canvas: flashSurface,
          pad: R.getOverlayClearPad(),
          allowFull: !!panel.__dgFlashOverlayOutOfGrid,
          gridArea,
        });
        fctx.clearRect(x, y, w, h);
        emitDG('overlay-clear', { reason: 'pre-redraw' });
      });
      markFlashLayerCleared();
      overlayClearedThisFrame = true;
      if (__overlayClearStart) {
        const __overlayClearDt = performance.now() - __overlayClearStart;
        try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.clear', __overlayClearDt); } catch {}
      }

        if (hasNodeFlash && overlayFlashesEnabled) {
          markFlashLayerActive();
          R.withOverlayClip(fctx, gridArea, false, () => {
            R.withLogicalSpace(fctx, () => {
            });
          });
        }

      // Animate special stroke paint (hue cycling).
      // Draw animated special strokes into flashCanvas, then mask with current paint alpha.
        if (!disableOverlayStrokes && (hasOverlayStrokesLive || (cur && previewGid))) {
        const __overlayStrokeStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
          ? performance.now()
          : 0;
        let specialStrokes = __dgOverlayStrokeListCache.special;
        let colorized = __dgOverlayStrokeListCache.colorized;
        let overlayOutOfGrid = __dgOverlayStrokeListCache.outOfGrid;
        let overlayBounds = __dgOverlayStrokeListCache.bounds;
        if (
          __dgOverlayStrokeListCache.paintRev !== __dgPaintRev ||
          __dgOverlayStrokeListCache.len !== (strokes?.length || 0)
        ) {
          specialStrokes = [];
          colorized = [];
          overlayOutOfGrid = false;
          overlayBounds = null;
          let boundsMinX = Infinity;
          let boundsMinY = Infinity;
          let boundsMaxX = -Infinity;
          let boundsMaxY = -Infinity;
          const hasGridBounds = !!(gridArea && gridArea.w > 0 && gridArea.h > 0);
          const gridMinX = hasGridBounds ? gridArea.x : 0;
          const gridMaxX = hasGridBounds ? (gridArea.x + gridArea.w) : 0;
          const gridMinY = hasGridBounds ? gridArea.y : 0;
          const gridMaxY = hasGridBounds ? (gridArea.y + gridArea.h) : 0;
          const pad = hasGridBounds ? Math.max(2, (R.getLineWidth() + 2) * 0.6) : 0;
          if (hasOverlayStrokesLive) {
            for (let i = 0; i < strokes.length; i++) {
              const s = strokes[i];
              if (!s) continue;
              if (s.isSpecial) specialStrokes.push(s);
              if (s.overlayColorize) colorized.push(s);
              if (Array.isArray(s.pts)) {
                const isOverlayStroke = !!(s.isSpecial || s.overlayColorize);
                for (let j = 0; j < s.pts.length; j++) {
                  const p = s.pts[j];
                  if (!p) continue;
                  if (!overlayOutOfGrid && hasGridBounds) {
                    if ((p.x - pad) < gridMinX || (p.x + pad) > gridMaxX || (p.y - pad) < gridMinY || (p.y + pad) > gridMaxY) {
                      overlayOutOfGrid = true;
                    }
                  }
                  if (isOverlayStroke) {
                    if (p.x < boundsMinX) boundsMinX = p.x;
                    if (p.y < boundsMinY) boundsMinY = p.y;
                    if (p.x > boundsMaxX) boundsMaxX = p.x;
                    if (p.y > boundsMaxY) boundsMaxY = p.y;
                  }
                }
              }
            }
          }
          if (Number.isFinite(boundsMinX) && Number.isFinite(boundsMinY) && Number.isFinite(boundsMaxX) && Number.isFinite(boundsMaxY)) {
            overlayBounds = {
              minX: boundsMinX - pad,
              minY: boundsMinY - pad,
              maxX: boundsMaxX + pad,
              maxY: boundsMaxY + pad,
            };
          }
          __dgOverlayStrokeListCache = {
            paintRev: __dgPaintRev,
            len: strokes?.length || 0,
            special: specialStrokes,
            colorized,
            outOfGrid: overlayOutOfGrid,
            bounds: overlayBounds,
          };
        }
        panel.__dgFlashOverlayOutOfGrid = !!overlayOutOfGrid;
          if (specialStrokes.length > 0 || colorized.length > 0 || (cur && previewGid)) {
            __dbgOverlaySpecialCount = specialStrokes.length;
            __dbgOverlayColorizedCount = colorized.length;
            __dbgOverlayHasPreview = !!(cur && previewGid);
            FD.layerDebugLog('overlay-strokes', {
              panelId: panel?.id || null,
              singleCanvas: !!DG_SINGLE_CANVAS,
              zoomed: panel?.classList?.contains('toy-zoomed') || false,
              specialCount: specialStrokes.length,
              colorizedCount: colorized.length,
              hasPreview: !!(cur && previewGid),
              flashVisible: flashCanvas?.style?.display || null,
            });
            markFlashLayerActive();
            R.withOverlayClip(fctx, gridArea, !!panel.__dgFlashOverlayOutOfGrid, () => {
            fctx.save();
            // Draw animated strokes in logical space once (avoid per-stroke reset/transform).
            R.withLogicalSpace(fctx, () => {
              // Draw demoted colorized strokes as static overlay tints
              try {
                const __colorStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
                  ? performance.now()
                  : 0;
                if (colorized.length) {
                  const flashSurface = getActiveFlashCanvas();
                  const baseW = flashSurface?.width || fctx.canvas?.width || 0;
                  const baseH = flashSurface?.height || fctx.canvas?.height || 0;
                  const cacheKey = `${__dgOverlayStrokeListCache.paintRev}|${__dgOverlayStrokeListCache.len}|${colorized.length}|${baseW}x${baseH}|${paintDpr}`;
                  let cache = panel.__dgOverlayColorizedCache;
                  if (!cache || cache.key !== cacheKey || cache.width !== baseW || cache.height !== baseH) {
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(baseW || 0));
                    canvas.height = Math.max(1, Math.round(baseH || 0));
                    const cctx = canvas.getContext('2d');
                    if (cctx) {
                      cctx.__dgIsOverlay = true;
                      R.resetCtx(cctx);
                      cctx.setTransform(1, 0, 0, 1, 0, 0);
                      cctx.clearRect(0, 0, canvas.width, canvas.height);
                      for (const s of colorized) drawFullStroke(cctx, s);
                    }
                    cache = {
                      key: cacheKey,
                      width: canvas.width,
                      height: canvas.height,
                      canvas,
                    };
                    panel.__dgOverlayColorizedCache = cache;
                  }
                  if (cache?.canvas) {
                    fctx.drawImage(cache.canvas, 0, 0, baseW, baseH);
                  }
                }
                if (__colorStart) {
                  try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.strokes.colorized', performance.now() - __colorStart); } catch {}
                }
              } catch {}
              // Then draw animated special lines on top of normal lines
              const __specialStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
                ? performance.now()
                : 0;
              for (const s of specialStrokes) drawFullStroke(fctx, s, { skipReset: true, skipTransform: true });
              if (__specialStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.strokes.special', performance.now() - __specialStart); } catch {}
              }
              // Draw current special preview on top.
              if (cur && previewGid && cur.pts && cur.pts.length) {
                const __previewStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
                  ? performance.now()
                  : 0;
                const preview = { pts: cur.pts, isSpecial: true, generatorId: previewGid };
                drawFullStroke(fctx, preview, { skipReset: true, skipTransform: true });
                if (__previewStart) {
                  try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.strokes.preview', performance.now() - __previewStart); } catch {}
                }
              }
            });
            fctx.restore();
            });
          }
        if (__overlayStrokeStart) {
          const __overlayStrokeDt = performance.now() - __overlayStrokeStart;
          try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.strokes', __overlayStrokeDt); } catch {}
        }
      }
      if (__dgOverlayStart) {
        const __dgOverlayDt = performance.now() - __dgOverlayStart;
        try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.core', __dgOverlayDt); } catch {}
      }
      if (__flashPassStart) {
        const __flashPassDt = performance.now() - __flashPassStart;
        try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.flash.pass', __flashPassDt); } catch {}
      }
      if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW) {
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const until = panel.__dgDebugOverlayUntil || 0;
        if (until > now) {
          if (!panel.__dgDebugOverlayLogged) {
            panel.__dgDebugOverlayLogged = true;
            const payload = {
              panelId: panel?.id || null,
              allowOverlayDraw,
              allowOverlayDrawHeavy,
              skipOverlayHeavy,
              overlayActive,
              overlayCoreWanted,
              overlayCoreActive,
              hasOverlayStrokes,
              hasOverlayStrokesLive,
              disableOverlayStrokes,
              hasOverlayFx,
              overlayTransport,
              overlayEvery,
              strokes: Array.isArray(strokes) ? strokes.length : 0,
              flashEmpty: !!panel.__dgFlashLayerEmpty,
              flashOutOfGrid: !!panel.__dgFlashOverlayOutOfGrid,
              specialCount: __dbgOverlaySpecialCount,
              colorizedCount: __dbgOverlayColorizedCount,
              hasPreview: __dbgOverlayHasPreview,
              flashAlpha: FD.__dgSampleAlphaFromCanvas(getActiveFlashCanvas()),
            };
            console.log('[DG][flow][overlay]', JSON.stringify(payload));
            try { window.__dgLastOverlayState = payload; } catch {}
          }
        }
      }
    }

    for (let i = 0; i < flashes.length; i++) {
        if (flashes[i] > 0) {
            flashes[i] = Math.max(0, flashes[i] - 0.08);
        }
    }

    if (cellFlashes.length > 0) {
      if (disableOverlayCore) {
        for (let i = cellFlashes.length - 1; i >= 0; i--) {
          const flash = cellFlashes[i];
          flash.age -= 0.05;
          if (flash.age <= 0) cellFlashes.splice(i, 1);
        }
      } else {
        const __dgOverlayStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
          ? performance.now()
          : 0;
          try {
            if (allowOverlayDraw) {
              overlayCompositeNeeded = true;
              markFlashLayerActive();
              // Draw cell flashes
              R.withOverlayClip(fctx, gridArea, false, () => {
              fctx.save();
          for (let i = cellFlashes.length - 1; i >= 0; i--) {
            const flash = cellFlashes[i];
            const x = gridArea.x + flash.col * cw;
            const y = gridArea.y + topPad + flash.row * ch;

            fctx.globalAlpha = flash.age * 0.6; // Match grid line color
            fctx.fillStyle = 'rgb(143, 168, 255)';
            fctx.fillRect(x, y, cw, ch);

            flash.age -= 0.05; // Decay rate
            if (flash.age <= 0) {
              cellFlashes.splice(i, 1);
            }
          }
          fctx.restore();
              });
        } else {
          for (let i = cellFlashes.length - 1; i >= 0; i--) {
            const flash = cellFlashes[i];
            flash.age -= 0.05;
            if (flash.age <= 0) {
              cellFlashes.splice(i, 1);
            }
          }
          }
        } catch (e) { /* fail silently */ }
        if (__dgOverlayStart && allowOverlayDrawHeavy) {
          const __dgOverlayDt = performance.now() - __dgOverlayStart;
          try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.cellFlashes', __dgOverlayDt); } catch {}
        }
      }
    }

    if (__frameStart) {
      const __frameDt = performance.now() - __frameStart;
      try { window.__PerfFrameProf?.mark?.('drawgrid.frame.total', __frameDt); } catch {}
    }

    if (noteToggleEffects.length > 0) {
      try {
        if (!disableOverlayCore && allowOverlayDraw) {
          overlayCompositeNeeded = true;
          markFlashLayerActive();
          const __dgOverlayStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
            ? performance.now()
            : 0;
          const __noteToggleStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
            ? performance.now()
            : 0;
          R.withOverlayClip(fctx, gridArea, false, () => {
          fctx.save();
          for (let i = noteToggleEffects.length - 1; i >= 0; i--) {
            const effect = noteToggleEffects[i];
            effect.progress += 0.12;
            const alpha = Math.max(0, 1 - effect.progress);
            if (alpha <= 0) {
              noteToggleEffects.splice(i, 1);
              continue;
            }
            const radius = effect.radius * (1 + effect.progress * 1.6);
            const lineWidth = Math.max(1.2, effect.radius * 0.28 * (1 - effect.progress * 0.5));
            fctx.globalAlpha = alpha;
            fctx.lineWidth = lineWidth;
            fctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            fctx.beginPath();
            fctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
            fctx.stroke();
          }
          fctx.restore();
          });
          if (__dgOverlayStart) {
            const __dgOverlayDt = performance.now() - __dgOverlayStart;
            try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.toggles', __dgOverlayDt); } catch {}
          }
          if (__noteToggleStart) {
            const __noteToggleDt = performance.now() - __noteToggleStart;
            try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.noteToggles', __noteToggleDt); } catch {}
          }
        } else {
          // Even if we skip drawing, continue advancing animations so they stay in sync.
          for (let i = noteToggleEffects.length - 1; i >= 0; i--) {
            const effect = noteToggleEffects[i];
            effect.progress += 0.12;
            const alpha = Math.max(0, 1 - effect.progress);
            if (alpha <= 0) {
              noteToggleEffects.splice(i, 1);
            }
          }
        }
      } catch {}
    }

    // Pink radial bursts for active notes
    if (noteBurstEffects.length > 0) {
      try {
        if (__dgLowFpsMode || !overlayBurstsEnabled) {
          noteBurstEffects.length = 0;
          // Skip burst draw work, but keep the rest of the overlay rendering.
        } else if (disableOverlayCore) {
          const dtMs = Number.isFinite(frameCam?.dt) ? frameCam.dt : 16.6;
          const dt = Number.isFinite(dtMs) ? dtMs / 1000 : (1 / 60);
          for (let i = noteBurstEffects.length - 1; i >= 0; i--) {
            const burst = noteBurstEffects[i];
            for (let j = burst.particles.length - 1; j >= 0; j--) {
              const p = burst.particles[j];
              p.life -= dt * 2.8;
              if (p.life <= 0) {
                burst.particles.splice(j, 1);
              }
            }
            if (!burst.particles.length) {
              noteBurstEffects.splice(i, 1);
            }
          }
        } else {
          const dtMs = Number.isFinite(frameCam?.dt) ? frameCam.dt : 16.6;
          const dt = Number.isFinite(dtMs) ? dtMs / 1000 : (1 / 60);

          if (allowOverlayDrawHeavy || __dgLowFpsMode) {
            overlayCompositeNeeded = true;
            const __dgOverlayStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
              ? performance.now()
              : 0;
            R.withOverlayClip(fctx, gridArea, false, () => {
            fctx.save();
            markFlashLayerActive();
            fctx.globalCompositeOperation = 'lighter';
            for (let i = noteBurstEffects.length - 1; i >= 0; i--) {
              const burst = noteBurstEffects[i];
              let anyAlive = false;

              for (let j = burst.particles.length - 1; j >= 0; j--) {
                const p = burst.particles[j];

                // Fade out – faster fade so the burst clears quickly
                p.life -= dt * 2.0;
                if (p.life <= 0) {
                  burst.particles.splice(j, 1);
                  continue;
                }

                anyAlive = true;

                // Integrate
                p.x += p.vx * dt;
                p.y += p.vy * dt;

                // Gentle damping so they slow as they fade
                p.vx *= 0.9;
                p.vy *= 0.9;

                const alpha = p.life;
                const radius = p.size;

                fctx.globalAlpha = alpha;
                fctx.fillStyle = 'rgba(255, 180, 210, 1)';
                fctx.beginPath();
                fctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                fctx.fill();
              }

              if (!anyAlive) {
                noteBurstEffects.splice(i, 1);
              }
            }
            fctx.restore();
            });
            if (__dgOverlayStart) {
              const __dgOverlayDt = performance.now() - __dgOverlayStart;
              try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.bursts', __dgOverlayDt); } catch {}
            }
          } else {
            for (let i = noteBurstEffects.length - 1; i >= 0; i--) {
              const burst = noteBurstEffects[i];
              for (let j = burst.particles.length - 1; j >= 0; j--) {
                const p = burst.particles[j];
                p.life -= dt * 2.8;
                if (p.life <= 0) {
                  burst.particles.splice(j, 1);
                }
              }
              if (!burst.particles.length) {
                noteBurstEffects.splice(i, 1);
              }
            }
          }
        }
      } catch {}
    }

    // Draw scrolling playhead
    if (!disableOverlayCore && allowOverlayDraw) {
      const __dgOverlayStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
        ? performance.now()
        : 0;
      const __playheadStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
        ? performance.now()
        : 0;
      try {
        const info = getLoopInfo();
        const prevPhase = Number.isFinite(localLastPhase) ? localLastPhase : null;
        const currentPhase = Number.isFinite(info?.phase01) ? info.phase01 : null;
          const phaseJustWrapped = currentPhase != null && prevPhase != null && currentPhase < prevPhase && prevPhase > 0.9;
          if (currentPhase != null) {
            localLastPhase = currentPhase;
          }
          if (panel.__dgPlayheadWrapCount == null) panel.__dgPlayheadWrapCount = 0;
          if (phaseJustWrapped) panel.__dgPlayheadWrapCount++;
          if (__dgPlayheadModeWanted !== null && phaseJustWrapped) {
            const modeNow = performance?.now?.() ?? Date.now();
            if ((modeNow - __dgPlayheadModeWantedSince) >= DG_PLAYHEAD_MODE_MIN_MS &&
                (panel.__dgPlayheadWrapCount || 0) >= 2) {
              __dgPlayheadSimpleMode = __dgPlayheadModeWanted;
              __dgPlayheadModeWanted = null;
              __dgPlayheadModeWantedSince = 0;
            }
          }

      // Only draw and repulse particles if transport is running and this toy is the active one in its chain.
      // If this toy thinks it's active, but the global transport phase just wrapped,
      // it's possible its active status is stale. Skip one frame of playhead drawing
      // to wait for the scheduler to update the `data-chain-active` attribute.
      const probablyStale = isActiveInChain && phaseJustWrapped;

        const playheadSimpleOnly = __dgPlayheadSimpleMode;
        const useSeparatePlayhead = !!(typeof window !== 'undefined' && window.__DG_PLAYHEAD_SEPARATE_CANVAS);
        const playheadFpsHint = readHeaderFpsHint();
        const allowPlayheadLowZoom = Number.isFinite(playheadFpsHint) && playheadFpsHint >= 55;
        // IMPORTANT: do not key visual detail off visible panel count (device-dependent).
        // Fancy playhead is allowed only when (a) we're not in simple mode and
        // (b) measured FPS indicates headroom, or we're zoomed in enough to justify detail.
        const playheadFancyDesired = !playheadSimpleOnly &&
          (zoomForOverlay > 0.75 || allowPlayheadLowZoom);
        if (phaseJustWrapped || panel.__dgPlayheadFancyLocked == null) {
          panel.__dgPlayheadFancyLocked = playheadFancyDesired;
        }
        if (phaseJustWrapped || panel.__dgPlayheadHue == null) {
          panel.__dgPlayheadHue = pickPlayheadHue(strokes);
        }
        const playheadFancy = !!panel.__dgPlayheadFancyLocked;
        const playheadDrawSimple = playheadSimpleOnly || !playheadFancy;
        const canUseTutorialLayer = tutorialHighlightMode === 'none' && !!tutorialCtx?.canvas;
        const playheadLayer = useSeparatePlayhead
          ? 'playhead'
          : (playheadDrawSimple && canUseTutorialLayer) ? 'tutorial' : 'flash';
        const wantsPlayhead = !!(info && isRunning() && isActiveInChain && !probablyStale);

        // Throttle playhead draws during heavy pan/zoom (especially with many panels),
        // but DO NOT clear the existing playhead unless it genuinely shouldn't exist.
        // Otherwise we'd flicker because the "!shouldRenderPlayhead" clear-path also
        // resets __dgPlayheadLastX.
        let allowPlayheadThisFrame = wantsPlayhead;
        try {
          const overrideEvery = Number(window.__PERF_DG_PLAYHEAD_EVERY);
          // Quality should NOT change just because the user is gesturing.
          // All visible toys are treated equally (unless in small-screen focus edit mode).
          const __dgFps =
            (typeof window !== 'undefined' && Number.isFinite(window.__MT_SM_FPS)) ? window.__MT_SM_FPS :
            ((typeof window !== 'undefined' && Number.isFinite(window.__MT_FPS)) ? window.__MT_FPS : 60);
          const __dgVisiblePanels = Number.isFinite(globalDrawgridState?.visibleCount) ? globalDrawgridState.visibleCount : visiblePanels;
          const __dgGlobalLowQuality = (__dgVisiblePanels >= 18 && __dgFps < 50) || (__dgFps < 40);

          // Global quality knob (not gesture-based). When low, we may reduce *detail*, not cadence.
          // Leave playhead cadence at full rate; later we can swap to low-detail visual instead of skipping frames.
          let playheadEvery = 1;
          if (Number.isFinite(overrideEvery) && overrideEvery >= 1) {
            playheadEvery = Math.floor(overrideEvery);
          }
          if (playheadEvery > 1) {
            panel.__dgPlayheadFrame = (panel.__dgPlayheadFrame | 0) + 1;
            allowPlayheadThisFrame = ((panel.__dgPlayheadFrame % playheadEvery) === 0);
          }
        } catch {}

        const shouldRenderPlayhead = wantsPlayhead && allowPlayheadThisFrame;

        if (!wantsPlayhead) {
          const lastX = Number.isFinite(panel.__dgPlayheadLastX) ? panel.__dgPlayheadLastX : null;
          const lastLayer = panel.__dgPlayheadLayer || playheadLayer;
          if (lastX != null) {
            if (lastLayer === 'tutorial' && tutorialHighlightMode === 'none' && tutorialCtx?.canvas) {
              const __overlayClearStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
                ? performance.now()
                : 0;
              R.resetCtx(tutorialCtx);
              R.withLogicalSpace(tutorialCtx, () => {
                const active = getActiveTutorialCanvas();
                const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
                const tw = cssW || (active?.width ?? tutorialCtx.canvas.width ?? 0) / scale;
                const th = cssH || (active?.height ?? tutorialCtx.canvas.height ?? 0) / scale;
                tutorialCtx.clearRect(0, 0, tw, th);
              });
              markTutorialLayerCleared();
              overlayCompositeNeeded = true;
              if (__overlayClearStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.clear', performance.now() - __overlayClearStart); } catch {}
              }
            } else if (lastLayer === 'playhead' && playheadFrontCtx?.canvas) {
              const __overlayClearStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
                ? performance.now()
                : 0;
              R.resetCtx(playheadFrontCtx);
              const clearPlayheadBand = () => {
                const defaultBand = Math.max(6, Math.round(Math.max(0.8 * cw, Math.min(gridArea.w * 0.08, 2.2 * cw))));
                const band = Number.isFinite(panel.__dgPlayheadClearBand) ? panel.__dgPlayheadClearBand : defaultBand;
                playheadFrontCtx.clearRect(lastX - band, gridArea.y - 2, band * 2, gridArea.h + 4);
              };
              clearPlayheadBand();
              markPlayheadLayerCleared();
              overlayCompositeNeeded = true;
              if (__overlayClearStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.clear', performance.now() - __overlayClearStart); } catch {}
              }
            } else if (fctx?.canvas) {
              const __overlayClearStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
                ? performance.now()
                : 0;
              const flashSurface = getActiveFlashCanvas();
              R.resetCtx(fctx);
              R.withLogicalSpace(fctx, () => {
                const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
                const width = cssW || (flashSurface?.width ?? fctx.canvas.width ?? 0) / scale;
                const height = cssH || (flashSurface?.height ?? fctx.canvas.height ?? 0) / scale;
                if (overlayCoreWanted) {
                  // Avoid clearing the overlay band here; it can expose the base (white) line
                  // for a frame if overlay redraw is throttled.
                  __dgNeedsUIRefresh = true;
                  overlayCompositeNeeded = true;
                } else {
                  const { x, y, w, h } = R.getOverlayClearRect({
                    canvas: flashSurface || fctx.canvas,
                    pad: R.getOverlayClearPad(),
                    allowFull: !!panel.__dgFlashOverlayOutOfGrid,
                    gridArea,
                  });
                  fctx.clearRect(x, y, w, h);
                }
              });
              if (overlayCoreWanted) {
                markFlashLayerActive();
              } else {
                markFlashLayerCleared();
              }
              overlayCompositeNeeded = true;
              if (__overlayClearStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.clear', performance.now() - __overlayClearStart); } catch {}
              }
            }
          }
          panel.__dgPlayheadLastX = null;
          panel.__dgPlayheadLayer = null;
        }

        if (shouldRenderPlayhead) {
          const playheadCtx = (playheadLayer === 'tutorial')
            ? tutorialCtx
            : (playheadLayer === 'playhead') ? playheadFrontCtx : fctx;
          panel.__dgPlayheadLastRenderTs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now()
            : Date.now();
          const lastX = Number.isFinite(panel.__dgPlayheadLastX) ? panel.__dgPlayheadLastX : null;
          const lastLayer = panel.__dgPlayheadLayer || playheadLayer;
          if ((playheadCtx === tutorialCtx || playheadCtx === playheadFrontCtx || !overlayClearedThisFrame) && lastX != null) {
            const clearCtx = (lastLayer === 'tutorial')
              ? tutorialCtx
              : (lastLayer === 'playhead') ? playheadFrontCtx : fctx;
            if (clearCtx?.canvas && gridArea) {
              const defaultBand = Math.max(6, Math.round(Math.max(0.8 * cw, Math.min(gridArea.w * 0.08, 2.2 * cw))));
              const band = Number.isFinite(panel.__dgPlayheadClearBand) ? panel.__dgPlayheadClearBand : defaultBand;
              R.resetCtx(clearCtx);
              const clearPlayheadBand = () => {
                clearCtx.clearRect(lastX - band, gridArea.y - 2, band * 2, gridArea.h + 4);
              };
              if (clearCtx === playheadFrontCtx) {
                clearPlayheadBand();
              } else {
                R.withOverlayClip(clearCtx, gridArea, false, clearPlayheadBand);
              }
              emitDG('overlay-clear', { reason: 'playhead-band' });
            }
          }
        if (!useSeparatePlayhead && !overlayClearedThisFrame) {
          const __overlayClearStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
            ? performance.now()
            : 0;
          try {
            if (playheadCtx === tutorialCtx) {
              R.resetCtx(tutorialCtx);
              R.withLogicalSpace(tutorialCtx, () => {
                const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
                const active = getActiveTutorialCanvas();
                const width = cssW || (active?.width ?? tutorialCtx.canvas.width ?? 0) / scale;
                const height = cssH || (active?.height ?? tutorialCtx.canvas.height ?? 0) / scale;
                tutorialCtx.clearRect(0, 0, width, height);
              });
              markTutorialLayerCleared();
            } else {
              const flashSurface = getActiveFlashCanvas();
              R.resetCtx(fctx);
              R.withLogicalSpace(fctx, () => {
                const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
                const width = cssW || (flashSurface?.width ?? 0) / scale;
                const height = cssH || (flashSurface?.height ?? 0) / scale;
                if (!overlayCoreWanted) {
                  const { x, y, w, h } = R.getOverlayClearRect({
                    canvas: flashSurface,
                    pad: R.getOverlayClearPad(),
                    allowFull: !!panel.__dgFlashOverlayOutOfGrid,
                    gridArea,
                  });
                  fctx.clearRect(x, y, w, h);
                  emitDG('overlay-clear', { reason: 'playhead' });
                  markFlashLayerCleared();
                }
              });
              overlayClearedThisFrame = true;
            }
          } catch {}
          if (__perfOn && __overlayClearStart) {
            try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.clear', performance.now() - __overlayClearStart); } catch {}
          }
        }
        overlayCompositeNeeded = true;
        if (playheadCtx === tutorialCtx) {
          markTutorialLayerActive();
        } else if (playheadCtx === playheadFrontCtx) {
          markPlayheadLayerActive();
        } else {
          markFlashLayerActive();
        }
        // Calculate playhead X position based on loop phase
        const playheadX = gridArea.x + info.phase01 * gridArea.w;
        panel.__dgPlayheadLastX = playheadX;
        panel.__dgPlayheadLayer = playheadLayer;

        // Use a dedicated overlay context for the playhead to avoid wiping strokes.
        const drawPlayhead = () => {
        playheadCtx.save();

        // Width of the soft highlight band scales with a column, clamped
        const gradientWidth = Math.round(
          Math.max(0.8 * cw, Math.min(gridArea.w * 0.08, 2.2 * cw))
        );
        const playheadLineW = playheadDrawSimple ? Math.max(2, cw * 0.08) : 3;
        const trailLineCount = playheadDrawSimple ? 0 : 3;
        const gap = playheadDrawSimple ? 0 : 28; // A constant, larger gap
        const trailW0 = 2.5;
        const trailWStep = 0.6;
        const extraTrail = playheadDrawSimple ? 0 : (trailLineCount * gap + 6);
        const baseBand = Math.max(gradientWidth / 2, playheadLineW / 2);
        panel.__dgPlayheadClearBand = Math.max(6, Math.ceil(baseBand + extraTrail));

        // Repulse particles along the full header segment (throttle under load).
        try {
          let sweepDir = headerSweepDirX || 1;
          if (currentPhase != null && prevPhase != null) {
            if (phaseJustWrapped) {
              sweepDir = 1;
            } else if (Math.abs(currentPhase - prevPhase) > 1e-4) {
              sweepDir = (currentPhase - prevPhase) >= 0 ? 1 : -1;
            }
          }
          headerSweepDirX = sweepDir;
          const fpsHint = Number.isFinite(fpsLive) ? fpsLive : null;
          const sweepEvery = 1;
          const baseSweepMaxSteps = 36;
          const sweepMaxSteps = baseSweepMaxSteps;
          panel.__dgPlayheadSweepFrame = (panel.__dgPlayheadSweepFrame || 0) + 1;
          if ((panel.__dgPlayheadSweepFrame % sweepEvery) === 0) {
            const forceMul = Math.max(
              1,
              sweepEvery * (baseSweepMaxSteps / Math.max(1, sweepMaxSteps)) * 1.35
            );
            FF.pushHeaderSweepAt(playheadX, { lineWidthPx: gradientWidth, maxSteps: sweepMaxSteps, forceMul });
          }
        } catch (e) { /* fail silently */ }

        const hue = Number.isFinite(panel.__dgPlayheadHue)
          ? panel.__dgPlayheadHue
          : pickPlayheadHue(strokes);

        if (playheadDrawSimple) {
          playheadCtx.globalAlpha = 0.9;
          playheadCtx.strokeStyle = `hsl(${(hue + 45).toFixed(0)}, 100%, 70%)`;
          playheadCtx.lineWidth = playheadLineW;
          playheadCtx.shadowColor = 'transparent';
          playheadCtx.shadowBlur = 0;
          playheadCtx.beginPath();
          playheadCtx.moveTo(playheadX, gridArea.y);
          playheadCtx.lineTo(playheadX, gridArea.y + gridArea.h);
          playheadCtx.stroke();
          playheadCtx.globalAlpha = 1.0;
        } else {

          const composite = getPlayheadCompositeSprite({
            gradientWidth,
            height: gridArea.h,
            hue,
            trailLineCount,
            gap,
            mainLineW: playheadLineW,
            trailW0,
            trailWStep,
          });
          if (composite) {
            const originX = Number.isFinite(composite.__dgOriginX)
              ? composite.__dgOriginX
              : (composite.width / 2);
            playheadCtx.drawImage(
              composite,
              playheadX - originX,
              gridArea.y,
              composite.width,
              gridArea.h
            );
          }
        }

        playheadCtx.restore();
        };
        if (playheadCtx === playheadFrontCtx) {
          drawPlayhead();
        } else {
          R.withOverlayClip(playheadCtx, gridArea, false, drawPlayhead);
        }
      }
        } catch (e) { /* fail silently */ }
        if (__playheadStart) {
          const __playheadDt = performance.now() - __playheadStart;
          try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.playhead', __playheadDt); } catch {}
        }
      } else {
      const info = getLoopInfo();
      if (info) {
        localLastPhase = info.phase01;
      }
    }

    // Debug overlay
    if (allowOverlayDrawHeavy && window.DEBUG_DRAWGRID === 1) {
      overlayCompositeNeeded = true;
      markFlashLayerActive();
      fctx.save();
      fctx.strokeStyle = 'red';
      fctx.lineWidth = 1;
      const debugSurface = getActiveFlashCanvas();
      const dbgW = debugSurface?.width ?? cssW;
      const dbgH = debugSurface?.height ?? cssH;
      fctx.strokeRect(0, 0, dbgW, dbgH);
      fctx.fillStyle = 'red';
      fctx.font = '12px monospace';
      const pxScale = dbgW ? (paint.width / dbgW).toFixed(2) : 'n/a';
      fctx.fillText(`boardScale: ${boardScale.toFixed(2)}`, 5, 15);
      fctx.fillText(`w x h: ${dbgW} x ${dbgH}`, 5, 30);
      fctx.fillText(`pixelScale: ${pxScale}`, 5, 45);
      if (__dgFpsValue) {
        fctx.fillText(`fps: ${__dgFpsValue.toFixed(1)}`, 5, 60);
      }
      fctx.restore();
    }

    if (DG_SINGLE_CANVAS && canDrawAnything && panel.__dgSingleCompositeDirty) {
      const __compositeStart = (__perfOn && typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : 0;
      compositeSingleCanvas();
      panel.__dgSingleCompositeDirty = false;
      if (__perfOn && __compositeStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.draw.composite', performance.now() - __compositeStart); } catch {}
      }
    }

    if (__dgFrameProfileStart !== null) {
      const totalDt = performance.now() - __dgFrameProfileStart;
      if (totalDt > DG_FRAME_SLOW_THRESHOLD_MS) {
        console.log('[DG][frame][slow]', {
          dtMs: Number(totalDt.toFixed(2)),
          frame: panel.__dgFrame | 0,
          allowOverlayDraw,
          allowParticleDraw,
          cssW,
          cssH,
        });
      }
    }

    dgf('end', { f: panel.__dgFrame|0 });
    // Continue while visible / active.
    ensureRenderLoopRunning();
    } finally {
      endPerf();
      if (__perfOn && __rafStart) {
        try { window.__PerfFrameProf.mark('perf.raf.drawgrid', performance.now() - __rafStart); } catch {}
      }
    }
  }
  renderLoop.__perfRafTag = 'perf.raf.drawgrid';
  rafId = requestAnimationFrame(renderLoop);

  function applyInstrumentFromState(value, { emitEvents = true } = {}) {
    const resolved = (typeof value === 'string') ? value.trim() : '';
    if (!resolved) return false;
    const prev = panel.dataset.instrument || '';
    const changed = prev !== resolved;
    panel.dataset.instrument = resolved;
    panel.dataset.instrumentPersisted = '1';
    if (changed && emitEvents) {
      try { panel.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: resolved }, bubbles: true })); } catch {}
      try { panel.dispatchEvent(new CustomEvent('toy:instrument', { detail: { name: resolved, value: resolved }, bubbles: true })); } catch {}
    }
    return changed;
  }

  function captureState() {
    try {
      const serializeSetArr = (arr) => Array.isArray(arr) ? arr.map(s => Array.from(s || [])) : [];
      const serializeNodes = (arr) => Array.isArray(arr) ? arr.map(s => Array.from(s || [])) : [];
      const normPt = (p) => {
        try {
          const nx = (gridArea.w > 0) ? (p.x - gridArea.x) / gridArea.w : 0;
          const gh = Math.max(1, gridArea.h - topPad);
          const ny = gh > 0 ? (p.y - (gridArea.y + topPad)) / gh : 0;
          return { nx, ny };
        } catch { return { nx: 0, ny: 0 }; }
      };
      return {
        steps: cols | 0,
        autotune: !!autoTune,
        instrument: panel.dataset.instrument || undefined,
        strokes: (strokes || []).map(s => ({
          ptsN: Array.isArray(s.pts) ? s.pts.map(normPt) : [],
          color: s.color,
          isSpecial: !!s.isSpecial,
          generatorId: (typeof s.generatorId === 'number') ? s.generatorId : undefined,
          overlayColorize: !!s.overlayColorize,
        })),
        nodes: {
          active: (currentMap?.active && Array.isArray(currentMap.active)) ? currentMap.active.slice() : Array(cols).fill(false),
          disabled: serializeSetArr(persistentDisabled || []),
          list: serializeNodes(currentMap?.nodes || []),
          groups: (nodeGroupMap || []).map(m => m instanceof Map ? Array.from(m.entries()) : []),
        },
        manualOverrides: Array.isArray(manualOverrides) ? manualOverrides.map(s => Array.from(s || [])) : [],
      };
    } catch (e) {
      return { steps: cols | 0, autotune: !!autoTune };
    }
  }

  function restoreFromState(state) {
    const prevRestoring = isRestoring;
    isRestoring = true;
    if (state && typeof state.instrument === 'string') {
      applyInstrumentFromState(state.instrument, { emitEvents: true });
    }
    const hasStrokes = Array.isArray(state?.strokes) && state.strokes.length > 0;
    const hasActiveNodes = Array.isArray(state?.nodes?.active) && state.nodes.active.some(Boolean);
    const hasNodeList = Array.isArray(state?.nodes?.list) && state.nodes.list.some(arr => Array.isArray(arr) && arr.length > 0);
    try {
      const stats = {
        strokes: Array.isArray(state?.strokes) ? state.strokes.length : 0,
        nodeCount: computeSerializedNodeStats(state?.nodes?.list, state?.nodes?.disabled).nodeCount,
        activeCols: Array.isArray(state?.nodes?.active) ? state.nodes.active.filter(Boolean).length : 0,
      };
      const stack = (new Error('restore-state')).stack?.split('\n').slice(0, 6).join('\n');
      dgTraceLog('[drawgrid][RESTORE] requested', { panelId: panel.id, stats, stack });
    } catch {}
    updateHydrateInboundFromState(state, { reason: 'restoreFromState', panelId: panel?.id });
    if (!hasStrokes && !hasActiveNodes && !hasNodeList) {
      isRestoring = prevRestoring;
      return;
    }
    try {
      R.clearCanvas(pctx);
      emitDG('paint-clear', { reason: 'restore-state' });
      R.clearCanvas(nctx);
      const flashSurface = getActiveFlashCanvas();
      R.withLogicalSpace(fctx, () => {
        const { x, y, w, h } = R.getOverlayClearRect({
          canvas: flashSurface,
          pad: R.getOverlayClearPad(),
          allowFull: !!panel.__dgFlashOverlayOutOfGrid,
          gridArea,
        });
        fctx.clearRect(x, y, w, h);
        emitDG('overlay-clear', { reason: 'restore-state' });
      });

      const denormPt = (nx, ny) => {
        const gh = Math.max(1, gridArea.h - topPad);
        return {
          x: gridArea.x + nx * gridArea.w,
          y: gridArea.y + topPad + ny * gh,
        };
      };

      strokes = (state?.strokes || []).map(s => {
        const ptsN = Array.isArray(s.ptsN) ? s.ptsN.map(p => ({
          nx: Math.max(0, Math.min(1, Number(p?.nx) || 0)),
          ny: Math.max(0, Math.min(1, Number(p?.ny) || 0)),
        })) : null;
        return {
          pts: (s.ptsN || []).map(p => denormPt(p.nx || 0, p.ny || 0)),
          __ptsN: ptsN,
          color: s.color,
          isSpecial: !!s.isSpecial,
          generatorId: (typeof s.generatorId === 'number') ? s.generatorId : undefined,
          overlayColorize: !!s.overlayColorize,
        };
      });

      FD.markRegenSource('restore-state');
      FD.markRegenSource('randomize');
      regenerateMapFromStrokes();
      currentMap = normalizeMapColumns(currentMap, cols);

      R.withLogicalSpace(pctx, () => {
        R.clearCanvas(pctx);
        for (const s of strokes) drawFullStroke(pctx, s);
      });

      __hydrationJustApplied = true;
      __dgHydrationPendingRedraw = true;
      HY.scheduleHydrationLayoutRetry(panel, () => layout(true));
      setTimeout(() => { __hydrationJustApplied = false; }, 32);

      // IMPORTANT:
      // On refresh, zoom/overview boot can briefly report a *scaled* DOM rect (see debug: rectW/rectH)
      // while cssW/cssH are already correct. In that window, the single-canvas composite can miss a
      // guaranteed "final" swap, leaving the user seeing an empty body (grid hidden / stroke scale wrong)
      // until an interaction triggers a redraw.
      //
      // So: after hydration/restore, force a full draw + composite and a front swap deterministically.
      try {
        markStaticDirty('restore-from-state');
      } catch {}
      try {
        panel.__dgSingleCompositeDirty = true;
      } catch {}
      __dgNeedsUIRefresh = true;
      __dgFrontSwapNextDraw = true;
      __dgForceFullDrawNext = true;
      __dgForceFullDrawFrames = Math.max(__dgForceFullDrawFrames || 0, 8);

      ensurePostCommitRedraw('restoreFromState');
      try {
        if (typeof requestFrontSwap === 'function') {
          requestFrontSwap(useFrontBuffers);
        }
      } catch {}
      emitDrawgridUpdate({ activityOnly: false });
      markStaticDirty('external-state-change');
  } catch (e) {
      emitDrawgridUpdate({ activityOnly: false });
    } finally {
      isRestoring = prevRestoring;
      __dgNeedsUIRefresh = true;
      __dgStableFramesAfterCommit = 0;
      try {
        const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
        const hasNodes = Array.isArray(currentMap?.nodes)
          ? currentMap.nodes.some(set => set && set.size > 0)
          : false;
        try {
          updateHydrateInboundFromState(captureState(), { reason: 'restore-from-state-applied', panelId: panel?.id });
        } catch {}

        if (hasStrokes || hasNodes) {
          schedulePersistState({ source: 'restore-from-state' });
        }
      } catch {
        // Ignore persist errors during hydration; keep prior local save intact.
      }
    }
  }

  const api = {
    panel,
    startGhostGuide,
    stopGhostGuide,
    __inboundNonEmpty: () => inboundWasNonEmpty(),
    clear: (options = {})=>{
      const opts = (options && typeof options === 'object') ? options : {};
      const user = !!opts.user;
      const reason = typeof opts.reason === 'string' ? opts.reason : 'api.clear';
      const guardActive = !!DG_HYDRATE.guardActive;
      const inboundNonEmpty = inboundWasNonEmpty();
      // If a programmatic clear lands on a toy that already has strokes/nodes,
      // veto it unless detail.user === true. This prevents unintended wipes.
      if (!opts.user) {
        const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
        const hasActiveCols = currentMap?.active?.some(Boolean);
        if (hasStrokes || hasActiveCols) {
          dgTraceWarn?.('[drawgrid][CLEAR][VETO] programmatic clear blocked on non-empty toy', {
            reason,
            hasStrokes,
            hasActiveCols
          });
          return false;
        }
      }
      let stackSnippet = null;
      try {
        stackSnippet = (new Error('clear-call')).stack?.split('\n').slice(0, 6).join('\n');
      } catch {}
      const clearLog = {
        reason,
        user,
        guardActive,
        pendingUserClear: DG_HYDRATE.pendingUserClear,
        inboundNonEmpty,
        stack: stackSnippet,
      };
      if (!user && (guardActive || inboundNonEmpty)) {
        dgTraceWarn('[drawgrid][CLEAR][VETO] blocked programmatic clear', clearLog);
        return false;
      }
      if (user) {
        dgTraceLog('[drawgrid][CLEAR] user', clearLog);
        DG_HYDRATE.pendingUserClear = true;
        markUserChange('user-clear', { reason });
      } else {
        dgTraceWarn('[drawgrid][CLEAR] programmatic', clearLog);
      }
      const makeFlowCtx = () => ({
        panel,
        paint,
        backCanvas,
        flashCanvas,
        flashBackCanvas,
        activeFlashCanvas: (typeof getActiveFlashCanvas === 'function') ? getActiveFlashCanvas() : null,
        strokes,
        usingBackBuffers,
        paintRev: __dgPaintRev,
        compositeDirty: panel.__dgSingleCompositeDirty,
        hasOverlayStrokesCached,
      });
      FD.flowState('clear:start', makeFlowCtx());
      R.clearCanvas(pctx);
      // Clear both paint buffers to prevent stale composites.
      try { if (backCtx && pctx !== backCtx) R.clearCanvas(backCtx); } catch {}
      try { if (frontCtx && pctx !== frontCtx) R.clearCanvas(frontCtx); } catch {}
      emitDG('paint-clear', { reason: 'pre-redraw' });
      R.clearCanvas(nctx);
      const flashSurface = getActiveFlashCanvas();
      R.withLogicalSpace(fctx, () => {
        const { x, y, w, h } = R.getOverlayClearRect({
          canvas: flashSurface,
          pad: R.getOverlayClearPad(),
          allowFull: !!panel.__dgFlashOverlayOutOfGrid,
          gridArea,
        });
        fctx.clearRect(x, y, w, h);
        emitDG('overlay-clear', { reason: 'pre-redraw' });
      });
      try {
        if (flashBackCtx && flashBackCtx !== fctx) {
          R.resetCtx(flashBackCtx);
          R.withLogicalSpace(flashBackCtx, () => {
            const { x, y, w, h } = R.getOverlayClearRect({
              canvas: flashBackCtx.canvas,
              pad: R.getOverlayClearPad(),
              allowFull: !!panel.__dgFlashOverlayOutOfGrid,
              gridArea,
            });
            flashBackCtx.clearRect(x, y, w, h);
          });
        }
        if (flashFrontCtx && flashFrontCtx !== fctx) {
          R.resetCtx(flashFrontCtx);
          R.withLogicalSpace(flashFrontCtx, () => {
            const { x, y, w, h } = R.getOverlayClearRect({
              canvas: flashFrontCtx.canvas,
              pad: R.getOverlayClearPad(),
              allowFull: !!panel.__dgFlashOverlayOutOfGrid,
              gridArea,
            });
            flashFrontCtx.clearRect(x, y, w, h);
          });
        }
      } catch {}
      try { markFlashLayerCleared(); } catch {}
      panel.__dgFlashOverlayOutOfGrid = false;
      __dgOverlayStrokeListCache = { paintRev: -1, len: 0, special: [], colorized: [], outOfGrid: false };
      __dgOverlayStrokeCache = { value: false, len: 0, ts: 0 };
      strokes = [];
      prevStrokeCount = 0;
      manualOverrides = Array.from({ length: cols }, () => new Set());
      persistentDisabled = Array.from({ length: cols }, () => new Set());
      const emptyMap = {active:Array(cols).fill(false),nodes:Array.from({length:cols},()=>new Set()), disabled:Array.from({length:cols},()=>new Set())};
      currentMap = emptyMap;
      emitDrawgridUpdate({ activityOnly: false });
      drawGrid();
      nextDrawTarget = null; // Disarm any pending line draw
      updateGeneratorButtons(); // Refresh button state to "Draw"
      stopAutoGhostGuide({ immediate: true });
      startAutoGhostGuide({ immediate: true });
      drawLabelState.hasDrawnFirstLine = false;
      updateDrawLabel(true);
      noteToggleEffects = [];
      __dgMarkSingleCanvasDirty(panel);
      if (DG_SINGLE_CANVAS && isPanelVisible) {
        try { compositeSingleCanvas(); } catch {}
        panel.__dgSingleCompositeDirty = false;
      }
      FD.flowState('clear:end', makeFlowCtx());
      return true;
    },
    getState: captureState,
    hasActiveNotes: () => {
      try {
        return !!(currentMap?.active && currentMap.active.some(Boolean));
      } catch { return false; }
    },
    restoreState: restoreFromState,
    setState: (st={})=>{
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!panel.isConnected) return;
          isRestoring = true;
          const fallbackHydrationState = getFallbackHydrationState();
          try {
            const stats = {
              strokes: Array.isArray(st?.strokes) ? st.strokes.length : 0,
              nodeCount: computeSerializedNodeStats(st?.nodes?.list, st?.nodes?.disabled).nodeCount,
              activeCols: Array.isArray(st?.nodes?.active) ? st.nodes.active.filter(Boolean).length : 0,
            };
            const stack = (new Error('set-state')).stack?.split('\n').slice(0, 6).join('\n');
            dgTraceLog('[drawgrid][SETSTATE] requested', { panelId: panel.id, stats, stack });
          } catch {}
          const guardStrokesCandidate = Array.isArray(st?.strokes) && st.strokes.length > 0
            ? st.strokes
            : (Array.isArray(fallbackHydrationState?.strokes) ? fallbackHydrationState.strokes : []);
          const guardNodesListCandidate = Array.isArray(st?.nodes?.list) && st.nodes.list.length > 0
            ? st.nodes.list
            : (fallbackHydrationState?.nodes?.list || []);
          const guardNodesActiveCandidate = Array.isArray(st?.nodes?.active) && st.nodes.active.length > 0
            ? st.nodes.active
            : (fallbackHydrationState?.nodes?.active || []);
          const guardNodesDisabledCandidate = Array.isArray(st?.nodes?.disabled) && st.nodes.disabled.length > 0
            ? st.nodes.disabled
            : (fallbackHydrationState?.nodes?.disabled || []);
          updateHydrateInboundFromState({
            strokes: guardStrokesCandidate,
            nodes: {
              list: guardNodesListCandidate,
              active: guardNodesActiveCandidate,
              disabled: guardNodesDisabledCandidate,
            },
          }, { reason: 'setState-pre', panelId: panel?.id });
          if (typeof st?.instrument === 'string') {
            applyInstrumentFromState(st.instrument, { emitEvents: true });
          }
          try{
            // Steps first
            if (typeof st.steps === 'number' && (st.steps===8 || st.steps===16)){
              if ((st.steps|0) !== cols){
                cols = st.steps|0;
                currentCols = cols;
                panel.dataset.steps = String(cols);
                flashes = new Float32Array(cols);
                persistentDisabled = Array.from({ length: cols }, () => new Set());
                manualOverrides = Array.from({ length: cols }, () => new Set());
                // Force layout for new resolution
                resnapAndRedraw(true);
              }
            }
            // Ensure geometry is current before de-normalizing
            try{ layout(true); }catch{}
            if (typeof st.autotune !== 'undefined') {
              autoTune = !!st.autotune;
              try{
                const btn = panel.querySelector('.drawgrid-autotune');
                if (btn){ btn.textContent = `Auto-tune: ${autoTune ? 'On' : 'Off'}`; btn.setAttribute('aria-pressed', String(autoTune)); }
              }catch{}
            }
            // Restore strokes (fallback to persisted paint data if external state omits it)
            const hasIncomingStrokes = Object.prototype.hasOwnProperty.call(st, 'strokes');
            const incomingStrokes = Array.isArray(st.strokes) ? st.strokes : null;
            const fallbackStrokes = (!hasIncomingStrokes && Array.isArray(fallbackHydrationState?.strokes) && fallbackHydrationState.strokes.length > 0)
              ? fallbackHydrationState.strokes
              : null;
            const strokeSource = (incomingStrokes && incomingStrokes.length > 0) ? incomingStrokes : fallbackStrokes;
            if (strokeSource) {
              strokes = [];
              for (const s of strokeSource){
                let pts = [];
                if (Array.isArray(s?.ptsN)){
                  const gh = Math.max(1, gridArea.h - topPad);
                  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
                  pts = s.ptsN.map(np=>({
                    x: gridArea.x + clamp(Number(np?.nx)||0, 0, 1) * gridArea.w,
                    y: (gridArea.y + topPad) + clamp(Number(np?.ny)||0, 0, 1) * gh
                  }));
                } else if (Array.isArray(s?.pts)) {
                  // Legacy raw points fallback
                  pts = s.pts.map(p=>({ x: Number(p.x)||0, y: Number(p.y)||0 }));
                }
                const ptsN = Array.isArray(s?.ptsN) ? s.ptsN.map(np => ({
                  nx: Math.max(0, Math.min(1, Number(np?.nx) || 0)),
                  ny: Math.max(0, Math.min(1, Number(np?.ny) || 0)),
                })) : null;
                const stroke = {
                  pts,
                  __ptsN: ptsN,
                  color: s?.color || STROKE_COLORS[0],
                  isSpecial: !!s?.isSpecial,
                  generatorId: (typeof s?.generatorId==='number') ? s.generatorId : undefined,
                  overlayColorize: !!s?.overlayColorize,
                };
                strokes.push(stroke);
              }
              clearAndRedrawFromStrokes(null, 'setState-strokes');
            } else if (hasIncomingStrokes && Array.isArray(st.strokes)) {
              const hasFallback = Array.isArray(fallbackHydrationState?.strokes) && fallbackHydrationState.strokes.length > 0;
              if (!hasFallback) {
                strokes = [];
                clearAndRedrawFromStrokes(null, 'setState-strokes-empty');
              }
            }

            // Restore node masks if provided
            if (st.nodes && typeof st.nodes==='object'){
              try{
                const act = Array.isArray(st.nodes.active) ? st.nodes.active.slice(0, cols) : null;
                const dis = Array.isArray(st.nodes.disabled) ? st.nodes.disabled.slice(0, cols).map(a => new Set(a || [])) : null;
                const list = Array.isArray(st.nodes.list) ? st.nodes.list.slice(0, cols).map(a => new Set(a || [])) : null;
                const groups = Array.isArray(st.nodes.groups) ? st.nodes.groups.map(g => new Map(g || [])) : null;

                // If a node list is present in the saved state, it is the source of truth.
                if (list) {
                    if (!currentMap) {
                        // If strokes were not restored, currentMap is null. Build it from saved node list.
                        currentMap = { active: Array(cols).fill(false), nodes: list, disabled: Array.from({length:cols},()=>new Set()) };
                    } else {
                        // If strokes were restored, currentMap exists. Overwrite its nodes with the saved list.
                        currentMap.nodes = list;
                    }
                }

                if (currentMap && (act || dis || groups)) {
                    if (groups) nodeGroupMap = groups;
                    for (let c = 0; c < cols; c++) {
                        if (act && act[c] !== undefined) currentMap.active[c] = !!act[c];
                        if (dis && dis[c] !== undefined) currentMap.disabled[c] = dis[c];
                    }
                }

                  persistentDisabled = currentMap.disabled;

                  drawGrid();
                  drawNodes(currentMap.nodes);
                  try{ 
                    emitDrawgridUpdate({ activityOnly: false });
                  }catch{}
              } catch(e){ }
            }
            if (Array.isArray(st.manualOverrides)){
              try{ manualOverrides = st.manualOverrides.slice(0, cols).map(a=> new Set(a||[])); }catch{}
            }
            // Refresh UI affordances
            try { (panel.__dgUpdateButtons || updateGeneratorButtons)(); } catch{}
            // After all state is applied and layout is stable, sync the dropdown.
            try {
              const stepsSel = panel.querySelector('.drawgrid-steps');
              if (stepsSel) stepsSel.value = String(cols);
            } catch {}
            if (currentMap){ 
              try{
                emitDrawgridUpdate({ activityOnly: false });
              }catch{}
            }
            __hydrationJustApplied = true;
            __dgHydrationPendingRedraw = true;
            HY.scheduleHydrationLayoutRetry(panel, () => layout(true));
            setTimeout(() => { __hydrationJustApplied = false; }, 32);

            // IMPORTANT:
            // Chained toys typically apply their saved content via setState() (not restoreFromState()).
            // During refresh/boot, zoom/overview settling can briefly report a scaled DOM rect.
            // If we miss a guaranteed composite+swap after applying state, the user can see an
            // empty body (no grid) and/or strokes appear incorrectly scaled until interaction.
            // Mirror the restoreFromState post-hydration forcing here.
            try {
              markStaticDirty('set-state');
            } catch {}
            try {
              panel.__dgSingleCompositeDirty = true;
            } catch {}
            __dgNeedsUIRefresh = true;
            __dgFrontSwapNextDraw = true;
            __dgForceFullDrawNext = true;
            __dgForceFullDrawFrames = Math.max(__dgForceFullDrawFrames || 0, 8);
            ensurePostCommitRedraw('setState');
            try {
              if (typeof requestFrontSwap === 'function') {
                requestFrontSwap(useFrontBuffers);
              }
            } catch {}
          }catch(e){ }
          isRestoring = false;
          // Re-check after hydration completes
          stopAutoGhostGuide({ immediate: false });
          scheduleGhostIfEmpty({ initialDelay: 0 });
          try {
            updateHydrateInboundFromState(captureState(), { reason: 'setState-applied', panelId: panel?.id });
          } catch {}
          const strokeCount = Array.isArray(strokes) ? strokes.length : 0;
          const { nodeCount: postNodeCount } = computeCurrentMapNodeStats(currentMap?.nodes, currentMap?.disabled);
          const guardBlocksPostSetState =
            DG_HYDRATE.guardActive &&
            !DG_HYDRATE.seenUserChange &&
            inboundWasNonEmpty() &&
            strokeCount === 0 &&
            postNodeCount === 0;
          if (guardBlocksPostSetState) {
            dgTraceLog('[drawgrid][persist-guard] skip post-setState persist (guard active & snapshot empty)', {
              inbound: { ...DG_HYDRATE.inbound },
              strokeCount,
              nodeCount: postNodeCount,
              seenUserChange: DG_HYDRATE.seenUserChange,
              lastPersistNonEmpty: DG_HYDRATE.lastPersistNonEmpty,
            });
          } else {
            schedulePersistState({ source: 'setState-complete' });
          }
          try { dgTraceLog('[drawgrid] SETSTATE complete', panel.id); } catch {}
        });
      });
    }
  };

  try {
    panel.__dgPerfWarmup = () => {
      try { layout(true); } catch {}
      try { clearAndRedrawFromStrokes(null, 'perf-warmup'); } catch {}
    };
  } catch {}

  // Add some CSS for the new buttons
  const style = document.createElement('style');
  style.textContent = `
      .toy-panel[data-toy="drawgrid"] .drawgrid-generator-buttons {
          position: absolute;
          left: -115px; /* Position outside the panel */
          top: 50%;
          transform: translateY(-50%);
          display: none; /* Hidden by default */
          flex-direction: column;
          gap: 10px;
          z-index: 1;
      }
      .toy-panel[data-toy="drawgrid"].toy-zoomed .drawgrid-generator-buttons {
          display: flex; /* Visible only in advanced mode */
      }
      .toy-panel[data-toy="drawgrid"] .c-btn.active .c-btn-glow {
          opacity: 1;
          filter: blur(2.5px) brightness(1.6);
      }
      .toy-panel[data-toy="drawgrid"] .c-btn.active .c-btn-core::before {
          filter: brightness(1.8);
          transform: translate(-50%, -50%) scale(1.1);
      }
  `;
  panel.appendChild(style);

  panel.addEventListener('toy-clear', (event) => {
    // Ignore clears that were dispatched on other panels (defensive guard)
    if (event?.target !== panel) return;

    const detail = (event && typeof event === 'object') ? (event.detail || {}) : {};
    // Treat clears as programmatic unless explicitly flagged as user: true
    const user = detail.user === true || event?.isTrusted === true ||
      (detail.user == null && detail.reason == null);
    const reason = typeof detail.reason === 'string' ? detail.reason : 'toy-clear';
    api.clear({ user, reason });
  });

  function handleToyRandomEvent(e, kind) {
    try {
      if (e && e.__dgHandled) return;
      if (e) e.__dgHandled = true;
    } catch {}
    if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW) {
      console.log('[DG][flow] handleToyRandomEvent', {
        kind,
        panelId: panel?.id || null,
        phase: e?.eventPhase ?? null,
        targetId: e?.target?.id || null,
        hasDetail: !!e?.detail,
      });
    }
    if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW_EVENTS) {
      FD.flowLog(`event:${kind}`, {
        panelId: panel?.id || null,
        detail: e?.detail || null,
        phase: e?.eventPhase ?? null,
        targetId: e?.target?.id || null,
      });
    }
    if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW) {
      console.log('[DG][flow] handleToyRandomEvent:call', {
        kind,
        panelId: panel?.id || null,
        hasRandomize: typeof RNG?.handleRandomizeLine === 'function',
        hasBlocks: typeof RNG?.handleRandomizeBlocks === 'function',
        hasNotes: typeof RNG?.handleRandomizeNotes === 'function',
      });
    }
    try {
      if (kind === 'toy-random') RNG.handleRandomizeLine();
      else if (kind === 'toy-random-blocks') RNG.handleRandomizeBlocks();
      else if (kind === 'toy-random-notes') RNG.handleRandomizeNotes();
      if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW) {
        console.log('[DG][flow] handleToyRandomEvent:done', {
          kind,
          panelId: panel?.id || null,
        });
      }
    } catch (err) {
      if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW) {
        console.warn('[DG][flow] handleToyRandomEvent:error', { kind, err });
      }
    }
  }
  panel.addEventListener('toy-random', (e) => handleToyRandomEvent(e, 'toy-random'), true);
  panel.addEventListener('toy-random-blocks', (e) => handleToyRandomEvent(e, 'toy-random-blocks'), true);
  panel.addEventListener('toy-random-notes', (e) => handleToyRandomEvent(e, 'toy-random-notes'), true);


  const persistedState = loadPersistedState();
  if (persistedState) {
    try { layout(true); } catch {}
    try { restoreFromState(persistedState); } catch (err) {
      if (DG_DEBUG) DG.warn('restoreFromState failed', err);
    }
  }

  // The ResizeObserver only fires on *changes*. We must call layout() once
  // manually to render the initial state. requestAnimationFrame ensures
  // the browser has finished its own layout calculations first.
  requestAnimationFrame(() => resnapAndRedraw(false));

  let ghostGuideAnimFrame = null;
  let ghostGuideLoopId = null;
  let ghostGuideAutoActive = false;
  let ghostGuideRunning = false;
  let ghostFadeRAF = 0;
  const GHOST_SWEEP_DURATION = 2000;
  const GHOST_SWEEP_PAUSE = 1000;

  function stopGhostGuide({ immediate = false } = {}) {
    if (ghostGuideAnimFrame) {
      cancelAnimationFrame(ghostGuideAnimFrame);
      ghostGuideAnimFrame = null;
    }
    ghostGuideRunning = false;
    if (ghostFadeRAF) {
      cancelAnimationFrame(ghostFadeRAF);
      ghostFadeRAF = 0;
    }
    if (immediate) {
      const ghostSurface = getActiveGhostCanvas();
      R.resetCtx(ghostCtx);
      R.resetCtx(ghostCtx);
      R.withLogicalSpace(ghostCtx, () => {
      const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
      const { x, y, w, h } = R.getOverlayClearRect({
        canvas: ghostSurface,
        pad: R.getOverlayClearPad() * 1.2,
        gridArea,
      });
      ghostCtx.clearRect(x, y, w, h);
    });
      markGhostLayerCleared();
    } else {
      ghostFadeRAF = requestAnimationFrame(() => fadeOutGhostTrail(0));
    }
  }

  function fadeOutGhostTrail(step = 0) {
    const ghostSurface = getActiveGhostCanvas();
    if (!ghostSurface) {
      ghostFadeRAF = 0;
      return;
    }
    R.resetCtx(ghostCtx);
    R.resetCtx(ghostCtx);
    R.withLogicalSpace(ghostCtx, () => {
      const { x, y, w, h } = R.getOverlayClearRect({
        canvas: ghostSurface,
        pad: R.getOverlayClearPad(),
        gridArea,
      });
      ghostCtx.globalCompositeOperation = 'destination-out';
      ghostCtx.globalAlpha = 0.18;
      ghostCtx.fillRect(x, y, w, h);
    });
    ghostCtx.globalCompositeOperation = 'source-over';
    ghostCtx.globalAlpha = 1.0;
    markGhostLayerActive();
    if (DG_GHOST_DEBUG && typeof startY === 'number' && typeof endY === 'number') {
      try {
        const from = { x: gridArea.x - 24, y: startY };
        const to = { x: gridArea.x + gridArea.w + 24, y: endY };
        const labelBand = __dgGetDrawLabelYRange?.();
        if (labelBand) R.drawGhostDebugBand(ghostCtx, labelBand);
        R.drawGhostDebugPath(ghostCtx, { from, to, crossY });
      } catch {}
      if (__dgOverlayStart) {
        const __dgOverlayDt = performance.now() - __dgOverlayStart;
        try { window.__PerfFrameProf?.mark?.('drawgrid.overlay', __dgOverlayDt); } catch {}
      }
    }
    if (step < 5) {
      ghostFadeRAF = requestAnimationFrame(() => fadeOutGhostTrail(step + 1));
    } else {
      ghostFadeRAF = 0;
    }
  }

function startGhostGuide({
  startX, endX,
  startY, endY,
  crossY = null,
  duration = 2000,
  wiggle = true,
  trail = true,
  trailEveryMs = 50,
  trailCount = 3,
  trailSpeed = 1.2,
} = {}) {
  stopGhostGuide({ immediate: true });
  if (ghostFadeRAF) {
    cancelAnimationFrame(ghostFadeRAF);
    ghostFadeRAF = 0;
  }
  const { w, h } = getLayoutSize();
  if (!w || !h) {
    layout(true);
  }

    const gx = gridArea.x, gy = gridArea.y, gw = gridArea.w, gh = gridArea.h;

    if (typeof startX !== 'number' || Number.isNaN(startX)) {
      startX = gx;
    }
    if (typeof endX !== 'number' || Number.isNaN(endX)) {
      endX = gx + gw;
    }
    if (startX > endX) [startX, endX] = [endX, startX];

    if (typeof startY !== 'number' || Number.isNaN(startY)) {
      startY = gy;
    }
    if (typeof endY !== 'number' || Number.isNaN(endY)) {
      endY = gy + gh;
    }

  const __gpathStatic = {
    from: { x: startX, y: startY },
    to: { x: endX, y: endY },
    crossY,
  };

  if (typeof window !== 'undefined' && window.DG_ZOOM_AUDIT && !window.__DG_FIRST_GPATH__) {
    window.__DG_FIRST_GPATH__ = true;
    const camSnapshot = getOverlayZoomSnapshot();
    console.log('[DG][GHOST][PATH]', {
      zoomScale: camSnapshot?.scale || 1,
      from: { x: startX, y: startY },
      to: { x: endX, y: endY },
      crossY,
      gridArea: gridArea && { ...gridArea },
      gridAreaLogical: { ...gridAreaLogical },
    });
  }

  const startTime = performance.now();
  let last = null;
  let lastTrail = 0;
  let lastGhostAudit = 0;
  const noiseSeed = Math.random() * 100;
  ghostGuideRunning = true;

  function frame(now) {
    if (!panel.isConnected) return;
    if (!ghostGuideRunning) return;
    if (isPanelCulled()) {
      ghostGuideRunning = false;
      ghostGuideAnimFrame = null;
      return;
    }
    const ghostSurface = getActiveGhostCanvas();
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);

    if (!cw || !ch) {
      layout(true);
    }

    const gx = gridArea.x, gy = gridArea.y, gw = gridArea.w, gh = gridArea.h;
    const wiggleAmp = gh * 0.25;
    const x = startX + (endX - startX) * t;
    // Quadratic curve that bends toward the DRAW label mid-path.
    const q = (v0, v1, v2, tt) => {
      const u = 1 - tt;
      return u * u * v0 + 2 * u * tt * v1 + tt * tt * v2;
    };
    const t1 = Math.min(1, Math.max(0, t));
    const targetCrossY = (typeof crossY === 'number') ? crossY : (startY + endY) * 0.5;
    const tCurve = Math.max(0, Math.min(1, (t1 < 0.5) ? (t1 * 0.9) : (0.1 + t1 * 0.9)));
    let y = q(startY, targetCrossY, endY, tCurve);
    if (wiggle) {
      const wiggleFactor = Math.sin(t * Math.PI * 3) * Math.sin(t * Math.PI * 0.5 + noiseSeed);
      y += wiggleAmp * wiggleFactor;
    }

    const topBound = gy, bottomBound = gy + gh;
    if (y > bottomBound) y = bottomBound - (y - bottomBound);
    else if (y < topBound) y = topBound + (topBound - y);

    R.resetCtx(ghostCtx);
    R.withLogicalSpace(ghostCtx, () => {
      const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
      const width = cssW || (ghostSurface?.width ?? 0) / scale;
      const height = cssH || (ghostSurface?.height ?? 0) / scale;
      ghostCtx.globalCompositeOperation = 'destination-out';
      ghostCtx.globalAlpha = 0.1;
      ghostCtx.fillRect(0, 0, width, height);
    });
    ghostCtx.globalCompositeOperation = 'source-over';
    ghostCtx.globalAlpha = 1.0;
    if (DG_GHOST_DEBUG) {
      try {
        const band = __dgGetDrawLabelYRange?.();
        if (band) R.drawGhostDebugBand(ghostCtx, band);
        R.drawGhostDebugPath(ghostCtx, __gpathStatic);
      } catch {}
    } else if (typeof window !== 'undefined' && window.__PERF_DG_OVERLAY_CORE_OFF) {
      try {
        const info = getLoopInfo();
        const currentPhase = Number.isFinite(info?.phase01) ? info.phase01 : null;
        if (currentPhase != null) localLastPhase = currentPhase;
      } catch {}
    }
    const camSnapshot = getOverlayZoomSnapshot();
    const z = camSnapshot.scale;

    // Disturbance radius in toy space (unchanged: big, soft "snowplow" feel).
    const baseR = DG_KNOCK.ghostTrail.radiusToy(gridArea);
    const pointerR = baseR * 1.5;
    const capR = Math.max(8, Math.min(gridAreaLogical.w, gridAreaLogical.h) * 0.25);
    const disturbanceRadius = Math.min(pointerR, capR);

    // Visual radius: match the user's drawn line thickness (thickness ≈ lineWidth).
    let visualRadius = disturbanceRadius;
    try {
      const lw = (typeof R.getLineWidth === 'function') ? R.getLineWidth() : null;
      if (Number.isFinite(lw) && lw > 0) {
        // Treat the line width as our visual thickness baseline.
        visualRadius = Math.max(2, lw);
      }
    } catch {}

    if (last) {
      R.resetCtx(ghostCtx);
      R.withLogicalSpace(ghostCtx, () => {
        ghostCtx.globalCompositeOperation = 'source-over';
        ghostCtx.globalAlpha = 0.25;
        ghostCtx.lineCap = 'round';
        ghostCtx.lineJoin = 'round';

        // Make the ghost trail roughly the same thickness as the drawn line.
        let lw = (typeof R.getLineWidth === 'function') ? R.getLineWidth() : null;
        if (!Number.isFinite(lw) || lw <= 0) {
          lw = visualRadius;
        }

        const trailWidth = Math.max(2, lw);
        ghostCtx.lineWidth = trailWidth;
        ghostCtx.strokeStyle = 'rgba(68,112,255,0.7)';
        ghostCtx.beginPath();
        ghostCtx.moveTo(last.x, last.y);
        ghostCtx.lineTo(x, y);
        ghostCtx.stroke();

        // Core dot width ≈ line thickness
        const dotR = Math.max(2, lw * 0.5);
        ghostCtx.beginPath();
        ghostCtx.arc(x, y, dotR, 0, Math.PI * 2);
        ghostCtx.fillStyle = 'rgba(68,112,255,0.85)';
        ghostCtx.fill();
      });
      markGhostLayerActive();
    }
    last = { x, y };

    // Physics still uses the larger radius so particles "feel" a fat snowplow.
    FF.pokeFieldToy('ghostTrail', x, y, disturbanceRadius, DG_KNOCK.ghostTrail.strength, {
      mode: 'plow',
      highlightMs: 900,
    });
    if (!window.__DG_FIRST_GHOST_LOGGED__) {
      window.__DG_FIRST_GHOST_LOGGED__ = true;
      drawgridLog('[DG][ghostTrail] poke', { x, y, radius: disturbanceRadius, strength: DG_KNOCK.ghostTrail.strength });
    }
    __dgLogFirstPoke(drawgridLog, 'ghostTrail', disturbanceRadius, DG_KNOCK.ghostTrail.strength);

    const logicalMin = Math.min(
      (gridAreaLogical?.w ?? 0),
      (gridAreaLogical?.h ?? 0)
    );
    const lettersRadius = Math.max(
      disturbanceRadius * 2.25,
      logicalMin * 0.2
    );
    knockLettersAt(
      x - (gridArea?.x || 0),
      y - (gridArea?.y || 0),
      { radius: lettersRadius, strength: DG_KNOCK.lettersMove.strength, source: 'ghost' }
    );
    if (DG_GHOST_DEBUG) {
      try {
        R.withLogicalSpace(ghostCtx, () => {
          ghostCtx.save();
          const pad = Math.max(20, disturbanceRadius * 3);
          ghostCtx.clearRect(x - pad, y - pad, pad * 2, pad * 2);
          ghostCtx.restore();
        });
        R.drawGhostDebugFrame(ghostCtx, {
          x,
          y,
          radius: disturbanceRadius,
          lettersRadius,
        });
        markGhostLayerActive();
      } catch {}
    }
    if (window.DG_ZOOM_AUDIT && (now - lastGhostAudit) >= 500) {
      __auditZoomSizes('ghostTrail');
      lastGhostAudit = now;
    }
    if (trail && now - lastTrail >= trailEveryMs) {
      dgField?.pulse?.(0.4 + Math.min(0.2, trailCount * 0.05));
      lastTrail = now;
    }

    if (ghostGuideRunning && t < 1) {
      ghostGuideAnimFrame = requestAnimationFrame(frame);
    } else {
      ghostGuideRunning = false;
      if (ghostFadeRAF) {
        cancelAnimationFrame(ghostFadeRAF);
      }
      ghostFadeRAF = requestAnimationFrame(() => fadeOutGhostTrail(0));
      ghostGuideAnimFrame = null;
    }
  }

  ghostGuideAnimFrame = requestAnimationFrame(frame);
}

function scheduleGhostIfEmpty({ initialDelay = 150 } = {}) {
  const check = () => {
    if (!panel.isConnected) return;
    if (isPanelCulled()) {
      stopAutoGhostGuide({ immediate: true });
      return;
    }
    if (isRestoring) {                 // Wait until setState() finishes
      setTimeout(check, 100);
      return;
    }
    const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
    const hasNodes = Array.isArray(currentMap?.nodes)
      ? currentMap.nodes.some(set => set && set.size > 0)
      : false;

    if (!hasStrokes && !hasNodes) {
      stopAutoGhostGuide({ immediate: true });
      startAutoGhostGuide({ immediate: true });
      updateDrawLabel(true);
    } else {
      // If content exists, ensure the ghost is fully stopped/cleared.
      stopAutoGhostGuide({ immediate: true });
      updateDrawLabel(false);
    }
  };
  setTimeout(check, initialDelay);
}

function runAutoGhostGuideSweep() {
  if (!ghostGuideAutoActive) return;

  const w = gridArea?.w ?? 0;
  const h = gridArea?.h ?? 0;
  // Guard against tiny layouts
  if (!w || !h || w <= 48 || h <= 48) {
    return;
  }

  // Use left->right off-screen randomized Y path
  const gpath = __dgComputeGhostSweepLR();
  const { safeMinY = gridArea?.y ?? 0, safeMaxY = (gridArea?.y ?? 0) + (gridArea?.h ?? 0) } = gpath;
  const clampY = (v) => {
    if (!Number.isFinite(v)) return safeMinY;
    return Math.max(safeMinY, Math.min(safeMaxY, v));
  };
  const startX = gpath.from.x;
  const startY = clampY(gpath.from.y);
  const endX = gpath.to.x;
  const endY = clampY(gpath.to.y);

  if (DG_GHOST_DEBUG) {
    try {
      const labelBand = __dgGetDrawLabelYRange?.();
      if (labelBand) R.drawGhostDebugBand(ghostCtx, labelBand);
      R.drawGhostDebugPath(ghostCtx, { from: gpath.from, to: gpath.to, crossY: gpath.crossY });
    } catch {}
  }

  startGhostGuide({
    startX, endX, startY, endY, crossY: gpath.crossY,
    duration: GHOST_SWEEP_DURATION,
    wiggle: true,
    trail: true,
    trailEveryMs: 50,
    trailCount: 3,
    trailSpeed: 1.2,
  });
}

  function startAutoGhostGuide({ immediate = false } = {}) {
    if (ghostGuideAutoActive) return;
    ghostGuideAutoActive = true;
    syncLetterFade({ immediate });
    runAutoGhostGuideSweep();
    const interval = GHOST_SWEEP_DURATION + GHOST_SWEEP_PAUSE;
    ghostGuideLoopId = setInterval(() => {
      if (!ghostGuideAutoActive) return;
      runAutoGhostGuideSweep();
    }, interval);
  }

  function stopAutoGhostGuide({ immediate = false } = {}) {
    const wasActive = ghostGuideAutoActive || ghostGuideLoopId !== null || !!ghostGuideAnimFrame;
    ghostGuideAutoActive = false;
    if (ghostGuideLoopId) {
      clearInterval(ghostGuideLoopId);
      ghostGuideLoopId = null;
    }
    stopGhostGuide({ immediate });
    if (wasActive) {
      syncLetterFade({ immediate });
    }
  }

  panel.startGhostGuide = startGhostGuide;
  panel.stopGhostGuide = stopGhostGuide;

  panel.addEventListener('toy-remove', () => {
    destroyDrawLabelOverlay(drawLabelState);
    tutorialHighlightMode = 'none';
    stopTutorialHighlightLoop();
    noteToggleEffects = [];
    nextDrawTarget = null;
    previewGid = null;
    stopAutoGhostGuide({ immediate: true });
    try { dgField?.destroy?.(); } catch {}
    panel.__drawParticles = null;
    try { panel.removeEventListener('toy-instrument', handleInstrumentPersist); } catch {}
    if (typeof unsubscribeZoom === 'function') {
      try { unsubscribeZoom(); } catch {}
    }
    if (typeof unsubscribeFrameStart === 'function') {
      try { unsubscribeFrameStart(); } catch {}
      unsubscribeFrameStart = null;
    }
    if (storageKey && typeof window !== 'undefined') {
      try { window.removeEventListener('beforeunload', persistBeforeUnload); } catch {}
    }
    persistStateNow({ source: 'toy-remove' });
    try { delete panel.__getDrawgridPersistedState; } catch {}
    if (panel.__dgVisibilityObserver) {
      try { panel.__dgVisibilityObserver.disconnect(); } catch {}
      try { delete panel.__dgVisibilityObserver; } catch {}
    }
    observer.disconnect();
  }, { once: true });

  panel.addEventListener('tutorial:highlight-notes', (event) => {
    const allowGuide = !!event?.detail?.allowGuide;
    if (event?.detail?.active && (isTutorialActive() || allowGuide)) {
      tutorialHighlightOverride = allowGuide && !isTutorialActive();
      tutorialHighlightMode = 'notes';
      startTutorialHighlightLoop();
    } else if (tutorialHighlightMode === 'notes') {
      tutorialHighlightMode = 'none';
      tutorialHighlightOverride = false;
      stopTutorialHighlightLoop();
    }
  });

  panel.addEventListener('tutorial:highlight-drag', (event) => {
    const allowGuide = !!event?.detail?.allowGuide;
    if (event?.detail?.active && (isTutorialActive() || allowGuide)) {
      tutorialHighlightOverride = allowGuide && !isTutorialActive();
      tutorialHighlightMode = 'drag';
      startTutorialHighlightLoop();
    } else if (tutorialHighlightMode === 'drag') {
      tutorialHighlightMode = 'none';
      tutorialHighlightOverride = false;
      stopTutorialHighlightLoop();
    }
  });

  panel.addEventListener('drawgrid:update', (e) => {
    const nodes = e?.detail?.map?.nodes;
    const hasAny = Array.isArray(nodes) && nodes.some(set => set && set.size > 0);
    if (hasAny) {
      stopAutoGhostGuide({ immediate: false });
    } else {
      stopAutoGhostGuide({ immediate: true });
      startAutoGhostGuide({ immediate: true });
    }
  });

  requestAnimationFrame(() => {
    try {
      if (!panel.isConnected) return;
      ensureSizeReady({ force: true });
      layout(true);
      drawGrid();
      if (currentMap?.nodes) {
        drawNodes(currentMap.nodes);
      }
      stopAutoGhostGuide({ immediate: true });
      startAutoGhostGuide({ immediate: true });
      __dgNeedsUIRefresh = true;
      __dgStableFramesAfterCommit = 0;
    } catch {}
  });

  scheduleGhostIfEmpty({ initialDelay: 150 });

  try {
    setTimeout(() => {
      try {
        window.Persistence?.markDirty?.();
        window.Persistence?.flushAutosaveNow?.();
      } catch {}
    }, 0);
  } catch {}

  try { panel.dispatchEvent(new CustomEvent('drawgrid:ready', { bubbles: true })); } catch {}
  return api;
}








