// src/drawgrid.js
// Minimal, scoped Drawing Grid -- 16x12, draw strokes, build snapped nodes on release.
// Strictly confined to the provided panel element.
import { buildPalette, midiToName } from '../note-helpers.js';
import { drawBlock } from '../toyhelpers.js';
import { getLoopInfo, isRunning } from '../audio-core.js';
import { onZoomChange, getZoomState, getFrameStartState, onFrameStart, namedZoomListener } from '../zoom/ZoomCoordinator.js';
import { createParticleViewport, createField, getParticleBudget, getAdaptiveFrameBudget, getParticleCap } from '../baseMusicToy/index.js';
import { overviewMode } from '../overview-mode.js';
import { boardScale as boardScaleHelper } from '../board-scale-helpers.js';
import { beginFrameLayoutCache, getRect } from '../layout-cache.js';
import { makeDebugLogger } from '../debug-flags.js';
import { startSection } from '../perf-meter.js';
import { traceCanvasResize } from '../perf/PerfTrace.js';
import {
  fillGapsInNodeArray,
  findChainHead,
  chainHasSequencedNotes,
  normalizeMapColumns,
} from './dg-chain-utils.js';
import {
  __dgIsGesturing,
  getGlobalAdaptiveState,
  __dgAdaptiveTickMs,
  updateAdaptiveShared,
  startAdaptiveSharedTicker,
  __dgZoomScale,
  globalDrawgridState,
} from './dg-adaptive.js';
import {
  HeaderSweepForce,
  createDGTuning,
  dbgPoke,
  __dgLogFirstPoke,
} from './dg-tuning.js';
import {
  createDrawLabelOverlay,
  updateDrawLabelLayout,
  destroyDrawLabelOverlay,
} from './dg-dom-label.js';
import { installGeneratorButtons } from './dg-generators-ui.js';
import { createActiveCanvasHelpers } from './dg-canvas-active.js';
import { createDgPaintBuffers } from './dg-paint-buffers.js';
import { createDgPlayheadSprites } from './dg-playhead-sprites.js';
import {
  createDgPersist,
  computeCurrentMapNodeStats,
  computeSerializedNodeStats,
} from './dg-persist.js';
import { createDgRenderUtils } from './dg-render-utils.js';
import { createDgFlowTrace } from './dg-flow-trace.js';
import { createDgFlowDebug } from './dg-flow-debug.js';
import { createDgHydrationHelpers } from './dg-hydration-helpers.js';
import { createDgParticles } from './dg-particles.js';
import { createDgFieldForces } from './dg-field-forces.js';
import { createDgRandomizers } from './dg-randomizers.js';
import { createDgRefreshDebug } from './dg-refresh-debug.js';
import { createDgTraceHelpers, initDgTraceFlags } from './dg-trace.js';
import { createDgPaintTrace, initDgPaintTraceFlags } from './dg-paint-trace.js';
import { createDgPointerTrace } from './dg-pointer-trace.js';
import { createDgPaintDebug } from './dg-paint-debug.js';
import { createDgInputHandlers } from './dg-input-handlers.js';
import { createDgGridRender } from './dg-grid-render.js';
import { createDgNodesRender } from './dg-nodes-render.js';
import { createDgNoteGrid } from './dg-note-grid.js';
import { createDgSnap } from './dg-snap.js';
import { createDgMapRegen } from './dg-map-regen.js';
import { computeGhostSweepLR } from './dg-ghost-path.js';
import { createDgGhostLayer } from './dg-ghost-layer.js';
import { createDgGhostGuide } from './dg-ghost-guide.js';
import { createDgPaintSnapshot } from './dg-paint-snapshot.js';
import { createDgTutorialHighlight } from './dg-tutorial-highlight.js';
import { createDgResnap } from './dg-resnap.js';
import { createDgClear } from './dg-clear.js';
import { createDgStateIo } from './dg-state-io.js';
import { createDgSetState } from './dg-set-state.js';
import { createDgPaintRedraw } from './dg-paint-redraw.js';
import { createDgZoomRecompute } from './dg-zoom-recompute.js';
import { createDgZoomHandler } from './dg-zoom-handler.js';
import { createDgPlayheadSweep } from './dg-playhead-sweep.js';
import { createDgPlayheadRender } from './dg-playhead-render.js';
import { createDgOverlayFlush } from './dg-overlay-flush.js';
import { createDgStrokeRender } from './dg-stroke-render.js';
import { createDgNoteEffects } from './dg-note-effects.js';
import { createDgOverviewTransitions } from './dg-overview-transitions.js';
import { createDgLayoutSizing } from './dg-layout-sizing.js';
import { createDgComposite } from './dg-composite.js';
import { createDgBackSync } from './dg-back-sync.js';
import { createDgBufferSwitch } from './dg-buffer-switch.js';
import { createDgLayout } from './dg-layout.js';
import { createDgParticleState } from './dg-particle-state.js';
import {
  dgScaleTrace,
  dgNodeScaleTrace,
  dgRenderScaleTrace,
  dgCanvasScaleTrace,
  __dgStableStringify,
  __dgMaybeTraceStack,
  __dgDescribeCanvasScale,
  __dgGetCanvasSizingSnapshot,
  __dgEmitScaleMismatchIfChanged,
  __dgTraceCanvasScaleSnapshot,
  __dgGhostMaybeStack,
} from './dg-scale-trace.js';
import { requestPanelPulse } from '../pulse-border.js';
import { queueClassToggle, markPanelForDomCommit } from '../dom-commit.js';
import { createToySurfaceManager } from '../toy-surface-manager.js';
import {
  __dgComputeVisualBackingMul,
  __dgComputeGestureBackingMul,
  __dgComputeGestureStaticMul,
  __dgComputeSmallPanelBackingMul,
  __dgGetAutoQualityMul,
  __dgComputeAdaptivePaintDpr,
  __dgCapDprForBackingStore,
  __dgUpdatePressureDprMulFromFps,
  __dgGetPressureDprMul,
} from './dg-dpr.js';
import { createDgQuality } from './dg-quality.js';
import {
  __dgEnsureStateReadoutEl,
  __dgEscapeHtml,
  __dgReadoutTierToColor,
  __dgInstallStateSnapshotGlobals,
} from './dg-state-readout.js';
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
  __dgFlag,
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
} from './dg-debug.js';

const drawgridLog = makeDebugLogger('mt_debug_logs', 'log');

// Lightweight trace helpers (opt-in via console):
//   window.__DG_NODE_SCALE_TRACE = true   // logs only when node scale inputs change
//   window.__DG_RENDER_SCALE_TRACE = true // logs only when key render-basis inputs change
initDgTraceFlags();
const { dgInputTrace, dgGhostTrace, dgParticleBootLog } = createDgTraceHelpers({ drawgridLog });
if (typeof window !== 'undefined' && window.__DG_NODE_SCALE_TRACE == null) {
  window.__DG_NODE_SCALE_TRACE = false;
}
if (typeof window !== 'undefined' && window.__DG_RENDER_SCALE_TRACE == null) {
  window.__DG_RENDER_SCALE_TRACE = false;
}
// Optional: more verbose random-trace logging.
//   window.__DG_RANDOM_TRACE_VERBOSE = true
if (typeof window !== 'undefined' && window.__DG_RANDOM_TRACE_VERBOSE == null) {
  window.__DG_RANDOM_TRACE_VERBOSE = false;
}
// Optional: include stacks for node-scale logs.
//   window.__DG_NODE_SCALE_TRACE_STACK = true
if (typeof window !== 'undefined' && window.__DG_NODE_SCALE_TRACE_STACK == null) {
  window.__DG_NODE_SCALE_TRACE_STACK = false;
}
// Optional: include stacks for render-scale logs.
//   window.__DG_RENDER_SCALE_TRACE_STACK = true
if (typeof window !== 'undefined' && window.__DG_RENDER_SCALE_TRACE_STACK == null) {
  window.__DG_RENDER_SCALE_TRACE_STACK = false;
}

let __dgScaleSigMap = null;

// --- Canvas DPR helpers ------------------------------------------------------
// Some panels reduce backing-store DPR (visual/pressure/small-panel multipliers).
// If we draw in logical space assuming paintDpr=1 but a canvas backing store is
// actually smaller (e.g. 0.6 DPR), ghost strokes will "scale wrong", often on later sweeps/trails.
function __dgGetCanvasDprFromCss(canvas, cssW, fallback = 1) {
  try {
    const cw = canvas?.width || 0;
    const ch = canvas?.height || 0;

    // IMPORTANT (zoom-safe):
    // Do NOT use getBoundingClientRect() here. During zoom/pan, it reflects transformed
    // geometry and will make DPR estimates change with camera zoom (causing nodes/lines/text
    // to shrink/grow relative to other layers).
    //
    // Prefer the caller's CSS size (derived from stable layout), then our cached size,
    // then computedStyle as a last resort.
    //
    // IMPORTANT:
    // We have seen cases where per-canvas cached CSS sizes (canvas.__dgCssW/H) drift
    // across refresh/gesture transitions (especially when canvases get swapped or
    // styles are rewritten). If we trust a stale cached width, DPR estimation becomes
    // wrong and you get exactly the reported symptoms:
    //   - nodes/labels/connectors not filling the available space when zoomed out
    //   - the solid paint stroke rendering larger/smaller than the overlay stroke
    //
    // So: if the caller provides a numeric cssW, treat that as authoritative.
    const hasAuthoritativeW = Number.isFinite(cssW) && cssW > 0;
    let w = (hasAuthoritativeW ? cssW : 0);
    const cachedW = (canvas && Number.isFinite(canvas.__tsmCssW)) ? canvas.__tsmCssW
      : (canvas && Number.isFinite(canvas.__dgCssW)) ? canvas.__dgCssW : 0;
    const cachedH = (canvas && Number.isFinite(canvas.__tsmCssH)) ? canvas.__tsmCssH
      : (canvas && Number.isFinite(canvas.__dgCssH)) ? canvas.__dgCssH : 0;
    let h = cachedH || 0;
    if (!w && cachedW) w = cachedW;

    // If we *do* have an authoritative cssW, keep the canvas cache aligned so
    // future DPR estimates don't accidentally pick up an old value.
    if (canvas && w && (!cachedW || Math.abs(cachedW - w) > 1)) {
      try { canvas.__dgCssW = w; } catch {}
    }
    if ((!w || !h) && typeof getComputedStyle === 'function' && canvas) {
      try {
        const cs = getComputedStyle(canvas);
        const sw = parseFloat(cs?.width || '0') || 0;
        const sh = parseFloat(cs?.height || '0') || 0;
        if (!w && sw > 0) w = sw;
        if (!h && sh > 0) h = sh;
      } catch {}
    }

    // If both cached + computedStyle exist and disagree a lot, prefer computedStyle.
    // (This handles cases where a canvas was moved/swapped and the cache lags.)
    try {
      if (canvas && typeof getComputedStyle === 'function') {
        const cs = getComputedStyle(canvas);
        const sw = parseFloat(cs?.width || '0') || 0;
        if (sw > 0 && cachedW > 0 && Math.abs(sw - cachedW) > 2 && (!Number.isFinite(cssW) || !cssW)) {
          w = sw;
          try { canvas.__dgCssW = sw; } catch {}
        }
      }
    } catch {}

    if (cw > 0 && w > 0) {
      // If the caller supplies cssW, treat width as authoritative and avoid
      // averaging with a potentially stale cached height.
      if (hasAuthoritativeW) return cw / w;
      // If we have both axes, average them to reduce weirdness if one axis is rounded differently.
      if (ch > 0 && h > 0) {
        const dprX = cw / w;
        const dprY = ch / h;
        return (dprX + dprY) * 0.5;
      }
      return cw / w;
    }
  } catch {}
  return fallback;
}
function __dgWithLogicalSpaceDpr(R, ctx, dpr, fn) {
  // IMPORTANT:
  // Do NOT temporarily mutate the module-scoped paintDpr.
  // That global is shared across all drawgrid instances + layers, and mutating it
  // (even briefly) can cause exactly the "some overlays are scaled differently"
  // bug we're chasing (nodes/animated line/ghost trail drawn too small/large).
  //
  // Instead, apply the DPR as a local transform directly on this context.
  if (!ctx) return fn();

  // Guard against accidental nesting.
  if (ctx.__dgLogicalSpaceActive) {
    return fn();
  }

  const s = (Number.isFinite(dpr) && dpr > 0) ? dpr : 1;
  try { ctx.__dgLogicalSpaceActive = true; } catch {}
  ctx.save();
  ctx.setTransform(s, 0, 0, s, 0, 0);
  try {
    return fn();
  } finally {
    ctx.restore();
    try { ctx.__dgLogicalSpaceActive = false; } catch {}
  }
}


// One-shot dumper (manual, not spammy) is installed per-instance inside createDrawGrid()
// so it can see the actual canvases. (Module-scope can't see per-instance locals.)

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

// ---------------------------------------------------------------------------
// Overlay dirty gating
// ---------------------------------------------------------------------------
// Overlays are alpha-heavy. If we clear + redraw them every frame, they can
// dominate nonScript (raster/composite). We only want to redraw overlays when
// something actually changed.
function __dgMarkOverlayDirty(panel) {
  try { panel.__dgOverlayDirty = true; } catch {}
}

try { startAdaptiveSharedTicker(); } catch {}

// --- Performance / LOD tuning ----------------------------------------

// Below this FPS we start aggressively disabling the fancy background field.
// Hysteresis means we only re-enable once FPS climbs comfortably above.
const DG_MIN_FPS_FOR_PARTICLE_FIELD = 32;  // degrade if we live below this
const DG_FPS_PARTICLE_HYSTERESIS_UP = 38;  // re-enable once we're above this
const DG_PLAYHEAD_FPS_SIMPLE_ENTER = 28;
const DG_PLAYHEAD_FPS_SIMPLE_EXIT = 34;

// Test harness: allow Perf Lab to drive DrawGrid LOD using a forced FPS value.
// Perf Lab sets: window.__DG_FPS_TEST_OVERRIDE = 5/10/15/...
function __dgGetFpsDriveOverride() {
  try {
    const v = (typeof window !== 'undefined') ? Number(window.__DG_FPS_TEST_OVERRIDE || 0) : 0;
    return (Number.isFinite(v) && v > 0) ? v : 0;
  } catch {
    return 0;
  }
}

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

// NOTE: DrawGrid has to be multi-instance safe. Do NOT store per-toy sizing state at module scope.
// These are now declared per-instance inside createDrawGrid().

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
let __dgLastZoomCommitTs = 0;
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
  let __dgDrawingActive = false;
  let paintDpr = __dgCapDprForBackingStore(
    0,
    0,
    Math.max(1, Math.min((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1, 3)),
    null
  );
  let cssW = 0, cssH = 0, cw = 0, ch = 0, topPad = 0;
  let layoutSizeDirty = true;
  // Cached layout size to avoid forced reflow from offsetWidth/clientWidth during rAF.
  // Updated by ResizeObserver; used by measureCSSSize(wrap).
  let __dgLayoutW = 0;
  let __dgLayoutH = 0;
  // Last known-good non-zero size (used to avoid transient 0s during refresh/boot).
  let __dgLayoutGoodW = 0;
  let __dgLayoutGoodH = 0;
  let __dgLayoutObs = null;
  let __dgLayoutObserverInstalled = false;
  // Per-instance (was module-level; caused cross-toy size/throttle leakage)
  let __dgFrameIdx = 0;
  let __dgLastResizeTargetW = 0;
  let __dgLastResizeTargetH = 0;
  let __dgLastResizeDpr = 0;
  let __dgLastResizeCssW = 0;
  let __dgLastResizeCssH = 0;
  let __dgCommitResizeCount = 0;
  let compositeSingleCanvas = () => {};
  let ensureBackVisualsFreshFromFront = () => {};
  let copyCanvas = () => {};
  let useBackBuffers = () => {};
  let useFrontBuffers = () => {};
  let getActiveFlashCanvas = () => null;
  let getActiveTutorialCanvas = () => null;
  let layout = () => {};
  let renderTutorialHighlight = () => {};
  let getTutorialHighlightMode = () => 'none';
  let updatePanelParticleState = () => null;
  let __dgParticleStateCache = { key: '', ts: 0, value: null, hadField: false };
  let clearDrawgridInternal = () => false;
  let applyInstrumentFromState = () => false;
  let captureState = () => ({ steps: cols | 0, autotune: !!autoTune });
  let restoreFromState = () => {};
  let cancelPostRestoreStabilize = () => {};
  let schedulePostRestoreStabilize = () => {};
  let setState = () => {};
  let clearAndRedrawFromStrokes = () => {};
  let drawIntoBackOnly = () => {};
  let drawFullStroke = () => {};
  let scheduleZoomRecompute = () => {};
  let handleZoom = () => {};
  let drawNodes = () => {};
  let drawGrid = () => {};
  let resetGridCache = () => {};
  let bumpNodesRev = () => {};
  let ensureSizeReady = () => false;
  let resizeSurfacesFor = () => {};
  let getLayoutSize = () => measureCSSSize(wrap);
  let markLayoutSizeDirty = () => { layoutSizeDirty = true; };
  let __installLayoutObserver = () => {};
  let __dgGetStableWrapSize = () => {
    if (__dgLayoutW > 0 && __dgLayoutH > 0) return { w: __dgLayoutW, h: __dgLayoutH };
    if (__dgLayoutGoodW > 0 && __dgLayoutGoodH > 0) return { w: __dgLayoutGoodW, h: __dgLayoutGoodH };
    return { w: 0, h: 0 };
  };
  let __dgGetLayoutGoodSize = () => {
    if (__dgLayoutGoodW > 0 && __dgLayoutGoodH > 0) return { w: __dgLayoutGoodW, h: __dgLayoutGoodH };
    return { w: 0, h: 0 };
  };
  let measureCSSSize = (el) => {
    if (!el) return { w: 0, h: 0 };
    if (el === wrap && __dgLayoutObs && (__dgLayoutW <= 0 || __dgLayoutH <= 0)) {
      const good = __dgGetLayoutGoodSize();
      if (good.w > 0 && good.h > 0) {
        dgRefreshTrace('size:wrap zero (RO pending) -> use good', { w: __dgLayoutW, h: __dgLayoutH, goodW: good.w, goodH: good.h });
        return good;
      }
      dgRefreshTrace('size:wrap zero (RO pending)', { w: __dgLayoutW, h: __dgLayoutH });
      return { w: 0, h: 0 };
    }
    if (el === wrap && __dgLayoutW > 0 && __dgLayoutH > 0) {
      return { w: __dgLayoutW, h: __dgLayoutH };
    }
    const w = el.offsetWidth || el.clientWidth || 0;
    const h = el.offsetHeight || el.clientHeight || 0;
    if (w > 0 && h > 0) return { w, h };
    dgRefreshTrace('size:zero (no layout size yet)', { role: el?.getAttribute?.('data-role') || null });
    return { w: 0, h: 0 };
  };
  let progressMeasureW = 0;
  let progressMeasureH = 0;
  let getGhostGuideAutoActive = () => false;
  let startGhostGuide = () => {};
  let stopGhostGuide = () => {};
  let startAutoGhostGuide = () => {};
  let stopAutoGhostGuide = () => {};
  let scheduleGhostIfEmpty = () => {};
  let runAutoGhostGuideSweep = () => {};
  let getGhostGuideRunning = () => false;
  let getGhostGuideAnimFrame = () => 0;
  let currentCols = 0;
  let nodeCoordsForHitTest = [];        // For draggable nodes (hit tests, drags)
  let dgViewport = null;
  let dgMap = null;
  let dgField = null;
  let backCtx = null;
  let headerSweepDirX = 1;
  const hydrationState = { retryRaf: 0, retryCount: 0 };
  const particleState = { field: null };
  // Quality tier plumbing (budget manager comes later).
  const dgQuality = createDgQuality({
    panel,
    nowMs: () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()),
  });
  try {
    // Debug hook: window.__DG_SET_TIER(panelElOrId, tier)
    panel.__dgSetQualityTier = (tier, reason = 'manual') => dgQuality.setTier(tier, reason);
  } catch {}
  // Draw helpers -----------------------------------------------------------
  // We sometimes run with paintDpr < 1 (pressure/adaptive DPR). In that mode,
  // canvases are allocated at cssW*paintDpr but MUST still be drawn in CSS-pixel
  // logical space. If we draw assuming device DPR, overlays will appear shrunk
  // and offset toward the top-left (repro: notes/connectors/column text drift).
  function __dgWithLogicalSpace(ctx, fn) {
    // Guard against accidental nesting.
    // Some call paths already wrap in logical-space (R.withLogicalSpace or another
    // __dgWithLogicalSpace). A second scale application will make overlays appear
    // too small/large, especially when paintDpr < 1 under zoom/pressure.
    if (ctx && ctx.__dgLogicalSpaceActive) {
      fn();
      return;
    }

    // IMPORTANT:
    // Use the *canvas's actual* backing-store DPR (canvas.width / CSS width), not just paintDpr.
    // During zoom/refresh, some layers (notably nodes/connectors/labels) can temporarily drift out
    // of sync and appear scaled smaller/larger than other layers. This keeps logical space correct
    // per-layer.
    // NOTE: use typeof guard so this helper is safe even if paintDpr is not in scope
    // (e.g. if refactors accidentally lift this helper to module scope).
    const fallback =
      (typeof paintDpr !== 'undefined' && Number.isFinite(paintDpr) && paintDpr > 0)
        ? paintDpr
        : 1;
    const dpr = __dgGetCanvasDprFromCss(ctx?.canvas, cssW, fallback);

    // Non-spammy: log only when the logical-space DPR for a given role changes.
    try {
      if (typeof window !== 'undefined' && window.__DG_CANVAS_SCALE_TRACE) {
        const role = ctx?.canvas?.getAttribute?.('data-role') || 'unknown';
        const key = `LS:${role}`;
        const cwLocal = ctx?.canvas?.width || 0;
        const sig = `${Math.round(dpr * 1000)}|${Math.round(fallback * 1000)}|${Math.round((cssW || 0) * 10)}|${cwLocal}`;
        if (!__dgScaleSigMap) __dgScaleSigMap = new Map();
        const prev = __dgScaleSigMap.get(key);
        if (prev !== sig) {
          __dgScaleSigMap.set(key, sig);
          let debugSizing = null;
          try {
            const canvas = ctx?.canvas;
            if (canvas) {
              const styleW = canvas?.style?.width || null;
              const styleH = canvas?.style?.height || null;
              const clientW = canvas?.clientWidth || 0;
              const clientH = canvas?.clientHeight || 0;
              const rect = canvas?.getBoundingClientRect?.();
              const rectW = rect ? rect.width : null;
              const rectH = rect ? rect.height : null;
              debugSizing = {
                cssWState: Number.isFinite(cssW) ? cssW : null,
                cssHState: Number.isFinite(cssH) ? cssH : null,
                tsmCssW: Number.isFinite(canvas?.__tsmCssW) ? canvas.__tsmCssW : null,
                tsmCssH: Number.isFinite(canvas?.__tsmCssH) ? canvas.__tsmCssH : null,
                dgCssW: Number.isFinite(canvas?.__dgCssW) ? canvas.__dgCssW : null,
                dgCssH: Number.isFinite(canvas?.__dgCssH) ? canvas.__dgCssH : null,
                styleW,
                styleH,
                clientW,
                clientH,
                rectW,
                rectH,
                boardScale: Number.isFinite(boardScale) ? +boardScale.toFixed(3) : null,
                panelId: panel?.id || null,
              };
            }
          } catch {}
          try {
            dgCanvasScaleTrace('logicalSpaceDpr', { role, dpr, paintDpr: fallback, cssW, canvasW: cwLocal, debugSizing });
          } catch {
            console.log('[DG][scale] logicalSpaceDpr', { role, dpr, paintDpr: fallback, cssW, canvasW: cwLocal, debugSizing });
          }
        }
      }
    } catch {}

    try { if (ctx) ctx.__dgLogicalSpaceActive = true; } catch {}
    ctx.save();
    // Reset to a known transform; callers typically called R.resetCtx(ctx) already.
    // setTransform avoids compounding transforms if something slipped through.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    try {
      fn();
    } finally {
      ctx.restore();
      try { if (ctx) ctx.__dgLogicalSpaceActive = false; } catch {}
    }
  }
  // Warm-start particles for both restored + newly created toys.
  // This avoids the "restored toys start empty" vs "new toys start full" mismatch,
  // and makes quality-level transitions easier to visually verify.
    try {
      const nowTs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
    // Unconditionally re-arm on boot (a refresh is effectively a new session).
    panel.__dgParticlesWarmStartUntil = nowTs + 1200;
    dgParticleBootLog('warm-start:arm', {
      panelId: panel?.id || null,
      until: panel.__dgParticlesWarmStartUntil,
    });
    } catch {}
  if (DG_DEBUG) console.log('[DG] instance sizing locals init', panel.id, {
    __dgLastResizeTargetW, __dgLastResizeTargetH, __dgLastResizeDpr
  });
  // Visibility + LOD state
  let isPanelVisible = true;          // IntersectionObserver will keep this updated
  // Visibility classification for the Focus/Budget system.
  // OFFSCREEN: ratio<=0 (or not intersecting)
  // NEARSCREEN: intersecting but below DG_VISIBILITY_THRESHOLD
  // ONSCREEN: intersecting and ratio>=DG_VISIBILITY_THRESHOLD
  let __dgVisibilityState = 'ONSCREEN';
  let __dgLastIntersectionRatio = 1;
  // Internal: used to avoid spamming composites on tiny scroll jitter.
  let __dgNearscreenWarmDone = false;
  function __dgSetVisibilityState(state, ratio) {
    __dgVisibilityState = state;
    __dgLastIntersectionRatio = Number.isFinite(ratio) ? ratio : __dgLastIntersectionRatio;
    try { panel.__dgVisibilityState = state; } catch {}
    try { panel.__dgIntersectionRatio = __dgLastIntersectionRatio; } catch {}
  }
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

  // IMPORTANT: DrawGrid manages multiple canvases with a custom backing-store DPR policy.
  // Opt this panel (and its canvases) out of the generic auto-DPR managers.
  try { panel.dataset.toySurfaceManaged = '1'; } catch {}

  // === Generic surface manager (DrawGrid is the first adopter) ===
  const dgSurfaces = (() => {
    try {
      return createToySurfaceManager({
        panel,
        body,
        getBoardScale: () => {
          try { return boardScaleHelper(panel) || 1; } catch { return 1; }
        },
        tag: 'drawgrid',
      });
    } catch (e) {
      try { console.warn('[DG] createToySurfaceManager failed', e); } catch {}
      return null;
    }
  })();

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
  // Core stroke state must exist before persistence hooks (used by dgPersist).
  let cur = null;
  let strokes = []; // Store all completed stroke objects
  let __dgPaintRev = 0;
  function markPaintDirty() {
    __dgPaintRev = (__dgPaintRev + 1) | 0;
  }
  let __dgSkipPaintSnapshotCount = 0;
  let regenerateMapFromStrokes = () => {};
  let lastCommittedScale = 1;
  let setDrawingState = () => {};
  let hasOverlayStrokesCached = () => false;
  let spawnNoteRingEffect = () => {};
  let spawnNoteBurst = () => {};
  let flashes = new Float32Array(0);
  let __dgHadNodeFlash = false;
  let manualOverrides = [];
  let persistentDisabled = [];
  let nextDrawTarget = null;
  let pendingNodeTap = null;
  let draggedNode = null;
  let dragScaleHighlightCol = null;
  let previewGid = null;
  let autoTune = true;
  let pendingActiveMask = null;
  let nodeGroupMap = [];
  let playheadCol = -1;
  let localLastPhase = 0;
  const SAFE_AREA_FRACTION = 0.05;
  let drawing = false;
  setDrawingState = (state) => {
    drawing = !!state;
    __dgDrawingActive = !!state;
  };
  setDrawingState(false);
  let __dgOverlayStrokeCache = { value: false, len: 0, ts: 0 };
  let __dgOverlayStrokeListCache = { paintRev: -1, len: 0, special: [], colorized: [] };
  hasOverlayStrokesCached = function hasOverlayStrokesCached() {
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
  };
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
  let prevStrokeCount = Array.isArray(strokes) ? strokes.length : 0;

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
  // IMPORTANT: do not overwrite runtime perf toggles.
  // PerfLab (and manual console tests) need to be able to set this BEFORE a toy is created.
  try { if (typeof window !== 'undefined') window.__DG_SINGLE_CANVAS ??= true; } catch {}
  const DG_SINGLE_CANVAS = !!(typeof window !== 'undefined' && window.__DG_SINGLE_CANVAS);
  try { if (typeof window !== 'undefined') window.__DG_SINGLE_CANVAS = DG_SINGLE_CANVAS; } catch {}
  try {
    if (typeof window !== 'undefined' && window.__DG_PLAYHEAD_SEPARATE_CANVAS === undefined) {
      // Perf default: keep playhead on its own canvas to reduce full-panel invalidation during pan/zoom.
      window.__DG_PLAYHEAD_SEPARATE_CANVAS = true;
    }
  } catch {}
  const DG_COMBINE_GRID_NODES = false;
  // TODO: consider single-canvas draw order (grid/nodes/overlays) after merge validation.
  const particleCanvas = document.createElement('canvas');
  particleCanvas.className = 'toy-particles';
  particleCanvas.setAttribute('data-role', 'drawgrid-particles');
  try { particleCanvas.dataset.skipAutoDpr = '1'; } catch {}
  try { dgSurfaces?.registerCanvas?.('particles', particleCanvas, { policy: 'css' }); } catch {}
  const grid = document.createElement('canvas');
  grid.classList.add('toy-canvas');
  grid.setAttribute('data-role','drawgrid-grid');
  try { grid.dataset.skipAutoDpr = '1'; } catch {}
  try { dgSurfaces?.registerCanvas?.('grid', grid, { policy: 'managed' }); } catch {}
  const paint = document.createElement('canvas');
  paint.classList.add('toy-canvas');
  paint.setAttribute('data-role','drawgrid-paint');
  try { paint.dataset.skipAutoDpr = '1'; } catch {}
  try { dgSurfaces?.registerCanvas?.('paint', paint, { policy: 'managed' }); } catch {}
  const nodesCanvas = DG_COMBINE_GRID_NODES ? grid : document.createElement('canvas');
  if (!DG_COMBINE_GRID_NODES) {
    nodesCanvas.classList.add('toy-canvas');
    nodesCanvas.setAttribute('data-role', 'drawgrid-nodes');
    try { nodesCanvas.dataset.skipAutoDpr = '1'; } catch {}
    try { dgSurfaces?.registerCanvas?.('nodes', nodesCanvas, { policy: 'managed' }); } catch {}
  }
  const flashCanvas = document.createElement('canvas');
  flashCanvas.classList.add('toy-canvas');
  flashCanvas.setAttribute('data-role', 'drawgrid-flash');
  try { flashCanvas.dataset.skipAutoDpr = '1'; } catch {}
  try { dgSurfaces?.registerCanvas?.('flash', flashCanvas, { policy: 'managed' }); } catch {}
  const ghostCanvas = document.createElement('canvas');
  ghostCanvas.classList.add('toy-canvas');
  ghostCanvas.setAttribute('data-role','drawgrid-ghost');
  try { ghostCanvas.dataset.skipAutoDpr = '1'; } catch {}
  try { dgSurfaces?.registerCanvas?.('ghost', ghostCanvas, { policy: 'managed' }); } catch {}
  const tutorialCanvas = document.createElement('canvas');
  tutorialCanvas.classList.add('toy-canvas');
  tutorialCanvas.setAttribute('data-role', 'drawgrid-tutorial-highlight');
  try { tutorialCanvas.dataset.skipAutoDpr = '1'; } catch {}
  try { dgSurfaces?.registerCanvas?.('tutorial', tutorialCanvas, { policy: 'managed' }); } catch {}
  const playheadCanvas = document.createElement('canvas');
  playheadCanvas.classList.add('toy-canvas');
  playheadCanvas.setAttribute('data-role', 'drawgrid-playhead');
  try { playheadCanvas.dataset.skipAutoDpr = '1'; } catch {}
  try { dgSurfaces?.registerCanvas?.('playhead', playheadCanvas, { policy: 'managed' }); } catch {}
  // ------------------------------------------------------------
  // DEBUG: dump canvas scale / DPR state for this DrawGrid instance
  // Usage:
  //   window.__DG_DUMP_CANVAS_SCALES()             // dumps this instance (most recent)
  //   window.__DG_DUMP_CANVAS_SCALES(panel.id)    // dumps only if id matches
  // ------------------------------------------------------------
  try {
    if (typeof window !== 'undefined') {
      window.__DG_DUMP_CANVAS_SCALES = (wantPanelId) => {
        try {
          if (wantPanelId && wantPanelId !== panel?.id) return;
          const dump = (name, canvas) => {
            if (!canvas) return { name, missing: true };
            const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
            const styleW = canvas.style?.width || null;
            const styleH = canvas.style?.height || null;
            const cachedW = Number.isFinite(canvas.__dgCssW) ? canvas.__dgCssW : null;
            const cachedH = Number.isFinite(canvas.__dgCssH) ? canvas.__dgCssH : null;
            const cssW = rect ? rect.width : null;
            const cssH = rect ? rect.height : null;
            const bw = canvas.width || 0;
            const bh = canvas.height || 0;
            return {
              name,
              cssW: cssW != null ? Math.round(cssW) : null,
              cssH: cssH != null ? Math.round(cssH) : null,
              styleW,
              styleH,
              cachedW,
              cachedH,
              display: canvas.style?.display || null,
              backingW: bw || null,
              backingH: bh || null,
              dprX: (cssW && cssW > 0) ? +(bw / cssW).toFixed(3) : null,
              dprY: (cssH && cssH > 0) ? +(bh / cssH).toFixed(3) : null,
            };
          };

          console.group('[DG][DUMP][CANVAS_SCALES]', panel?.id || '');
          // Be defensive: different refactors have used different local names.
          // Never reference an undeclared identifier directly (would throw ReferenceError).
          const __paintCanvasForDump =
            (typeof paint !== 'undefined' && paint) ? paint :
            (typeof paintCanvas !== 'undefined' && paintCanvas) ? paintCanvas :
            (typeof paintEl !== 'undefined' && paintEl) ? paintEl :
            null;
          console.table([
            dump('paint', __paintCanvasForDump),
            dump('grid', grid),
            dump('nodes', nodesCanvas),
            dump('ghost', ghostCanvas),
            dump('flash', flashCanvas),
            dump('playhead', playheadCanvas),
            dump('tutorial', tutorialCanvas),
          ]);
          try { console.log('paintDpr', paintDpr, 'usingBackBuffers', usingBackBuffers); } catch {}
          try { console.log('gridArea', gridArea); } catch {}
          console.groupEnd();
        } catch (e) {
          console.warn('[DG][DUMP] failed', e);
        }
      };
      window.__DG_CHECK_LAYER_SIZES = (wantPanelId, opts = {}) => {
        if (wantPanelId && wantPanelId !== panel?.id) return null;
        return __dgGetLayerSizingSnapshot();
      };
      window.__DG_ENSURE_LAYER_SIZES = (wantPanelId, opts = {}) => {
        if (wantPanelId && wantPanelId !== panel?.id) return null;
        return __dgEnsureLayerSizes('manual', { force: true, log: true, ...opts });
      };
    }
  } catch {}
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

  // ---------------------------------------------------------------------------
  // Debug readout: show which FPS/quality degradations are currently active.
  // Toggle with: window.__DG_STATE_READOUT = true/false
  // ---------------------------------------------------------------------------
  __dgInstallStateSnapshotGlobals();
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
  Object.assign(playheadCanvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'block',
    zIndex: 7,
    pointerEvents: 'none',
    willChange: 'transform, opacity',
    contain: 'paint',
  });
  playheadCanvas.style.background = 'transparent';

  // IMPORTANT:
  // Do NOT append canvases directly to `body` here.
  // We mount canvases ONLY after `wrap` + `layersRoot` exist (stable DOM hierarchy),
  // using the deterministic ordered list below.
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

  // --- Stable body layout (IDEMPOTENT) --------------------------------------
  // Refresh/re-init MUST NOT create nested wraps or leave old canvases visible.
  // Reuse a single wrapper + roots, and mount canvases deterministically.
  let wrap = body.querySelector(':scope > .drawgrid-size-wrap');
  const isNewWrap = !wrap;
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'drawgrid-size-wrap';
    body.appendChild(wrap);
  }
  wrap.style.position = 'relative';
  wrap.style.width = '100%';
  wrap.style.height = '100%';
  wrap.style.overflow = 'hidden';
  wrap.style.background = drawToyBg;

  // If we just created the wrap, migrate existing body children into it.
  // (If wrap already existed, DO NOTHING — avoids reparent loops on refresh.)
  if (isNewWrap) {
    [...body.childNodes].forEach((node) => {
      if (node === wrap) return;
      try { wrap.appendChild(node); } catch {}
    });
  }

  // Dedicated roots inside wrap.
  let layersRoot = wrap.querySelector(':scope > .drawgrid-layers-root');
  if (!layersRoot) {
    layersRoot = document.createElement('div');
    layersRoot.className = 'drawgrid-layers-root';
    wrap.insertBefore(layersRoot, wrap.firstChild);
  }
  layersRoot.style.position = 'absolute';
  layersRoot.style.inset = '0';
  layersRoot.style.width = '100%';
  layersRoot.style.height = '100%';
  layersRoot.style.pointerEvents = 'auto';
  layersRoot.style.zIndex = '0';

  let overlaysRoot = wrap.querySelector(':scope > .drawgrid-overlays-root');
  if (!overlaysRoot) {
    overlaysRoot = document.createElement('div');
    overlaysRoot.className = 'drawgrid-overlays-root';
    wrap.appendChild(overlaysRoot);
  }
  overlaysRoot.style.position = 'absolute';
  overlaysRoot.style.inset = '0';
  overlaysRoot.style.width = '100%';
  overlaysRoot.style.height = '100%';
  overlaysRoot.style.zIndex = '50';
  overlaysRoot.style.pointerEvents = 'none';

  // Safety: if any canvases ended up as direct children of wrap, move them into layersRoot.
  try {
    const directCanvasChildren = [...wrap.querySelectorAll(':scope > canvas')];
    for (const c of directCanvasChildren) {
      try { layersRoot.appendChild(c); } catch {}
    }
  } catch {}

  // Deterministic mount order: ensures exactly one visible stack.
  const __dgOrderedCanvases = [
    particleCanvas,
    grid,
    ...(DG_COMBINE_GRID_NODES ? [] : [nodesCanvas]),
    paint,
    ghostCanvas,
    flashCanvas,
    tutorialCanvas,
    playheadCanvas,
  ].filter(Boolean);
  for (const c of __dgOrderedCanvases) {
    try { layersRoot.appendChild(c); } catch {}
  }

  // PRUNE: remove any stale drawgrid canvases left behind from a previous init.
  // This prevents duplicated strokes/ghosts after refresh at mismatched zoom/DPR.
  try {
    const keep = new Set(__dgOrderedCanvases);
    const all = [...layersRoot.querySelectorAll('canvas')];
    for (const cv of all) {
      if (keep.has(cv)) continue;
      const role = cv.getAttribute ? cv.getAttribute('data-role') : null;
      const cls = (cv.className || '');
      const looksLikeDrawgrid =
        (typeof role === 'string' && role.startsWith('drawgrid-')) ||
        (typeof cls === 'string' && cls.indexOf('drawgrid') >= 0);
      if (looksLikeDrawgrid) {
        try { cv.remove(); } catch {}
      }
    }
  } catch {}

  // Pointer routing: only the paint canvas should receive pointer input.
  try {
    const nonInteractive = [particleCanvas, grid, nodesCanvas, ghostCanvas, flashCanvas, tutorialCanvas, playheadCanvas].filter(Boolean);
    for (const c of nonInteractive) {
      if (c && c.style) c.style.pointerEvents = 'none';
    }
    if (paint && paint.style) {
      paint.style.pointerEvents = 'auto';
      paint.style.touchAction = 'none';
    }
  } catch {}

  // Optional: expose for debugging/inspection
  try {
    panel.__dgWrap = wrap;
    panel.__dgLayersRoot = layersRoot;
    panel.__dgOverlaysRoot = overlaysRoot;
    panel.__dgMount = { wrap, layersRoot, overlaysRoot };
  } catch {}

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
    // Mount under overlaysRoot so the label is a true overlay (never a layout participant)
    // and stays consistent across refresh + zoom.
    { wrap, grid, mountRoot: overlaysRoot }
  );
  const {
    updateDrawLabel,
    fadeOutDrawLabel,
    knockLettersAt,
    ensureLetterPhysicsLoop,
    getDrawLabelYRange,
  } = drawLabelState;

  const __dgGetDrawLabelYRange = () => getDrawLabelYRange?.();
  const __dgComputeGhostSweepLR = () => computeGhostSweepLR({
    gridArea,
    rows,
    getDrawLabelYRange: __dgGetDrawLabelYRange,
  });
  try { if (typeof window !== 'undefined') window.__DG_COMPUTE_GHOST_SWEEP_LR = __dgComputeGhostSweepLR; } catch {}

  function getToyLogicalSize() {
    // IMPORTANT: avoid clientWidth/clientHeight reads in hot/boot paths; they can
    // reflect transient zoom/transform states right after refresh.
    const s = __dgGetStableWrapSize();
    return { w: s.w, h: s.h };
  }

  function getToyCssSizeForParticles() {
    // Keep particles on the same size basis as everything else.
    const s = __dgGetStableWrapSize();
    return { w: s.w, h: s.h };
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
  // Last-known-good grid sizing. Used to avoid "not ready" churn during transient layout hiccups.
  // This is NOT a startup hack; it only kicks in when we previously had a valid grid and then
  // briefly measure invalid sizes (0/1px, etc.) mid-run.
  let __dgLastGoodGridArea = null;
  let __dgLastGoodCw = 0;
  let __dgLastGoodCh = 0;
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
    getQualityProfile: (opts = {}) => dgQuality.getProfile(opts),
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
    get cssW() { return cssW; },
    get cssH() { return cssH; },
    get paintDpr() { return paintDpr; },
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
  if (backCanvas.style) backCanvas.style.pointerEvents = 'none';
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
  const dgGhostLayer = createDgGhostLayer({
    getPanel: () => panel,
    getUsingBackBuffers: () => usingBackBuffers,
    getGhostCtx: () => ghostCtx,
    getGhostFrontCtx: () => ghostFrontCtx,
    getGhostBackCtx: () => ghostBackCtx,
    getGhostCanvas: () => ghostCanvas,
    getGhostBackCanvas: () => ghostBackCanvas,
    markOverlayDirty: __dgMarkOverlayDirty,
    markSingleCanvasOverlayDirty: __dgMarkSingleCanvasOverlayDirty,
    dgGhostTrace,
    __dgGhostMaybeStack,
    R,
  });
  const markGhostLayerActive = dgGhostLayer.markGhostLayerActive;
  const markGhostLayerCleared = dgGhostLayer.markGhostLayerCleared;
  const syncGhostBackToFront = dgGhostLayer.syncGhostBackToFront;
  const getActiveGhostCanvas = dgGhostLayer.getActiveGhostCanvas;
  const resetGhostCtx = dgGhostLayer.resetGhostCtx;

  panel.__dgGhostLayerEmpty = true;
  panel.__dgTutorialLayerEmpty = true;
  panel.__dgPlayheadLayerEmpty = true;

  // Keep flash overlay alive briefly after the last write.
  // Without this, the generic overlay-clear path will wipe transient trails
  // (e.g. draw/ghost trails) immediately on pointer-up or shortly after boot.
  const __DG_FLASH_KEEPALIVE_MS = (typeof window !== 'undefined' && Number.isFinite(window.__DG_FLASH_KEEPALIVE_MS))
    ? window.__DG_FLASH_KEEPALIVE_MS
    : 650;

  const markFlashLayerActive = () => {
    panel.__dgFlashLayerEmpty = false;
    try {
      const nowTs = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
      panel.__dgFlashActiveUntil = nowTs + __DG_FLASH_KEEPALIVE_MS;
    } catch {}
    __dgMarkOverlayDirty(panel);
    __dgMarkSingleCanvasOverlayDirty(panel);
  };
  const markFlashLayerCleared = () => {
    panel.__dgFlashLayerEmpty = true;
    try { panel.__dgFlashActiveUntil = 0; } catch {}
    __dgMarkOverlayDirty(panel);
    __dgMarkSingleCanvasOverlayDirty(panel);
  };
  const markTutorialLayerActive = () => { panel.__dgTutorialLayerEmpty = false; __dgMarkOverlayDirty(panel); __dgMarkSingleCanvasOverlayDirty(panel); };
  const markTutorialLayerCleared = () => { panel.__dgTutorialLayerEmpty = true; __dgMarkOverlayDirty(panel); __dgMarkSingleCanvasOverlayDirty(panel); };
  const markPlayheadLayerActive = () => { panel.__dgPlayheadLayerEmpty = false; __dgMarkOverlayDirty(panel); __dgMarkSingleCanvasOverlayDirty(panel); };
  const markPlayheadLayerCleared = () => { panel.__dgPlayheadLayerEmpty = true; __dgMarkOverlayDirty(panel); __dgMarkSingleCanvasOverlayDirty(panel); };

  const noteEffects = createDgNoteEffects({
    state: {
      get panel() { return panel; },
      get gridArea() { return gridArea; },
      get cols() { return cols; },
      get rows() { return rows; },
      get cw() { return cw; },
      get ch() { return ch; },
      get topPad() { return topPad; },
      get fctx() { return fctx; },
      get __dgLowFpsMode() { return __dgLowFpsMode; },
      DG_PLAYHEAD_FPS_SIMPLE_ENTER,
    },
    deps: {
      R,
      __dgWithLogicalSpace,
      __dgWithLogicalSpaceDpr,
      __dgGetCanvasDprFromCss,
      markFlashLayerActive,
      markFlashLayerCleared,
      markOverlayDirty: () => __dgMarkOverlayDirty(panel),
    },
  });
  spawnNoteRingEffect = noteEffects.spawnNoteRingEffect;
  spawnNoteBurst = noteEffects.spawnNoteBurst;

  const dgGhostGuide = createDgGhostGuide({
    panel,
    body,
    layersRoot,
    frontCanvas,
    getLayoutSize,
    layout: (...args) => layout(...args),
    isPanelCulled: () => !isPanelVisible,
    getGridArea: () => gridArea,
    getGridAreaLogical: () => gridAreaLogical,
    getRows: () => rows,
    getCssW: () => cssW,
    getCssH: () => cssH,
    getPaintDpr: () => paintDpr,
    getUsingBackBuffers: () => usingBackBuffers,
    getActiveGhostCanvas,
    getGhostCtx: () => ghostCtx,
    getGhostFrontCtx: () => ghostFrontCtx,
    getGhostBackCtx: () => ghostBackCtx,
    markGhostLayerActive,
    markGhostLayerCleared,
    dgGhostTrace,
    __dgGhostMaybeStack,
    __dgGetCanvasDprFromCss,
    __dgWithLogicalSpaceDpr,
    __dgDescribeCanvasScale,
    __dgGetDrawLabelYRange,
    __dgComputeGhostSweepLR,
    getOverlayZoomSnapshot,
    R,
    DG_GHOST_DEBUG,
    DG_KNOCK,
    FF,
    dgRenderScaleTrace,
    drawgridLog,
    __dgLogFirstPoke,
    knockLettersAt,
    getLoopInfo,
    syncLetterFade,
    updateDrawLabel,
    __dgElSummary,
    __auditZoomSizes,
    getIsRestoring: () => isRestoring,
    getStrokes: () => strokes,
    getCurrentMap: () => currentMap,
    setLocalLastPhase: (v) => { localLastPhase = v; },
    pulseField: (v) => { try { dgField?.pulse?.(v); } catch {} },
  });
  getGhostGuideAutoActive = () => dgGhostGuide.ghostGuideAutoActive;
  getGhostGuideRunning = () => dgGhostGuide.ghostGuideRunning;
  getGhostGuideAnimFrame = () => dgGhostGuide.ghostGuideAnimFrame;
  startGhostGuide = dgGhostGuide.startGhostGuide;
  stopGhostGuide = dgGhostGuide.stopGhostGuide;
  startAutoGhostGuide = dgGhostGuide.startAutoGhostGuide;
  stopAutoGhostGuide = dgGhostGuide.stopAutoGhostGuide;
  scheduleGhostIfEmpty = dgGhostGuide.scheduleGhostIfEmpty;
  runAutoGhostGuideSweep = dgGhostGuide.runAutoGhostGuideSweep;
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
    // Default to separating the playhead canvas (perf lever), but allow explicit override.
    // - If user sets window.__DG_PLAYHEAD_SEPARATE_CANVAS = true/false, respect it.
    // - Otherwise default to true.
    const separatePlayhead = (typeof window !== 'undefined' && (window.__DG_PLAYHEAD_SEPARATE_CANVAS === true || window.__DG_PLAYHEAD_SEPARATE_CANVAS === false))
      ? !!window.__DG_PLAYHEAD_SEPARATE_CANVAS
      : true;
    const transportRunning = (typeof isRunning === 'function') && isRunning();
    const lastTransportRunning = !!panel.__dgLastTransportRunning;
    const ghostEmpty = !!panel.__dgGhostLayerEmpty;
    const flashEmpty = !!panel.__dgFlashLayerEmpty;
    const tutorialEmpty = !!panel.__dgTutorialLayerEmpty;
    const modeKey = `${flat ? 1 : 0}-${DG_SINGLE_CANVAS ? 1 : 0}-${DG_SINGLE_CANVAS_OVERLAYS ? 1 : 0}-${separatePlayhead ? 1 : 0}-${transportRunning ? 1 : 0}-${ghostEmpty ? 1 : 0}-${flashEmpty ? 1 : 0}-${tutorialEmpty ? 1 : 0}`;
    if (panel.__dgFlatLayerMode === modeKey) return;
    panel.__dgFlatLayerMode = modeKey;
    // If transport just stopped, clear any lingering playhead so it doesn't "stick"
    // when resuming (especially after zoom/throttle skips).
    if (!transportRunning && lastTransportRunning) {
      try {
        panel.__dgPlayheadLastX = null;
        panel.__dgPlayheadLayer = null;
        panel.__dgPlayheadLastGridArea = null;
        if (playheadFrontCtx?.canvas && playheadCanvas?.width && playheadCanvas?.height) {
          R.resetCtx(playheadFrontCtx);
          R.withDeviceSpace(playheadFrontCtx, () => {
            playheadFrontCtx.clearRect(0, 0, playheadCanvas.width, playheadCanvas.height);
          });
          markPlayheadLayerCleared();
        }
      } catch {}
    }
    panel.__dgLastTransportRunning = transportRunning;
    const toggle = (el, visible) => {
      if (!el || !el.style) return;
      el.style.display = visible ? 'block' : 'none';
      // IMPORTANT: if we hide via opacity, we must restore it when showing,
      // otherwise canvases can get stuck invisible.
      if (!visible) el.style.opacity = '0';
      else el.style.opacity = '';
    };
    const showGrid = !flat && !DG_SINGLE_CANVAS;
    const showOverlayBase = !flat && (!DG_SINGLE_CANVAS || DG_SINGLE_CANVAS_OVERLAYS);
    // Hide overlay canvases when they're empty to reduce compositor/layer work.
    // (These flags are maintained by mark*LayerActive/Cleared.)
    const showGhost = showOverlayBase && !panel.__dgGhostLayerEmpty;
    const showFlash = showOverlayBase && !panel.__dgFlashLayerEmpty;
    const showTutorial = !flat && !panel.__dgTutorialLayerEmpty;
    // Playhead should follow transport running state, not note/chain flags.
    // (If we gate this, it's easy to end up with a permanently hidden playhead.)
    const showPlayhead = !flat && separatePlayhead && transportRunning && (!DG_SINGLE_CANVAS || DG_SINGLE_CANVAS_OVERLAYS);
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
      toggle(playheadCanvas, DG_SINGLE_CANVAS_OVERLAYS && separatePlayhead && transportRunning);
    }
    try { __dgEnsureLayerSizes('flat-layer-visibility'); } catch {}
  }

  const tutorialFrontCtx = tutorialCanvas.getContext('2d');
  const tutorialBackCanvas = document.createElement('canvas');
  const tutorialBackCtx = tutorialBackCanvas.getContext('2d');

  const __dgGetCanvasEl = (item) => (item && item.canvas) ? item.canvas : item;
  const __dgListAllLayerRefs = () => ([
    frontCanvas,
    backCanvas,
    grid,
    gridFrontCtx,
    gridBackCanvas,
    paint,
    nodesFrontCtx,
    nodesCanvas,
    nodesBackCanvas,
    flashFrontCtx,
    flashCanvas,
    flashBackCanvas,
    ghostFrontCtx,
    ghostCanvas,
    ghostBackCanvas,
    tutorialFrontCtx,
    tutorialCanvas,
    tutorialBackCanvas,
    playheadCanvas,
    particleCanvas,
  ].filter(Boolean));
  const __dgListAllLayerEls = () => {
    const out = [];
    const seen = new Set();
    for (const ref of __dgListAllLayerRefs()) {
      const el = __dgGetCanvasEl(ref);
      if (!el || !el.style) continue;
      if (seen.has(el)) continue;
      seen.add(el);
      out.push(el);
    }
    return out;
  };
  const __dgListManagedBackingEls = () => {
    const out = [];
    const seen = new Set();
    for (const ref of __dgListAllLayerRefs()) {
      const el = __dgGetCanvasEl(ref);
      if (!el || !el.style) continue;
      if (el === particleCanvas) continue; // field-generic owns its backing store
      if (seen.has(el)) continue;
      seen.add(el);
      out.push(el);
    }
    return out;
  };
  const __dgExpectedLayerSizing = () => {
    const w = Number.isFinite(cssW) ? cssW : null;
    const h = Number.isFinite(cssH) ? cssH : null;
    const dpr = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
    if (!w || !h) return null;
    return {
      cssW: w,
      cssH: h,
      pxW: Math.max(1, Math.round(w * dpr)),
      pxH: Math.max(1, Math.round(h * dpr)),
      dpr,
    };
  };
  const __dgGetLayerSizingSnapshot = () => {
    const expected = __dgExpectedLayerSizing();
    if (!expected) return null;
    const rows = [];
    for (const el of __dgListAllLayerEls()) {
      const role = el.getAttribute?.('data-role') || el.className || 'canvas';
      const styleW = (el.style && el.style.width) ? String(el.style.width) : '';
      const styleH = (el.style && el.style.height) ? String(el.style.height) : '';
      const styleWpx = styleW.endsWith('px') ? parseFloat(styleW) : null;
      const styleHpx = styleH.endsWith('px') ? parseFloat(styleH) : null;
      const cachedW = Number.isFinite(el.__dgCssW) ? el.__dgCssW : null;
      const cachedH = Number.isFinite(el.__dgCssH) ? el.__dgCssH : null;
      const wantsBacking = (el !== particleCanvas);
      const bw = Number.isFinite(el.width) ? el.width : null;
      const bh = Number.isFinite(el.height) ? el.height : null;
      const cssWNow = cachedW ?? styleWpx;
      const cssHNow = cachedH ?? styleHpx;
      const cssMismatch = (cssWNow != null && Math.abs(cssWNow - expected.cssW) > 1) ||
        (cssHNow != null && Math.abs(cssHNow - expected.cssH) > 1);
      const backingMismatch = wantsBacking && (
        (bw != null && bw !== expected.pxW) || (bh != null && bh !== expected.pxH)
      );
      rows.push({
        role,
        display: el.style?.display || '',
        cssW: cssWNow,
        cssH: cssHNow,
        styleW,
        styleH,
        backingW: bw,
        backingH: bh,
        wantsBacking,
        cssMismatch,
        backingMismatch,
      });
    }
    return { expected, rows };
  };
  const __dgEnsureLayerSizes = (reason, { force = false, log = false } = {}) => {
    const snap = __dgGetLayerSizingSnapshot();
    if (!snap) return null;
    const { expected, rows } = snap;
    let changed = false;
    const cssWpx = `${expected.cssW}px`;
    const cssHpx = `${expected.cssH}px`;
    for (const el of __dgListAllLayerEls()) {
      if (!el.style) continue;
      if (force || el.__dgCssW !== expected.cssW || el.__dgCssH !== expected.cssH ||
          el.style.width !== cssWpx || el.style.height !== cssHpx) {
        el.__dgCssW = expected.cssW;
        el.__dgCssH = expected.cssH;
        el.style.width = cssWpx;
        el.style.height = cssHpx;
        changed = true;
      }
    }
    for (const el of __dgListManagedBackingEls()) {
      if (!el) continue;
      if (force || el.width !== expected.pxW || el.height !== expected.pxH) {
        el.width = expected.pxW;
        el.height = expected.pxH;
        changed = true;
      }
    }
    if (log || (typeof window !== 'undefined' && window.__DG_LAYER_SIZE_TRACE)) {
      const mismatches = rows.filter(r => r.cssMismatch || r.backingMismatch);
      if (mismatches.length || log) {
        try {
          console.group('[DG][layer-size]', reason || 'sync');
          console.log('expected', expected, 'changed', changed);
          console.table(mismatches.length ? mismatches : rows);
          console.groupEnd();
        } catch {}
      }
    }
    return { expected, rows, changed };
  };
  updateFlatLayerVisibility();
  let tutorialCtx = tutorialFrontCtx;
  var dgSizeTraceCanLog = () => false;
  var dgSizeTrace = () => {};
  var dgSizeTraceCanvas = () => {};
  var dgEffectiveDprTrace = () => {};
  var dgRefreshTrace = () => {};
  // Tag back-buffer canvases so helpers can resolve the owning panel.
  try {
    gridBackCanvas.__dgPanel = panel;
    backCanvas.__dgPanel = panel;
    nodesBackCanvas.__dgPanel = panel;
    flashBackCanvas.__dgPanel = panel;
    ghostBackCanvas.__dgPanel = panel;
    tutorialBackCanvas.__dgPanel = panel;
  } catch {}

  initDgPaintTraceFlags();
  
  const { __dgPaintDebugLog } = createDgPaintDebug({
    getPanel: () => panel,
    getUsingBackBuffers: () => usingBackBuffers,
    getPaintDpr: () => paintDpr,
    getCssW: () => cssW,
    getCssH: () => cssH,
    getPctx: () => pctx,
    getFrontCanvas: () => frontCanvas,
    getBackCanvas: () => backCanvas,
    getFrontCtx: () => frontCtx,
    getBackCtx: () => backCtx,
    getActivePaintCanvas: () => (typeof getActivePaintCanvas === 'function' ? getActivePaintCanvas() : null),
    getGridArea: () => gridArea,
    getTopPad: () => topPad,
    __dgSampleAlpha,
  });

  const { dgPaintTrace } = createDgPaintTrace({
    __dgFlag,
    dgLogLine,
    getPanel: () => panel,
    getUsingBackBuffers: () => usingBackBuffers,
    getZoomGestureActive: () => zoomGestureActive,
    getZoomMode: () => zoomMode,
    getCssW: () => cssW,
    getCssH: () => cssH,
    getPaintDpr: () => paintDpr,
    getFrontCanvas: () => frontCanvas,
    getBackCanvas: () => backCanvas,
  });
  const dgRefreshDebug = createDgRefreshDebug({
    getPanel: () => panel,
    getCssW: () => cssW,
    getCssH: () => cssH,
    getPaintDpr: () => paintDpr,
    getFrontCanvas: () => frontCanvas,
    getBackCanvas: () => backCanvas,
    getPlayheadCanvas: () => playheadCanvas,
    getGridBackCanvas: () => gridBackCanvas,
    getNodesBackCanvas: () => nodesBackCanvas,
    getFlashBackCanvas: () => flashBackCanvas,
    getGhostBackCanvas: () => ghostBackCanvas,
    getTutorialBackCanvas: () => tutorialBackCanvas,
    boardScaleHelper,
  });

  dgSizeTraceCanLog = dgRefreshDebug.dgSizeTraceCanLog;
  dgSizeTrace = dgRefreshDebug.dgSizeTrace;
  dgSizeTraceCanvas = dgRefreshDebug.dgSizeTraceCanvas;
  dgEffectiveDprTrace = dgRefreshDebug.dgEffectiveDprTrace;
  const __dgRefreshTraceFn = dgRefreshDebug?.dgRefreshTrace;
  dgRefreshTrace = (typeof __dgRefreshTraceFn === 'function') ? __dgRefreshTraceFn : (() => {});
  if (typeof dgRefreshTrace !== 'function') dgRefreshTrace = () => {};
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

      const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
      if (hasStrokes) {
        // IMPORTANT: if we're about to redraw from strokes, make sure normalized strokes
        // have been reprojected into live `pts` first. Otherwise this path can clear
        // the paint canvas and draw nothing (line "vanishes" until next interaction).
        try { __dgReprojectNormalizedStrokesIfNeeded(`post-commit:${reason}`); } catch {}
        dgPaintTrace('postCommit:redraw-from-strokes:begin', { strokes: strokes?.length || 0 });
        try { clearAndRedrawFromStrokes(DG_SINGLE_CANVAS ? backCtx : frontCtx, `post-commit:${reason}`); } catch {}
        dgPaintTrace('postCommit:redraw-from-strokes:end', { strokes: strokes?.length || 0 });
        try { ensureBackVisualsFreshFromFront?.(); } catch {}

        // IMPORTANT:
        // In DG_SINGLE_CANVAS mode, redrawing the paint surface is not sufficient.
        // We must also guarantee a composite + front swap, otherwise the user can
        // see an empty body (grid hidden) / incorrect scale until an interaction.
        try { markStaticDirty(`post-commit:${reason}`); } catch {}
        try { panel.__dgSingleCompositeDirty = true; } catch {}
        __dgNeedsUIRefresh = true;
        __dgFrontSwapNextDraw = true;
        __dgForceFullDrawNext = true;
        __dgForceFullDrawFrames = Math.max(__dgForceFullDrawFrames || 0, 4);
        try {
          if (typeof requestFrontSwap === 'function') {
            requestFrontSwap(useFrontBuffers);
          }
        } catch {}
      } else {
        // No strokes: we still need a deterministic post-commit refresh on refresh/boot.
        // Otherwise a transient scaled DOM rect during zoom settle can leave the user
        // seeing an empty body (grid hidden) until the next interaction.
        try { markLayoutSizeDirty(); } catch {}
        try { ensureSizeReady({ force: false }); } catch {}
        try { panel.__dgSingleCompositeDirty = true; } catch {}
        try { resnapAndRedraw(false, { preservePaintIfNoStrokes: true, skipLayout: true }); } catch {}
        try {
          if (typeof requestFrontSwap === 'function') {
            requestFrontSwap(useFrontBuffers);
          }
        } catch {}
      }
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
    // Stable layout root (screen-space basis)
    wrap,
    // Optional: stable layer root for screen-space mapping
    layersRoot,
    // Optional: unified mount object (if present)
    mount: panel.__dgMount,
  }));

  // Node render cache resetters (wired after createDgNodesRender).
  let resetNodesCache = () => {};
  let resetBlocksCache = () => {};

  let __forceSwipeVisible = null; // null=auto, true/false=forced by tutorial
  let pendingSwap = false;
  let pendingWrapSize = null;
  const DG_WRAP_SIZE_FLUSH = (() => {
    try { return !!window.__DG_WRAP_SIZE_FLUSH; } catch {}
    return false;
  })();
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
  let __dgPostRestoreStabilizeRAF = 0;
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
  flashes = new Float32Array(cols);
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
  // Track backing-store DPR at the moment a zoom commit settles.
  // If paintDpr changes (common when zooming out due to the visual/pressure multipliers),
  // we must force a stroke redraw. Otherwise the solid (paint) stroke will be drawn in
  // the wrong logical space and appear to "scale up" relative to the animated overlay.
  let __dgLastZoomDonePaintDpr = null;
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
    // Avoid a 1-frame flash on overlay strokes (animated/gradient) when releasing a zoom.
    let __dgPreserveOverlaysOnZoomRelease = false;
    try {
      __dgPreserveOverlaysOnZoomRelease = !!(typeof hasOverlayStrokesCached === 'function' && hasOverlayStrokesCached());
      if (!__dgPreserveOverlaysOnZoomRelease && Array.isArray(strokes) && strokes.length) {
        for (let i = 0; i < strokes.length; i++) {
          const s = strokes[i];
          if (s && (s.isSpecial || s.overlayColorize)) { __dgPreserveOverlaysOnZoomRelease = true; break; }
        }
      }
    } catch {}
    __dgForceOverlayClearNext = !__dgPreserveOverlaysOnZoomRelease;
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
      const pressureMul = __dgGetPressureDprMul();
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
            : Math.max(1, Math.min(deviceDpr, 3));
        const smallMul = __dgComputeSmallPanelBackingMul(cssW, cssH);
        desiredDpr = Math.min(deviceDpr, desiredDpr * visualMul * pressureMul * smallMul);
        // Option C:
        // During the gesture we look great because we're mostly seeing transform scaling.
        // The "snap" happens at zoom end when we re-rasterize at a new backing-store DPR.
        // So only apply commit DPR changes when it's worth it.
        const prevDpr = paintDpr;
        const targetDpr = __dgCapDprForBackingStore(cssW, cssH, desiredDpr, null); // no hysteresis for commit target
        const minDelta = (typeof window !== 'undefined' && Number.isFinite(window.__DG_ZOOM_COMMIT_DPR_MIN_DELTA))
          ? window.__DG_ZOOM_COMMIT_DPR_MIN_DELTA
          : 0.18;
        const scaleThreshold = (typeof window !== 'undefined' && Number.isFinite(window.__DG_ZOOM_COMMIT_SCALE_THRESHOLD))
          ? window.__DG_ZOOM_COMMIT_SCALE_THRESHOLD
          : 0.8;
        const delta = Math.abs(targetDpr - prevDpr);
        const allow = (delta >= minDelta) && (!Number.isFinite(commitScale) || commitScale <= scaleThreshold);

        if (allow) {
          paintDpr = targetDpr;
          resizeSurfacesFor(cssW, cssH, targetDpr, `zoom-commit:${reason || 'unknown'}`);
        } else {
          // Keep backing-store DPR stable (prevents end-of-gesture snap).
          paintDpr = prevDpr;
          if (typeof window !== 'undefined' && window.__DG_REFRESH_DEBUG) {
            dgRefreshTrace('zoom-commit:dpr-skip', {
              commitScale,
              prevDpr,
              targetDpr,
              delta,
              minDelta,
              scaleThreshold,
              reason: reason || 'unknown',
            });
          }
        }
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

  const layoutSizing = createDgLayoutSizing({
    state: {
      get panel() { return panel; },
      get wrap() { return wrap; },
      get layoutSizeDirty() { return layoutSizeDirty; },
      set layoutSizeDirty(v) { layoutSizeDirty = v; },
      get __dgLayoutW() { return __dgLayoutW; },
      set __dgLayoutW(v) { __dgLayoutW = v; },
      get __dgLayoutH() { return __dgLayoutH; },
      set __dgLayoutH(v) { __dgLayoutH = v; },
      get __dgLayoutGoodW() { return __dgLayoutGoodW; },
      set __dgLayoutGoodW(v) { __dgLayoutGoodW = v; },
      get __dgLayoutGoodH() { return __dgLayoutGoodH; },
      set __dgLayoutGoodH(v) { __dgLayoutGoodH = v; },
      get __dgLayoutObs() { return __dgLayoutObs; },
      set __dgLayoutObs(v) { __dgLayoutObs = v; },
      get __dgLayoutObserverInstalled() { return __dgLayoutObserverInstalled; },
      set __dgLayoutObserverInstalled(v) { __dgLayoutObserverInstalled = v; },
      get dgViewport() { return dgViewport; },
      get cssW() { return cssW; },
      set cssW(v) { cssW = v; },
      get cssH() { return cssH; },
      set cssH(v) { cssH = v; },
      get paintDpr() { return paintDpr; },
      set paintDpr(v) { paintDpr = v; },
      get usingBackBuffers() { return usingBackBuffers; },
      set usingBackBuffers(v) { usingBackBuffers = v; },
      get backCanvas() { return backCanvas; },
      get frontCanvas() { return frontCanvas; },
      get paint() { return paint; },
      get backCtx() { return backCtx; },
      get frontCtx() { return frontCtx; },
      get pctx() { return pctx; },
      set pctx(v) { pctx = v; },
      get strokes() { return strokes; },
      get __dgSkipPaintSnapshotCount() { return __dgSkipPaintSnapshotCount; },
      set __dgSkipPaintSnapshotCount(v) { __dgSkipPaintSnapshotCount = v; },
      get __dgFrontSwapNextDraw() { return __dgFrontSwapNextDraw; },
      set __dgFrontSwapNextDraw(v) { __dgFrontSwapNextDraw = v; },
      get __dgLastEnsureSizeChanged() { return __dgLastEnsureSizeChanged; },
      set __dgLastEnsureSizeChanged(v) { __dgLastEnsureSizeChanged = v; },
      get progressMeasureW() { return progressMeasureW; },
      set progressMeasureW(v) { progressMeasureW = v; },
      get progressMeasureH() { return progressMeasureH; },
      set progressMeasureH(v) { progressMeasureH = v; },
      get __dgCommitResizeCount() { return __dgCommitResizeCount; },
      set __dgCommitResizeCount(v) { __dgCommitResizeCount = v; },
      get __dgLastResizeTargetW() { return __dgLastResizeTargetW; },
      set __dgLastResizeTargetW(v) { __dgLastResizeTargetW = v; },
      get __dgLastResizeTargetH() { return __dgLastResizeTargetH; },
      set __dgLastResizeTargetH(v) { __dgLastResizeTargetH = v; },
      get __dgLastResizeDpr() { return __dgLastResizeDpr; },
      set __dgLastResizeDpr(v) { __dgLastResizeDpr = v; },
      get __dgLastResizeCssW() { return __dgLastResizeCssW; },
      set __dgLastResizeCssW(v) { __dgLastResizeCssW = v; },
      get __dgLastResizeCssH() { return __dgLastResizeCssH; },
      set __dgLastResizeCssH(v) { __dgLastResizeCssH = v; },
      get __dgLastZoomCommitTs() { return __dgLastZoomCommitTs; },
      set __dgLastZoomCommitTs(v) { __dgLastZoomCommitTs = v; },
      get dgSurfaces() { return dgSurfaces; },
      get gridBackCanvas() { return gridBackCanvas; },
      get nodesBackCanvas() { return nodesBackCanvas; },
      get flashBackCanvas() { return flashBackCanvas; },
      get ghostBackCanvas() { return ghostBackCanvas; },
      get tutorialBackCanvas() { return tutorialBackCanvas; },
      get gridFrontCtx() { return gridFrontCtx; },
      get nodesFrontCtx() { return nodesFrontCtx; },
      get flashFrontCtx() { return flashFrontCtx; },
      get ghostFrontCtx() { return ghostFrontCtx; },
      get tutorialFrontCtx() { return tutorialFrontCtx; },
      get playheadCanvas() { return playheadCanvas; },
      get playheadFrontCtx() { return playheadFrontCtx; },
      get grid() { return grid; },
      get nodesCanvas() { return nodesCanvas; },
      get ghostCanvas() { return ghostCanvas; },
      get flashCanvas() { return flashCanvas; },
      get tutorialCanvas() { return tutorialCanvas; },
      get particleCanvas() { return particleCanvas; },
      get zoomMode() { return zoomMode; },
      get isPanelVisible() { return isPanelVisible; },
      get DG_SINGLE_CANVAS() { return DG_SINGLE_CANVAS; },
      get __dgForceFullDrawNext() { return __dgForceFullDrawNext; },
      set __dgForceFullDrawNext(v) { __dgForceFullDrawNext = v; },
    },
    deps: {
      F,
      R,
      dgRefreshTrace,
      dgSizeTrace,
      dgSizeTraceCanvas,
      dgEffectiveDprTrace,
      dgScaleTrace,
      __dgDescribeCanvasScale,
      __dgEmitScaleMismatchIfChanged,
      __dgTraceCanvasScaleSnapshot,
      __dgMarkOverlayDirty,
      __dgCapDprForBackingStore,
      __dgIsGesturing,
      __dgWithLogicalSpace,
      __dgPaintDebugLog,
      __dgEnsureLayerSizes,
      __dgListAllLayerRefs,
      dglog,
      traceCanvasResize,
      zoomFreezeActive,
      resnapAndRedraw,
      HY,
      markStaticDirty,
      updatePaintBackingStores,
      clearAndRedrawFromStrokes,
      ensureBackVisualsFreshFromFront,
      useFrontBuffers,
      resetPaintBlend,
      getActivePaintCanvas,
      getActivePaintCtx,
      markPlayheadLayerCleared,
      debugPaintSizes,
      compositeSingleCanvas,
      resetGridCache: () => { try { resetGridCache?.(); } catch {} },
      resetNodesCache: () => { try { resetNodesCache?.(); } catch {} },
      resetBlocksCache: () => { try { resetBlocksCache?.(); } catch {} },
      DG_DEBUG,
    },
  });

  ({
    ensureSizeReady,
    resizeSurfacesFor,
    getLayoutSize,
    markLayoutSizeDirty,
    installLayoutObserver: __installLayoutObserver,
    getStableWrapSize: __dgGetStableWrapSize,
    getLayoutGoodSize: __dgGetLayoutGoodSize,
    measureCSSSize,
  } = layoutSizing);
  // Install RO only once the stable wrapper exists (safe if already installed).
  __installLayoutObserver();
  const overviewTransitions = createDgOverviewTransitions({
    state: {
      get panel() { return panel; },
      get wrap() { return wrap; },
      get grid() { return grid; },
      get paint() { return paint; },
      get particleCanvas() { return particleCanvas; },
      get ghostCanvas() { return ghostCanvas; },
      get flashCanvas() { return flashCanvas; },
      get nodesCanvas() { return nodesCanvas; },
      get tutorialCanvas() { return tutorialCanvas; },
      get drawToyBg() { return drawToyBg; },
      get gridArea() { return gridArea; },
      get cssW() { return cssW; },
      get cssH() { return cssH; },
      get paintDpr() { return paintDpr; },
      get currentMap() { return currentMap; },
      get ghostCtx() { return ghostCtx; },
      get fctx() { return fctx; },
      get __dgLastEnsureSizeChanged() { return __dgLastEnsureSizeChanged; },
      get __dgDeferUntilTs() { return __dgDeferUntilTs; },
      set __dgDeferUntilTs(v) { __dgDeferUntilTs = v; },
      get __dgStableFramesAfterCommit() { return __dgStableFramesAfterCommit; },
      set __dgStableFramesAfterCommit(v) { __dgStableFramesAfterCommit = v; },
      get __dgNeedsUIRefresh() { return __dgNeedsUIRefresh; },
      set __dgNeedsUIRefresh(v) { __dgNeedsUIRefresh = v; },
      get __dgFrontSwapNextDraw() { return __dgFrontSwapNextDraw; },
      set __dgFrontSwapNextDraw(v) { __dgFrontSwapNextDraw = v; },
      get __overviewActive() { return __overviewActive; },
      set __overviewActive(v) { __overviewActive = v; },
    },
    deps: {
      dgViewport,
      dgField,
      zoomFreezeActive,
      markLayoutSizeDirty,
      ensureSizeReady,
      resnapAndRedraw,
      drawGrid: (...args) => drawGrid(...args),
      drawNodes: (...args) => drawNodes(...args),
      getActiveFlashCanvas,
      getActiveGhostCanvas,
      __dgGetCanvasDprFromCss,
      __dgWithLogicalSpaceDpr,
      markFlashLayerCleared,
      markGhostLayerCleared,
      dgGhostTrace,
      R,
      dglog,
      ovlog,
      DG_OV_DBG,
      perfOn: (() => { try { return !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now); } catch { return false; } })(),
    },
  });
  overviewTransitions.install();

  const playheadSweepState = {
    get panel() { return panel; },
    get bpm() { return bpm; },
    get currentCols() { return currentCols; },
    get initialCols() { return initialCols; },
    get gridArea() { return gridArea; },
    get cssW() { return cssW; },
    get cssH() { return cssH; },
    get isActiveInChain() { return isActiveInChain; },
    get unsubscribeFrameStart() { return unsubscribeFrameStart; },
    set unsubscribeFrameStart(v) { unsubscribeFrameStart = v; },
  };

  const playheadSweepDeps = {
    onFrameStart,
    getLoopInfo,
    isRunning,
    setOverlayCamState: (value) => { overlayCamState = value; },
    pushHeaderSweepAt: (x) => { FF.pushHeaderSweepAt(x); },
  };

  const playheadSweep = createDgPlayheadSweep({
    state: playheadSweepState,
    deps: playheadSweepDeps,
  });
  if (typeof onFrameStart === 'function') {
    unsubscribeFrameStart = playheadSweep.install();
  }

  const playheadRenderState = {
    get panel() { return panel; },
    get gridArea() { return gridArea; },
    get cw() { return cw; },
    get cssW() { return cssW; },
    get cssH() { return cssH; },
    get paintDpr() { return paintDpr; },
    get strokes() { return strokes; },
    get tutorialCtx() { return tutorialCtx; },
    get playheadFrontCtx() { return playheadFrontCtx; },
    get fctx() { return fctx; },
    get localLastPhase() { return localLastPhase; },
    set localLastPhase(v) { localLastPhase = v; },
    get headerSweepDirX() { return headerSweepDirX; },
    set headerSweepDirX(v) { headerSweepDirX = v; },
    get __dgPlayheadSimpleMode() { return __dgPlayheadSimpleMode; },
    set __dgPlayheadSimpleMode(v) { __dgPlayheadSimpleMode = v; },
    get __dgPlayheadModeWanted() { return __dgPlayheadModeWanted; },
    set __dgPlayheadModeWanted(v) { __dgPlayheadModeWanted = v; },
    get __dgPlayheadModeWantedSince() { return __dgPlayheadModeWantedSince; },
    set __dgPlayheadModeWantedSince(v) { __dgPlayheadModeWantedSince = v; },
    get DG_PLAYHEAD_MODE_MIN_MS() { return DG_PLAYHEAD_MODE_MIN_MS; },
  };

  const playheadRenderDeps = {
    getLoopInfo,
    isRunning,
    readHeaderFpsHint,
    getQualityProfile: (opts = {}) => dgQuality.getProfile(opts),
    getTutorialHighlightMode: () => getTutorialHighlightMode(),
    pickPlayheadHue,
    getPlayheadCompositeSprite,
    __dgWithLogicalSpace,
    __dgWithLogicalSpaceDpr,
    __dgGetCanvasDprFromCss,
    R,
    FF,
    emitDG,
    markTutorialLayerActive,
    markTutorialLayerCleared,
    markPlayheadLayerActive,
    markPlayheadLayerCleared,
    markFlashLayerActive,
    markFlashLayerCleared,
    getActiveFlashCanvas,
    getActiveTutorialCanvas,
    setNeedsUIRefresh: () => { __dgNeedsUIRefresh = true; },
    DG_SINGLE_CANVAS,
  };

  const playheadRender = createDgPlayheadRender({
    state: playheadRenderState,
    deps: playheadRenderDeps,
  });

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

  const { updateGeneratorButtons } = installGeneratorButtons(panel, {
    get cols() { return cols; },
    get rows() { return rows; },
    get gridArea() { return gridArea; },
    get gridAreaLogical() { return gridAreaLogical; },
    get cw() { return cw; },
    get ch() { return ch; },
    get topPad() { return topPad; },
    get updateDrawLabel() { return updateDrawLabel; },
    get markUserChange() { return markUserChange; },
    get emitDG() { return emitDG; },
    get isPanelVisible() { return isPanelVisible; },
    get __dgMarkSingleCanvasDirty() { return __dgMarkSingleCanvasDirty; },
  });

  // New central helper to redraw the paint canvas and regenerate the node map from the `strokes` array.
  ({ clearAndRedrawFromStrokes, drawIntoBackOnly } = createDgPaintRedraw({
    state: {
      get panel() { return panel; },
      get strokes() { return strokes; },
      get cur() { return cur; },
      get backCtx() { return backCtx; },
      get frontCtx() { return frontCtx; },
      get pctx() { return pctx; },
      get usingBackBuffers() { return usingBackBuffers; },
      get paintDpr() { return paintDpr; },
      get cssW() { return cssW; },
      get cssH() { return cssH; },
      get DG_SINGLE_CANVAS() { return DG_SINGLE_CANVAS; },
      get DG_LAYOUT_DEBUG() { return DG_LAYOUT_DEBUG; },
      get pendingPaintSwap() { return pendingPaintSwap; },
      set pendingPaintSwap(v) { pendingPaintSwap = v; },
    },
    deps: {
      F,
      FD,
      R,
      getActivePaintCtx,
      __dgWithLogicalSpace,
      drawFullStroke: (...args) => drawFullStroke(...args),
      regenerateMapFromStrokes: () => regenerateMapFromStrokes(),
      updateGeneratorButtons,
      syncLetterFade,
      __dgMarkSingleCanvasDirty,
      compositeSingleCanvas,
      requestFrontSwap,
      markPaintDirty,
      __dgPaintDebugLog,
      dgPaintTrace,
      debugPaintSizes,
    },
  }));

  const dgPaintSnapshotState = {
    get panel() { return panel; },
    get DG_SINGLE_CANVAS() { return DG_SINGLE_CANVAS; },
    get backCanvas() { return backCanvas; },
    get paint() { return paint; },
    get paintDpr() { return paintDpr; },
    get usingBackBuffers() { return usingBackBuffers; },
    get cssW() { return cssW; },
    get cssH() { return cssH; },
    get strokes() { return strokes; },
    get pctx() { return pctx; },
    set pctx(value) { pctx = value; },
  };

  const dgPaintSnapshotDeps = {
    updatePaintBackingStores,
    getActivePaintCtx,
    getActivePaintCanvas,
    resetPaintBlend,
    R,
    emitDG,
    markPaintDirty,
    clearAndRedrawFromStrokes,
  };

  const { capturePaintSnapshot, restorePaintSnapshot } = createDgPaintSnapshot({
    state: dgPaintSnapshotState,
    deps: dgPaintSnapshotDeps,
  });

  ({ scheduleZoomRecompute } = createDgZoomRecompute({
    state: {
      get zoomRAF() { return zoomRAF; },
      set zoomRAF(v) { zoomRAF = v; },
      get pendingZoomResnap() { return pendingZoomResnap; },
      set pendingZoomResnap(v) { pendingZoomResnap = v; },
      get pendingSwap() { return pendingSwap; },
      set pendingSwap(v) { pendingSwap = v; },
      get cssW() { return cssW; },
      get cssH() { return cssH; },
      get paintDpr() { return paintDpr; },
      get zoomMode() { return zoomMode; },
      get boardScale() { return boardScale; },
      get __dgAdaptivePaintDpr() { return __dgAdaptivePaintDpr; },
      get strokes() { return strokes; },
      get currentMap() { return currentMap; },
      get panel() { return panel; },
    },
    deps: {
      __dgComputeVisualBackingMul,
      __dgGetPressureDprMul,
      __dgComputeSmallPanelBackingMul,
      resizeSurfacesFor,
      dgRefreshTrace,
      capturePaintSnapshot,
      restorePaintSnapshot,
      useBackBuffers,
      updatePaintBackingStores,
      getGhostGuideAutoActive,
      dgGhostTrace,
      resnapAndRedraw,
      drawIntoBackOnly,
    },
  }));
  ({ handleZoom } = createDgZoomHandler({
    state: {
      get __lastZoomEventTs() { return __lastZoomEventTs; },
      set __lastZoomEventTs(v) { __lastZoomEventTs = v; },
      get zoomMode() { return zoomMode; },
      set zoomMode(v) { zoomMode = v; },
      get usingBackBuffers() { return usingBackBuffers; },
      get pctx() { return pctx; },
      set pctx(v) { pctx = v; },
      get backCtx() { return backCtx; },
      get frontCtx() { return frontCtx; },
      get paintDpr() { return paintDpr; },
      get cssW() { return cssW; },
      get cssH() { return cssH; },
      get panel() { return panel; },
      get frontCanvas() { return frontCanvas; },
      get backCanvas() { return backCanvas; },
      get __zoomActive() { return __zoomActive; },
      set __zoomActive(v) { __zoomActive = v; },
      get zoomGestureActive() { return zoomGestureActive; },
      set zoomGestureActive(v) { zoomGestureActive = v; },
      get dgViewport() { return dgViewport; },
      get suppressHeaderPushUntil() { return suppressHeaderPushUntil; },
      set suppressHeaderPushUntil(v) { suppressHeaderPushUntil = v; },
      get HEADER_PUSH_SUPPRESS_MS() { return HEADER_PUSH_SUPPRESS_MS; },
      get particles() { return particles; },
      get __dgSkipPaintSnapshotCount() { return __dgSkipPaintSnapshotCount; },
      set __dgSkipPaintSnapshotCount(v) { __dgSkipPaintSnapshotCount = v; },
      get dgField() { return dgField; },
      get layoutSizeDirty() { return layoutSizeDirty; },
      set layoutSizeDirty(v) { layoutSizeDirty = v; },
      get __dgLastZoomDoneScale() { return __dgLastZoomDoneScale; },
      set __dgLastZoomDoneScale(v) { __dgLastZoomDoneScale = v; },
      get __dgLastZoomDonePaintDpr() { return __dgLastZoomDonePaintDpr; },
      set __dgLastZoomDonePaintDpr(v) { __dgLastZoomDonePaintDpr = v; },
      get lastCommittedScale() { return lastCommittedScale; },
      get strokes() { return strokes; },
      get currentMap() { return currentMap; },
      get __dgPaintRev() { return __dgPaintRev; },
      get pendingZoomResnap() { return pendingZoomResnap; },
      set pendingZoomResnap(v) { pendingZoomResnap = v; },
      get pendingResnapOnVisible() { return pendingResnapOnVisible; },
      set pendingResnapOnVisible(v) { pendingResnapOnVisible = v; },
      get DG_SINGLE_CANVAS() { return DG_SINGLE_CANVAS; },
      get isPanelVisible() { return isPanelVisible; },
      get __dgForceFullDrawNext() { return __dgForceFullDrawNext; },
      set __dgForceFullDrawNext(v) { __dgForceFullDrawNext = v; },
    },
    deps: {
      nowMs,
      noteZoomMotion,
      __auditZoomSizes,
      __dgPaintDebugLog,
      getActivePaintCanvas,
      getActivePaintCtx,
      markZoomActive,
      releaseZoomFreeze,
      dglog,
      markLayoutSizeDirty,
      useFrontBuffers,
      layout,
      ensureSizeReady,
      extractZoomSnapshot,
      clearAndRedrawFromStrokes,
      requestFrontSwap,
      drawNodes: (...args) => drawNodes(...args),
      drawGrid: (...args) => drawGrid(...args),
      ensureBackVisualsFreshFromFront,
      markStaticDirty,
      compositeSingleCanvas,
      hasOverlayStrokesCached,
      getGhostGuideAutoActive,
      dgGhostTrace,
      resnapAndRedraw,
      dgRefreshTrace,
    },
  }));
  // Tag for zoom profiling readability
  handleZoom.__zcName = `drawgrid:${panel.id || 'unknown'}`;
  const unsubscribeZoom = onZoomChange(namedZoomListener('drawgrid:zoom', handleZoom));

  let zoomRAF = null;

  let resnapHelper = { resnapAndRedraw: () => {} };
  function resnapAndRedraw(forceLayout = false, opts = {}) {
    return resnapHelper.resnapAndRedraw(forceLayout, opts);
  }




  panel.addEventListener('toy-zoom', (e)=>{
    const z = e?.detail;
    if (!z) return;
    try {
      if (typeof window !== 'undefined' && window.__DG_ZOOM_COMMIT_TRACE) {
        console.log('[DG][zoom] event', {
          panelId: panel?.id || null,
          phase: z?.phase || null,
          mode: z?.mode || null,
          currentScale: z?.currentScale ?? null,
          targetScale: z?.targetScale ?? null,
        });
      }
    } catch {}

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

      const __hasStrokes = Array.isArray(strokes) && strokes.length > 0;
      const __hasNodes = !!(currentMap && Array.isArray(currentMap.nodes) && currentMap.nodes.some(s => s && s.size > 0));
      const __hasAnyPaint = ((__dgPaintRev | 0) > 0) || hasOverlayStrokesCached();
      const __ghostNonEmpty = panel && panel.__dgGhostLayerEmpty === false;
      // IMPORTANT: During gesture pan/zoom commit, a blank toy may still have a live ghost trail.
      // Never run the "resnap-empty -> clearDrawgridInternal" path in that case, because it cuts the trail.
      const __preserveBlankDuringCommit = (!__hasStrokes && !__hasNodes) && (getGhostGuideAutoActive() || __ghostNonEmpty || !__hasAnyPaint);
      if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
        dgGhostTrace('zoom:commit:resnap', {
          preserveBlankDuringCommit: __preserveBlankDuringCommit,
          hasStrokes: __hasStrokes,
          hasNodes: __hasNodes,
          hasAnyPaint: __hasAnyPaint,
          ghostNonEmpty: __ghostNonEmpty,
          ghostAutoActive: getGhostGuideAutoActive(),
          zoomMode,
        });
      }
      resnapAndRedraw(true, { preservePaintIfNoStrokes: __preserveBlankDuringCommit });
      try {
        if (typeof window !== 'undefined' && window.__DG_ZOOM_COMMIT_TRACE) {
          const active = (typeof getActivePaintCanvas === 'function') ? getActivePaintCanvas() : null;
          const ctx = (typeof getActivePaintCtx === 'function') ? getActivePaintCtx() : null;
          const payload = {
            panelId: panel?.id || null,
            usingBackBuffers,
            paintDpr,
            cssW,
            cssH,
            pctxRole: pctx?.canvas?.getAttribute?.('data-role') || null,
            activeRole: active?.getAttribute?.('data-role') || null,
            ctxRole: ctx?.canvas?.getAttribute?.('data-role') || null,
            frontW: frontCanvas?.width || 0,
            frontH: frontCanvas?.height || 0,
            backW: backCanvas?.width || 0,
            backH: backCanvas?.height || 0,
          };
          console.log('[DG][zoom-commit] pre-redraw', payload);
        }
      } catch {}
      try { clearAndRedrawFromStrokes(pctx, 'zoom-commit'); } catch {}
      try { markStaticDirty('zoom-commit'); } catch {}
      __dgForceFullDrawNext = true;
      zoomGestureActive = false;
      zoomMode = 'idle'; // ensure we fully exit zoom mode 
      lastCommittedScale = boardScale;
      return;
    }
  });

  // NOTE:
  // We intentionally DO NOT install a second legacy ResizeObserver here.
  // The stable wrap observer (installed via __installLayoutObserver()) is the
  // single source of truth for size changes + resnap scheduling.

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
            const ratio = (typeof entry.intersectionRatio === 'number') ? entry.intersectionRatio : (entry.isIntersecting ? 1 : 0);

            // Classify visibility for the focus/budget system.
            // Keep the existing `isPanelVisible` boolean semantics: only "ONSCREEN" counts as visible.
            const nextVisState = (!entry.isIntersecting || ratio <= 0)
              ? 'OFFSCREEN'
              : (ratio >= DG_VISIBILITY_THRESHOLD ? 'ONSCREEN' : 'NEARSCREEN');

            // Persist state on panel for debugging / future global manager.
            if (nextVisState !== __dgVisibilityState || Math.abs((ratio || 0) - (__dgLastIntersectionRatio || 0)) > 0.02) {
              __dgSetVisibilityState(nextVisState, ratio);
              try {
                if (typeof window !== 'undefined' && window.__DG_DEBUG_CULL) {
                  console.log('[DG][cull] VISSTATE', { panelId: panel?.id || null, state: nextVisState, ratio: +(__dgLastIntersectionRatio || 0).toFixed(3) });
                }
              } catch {}
            }
            // Require a minimum intersection ratio to count as visible.
            const visible =
              entry.isIntersecting &&
              (typeof entry.intersectionRatio !== 'number'
                ? true
                : entry.intersectionRatio >= DG_VISIBILITY_THRESHOLD);
            isPanelVisible = !!visible;
            // Auto-tier based on visibility state (unless caller has explicitly forced a tier).
            // - OFFSCREEN: don't force anything (we hard-cull anyway)
            // - NEARSCREEN: tier 1 (keeps resScale down; particles/specials off)
            // - ONSCREEN: tier 3
            try {
              const forced = (panel.__dgQualityTier != null);
              if (!forced) {
                if (__dgVisibilityState === 'NEARSCREEN') dgQuality.setTier(1, 'vis:nearscreen');
                else if (__dgVisibilityState === 'ONSCREEN') dgQuality.setTier(3, 'vis:onscreen');
              }
            } catch {}
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
              // Reset nearscreen warm flag when we truly become visible.
              __dgNearscreenWarmDone = false;

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

            // NEARSCREEN warm-up:
            // If we're intersecting but below the "visible" threshold, do a single warm composite
            // (no loop restart). This keeps the surface "ready" without paying continuous costs.
            try {
              if (__dgVisibilityState === 'NEARSCREEN' && !isPanelVisible && !__dgNearscreenWarmDone) {
                __dgNearscreenWarmDone = true;
                // Mark dirty so the next composite includes up-to-date content.
                try {
                  __dgMarkSingleCanvasDirty(panel);
                  panel.__dgSingleCompositeDirty = true;
                  panel.__dgCompositeBaseDirty = true;
                  panel.__dgCompositeOverlayDirty = true;
                } catch {}
                if (DG_SINGLE_CANVAS) {
                  requestAnimationFrame(() => {
                    try { compositeSingleCanvas(); } catch {}
                    try { panel.__dgSingleCompositeDirty = false; } catch {}
                  });
                }
              }
              if (__dgVisibilityState !== 'NEARSCREEN') {
                __dgNearscreenWarmDone = false;
              }
            } catch {}
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
    // Avoid a 1-frame "flash" where overlay strokes disappear on gesture release.
    // If we have overlay-colorized/special strokes, preserve overlays through the release.
    let __dgPreserveOverlaysOnRelease = false;
    try {
      __dgPreserveOverlaysOnRelease = !!(typeof hasOverlayStrokesCached === 'function' && hasOverlayStrokesCached());
      if (!__dgPreserveOverlaysOnRelease && Array.isArray(strokes) && strokes.length) {
        for (let i = 0; i < strokes.length; i++) {
          const s = strokes[i];
          if (s && (s.isSpecial || s.overlayColorize)) { __dgPreserveOverlaysOnRelease = true; break; }
        }
      }
    } catch {}
    __dgForceOverlayClearNext = !__dgPreserveOverlaysOnRelease;
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

  function __dgElSummary(el) {
    if (!el) return null;
    try {
      const r = el.getBoundingClientRect?.();
      const cs = getComputedStyle?.(el);
      return {
        rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
        transform: cs?.transform || null,
        transformOrigin: cs?.transformOrigin || null,
        contain: cs?.contain || null,
        willChange: cs?.willChange || null,
        display: cs?.display || null,
        position: cs?.position || null,
        pointerEvents: cs?.pointerEvents || null,
      };
    } catch {
      return null;
    }
  }
  ({ compositeSingleCanvas } = createDgComposite({
    state: {
      get panel() { return panel; },
      get DG_SINGLE_CANVAS() { return DG_SINGLE_CANVAS; },
      get DG_SINGLE_CANVAS_OVERLAYS() { return DG_SINGLE_CANVAS_OVERLAYS; },
      get frontCtx() { return frontCtx; },
      get gridArea() { return gridArea; },
      get topPad() { return topPad; },
      get __dgLastResizeTargetW() { return __dgLastResizeTargetW; },
      get __dgLastResizeTargetH() { return __dgLastResizeTargetH; },
      get cssW() { return cssW; },
      get cssH() { return cssH; },
      get paintDpr() { return paintDpr; },
      get usingBackBuffers() { return usingBackBuffers; },
      get gridBackCtx() { return gridBackCtx; },
      get gridBackCanvas() { return gridBackCanvas; },
      get backCanvas() { return backCanvas; },
      get nodesFrontCtx() { return nodesFrontCtx; },
      get nodesBackCanvas() { return nodesBackCanvas; },
      get ghostCanvas() { return ghostCanvas; },
      get flashCanvas() { return flashCanvas; },
      get tutorialCanvas() { return tutorialCanvas; },
      get playheadCanvas() { return playheadCanvas; },
      get __dgForceFullDrawNext() { return __dgForceFullDrawNext; },
      set __dgForceFullDrawNext(v) { __dgForceFullDrawNext = v; },
    },
    deps: {
      FD,
      R,
      getRect,
      dgSizeTrace,
      dgSizeTraceCanvas,
      dgGridAlphaLog,
      resizeSurfacesFor,
      markStaticDirty,
      drawGrid: (...args) => drawGrid(...args),
      __dgGridReady,
      getActiveFlashCanvas,
      getActiveGhostCanvas,
      getActiveTutorialCanvas,
      __dgSampleAlpha,
    },
  }));

  ({ ensureBackVisualsFreshFromFront } = createDgBackSync({
    state: {
      get panel() { return panel; },
      get paintDpr() { return paintDpr; },
      get cssW() { return cssW; },
      get cssH() { return cssH; },
      get frontCanvas() { return frontCanvas; },
      get backCanvas() { return backCanvas; },
      get paint() { return paint; },
      get __dgAdaptivePaintDpr() { return __dgAdaptivePaintDpr; },
      get flashCanvas() { return flashCanvas; },
      get flashBackCanvas() { return flashBackCanvas; },
      get ghostCanvas() { return ghostCanvas; },
      get ghostBackCanvas() { return ghostBackCanvas; },
      get tutorialCanvas() { return tutorialCanvas; },
      get tutorialBackCanvas() { return tutorialBackCanvas; },
      get playheadCanvas() { return playheadCanvas; },
      get usingBackBuffers() { return usingBackBuffers; },
      get DG_SINGLE_CANVAS() { return DG_SINGLE_CANVAS; },
      get zoomGestureMoving() { return zoomGestureMoving; },
      get gridFrontCtx() { return gridFrontCtx; },
      get gridBackCtx() { return gridBackCtx; },
      get nodesFrontCtx() { return nodesFrontCtx; },
      get nodesBackCtx() { return nodesBackCtx; },
      get flashFrontCtx() { return flashFrontCtx; },
      get flashBackCtx() { return flashBackCtx; },
      get ghostFrontCtx() { return ghostFrontCtx; },
      get ghostBackCtx() { return ghostBackCtx; },
      get tutorialFrontCtx() { return tutorialFrontCtx; },
      get tutorialBackCtx() { return tutorialBackCtx; },
      get playheadFrontCtx() { return playheadFrontCtx; },
      get pctx() { return pctx; },
      get backCtx() { return backCtx; },
      get strokes() { return strokes; },
      get __dgForceFullDrawNext() { return __dgForceFullDrawNext; },
      set __dgForceFullDrawNext(v) { __dgForceFullDrawNext = v; },
    },
    deps: {
      __dgComputeVisualBackingMul,
      __dgGetPressureDprMul,
      __dgGetAutoQualityMul,
      __dgCapDprForBackingStore,
      __dgComputeGestureStaticMul,
      __dgListAllLayerEls,
      __dgListManagedBackingEls,
      R,
      markStaticDirty,
      clearAndRedrawFromStrokes,
    },
  }));

  ({ copyCanvas, useBackBuffers, useFrontBuffers, getActiveFlashCanvas, getActiveTutorialCanvas } = createDgBufferSwitch({
    state: {
      get usingBackBuffers() { return usingBackBuffers; },
      set usingBackBuffers(v) { usingBackBuffers = v; },
      get gctx() { return gctx; },
      set gctx(v) { gctx = v; },
      get nctx() { return nctx; },
      set nctx(v) { nctx = v; },
      get fctx() { return fctx; },
      set fctx(v) { fctx = v; },
      get ghostCtx() { return ghostCtx; },
      set ghostCtx(v) { ghostCtx = v; },
      get tutorialCtx() { return tutorialCtx; },
      set tutorialCtx(v) { tutorialCtx = v; },
      get pctx() { return pctx; },
      set pctx(v) { pctx = v; },
      get backCtx() { return backCtx; },
      get frontCtx() { return frontCtx; },
      get gridBackCtx() { return gridBackCtx; },
      get gridFrontCtx() { return gridFrontCtx; },
      get nodesBackCtx() { return nodesBackCtx; },
      get nodesFrontCtx() { return nodesFrontCtx; },
      get flashBackCtx() { return flashBackCtx; },
      get flashFrontCtx() { return flashFrontCtx; },
      get ghostBackCtx() { return ghostBackCtx; },
      get ghostFrontCtx() { return ghostFrontCtx; },
      get tutorialBackCtx() { return tutorialBackCtx; },
      get tutorialFrontCtx() { return tutorialFrontCtx; },
      get flashBackCanvas() { return flashBackCanvas; },
      get flashCanvas() { return flashCanvas; },
      get tutorialBackCanvas() { return tutorialBackCanvas; },
      get tutorialCanvas() { return tutorialCanvas; },
      get nodesCanvas() { return nodesCanvas; },
      get grid() { return grid; },
      get DG_SINGLE_CANVAS() { return DG_SINGLE_CANVAS; },
      get DG_SINGLE_CANVAS_OVERLAYS() { return DG_SINGLE_CANVAS_OVERLAYS; },
    },
    deps: {
      R,
      syncBackBufferSizes,
      emitDG,
      getActivePaintCtx,
    },
  }));

  ({ layout } = createDgLayout({
    state: {
      get panel() { return panel; },
      get wrap() { return wrap; },
      get body() { return body; },
      get layoutSizeDirty() { return layoutSizeDirty; },
      set layoutSizeDirty(v) { layoutSizeDirty = v; },
      get __dgLayoutW() { return __dgLayoutW; },
      get __dgLayoutH() { return __dgLayoutH; },
      get cssW() { return cssW; },
      set cssW(v) { cssW = v; },
      get cssH() { return cssH; },
      set cssH(v) { cssH = v; },
      get DG_WRAP_SIZE_FLUSH() { return DG_WRAP_SIZE_FLUSH; },
      get usingBackBuffers() { return usingBackBuffers; },
      get pendingWrapSize() { return pendingWrapSize; },
      set pendingWrapSize(v) { pendingWrapSize = v; },
      get zoomGestureActive() { return zoomGestureActive; },
      get zoomMode() { return zoomMode; },
      get __overviewActive() { return __overviewActive; },
      get dgViewport() { return dgViewport; },
      get paintDpr() { return paintDpr; },
      get __dgForceFullDrawNext() { return __dgForceFullDrawNext; },
      set __dgForceFullDrawNext(v) { __dgForceFullDrawNext = v; },
      get lastZoomX() { return lastZoomX; },
      set lastZoomX(v) { lastZoomX = v; },
      get lastZoomY() { return lastZoomY; },
      set lastZoomY(v) { lastZoomY = v; },
      get __hydrationJustApplied() { return __hydrationJustApplied; },
      get strokes() { return strokes; },
      get isRestoring() { return isRestoring; },
      get __zoomActive() { return __zoomActive; },
      get gridAreaLogical() { return gridAreaLogical; },
      get SAFE_AREA_FRACTION() { return SAFE_AREA_FRACTION; },
      get gridArea() { return gridArea; },
      set gridArea(v) { gridArea = v; },
      get topPad() { return topPad; },
      set topPad(v) { topPad = v; },
      get cols() { return cols; },
      get rows() { return rows; },
      get cw() { return cw; },
      set cw(v) { cw = v; },
      get ch() { return ch; },
      set ch(v) { ch = v; },
      get __dgLastGoodGridArea() { return __dgLastGoodGridArea; },
      set __dgLastGoodGridArea(v) { __dgLastGoodGridArea = v; },
      get __dgLastGoodCw() { return __dgLastGoodCw; },
      set __dgLastGoodCw(v) { __dgLastGoodCw = v; },
      get __dgLastGoodCh() { return __dgLastGoodCh; },
      set __dgLastGoodCh(v) { __dgLastGoodCh = v; },
      get gridBackCtx() { return gridBackCtx; },
      get nodesBackCtx() { return nodesBackCtx; },
      get __dgLastLayoutKey() { return __dgLastLayoutKey; },
      set __dgLastLayoutKey(v) { __dgLastLayoutKey = v; },
      get __dgLayoutStableFrames() { return __dgLayoutStableFrames; },
      set __dgLayoutStableFrames(v) { __dgLayoutStableFrames = v; },
      get frontCanvas() { return frontCanvas; },
      get __dgHydrationPendingRedraw() { return __dgHydrationPendingRedraw; },
      set __dgHydrationPendingRedraw(v) { __dgHydrationPendingRedraw = v; },
      get hydrationState() { return hydrationState; },
      get drawLabelState() { return drawLabelState; },
      get zoomCommitPhase() { return zoomCommitPhase; },
      get drawing() { return drawing; },
      get paint() { return paint; },
      get __dgSkipPaintSnapshotCount() { return __dgSkipPaintSnapshotCount; },
      set __dgSkipPaintSnapshotCount(v) { __dgSkipPaintSnapshotCount = v; },
      get pctx() { return pctx; },
      get DG_SINGLE_CANVAS() { return DG_SINGLE_CANVAS; },
      get __dgStableFramesAfterCommit() { return __dgStableFramesAfterCommit; },
      get __dgForceOverlayClearNext() { return __dgForceOverlayClearNext; },
      set __dgForceOverlayClearNext(v) { __dgForceOverlayClearNext = v; },
      get __dgNeedsUIRefresh() { return __dgNeedsUIRefresh; },
      set __dgNeedsUIRefresh(v) { __dgNeedsUIRefresh = v; },
      get nctx() { return nctx; },
      get fctx() { return fctx; },
      get ghostCtx() { return ghostCtx; },
    },
    deps: {
      F,
      R,
      measureCSSSize,
      __dgGetStableWrapSize,
      getZoomScale,
      dgRefreshTrace,
      resnapAndRedraw,
      dgSizeTrace,
      dgSizeTraceCanLog,
      resizeSurfacesFor,
      getTutorialHighlightMode,
      renderTutorialHighlight,
      markStaticDirty,
      DG_HYDRATE,
      dgNow,
      __dgGridReady,
      resetGridCache: () => { try { resetGridCache?.(); } catch {} },
      resetNodesCache: () => { try { resetNodesCache?.(); } catch {} },
      resetBlocksCache: () => { try { resetBlocksCache?.(); } catch {} },
      dgLogLine,
      dgDumpCanvasMetrics,
      drawGrid: (...args) => drawGrid(...args),
      updateDrawLabelLayout,
      getActivePaintCanvas,
      updatePaintBackingStores,
      getActivePaintCtx,
      resetPaintBlend,
      __dgPaintDebugLog,
      clearAndRedrawFromStrokes,
      getPaintCtxFront: () => {
        try {
          return (typeof getPaintCtxFront === 'function') ? getPaintCtxFront() : null;
        } catch {
          return null;
        }
      },
      getPaintCtxBack: () => {
        try {
          return (typeof getPaintCtxBack === 'function') ? getPaintCtxBack() : null;
        } catch {
          return null;
        }
      },
      __dgMarkSingleCanvasDirty,
      compositeSingleCanvas,
      HY,
      __dgGetCanvasDprFromCss,
      __dgWithLogicalSpaceDpr,
      getActiveFlashCanvas,
      getActiveGhostCanvas,
      markFlashLayerCleared,
      markGhostLayerCleared,
      dgGhostTrace,
      DG_LAYOUT_DEBUG,
    },
  }));

  ({ updatePanelParticleState } = createDgParticleState({
    state: {
      get panel() { return panel; },
      get dgField() { return dgField; },
      get particleFieldEnabled() { return particleFieldEnabled; },
      set particleFieldEnabled(v) { particleFieldEnabled = v; },
      get __dgParticlePokeTs() { return __dgParticlePokeTs; },
      set __dgParticlePokeTs(v) { __dgParticlePokeTs = v; },
      get __dgParticleStateCache() { return panel?.__dgParticleStateCache || __dgParticleStateCache; },
      set __dgParticleStateCache(v) {
        __dgParticleStateCache = v;
        try { panel.__dgParticleStateCache = v; } catch {}
      },
      get __lastZoomMotionTs() { return __lastZoomMotionTs; },
      get ZOOM_STALL_MS() { return ZOOM_STALL_MS; },
      get DG_PARTICLE_POKE_GRACE_MS() { return DG_PARTICLE_POKE_GRACE_MS; },
      get __dgLowFpsMode() { return __dgLowFpsMode; },
    },
    deps: {
      getGlobalAdaptiveState,
      updateAdaptiveShared,
      getAutoQualityScale: () => (typeof getAutoQualityScale === 'function' ? getAutoQualityScale() : null),
      dgParticleBootLog,
      globalDrawgridState,
    },
  }));

  const overlayFlushState = {
    get panel() { return panel; },
    get cssW() { return cssW; },
    get cssH() { return cssH; },
    get paintDpr() { return paintDpr; },
    get DG_SINGLE_CANVAS() { return DG_SINGLE_CANVAS; },
    get DG_SINGLE_CANVAS_OVERLAYS() { return DG_SINGLE_CANVAS_OVERLAYS; },
    get usingBackBuffers() { return usingBackBuffers; },
    get wrap() { return wrap; },
    get pendingWrapSize() { return pendingWrapSize; },
    set pendingWrapSize(v) { pendingWrapSize = v; },
    get DG_WRAP_SIZE_FLUSH() { return DG_WRAP_SIZE_FLUSH; },
    get grid() { return grid; },
    get nodesCanvas() { return nodesCanvas; },
    get flashCanvas() { return flashCanvas; },
    get ghostCanvas() { return ghostCanvas; },
    get tutorialCanvas() { return tutorialCanvas; },
    get gridBackCanvas() { return gridBackCanvas; },
    get nodesBackCanvas() { return nodesBackCanvas; },
    get flashBackCanvas() { return flashBackCanvas; },
    get ghostBackCanvas() { return ghostBackCanvas; },
    get tutorialBackCanvas() { return tutorialBackCanvas; },
    get debugCanvas() { return debugCanvas; },
    get gridFrontCtx() { return gridFrontCtx; },
    get nodesFrontCtx() { return nodesFrontCtx; },
    get flashFrontCtx() { return flashFrontCtx; },
    get ghostFrontCtx() { return ghostFrontCtx; },
    get tutorialFrontCtx() { return tutorialFrontCtx; },
  };

  const overlayFlushDeps = {
    FD,
    R,
    dgGhostTrace,
  };

  const { flushVisualBackBuffersToFront } = createDgOverlayFlush({
    state: overlayFlushState,
    deps: overlayFlushDeps,
  });

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

  const dgGridRenderState = {
    get cssW() { return cssW; },
    set cssW(v) { cssW = v; },
    get cssH() { return cssH; },
    set cssH(v) { cssH = v; },
    get paintDpr() { return paintDpr; },
    get gridArea() { return gridArea; },
    set gridArea(v) { gridArea = v; },
    get cw() { return cw; },
    set cw(v) { cw = v; },
    get ch() { return ch; },
    set ch(v) { ch = v; },
    get rows() { return rows; },
    get cols() { return cols; },
    get topPad() { return topPad; },
    get strokes() { return strokes; },
    get currentMap() { return currentMap; },
    get gctx() { return gctx; },
    get gridFrontCtx() { return gridFrontCtx; },
    get usingBackBuffers() { return usingBackBuffers; },
    get panel() { return panel; },
    get __dgLastGoodGridArea() { return __dgLastGoodGridArea; },
    get __dgLastGoodCw() { return __dgLastGoodCw; },
    get __dgLastGoodCh() { return __dgLastGoodCh; },
    get __dgProbeDidFirstDraw() { return __dgProbeDidFirstDraw; },
    set __dgProbeDidFirstDraw(v) { __dgProbeDidFirstDraw = v; },
  };

  const dgGridRenderDeps = {
    __dgEnsureLayerSizes,
    __dgGetStableWrapSize,
    __dgGridReady,
    layout,
    resnapAndRedraw,
    dgSizeTrace,
    dgGridAlphaLog,
    __dgMarkSingleCanvasDirty,
    __dgProbeDump,
    FD,
    R,
    F,
    DG_PROFILE,
    DG_SINGLE_CANVAS,
  };

  ({ drawGrid, resetGridCache } = createDgGridRender({
    state: dgGridRenderState,
    deps: dgGridRenderDeps,
  }));
  const dgStrokeRenderState = {
    get panel() { return panel; },
    get cssW() { return cssW; },
    get cssH() { return cssH; },
    get paintDpr() { return paintDpr; },
    get DG_SINGLE_CANVAS() { return DG_SINGLE_CANVAS; },
    get usingBackBuffers() { return usingBackBuffers; },
    get backCtx() { return backCtx; },
    get fctx() { return fctx; },
    get STROKE_COLORS() { return STROKE_COLORS; },
    get DG_ALPHA_DEBUG() { return DG_ALPHA_DEBUG; },
    get DG_ALPHA_SPAM_MS() { return DG_ALPHA_SPAM_MS; },
    get VISUAL_ONLY_ALPHA() { return VISUAL_ONLY_ALPHA; },
    get dgAlphaState() { return dgAlphaState; },
  };

  const dgStrokeRenderDeps = {
    R,
    __dgWithLogicalSpace,
    __dgGetCanvasDprFromCss,
    isVisualOnlyStroke,
    getPathAlpha,
    emitDG,
    markPaintDirty,
  };

  const strokeRender = createDgStrokeRender({
    state: dgStrokeRenderState,
    deps: dgStrokeRenderDeps,
  });
  const getStrokePath = strokeRender.getStrokePath;
  drawFullStroke = strokeRender.drawFullStroke;

  // Note grid helpers (assigned after createDgNoteGrid; wrappers avoid TDZ).
  let chromaticPalette = [];
  let pentatonicPalette = [];
  let pentatonicPitchClasses = new Set();
  let drawNoteLabelsToImpl = () => {};
  let drawNoteLabelsImpl = () => {};
  let renderDragScaleBlueHintsImpl = () => {};
  let setDragScaleHighlightImpl = () => {};
  let clearTutorialHighlight = () => {};
  let setTutorialHighlightMode = () => {};
  let getTutorialHighlightOverride = () => false;
  let setTutorialHighlightOverride = () => {};
  let isHighlightActive = () => false;
  let startTutorialHighlightLoop = () => {};
  let stopTutorialHighlightLoop = () => {};
  let pauseTutorialHighlightForDraw = () => {};
  let resumeTutorialHighlightAfterDraw = () => {};
  const drawNoteLabelsTo = (...args) => drawNoteLabelsToImpl(...args);
  const drawNoteLabels = (...args) => drawNoteLabelsImpl(...args);
  const renderDragScaleBlueHints = (...args) => renderDragScaleBlueHintsImpl(...args);
  const setDragScaleHighlight = (...args) => setDragScaleHighlightImpl(...args);

  const isPanelCulled = () => !isPanelVisible;

  const tutorialHighlightState = {
    tutorialHighlightMode: 'none', // 'none' | 'notes' | 'drag'
    tutorialHighlightRaf: null,
    tutorialHighlightOverride: false,
    tutorialHighlightPausedByDraw: false,
    get panel() { return panel; },
    get tutorialCtx() { return tutorialCtx; },
    get paintDpr() { return paintDpr; },
    get cssW() { return cssW; },
    get cssH() { return cssH; },
    get cw() { return cw; },
    get ch() { return ch; },
    get rows() { return rows; },
    get cols() { return cols; },
    get gridArea() { return gridArea; },
    get topPad() { return topPad; },
  };

  const tutorialHighlightDeps = {
    R,
    getActiveTutorialCanvas,
    markTutorialLayerActive,
    markTutorialLayerCleared,
    isPanelCulled,
    getNodeCoordsForHitTest: () => nodeCoordsForHitTest,
  };

  const tutorialHighlight = createDgTutorialHighlight({
    state: tutorialHighlightState,
    deps: tutorialHighlightDeps,
  });

  getTutorialHighlightMode = tutorialHighlight.getMode;
  setTutorialHighlightMode = tutorialHighlight.setMode;
  getTutorialHighlightOverride = tutorialHighlight.getOverride;
  setTutorialHighlightOverride = tutorialHighlight.setOverride;
  isHighlightActive = tutorialHighlight.isHighlightActive;
  clearTutorialHighlight = tutorialHighlight.clearTutorialHighlight;
  renderTutorialHighlight = tutorialHighlight.renderTutorialHighlight;
  startTutorialHighlightLoop = tutorialHighlight.startTutorialHighlightLoop;
  stopTutorialHighlightLoop = tutorialHighlight.stopTutorialHighlightLoop;
  pauseTutorialHighlightForDraw = tutorialHighlight.pauseTutorialHighlightForDraw;
  resumeTutorialHighlightAfterDraw = tutorialHighlight.resumeTutorialHighlightAfterDraw;

  const dgNodesRenderState = {
    get panel() { return panel; },
    get usingBackBuffers() { return usingBackBuffers; },
    get nctx() { return nctx; },
    get nodesFrontCtx() { return nodesFrontCtx; },
    get DG_COMBINE_GRID_NODES() { return DG_COMBINE_GRID_NODES; },
    get DG_SINGLE_CANVAS() { return DG_SINGLE_CANVAS; },
    get DG_SINGLE_CANVAS_OVERLAYS() { return DG_SINGLE_CANVAS_OVERLAYS; },
    get paintDpr() { return paintDpr; },
    get cssW() { return cssW; },
    get cssH() { return cssH; },
    get cw() { return cw; },
    get ch() { return ch; },
    get topPad() { return topPad; },
    get gridArea() { return gridArea; },
    get rows() { return rows; },
    get cols() { return cols; },
    get currentMap() { return currentMap; },
    get nodeGroupMap() { return nodeGroupMap; },
    get strokes() { return strokes; },
    get dragScaleHighlightCol() { return dragScaleHighlightCol; },
    get draggedNode() { return draggedNode; },
    get flashes() { return flashes; },
    get tutorialHighlightMode() { return getTutorialHighlightMode(); },
    get wrap() { return wrap; },
    get boardScale() { return boardScale; },
    get frontCanvas() { return frontCanvas; },
    get paint() { return paint; },
    get backCanvas() { return backCanvas; },
    get __dgProbeDidFirstDraw() { return __dgProbeDidFirstDraw; },
    set __dgProbeDidFirstDraw(v) { __dgProbeDidFirstDraw = v; },
  };

  const dgNodesRenderDeps = {
    isGridReady: __dgGridReady,
    FD,
    R,
    drawGrid,
    renderDragScaleBlueHints,
    drawBlock,
    drawNoteLabelsTo,
    renderTutorialHighlight,
    clearTutorialHighlight,
    __dgWithLogicalSpace,
    __dgDescribeCanvasScale,
    __dgGetCanvasSizingSnapshot,
    dgNodeScaleTrace,
    getActivePaintCanvas,
    __dgMarkSingleCanvasCompositeDirty,
    __dgProbeDump,
    getLayoutCache: () => ({
      w: __dgLayoutW || 0,
      h: __dgLayoutH || 0,
      goodW: __dgLayoutGoodW || 0,
      goodH: __dgLayoutGoodH || 0,
    }),
    setNodeCoordsForHitTest: (value) => { nodeCoordsForHitTest = value; },
  };

  const dgNodesRender = createDgNodesRender({
    state: dgNodesRenderState,
    deps: dgNodesRenderDeps,
  });

  ({ drawNodes, bumpNodesRev } = dgNodesRender);
  resetNodesCache = dgNodesRender.resetNodesCache;
  resetBlocksCache = dgNodesRender.resetBlocksCache;

  const __dgBumpNodesRev = bumpNodesRev;

  const dgNoteGridState = {
    get cssH() { return cssH; },
    get cols() { return cols; },
    get rows() { return rows; },
    get gridArea() { return gridArea; },
    get cw() { return cw; },
    get ch() { return ch; },
    get topPad() { return topPad; },
    get currentMap() { return currentMap; },
    get nctx() { return nctx; },
    get dragScaleHighlightCol() { return dragScaleHighlightCol; },
    set dragScaleHighlightCol(v) { dragScaleHighlightCol = v; },
    get draggedNode() { return draggedNode; },
  };

  const dgNoteGridDeps = {
    __dgWithLogicalSpace,
    midiToName,
    buildPalette,
    drawGrid,
    drawNodes,
  };

  const noteGrid = createDgNoteGrid({
    state: dgNoteGridState,
    deps: dgNoteGridDeps,
  });
  chromaticPalette = noteGrid.chromaticPalette;
  pentatonicPalette = noteGrid.pentatonicPalette;
  pentatonicPitchClasses = noteGrid.pentatonicPitchClasses;
  drawNoteLabelsToImpl = noteGrid.drawNoteLabelsTo;
  drawNoteLabelsImpl = noteGrid.drawNoteLabels;
  renderDragScaleBlueHintsImpl = noteGrid.renderDragScaleBlueHints;
  setDragScaleHighlightImpl = noteGrid.setDragScaleHighlight;

  const dgSnapState = {
    get cols() { return cols; },
    get rows() { return rows; },
    get gridArea() { return gridArea; },
    get cw() { return cw; },
    get ch() { return ch; },
    get topPad() { return topPad; },
    get paintDpr() { return paintDpr; },
    get paint() { return paint; },
    get pctx() { return pctx; },
    get autoTune() { return autoTune; },
    get chromaticPalette() { return chromaticPalette; },
    get pentatonicPalette() { return pentatonicPalette; },
  };

  const dgSnapDeps = {
    drawFullStroke,
  };

  const { snapToGrid, snapToGridFromStroke } = createDgSnap({
    state: dgSnapState,
    deps: dgSnapDeps,
  });

  const dgResnapState = {
    get panel() { return panel; },
    get zoomMode() { return zoomMode; },
    get isPanelVisible() { return isPanelVisible; },
    get pendingZoomResnap() { return pendingZoomResnap; },
    set pendingZoomResnap(v) { pendingZoomResnap = v; },
    get pendingResnapOnVisible() { return pendingResnapOnVisible; },
    set pendingResnapOnVisible(v) { pendingResnapOnVisible = v; },
    get lastResnapTs() { return lastResnapTs; },
    set lastResnapTs(v) { lastResnapTs = v; },
    get layoutSizeDirty() { return layoutSizeDirty; },
    get cssW() { return cssW; },
    get cssH() { return cssH; },
    get strokes() { return strokes; },
    get currentMap() { return currentMap; },
    get pctx() { return pctx; },
    get DG_SINGLE_CANVAS() { return DG_SINGLE_CANVAS; },
    get __dgNeedsUIRefresh() { return __dgNeedsUIRefresh; },
    set __dgNeedsUIRefresh(v) { __dgNeedsUIRefresh = v; },
    get __dgStableFramesAfterCommit() { return __dgStableFramesAfterCommit; },
    set __dgStableFramesAfterCommit(v) { __dgStableFramesAfterCommit = v; },
  };

  const dgResnapDeps = {
    dgRefreshTrace,
    layout,
    syncLetterFade,
    FD,
    regenerateMapFromStrokes: () => regenerateMapFromStrokes(),
    R,
    __dgWithLogicalSpace,
    emitDG,
    drawFullStroke,
    __dgMarkSingleCanvasDirty,
    compositeSingleCanvas,
    updateGeneratorButtons,
    drawGrid,
    drawNodes,
    emitDrawgridUpdate,
    inboundWasNonEmpty,
    DG_HYDRATE,
    dgTraceWarn,
    clearDrawgridInternal: (...args) => clearDrawgridInternal(...args),
    getGhostGuideAutoActive,
    runAutoGhostGuideSweep,
  };

  resnapHelper = createDgResnap({
    state: dgResnapState,
    deps: dgResnapDeps,
  });

  /**
   * Processes a single generator stroke, fills in gaps to create a full line,
   * and marks the interpolated nodes as disabled.
   */
  const dgMapRegenState = {
    get panel() { return panel; },
    get cols() { return cols; },
    get currentCols() { return currentCols; },
    get strokes() { return strokes; },
    get currentMap() { return currentMap; },
    set currentMap(v) { currentMap = v; },
    get nodeGroupMap() { return nodeGroupMap; },
    set nodeGroupMap(v) { nodeGroupMap = v; },
    get manualOverrides() { return manualOverrides; },
    get pendingActiveMask() { return pendingActiveMask; },
    set pendingActiveMask(v) { pendingActiveMask = v; },
    get persistentDisabled() { return persistentDisabled; },
    set persistentDisabled(v) { persistentDisabled = v; },
    get __dgRegenSource() { return __dgRegenSource; },
    set __dgRegenSource(v) { __dgRegenSource = v; },
  };

  const dgMapRegenDeps = {
    fillGapsInNodeArray,
    snapToGridFromStroke,
    emitDrawgridUpdate,
    drawNodes,
    drawGrid,
    __dgMarkSingleCanvasDirty,
    compositeSingleCanvas,
    updateGeneratorButtons,
    dgTraceLog,
    resetNodesCache: () => resetNodesCache(),
    DG,
    DG_DEBUG,
    DG_SINGLE_CANVAS,
  };

  const mapRegen = createDgMapRegen({
    state: dgMapRegenState,
    deps: dgMapRegenDeps,
  });
  regenerateMapFromStrokes = mapRegen.regenerateMapFromStrokes;

  const dgPointerTrace = createDgPointerTrace({
    getPanel: () => panel,
    getCssW: () => cssW,
    getCssH: () => cssH,
    getPaintDpr: () => paintDpr,
    getUsingBackBuffers: () => usingBackBuffers,
    getDgSingleCanvas: () => DG_SINGLE_CANVAS,
    getWrap: () => wrap,
    getLayersRoot: () => layersRoot,
    getFrontCanvas: () => frontCanvas,
    getBackCanvas: () => backCanvas,
    getPaintCanvas: () => paint,
    getActivePaintCanvas: () => (typeof getActivePaintCanvas === 'function' ? getActivePaintCanvas() : null),
    __dgDescribeCanvasScale,
    __dgStableStringify,
    __dgMaybeTraceStack,
  });

  function finishLine(e) {
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
        generatorId = 1;
      } else if (nextDrawTarget) {
        // A "Draw Line" button was explicitly clicked.
        shouldGenerateNodes = true;
        generatorId = nextDrawTarget;
        nextDrawTarget = null; // consume target so subsequent swipes follow natural order
      } else {
        // No target armed: decorative line (no nodes)
        shouldGenerateNodes = false;
      }
      nextDrawTarget = null; // Always reset after a draw completes
      try { (panel.__dgUpdateButtons || updateGeneratorButtons)(); } catch {}
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

  const inputState = {
    get cssW() { return cssW; },
    get cssH() { return cssH; },
    get paintDpr() { return paintDpr; },
    get gridArea() { return gridArea; },
    get gridAreaLogical() { return gridAreaLogical; },
    get drawing() { return drawing; },
    set drawing(v) { drawing = v; },
    get pendingNodeTap() { return pendingNodeTap; },
    set pendingNodeTap(v) { pendingNodeTap = v; },
    get draggedNode() { return draggedNode; },
    set draggedNode(v) { draggedNode = v; },
    get skipSwapsDuringDrag() { return __dgSkipSwapsDuringDrag; },
    set skipSwapsDuringDrag(v) { __dgSkipSwapsDuringDrag = v; },
    get zoomMode() { return zoomMode; },
    get zoomGestureActive() { return zoomGestureActive; },
    get panel() { return panel; },
    get paint() { return paint; },
    get nodeCoordsForHitTest() { return nodeCoordsForHitTest; },
    get cw() { return cw; },
    get ch() { return ch; },
    get topPad() { return topPad; },
    get rows() { return rows; },
    get cols() { return cols; },
    get strokes() { return strokes; },
    set strokes(v) { strokes = v; },
    get nextDrawTarget() { return nextDrawTarget; },
    set nextDrawTarget(v) { nextDrawTarget = v; },
    get STROKE_COLORS() { return STROKE_COLORS; },
    get colorIndex() { return colorIndex; },
    set colorIndex(v) { colorIndex = v; },
    get DG_KNOCK() { return DG_KNOCK; },
    get FF() { return FF; },
    get cur() { return cur; },
    set cur(v) { cur = v; },
    get pctx() { return pctx; },
    set pctx(v) { pctx = v; },
    get DG_TRACE_DEBUG() { return DG_TRACE_DEBUG; },
    get dbgCounters() { return dbgCounters; },
    get previewGid() { return previewGid; },
    set previewGid(v) { previewGid = v; },
    get usingBackBuffers() { return usingBackBuffers; },
    get __dgNeedsUIRefresh() { return __dgNeedsUIRefresh; },
    set __dgNeedsUIRefresh(v) { __dgNeedsUIRefresh = v; },
    get __dgDeferUntilTs() { return __dgDeferUntilTs; },
    set __dgDeferUntilTs(v) { __dgDeferUntilTs = v; },
    get __dgStableFramesAfterCommit() { return __dgStableFramesAfterCommit; },
    set __dgStableFramesAfterCommit(v) { __dgStableFramesAfterCommit = v; },
    get currentMap() { return currentMap; },
    set currentMap(v) { currentMap = v; },
    get nodeGroupMap() { return nodeGroupMap; },
    get manualOverrides() { return manualOverrides; },
    get dragScaleHighlightCol() { return dragScaleHighlightCol; },
    get DG_SINGLE_CANVAS() { return DG_SINGLE_CANVAS; },
    get isPanelVisible() { return isPanelVisible; },
    get wrap() { return wrap; },
    get dgField() { return dgField; },
    get persistentDisabled() { return persistentDisabled; },
    get flashes() { return flashes; },
    get pendingPaintSwap() { return pendingPaintSwap; },
    set pendingPaintSwap(v) { pendingPaintSwap = v; },
  };

  const inputDeps = {
    dgInputTrace,
    dgPaintTrace,
    FD,
    stopAutoGhostGuide,
    markUserChange,
    pointerToPaintLogical,
    dgPointerTrace,
    setDrawingState,
    pauseTutorialHighlightForDraw,
    useFrontBuffers,
    getActivePaintCtx,
    resetPaintBlend,
    R,
    knockLettersAt,
    setDragScaleHighlight,
    drawNodes,
    drawGrid,
    __dgMarkSingleCanvasDirty,
    compositeSingleCanvas,
    DG,
    dgTraceLog,
    spawnNoteRingEffect,
    requestFrontSwap,
    emitDrawgridUpdate,
    useBackBuffers,
    __dgBumpNodesRev,
    resumeTutorialHighlightAfterDraw,
    finishLine,
  };

  const { onPointerDown, onPointerMove, onPointerUp } = createDgInputHandlers({
    state: inputState,
    deps: inputDeps,
  });

  // Debug capture-phase listeners so we can see events even if they miss the paint canvas.
  // (These only run when __DG_INPUT_TRACE is enabled.)
  panel.addEventListener('pointerdown', (e) => {
    if (typeof window !== 'undefined' && window.__DG_INPUT_TRACE) {
      dgInputTrace('capture:panel:down', {
        targetRole: e?.target?.getAttribute?.('data-role') || e?.target?.id || e?.target?.className || null,
        pointerId: e.pointerId,
        buttons: e.buttons,
        isPrimary: e.isPrimary,
      });
    }
  }, { capture: true });

  panel.addEventListener('pointermove', (e) => {
    if (typeof window !== 'undefined' && window.__DG_INPUT_TRACE) {
      dgInputTrace('capture:panel:move', { pointerId: e.pointerId, buttons: e.buttons, isPrimary: e.isPrimary });
    }
  }, { capture: true });

  panel.addEventListener('pointerup', (e) => {
    if (typeof window !== 'undefined' && window.__DG_INPUT_TRACE) {
      dgInputTrace('capture:panel:up', { pointerId: e.pointerId, buttons: e.buttons, isPrimary: e.isPrimary });
    }
  }, { capture: true });

  paint.addEventListener('pointerdown', onPointerDown);
  paint.addEventListener('pointermove', onPointerMove);
  paint.addEventListener('pointerleave', () => {
    paint.style.cursor = 'default';
  });
  window.addEventListener('pointerup', onPointerUp);
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
                          noteEffects.addCellFlash(col, row);
                          __dgMarkOverlayDirty(panel);
                          try {
                              const x = gridArea.x + col * cw + cw * 0.5;
                              const y = gridArea.y + topPad + row * ch + ch * 0.5;

                              // Radius roughly the size of a grid square
                              const nodeRadiusToy = Math.max(10, Math.min(cw, ch) * 0.55);

                              // New local pink burst (no knockback, just visuals)
                              try {
                                if (typeof window !== 'undefined' && window.__DG_NOTE_BURST_TRACE) {
                                  console.log('[DG][burst][spawn]', {
                                    panelId: panel?.id || null,
                                    col, row,
                                    x, y,
                                    cw, ch,
                                    topPad,
                                    gridArea: gridArea ? { x: gridArea.x, y: gridArea.y, w: gridArea.w, h: gridArea.h } : null,
                                    paintDpr,
                                    flash: fctx?.canvas ? { w: fctx.canvas.width, h: fctx.canvas.height } : null,
                                    playhead: playheadFrontCtx?.canvas ? { w: playheadFrontCtx.canvas.width, h: playheadFrontCtx.canvas.height } : null,
                                  });
                                }
                              } catch {}
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

      // --- Toy performance contract (scene-level gating) ------------------
      // IMPORTANT: We do NOT use frame-modulo throttling anymore.
      // Our current goal is: update every RAF tick, and relieve pressure by
      // reducing visual quality (DPR / particles / playhead detail), not by
      // introducing stutters or freezes.
      //
      // We still query the arbiter so we can adopt it later, but for now we
      // intentionally ignore any "frozen" / "frameModulo" decisions.
      const __arb = (typeof window !== 'undefined') ? window.__ToyUpdateArbiter : null;
      const __dec = (__arb && typeof __arb.getDecision === 'function')
        ? __arb.getDecision(panel, 'drawgrid', nowTs)
        : null;
      panel.__dgFrameModulo = 1;

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
      const fpsOverride = __dgGetFpsDriveOverride();
      const fpsDrive = fpsOverride > 0 ? fpsOverride : fpsLive;

      // Pressure DPR should follow the drive signal in test mode (so you can
      // verify pressure behavior deterministically).
      if (Number.isFinite(fpsDrive)) {
        __dgUpdatePressureDprMulFromFps(fpsDrive, nowTs);
      }
      if (Number.isFinite(fpsDrive)) {
        let desiredSimple = null;
        if (fpsDrive <= DG_PLAYHEAD_FPS_SIMPLE_ENTER) {
          desiredSimple = true;
        } else if (fpsDrive >= DG_PLAYHEAD_FPS_SIMPLE_EXIT) {
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

      // --- Debug state readout (throttled, DOM safe) --------------------------
      try {
        const enabled = !!(typeof window !== 'undefined' && (window.__DG_STATE_READOUT || ((window.__QUALITY_LAB || {}).targetFps > 0)));
        // Cleanup quickly when disabled (and avoid any DOM work).
        if (!enabled) {
          try {
            const oldEl = panel.__dgStateReadoutEl || null;
            if (oldEl && oldEl.isConnected) oldEl.remove();
            panel.__dgStateReadoutEl = null;
          } catch {}
        }

        const last = Number.isFinite(panel.__dgStateReadoutTs) ? panel.__dgStateReadoutTs : 0;
        if (!last || (nowTs - last) > 250) {
          panel.__dgStateReadoutTs = nowTs;

          const qlab = (typeof window !== 'undefined') ? (window.__QUALITY_LAB || null) : null;
          const aqEff = (typeof window !== 'undefined' && Number.isFinite(window.__AUTO_QUALITY_EFFECTIVE))
            ? window.__AUTO_QUALITY_EFFECTIVE
            : null;
          // IMPORTANT: DrawGrid uses the imported getAutoQualityScale(), not a window-global.
          const aqScale = (() => {
            try { return getAutoQualityScale?.(); } catch { return null; }
          })();
          const aqDbg = (typeof window !== 'undefined' && window.__AUTO_QUALITY_DEBUG && typeof window.__AUTO_QUALITY_DEBUG === 'object')
            ? window.__AUTO_QUALITY_DEBUG
            : null;

          const pressureMul = (typeof window !== 'undefined' && Number.isFinite(window.__DG_PRESSURE_DPR_MUL))
            ? window.__DG_PRESSURE_DPR_MUL
            : __dgGetPressureDprMul();

          const __dgReadoutDeviceDpr = Math.max(1, Number.isFinite(window?.devicePixelRatio) ? window.devicePixelRatio : 1);
          const __dgReadoutZoomGesturing = (typeof window !== 'undefined' && window.__mtZoomGesturing === true);
          const __dgReadoutZoomGestureMoving = !!(__dgReadoutZoomGesturing && __lastZoomMotionTs && (nowTs - __lastZoomMotionTs) < ZOOM_STALL_MS);
          const __dgReadoutIsFocused = panel.classList?.contains('toy-focused') || panel.classList?.contains('focused');
          const __dgReadoutIsZoomed = panel.classList?.contains('toy-zoomed');
          const __dgReadoutAdaptiveCap = __dgComputeAdaptivePaintDpr({
            boardScale: Number.isFinite(boardScale) ? boardScale : 1,
            isFocused: __dgReadoutIsFocused,
            isZoomed: __dgReadoutIsZoomed,
          });
          const __dgReadoutGestureMul = __dgComputeGestureBackingMul(__dgReadoutZoomGestureMoving);
          const __dgReadoutVisualMul = __dgComputeVisualBackingMul(Number.isFinite(boardScale) ? boardScale : 1) * __dgReadoutGestureMul;
          const __dgReadoutPressureMul = (Number.isFinite(pressureMul) && pressureMul > 0) ? Number(pressureMul) : 1;
          const __dgReadoutSmallMul = __dgComputeSmallPanelBackingMul(cssW, cssH);
          const __dgReadoutAutoMul = __dgGetAutoQualityMul();
          const __dgReadoutDesiredDprRaw = (__dgReadoutAdaptiveCap ? Math.min(__dgReadoutDeviceDpr, __dgReadoutAdaptiveCap) : __dgReadoutDeviceDpr)
            * __dgReadoutVisualMul * __dgReadoutPressureMul * __dgReadoutSmallMul * __dgReadoutAutoMul;
          const __dgReadoutDesiredDpr = __dgCapDprForBackingStore(cssW, cssH, __dgReadoutDesiredDprRaw, __dgAdaptivePaintDpr);

          const pfState = dgField?._state || null;
          const pfCfg = dgField?._config || null;
          const pfCount = Array.isArray(pfState?.particles) ? pfState.particles.length : null;

          const maxCountScale = Number.isFinite(panel.__dgParticleBudgetMaxCountScale) ? panel.__dgParticleBudgetMaxCountScale : null;
          const capScale = Number.isFinite(panel.__dgParticleBudgetCapScale) ? panel.__dgParticleBudgetCapScale : null;
          const spawnScale = Number.isFinite(panel.__dgParticleBudgetSpawnScale) ? panel.__dgParticleBudgetSpawnScale : null;

          const entries = [];
          const tierFromFps = (fpsValue, emergency) => {
            if (emergency) return 'low';
            if (!Number.isFinite(fpsValue)) return 'med';
            if (fpsValue < 30) return 'low';
            if (fpsValue < 50) return 'med';
            return 'high';
          };
          const tierFromScale = (value) => {
            if (!Number.isFinite(value)) return 'med';
            if (value < 0.45) return 'low';
            if (value < 0.75) return 'med';
            return 'high';
          };
          const tierFromRatio = (value, ref) => {
            if (!Number.isFinite(value) || !Number.isFinite(ref) || ref <= 0) return 'med';
            const ratio = value / ref;
            if (ratio < 0.65) return 'low';
            if (ratio < 0.85) return 'med';
            return 'high';
          };
          const tierFromBool = (value) => (value ? 'high' : 'low');

          entries.push({
            text:
              `DG  measuredFps=${Number.isFinite(fpsLive) ? fpsLive.toFixed(1) : '--'}  ` +
              `driveFps=${Number.isFinite(fpsDrive) ? fpsDrive.toFixed(1) : '--'}  ` +
              `override=${fpsOverride > 0 ? String(fpsOverride) : 'off'}  ` +
              `emergency=${__dgLowFpsMode ? 'YES' : 'no '}`,
            tier: tierFromFps(fpsDrive, __dgLowFpsMode),
          });
          entries.push({
            text: `playhead=${__dgPlayheadSimpleMode ? 'SIMPLE' : 'FULL  '} (enter<=${DG_PLAYHEAD_FPS_SIMPLE_ENTER}, exit>=${DG_PLAYHEAD_FPS_SIMPLE_EXIT})`,
            tier: __dgPlayheadSimpleMode ? 'med' : 'high',
          });

          entries.push({
            text:
              `view: scale=${Number.isFinite(boardScale) ? boardScale.toFixed(3) : '--'}  ` +
              `overview=${inOverview ? 'ON' : 'off'}  ` +
              `zoomGesture=${__dgReadoutZoomGesturing ? (__dgReadoutZoomGestureMoving ? 'MOVING' : 'idle') : 'off'}`,
            tier: tierFromBool(!inOverview),
          });

          entries.push({
            text:
              `DPR inputs: device=${Number.isFinite(__dgReadoutDeviceDpr) ? __dgReadoutDeviceDpr.toFixed(2) : '--'}  ` +
              `cap=${Number.isFinite(__dgReadoutAdaptiveCap) ? __dgReadoutAdaptiveCap.toFixed(2) : '--'}  ` +
              `visualMul=${Number.isFinite(__dgReadoutVisualMul) ? __dgReadoutVisualMul.toFixed(3) : '--'}  ` +
              `pressureMul=${Number.isFinite(__dgReadoutPressureMul) ? Number(__dgReadoutPressureMul).toFixed(3) : '--'}  ` +
              `smallMul=${Number.isFinite(__dgReadoutSmallMul) ? __dgReadoutSmallMul.toFixed(3) : '--'}  ` +
              `autoMul=${Number.isFinite(__dgReadoutAutoMul) ? __dgReadoutAutoMul.toFixed(3) : '--'}`,
            tier: tierFromScale(__dgReadoutVisualMul) === 'low' || tierFromScale(__dgReadoutPressureMul) === 'low' ? 'low' :
              (tierFromScale(__dgReadoutVisualMul) === 'med' || tierFromScale(__dgReadoutPressureMul) === 'med') ? 'med' : 'high',
          });
          entries.push({
            text:
              `DPR result: desiredRaw=${Number.isFinite(__dgReadoutDesiredDprRaw) ? __dgReadoutDesiredDprRaw.toFixed(2) : '--'}  ` +
              `desired=${Number.isFinite(__dgReadoutDesiredDpr) ? __dgReadoutDesiredDpr.toFixed(2) : '--'}  ` +
              `paintDpr=${Number.isFinite(paintDpr) ? paintDpr.toFixed(2) : '--'}  ` +
              `adaptivePaint=${Number.isFinite(__dgAdaptivePaintDpr) ? __dgAdaptivePaintDpr.toFixed(2) : '--'}`,
            tier: tierFromRatio(paintDpr, __dgReadoutDeviceDpr),
          });

          // Particle field
          const particleTier = !particleFieldEnabled
            ? 'low'
            : ([
              tierFromScale(maxCountScale),
              tierFromScale(capScale),
              tierFromScale(spawnScale),
            ].includes('low') ? 'low' : ([
              tierFromScale(maxCountScale),
              tierFromScale(capScale),
              tierFromScale(spawnScale),
            ].includes('med') ? 'med' : 'high'));
          entries.push({
            text: `particles: enabled=${particleFieldEnabled ? 'YES' : 'no '}  count=${pfCount ?? '--'}`,
            tier: particleTier,
          });
          entries.push({
            text: `  budget: max=${maxCountScale?.toFixed?.(3) ?? '--'} cap=${capScale?.toFixed?.(3) ?? '--'} spawn=${spawnScale?.toFixed?.(3) ?? '--'}`,
            tier: particleTier,
          });
          const targetTier = Number.isFinite(pfState?.targetDesired) && pfState.targetDesired > 0
            ? (Number.isFinite(pfState?.lodScale) && pfState.lodScale < 0.75 ? 'med' : 'high')
            : 'low';
          entries.push({
            text: `  state: target=${Number.isFinite(pfState?.targetDesired) ? pfState.targetDesired.toFixed(0) : '--'} lod=${Number.isFinite(pfState?.lodScale) ? pfState.lodScale.toFixed(3) : '--'} tickMod=${Number.isFinite(pfCfg?.tickModulo) ? pfCfg.tickModulo : '--'}`,
            tier: targetTier,
          });
          if (pfState) {
            entries.push({
              text:
                `  fieldDpr=${Number.isFinite(pfState.dpr) ? pfState.dpr.toFixed(2) : '--'}  ` +
                `device=${Number.isFinite(pfState.deviceDpr) ? pfState.deviceDpr.toFixed(2) : '--'}  ` +
                `visualMul=${Number.isFinite(pfState.visualMul) ? pfState.visualMul.toFixed(3) : '--'}  ` +
                `pressureMul=${Number.isFinite(pfState.pressureMul) ? pfState.pressureMul.toFixed(3) : '--'}`,
              tier: tierFromRatio(pfState.dpr, pfState.deviceDpr),
            });
          }

          // Quality lab + auto quality (single-source-of-truth)
          const qFps = (qlab && Number.isFinite(qlab.targetFps)) ? qlab.targetFps : 0;
          const qBurn = (qlab && Number.isFinite(qlab.cpuBurnMs)) ? qlab.cpuBurnMs : 0;
          const qForce = (qlab && Number.isFinite(qlab.forceScale)) ? qlab.forceScale : null;
          const forcedActive = qFps > 0;
          const forcedTier = forcedActive ? (qFps > 0 && qFps < 30 ? 'low' : 'med') : 'high';
          entries.push({
            text: `QualityLab: forcedFps=${qFps} (${forcedActive ? 'ON' : 'off'}) burn=${qBurn}ms force=${qForce ?? 'auto'}`,
            tier: forcedTier,
          });
          entries.push({
            text: `Measured: fps=${Number.isFinite(fpsLive) ? fpsLive.toFixed(1) : '--'}  (note: may not reflect throttle if FPS is sampled elsewhere)`,
            tier: tierFromFps(fpsLive, false),
          });
          const autoTier = (Number.isFinite(aqScale) ? tierFromScale(aqScale) : 'med');
          entries.push({
            text: `AutoQ: eff=${aqEff != null ? aqEff.toFixed(3) : '--'} scale=${Number.isFinite(aqScale) ? aqScale.toFixed(3) : '--'} pressureMul=${pressureMul != null ? Number(pressureMul).toFixed(3) : '--'}`,
            tier: autoTier,
          });
          if (aqDbg) {
            entries.push({
              text:
                `AutoQ dbg: enabled=${aqDbg.enabled ? 'YES' : 'no '} forced=${aqDbg.forced ? (aqDbg.forcedValue != null ? aqDbg.forcedValue.toFixed(2) : 'YES') : 'no '} ` +
                `p95=${Number.isFinite(aqDbg.p95) ? aqDbg.p95.toFixed(1) : '--'}ms mem=${Number.isFinite(aqDbg.memLevel) ? aqDbg.memLevel : '--'} ` +
                `clamp=${Number.isFinite(aqDbg.memClamp) ? aqDbg.memClamp.toFixed(2) : '--'} ` +
                `samples=${Number.isFinite(aqDbg.samples) ? aqDbg.samples : '--'}`,
              tier: (aqDbg.forced || (Number.isFinite(aqDbg.scale) && aqDbg.scale < 0.45)) ? 'low'
                : (Number.isFinite(aqDbg.scale) && aqDbg.scale < 0.75) ? 'med'
                : 'high',
            });
          }

          const txt = entries.map((e) => e.text).join('\n');

          // Always store a snapshot (Perf Lab can print this even when readout is hidden).
          try {
            panel.__dgStateSnapshot = {
              fpsLive: Number.isFinite(fpsLive) ? fpsLive : null,
              fpsDrive: Number.isFinite(fpsDrive) ? fpsDrive : null,
              fpsOverride: fpsOverride > 0 ? fpsOverride : 0,
              lowFpsEmergency: !!__dgLowFpsMode,
              playheadSimple: !!__dgPlayheadSimpleMode,
              particleFieldEnabled: !!particleFieldEnabled,
              particleCount: (pfCount == null ? null : pfCount),
              particleBudgetMaxScale: (maxCountScale == null ? null : maxCountScale),
              particleBudgetCapScale: (capScale == null ? null : capScale),
              particleBudgetSpawnScale: (spawnScale == null ? null : spawnScale),
              particleTargetDesired: Number.isFinite(pfState?.targetDesired) ? pfState.targetDesired : null,
              particleLodScale: Number.isFinite(pfState?.lodScale) ? pfState.lodScale : null,
              particleTickModulo: Number.isFinite(pfCfg?.tickModulo) ? pfCfg.tickModulo : null,
              qlabTargetFps: qFps,
              qlabCpuBurnMs: qBurn,
              qlabForceScale: (qForce == null ? null : qForce),
              autoQualityEffective: (aqEff == null ? null : aqEff),
              autoQualityScale: Number.isFinite(aqScale) ? aqScale : null,
              pressureDprMul: (pressureMul == null ? null : pressureMul),
            };
            panel.__dgStateSnapshotText = txt;
          } catch {}

          // Only touch the DOM when enabled.
          if (enabled) {
            const el = __dgEnsureStateReadoutEl();
            if (el) {
              // Per-line colouring (red/amber/green) for quick scanning.
              const html = entries
                .map((entry) => {
                  const col = __dgReadoutTierToColor(entry.tier);
                  return `<div style="color:${col}">${__dgEscapeHtml(entry.text)}</div>`;
                })
                .join('\n');
              el.style.borderColor = 'rgba(255,255,255,0.18)';
              el.innerHTML = html;
            }
          }
        }
      } catch {}
      // -----------------------------------------------------------------------
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
      const isInteracting = !!(__dgDrawingActive || draggedNode || (cur && previewGid));

      // ---------------------------------------------------------------------------
      // Auto tier bridge (FPS pressure -> tier), with hysteresis.
      //
      // Important:
      // - We do NOT use small-screen/single-toy mode here.
      // - We do NOT introduce cadence stutter; this only reduces *work* (DPR/features).
      // - If something else forces a tier (Perf Lab, API), we do NOT override it.
      //
      // Enable/disable via:
      //   window.__DG_TIER_AUTO = true/false
      // ---------------------------------------------------------------------------
      let pressureMul = __dgGetPressureDprMul();
      try {
        const autoEnabled = (typeof window !== 'undefined') ? (window.__DG_TIER_AUTO ?? true) : false;
        const forcedReason = panel.__dgQualityTierReason;
        const isExternallyForced =
          !!forcedReason && forcedReason !== 'auto' && forcedReason !== 'auto-fps';

        if (autoEnabled && !isExternallyForced) {
          // Convert pressure (≈ how much DPR we’re allowed) into a tier target.
          // Higher pressureMul = healthier FPS headroom.
          const pm = Number.isFinite(pressureMul) ? pressureMul : 1.0;
          let targetTier = 3;
          if (pm <= 0.55) targetTier = -1;
          else if (pm <= 0.64) targetTier = 0;
          else if (pm <= 0.74) targetTier = 1;
          else if (pm <= 0.88) targetTier = 2;
          else targetTier = 3;

          const now = nowTs || (performance?.now?.() ?? Date.now());
          const curTier = (typeof dgQuality.getTier === 'function') ? dgQuality.getTier() : (panel.__dgQualityTier ?? 3);
          const lastChange = Number.isFinite(panel.__dgAutoTierLastChangeTs) ? panel.__dgAutoTierLastChangeTs : 0;
          const minHoldMs = 900; // don’t flap

          // Upgrade hysteresis: require sustained “healthy” pressure before moving up.
          const candTier = Number.isFinite(panel.__dgAutoTierCandidate) ? panel.__dgAutoTierCandidate : null;
          const candSince = Number.isFinite(panel.__dgAutoTierCandidateSince) ? panel.__dgAutoTierCandidateSince : 0;

          if (targetTier < curTier) {
            // Degrade quickly (but still bounded by minHoldMs).
            if ((now - lastChange) >= minHoldMs) {
              dgQuality.setTier(targetTier, 'auto-fps');
              panel.__dgAutoTierLastChangeTs = now;
              panel.__dgAutoTierCandidate = null;
              panel.__dgAutoTierCandidateSince = 0;
            }
          } else if (targetTier > curTier) {
            // Recover slowly: require 2s of stability at the better tier.
            if (candTier !== targetTier) {
              panel.__dgAutoTierCandidate = targetTier;
              panel.__dgAutoTierCandidateSince = now;
            } else if ((now - candSince) >= 2000 && (now - lastChange) >= minHoldMs) {
              dgQuality.setTier(targetTier, 'auto-fps');
              panel.__dgAutoTierLastChangeTs = now;
              panel.__dgAutoTierCandidate = null;
              panel.__dgAutoTierCandidateSince = 0;
            }
          } else {
            // Same target: clear candidate so we don’t “remember” stale upgrades.
            panel.__dgAutoTierCandidate = null;
            panel.__dgAutoTierCandidateSince = 0;
          }

          // Re-read in case we just changed something.
          pressureMul = __dgGetPressureDprMul();
        }
      } catch {}

      const qProfile = dgQuality.getProfile({ isFocused, isInteracting });
      const hasAnyNotes = !!(currentMap && currentMap.active && currentMap.active.some(Boolean));
      const disableOverlayCore = !!(typeof window !== 'undefined' && window.__PERF_DG_OVERLAY_CORE_OFF);
      const zoomForOverlay = Number.isFinite(boardScale) ? boardScale : 1;
      const overlayFlashesEnabled = !disableOverlayCore && (qProfile?.allowOverlaySpecials ?? true);
      const overlayBurstsEnabled = !disableOverlayCore && (qProfile?.allowOverlaySpecials ?? true) && zoomForOverlay > 0.45 && !__dgLowFpsMode;
      const noteEffectCounts = noteEffects.getCounts();
      const flashRecentlyActive = (() => {
        const until = panel.__dgFlashActiveUntil;
        return Number.isFinite(until) && until > 0 && nowTs < until;
      })();
      const hasOverlayFx =
        (overlayFlashesEnabled && ((noteEffectCounts.noteToggleEffects || 0) > 0 || (noteEffectCounts.cellFlashes || 0) > 0)) ||
        (overlayBurstsEnabled && (noteEffectCounts.noteBurstEffects || 0) > 0) ||
        flashRecentlyActive;
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
        isFocused,
        isZoomed,
      });
      const zoomGesturing = (typeof window !== 'undefined' && window.__mtZoomGesturing === true);
      const zoomGestureMoving = !!(zoomGesturing && __lastZoomMotionTs && (nowTs - __lastZoomMotionTs) < ZOOM_STALL_MS);
      const deviceDpr = Math.max(1, Number.isFinite(window?.devicePixelRatio) ? window.devicePixelRatio : 1);
      const gestureMul = __dgComputeGestureBackingMul(zoomGestureMoving);
      const visualMul = __dgComputeVisualBackingMul(Number.isFinite(boardScale) ? boardScale : 1) * gestureMul;
      // pressureMul is computed above (auto-tier bridge) and may have been re-read.
      pressureMul = Number.isFinite(pressureMul) ? pressureMul : __dgGetPressureDprMul();
      const smallMul = __dgComputeSmallPanelBackingMul(cssW, cssH);
      const autoMul = __dgGetAutoQualityMul();

      // Base “device DPR” (respect adaptiveCap if present)
      const baseDeviceDpr = (adaptiveCap ? Math.min(deviceDpr, adaptiveCap) : deviceDpr);

      // Tier-driven pixel cost clamp:
      // - resScale is a soft multiplier
      // - maxDprMul is a hard cap on final DPR relative to baseDeviceDpr
      const tierResMul = (qProfile?.resScale ?? 1.0);
      const tierMaxMul = (qProfile?.maxDprMul ?? 1.0);
      const tierMaxDpr = baseDeviceDpr * tierMaxMul;

      let desiredDprRaw =
        baseDeviceDpr * visualMul * pressureMul * smallMul * autoMul * tierResMul;

      // Hard clamp AFTER all multipliers so tiers can always cut pixels.
      if (Number.isFinite(tierMaxDpr) && tierMaxDpr > 0) {
        desiredDprRaw = Math.min(desiredDprRaw, tierMaxDpr);
      }

      // Persist for debugging / perf trace correlation (cheap)
      try { panel.__dgTierMaxDpr = tierMaxDpr; } catch {}
      try { panel.__dgDesiredDprRaw = desiredDprRaw; } catch {}

      const desiredDpr = __dgCapDprForBackingStore(cssW, cssH, desiredDprRaw, __dgAdaptivePaintDpr);
      const nowAdaptiveTs = nowTs || (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
      const canAdjustDpr =
        !gesturing &&
        !HY.inCommitWindow(nowAdaptiveTs) &&
        __dgStableFramesAfterCommit >= 2 &&
        (nowAdaptiveTs - (__dgLastZoomCommitTs || 0)) > 800 &&
        cssW > 0 &&
        cssH > 0;
      if (typeof window !== 'undefined' && (window.__DG_ADAPTIVE_DPR_ENABLED ?? false)) {
        if (
          canAdjustDpr &&
          (visiblePanels >= 4 || __dgLowFpsMode || (typeof window !== 'undefined' && window.__DG_ADAPTIVE_DPR_ALLOW_SINGLE)) &&
          Number.isFinite(desiredDpr) &&
          Math.abs(desiredDpr - paintDpr) >= 0.15 &&
          (nowAdaptiveTs - __dgAdaptivePaintLastTs) > 240
        ) {
          __dgAdaptivePaintLastTs = nowAdaptiveTs;
          __dgAdaptivePaintDpr = desiredDpr;
          try {
            resizeSurfacesFor(cssW, cssH, desiredDpr, 'adaptivePaintDpr');
          } catch {}

          // If we ever re-enable this, keep the "no delayed redraw" behaviour.
          try {
            if (typeof window !== 'undefined' && window.__DG_REFRESH_DEBUG) {
              dgRefreshTrace('adaptivePaintDpr', { cssW, cssH, desiredDpr, paintDpr, zoomMode });
            }
          } catch {}
          try { markStaticDirty('adaptivePaintDpr'); } catch {}
          __dgForceFullDrawNext = true;
        }
      }

      // Legacy: we no longer modulo-throttle heavy work via effectiveRenderEvery.
      // Pressure is handled via quality tiers + desiredDrawHz gates below.
      let effectiveRenderEvery = 1;

      const disableOverlays = !!(typeof window !== 'undefined' && window.__PERF_DG_DISABLE_OVERLAYS);
      // IMPORTANT: do not disable overlays based on gesture state.
      // If overlays need to scale back, that should be driven by generic pressure (FPS-based) systems.
      const disableOverlaysEffective = disableOverlays;

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
      // BUT: treating *committed* special/colorize strokes as "live overlay" forces a full-canvas
      // clear + composite every frame (very expensive). We only treat overlay strokes as "live"
      // when we're actively previewing a stroke (cur+previewGid) or when the cache explicitly says
      // there are live overlay strokes (e.g. a transient effect).
      let hasOverlayStrokesLive = !!(cur && previewGid);
      if (!hasOverlayStrokesLive) {
        hasOverlayStrokesLive = hasOverlayStrokes;
      }
      // Escape hatch: if you discover a visual regression (special strokes that truly must animate
      // as an overlay every frame), enable this and we will fall back to the old behavior.
      if (!hasOverlayStrokesLive && typeof window !== 'undefined' && window.__DG_OVERLAY_SPECIAL_ALWAYS_LIVE) {
        if (Array.isArray(strokes) && strokes.length) {
          for (let i = 0; i < strokes.length; i++) {
            const s = strokes[i];
            if (s && (s.isSpecial || s.overlayColorize)) { hasOverlayStrokesLive = true; break; }
          }
        }
      }
      // NOTE: "overlayTransport" is meant to keep *existing* overlay visuals animating while the
      // transport is running. It should NOT force overlay passes when there is no overlay content.
      // Otherwise we pay a big full-canvas clear + composite cost every frame during playback.
      let overlayTransport = false;
      let overlayActive = false;
      // Overlay cadence: keep RAF at full rate, but gate *heavy overlay passes*
      // by time instead of frame-modulo.
      //
      // This avoids rhythmic stutter patterns when multiple toys are visible,
      // and plays nicely with variable refresh rates.
      const desiredDrawHz = Number.isFinite(qProfile?.desiredDrawHz) ? qProfile.desiredDrawHz : 60;
      const minOverlayHeavyMs = (desiredDrawHz > 0) ? (1000 / desiredDrawHz) : 0;
      const lastOverlayHeavyTs = Number.isFinite(panel.__dgLastOverlayHeavyTs) ? panel.__dgLastOverlayHeavyTs : 0;
      const forceOverlayHeavy = !!(
        __dgNeedsUIRefresh ||
        __dgFrontSwapNextDraw ||
        __hydrationJustApplied ||
        __dgForceFullDrawNext ||
        (__dgForceFullDrawFrames > 0) ||
        __dgForceOverlayClearNext ||
        __dgForceSwapNext
      );

      let allowOverlayDrawHeavy = allowOverlayDraw;

      // Never time-throttle overlays while interacting or focused.
      if (allowOverlayDrawHeavy && !forceOverlayHeavy && !isInteracting && !isFocused) {
        if (minOverlayHeavyMs > 0 && (nowTs - lastOverlayHeavyTs) < minOverlayHeavyMs) {
          allowOverlayDrawHeavy = false;
        }
      }

      if (allowOverlayDrawHeavy) {
        panel.__dgLastOverlayHeavyTs = nowTs;
      }
      let overlayCoreWanted = (hasOverlayFx || hasOverlayStrokesLive || (cur && previewGid));
      if (!disableOverlayCore) {
        // Only keep overlay passes alive while the transport is running *and* there is overlay work to do.
        // (If flashes are active, panel.__dgFlashLayerEmpty will be false, so the gate won't skip.)
        overlayTransport = !!(transportRunning && overlayCoreWanted);
      }
      // overlayActive is used as a general "is there overlay content?" signal.
      // Do not include overlayTransport here, otherwise transport forces overlays even when empty.
      overlayActive = !!(allowOverlayDraw && (overlayCoreWanted || hasNodeFlash));

      let overlayCoreActive = allowOverlayDrawHeavy && overlayCoreWanted;
      let overlayCompositeNeeded = false;
      let overlayClearedThisFrame = false;
      let __dbgOverlaySpecialCount = null;
      let __dbgOverlayColorizedCount = null;
      let __dbgOverlayHasPreview = null;
      let gotoOverlayEnd = false;

      // PERF: if the flash overlay is known to be empty and there is no active
      // overlay content, skip all overlay passes entirely.
      // This avoids running overlay.core / overlay.flash.pass when idle.
      //
      // NOTE: This gate must account for things that can "wake" overlays later in the frame
      // (eg node flashes, UI refresh). Otherwise we can incorrectly skip overlay work.
      if (
        panel.__dgFlashLayerEmpty &&
        !overlayActive &&
        !overlayTransport &&
        !hasNodeFlash &&
        !__dgNeedsUIRefresh &&
        !panel.__dgFlashOverlayOutOfGrid
      ) {
        panel.__dgLastTransportRunning = transportRunning;
        // No overlay work needed this frame.
        gotoOverlayEnd = true;
        allowOverlayDrawHeavy = false;
        overlayCoreWanted = false;
        overlayCoreActive = false;
      }

      if (!gotoOverlayEnd) {
        if (__perfOn && __overlayGateStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.prep.overlayGate', performance.now() - __overlayGateStart); } catch {}
        }
        if (__perfOn && __prepStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.render.prep', performance.now() - __prepStart); } catch {}
        }

        if (allowOverlayDraw) {
          const lastTransportRunning = !!panel.__dgLastTransportRunning;
          if ((allowOverlayDrawHeavy || (lastTransportRunning && !transportRunning)) && !transportRunning && !overlayActive) {
            const __nowTs = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
            const __flashAliveUntil = panel.__dgFlashActiveUntil || 0;
            const __flashIsEmpty = !!panel.__dgFlashLayerEmpty;

            // Only clear the flash overlay once it has actually been drawn *and* its keepalive has expired.
            // (Avoid per-frame clears when idle; they show up as costly GPU/raster work.)
            if (!__flashIsEmpty && __nowTs >= __flashAliveUntil) {
              const __overlayClearStart = __perfOn ? performance.now() : 0;
              try {
              const flashSurface = getActiveFlashCanvas();
              const __flashDpr = __dgGetCanvasDprFromCss(flashSurface, cssW, paintDpr);
              R.resetCtx(fctx);
              __dgWithLogicalSpaceDpr(R, fctx, __flashDpr, () => {
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
          }
          panel.__dgLastTransportRunning = transportRunning;
        }
      }

      // Particle field visibility is driven by global allow/overview/zoom state.
      // Do NOT toggle visibility just because we're in a brief commit window; that caused resets on pan/zoom release.
      const __particlePrepStart = __perfOn ? performance.now() : 0;
      const disableParticles = !!(typeof window !== 'undefined' && window.__PERF_DG_DISABLE_PARTICLES);
      const particleStateAllowed =
        DRAWGRID_ENABLE_PARTICLE_FIELD &&
        !zoomDebugFreeze &&
        particleFieldEnabled;

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
        (qProfile?.allowParticles ?? true) &&
        (!shouldThrottleForZoom || recentPoke || emergencyMode);
      const skipDomUpdates =
        !!(typeof window !== 'undefined' && window.__PERF_NO_DOM_UPDATES) &&
        (typeof window !== 'undefined' && window.__mtZoomGesturing === true);
      const nextParticleVisible = !!particleStateAllowed && !disableParticles;
      if (!skipDomUpdates && particleCanvas && particleCanvasVisible !== nextParticleVisible) {
        const __particleToggleStart = __perfOn ? performance.now() : 0;
        particleCanvasVisible = nextParticleVisible;
        particleCanvas.style.opacity = nextParticleVisible ? '1' : '0';
        dgParticleBootLog('visibility:toggle', {
          panelId: panel?.id || null,
          visible: nextParticleVisible,
          particleFieldEnabled,
          disableParticles,
          isPanelVisible,
        });
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
        if (!disableParticles && cssW > 0 && cssH > 0) {
          const x = 0;
          const y = 0;
          const w = Math.max(0, cssW);
          const h = Math.max(0, cssH);
          const key = `${Math.round(w)}|${Math.round(h)}`;
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
      if (getTutorialHighlightMode() !== 'none') {
        doFullDraw = true;
      }

      // Perf gate:
      // During active camera gesture motion, avoid repainting static layers (grid/nodes)
      // unless explicitly forced. This targets the "nonScript" cost (raster/composite)
      // that dominates in focus runs, while keeping correctness because:
      // - panel.__dgStaticDirty remains true
      // - a redraw will happen naturally once motion stops or when we forceFullDraw
      //
      // Override for debugging/verification:
      //   window.__DG_FREEZE_STATIC_DURING_GESTURE = false
      try {
        const freezeStaticDuringGesture =
          (typeof window === 'undefined') ? true : (window.__DG_FREEZE_STATIC_DURING_GESTURE !== false);
        if (freezeStaticDuringGesture && doFullDraw && !forceFullDraw && zoomGestureMoving) {
          doFullDraw = false;
        }
      } catch {}

      const overlayFxWanted = hasOverlayFx || (overlayFlashesEnabled && hasNodeFlash);
      overlayActive = allowOverlayDraw && (overlayFxWanted || overlayTransport || hasOverlayStrokesLive || (cur && previewGid));
      allowOverlayDrawHeavy = allowOverlayDrawHeavy && (
        overlayFxWanted ||
        overlayTransport ||
        hasOverlayStrokesLive ||
        (cur && previewGid) ||
        __dgNeedsUIRefresh ||
        hasNodeFlash
      );
      overlayCoreWanted = (overlayFxWanted || hasOverlayStrokesLive || (cur && previewGid));
      overlayCoreActive = allowOverlayDrawHeavy && overlayCoreWanted;
      if (gotoOverlayEnd) {
        overlayActive = false;
        allowOverlayDrawHeavy = false;
        overlayCoreWanted = false;
        overlayCoreActive = false;
      }

      // Perf gate:
      // During active camera gesture motion, avoid repainting *heavy* overlay core every frame
      // unless it is required for correctness (live strokes / preview / transport / forced UI refresh).
      //
      // Override for debugging/verification:
      //   window.__DG_FREEZE_OVERLAY_DURING_GESTURE = false
      try {
        const freezeOverlayDuringGesture =
          (typeof window === 'undefined') ? true : (window.__DG_FREEZE_OVERLAY_DURING_GESTURE !== false);
        const overlayNeedsRealtime =
          overlayTransport || hasOverlayStrokesLive || (cur && previewGid) || __dgNeedsUIRefresh || hasNodeFlash;
        if (freezeOverlayDuringGesture && zoomGestureMoving && !forceFullDraw && !overlayNeedsRealtime) {
          allowOverlayDrawHeavy = false;
          overlayCoreActive = false;
        }
      } catch {}

      const needsFx = overlayCoreActive || __dgNeedsUIRefresh || hasNodeFlash;
      // IMPORTANT: overlayDirty must mean “we need to re-render overlay core”.
      // A layer being *non-empty* is NOT “dirty” — cached layers should be allowed to persist
      // without forcing expensive overlay redraw every frame.
      try {
        if (!overlayCoreWanted) panel.__dgOverlayCorePainted = false;
      } catch {}
      const overlayDirtyBase =
        !!panel.__dgOverlayDirty ||
        __dgNeedsUIRefresh ||
        hasNodeFlash;
      const overlayNeedsFirstPaint =
        !!overlayCoreWanted && !panel.__dgOverlayCorePainted;
      const overlayDirty = overlayDirtyBase || overlayNeedsFirstPaint;
      if (overlayDirtyBase) {
        try { panel.__dgOverlayDirty = false; } catch {}
      }
      if (DG_SINGLE_CANVAS && canDrawAnything) {
        const needsFullDraw =
          panel.__dgSingleCompositeDirty ||
          __dgNeedsUIRefresh ||
          __dgFrontSwapNextDraw ||
          __hydrationJustApplied ||
          forceFullDraw ||
          !panel.__dgGridHasPainted ||
          getTutorialHighlightMode() !== 'none';
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
          // PERF: don't back-sync (front -> back) during generic UI refresh by default.
          // Back-sync is only *required* right before we actually swap buffers (handled elsewhere),
          // and doing it here is extremely expensive (copies multiple canvases).
          const __uiRefreshBackSync = (typeof window !== 'undefined') ? !!window.__DG_UI_REFRESH_BACKSYNC : false;
          if (__uiRefreshBackSync && !usingBackBuffers && typeof ensureBackVisualsFreshFromFront === 'function') {
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
          // Ghost trail should NEVER be cleared by gesture settle / re-snap.
          // Only clear it when the ghost backing store has actually changed (resize / DPR change)
          // or when explicitly stopped via stopGhostGuide({ immediate: true }).
          if (ghostCtx?.canvas) {
            const ghostSurface = getActiveGhostCanvas();
            // IMPORTANT: use the context that matches the currently-active ghost surface.
            // During buffer swaps, the global ghostCtx can point at the other buffer which causes
            // ghost visuals to scale incorrectly on subsequent passes.
            const __ghostCtx = (usingBackBuffers ? ghostBackCtx : ghostFrontCtx) || ghostCtx;
            const ghostDpr = __dgGetCanvasDprFromCss(ghostSurface || __ghostCtx?.canvas, cssW, paintDpr);
            const __ghostKey = `${cssW}x${cssH}@${ghostDpr}`;
            const __prevGhostKey = panel.__dgGhostClearKey || null;
            const __shouldClearGhost = (__prevGhostKey !== __ghostKey);
            if (__shouldClearGhost) {
              panel.__dgGhostClearKey = __ghostKey;
              R.resetCtx(__ghostCtx);
              __dgWithLogicalSpaceDpr(R, __ghostCtx, ghostDpr, () => {
                const { x, y, w, h } = R.getOverlayClearRect({
                  canvas: ghostSurface || __ghostCtx.canvas,
                  pad: R.getOverlayClearPad() * 1.2,
                  gridArea,
                });
                __ghostCtx.clearRect(x, y, w, h);
              });
              markGhostLayerCleared();
              try {
                if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
                  dgGhostTrace('clear:do', {
                    id: panel?.id || null,
                    reason: 'ui:refresh:overlay-clear',
                    key: __ghostKey,
                    prevKey: __prevGhostKey,
                  });
                }
              } catch {}
            } else {
              // Preserve existing trail.
              try {
                if (
                  typeof window !== 'undefined' &&
                  window.__DG_GHOST_TRACE &&
                  !window.__DG_GHOST_TRACE_CLEAR_ONLY
                ) {
                  dgGhostTrace('clear:skip (preserve-trail)', {
                    id: panel?.id || null,
                    reason: 'ui:refresh:overlay-clear',
                    key: __ghostKey,
                  });
                }
              } catch {}
            }
          }
          if (fctx?.canvas) {
            const flashSurface = getActiveFlashCanvas();
            const __flashDpr = __dgGetCanvasDprFromCss(flashSurface, cssW, paintDpr);
            R.resetCtx(fctx);
            __dgWithLogicalSpaceDpr(R, fctx, __flashDpr, () => {
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
    if (allowOverlayDrawHeavy && needsFx && overlayDirty) {
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
      const __flashDpr = __dgGetCanvasDprFromCss(flashSurface, cssW, paintDpr);
      const __withFlashLogical = (fn) => __dgWithLogicalSpaceDpr(R, fctx, __flashDpr, fn);
      R.resetCtx(fctx);
      __dgWithLogicalSpaceDpr(R, fctx, __flashDpr, () => {
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
            __dgWithLogicalSpaceDpr(R, fctx, __flashDpr, () => {
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
            __withFlashLogical(() => {
              // Draw demoted colorized strokes as static overlay tints
              try {
                const __colorStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
                  ? performance.now()
                  : 0;
                if (colorized.length) {
                  const flashSurface = getActiveFlashCanvas();
                  const baseW = flashSurface?.width || fctx.canvas?.width || 0;
                  const baseH = flashSurface?.height || fctx.canvas?.height || 0;
                  const cacheKey = `${__dgOverlayStrokeListCache.paintRev}|${__dgOverlayStrokeListCache.len}|${colorized.length}|${baseW}x${baseH}|${__flashDpr}`;
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
                      cctx.save();
                      cctx.setTransform(__flashDpr, 0, 0, __flashDpr, 0, 0);
                      for (const s of colorized) drawFullStroke(cctx, s, { skipReset: true, skipTransform: true });
                      cctx.restore();
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
      try { panel.__dgOverlayCorePainted = true; } catch {}
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
              overlayActive,
              overlayCoreWanted,
              overlayCoreActive,
              hasOverlayStrokes,
              hasOverlayStrokesLive,
              disableOverlayStrokes,
              hasOverlayFx,
              overlayTransport,
              desiredDrawHz,
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

    {
      const noteResult = noteEffects.renderNoteEffects({
        allowOverlayDraw,
        allowOverlayDrawHeavy,
        disableOverlayCore,
        overlayFlashesEnabled,
        overlayBurstsEnabled,
        overlayCompositeNeeded,
        frameCam,
        perfOn: __perfOn,
      });
      overlayCompositeNeeded = noteResult.overlayCompositeNeeded;
    }

    if (__frameStart) {
      const __frameDt = performance.now() - __frameStart;
      try { window.__PerfFrameProf?.mark?.('drawgrid.frame.total', __frameDt); } catch {}
    }
    // Draw scrolling playhead (extracted)
    {
      const playheadResult = playheadRender.renderPlayhead({
        allowOverlayDraw,
        disableOverlayCore,
        allowOverlayDrawHeavy,
        overlayCoreWanted,
        overlayClearedThisFrame,
        overlayCompositeNeeded,
        zoomForOverlay,
        fpsLive,
        perfOn: __perfOn,
        isActiveInChain,
      });
      overlayCompositeNeeded = playheadResult.overlayCompositeNeeded;
      overlayClearedThisFrame = playheadResult.overlayClearedThisFrame;
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
      if (drawing || __dgSkipSwapsDuringDrag) {
        // Defer composite while the user is actively drawing; otherwise it can
        // overwrite the live front-buffer stroke with stale back content.
        __dgNeedsUIRefresh = true;
      } else {
      const __compositeStart = (__perfOn && typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : 0;
      compositeSingleCanvas();
      panel.__dgSingleCompositeDirty = false;
      if (__perfOn && __compositeStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.draw.composite', performance.now() - __compositeStart); } catch {}
      }
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

  ({
    applyInstrumentFromState,
    captureState,
    restoreFromState,
    cancelPostRestoreStabilize,
    schedulePostRestoreStabilize,
  } = createDgStateIo({
    state: {
      get panel() { return panel; },
      get cols() { return cols; },
      get autoTune() { return autoTune; },
      get gridArea() { return gridArea; },
      get topPad() { return topPad; },
      get strokes() { return strokes; },
      set strokes(v) { strokes = v; },
      get currentMap() { return currentMap; },
      set currentMap(v) { currentMap = v; },
      get nodeGroupMap() { return nodeGroupMap; },
      set nodeGroupMap(v) { nodeGroupMap = v; },
      get manualOverrides() { return manualOverrides; },
      set manualOverrides(v) { manualOverrides = v; },
      get persistentDisabled() { return persistentDisabled; },
      set persistentDisabled(v) { persistentDisabled = v; },
      get isRestoring() { return isRestoring; },
      set isRestoring(v) { isRestoring = v; },
      get __hydrationJustApplied() { return __hydrationJustApplied; },
      set __hydrationJustApplied(v) { __hydrationJustApplied = v; },
      get __dgHydrationPendingRedraw() { return __dgHydrationPendingRedraw; },
      set __dgHydrationPendingRedraw(v) { __dgHydrationPendingRedraw = v; },
      get __dgNeedsUIRefresh() { return __dgNeedsUIRefresh; },
      set __dgNeedsUIRefresh(v) { __dgNeedsUIRefresh = v; },
      get __dgFrontSwapNextDraw() { return __dgFrontSwapNextDraw; },
      set __dgFrontSwapNextDraw(v) { __dgFrontSwapNextDraw = v; },
      get __dgForceFullDrawNext() { return __dgForceFullDrawNext; },
      set __dgForceFullDrawNext(v) { __dgForceFullDrawNext = v; },
      get __dgForceFullDrawFrames() { return __dgForceFullDrawFrames; },
      set __dgForceFullDrawFrames(v) { __dgForceFullDrawFrames = v; },
      get __dgStableFramesAfterCommit() { return __dgStableFramesAfterCommit; },
      set __dgStableFramesAfterCommit(v) { __dgStableFramesAfterCommit = v; },
      get __dgPaintRev() { return __dgPaintRev; },
      get cssW() { return cssW; },
      get cssH() { return cssH; },
      get paintDpr() { return paintDpr; },
      get pctx() { return pctx; },
      get nctx() { return nctx; },
      get fctx() { return fctx; },
      get __dgPostRestoreStabilizeRAF() { return __dgPostRestoreStabilizeRAF; },
      set __dgPostRestoreStabilizeRAF(v) { __dgPostRestoreStabilizeRAF = v; },
    },
    deps: {
      computeSerializedNodeStats,
      updateHydrateInboundFromState,
      schedulePersistState,
      markStaticDirty,
      ensurePostCommitRedraw,
      requestFrontSwap,
      useFrontBuffers,
      HY,
      layout,
      drawFullStroke,
      regenerateMapFromStrokes: () => regenerateMapFromStrokes(),
      normalizeMapColumns,
      R,
      __dgGetCanvasDprFromCss,
      __dgWithLogicalSpaceDpr,
      __dgWithLogicalSpace,
      dgTraceLog,
      emitDG,
      emitDrawgridUpdate,
      getActiveFlashCanvas,
      FD,
      resnapAndRedraw,
      getGhostGuideAutoActive,
      hasOverlayStrokesCached,
      dgGhostTrace,
    },
  }));
  ({ clearDrawgridInternal } = createDgClear({
    state: {
      get panel() { return panel; },
      get DG_HYDRATE() { return DG_HYDRATE; },
      get strokes() { return strokes; },
      set strokes(v) { strokes = v; },
      get currentMap() { return currentMap; },
      set currentMap(v) { currentMap = v; },
      get nodeCoordsForHitTest() { return nodeCoordsForHitTest; },
      set nodeCoordsForHitTest(v) { nodeCoordsForHitTest = v; },
      get draggedNode() { return draggedNode; },
      set draggedNode(v) { draggedNode = v; },
      get cols() { return cols; },
      get __dgOverlayStrokeListCache() { return __dgOverlayStrokeListCache; },
      set __dgOverlayStrokeListCache(v) { __dgOverlayStrokeListCache = v; },
      get __dgOverlayStrokeCache() { return __dgOverlayStrokeCache; },
      set __dgOverlayStrokeCache(v) { __dgOverlayStrokeCache = v; },
      get prevStrokeCount() { return prevStrokeCount; },
      set prevStrokeCount(v) { prevStrokeCount = v; },
      get manualOverrides() { return manualOverrides; },
      set manualOverrides(v) { manualOverrides = v; },
      get persistentDisabled() { return persistentDisabled; },
      set persistentDisabled(v) { persistentDisabled = v; },
      get __dgPaintRev() { return __dgPaintRev; },
      get usingBackBuffers() { return usingBackBuffers; },
      get paint() { return paint; },
      get backCanvas() { return backCanvas; },
      get flashCanvas() { return flashCanvas; },
      get flashBackCanvas() { return flashBackCanvas; },
      get paintDpr() { return paintDpr; },
      get cssW() { return cssW; },
      get pctx() { return pctx; },
      get backCtx() { return backCtx; },
      get frontCtx() { return frontCtx; },
      get nctx() { return nctx; },
      get fctx() { return fctx; },
      get flashBackCtx() { return flashBackCtx; },
      get flashFrontCtx() { return flashFrontCtx; },
      get gridArea() { return gridArea; },
      get drawLabelState() { return drawLabelState; },
      get noteEffects() { return noteEffects; },
      get DG_SINGLE_CANVAS() { return DG_SINGLE_CANVAS; },
      get isPanelVisible() { return isPanelVisible; },
      get nextDrawTarget() { return nextDrawTarget; },
      set nextDrawTarget(v) { nextDrawTarget = v; },
      get hasOverlayStrokesCached() { return hasOverlayStrokesCached; },
    },
    deps: {
      inboundWasNonEmpty,
      markUserChange,
      dgTraceWarn,
      dgTraceLog,
      dgGhostTrace,
      __dgGhostMaybeStack,
      FD,
      R,
      emitDG,
      emitDrawgridUpdate,
      drawGrid,
      updateGeneratorButtons,
      updateDrawLabel,
      getActiveFlashCanvas,
      markFlashLayerCleared,
      __dgGetCanvasDprFromCss,
      __dgWithLogicalSpaceDpr,
      __dgMarkSingleCanvasDirty,
      compositeSingleCanvas,
      getGhostGuideRunning,
      getGhostGuideAutoActive,
      startAutoGhostGuide,
      stopAutoGhostGuide,
    },
  }));
  ({ setState } = createDgSetState({
    state: {
      get panel() { return panel; },
      get cols() { return cols; },
      set cols(v) { cols = v; },
      get currentCols() { return currentCols; },
      set currentCols(v) { currentCols = v; },
      get flashes() { return flashes; },
      set flashes(v) { flashes = v; },
      get gridArea() { return gridArea; },
      get topPad() { return topPad; },
      get strokes() { return strokes; },
      set strokes(v) { strokes = v; },
      get currentMap() { return currentMap; },
      set currentMap(v) { currentMap = v; },
      get nodeGroupMap() { return nodeGroupMap; },
      set nodeGroupMap(v) { nodeGroupMap = v; },
      get manualOverrides() { return manualOverrides; },
      set manualOverrides(v) { manualOverrides = v; },
      get persistentDisabled() { return persistentDisabled; },
      set persistentDisabled(v) { persistentDisabled = v; },
      get autoTune() { return autoTune; },
      set autoTune(v) { autoTune = v; },
      get isRestoring() { return isRestoring; },
      set isRestoring(v) { isRestoring = v; },
      get __hydrationJustApplied() { return __hydrationJustApplied; },
      set __hydrationJustApplied(v) { __hydrationJustApplied = v; },
      get __dgHydrationPendingRedraw() { return __dgHydrationPendingRedraw; },
      set __dgHydrationPendingRedraw(v) { __dgHydrationPendingRedraw = v; },
      get __dgNeedsUIRefresh() { return __dgNeedsUIRefresh; },
      set __dgNeedsUIRefresh(v) { __dgNeedsUIRefresh = v; },
      get __dgFrontSwapNextDraw() { return __dgFrontSwapNextDraw; },
      set __dgFrontSwapNextDraw(v) { __dgFrontSwapNextDraw = v; },
      get __dgForceFullDrawNext() { return __dgForceFullDrawNext; },
      set __dgForceFullDrawNext(v) { __dgForceFullDrawNext = v; },
      get __dgForceFullDrawFrames() { return __dgForceFullDrawFrames; },
      set __dgForceFullDrawFrames(v) { __dgForceFullDrawFrames = v; },
      get DG_HYDRATE() { return DG_HYDRATE; },
      get STROKE_COLORS() { return STROKE_COLORS; },
    },
    deps: {
      getFallbackHydrationState,
      computeSerializedNodeStats,
      dgTraceLog,
      updateHydrateInboundFromState,
      applyInstrumentFromState,
      resnapAndRedraw,
      layout,
      clearAndRedrawFromStrokes,
      drawGrid,
      drawNodes,
      emitDrawgridUpdate,
      __dgBumpNodesRev,
      updateGeneratorButtons,
      markStaticDirty,
      ensurePostCommitRedraw,
      requestFrontSwap,
      useFrontBuffers,
      schedulePostRestoreStabilize,
      scheduleGhostIfEmpty,
      captureState,
      inboundWasNonEmpty,
      computeCurrentMapNodeStats,
      schedulePersistState,
      HY,
    },
  }));
  const api = {
    panel,
    startGhostGuide,
    stopGhostGuide,
    __inboundNonEmpty: () => inboundWasNonEmpty(),
    clear: clearDrawgridInternal,
    getState: captureState,
    hasActiveNotes: () => {
      try {
        return !!(currentMap?.active && currentMap.active.some(Boolean));
      } catch { return false; }
    },
    restoreState: restoreFromState,
    setState,
    setQualityTier: (tier, reason = 'api') => dgQuality.setTier(tier, reason),
    getQualityProfile: (opts = {}) => dgQuality.getProfile(opts),
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

  // When we change strokes programmatically (eg Random) we must invalidate overlay caches
  // and force a redraw; otherwise (especially while playing / with front buffers) we can
  // show only the backing line until another event (eg Play toggle) triggers a full refresh.
  function __dgAfterProgrammaticVisualChange(reason) {
    try {
      const snap = __dgEnsureLayerSizes('programmatic-visual');
      if (!snap) {
        try { layout(true); } catch {}
        try { __dgEnsureLayerSizes('programmatic-visual:layout'); } catch {}
      }
    } catch {}
    try { markPaintDirty(); } catch {}
    try { __dgOverlayStrokeListCache.paintRev = -1; __dgOverlayStrokeListCache.len = -1; } catch {}
    try { panel.__dgSingleCompositeDirty = true; } catch {}
    try { __dgNeedsUIRefresh = true; } catch {}
    try { __dgFrontSwapNextDraw = true; } catch {}
    try { __dgForceFullDrawNext = true; } catch {}
    try { __dgForceFullDrawFrames = Math.max(__dgForceFullDrawFrames || 0, 2); } catch {}
    try { markStaticDirty(reason || 'programmatic-visual'); } catch {}
    try { ensurePostCommitRedraw(reason || 'programmatic-visual'); } catch {}
    try { if (typeof requestFrontSwap === 'function') requestFrontSwap(useFrontBuffers); } catch {}
  }

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
      try { ensureSizeReady({ force: true }); } catch {}
      try { layout(true); } catch {}
      try { __dgEnsureLayerSizes('random:pre', { force: true }); } catch {}
      try { pctx = (typeof getActivePaintCtx === 'function') ? getActivePaintCtx() : pctx; } catch {}
      try { if (!usingBackBuffers) ensureBackVisualsFreshFromFront?.(); } catch {}
      if (typeof window !== 'undefined' && window.__DG_RANDOM_TRACE) {
        try {
          const pCanvas = pctx?.canvas || null;
          const payload = {
            panelId: panel?.id || null,
            kind,
            cssW,
            cssH,
            paintDpr,
            usingBackBuffers,
            pctxRole: pCanvas?.getAttribute?.('data-role') || null,
            pctxSize: pCanvas ? { w: pCanvas.width, h: pCanvas.height } : null,
            frontCtx: frontCtx?.canvas ? { role: frontCtx.canvas.getAttribute?.('data-role') || null, w: frontCtx.canvas.width, h: frontCtx.canvas.height } : null,
            backCtx: backCtx?.canvas ? { role: backCtx.canvas.getAttribute?.('data-role') || null, w: backCtx.canvas.width, h: backCtx.canvas.height } : null,
          };
          if (window.__DG_RANDOM_TRACE_VERBOSE) {
            const snap = __dgGetLayerSizingSnapshot?.();
            const flashCanvasNow = fctx?.canvas || null;
            const paintRect = pCanvas?.getBoundingClientRect?.();
            const flashRect = flashCanvasNow?.getBoundingClientRect?.();
            const wrapRect = wrap?.getBoundingClientRect?.();
            const layersRect = layersRoot?.getBoundingClientRect?.();
            payload.DG_SINGLE_CANVAS = DG_SINGLE_CANVAS;
            payload.DG_SINGLE_CANVAS_OVERLAYS = DG_SINGLE_CANVAS_OVERLAYS;
            payload.gridArea = gridArea ? { x: gridArea.x, y: gridArea.y, w: gridArea.w, h: gridArea.h } : null;
            payload.cw = cw;
            payload.ch = ch;
            payload.paintRect = paintRect ? { w: paintRect.width, h: paintRect.height } : null;
            payload.flashRect = flashRect ? { w: flashRect.width, h: flashRect.height } : null;
            payload.wrapRect = wrapRect ? { w: wrapRect.width, h: wrapRect.height } : null;
            payload.layersRect = layersRect ? { w: layersRect.width, h: layersRect.height } : null;
            payload.flashDisplay = flashCanvasNow?.style?.display || null;
            payload.paintDisplay = pCanvas?.style?.display || null;
            payload.pctxSize = pCanvas ? { w: pCanvas.width, h: pCanvas.height, cssW: pCanvas.style?.width || null, cssH: pCanvas.style?.height || null } : null;
            payload.frontCtx = frontCtx?.canvas ? { role: frontCtx.canvas.getAttribute?.('data-role') || null, w: frontCtx.canvas.width, h: frontCtx.canvas.height, cssW: frontCtx.canvas.style?.width || null, cssH: frontCtx.canvas.style?.height || null } : null;
            payload.backCtx = backCtx?.canvas ? { role: backCtx.canvas.getAttribute?.('data-role') || null, w: backCtx.canvas.width, h: backCtx.canvas.height, cssW: backCtx.canvas.style?.width || null, cssH: backCtx.canvas.style?.height || null } : null;
            payload.snap = snap;
          }
          console.log('[DG][random][pre]', JSON.stringify(payload));
        } catch {}
      }
      try { __dgEnsureLayerSizes('random'); } catch {}
      if (kind === 'toy-random') RNG.handleRandomizeLine();
      else if (kind === 'toy-random-blocks') RNG.handleRandomizeBlocks();
      else if (kind === 'toy-random-notes') RNG.handleRandomizeNotes();
      // Random changes can drastically alter nodes/connectors. Ensure we don't reuse stale cached bitmaps.
      try { nodesRender?.resetNodesCache?.(); } catch {}
      try { nodesRender?.resetBlocksCache?.(); } catch {}
      __dgAfterProgrammaticVisualChange(kind);
      if (typeof window !== 'undefined' && window.__DG_RANDOM_TRACE) {
        try {
          const pCanvas = pctx?.canvas || null;
          const payload = {
            panelId: panel?.id || null,
            kind,
            cssW,
            cssH,
            paintDpr,
            usingBackBuffers,
            pctxRole: pCanvas?.getAttribute?.('data-role') || null,
            pctxSize: pCanvas ? { w: pCanvas.width, h: pCanvas.height } : null,
            frontCtx: frontCtx?.canvas ? { role: frontCtx.canvas.getAttribute?.('data-role') || null, w: frontCtx.canvas.width, h: frontCtx.canvas.height } : null,
            backCtx: backCtx?.canvas ? { role: backCtx.canvas.getAttribute?.('data-role') || null, w: backCtx.canvas.width, h: backCtx.canvas.height } : null,
          };
          if (window.__DG_RANDOM_TRACE_VERBOSE) {
            const snap = __dgGetLayerSizingSnapshot?.();
            const flashCanvasNow = fctx?.canvas || null;
            const paintRect = pCanvas?.getBoundingClientRect?.();
            const flashRect = flashCanvasNow?.getBoundingClientRect?.();
            const wrapRect = wrap?.getBoundingClientRect?.();
            const layersRect = layersRoot?.getBoundingClientRect?.();
            payload.DG_SINGLE_CANVAS = DG_SINGLE_CANVAS;
            payload.DG_SINGLE_CANVAS_OVERLAYS = DG_SINGLE_CANVAS_OVERLAYS;
            payload.gridArea = gridArea ? { x: gridArea.x, y: gridArea.y, w: gridArea.w, h: gridArea.h } : null;
            payload.cw = cw;
            payload.ch = ch;
            payload.paintRect = paintRect ? { w: paintRect.width, h: paintRect.height } : null;
            payload.flashRect = flashRect ? { w: flashRect.width, h: flashRect.height } : null;
            payload.wrapRect = wrapRect ? { w: wrapRect.width, h: wrapRect.height } : null;
            payload.layersRect = layersRect ? { w: layersRect.width, h: layersRect.height } : null;
            payload.flashDisplay = flashCanvasNow?.style?.display || null;
            payload.paintDisplay = pCanvas?.style?.display || null;
            payload.pctxSize = pCanvas ? { w: pCanvas.width, h: pCanvas.height, cssW: pCanvas.style?.width || null, cssH: pCanvas.style?.height || null } : null;
            payload.frontCtx = frontCtx?.canvas ? { role: frontCtx.canvas.getAttribute?.('data-role') || null, w: frontCtx.canvas.width, h: frontCtx.canvas.height, cssW: frontCtx.canvas.style?.width || null, cssH: frontCtx.canvas.style?.height || null } : null;
            payload.backCtx = backCtx?.canvas ? { role: backCtx.canvas.getAttribute?.('data-role') || null, w: backCtx.canvas.width, h: backCtx.canvas.height, cssW: backCtx.canvas.style?.width || null, cssH: backCtx.canvas.style?.height || null } : null;
            payload.snap = snap;
          }
          console.log('[DG][random][post]', JSON.stringify(payload));
        } catch {}
      }
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























