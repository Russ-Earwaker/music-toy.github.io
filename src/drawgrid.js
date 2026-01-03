// src/drawgrid.js
// Minimal, scoped Drawing Grid -- 16x12, draw strokes, build snapped nodes on release.
// Strictly confined to the provided panel element.
import { buildPalette, midiToName } from './note-helpers.js';
import { drawBlock } from './toyhelpers.js';
import { getLoopInfo, isRunning } from './audio-core.js';
import { onZoomChange, getZoomState, getFrameStartState, onFrameStart, namedZoomListener } from './zoom/ZoomCoordinator.js';
import { createParticleViewport } from './particles/particle-viewport.js';
import { createField } from './particles/field-generic.js';
import { getParticleBudget, getAdaptiveFrameBudget } from './particles/ParticleQuality.js';
import { overviewMode } from './overview-mode.js';
import { boardScale as boardScaleHelper } from './board-scale-helpers.js';
import { beginFrameLayoutCache, getRect } from './layout-cache.js';
import { makeDebugLogger } from './debug-flags.js';
import { startSection } from './perf-meter.js';

const drawgridLog = makeDebugLogger('mt_debug_logs', 'log');

const gridAreaLogical = { w: 0, h: 0 };

// Shared global state across all drawgrid instances (keeps counts for LOD decisions).
const globalDrawgridState = (() => {
  if (typeof window !== 'undefined') {
    window.__DRAWGRID_GLOBAL = window.__DRAWGRID_GLOBAL || { visibleCount: 0 };
    return window.__DRAWGRID_GLOBAL;
  }
  return { visibleCount: 0 };
})();

// If more than this many drawgrids are on-screen, disable expensive particle fields per-panel.
const DG_MAX_PARTICLE_PANELS = 2;

// Lightweight profiling for drawGrid; flip to true when testing.
const DG_PROFILE = false;
// Turn on to log slow drawgrid frames (full rAF body).
const DG_FRAME_PROFILE = false;
const DG_FRAME_SLOW_THRESHOLD_MS = 10;
const DG_ADAPTIVE_SHARED_MIN_MS = 900;
const DG_ADAPTIVE_SHARED_GESTURE_MS = 260;
const DG_ADAPTIVE_FPS_DELTA_MIN = 2;

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

function perfMark(dtUpdate, dtDraw) {
  try {
    if (Number.isFinite(dtUpdate)) window.__PerfFrameProf?.mark?.('drawgrid.update', dtUpdate);
    if (Number.isFinite(dtDraw)) window.__PerfFrameProf?.mark?.('drawgrid.draw', dtDraw);
  } catch {}
}

function perfMarkSection(name, fn) {
  if (!window.__PerfFrameProf || typeof performance === 'undefined' || typeof performance.now !== 'function') {
    return fn();
  }
  const start = performance.now();
  try {
    return fn();
  } finally {
    const end = performance.now();
    try { window.__PerfFrameProf?.mark?.(name, end - start); } catch {}
  }
}

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

try { startAdaptiveSharedTicker(); } catch {}

function __dgGestureDrawModulo() {
  // Base modulo from perf toggles (stress harness)
  let base = 1;
  try {
    const m = window?.__PERF_PARTICLES?.gestureDrawModulo;
    if (Number.isFinite(m) && m >= 1) base = Math.floor(m);
  } catch {}

  // If we only have a couple of drawgrids visible, DO NOT throttle draw frequency.
  // This preserves "smooth" feel for single-toy pan/zoom.
  try {
    const vc = window?.__DRAWGRID_GLOBAL?.visibleCount;
    if (Number.isFinite(vc) && vc <= 2) return 1;
  } catch {}

  return base;
}

// --- Performance / LOD tuning ----------------------------------------

// Below this FPS we start aggressively disabling the fancy background field.
// Hysteresis means we only re-enable once FPS climbs comfortably above.
const DG_MIN_FPS_FOR_PARTICLE_FIELD = 32;  // degrade if we live below this
const DG_FPS_PARTICLE_HYSTERESIS_UP = 38;  // re-enable once we're above this
const DG_PLAYHEAD_FPS_SIMPLE_ENTER = 28;
const DG_PLAYHEAD_FPS_SIMPLE_EXIT = 34;

// IntersectionObserver visibility threshold – panels with <2% on-screen area
// are treated as "offscreen" and have their heavy work culled.
const DG_VISIBILITY_THRESHOLD = 0.001;

let dgProfileFrames = 0;
let dgProfileSumMs = 0;
let dgProfileMinMs = Infinity;
let dgProfileMaxMs = 0;

function dgProfileSample(dtMs) {
  dgProfileFrames++;
  dgProfileSumMs += dtMs;
  if (dtMs < dgProfileMinMs) dgProfileMinMs = dtMs;
  if (dtMs > dgProfileMaxMs) dgProfileMaxMs = dtMs;

  // Only log occasionally to avoid spamming the console
  if (dgProfileFrames % 60 === 0) {
    let nodeCount = 0;
    if (currentMap?.nodes && Array.isArray(currentMap.nodes)) {
      for (const col of currentMap.nodes) {
        if (!col) continue;
        // nodes are Sets / Maps with .size
        if (typeof col.size === 'number') {
          nodeCount += col.size;
        }
      }
    }

    const avg = dgProfileFrames > 0 ? dgProfileSumMs / dgProfileFrames : 0;

    console.log('[DG][profile] drawGrid', {
      frames: dgProfileFrames,
      lastFrameMs: Number(dtMs.toFixed(3)),
      avgFrameMs: Number(avg.toFixed(3)),
      minFrameMs: Number(dgProfileMinMs.toFixed(3)),
      maxFrameMs: Number(dgProfileMaxMs.toFixed(3)),
      strokes: Array.isArray(strokes) ? strokes.length : null,
      nodeCount,
    });
  }
}

// --- Global Debug Buffer + helpers ---
(function () {
  if (typeof window === 'undefined') return;

  // Single global array for all DG debug logs
  if (!window.DG_LOGS) window.DG_LOGS = [];

  // Debug helper that stores logs AND prints as a JSON string
  window.DG_LOG = function DG_LOG(entry) {
    try {
      window.DG_LOGS.push(entry);
      const line = JSON.stringify(entry);
      // One-line JSON, easy to copy
      console.log('[DG][DBG]', line);
    } catch (err) {
      console.warn('DG_LOG failed', err);
    }
  };

  // Helper to dump just the zoom logs as one big block of text
  window.dumpDGZoomLogs = function dumpDGZoomLogs() {
    try {
      const lines = (window.DG_LOGS || [])
        .filter(e => e && e.tag === 'ZOOM-AUDIT')
        .map(e => JSON.stringify(e));
      const text = lines.join('\n');
      console.log('[DG][ZOOM-DUMP]\n' + text);
      return text;
    } catch (err) {
      console.warn('[DG][ZOOM-DUMP] failed', err);
      return '';
    }
  };
})();

function __dgZoomScale() {
  if (typeof window === 'undefined') return 1;
  const scale = Number.isFinite(window.__boardScale) && window.__boardScale > 0 ? window.__boardScale : null;
  return scale || 1;
}

if (typeof window !== 'undefined' && typeof window.DG_ZOOM_AUDIT === 'undefined') {
  window.DG_ZOOM_AUDIT = false; // flip true in console to overlay crosshairs/logs
}

function toyRadiusFromArea(area, ratio, minimum) {
  const safeW = Number.isFinite(gridAreaLogical?.w) && gridAreaLogical.w > 0
    ? gridAreaLogical.w
    : (Number.isFinite(area?.w) ? area.w : 0);
  const safeH = Number.isFinite(gridAreaLogical?.h) && gridAreaLogical.h > 0
    ? gridAreaLogical.h
    : (Number.isFinite(area?.h) ? area.h : 0);
  const base = Math.min(safeW, safeH);
  return Math.max(minimum, base * ratio);
}

// === DRAWGRID TUNING (single source of truth) ===
const ghostRadiusToy = (area) => toyRadiusFromArea(area, 0.054, 12); // doubled radius, +50% applied when poking
const ghostStrength = 1600;
const headerRadiusToy = (area) => toyRadiusFromArea(area, 0.022, 10);
export const HeaderSweepForce = Object.freeze({
  radiusMul: 2.2,
  strength: 50,
  falloff: 'gaussian',
  spacingMul: 0.6,
});
const DG_KNOCK = {
  ghostTrail:  { radiusToy: ghostRadiusToy, strength: ghostStrength },
  pointerDown: { radiusToy: ghostRadiusToy, strength: ghostStrength },
  pointerMove: { radiusToy: ghostRadiusToy, strength: ghostStrength },
  lettersMove: { radius:  120, strength: 24 },
  headerLine:  { radiusToy: headerRadiusToy, strength: 2200 },
  nodePulse:   {
    strengthMul: 1800.0, // stronger per-note particle kick on playback
  },
};

// Smooth letter physics (spring back to center)
const LETTER_PHYS = Object.freeze({
  k: 0.02,       // spring constant (higher = snappier return)
  damping: 0.82, // velocity damping (lower = more wobble)
  impulse: 0.05, // converts 'strength' to initial velocity kick
  max: 42,       // clamp max pixel offset from center
  epsilon: 0.02, // snap-to-zero deadzone
});
// Visual response for DRAW letters on ghost-hit (per-letter only)
const LETTER_VIS = Object.freeze({
  // Flash timing
  flashUpMs: 0,         // ms to ramp up to peak (0 = instant)
  flashDownMs: 260,     // ms to decay to 0
  // Flash look
  flashBoost: 1.75,     // brightness multiplier at peak (1 = no extra)
  flashColor: 'rgba(51, 97, 234, 1)', // temporary text color during flash
  // Opacity behavior (becomes MORE opaque on hit)
  opacityBase: 0.35,       // baseline per-letter opacity (multiplies with the letter’s base opacity)
  opacityBoost: 0.9,   // extra opacity at peak flash
  // Ghost hit detection: require touch within this ratio of the radius
  ghostCoreHitMul: 0.55,
});
const DRAW_LABEL_OPACITY_BASE = 1;
const KNOCK_DEBUG = false; // flip to true in console if we need counts
const __pokeCounts = {
  header: 0,
  pointerDown: 0,
  pointerMove: 0,
  ghostTrail: 0,
  lettersMove: 0,
  drag: 0,
  'drag-band': 0,
};
function dbgPoke(tag) {
  if (!KNOCK_DEBUG) return;
  __pokeCounts[tag] = (__pokeCounts[tag] || 0) + 1;
  if ((__pokeCounts[tag] % 25) === 1) console.debug('[DG][poke]', tag, { count: __pokeCounts[tag] });
}
// quick diagnostics
function __dgLogFirstPoke(tag, r, s){ if (!window.__DG_POKED__) { window.__DG_POKED__=true; drawgridLog('[DG] poke', tag, {radius:r, strength:s}); } }

// ---- drawgrid debug gate ----
// =========================
// Debug flags (runtime)
// =========================
// Runtime toggle:
//   DG_DEBUG_SET({ all:true })
//   DG_DEBUG_SET({ layout:true, swap:true })
//
// NOTE: drawgrid is a module; these flags must be read dynamically (not hard-coded const false)
// so you can toggle without rebuilding.
const __DG_LS_ALL = false;
if (!window.__DG_DEBUG) {
  window.__DG_DEBUG = {
    all: __DG_LS_ALL,
    core: __DG_LS_ALL,
    frame: __DG_LS_ALL,
    swap: __DG_LS_ALL,
    alpha: __DG_LS_ALL,
    layout: __DG_LS_ALL,
    layoutTrace: __DG_LS_ALL,
    paintTrace: __DG_LS_ALL,
    events: __DG_LS_ALL,
    zoomAudit: __DG_LS_ALL,
  };
}

window.DG_DEBUG_SET = function DG_DEBUG_SET(patch) {
  try {
    window.__DG_DEBUG = Object.assign({}, window.__DG_DEBUG || {}, patch || {});
    // keep "all" consistent if someone sets any sub-flag
    if (window.__DG_DEBUG.all) {
      window.__DG_DEBUG.core = true;
      window.__DG_DEBUG.frame = true;
      window.__DG_DEBUG.swap = true;
      window.__DG_DEBUG.alpha = true;
      window.__DG_DEBUG.layout = true;
      window.__DG_DEBUG.layoutTrace = true;
      window.__DG_DEBUG.paintTrace = true;
      window.__DG_DEBUG.events = true;
      window.__DG_DEBUG.zoomAudit = true;
    }
    console.log('[DG] DG_DEBUG_SET ->', window.__DG_DEBUG);
  } catch (e) {
    console.warn('[DG] DG_DEBUG_SET failed', e);
  }
};

function __dgFlag(name) {
  try { return !!(window.__DG_DEBUG && window.__DG_DEBUG[name]); } catch { return false; }
}

// DEBUG DEFAULTS (no localStorage)
// Flip to true to enable verbose console output.
try {
  const __DG_FORCE_ALL_DEBUG = false;
  if (__DG_FORCE_ALL_DEBUG) {
    window.__DG_DEBUG = window.__DG_DEBUG || {};
    Object.assign(window.__DG_DEBUG, {
      core: true,
      frame: true,
      layout: true,
      layoutTrace: true,
      swap: true,
      paintTrace: true,
      zoomAudit: true,
      events: true,
      alpha: true,
    });
  }
} catch {}

// Keep legacy runtime flags in sync (some callsites may reference these)
try {
  if (__dgFlag('paintTrace')) window.__DG_PAINT_TRACE = true;
  if (__dgFlag('zoomAudit')) window.DG_ZOOM_AUDIT = true;
  // Intentionally NOT using localStorage for debug right now.
  // if (__dgFlag('events')) localStorage.setItem('dg_events', '1');
} catch {}

const DG_DEBUG = __dgFlag('core');
const DG_FRAME_DEBUG = __dgFlag('frame');

// Feature flag: per-panel particle field (ghost / background particles).
// Flip to false to test performance without dgField.tick().
const DRAWGRID_ENABLE_PARTICLE_FIELD = true;
const DG_SWAP_DEBUG = __dgFlag('swap');      // swap spam;

// Alpha debug (default OFF; toggle via localStorage('DG_ALPHA_DEBUG'='1') or DG_DEBUG_SET)
const DG_ALPHA_DEBUG = __dgFlag('alpha');
try {
  if (typeof window !== 'undefined' && window.__DG_GRID_ALPHA_DEBUG === undefined) {
    window.__DG_GRID_ALPHA_DEBUG = false;
  }
} catch {}

// Ghost debug (off by default). Enable via ?dgghost=1 or localStorage('DG_GHOST_DEBUG'='1')
let DG_GHOST_DEBUG = false;
try {
  if (typeof location !== 'undefined' && location.search.includes('dgghost=1')) DG_GHOST_DEBUG = true;
  if (typeof localStorage !== 'undefined' && localStorage.getItem('DG_GHOST_DEBUG') === '1') DG_GHOST_DEBUG = true;
} catch {}

if (DG_DEBUG) { try { console.info('[DG][alpha:boot]', { DG_ALPHA_DEBUG }); } catch {} }

let __ALPHA_PATH_LAST_TS = 0;
const DG_ALPHA_SPAM_MS = 300;
let __DG_GRID_ALPHA_LAST_TS = 0;

function dgGridAlphaLog(tag, ctx, extra = {}) {
  try {
    if (!window?.__DG_GRID_ALPHA_DEBUG) return;
  } catch {
    return;
  }
  if (!ctx) return;
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if ((now - __DG_GRID_ALPHA_LAST_TS) < 180) return;
  __DG_GRID_ALPHA_LAST_TS = now;
  try {
    console.log('[DG][grid-alpha]', {
      tag,
      role: ctx?.canvas?.getAttribute?.('data-role') || null,
      alpha: ctx.globalAlpha,
      composite: ctx.globalCompositeOperation,
      shadowBlur: ctx.shadowBlur,
      shadowColor: ctx.shadowColor,
      usingBackBuffers,
      dgSingleCanvas: !!(typeof DG_SINGLE_CANVAS !== 'undefined' && DG_SINGLE_CANVAS),
      gridReady: !!panel?.__dgGridHasPainted,
      ...extra,
    });
  } catch {}
}

const dglog = (...a) => { if (DG_DEBUG) console.log('[DG]', ...a); };
const dgf = (...a) => { if (DG_FRAME_DEBUG) console.log('[DG] frame', ...a); };
const dgs = (...a) => { if (DG_SWAP_DEBUG) console.log('[DG] swap', ...a); };

const DG = {
  log: dglog,
  warn: (...a) => { if (DG_DEBUG) console.warn('[DG]', ...a); },
  time: (label) => { if (DG_DEBUG) console.time(label); },
  timeEnd: (label) => { if (DG_DEBUG) console.timeEnd(label); },
};

// --- Event diagnostics (off by default; enable via localStorage.setItem('dg_events','1')) ---
const DG_EVENTS_ON = __dgFlag('events');
const EMIT_PREFIX = 'dg:';

function emitDG(eventName, detail = {}) {
  if (!DG_EVENTS_ON) return;
  let panelRef = null;
  try { if (typeof panel !== 'undefined') panelRef = panel; } catch {}
  const payload = {
    t: (performance?.now?.() ?? Date.now()),
    panelId: panelRef?.id || panelRef?.dataset?.toy || 'unknown',
    ...detail,
  };
  try {
    // Bubble to panel (scoped) and window (global)
    if (panelRef?.dispatchEvent) {
      panelRef.dispatchEvent(new CustomEvent(`${EMIT_PREFIX}${eventName}`, { detail: payload }));
    }
    window.dispatchEvent(new CustomEvent(`${EMIT_PREFIX}${eventName}`, { detail: payload }));
  } catch (e) {
    if (DG_DEBUG) DG.warn('emitDG failed', e);
  }
}

// Toggle for detailed drawgrid diagnostics. Flip to true when chasing state issues.
const DG_TRACE_DEBUG = false;
const dgTraceLog = (...args) => { if (DG_TRACE_DEBUG) console.log(...args); };
const dgTraceWarn = (...args) => { if (DG_TRACE_DEBUG) console.warn(...args); };
const DG_LAYOUT_DEBUG = __dgFlag('layout');
const DG_LAYOUT_TRACE = __dgFlag('layoutTrace');

function dgLogLine(tag, payload) {
  if (!DG_LAYOUT_DEBUG) return;
  try { console.log(`[DG][${tag}] ${JSON.stringify(payload)}`); } catch {}
}

  function dgDumpCanvasMetrics(panel, tag, frontCanvas, wrap, body) {
    if (!DG_LAYOUT_DEBUG) return;
    try {
      const vp = panel?.closest?.('.board-viewport') || document.querySelector('.board-viewport');
      const boardScale = vp ? boardScaleHelper(vp) : (Number.isFinite(window?.__boardScale) ? window.__boardScale : 1);
      const rect = panel?.getBoundingClientRect?.();
      const bodyRect = body?.getBoundingClientRect?.();
      const wrapRect = wrap?.getBoundingClientRect?.();
      const canvasRect = frontCanvas?.getBoundingClientRect?.();
      const frontW = frontCanvas?.width || 0;
      const frontH = frontCanvas?.height || 0;
      const frontCssW = frontCanvas?.style?.width || '';
      const frontCssH = frontCanvas?.style?.height || '';
      dgLogLine('layout-metrics', {
        tag,
        panelId: panel?.id || null,
        paintDpr,
        cssW,
        cssH,
        boardScale,
        panelRect: rect ? { w: rect.width, h: rect.height } : null,
        bodyRect: bodyRect ? { w: bodyRect.width, h: bodyRect.height } : null,
        wrapRect: wrapRect ? { w: wrapRect.width, h: wrapRect.height } : null,
        canvasRect: canvasRect ? { w: canvasRect.width, h: canvasRect.height } : null,
        front: { w: frontW, h: frontH, cssW: frontCssW, cssH: frontCssH }
      });
    } catch {}
  }

// --- Drawgrid debug (off by default) ---
const DBG_DRAW = false; // set true only for hyper-local issues
const DG_INK_DEBUG = false;    // live ink logs
const DG_CLEAR_DEBUG = false;  // paint clears with reasons
// --- TEMP DEBUG FLAGS ---
if (typeof window !== 'undefined') {
  window.DG_DRAW_DEBUG = false; // keep probes off unless debugging live draw
}
let __dbgLiveSegments = 0;
let __dbgPointerMoves = 0;
let __dbgPaintClears = 0;
function dbg(tag, payload){
  if (!DG_INK_DEBUG) return;
  try { console.debug(`[DG][${tag}]`, payload || ''); } catch {}
}
const DG_HYDRATE = {
  guardActive: false,
  hydratedAt: 0,
  inbound: { strokes: 0, nodeCount: 0, nonEmptyColumns: 0, activeColumns: 0 },
  seenUserChange: false,
  lastPersistNonEmpty: null,
  pendingUserClear: false,
};

function dgNow() {
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
  } catch {}
  return Date.now();
}

function computeSerializedNodeStats(list, disabledList) {
  let nodeCount = 0;
  let nonEmptyColumns = 0;
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i++) {
      const col = list[i];
      const disabledColRaw = Array.isArray(disabledList) ? disabledList[i] : null;
      const disabledSet = disabledColRaw instanceof Set
        ? disabledColRaw
        : (Array.isArray(disabledColRaw) ? new Set(disabledColRaw) : null);
      let columnActive = 0;
      if (col instanceof Set) {
        col.forEach((row) => {
          if (!disabledSet || !disabledSet.has(row)) columnActive++;
        });
      } else if (Array.isArray(col)) {
        for (const row of col) {
          const rowNum = typeof row === 'number' ? row : Number(row);
          if (Number.isNaN(rowNum)) continue;
          if (!disabledSet || !disabledSet.has(rowNum)) columnActive++;
        }
      } else if (col && typeof col.forEach === 'function') {
        try {
          col.forEach((row) => {
            if (!disabledSet || !disabledSet.has(row)) columnActive++;
          });
        } catch {}
      } else if (col && typeof col.size === 'number' && columnActive === 0) {
        const delta = col.size - (disabledSet ? disabledSet.size : 0);
        columnActive = Math.max(0, delta);
      }
      if (columnActive > 0) {
        nonEmptyColumns++;
        nodeCount += columnActive;
      }
    }
  }
  return { nodeCount, nonEmptyColumns };
}

function computeCurrentMapNodeStats(nodes, disabled) {
  let nodeCount = 0;
  let nonEmptyColumns = 0;
  if (Array.isArray(nodes)) {
    for (let i = 0; i < nodes.length; i++) {
      const col = nodes[i];
      const disabledColRaw = Array.isArray(disabled) ? disabled[i] : null;
      const disabledSet = disabledColRaw instanceof Set
        ? disabledColRaw
        : (Array.isArray(disabledColRaw) ? new Set(disabledColRaw) : null);
      let columnActive = 0;
      if (col instanceof Set) {
        col.forEach((row) => {
          if (!disabledSet || !disabledSet.has(row)) columnActive++;
        });
      } else if (Array.isArray(col)) {
        for (const row of col) {
          const rowNum = typeof row === 'number' ? row : Number(row);
          if (Number.isNaN(rowNum)) continue;
          if (!disabledSet || !disabledSet.has(rowNum)) columnActive++;
        }
      } else if (col && typeof col.forEach === 'function') {
        try {
          col.forEach((row) => {
            if (!disabledSet || !disabledSet.has(row)) columnActive++;
          });
        } catch {}
      } else if (col && typeof col.size === 'number' && columnActive === 0) {
        const delta = col.size - (disabledSet ? disabledSet.size : 0);
        columnActive = Math.max(0, delta);
      }
      if (columnActive > 0) {
        nonEmptyColumns++;
        nodeCount += columnActive;
      }
    }
  }
  return { nodeCount, nonEmptyColumns };
}

function inboundWasNonEmpty() {
  const inbound = DG_HYDRATE.inbound || {};
  return ((inbound.strokes || 0) > 0) ||
    ((inbound.nodeCount || 0) > 0) ||
    ((inbound.nonEmptyColumns || 0) > 0) ||
    ((inbound.activeColumns || 0) > 0);
}

function maybeDropPersistGuard(reason, extra = {}) {
  if (!DG_HYDRATE.guardActive) return;
  const inbound = DG_HYDRATE.inbound || {};
  if (!DG_HYDRATE.seenUserChange && (inbound.strokes || 0) > 0 && DG_HYDRATE.lastPersistNonEmpty === false) {
    dgTraceLog('[drawgrid][persist-guard] keep guard ON (no non-empty persist yet)', {
      reason,
      inbound: { ...inbound },
      seenUserChange: DG_HYDRATE.seenUserChange,
      lastPersistNonEmpty: DG_HYDRATE.lastPersistNonEmpty,
      ...extra,
    });
    return;
  }
  DG_HYDRATE.guardActive = false;
  const payload = {
    reason,
    inbound: { ...inbound },
    seenUserChange: DG_HYDRATE.seenUserChange,
    lastPersistNonEmpty: DG_HYDRATE.lastPersistNonEmpty,
    ...extra,
  };
  if (DG_HYDRATE.lastPersistNonEmpty === true) {
    dgTraceLog('[drawgrid][persist-guard] guard OFF (non-empty persist confirmed)', payload);
  } else {
    dgTraceLog('[drawgrid][persist-guard] guard OFF', payload);
  }
}

function markUserChange(reason, extra = {}) {
  if (DG_HYDRATE.seenUserChange) return;
  DG_HYDRATE.seenUserChange = true;
  if (DG_TRACE_DEBUG) {
    try {
      const stack = (new Error('user-change')).stack?.split('\n').slice(0, 4).join('\n');
      console.log('[drawgrid][user-change]', { reason, guardActive: DG_HYDRATE.guardActive, stack });
    } catch {}
  }
  maybeDropPersistGuard(reason || 'user-change', { ...extra, userChange: true });
}

function updateHydrateInboundFromState(state, { reason = 'hydrate' } = {}) {
  if (!state || typeof state !== 'object') {
    DG_HYDRATE.inbound = { strokes: 0, nodeCount: 0, nonEmptyColumns: 0, activeColumns: 0 };
    DG_HYDRATE.guardActive = false;
    DG_HYDRATE.lastPersistNonEmpty = null;
    DG_HYDRATE.seenUserChange = false;
    DG_HYDRATE.pendingUserClear = false;
    DG_HYDRATE.hydratedAt = dgNow();
    return;
  }
  const strokes = Array.isArray(state?.strokes) ? state.strokes.length : 0;
  const { nodeCount, nonEmptyColumns } = computeSerializedNodeStats(state?.nodes?.list, state?.nodes?.disabled);
  const activeColumns = Array.isArray(state?.nodes?.active)
    ? state.nodes.active.reduce((acc, cur) => acc + (cur ? 1 : 0), 0)
    : 0;
  const inbound = {
    strokes,
    nodeCount,
    nonEmptyColumns,
    activeColumns,
  };
  DG_HYDRATE.inbound = inbound;
  DG_HYDRATE.hydratedAt = dgNow();
  DG_HYDRATE.seenUserChange = false;
  DG_HYDRATE.pendingUserClear = false;
  const inboundNonEmpty = inboundWasNonEmpty();
  DG_HYDRATE.lastPersistNonEmpty = inboundNonEmpty ? false : null;
  DG_HYDRATE.guardActive = inboundNonEmpty;
  if (inboundNonEmpty) {
    dgTraceLog('[drawgrid][persist-guard] inbound hydrate', { reason, inbound: { ...inbound } });
  } else {
    dgTraceLog('[drawgrid][persist-guard] inbound hydrate empty', { reason });
  }
}

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

function withIdentity(ctx, fn) {
  if (!ctx || typeof fn !== 'function') return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  try {
    fn();
  } finally {
    ctx.restore();
  }
}

let usingBackBuffers = false;
let __dgDrawingActive = false;
let paintDpr = Math.max(1, Math.min((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1, 3));

let cssW = 0, cssH = 0, cw = 0, ch = 0, topPad = 0;
let layoutSizeDirty = true;

function getLineWidth() {
  // Camera-like behaviour: line thickness is in toy space, not scaled by zoom
  const cellW = cw || 24;
  const cellH = ch || 24;
  const cell = Math.max(4, Math.min(cellW, cellH));

  // Tune these numbers if it looks too thick/thin
  // (doubled from 0.4 → 0.8 to make strokes ~2x thicker)
  const base = cell * 0.8;
  const clamped = Math.max(2, Math.min(base, 60));
  return clamped;
}

// Draw in logical (CSS) space scaled by current paintDpr; use for stroke/path operations.
function withLogicalSpace(ctx, fn) {
  if (!ctx || typeof fn !== 'function') return;
  ctx.save();
  const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  try {
    fn();
  } finally {
    ctx.restore();
  }
}

const __dgPlayheadBandSpriteCache = new Map();
const __dgPlayheadLineSpriteCache = new Map();
const __dgPlayheadCompositeSpriteCache = new Map();
function quantizeHue(hue, step = 6) {
  const h = Number.isFinite(hue) ? hue : 0;
  const s = Number.isFinite(step) && step > 0 ? step : 1;
  return Math.round(h / s) * s;
}
const PLAYHEAD_HUES_LINE1 = [200, 245, 290];
const PLAYHEAD_HUES_LINE2 = [20, 355, 330];
function pickPlayheadHue(strokes) {
  const hasLine2 = Array.isArray(strokes) && strokes.some(s => s && s.generatorId === 2);
  const pool = hasLine2 ? PLAYHEAD_HUES_LINE1.concat(PLAYHEAD_HUES_LINE2) : PLAYHEAD_HUES_LINE1;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx] ?? PLAYHEAD_HUES_LINE1[0];
}
function __dgCachePlayheadSprite(map, key, build) {
  let sprite = map.get(key);
  if (sprite) return sprite;
  sprite = build();
  map.set(key, sprite);
  if (map.size > 24) {
    map.clear();
  }
  return sprite;
}
function getPlayheadBandSprite(width, height, hue) {
  const w = Math.max(1, Math.round(width || 0));
  const h = Math.max(1, Math.round(height || 0));
  const hueKey = quantizeHue(hue, 6);
  const key = `${w}x${h}|${hueKey}`;
  return __dgCachePlayheadSprite(__dgPlayheadBandSpriteCache, key, () => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const midColor = `hsla(${(hueKey + 45)}, 100%, 70%, 0.25)`;
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, midColor);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    return canvas;
  });
}
function getPlayheadLineSprite(height, hue) {
  const h = Math.max(1, Math.round(height || 0));
  const hueKey = quantizeHue(hue, 6);
  const key = `${h}|${hueKey}`;
  return __dgCachePlayheadSprite(__dgPlayheadLineSpriteCache, key, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `hsl(${hueKey}, 100%, 70%)`);
    grad.addColorStop(0.5, `hsl(${(hueKey + 45) % 360}, 100%, 70%)`);
    grad.addColorStop(1, `hsl(${(hueKey + 90) % 360}, 100%, 68%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1, h);
    return canvas;
  });
}
function getPlayheadCompositeSprite({
  gradientWidth,
  height,
  hue,
  trailLineCount,
  gap,
  mainLineW,
  trailW0,
  trailWStep,
} = {}) {
  const w = Math.max(1, Math.round(gradientWidth || 0));
  const h = Math.max(1, Math.round(height || 0));
  const hueKey = quantizeHue(hue, 6);
  const key = `${w}x${h}|${hueKey}|t${trailLineCount}|g${gap}|m${mainLineW}|tw${trailW0}|ts${trailWStep}`;
  return __dgCachePlayheadSprite(__dgPlayheadCompositeSpriteCache, key, () => {
    const canvas = document.createElement('canvas');
    const leftPad = (trailLineCount > 0)
      ? (trailLineCount * gap + (trailW0 / 2) + 2)
      : 2;
    const rightPad = (w / 2) + 2;
    canvas.width = Math.max(1, Math.ceil(leftPad + rightPad));
    canvas.height = h;
    canvas.__dgOriginX = leftPad;
    const ctx = canvas.getContext('2d');
    const bandSprite = getPlayheadBandSprite(w, h, hueKey);
    if (bandSprite) {
      ctx.drawImage(bandSprite, leftPad - w / 2, 0, w, h);
    }
    const lineSprite = getPlayheadLineSprite(h, hueKey);
    if (lineSprite) {
      for (let i = 0; i < trailLineCount; i++) {
        const trailX = leftPad - (i + 1) * gap;
        const trailW = Math.max(1.0, trailW0 - i * trailWStep);
        ctx.globalAlpha = 0.6 - i * 0.18;
        ctx.drawImage(lineSprite, trailX - trailW / 2, 0, trailW, h);
      }
      ctx.globalAlpha = 1.0;
      ctx.drawImage(lineSprite, leftPad - mainLineW / 2, 0, mainLineW, h);
    }
    return canvas;
  });
}

function getOverlayClearPad() {
  try {
    const lw = (typeof getLineWidth === 'function') ? getLineWidth() : 0;
    const safe = Number.isFinite(lw) ? lw : 0;
    return Math.min(24, Math.max(4, safe * 0.6));
  } catch {}
  return 6;
}

function getOverlayClearRect({ canvas, pad = 0, allowFull = false, gridArea: gridAreaOverride } = {}) {
  const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
  const maxW = cssW || ((canvas?.width || 0) / scale);
  const maxH = cssH || ((canvas?.height || 0) / scale);
  const grid = gridAreaOverride;
  const hasGrid = !!(grid && grid.w > 0 && grid.h > 0);
  if (allowFull || !hasGrid || !maxW || !maxH) {
    return { x: 0, y: 0, w: maxW, h: maxH };
  }
  const x = Math.max(0, grid.x - pad);
  const y = Math.max(0, grid.y - pad);
  let w = grid.w + pad * 2;
  let h = grid.h + pad * 2;
  if (Number.isFinite(maxW) && maxW > 0 && (x + w) > maxW) w = Math.max(0, maxW - x);
  if (Number.isFinite(maxH) && maxH > 0 && (y + h) > maxH) h = Math.max(0, maxH - y);
  return { x, y, w, h };
}

function withOverlayClip(ctx, gridArea, allowFull, fn) {
  if (!ctx || typeof fn !== 'function') return;
  const hasGrid = !!(gridArea && gridArea.w > 0 && gridArea.h > 0);
  if (allowFull || !hasGrid) {
    return fn();
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(gridArea.x, gridArea.y, gridArea.w, gridArea.h);
  ctx.clip();
  try {
    return fn();
  } finally {
    ctx.restore();
  }
}

function drawGhostDebugBand(ctx, band) {
  if (!DG_GHOST_DEBUG || !ctx || !band || !gridArea) return;
  withLogicalSpace(ctx, () => {
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,255,255,0.8)';
    ctx.beginPath();
    ctx.moveTo(gridArea.x, band.minY);
    ctx.lineTo(gridArea.x + gridArea.w, band.minY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gridArea.x, band.maxY);
    ctx.lineTo(gridArea.x + gridArea.w, band.maxY);
    ctx.stroke();
    ctx.setLineDash([2, 6]);
    ctx.strokeStyle = 'rgba(0,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(gridArea.x, band.midY);
    ctx.lineTo(gridArea.x + gridArea.w, band.midY);
    ctx.stroke();
    ctx.restore();
  });
}

function drawGhostDebugPath(ctx, { from, to, crossY }) {
  if (!DG_GHOST_DEBUG || !ctx || !from || !to) return;
  withLogicalSpace(ctx, () => {
    ctx.save();
    const q = (v0, v1, v2, t) => {
      const u = 1 - t;
      return u * u * v0 + 2 * u * t * v1 + t * t * v2;
    };
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 4]);
    ctx.strokeStyle = 'rgba(255,0,200,0.8)';
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const x = from.x + (to.x - from.x) * t;
      const y = q(from.y, typeof crossY === 'number' ? crossY : (from.y + to.y) * 0.5, to.y, t);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const cx = (from.x + to.x) * 0.5;
    const cy = typeof crossY === 'number' ? crossY : (from.y + to.y) * 0.5;
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,0,200,0.7)';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,180,255,0.9)';
    ctx.beginPath(); ctx.arc(from.x, from.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(to.x, to.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}

function drawGhostDebugFrame(ctx, { x, y, radius, lettersRadius }) {
  if (!DG_GHOST_DEBUG || !ctx) return;
  withLogicalSpace(ctx, () => {
    ctx.save();
    ctx.fillStyle = 'rgba(0,210,255,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,210,255,0.5)';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, radius), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([2, 6]);
    ctx.strokeStyle = 'rgba(50,255,120,0.5)';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, lettersRadius), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
}

// Draw in raw device pixels without additional scaling; ideal for blits / drawImage.
function withDeviceSpace(ctx, fn) {
  if (!ctx || typeof fn !== 'function') return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  try {
    fn();
  } finally {
    ctx.restore();
  }
}

function resetCtx(ctx) {
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
}

function clearCanvas(ctx) {
  if (!ctx || !ctx.canvas) return;
  // Do not clear the paint layer during a live stroke
  const role = ctx.canvas?.getAttribute?.('data-role');
  const isPaintSurface = role === 'drawgrid-paint' || role === 'drawgrid-paint-back';
  const __dgSingleCanvasOn =
    (typeof DG_SINGLE_CANVAS !== 'undefined' && DG_SINGLE_CANVAS) ||
    (typeof window !== 'undefined' && window.__DG_SINGLE_CANVAS);
  if (__dgSingleCanvasOn && role === 'drawgrid-paint' && backCtx && ctx !== backCtx) {
    clearCanvas(backCtx);
    return;
  }
  if (typeof window !== 'undefined' && window.DG_DRAW_DEBUG && __dgDrawingActive && isPaintSurface) {
    console.debug('[DG][CLEAR/SKIP] attempted to clear paint during drag.');
    return;
  }
  const surface = ctx.canvas;
  const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
  const width = cssW || (surface?.width ?? 0) / scale;
  const height = cssH || (surface?.height ?? 0) / scale;
  resetCtx(ctx);
  withLogicalSpace(ctx, () => ctx.clearRect(0, 0, width, height));
  if (isPaintSurface) {
    __dgMarkSingleCanvasDirty(ctx?.canvas?.__dgPanel);
  }
  __dbgPaintClears++;
  if (DG_CLEAR_DEBUG) {
    let stack = '';
    try { stack = (new Error('clear')).stack?.split('\n').slice(1, 6).join('\n'); } catch {}
    console.debug('[DG][CLEAR]', {
      target: surface.getAttribute?.('data-role') || 'paint?',
      clears: __dbgPaintClears,
      usingBackBuffers,
    }, stack);
  }
}

// Draw a live stroke segment directly to FRONT (no swaps, no back-buffers)
function drawLiveStrokePoint(ctx, pt, prevPt, strokeOrColor) {
  if (!ctx || !pt) return;

  const stroke =
    strokeOrColor && typeof strokeOrColor === 'object' && strokeOrColor.pts
      ? strokeOrColor
      : null;
  const color = stroke ? (stroke.color || '#ffffff') : (strokeOrColor || '#ffffff');

  let alpha = 1;
  if (stroke) {
    const overrideAlpha = Number.isFinite(stroke.liveAlphaOverride)
      ? stroke.liveAlphaOverride
      : null;
    if (overrideAlpha !== null) {
      alpha = overrideAlpha;
    } else {
      const wantsSpecial = !!stroke.isSpecial;
      const isVisualOnly = isVisualOnlyStroke(stroke);
      const generatorId = stroke.generatorId ?? null;
      alpha = getPathAlpha({
        isOverlay: false,
        wantsSpecial,
        isVisualOnly,
        generatorId,
      });
    }
  }

  resetCtx(ctx);
  withLogicalSpace(ctx, () => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;

    const lw = typeof getLineWidth === 'function' ? getLineWidth() : 8;
    ctx.lineWidth = lw;

    ctx.beginPath();
    if (prevPt) ctx.moveTo(prevPt.x, prevPt.y);
    else ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  });
  __dgMarkSingleCanvasDirty(ctx?.canvas?.__dgPanel);
}

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
function __dgMarkSingleCanvasDirty(panel) {
  if (!panel) return;
  panel.__dgCompositeBaseDirty = true;
  panel.__dgSingleCompositeDirty = true;
  __dgMaybeLogStall(panel, 'markDirty');
}
function __dgMarkSingleCanvasOverlayDirty(panel) {
  if (!panel) return;
  panel.__dgCompositeOverlayDirty = true;
  if (!DG_SINGLE_CANVAS_OVERLAYS) {
    panel.__dgSingleCompositeDirty = true;
  }
  __dgMaybeLogStall(panel, 'markDirty');
}
function __dgMarkSingleCanvasCompositeDirty(panel) {
  if (!panel) return;
  panel.__dgSingleCompositeDirty = true;
}
let __dgProbeDidFirstDraw = false;
try {
  if (typeof window !== 'undefined' && window.__DG_PROBE_ON === undefined) {
    window.__DG_PROBE_ON = false;
  }
} catch {}
let __dgLayerDebugLastTs = 0;
function __dgMaybeLogStall(panel, tag) {
  try {
    if (typeof window !== 'undefined' && window.__DG_DEBUG_STALL === undefined) {
      window.__DG_DEBUG_STALL = false;
    }
    if (!window.__DG_DEBUG_STALL) return;

    const now = (performance?.now ? performance.now() : Date.now());
    const last = panel.__dgLastCompositeTs || 0;
    // Only log if it's been a while (non-spammy)
    if (last && (now - last) < 750) return;

    console.log('[DG][stall?]', tag, {
      panelId: panel?.id || null,
      visible: !!panel.__dgIsVisible,
      compositeDirty: !!panel.__dgSingleCompositeDirty,
      baseDirty: !!panel.__dgCompositeBaseDirty,
      overlayDirty: !!panel.__dgCompositeOverlayDirty,
    });
  } catch {}
}
let __dgRegenSource = '';
let __dgLayerTraceLastTs = 0;
function __dgLayerDebugLog(tag, payload = {}) {
  try {
    if (typeof window !== 'undefined' && window.__DG_LAYER_DEBUG === undefined) {
      window.__DG_LAYER_DEBUG = false;
    }
    if (!window.__DG_LAYER_DEBUG) return;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if ((now - __dgLayerDebugLastTs) < 400) return;
    __dgLayerDebugLastTs = now;
    console.log('[DG][layer]', tag, payload);
  } catch {}
}
function __dgLayerTrace(tag, payload = {}) {
  try {
    if (typeof window !== 'undefined' && window.__DG_LAYER_TRACE === undefined) {
      window.__DG_LAYER_TRACE = false;
    }
    if (!window.__DG_LAYER_TRACE) return;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if ((now - __dgLayerTraceLastTs) < 200) return;
    __dgLayerTraceLastTs = now;
    console.log('[DG][layer-trace]', tag, payload);
  } catch {}
}

function __dgFlowLog(tag, payload = {}) {
  try {
    if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW === undefined) {
      window.__DG_DEBUG_DRAWFLOW = false;
    }
    if (!window.__DG_DEBUG_DRAWFLOW) return;
    console.log('[DG][flow]', tag, {
      panelId: payload.panelId ?? ((typeof panel !== 'undefined') ? (panel?.id || null) : null),
      usingBackBuffers: payload.usingBackBuffers ?? ((typeof usingBackBuffers !== 'undefined') ? usingBackBuffers : null),
      skipSwapsDuringDrag: payload.skipSwapsDuringDrag ?? ((typeof __dgSkipSwapsDuringDrag !== 'undefined') ? __dgSkipSwapsDuringDrag : null),
      drawingActive: payload.drawingActive ?? ((typeof __dgDrawingActive !== 'undefined') ? __dgDrawingActive : null),
      hasCur: payload.hasCur ?? ((typeof cur !== 'undefined') ? !!cur : null),
      previewGid: payload.previewGid ?? ((typeof previewGid !== 'undefined') ? previewGid : null),
      nextDrawTarget: payload.nextDrawTarget ?? ((typeof nextDrawTarget !== 'undefined') ? nextDrawTarget : null),
      strokes: payload.strokes ?? ((typeof strokes !== 'undefined' && Array.isArray(strokes)) ? strokes.length : 0),
      chainActive: payload.chainActive ?? ((typeof panel !== 'undefined') ? (panel?.dataset?.chainActive || null) : null),
      ...payload,
    });
  } catch (err) {
    try {
      if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW) {
        console.warn('[DG][flow] log error', err);
      }
    } catch {}
  }
}

let __dgSampleCanvas = null;
let __dgSampleCtx = null;
function __dgSampleAlphaFromCanvas(canvas) {
  try {
    if (!canvas || !canvas.width || !canvas.height) return null;
    if (!__dgSampleCanvas) {
      __dgSampleCanvas = document.createElement('canvas');
      __dgSampleCtx = __dgSampleCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (!__dgSampleCtx) return null;
    const w = 16;
    const h = 16;
    if (__dgSampleCanvas.width !== w) __dgSampleCanvas.width = w;
    if (__dgSampleCanvas.height !== h) __dgSampleCanvas.height = h;
    __dgSampleCtx.setTransform(1, 0, 0, 1, 0, 0);
    __dgSampleCtx.clearRect(0, 0, w, h);
    __dgSampleCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, w, h);
    const data = __dgSampleCtx.getImageData(0, 0, w, h).data;
    let sum = 0;
    let nonZero = 0;
    for (let i = 3; i < data.length; i += 4) {
      const a = data[i];
      sum += a;
      if (a > 0) nonZero++;
    }
    return { sum, nonZero, samplePx: w * h };
  } catch {
    return null;
  }
}

function __dgCollectFlowState(ctx = {}) {
  const paintEl = ctx.paint ?? ((typeof paint !== 'undefined') ? paint : null);
  const backEl = ctx.backCanvas ?? ((typeof backCanvas !== 'undefined') ? backCanvas : null);
  const flashEl = ctx.flashCanvas ?? ((typeof flashCanvas !== 'undefined') ? flashCanvas : null);
  const flashBackEl = ctx.flashBackCanvas ?? ((typeof flashBackCanvas !== 'undefined') ? flashBackCanvas : null);
  const activeFlashEl = ctx.activeFlashCanvas ?? ((typeof getActiveFlashCanvas === 'function') ? getActiveFlashCanvas() : null);
  const strokeList = ctx.strokes ?? ((typeof strokes !== 'undefined') ? strokes : null);
  const panelRef = ctx.panel ?? ((typeof panel !== 'undefined') ? panel : null);
  const hasOverlayFn = ctx.hasOverlayStrokesCached ?? ((typeof hasOverlayStrokesCached === 'function') ? hasOverlayStrokesCached : null);
  return {
    panelId: panelRef?.id || null,
    strokes: Array.isArray(strokeList) ? strokeList.length : 0,
    hasOverlayStrokes: hasOverlayFn ? hasOverlayFn() : null,
    paintRev: ctx.paintRev ?? ((typeof __dgPaintRev !== 'undefined') ? __dgPaintRev : null),
    flashEmpty: panelRef ? !!panelRef.__dgFlashLayerEmpty : null,
    flashOutOfGrid: panelRef ? !!panelRef.__dgFlashOverlayOutOfGrid : null,
    baseDirty: panelRef ? !!panelRef.__dgCompositeBaseDirty : null,
    overlayDirty: panelRef ? !!panelRef.__dgCompositeOverlayDirty : null,
    compositeDirty: ctx.compositeDirty ?? (panelRef ? !!panelRef.__dgSingleCompositeDirty : null),
    usingBackBuffers: ctx.usingBackBuffers ?? ((typeof usingBackBuffers !== 'undefined') ? usingBackBuffers : null),
    paintSize: paintEl ? { w: paintEl.width, h: paintEl.height } : null,
    backSize: backEl ? { w: backEl.width, h: backEl.height } : null,
    paintAlpha: __dgSampleAlphaFromCanvas(paintEl),
    backAlpha: __dgSampleAlphaFromCanvas(backEl),
    flashAlpha: __dgSampleAlphaFromCanvas(flashEl),
    flashBackAlpha: __dgSampleAlphaFromCanvas(flashBackEl),
    activeFlashAlpha: __dgSampleAlphaFromCanvas(activeFlashEl),
  };
}
function __dgFlowState(tag, ctx) {
  if (typeof window === 'undefined' || !window.__DG_DEBUG_DRAWFLOW) return;
  try {
    const panelRef = ctx?.panel ?? ((typeof panel !== 'undefined') ? panel : null);
    if (!panelRef) return;
    const state = __dgCollectFlowState(ctx);
    const missing = [];
    for (const [key, value] of Object.entries(state)) {
      if (value === null || value === undefined) missing.push(key);
    }
    if (missing.length) state.missing = missing;
    console.log('[DG][flow][state]', tag, JSON.stringify(state));
    try { window.__dgLastFlowState = state; } catch {}
  } catch {}
}
function __dgMarkRegenSource(reason) {
  __dgRegenSource = typeof reason === 'string' ? reason : '';
}
let __dgHydrationRetryRaf = 0;
let __dgHydrationRetryCount = 0;

function scheduleHydrationLayoutRetry(panel, layoutFn) {
  if (__dgHydrationRetryRaf) return;
  if (!__dgHydrationPendingRedraw) return;
  __dgHydrationRetryRaf = requestAnimationFrame(() => {
    __dgHydrationRetryRaf = 0;
    if (!__dgHydrationPendingRedraw) return;
    if (!panel?.isConnected) return;
    __dgHydrationRetryCount++;
    try { layoutFn?.(); } catch {}
    if (__dgHydrationRetryCount < 6 && __dgHydrationPendingRedraw) {
      scheduleHydrationLayoutRetry(panel, layoutFn);
    } else {
      __dgHydrationRetryCount = 0;
    }
  });
}
let __dgStableFramesAfterCommit = 0;

function __dgInCommitWindow(nowTs) {
  if (Number.isFinite(__dgBypassCommitUntil) && nowTs < __dgBypassCommitUntil) return false;
  const win = (typeof window !== 'undefined') ? window : null;
  const lp = win?.__LAST_POINTERUP_DIAG__;
  const gestureSettle = win?.__GESTURE_SETTLE_UNTIL_TS || (lp?.t0 ? lp.t0 + 200 : 0);
  const deferUntil = __dgDeferUntilTs || 0;
  const guardUntil = Math.max(gestureSettle || 0, deferUntil);
  return guardUntil > 0 && nowTs < guardUntil;
}

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

/**
 * For a sparse array of nodes, fills in the empty columns by interpolating
 * and extrapolating from the existing nodes to create a continuous line.
 * @param {Array<Set<number>>} nodes - The sparse array of node rows.
 * @param {number} numCols - The total number of columns in the grid.
 * @returns {Array<Set<number>>} A new array with all columns filled.
 */
function fillGapsInNodeArray(nodes, numCols) {
    const filled = nodes.map(s => s ? new Set(s) : new Set()); // Deep copy
    const firstDrawn = filled.findIndex(n => n.size > 0);
    if (firstDrawn === -1) return filled; // Nothing to fill

    const lastDrawn = filled.map(n => n.size > 0).lastIndexOf(true);

    const getAvgRow = (colSet) => {
        if (!colSet || colSet.size === 0) return NaN;
        // Using a simple loop is arguably clearer and safer than reduce here.
        let sum = 0;
        for (const row of colSet) { sum += row; }
        return sum / colSet.size;
    };

    // Extrapolate backwards from the first drawn point
    const firstRowAvg = getAvgRow(filled[firstDrawn]);
    if (!isNaN(firstRowAvg)) {
        for (let c = 0; c < firstDrawn; c++) {
            filled[c] = new Set([Math.round(firstRowAvg)]);
        }
    }

    // Extrapolate forwards from the last drawn point
    const lastRowAvg = getAvgRow(filled[lastDrawn]);
    if (!isNaN(lastRowAvg)) {
        for (let c = lastDrawn + 1; c < numCols; c++) {
            filled[c] = new Set([Math.round(lastRowAvg)]);
        }
    }

    // Interpolate between drawn points
    let lastKnownCol = firstDrawn;
    for (let c = firstDrawn + 1; c < lastDrawn; c++) {
        if (filled[c].size > 0) {
            lastKnownCol = c;
        } else {
            let nextKnownCol = c + 1;
            while (nextKnownCol < lastDrawn && filled[nextKnownCol].size === 0) { nextKnownCol++; }
            const leftRow = getAvgRow(filled[lastKnownCol]);
            const rightRow = getAvgRow(filled[nextKnownCol]);
            if (isNaN(leftRow) || isNaN(rightRow)) continue;
            const t = (c - lastKnownCol) / (nextKnownCol - lastKnownCol);
            const interpolatedRow = Math.round(leftRow + t * (rightRow - leftRow));
            filled[c] = new Set([interpolatedRow]);
        }
    }
    return filled;
}

function findChainHead(toy) {
    if (!toy) return null;
    let current = toy;
    let sanity = 100;
    while (current && current.dataset.prevToyId && sanity-- > 0) {
        const prev = document.getElementById(current.dataset.prevToyId);
        if (!prev || prev === current) break;
        current = prev;
    }
    return current;
}


function chainHasSequencedNotes(head) {
  let current = head;
  let sanity = 100;
  while (current && sanity-- > 0) {
    const toyType = current.dataset?.toy;
    if (toyType === 'loopgrid' || toyType === 'loopgrid-drum') {
      const state = current.__gridState;
      if (state?.steps && state.steps.some(Boolean)) return true;
    } else if (toyType === 'drawgrid') {
      const toy = current.__drawToy;
      if (toy) {
        if (typeof toy.hasActiveNotes === 'function') {
          if (toy.hasActiveNotes()) return true;
        } else if (typeof toy.getState === 'function') {
          try {
            const drawState = toy.getState();
            const activeCols = drawState?.nodes?.active;
            if (Array.isArray(activeCols) && activeCols.some(Boolean)) return true;
          } catch {}
        }
      }
    } else if (toyType === 'chordwheel') {
      if (current.__chordwheelHasActive) return true;
      const steps = current.__chordwheelStepStates;
      if (Array.isArray(steps) && steps.some(s => s !== -1)) return true;
    }
    const nextId = current.dataset?.nextToyId;
    if (!nextId) break;
    current = document.getElementById(nextId);
    if (!current || current === head) break;
  }
  return false;
}

// (moved into createDrawGrid - per-instance)

function normalizeMapColumns(map, cols) {
  // Ensure consistent shape for player & renderers
  if (!map) return { active: Array(cols).fill(false), nodes: Array.from({length: cols}, () => new Set()), disabled: Array.from({length: cols}, () => new Set()) };
  if (!Array.isArray(map.active)) map.active = Array(cols).fill(false);
  if (!Array.isArray(map.nodes)) map.nodes = Array.from({length: cols}, () => new Set());
  if (!Array.isArray(map.disabled)) map.disabled = Array.from({length: cols}, () => new Set());
  // Fill any sparse holes with Sets
  for (let i=0;i<cols;i++){
    if (!(map.nodes[i] instanceof Set)) map.nodes[i] = new Set(map.nodes[i] || []);
    if (!(map.disabled[i] instanceof Set)) map.disabled[i] = new Set(map.disabled[i] || []);
    if (typeof map.active[i] !== 'boolean') map.active[i] = !!map.active[i];
  }
  return map;
}

export function createDrawGrid(panel, { cols: initialCols = 8, rows = 12, toyId, bpm = 120 } = {}) {
  // Per-instance state (WAS module-level; moving fixes cross-toy leakage)
  let currentMap = null;                // { active:boolean[], nodes:Set[], disabled:Set[] }
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
  let headerSweepDirX = 1;
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
  const PERSIST_DEBOUNCE_MS = 150;
  let persistStateTimer = null;
  let persistedStateCache = null;
  let fallbackHydrationState = null;
  let overlayCamState = getFrameStartState?.() || { scale: 1, x: 0, y: 0 };
  let unsubscribeFrameStart = null;

  function persistStateNow(arg, extraMeta = null) {
    if (!storageKey) return;
    const opts = (arg && typeof arg === 'object' && !Array.isArray(arg) && (Object.prototype.hasOwnProperty.call(arg, 'source') || Object.prototype.hasOwnProperty.call(arg, 'bypassGuard')))
      ? arg
      : { source: (arg && typeof arg?.type === 'string') ? arg.type : 'immediate' };
    const source = typeof opts.source === 'string' ? opts.source : 'immediate';
    if (persistStateTimer) {
      clearTimeout(persistStateTimer);
      persistStateTimer = null;
    }
    try {
      const state = captureState();
      const strokeCount = Array.isArray(state?.strokes) ? state.strokes.length : 0;
      const { nodeCount, nonEmptyColumns } = computeSerializedNodeStats(state?.nodes?.list, state?.nodes?.disabled);
      const nonEmptyFromNodes = nodeCount > 0 || nonEmptyColumns > 0;
      const nonEmptyFromActive = Array.isArray(state?.nodes?.active) && state.nodes.active.some(Boolean);
      const nonEmpty = (strokeCount > 0) || nonEmptyFromNodes || nonEmptyFromActive;
      const wouldPersistEmpty = !nonEmpty;
      const now = dgNow();
      const hydratedAt = DG_HYDRATE.hydratedAt || 0;
      const msSinceHydrate = now - hydratedAt;
      const inbound = DG_HYDRATE.inbound || {};
      const inboundNonEmpty = inboundWasNonEmpty();
      const wouldOverwriteNonEmptyWithEmpty = wouldPersistEmpty && inboundNonEmpty && !DG_HYDRATE.seenUserChange;
      const forbidEmptyUntilNonEmpty =
        (DG_HYDRATE.lastPersistNonEmpty === false) && wouldPersistEmpty && inboundNonEmpty && !DG_HYDRATE.seenUserChange;
      const isEarlyHydrateWindow = hydratedAt > 0 && msSinceHydrate >= 0 && msSinceHydrate < 2000;

      let skipReason = null;
      if (wouldOverwriteNonEmptyWithEmpty) skipReason = 'empty_overwrite_guard';
      if (!skipReason && isEarlyHydrateWindow && wouldOverwriteNonEmptyWithEmpty) skipReason = 'hydrate_window_guard';
      if (!skipReason && forbidEmptyUntilNonEmpty) skipReason = 'awaiting_first_non_empty';

      if (skipReason && !DG_HYDRATE.pendingUserClear) {
        dgTraceLog('[drawgrid][persist-guard] SKIP write (empty would replace hydrated non-empty)', {
          reason: skipReason,
          source,
          msSinceHydrate,
          inbound: { ...inbound },
          seenUserChange: DG_HYDRATE.seenUserChange,
          lastPersistNonEmpty: DG_HYDRATE.lastPersistNonEmpty,
          wouldPersistEmpty,
        });
        return;
      } else if (skipReason && DG_HYDRATE.pendingUserClear) {
        dgTraceLog('[drawgrid][persist-guard] overriding skip due to user-clear', {
          originalReason: skipReason,
          source,
          inbound: { ...inbound },
        });
      }

      persistedStateCache = state;
      try {
        fallbackHydrationState = JSON.parse(JSON.stringify(state));
      } catch {
        fallbackHydrationState = state;
      }
      let meta = {
        source,
        userCleared: !!DG_HYDRATE.pendingUserClear,
        t: dgNow(),
      };
      if (extraMeta && typeof extraMeta === 'object') {
        meta = { ...meta, ...extraMeta };
      }
      if (opts && typeof opts.meta === 'object') {
        meta = { ...meta, ...opts.meta };
      }
      if (Object.prototype.hasOwnProperty.call(meta, 'userCleared')) {
        meta.userCleared = !!meta.userCleared;
      } else {
        meta.userCleared = !!DG_HYDRATE.pendingUserClear;
      }
      const payload = { v: 1, state, meta };
      try {
        const serialized = JSON.stringify(payload);
        localStorage.setItem(storageKey, serialized);
        try {
          const stack = (new Error('persist-state')).stack?.split('\n').slice(0, 5).join('\n');
          dgTraceLog('[drawgrid] PERSIST', storageKey, { bytes: serialized.length, source, nonEmpty, meta, stack });
        } catch {
          dgTraceLog('[drawgrid] PERSIST', storageKey, { source, nonEmpty, meta });
        }
      } catch (e) {
        if (DG_DEBUG) console.warn('[drawgrid] PERSIST failed', e);
        return;
      }
      if (nonEmpty) {
        DG_HYDRATE.lastPersistNonEmpty = true;
        maybeDropPersistGuard('persist-non-empty', { source });
      } else if (meta.userCleared) {
        DG_HYDRATE.lastPersistNonEmpty = false;
        maybeDropPersistGuard('persist-user-clear', { source, userCleared: true });
      } else if (DG_HYDRATE.lastPersistNonEmpty == null) {
        DG_HYDRATE.lastPersistNonEmpty = null;
      }
      if (DG_HYDRATE.pendingUserClear) DG_HYDRATE.pendingUserClear = false;
    } catch (err) {
      if (DG_DEBUG) DG.warn('persistState failed', err);
    }
  }

  function schedulePersistState(opts = {}) {
    if (!storageKey) return;
    const source = typeof opts.source === 'string' ? opts.source : 'debounced';
    const bypassGuard = !!opts.bypassGuard;
    const strokeCount = Array.isArray(strokes) ? strokes.length : 0;
    const { nodeCount } = computeCurrentMapNodeStats(currentMap?.nodes, currentMap?.disabled);
    const hasNodes = nodeCount > 0;
    const wouldPersistEmpty = strokeCount === 0 && !hasNodes;
    try {
      const now = dgNow();
      const lastRead = (typeof window !== 'undefined' && window.__PERSIST_DIAG) ? window.__PERSIST_DIAG.lastRead : null;
      if (!DG_HYDRATE.pendingUserClear && lastRead && lastRead.stats && lastRead.stats.nonEmpty) {
        const sinceRead = now - lastRead.t;
        const looksEmptyNow = wouldPersistEmpty;
        if (looksEmptyNow && Number.isFinite(sinceRead) && sinceRead < 4000) {
          if (DG_DEBUG) console.warn('[drawgrid][persist-guard] drop schedule (recent non-empty READ -> transient empty)', {
            source,
            sinceRead,
            strokeCount,
            nodeCount,
            guardActive: DG_HYDRATE.guardActive,
          });
          return;
        }
      }
    } catch (assertErr) {
      if (DG_DEBUG) console.warn('[drawgrid] persist schedule assertion failed', assertErr);
    }
    const inbound = DG_HYDRATE.inbound || {};
    const inboundNonEmpty = inboundWasNonEmpty();
    if (!bypassGuard && DG_HYDRATE.guardActive && !DG_HYDRATE.pendingUserClear) {
      const guardBlocksEmpty =
        (wouldPersistEmpty && inboundNonEmpty && !DG_HYDRATE.seenUserChange) ||
        ((DG_HYDRATE.lastPersistNonEmpty === false) && wouldPersistEmpty && inboundNonEmpty);
      if (guardBlocksEmpty) {
        dgTraceLog('[drawgrid][persist-guard] SKIP schedule (guardActive & empty would overwrite)', {
          source,
          inbound: { ...inbound },
          strokeCount,
          nodeCount,
          seenUserChange: DG_HYDRATE.seenUserChange,
          lastPersistNonEmpty: DG_HYDRATE.lastPersistNonEmpty,
        });
        return;
      }
    }
    if (persistStateTimer) clearTimeout(persistStateTimer);
    persistStateTimer = setTimeout(() => {
      persistStateTimer = null;
      persistStateNow({ source });
    }, PERSIST_DEBOUNCE_MS);
  }

  const persistBeforeUnload = () => persistStateNow({ source: 'beforeunload' });

  function loadPersistedState() {
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const state = parsed.state || parsed;
        if (state && typeof state === 'object') {
          persistedStateCache = state;
          try {
            fallbackHydrationState = JSON.parse(JSON.stringify(state));
          } catch {
            fallbackHydrationState = state;
          }
          return state;
        }
      }
    } catch (err) {
      if (DG_DEBUG) DG.warn('loadPersistedState failed', err);
    }
    return null;
  }

  if (storageKey && typeof window !== 'undefined') {
    try { window.addEventListener('beforeunload', persistBeforeUnload); } catch {}
  }

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
  const DG_SINGLE_CANVAS_OVERLAYS = (() => {
    try {
      if (typeof window !== 'undefined' && window.__DG_SINGLE_CANVAS_OVERLAYS !== undefined) {
        return !!window.__DG_SINGLE_CANVAS_OVERLAYS;
      }
    } catch {}
    return true;
  })();
  try { if (typeof window !== 'undefined') window.__DG_SINGLE_CANVAS_OVERLAYS = DG_SINGLE_CANVAS_OVERLAYS; } catch {}
  try { if (typeof window !== 'undefined') window.__DG_SINGLE_CANVAS = DG_SINGLE_CANVAS; } catch {}
  try {
    if (typeof window !== 'undefined' && window.__DG_PLAYHEAD_SEPARATE_CANVAS === undefined) {
      window.__DG_PLAYHEAD_SEPARATE_CANVAS = true;
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

  let updateDrawLabel;

  // --- DRAW label overlay (DOM) ---
  let drawLabel = panel.querySelector('.drawgrid-tap-label');
  if (!drawLabel) {
    drawLabel = document.createElement('div');
    drawLabel.className = 'drawgrid-tap-label';
      Object.assign(drawLabel.style, {
        position: 'absolute',
        inset: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 7,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: '700',
        letterSpacing: '0.08em',
      // Use Loopgrid/TAP-ish theming if available; bump ~50%.
      color: 'var(--tap-label-color, rgba(160,188,255,0.72))',
      textShadow: 'var(--tap-label-shadow, 0 2px 10px rgba(40,60,120,0.55))',
      fontSize: 'initial',
        lineHeight: '1',
        textTransform: 'uppercase',
        userSelect: 'none',
        opacity: `${DRAW_LABEL_OPACITY_BASE}`
      });
    wrap.appendChild(drawLabel);
    drawLabel.style.pointerEvents = 'none';
  }

  const drawLabelLetters = [];

  // Per-letter physics state
  let letterStates = []; // [{ el, x, y, vx, vy }]
  let drawLabelVisible = true;
  let lettersRAF = null;
  let lastDrawLabelPx = null;

  function __dgClamp01(value) {
    if (typeof value !== 'number') return 0;
    if (value <= 0) return 0;
    if (value >= 1) return 1;
    return value;
  }

  function __dgGetGridCssRect() {
    let rect = grid?.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height) {
      rect = wrap?.getBoundingClientRect?.();
    }
    if (!rect || !rect.width || !rect.height) return null;
    return rect;
  }

  function __dgLogicalToCssPoint(point) {
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return { x: point?.x || 0, y: point?.y || 0 };
    const rect = __dgGetGridCssRect();
    const areaWidth = (gridArea?.w > 0) ? gridArea.w : rect?.width || 1;
    const areaHeight = (gridArea?.h > 0) ? gridArea.h : rect?.height || 1;
    if (!rect) return { x: point.x, y: point.y };
    const scaleX = areaWidth > 0 ? rect.width / areaWidth : 1;
    const scaleY = areaHeight > 0 ? rect.height / areaHeight : 1;
    return {
      x: rect.left + (point.x - (gridArea?.x || 0)) * scaleX,
      y: rect.top + (point.y - (gridArea?.y || 0)) * scaleY,
    };
  }

  function __dgCssToLogicalPoint(point) {
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return { x: point?.x || 0, y: point?.y || 0 };
    const rect = __dgGetGridCssRect();
    if (!rect) return { x: point.x, y: point.y };
    const nx = __dgClamp01((point.x - rect.left) / rect.width);
    const ny = __dgClamp01((point.y - rect.top) / rect.height);
    const areaWidth = (gridArea?.w > 0) ? gridArea.w : rect.width;
    const areaHeight = (gridArea?.h > 0) ? gridArea.h : rect.height;
    return {
      x: (gridArea?.x || 0) + nx * areaWidth,
      y: (gridArea?.y || 0) + ny * areaHeight,
    };
  }

  function ensureLetterPhysicsLoop() {
    if (!drawLabelVisible || !isPanelVisible) return;
    if (lettersRAF) return;
    const step = () => {
      if (!drawLabelVisible || !isPanelVisible) {
        lettersRAF = null;
        return;
      }
      let rafNeeded = false;
      for (const st of letterStates) {
        const ax = -LETTER_PHYS.k * st.x;
        const ay = -LETTER_PHYS.k * st.y;
        st.vx = (st.vx + ax) * LETTER_PHYS.damping;
        st.vy = (st.vy + ay) * LETTER_PHYS.damping;
        st.x += st.vx;
        st.y += st.vy;

        if (Math.abs(st.x) < LETTER_PHYS.epsilon) st.x = 0;
        if (Math.abs(st.y) < LETTER_PHYS.epsilon) st.y = 0;

        const tx = Math.max(-LETTER_PHYS.max, Math.min(LETTER_PHYS.max, st.x));
        const ty = Math.max(-LETTER_PHYS.max, Math.min(LETTER_PHYS.max, st.y));
        st.el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;

        // ---- visual: brief colour flash + opacity boost on ghost impact ----
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

        let flashAmt = 0;
        if (st.lastHitTs > 0) {
          const t = now - st.lastHitTs;
          if (t <= LETTER_VIS.flashUpMs) {
            flashAmt = LETTER_VIS.flashUpMs > 0
              ? t / Math.max(1, LETTER_VIS.flashUpMs)
              : 1;
          } else if (t <= LETTER_VIS.flashUpMs + LETTER_VIS.flashDownMs) {
            const d = (t - LETTER_VIS.flashUpMs) / Math.max(1, LETTER_VIS.flashDownMs);
            flashAmt = 1 - d;
          } else {
            flashAmt = 0;
          }
        }
        const hadFlash = !!st.flashActive;
        const hasFlash = flashAmt > 0;
        st.flashActive = hasFlash;
        if (hasFlash || hadFlash) {
          const opacity = Math.min(1, LETTER_VIS.opacityBase + LETTER_VIS.opacityBoost * flashAmt);
          st.el.style.opacity = `${Math.max(0, opacity)}`;

          if (hasFlash) {
            const boost = 1 + (LETTER_VIS.flashBoost - 1) * flashAmt;
            st.el.style.filter = `brightness(${boost.toFixed(3)})`;
            st.el.style.color = LETTER_VIS.flashColor;
            st.el.style.textShadow = LETTER_VIS.flashShadow;
          } else {
            st.el.style.filter = 'none';
            st.el.style.color = '';
            st.el.style.textShadow = '';
          }
        }

        if (
          st.x !== 0 || st.y !== 0 ||
          Math.abs(st.vx) > LETTER_PHYS.epsilon ||
          Math.abs(st.vy) > LETTER_PHYS.epsilon
        ) {
          rafNeeded = true;
        }
        if (hasFlash) rafNeeded = true;
      }
      lettersRAF = rafNeeded ? requestAnimationFrame(step) : null;
    };
    lettersRAF = requestAnimationFrame(step);
  }

  function rebuildLetterStates() {
    letterStates.length = 0;
    for (const el of drawLabelLetters) {
      el.style.transition = 'none';
      el.style.willChange = 'transform';
      // visual state for hit flash
      letterStates.push({
        el, x: 0, y: 0, vx: 0, vy: 0,
        lastHitTs: 0,      // ms timestamp of last hit
        flashActive: false,
      });
    }
    ensureLetterPhysicsLoop();
  }

  function renderDrawText() {
    if (!drawLabel) return;
    drawLabelLetters.length = 0;
    drawLabel.innerHTML = '';
    for (const ch of 'DRAW') {
      const span = document.createElement('span');
      span.className = 'drawgrid-letter';
      span.textContent = ch;
      span.style.display = 'inline-block';
      span.style.willChange = 'transform';
      span.style.transform = 'translate3d(0,0,0)';
      // Visual baseline for per-letter effects
      span.style.opacity = `${LETTER_VIS.opacityBase}`;       // per-letter opacity (multiplies with container’s 0.3)
      span.style.filter = 'none';     // we'll bump brightness briefly on hit
      drawLabel.appendChild(span);
      drawLabelLetters.push(span);
    }
    rebuildLetterStates();
  }
  renderDrawText();

  // Track whether the player has completed their first line this session.
  let hasDrawnFirstLine = false;

  function setDrawTextActive(active) {
    if (!drawLabel) return;
    if (active) {
      drawLabel.style.display = 'flex';
      // Restore base opacity whenever we show it
      drawLabel.style.opacity = `${DRAW_LABEL_OPACITY_BASE}`;
      drawLabelVisible = true;
      ensureLetterPhysicsLoop();
    } else {
      drawLabel.style.opacity = '0';
      drawLabel.style.display = 'none';
      drawLabelVisible = false;
      if (lettersRAF) {
        cancelAnimationFrame(lettersRAF);
        lettersRAF = null;
      }
    }
  }

  function fadeOutDrawLabel(opts = {}) {
    const { immediate = false } = opts || {};
    if (!drawLabel) return;
    hasDrawnFirstLine = true;

    if (immediate) {
      drawLabel.style.transition = 'none';
      drawLabel.style.opacity = '0';
      setDrawTextActive(false);
      return;
    }

    try {
      drawLabel.style.transition = 'opacity 260ms ease-out';
    } catch {}
    drawLabel.style.opacity = '0';

    setTimeout(() => {
      try {
        setDrawTextActive(false);
        // Clear transition so future shows don't inherit it unexpectedly
        drawLabel.style.transition = '';
      } catch {}
    }, 280);
  }

  function knockLettersAt(localX, localY, { radius = 72, strength = 10, source = 'unknown' } = {}) {
  const z = Math.max(0.1, dgViewport?.getZoom?.() || 1);
  const scaledRadius = radius * z;
    if (!drawLabel || !drawLabelLetters.length) return;
    const rect = drawLabel?.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height) return;
    const baseX = (typeof localX === 'number' ? localX : 0) + (gridArea?.x || 0);
    const baseY = (typeof localY === 'number' ? localY : 0) + (gridArea?.y || 0);
    const cssPoint = __dgLogicalToCssPoint({ x: baseX, y: baseY });
    const relX = cssPoint.x - rect.left;
    const relY = cssPoint.y - rect.top;
    drawLabelLetters.forEach((el, idx) => {
      const letterRect = el.getBoundingClientRect?.();
      if (!letterRect) return;

      const lx = letterRect.left - rect.left + letterRect.width * 0.5;
      const ly = letterRect.top  - rect.top  + letterRect.height * 0.5;

      const dx = lx - relX;
      const dy = ly - relY;
      const distSq = dx * dx + dy * dy;
      if (distSq > scaledRadius * scaledRadius) return;

      const dist = Math.sqrt(distSq) || 1;
      const fall = 1 - Math.min(1, dist / scaledRadius);
      const push = strength * fall * fall;

      const ux = dx / dist;
      const uy = dy / dist;

      const st = letterStates[idx];
      if (!st) return;
      const impulse = LETTER_PHYS.impulse * push;
      st.vx += ux * impulse;
      st.vy += uy * impulse;

      ensureLetterPhysicsLoop();
      // ---- visual: register a hit only for ghost fingers within the core radius ----
      const coreHitRadius = scaledRadius * LETTER_VIS.ghostCoreHitMul;
        if ((source === 'ghost' || source === 'line' || source === 'header') && dist <= coreHitRadius) {
        st.lastHitTs = (typeof performance !== 'undefined' && performance.now)
          ? performance.now()
          : Date.now();
      }
      if (DG_GHOST_DEBUG) {
        try { console.debug('[DG][letters-hit]', { idx, dx, dy }); } catch {}
      }
    });
  }

  updateDrawLabel = (show) => {
    // Once we've faded it out after the first line, don't resurrect it
    // unless explicitly re-enabled via clear().
    if (hasDrawnFirstLine) {
      if (!show) setDrawTextActive(false);
      return;
    }
    setDrawTextActive(!!show);
  };

  // Initial state: label visible before the player has drawn anything.
  updateDrawLabel(true);

  function getToyLogicalSize() {
    const width = Math.max(1, Math.round(wrap?.clientWidth || 1));
    const height = Math.max(1, Math.round(wrap?.clientHeight || 1));
    return { w: width, h: height };
  }

  function getToyCssSizeForParticles() {
    const host = wrap || panel;
    const rect = host?.getBoundingClientRect?.();
    const width = Math.max(1, Math.round(rect?.width || 1));
    const height = Math.max(1, Math.round(rect?.height || 1));
    return { w: width, h: height };
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
        drawLineWidthPx = typeof getLineWidth === 'function' ? getLineWidth() : null;
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
  function __dgGridReady() {
    return !!(gridArea && gridArea.w > 0 && gridArea.h > 0 && cw > 0 && ch > 0);
  }
  function initDrawgridParticles() {
    // Hard guard: if a previous field exists, nuke it & clear the surface
    if (panel.__drawParticles && typeof panel.__drawParticles.destroy === 'function') {
      try { panel.__drawParticles.destroy(); } catch {}
      panel.__drawParticles = null;
    }
    try {
      const ctx = particleCanvas.getContext('2d', { alpha: true });
      ctx && ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    } catch {}
    try {
      dgField?.destroy?.();
      dgViewport?.refreshSize?.({ snap: true });

      // Read the global particle budget (FPS & device driven).
      const budget = (() => {
        try {
          return getParticleBudget();
        } catch {
          return { spawnScale: 1.0, maxCountScale: 1.0 };
        }
      })();

      // Base config values for a "nice" look on fast machines.
      const BASE_CAP = 2200;
      const cap = Math.max(200, Math.floor(BASE_CAP * (budget.maxCountScale ?? 1)));

      // Nudge size slightly with quality so low tiers feel less dense and noisy.
      const baseSize = 1.4;
      const sizePx = baseSize * (0.8 + 0.4 * (budget.spawnScale ?? 1));

      dgField = createField(
        {
          canvas: particleCanvas,
          viewport: dgViewport,
          pausedRef,
        },
        {
          debugLabel: 'drawgrid-particles',
          seed: panelSeed,
          cap,
          returnSeconds: 2.4,   // slower settle time so brightness/offsets linger
          // Give pokes some visible impact
          forceMul: 2.5,
          noise: 0,
          kick: 0.25,
          kickDecay: 800.0,

          // Restore normal idle particle look (same as Simple Rhythm)
          drawMode: 'dots',
          sizePx,
          minAlpha: 0.25,
          maxAlpha: 0.85,

          // Avoid "stuck" feeling when only a couple DrawGrid panels exist.
          // We only freeze unfocused panels during gestures when the scene is busy.
          isFocusedRef: () => !!panel?.classList?.contains('toy-focused'),
          freezeUnfocusedDuringGestureRef: () => {
            return false;
          },
          gestureThrottleRef: () => {
            const visiblePanels = Math.max(0, Number(globalDrawgridState?.visibleCount) || 0);
            const now = performance?.now?.() ?? Date.now();
            const moving = !!(__lastZoomMotionTs && (now - __lastZoomMotionTs) < ZOOM_STALL_MS);
            return moving && visiblePanels >= 4;
          },
        }
      );
      window.__dgField = dgField;
      drawgridLog('[DG] field config', dgField?._config);
      dgViewport?.refreshSize?.({ snap: true });
      dgField?.resize?.();
      try {
        const adaptive = getAdaptiveFrameBudget?.();
        const pb = adaptive?.particleBudget;
        if (pb && typeof dgField.applyBudget === 'function') {
          const maxCountScale = Math.max(0.15, (pb.maxCountScale ?? 1) * (pb.capScale ?? 1));
          dgField.applyBudget({
            maxCountScale,
            capScale: pb.capScale ?? 1,
            tickModulo: 1,
            sizeScale: pb.sizeScale ?? 1,
          });
        }
      } catch {}
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try {
          dgViewport?.refreshSize?.({ snap: true });
          dgField?.resize?.();
        } catch {}
      }));
      const logicalSize = getToyLogicalSize();
      gridAreaLogical.w = logicalSize.w;
      gridAreaLogical.h = logicalSize.h;
      __auditZoomSizes('init-field');
      panel.__drawParticles = dgField;
    } catch (err) {
      console.warn('[drawgrid] particle field init failed', err);
      dgField = null;
    }
  }
  initDrawgridParticles();

  if (typeof ResizeObserver !== 'undefined') {
    const particleResizeObserver = new ResizeObserver(() => {
      try { dgViewport?.refreshSize?.({ snap: true }); } catch {}
      try { dgField?.resize?.(); } catch {}
    });
    particleResizeObserver.observe(wrap);
    panel.addEventListener('toy:remove', () => particleResizeObserver.disconnect(), { once: true });
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
  const backCtx = backCanvas.getContext('2d', { alpha: true, desynchronized: true });
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
          resetCtx(playheadFrontCtx);
          withDeviceSpace(playheadFrontCtx, () => {
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
    const showOverlay = !flat && (!DG_SINGLE_CANVAS || DG_SINGLE_CANVAS_OVERLAYS);
    // Keep the main paint canvas visible; hide auxiliary layers in flat mode.
    toggle(paint, true);
    toggle(grid, showGrid);
    if (nodesCanvas !== grid) toggle(nodesCanvas, showGrid);
    toggle(ghostCanvas, showOverlay);
    toggle(flashCanvas, showOverlay);
    toggle(tutorialCanvas, !flat);
    toggle(particleCanvas, !flat);
    toggle(playheadCanvas, !flat && separatePlayhead && (!DG_SINGLE_CANVAS || DG_SINGLE_CANVAS_OVERLAYS));
    if (DG_SINGLE_CANVAS) {
      toggle(grid, false);
      if (nodesCanvas !== grid) toggle(nodesCanvas, DG_SINGLE_CANVAS_OVERLAYS);
      toggle(ghostCanvas, DG_SINGLE_CANVAS_OVERLAYS);
      toggle(flashCanvas, DG_SINGLE_CANVAS_OVERLAYS);
      toggle(playheadCanvas, DG_SINGLE_CANVAS_OVERLAYS && separatePlayhead);
    }
  }
  updateFlatLayerVisibility();

  function pokeFieldToy(source, xToy, yToy, radiusToy, strength, extra = {}) {
    try {
      const config = DG_KNOCK[source] || {};

      const zoomSnapshot = typeof getOverlayZoomSnapshot === 'function'
        ? getOverlayZoomSnapshot()
        : null;
      const zoomScale = zoomSnapshot?.scale || 1;

      // radiusToy already defined in toy/world space; the field converts to CSS when needed.
      const radius = radiusToy;

      const strengthToy = strength * (config.strengthMul ?? 1);

      if (!Number.isFinite(radius) || radius <= 0) {
        console.warn('[DG][pokeFieldToy] skipping invalid radius', {
          source,
          radiusToy,
          radius,
          xToy,
          yToy,
        });
        return;
      }

      if (DG_DEBUG && DG_DEBUG.poke) {
        console.log('[DG][POKE][DEBUG]', {
          source,
          zoomScale,
          xToy,
          yToy,
          radiusToy,
          radiusWorld: radius,
          radiusPx: radius * zoomScale,
          strength,
          strengthToy,
          extra,
        });
      }

      __dgParticlePokeTs = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();

      if (typeof window !== 'undefined' && window.DG_ZOOM_AUDIT) {
        try {
          // Visual crosshair at the toy coordinate we’re poking
          withLogicalSpace(ghostCtx, () => {
            if (!ghostCtx) return;
            ghostCtx.save();
            ghostCtx.strokeStyle = 'rgba(255,80,80,0.9)';
            ghostCtx.lineWidth = 1;
            ghostCtx.beginPath();
            ghostCtx.moveTo(xToy - 6, yToy);
            ghostCtx.lineTo(xToy + 6, yToy);
            ghostCtx.moveTo(xToy, yToy - 6);
            ghostCtx.lineTo(xToy, yToy + 6);
            ghostCtx.stroke();
            ghostCtx.restore();
          });
        } catch {}

        const camSnapshot = getOverlayZoomSnapshot();
        const auditZoom = camSnapshot?.scale || 1;
        const view = dgMap?.size ? dgMap.size() : null;
        /*console.log('[DG][POKE]', {
          source,
          zoomScale: auditZoom,
          xToy,
          yToy,
          radiusToy,
          radiusWorld: radius,
          radiusPx: radius * auditZoom,
          strength,
          strengthToy,
          gridArea: gridArea && { ...gridArea },
          gridAreaLogical: { ...gridAreaLogical },
          viewportSize: view,
        });*/
      }

      dgField?.poke?.(xToy, yToy, {
        radius,
        strength: strengthToy,
        ...extra,
      });
      dbgPoke(source || 'poke');
    } catch (err) {
      console.warn('[DG][pokeFieldToy] failed', { source, err });
    }
  }

  function pushAlongSegment(field, ax, ay, bx, by, opts = {}) {
    if (!field?.pushDirectional) return;
    const coords = [ax, ay, bx, by];
    if (coords.some((v) => !Number.isFinite(v))) return;
    const dx = bx - ax;
    const dy = by - ay;
    const segLen = Math.hypot(dx, dy);
    const radius = Math.max(1, Number.isFinite(opts.radius) ? opts.radius : 32);
    const spacing = Math.max(4, Number.isFinite(opts.spacing) ? opts.spacing : Math.round(radius * 0.6));
    let steps = segLen > 0 ? Math.max(1, Math.ceil(segLen / spacing)) : 0;
    const maxSteps = Number.isFinite(opts.maxSteps) ? Math.max(1, Math.floor(opts.maxSteps)) : null;
    if (maxSteps && steps > maxSteps) {
      steps = maxSteps;
    }
    let dirX;
    let dirY;
    if (Number.isFinite(opts.dirX) || Number.isFinite(opts.dirY)) {
      dirX = Number.isFinite(opts.dirX) ? opts.dirX : 0;
      dirY = Number.isFinite(opts.dirY) ? opts.dirY : 0;
    } else if (segLen > 0) {
      dirX = dx / segLen;
      dirY = dy / segLen;
    } else {
      dirX = 1;
      dirY = 0;
    }
    const payload = {
      radius,
      strength: Number.isFinite(opts.strength) ? opts.strength : 1200,
      falloff: typeof opts.falloff === 'string' ? opts.falloff : 'gaussian',
      forceMul: opts.forceMul,
    };
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const sx = ax + dx * t;
      const sy = ay + dy * t;
      field.pushDirectional(sx, sy, dirX, dirY, payload);
    }
  }

  function pushHeaderSweepAt(xToy, { lineWidthPx, maxSteps } = {}) {
    try {
      // Do not inject forces while camera is in motion / settling.
      if (headerPushSuppressed()) return;

      if (!dgField?.pushDirectional || !Number.isFinite(xToy)) return;
      const area = (gridArea && gridArea.w > 0 && gridArea.h > 0)
        ? gridArea
        : null;
      if (!area || area.h <= 0) return;
      const zoomScale = getOverlayZoomSnapshot()?.scale || 1;
      const columnWidth = (Number.isFinite(cw) && cw > 0)
        ? cw
        : Math.max(6, (area.w || 0) / Math.max(1, cols || 1));
      const headerLineWidthPx = Number.isFinite(lineWidthPx) ? lineWidthPx : columnWidth;
      const lineWidthWorld = headerLineWidthPx / Math.max(zoomScale, 1e-3);
      const fallbackRadius = typeof DG_KNOCK?.headerLine?.radiusToy === 'function'
        ? DG_KNOCK.headerLine.radiusToy(area)
        : null;
      const radius = Number.isFinite(fallbackRadius) && fallbackRadius > 0
        ? fallbackRadius
        : Math.max(8, lineWidthWorld * (HeaderSweepForce.radiusMul || 2));
      const spacing = Math.max(4, radius * (HeaderSweepForce.spacingMul || 0.6));
      const strength = Number.isFinite(HeaderSweepForce.strength)
        ? HeaderSweepForce.strength
        : (DG_KNOCK?.headerLine?.strength || 1600);
      pushAlongSegment(
        dgField,
        xToy,
        area.y,
        xToy,
        area.y + area.h,
        {
          radius,
          strength,
          spacing,
          falloff: HeaderSweepForce.falloff || 'gaussian',
          dirX: headerSweepDirX || 1,
          dirY: 0,
          maxSteps,
        },
      );
      const lettersRadius = Math.max(40, radius * 1.6);
      const localX = xToy - (area.x || 0);
      const localY = (area.h || 0) * 0.5;
      knockLettersAt(localX, localY, {
        radius: lettersRadius,
        strength: DG_KNOCK.lettersMove.strength,
        source: 'header',
      });
    } catch (err) {
      if (DG_DEBUG) console.warn('[DG][pushHeaderSweepAt] failed', err);
    }
  }

  // Poke a thick band along a stroke from (x0,y0)->(x1,y1), sampling along the path and across its width.
  function pokeAlongStrokeBand(x0, y0, x1, y1, widthPx, preset = {}) {
    try {
      const { radiusToy, strength } = preset || {};
      const area = (gridArea && gridArea.w > 0 && gridArea.h > 0)
        ? gridArea
        : { x: 0, y: 0, w: cssW || 0, h: cssH || 0 };
      const r = typeof radiusToy === 'function' ? radiusToy(area) : radiusToy;
      const s = strength;
      if (!Number.isFinite(r) || r <= 0 || !Number.isFinite(s) || s <= 0) return;
      const dx = (x1 ?? 0) - (x0 ?? 0);
      const dy = (y1 ?? 0) - (y0 ?? 0);
      const len = Math.hypot(dx, dy) || 0;
      const ux = len > 0 ? (dx / len) : 1;
      const uy = len > 0 ? (dy / len) : 0;
      const nx = -uy;
      const ny = ux;
      const stepAlong = Math.max(4, r * 0.6);
      const stepAcross = Math.max(4, r * 0.6);
      const baseWidth = Number.isFinite(widthPx) ? widthPx : r;
      const halfW = Math.max(r, baseWidth * 0.5);
      const samplesAlong = Math.max(1, Math.ceil(len / stepAlong));
      const samplesAcross = Math.max(1, Math.ceil((halfW * 2) / stepAcross));
      for (let i = 0; i <= samplesAlong; i++) {
        const t = samplesAlong === 0 ? 0 : (i / samplesAlong);
        const cx = x0 + dx * t;
        const cy = y0 + dy * t;
        for (let j = -samplesAcross; j <= samplesAcross; j++) {
          const off = j * stepAcross * 0.5;
          const sx = cx + nx * off;
          const sy = cy + ny * off;
          pokeFieldToy('drag-band', sx, sy, r, s, { mode: 'plow' });
        }
      }
    } catch {}
  }

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

  // ===== Paint lifecycle tracing (enable from console) =====
  // window.__DG_PAINT_TRACE = true
  try { if (typeof window !== 'undefined') window.__DG_PAINT_TRACE = false; } catch {}
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

  let __dgSuppressPostCommitOnPaintResize = false;
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
  function getActivePaintCanvas() {
    // draw into back when using back-buffers, otherwise front (paint)
    if (DG_SINGLE_CANVAS) return backCanvas;
    return usingBackBuffers ? backCanvas : frontCanvas; // frontCanvas === paint
  }
  function getActivePaintCtx() {
    // return the already-created 2D contexts; do not create a fresh context
    if (DG_SINGLE_CANVAS) return backCtx;
    return usingBackBuffers ? backCtx : frontCtx;
  }
  function resetPaintBlend(ctx) {
    if (!ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // Map pointer coordinates into the active paint canvas's logical space.
  function pointerToPaintLogical(ev = {}) {
    const canvas = DG_SINGLE_CANVAS
      ? frontCanvas
      : ((typeof getActivePaintCanvas === 'function' ? getActivePaintCanvas() : null) || frontCanvas);
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect?.();
    const rw = Math.max(1, rect?.width || canvas.clientWidth || cssW || canvas.width || 1);
    const rh = Math.max(1, rect?.height || canvas.clientHeight || cssH || canvas.height || 1);
    const dpr = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
    const lw = cssW || (canvas.width / dpr) || rw;
    const lh = cssH || (canvas.height / dpr) || rh;
    const clientX = ev?.clientX ?? ev?.x ?? 0;
    const clientY = ev?.clientY ?? ev?.y ?? 0;
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    const lx = (clientX - left) * (lw / rw);
    const ly = (clientY - top) * (lh / rh);
    return {
      x: Number.isFinite(lx) ? lx : 0,
      y: Number.isFinite(ly) ? ly : 0,
    };
  }

  function resizeSurfacesFor(nextCssW, nextCssH, nextDpr) {
    return perfMarkSection('drawgrid.resize', () => {
      if (!__dgCommitResizeCount && (() => { try { return !!window.__ZOOM_COMMIT_PHASE; } catch {} return false; })()) {
        __dgCommitResizeCount = 1;
        if (DG_DEBUG) { try { console.warn('[DG] resizeSurfacesFor during commit'); } catch {} }
      }
      const dpr = Math.max(1, Number.isFinite(nextDpr) ? nextDpr : (window.devicePixelRatio || 1));
      paintDpr = Math.max(1, Math.min(dpr, 3));
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
      __dgLastResizeTargetW = targetW;
      __dgLastResizeTargetH = targetH;
      __dgLastResizeDpr = paintDpr;
      if (dprChanged || sizeChanged) {
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
    paintDpr = Math.max(1, Math.min((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1, 3));
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
      const visible = Number(globalDrawgridState?.visibleCount) || 0;
      if (visible > 1) return false;
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
          drawGrid();
          if (currentMap) drawNodes(currentMap.nodes);
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
      const layoutSize = getLayoutSize();
      if (layoutSize.w && layoutSize.h) {
        cssW = Math.max(1, layoutSize.w);
        cssH = Math.max(1, layoutSize.h);
        progressMeasureW = cssW;
        progressMeasureH = cssH;
        try { dgViewport?.refreshSize?.({ snap: true }); } catch {}
        resizeSurfacesFor(cssW, cssH, window.devicePixelRatio || paintDpr || 1);
      }
      layout(true);
      const commitScale = Number.isFinite(zoomPayload?.currentScale)
        ? zoomPayload.currentScale
        : (Number.isFinite(zoomPayload?.targetScale) ? zoomPayload.targetScale : null);
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
  if (!force && __dgInCommitWindow(nowTs)) {
    return true;
  }
  const host = wrap || body || frontCanvas?.parentElement;
  const measured = host ? measureCSSSize(host) : { w: 0, h: 0 };
  let { w, h } = measured;
  if (!w || !h) return false;
  layoutSizeDirty = false;
  w = Math.max(1, w);
  h = Math.max(1, h);

  changed = force || Math.abs(w - cssW) > 0.5 || Math.abs(h - cssH) > 0.5;
  if (changed) {
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

    resizeSurfacesFor(cssW, cssH, window.devicePixelRatio || paintDpr || 1);
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
  let persistentDisabled = Array.from({ length: initialCols }, () => new Set()); // survives view changes
  let btnLine1, btnLine2;
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
      drawGrid();
      if (currentMap) drawNodes(currentMap.nodes);
    } catch {}
    __dgNeedsUIRefresh = true;
    __dgStableFramesAfterCommit = 0;
  } catch {}

  function __dgGetDrawLabelYRange() {
    if (!drawLabel) return null;
    const drawRect = drawLabel.getBoundingClientRect?.();
    if (!drawRect) return null;
    const centerX = drawRect.left + drawRect.width * 0.5;
    const logicalTop = __dgCssToLogicalPoint({ x: centerX, y: drawRect.top });
    const logicalBottom = __dgCssToLogicalPoint({ x: centerX, y: drawRect.bottom });
    const topY = Math.min(logicalTop.y, logicalBottom.y);
    const bottomY = Math.max(logicalTop.y, logicalBottom.y);
    if (!Number.isFinite(topY) || !Number.isFinite(bottomY) || bottomY <= topY) return null;
    const areaTop = Number.isFinite(gridArea?.y) ? gridArea.y : topY;
    const areaBottom = Number.isFinite(gridArea?.h) ? (gridArea.y + gridArea.h) : bottomY;
    const minY = Math.max(areaTop, topY);
    const maxY = Math.min(areaBottom, bottomY);
    if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY <= minY) return null;
    return { minY, maxY, midY: (minY + maxY) * 0.5 };
  }

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
          resetCtx(fctx);
          withLogicalSpace(fctx, () => {
            const { x, y, w, h } = getOverlayClearRect({
              canvas: flashTarget,
              pad: getOverlayClearPad(),
              allowFull: !!panel.__dgFlashOverlayOutOfGrid,
              gridArea,
            });
            fctx.clearRect(x, y, w, h);
          });
          markFlashLayerCleared();

          const ghostTarget = getActiveGhostCanvas();
          resetCtx(ghostCtx);
          withLogicalSpace(ghostCtx, () => {
            const { x, y, w, h } = getOverlayClearRect({
              canvas: ghostTarget,
              pad: getOverlayClearPad() * 1.2,
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
        pushHeaderSweepAt(xToy);
        dbgPoke('header');
      } catch {}
    });
  }

  const clearTutorialHighlight = () => {
    if (!tutorialCtx) return;
    resetCtx(tutorialCtx);
    withLogicalSpace(tutorialCtx, () => {
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
    resetCtx(tutorialCtx);
    withLogicalSpace(tutorialCtx, () => {
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

  const header = panel.querySelector('.toy-header');
  if (header){
    const right = header.querySelector('.toy-controls-right') || header;
    // --- Generator Line Buttons (Advanced Mode Only) ---
    const generatorButtonsWrap = document.createElement('div');
    generatorButtonsWrap.className = 'drawgrid-generator-buttons';
    panel.appendChild(generatorButtonsWrap);

    btnLine1 = document.createElement('button');
    btnLine1.type = 'button';
    btnLine1.className = 'c-btn';
    btnLine1.dataset.line = '1';
    btnLine1.title = 'Draw Line 1';
    btnLine1.style.setProperty('--c-btn-size', '96px');
    btnLine1.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>`;
    generatorButtonsWrap.appendChild(btnLine1);

    btnLine2 = document.createElement('button');
    btnLine2.type = 'button';
    btnLine2.className = 'c-btn';
    btnLine2.dataset.line = '2';
    btnLine2.title = 'Draw Line 2';
    btnLine2.style.setProperty('--c-btn-size', '96px');
    btnLine2.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>`;
    generatorButtonsWrap.appendChild(btnLine2);

    function handleGeneratorButtonClick(e) {
        const lineNum = parseInt(e.target.dataset.line, 10);
        // Toggle arming for this line; do not modify existing strokes here
        if (nextDrawTarget === lineNum) {
            nextDrawTarget = null; // disarm
        } else {
            nextDrawTarget = lineNum; // arm
        }
        updateGeneratorButtons();
    }


    btnLine1.addEventListener('click', handleGeneratorButtonClick);
    btnLine2.addEventListener('click', handleGeneratorButtonClick);

    // Auto-tune toggle
    let autoTuneBtn = right.querySelector('.drawgrid-autotune');
    if (!autoTuneBtn) {
      autoTuneBtn = document.createElement('button');
      autoTuneBtn.type = 'button';
      autoTuneBtn.className = 'toy-btn drawgrid-autotune';
      autoTuneBtn.textContent = 'Auto-tune: On';
      autoTuneBtn.setAttribute('aria-pressed', 'true');
      right.appendChild(autoTuneBtn);

      autoTuneBtn.addEventListener('click', () => {
        autoTune = !autoTune;
        autoTuneBtn.textContent = `Auto-tune: ${autoTune ? 'On' : 'Off'}`;
        autoTuneBtn.setAttribute('aria-pressed', String(autoTune));
        // Invalidate the node cache on all strokes since the tuning has changed.
        for (const s of strokes) { s.cachedNodes = null; }
        resnapAndRedraw(false);
      });
    }

    // Steps dropdown
    let stepsSel = right.querySelector('.drawgrid-steps');
    if (!stepsSel) {
        stepsSel = document.createElement('select');
        stepsSel.className = 'drawgrid-steps';
        stepsSel.innerHTML = `<option value="8">8 steps</option><option value="16">16 steps</option>`;
        stepsSel.value = String(cols);
        right.appendChild(stepsSel);

        stepsSel.addEventListener('change', () => {
            const prevCols = cols;
            const prevActive = currentMap?.active ? [...currentMap.active] : null;

            cols = parseInt(stepsSel.value, 10);
            currentCols = cols;
            panel.dataset.steps = String(cols);
            flashes = new Float32Array(cols);

            if (prevActive) {
                pendingActiveMask = { prevCols, prevActive };
            }

            // Reset manual overrides and invalidate stroke cache
            manualOverrides = Array.from({ length: cols }, () => new Set());
            for (const s of strokes) { s.cachedNodes = null; }
            persistentDisabled = Array.from({ length: cols }, () => new Set());

            resnapAndRedraw(true);
        });
    }

    // Instrument button (for tutorial unlock and general use)
    if (!right.querySelector('[data-action="instrument"]')) {
        const instBtn = document.createElement('button');
        instBtn.className = 'c-btn toy-inst-btn';
        instBtn.title = 'Choose Instrument';
        instBtn.dataset.action = 'instrument';
        instBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonInstruments.png');"></div>`;
        instBtn.style.setProperty('--c-btn-size', '65px');
        right.appendChild(instBtn);

        let sel = panel.querySelector('select.toy-instrument');
        if (!sel) {
            sel = document.createElement('select');
            sel.className = 'toy-instrument';
            sel.style.display = 'none';
            right.appendChild(sel);
        }

        instBtn.addEventListener('click', async () => {
            try {
                const { openInstrumentPicker } = await import('./instrument-picker.js');
                const { getDisplayNameForId } = await import('./instrument-catalog.js');
                const chosen = await openInstrumentPicker({ panel, toyId: (panel.dataset.toyid || panel.dataset.toy || panel.id || 'master') });
                if (!chosen) {
                    try { const h = panel.querySelector('.toy-header'); if (h) { h.classList.remove('pulse-accept'); h.classList.add('pulse-cancel'); setTimeout(() => h.classList.remove('pulse-cancel'), 650); } } catch { }
                    return;
                }
                const val = String((typeof chosen === 'string' ? chosen : chosen?.value) || '');
                const chosenNote = (typeof chosen === 'object' && chosen) ? chosen.note : null;
                const chosenOctave = (typeof chosen === 'object' && chosen) ? chosen.octave : null;
                const chosenPitchShift = (typeof chosen === 'object' && chosen) ? chosen.pitchShift : null;
                let has = Array.from(sel.options).some(o => o.value === val);
                if (!has) { 
                  const o = document.createElement('option');
                  o.value = val;
                  o.textContent = getDisplayNameForId(val) || val.replace(/[_-]/g, ' ').replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase());
                  sel.appendChild(o);
                }
                sel.value = val;
                panel.dataset.instrument = val;
                panel.dataset.instrumentPersisted = '1';
                if (chosenOctave !== null && chosenOctave !== undefined) {
                  panel.dataset.instrumentOctave = String(chosenOctave);
                }
                if (chosenPitchShift !== null && chosenPitchShift !== undefined) {
                  panel.dataset.instrumentPitchShift = chosenPitchShift ? '1' : '0';
                }
                if (chosenNote) {
                  panel.dataset.instrumentNote = String(chosenNote);
                } else {
                  delete panel.dataset.instrumentNote;
                }
                panel.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: val, note: chosenNote, octave: chosenOctave, pitchShift: chosenPitchShift }, bubbles: true }));
                panel.dispatchEvent(new CustomEvent('toy:instrument', { detail: { name: val, value: val, note: chosenNote, octave: chosenOctave, pitchShift: chosenPitchShift }, bubbles: true }));
                try { const h = panel.querySelector('.toy-header'); if (h) { h.classList.remove('pulse-cancel'); h.classList.add('pulse-accept'); setTimeout(() => h.classList.remove('pulse-accept'), 650); } } catch { }
            } catch (e) {
            }
        });
    }
  }

  function updateGeneratorButtons() {
      if (!btnLine1 || !btnLine2) return; // Guard in case header/buttons don't exist
      const hasLine1 = strokes.some(s => s.generatorId === 1);
      const hasLine2 = strokes.some(s => s.generatorId === 2);

      const core1 = btnLine1.querySelector('.c-btn-core');
      if (core1) core1.style.setProperty('--c-btn-icon-url', `url('../assets/UI/${hasLine1 ? 'T_ButtonLine1R.png' : 'T_ButtonLine1.png'}')`);
      btnLine1.title = hasLine1 ? 'Redraw Line 1' : 'Draw Line 1';

      const core2 = btnLine2.querySelector('.c-btn-core');
      if (core2) core2.style.setProperty('--c-btn-icon-url', `url('../assets/UI/${hasLine2 ? 'T_ButtonLine2R.png' : 'T_ButtonLine2.png'}')`);
      btnLine2.title = hasLine2 ? 'Redraw Line 2' : 'Draw Line 2';
      
      const a1 = nextDrawTarget === 1;
      const a2 = nextDrawTarget === 2;
      btnLine1.classList.toggle('active', a1);
      btnLine2.classList.toggle('active', a2);
      btnLine1.setAttribute('aria-pressed', String(a1));
      btnLine2.setAttribute('aria-pressed', String(a2));
  }
  try { panel.__dgUpdateButtons = updateGeneratorButtons; } catch{}

  // New central helper to redraw the paint canvas and regenerate the node map from the `strokes` array.
  function clearAndRedrawFromStrokes(targetCtx, reason) {
    return perfMarkSection('drawgrid.paint.redraw', () => {
      if (reason) __dgMarkRegenSource(reason);
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
      resetCtx(ctx);
      withLogicalSpace(ctx, () => {
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
      clearCanvas(pctx);
      emitDG('paint-clear', { reason: 'restore-snapshot' });
      resetCtx(pctx);
      resetCtx(pctx);
      withLogicalSpace(pctx, () => {
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
      paintDpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
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
        __dgMarkRegenSource('resnap');
        regenerateMapFromStrokes();
        resetCtx(pctx);
        withLogicalSpace(pctx, () => {
          clearCanvas(pctx);
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
        withDeviceSpace(ghostFrontCtx, () => ghostFrontCtx.drawImage(back, 0, 0, back.width, back.height, 0, 0, front.width, front.height));
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
      zoomGestureActive = false;
      zoomMode = 'idle'; // ensure we fully exit zoom mode 
      lastCommittedScale = boardScale;
      return;
    }
  });

  const observer = new ResizeObserver(() => {
    markLayoutSizeDirty();
    if (zoomMode === 'gesturing') {
      pendingZoomResnap = true;
      return;
    }
    resnapAndRedraw(false);
  });

  // Visibility culling: turn off heavy work when the panel is completely offscreen.
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
            const visible =
              entry.isIntersecting &&
              entry.intersectionRatio > DG_VISIBILITY_THRESHOLD;
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
            if (isPanelVisible && drawLabelVisible) {
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
  // Also respond to generic toy visibility events (shared culler)
  panel.addEventListener('toy:visibility', (e) => {
    if (typeof e?.detail?.visible === 'boolean') {
      isPanelVisible = !!e.detail.visible;
      updateGlobalVisibility(isPanelVisible);
      if (isPanelVisible && pendingResnapOnVisible) {
        pendingResnapOnVisible = false;
        resnapAndRedraw(true);
      }
      if (isPanelVisible && drawLabelVisible) {
        ensureLetterPhysicsLoop();
      }
    }
  });

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

  function measureCSSSize(el) {
    if (!el) return { w: 0, h: 0 };
    const w = el.offsetWidth || el.clientWidth || 0;
    const h = el.offsetHeight || el.clientHeight || 0;
    if (w > 0 && h > 0) return { w, h };
    const rect = el.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      let scale = 1;
      try {
        const host = el.closest?.('.board-viewport') || document.querySelector('.board-viewport');
        const raw = host ? boardScaleHelper(host) : (Number.isFinite(window?.__boardScale) ? window.__boardScale : 1);
        if (Number.isFinite(raw) && raw > 0) scale = raw;
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
    withDeviceSpace(ghostFrontCtx, () => {
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
  withDeviceSpace(frontCtx, () => {
    frontCtx.clearRect(0, 0, front.width, front.height);
    frontCtx.drawImage(back, 0, 0, back.width, back.height, 0, 0, front.width, front.height);
  });
}

function syncBackBufferSizes() {
  const pairs = [
    [gridBackCtx, gridFrontCtx],
    [nodesBackCtx, nodesFrontCtx],
    [flashBackCtx, flashFrontCtx],
    [ghostBackCtx, ghostFrontCtx],
    [tutorialBackCtx, tutorialFrontCtx]
  ];
  for (const [back, front] of pairs) {
    if (!back || !front) continue;
    if (back.canvas.width  !== front.canvas.width ||
        back.canvas.height !== front.canvas.height) {
      back.canvas.width  = front.canvas.width;
      back.canvas.height = front.canvas.height;
    }
  }
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

  function updatePaintBackingStores({ force = false, target } = {}) {
    if (!cssW || !cssH) return;
    if (!force && zoomGestureActive) return;
    const targetW = Math.max(1, Math.round(cssW * paintDpr));
    const targetH = Math.max(1, Math.round(cssH * paintDpr));
    let didResizePaint = false;
    const mode = target || (usingBackBuffers ? 'back' : 'both');
    const updateFront = mode === 'front' || mode === 'both';
    const updateBack = mode === 'back' || mode === 'both';

    if (debugCanvas) {
      if (force || debugCanvas.width !== targetW || debugCanvas.height !== targetH) {
        debugCanvas.width = targetW;
        debugCanvas.height = targetH;
      }
    }

    if (updateFront) {
      if (
        force ||
        frontCanvas.width !== targetW ||
        frontCanvas.height !== targetH
      ) {
        frontCanvas.width = targetW;
        frontCanvas.height = targetH;
        dgPaintTrace('front:resize-cleared', { force, targetW, targetH, mode });
        didResizePaint = true;
        // IMPORTANT: setting canvas width/height clears the bitmap.
        // We must redraw from strokes after any resize (handled below).
        (frontCtx || pctx).setTransform(1, 0, 0, 1, 0, 0);
        (frontCtx || pctx).imageSmoothingEnabled = true;
        // Scaling applied per-draw via withLogicalSpace().
      }
    }

    if (updateBack && backCtx) {
      if (
        force ||
        backCanvas.width !== targetW ||
        backCanvas.height !== targetH
      ) {
        backCanvas.width = targetW;
        backCanvas.height = targetH;
        dgPaintTrace('back:resize-cleared', { force, targetW, targetH, mode });
        didResizePaint = true;
        backCtx.setTransform(1, 0, 0, 1, 0, 0);
        backCtx.imageSmoothingEnabled = true;
        // Scaling applied per-draw via withLogicalSpace().
      }
    }
    // If we resized any paint backing store, the paint bitmap was cleared.
    // On refresh this was causing hydrated strokes to "vanish" until the next interaction.
    // Use the existing post-commit redraw path so we don't fight zoom commit.
    if (
      didResizePaint &&
      !__dgSuppressPostCommitOnPaintResize &&
      Array.isArray(strokes) &&
      strokes.length > 0
    ) {
      try {
        let ptsReady = 0;
        let ptsMissing = 0;
        for (const s of strokes) {
          const hasPts = Array.isArray(s?.pts) && s.pts.length > 0;
          const hasN = Array.isArray(s?.__ptsN) && s.__ptsN.length > 0;
          if (hasPts) ptsReady++;
          else if (hasN) ptsMissing++;
        }
        dgLogLine?.('paint-resize:scheduled-redraw', {
          panelId: panel?.id || null,
          force: !!force,
          targetW,
          targetH,
          strokes: strokes.length,
          ptsReady,
          ptsMissing
        });
      } catch {}
      dgPaintTrace('postCommit:scheduled', { reason: 'paint-backingstore-resize', targetW, targetH, strokes: strokes?.length || 0 });
      try { ensurePostCommitRedraw('paint-backingstore-resize'); } catch {}
    }
    if (DG_LAYOUT_DEBUG && force) {
      debugPaintSizes('updatePaintBackingStores', { target, force });
    }
  }

  function swapBackToFront() {
    if (!backCtx || !cssW || !cssH) return;
    dgPaintTrace('swapBackToFront:begin');
    if (DG_LAYOUT_DEBUG) dgLogLine('swapBackToFront:ctx', {
      usingBackBuffers,
      pctxIsFront: pctx === frontCtx,
      pctxIsBack: pctx === backCtx,
    });
    updatePaintBackingStores({ force: true, target: 'front' });
    debugPaintSizes('swapBackToFront:before');
    try {
      withDeviceSpace(frontCtx, () => {
        frontCtx.drawImage(
          backCanvas,
          0, 0, backCanvas.width, backCanvas.height,
          0, 0, frontCanvas.width, frontCanvas.height
        );
      });
    } catch {}
    dgPaintTrace('swapBackToFront:end');
    debugPaintSizes('swapBackToFront:after');
  }

  function compositeSingleCanvas() {
    if (!DG_SINGLE_CANVAS || !frontCtx) return;
    if (!__dgGridReady()) return;
    const surface = frontCtx.canvas;
    if (!surface || !surface.width || !surface.height) return;
    if (!panel.__dgSingleCompositeDirty && !panel.__dgCompositeBaseDirty && !panel.__dgCompositeOverlayDirty) {
      return;
    }
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
    dgGridAlphaLog('composite:begin', frontCtx);
    __dgLayerTrace('composite:enter', {
      panelId: panel?.id || null,
      usingBackBuffers,
      frontRole: frontCtx?.canvas?.getAttribute?.('data-role') || null,
      frontSize: frontCtx?.canvas ? { w: frontCtx.canvas.width, h: frontCtx.canvas.height } : null,
    });
    if (!panel.__dgGridHasPainted) {
      try { drawGrid(); } catch {}
    }
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
      withDeviceSpace(baseCtx, () => {
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
    }

    const __finalStart = __perfOn ? performance.now() : 0;
    withDeviceSpace(frontCtx, () => {
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
    __dgLayerTrace('composite:exit', {
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

      for (const canvas of styleCanvases) {
        canvas.style.width = `${logicalWidth}px`;
        canvas.style.height = `${logicalHeight}px`;
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

      for (const canvas of allCanvases) {
        if (canvas.width !== pixelW) canvas.width = pixelW;
        if (canvas.height !== pixelH) canvas.height = pixelH;
        canvas.style.width = `${logicalWidth}px`;
        canvas.style.height = `${logicalHeight}px`;
        const ctx = canvas.getContext && canvas.getContext('2d');
        resetCtx(ctx);
      }

      const copyCtx = (srcCtx, dstCtx) => {
        if (!srcCtx || !dstCtx) return;
        if (srcCtx === dstCtx || srcCtx.canvas === dstCtx.canvas) return;
        if (DG_SINGLE_CANVAS && (srcCtx === gridFrontCtx || srcCtx === nodesFrontCtx)) return;
        withDeviceSpace(dstCtx, () => {
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

    withDeviceSpace(gridFrontCtx, () => {
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

    withDeviceSpace(nodesFrontCtx, () => {
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

    withDeviceSpace(flashFrontCtx, () => {
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

    withDeviceSpace(ghostFrontCtx, () => {
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

    withDeviceSpace(tutorialFrontCtx, () => {
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
    return perfMarkSection('drawgrid.layout', () => {
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

    if (newW === 0 || newH === 0) {
      requestAnimationFrame(() => resnapAndRedraw(force));
      return;
    }

      if ((!zoomGestureActive && (force || Math.abs(newW - cssW) > 1 || Math.abs(newH - cssH) > 1)) || (force && zoomGestureActive)) {
        const oldW = cssW;
        const oldH = cssH;
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
      resizeSurfacesFor(cssW, cssH, window.devicePixelRatio || paintDpr || 1);
      if (tutorialHighlightMode !== 'none') renderTutorialHighlight();


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
      // Compute proportional margin in CSS px (already in the visible, transformed space)
      const safeScale = typeof dgMap?.scale === 'function' ? dgMap.scale() : Math.min(cssW, cssH);
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
          if (gridBackCtx?.canvas) withDeviceSpace(gridBackCtx, () => gridBackCtx.clearRect(0, 0, gridBackCtx.canvas.width, gridBackCtx.canvas.height));
          if (nodesBackCtx?.canvas) withDeviceSpace(nodesBackCtx, () => nodesBackCtx.clearRect(0, 0, nodesBackCtx.canvas.width, nodesBackCtx.canvas.height));
        } catch {}
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
        __dgHydrationRetryCount = 0;
      }

      // === DRAW label responsive sizing tied to toy, not viewport ===
      const areaW = gridAreaLogical?.w || wrap?.clientWidth || 0;
      const areaH = gridAreaLogical?.h || wrap?.clientHeight || 0;
      const minDim = Math.max(1, Math.min(areaW, areaH));
      const labelSizePx = Math.max(48, Math.min(240, minDim * 0.26));
      const labelSizeChanged = (lastDrawLabelPx !== labelSizePx);
      if (labelSizeChanged && drawLabel?.style) {
        drawLabel.style.fontSize = `${labelSizePx}px`;
        lastDrawLabelPx = labelSizePx;
      }
      if (Array.isArray(drawLabelLetters)) {
        const needsLetterSync = labelSizeChanged || (letterStates.length !== drawLabelLetters.length);
        if (needsLetterSync) {
          letterStates = drawLabelLetters.map((el, i) => {
            const prev = letterStates[i];
            if (prev) {
              prev.el = el;
              return prev;
            }
            return { el, x: 0, y: 0, vx: 0, vy: 0, lastHitTs: 0, flashActive: false };
          });
          ensureLetterPhysicsLoop();
        }
      }


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
      if ((__dgInCommitWindow(__now) || __dgStableFramesAfterCommit < 2) && !__dgForceOverlayClearNext) {
        __dgNeedsUIRefresh = true;
      } else {
        __dgForceOverlayClearNext = false;
        clearCanvas(nctx);
        const flashTarget = getActiveFlashCanvas();
        resetCtx(fctx);
        withLogicalSpace(fctx, () => {
          const { x, y, w, h } = getOverlayClearRect({
            canvas: flashTarget,
            pad: getOverlayClearPad(),
            allowFull: !!panel.__dgFlashOverlayOutOfGrid,
            gridArea,
          });
          fctx.clearRect(x, y, w, h);
        });
        markFlashLayerCleared();
        const ghostTarget = getActiveGhostCanvas();
        resetCtx(ghostCtx);
        withLogicalSpace(ghostCtx, () => {
          const { x, y, w, h } = getOverlayClearRect({
            canvas: ghostTarget,
            pad: getOverlayClearPad() * 1.2,
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
      pushHeaderSweepAt(xToy, { lineWidthPx: w });
      dbgPoke('header');
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
    resetCtx(ctx);
    withLogicalSpace(ctx, () => {
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
      panel.__dgGridHasPainted = false;
      return;
    }
    dgGridAlphaLog('drawGrid:begin', gctx, {
      cacheKey: __dgGridCache?.key || null,
    });
    __dgLayerTrace('drawGrid:enter', {
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
      __dgLayerDebugLog('grid-cache-miss', {
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

    resetCtx(gctx);
    const __blitStart = __perfOn ? performance.now() : 0;
    withDeviceSpace(gctx, () => {
      gctx.clearRect(0, 0, surfacePxW, surfacePxH);
      if (cache.canvas) gctx.drawImage(cache.canvas, 0, 0, surfacePxW, surfacePxH);
    });
    dgGridAlphaLog('drawGrid:blit', gctx, {
      cacheKey,
      cacheHit: cache.key === cacheKey,
    });
    if (DG_SINGLE_CANVAS && gridFrontCtx?.canvas) {
      const frontSurface = gridFrontCtx.canvas;
      withDeviceSpace(gridFrontCtx, () => {
        gridFrontCtx.clearRect(0, 0, frontSurface.width, frontSurface.height);
      });
    }
    if (__perfOn && __blitStart) {
      try { window.__PerfFrameProf?.mark?.('drawgrid.grid.blit', performance.now() - __blitStart); } catch {}
    }

    if (__dgProfileStart !== null) {
      const dt = performance.now() - __dgProfileStart;
      dgProfileSample(dt);
    }
    panel.__dgGridReadyForNodes = true;
    panel.__dgGridHasPainted = true;
    __dgMarkSingleCanvasDirty(panel);
    dgGridAlphaLog('drawGrid:end', gctx);
    __dgLayerTrace('drawGrid:exit', {
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
        if (now - __ALPHA_PATH_LAST_TS > DG_ALPHA_SPAM_MS) {
          __ALPHA_PATH_LAST_TS = now;
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
        const lineWidth = getLineWidth();
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
        const lw = getLineWidth() + (isOverlay ? 1.25 : 0);
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

    if (!skipReset) resetCtx(ctx);
    if (skipTransform) {
      drawCore();
    } else {
      withLogicalSpace(ctx, drawCore);
    }
    if (!wasOverlay) markPaintDirty();
  }
  let __dgNodesCache = { canvas: null, ctx: null, key: '' };
  let __dgBlocksCache = { canvas: null, ctx: null, key: '' };

  function drawNodes(nodes) {
    if (!__dgGridReady()) {
      return;
    }
    __dgLayerTrace('drawNodes:enter', {
      panelId: panel?.id || null,
      usingBackBuffers,
      nctxRole: nctx?.canvas?.getAttribute?.('data-role') || null,
      nctxSize: nctx?.canvas ? { w: nctx.canvas.width, h: nctx.canvas.height } : null,
    });
    const nodeCoords = [];
    nodeCoordsForHitTest = [];
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
    const __layoutStart = __perfOn ? performance.now() : 0;
    resetCtx(nctx);
    resetCtx(nctx);
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
      withDeviceSpace(nctx, () => {
        nctx.clearRect(0, 0, surfacePxW, surfacePxH);
      });
    }
    if (DG_SINGLE_CANVAS && nodesFrontCtx?.canvas) {
      const frontSurface = nodesFrontCtx.canvas;
      withDeviceSpace(nodesFrontCtx, () => {
        nodesFrontCtx.clearRect(0, 0, frontSurface.width, frontSurface.height);
      });
    }
    if (!__dgProbeDidFirstDraw && typeof window !== 'undefined' && window.__DG_PROBE_ON !== false) {
      __dgProbeDidFirstDraw = true;
      try { __dgProbeDump('first-draw:nodes'); } catch {}
    }
    withLogicalSpace(nctx, () => {
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
      __dgLayerDebugLog('nodes-cache-miss', {
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
        resetCtx(blockCache.ctx);
        withLogicalSpace(blockCache.ctx, () => {
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
    __dgMarkSingleCanvasCompositeDirty(panel);
    __dgLayerTrace('drawNodes:exit', {
      panelId: panel?.id || null,
      usingBackBuffers,
      nctxRole: nctx?.canvas?.getAttribute?.('data-role') || null,
    });
  }

  function drawNoteLabelsTo(ctx, nodes) {
    if (!ctx) return;
    withLogicalSpace(ctx, () => {
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
    __dgFlowLog('pointer:down:entry', {
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
    __dgFlowLog('pointer:down', {});
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
        const lw = (typeof getLineWidth === 'function') ? getLineWidth() : 12;
        pokeAlongStrokeBand(x0, y0, x0, y0, lw, DG_KNOCK.ghostTrail);
        const pushRadius = baseRadius * 1.5;
        pokeFieldToy('pointerDown', x0, y0, pushRadius, DG_KNOCK.ghostTrail.strength, { mode: 'plow' });
        dbgPoke('pointerDown');
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
          const sz = Math.max(1, Math.floor(getLineWidth() / 6));
          withLogicalSpace(pctx, () => {
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
      __dbgPointerMoves++;
      // Debug: track preview vs paint to ensure live line visibility
      try {
        if ((__dbgPointerMoves % 7) === 1) {
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
      if ((__dbgPointerMoves % 12) === 1) {
        __dgFlowLog('draw:move', { previewGid, nextDrawTarget, advanced: isAdvanced });
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
        drawLiveStrokePoint(pctx, lastPt, prevPt, liveStrokeMeta);

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
          pokeFieldToy('ghostTrail', lastPt.x, lastPt.y, disturbanceRadius, DG_KNOCK.ghostTrail.strength, {
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
      __dgNeedsUIRefresh = true;
      __dgFlowLog('node-toggle', {
        col,
        row,
        active: currentMap?.active?.[col] ?? null,
        disabledCount: currentMap?.disabled?.[col]?.size ?? null,
      });
      requestFrontSwap(useFrontBuffers);
      emitDrawgridUpdate({ activityOnly: false });
      panel.dispatchEvent(new CustomEvent('drawgrid:node-toggle', { detail: { col, row, disabled: dis.has(row) } }));

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
    __dgFlowLog('pointer:up', {
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
        withLogicalSpace(pctx, () => {
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
        drawGrid();
        if (currentMap) drawNodes(currentMap.nodes);
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
      if (!hasDrawnFirstLine && strokeToProcess?.pts?.length > 1) {
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
                            panel.__pulseHighlight = 1.0;
                            panel.__pulseRearm = true;
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
    const allowField = particleBudget?.allowField !== false;
    const fpsSample = Number.isFinite(adaptive?.smoothedFps)
      ? adaptive.smoothedFps
      : (Number.isFinite(adaptive?.fps) ? adaptive.fps : null);
    const emergencyMode = !!adaptive?.emergencyMode;
    // Keep fields on, but thin them out when many panels are visible.
    // Do not vary by focus state so particles feel consistent across panels.
    particleFieldEnabled = !!allowField && !inOverview && !zoomTooWide;
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
        if (visiblePanels <= 6) return Math.max(0.18, base);
        const minScale =
          visiblePanels >= 36 ? 0.08 :
          visiblePanels >= 24 ? 0.1 :
          visiblePanels >= 16 ? 0.12 :
          0.16;
        return Math.max(minScale, base);
      })();
      // If we're cruising near 60fps with few panels, allow a modest boost above nominal.
      const fpsBoost = (Number.isFinite(fpsSample) && fpsSample >= 58 && visiblePanels <= 2)
        ? Math.min(1.3, 1 + 0.02 * (fpsSample - 58))
        : 1;

      const emergencyScale = emergencyMode ? 0.45 : 1;
      const emergencySize = emergencyMode ? 1.1 : 1;
      const perfDamp = Math.min(fpsDamp, gestureDamp);
      const maxCountScale = Math.max(0.1, maxCountScaleBase * crowdScale * fpsBoost * emergencyScale * perfDamp);
      const capScale = Math.max(0.18, (particleBudget.capScale ?? 1) * crowdScale * fpsBoost * emergencyScale * perfDamp);
      const sizeScale = (particleBudget.sizeScale ?? 1) * emergencySize * (perfDamp < 0.8 ? 1.05 : 1);
      const spawnScale = Math.max(0.08, (particleBudget.spawnScale ?? 1) * crowdScale * fpsBoost * emergencyScale * perfDamp);
      // Keep tick cadence steady for smooth lerps; rely on lower counts for performance.
      const tickModulo = 1;
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
      if (panel.__dgParticleBudgetKey !== budgetKey) {
        panel.__dgParticleBudgetKey = budgetKey;
        dgField.applyBudget({
          maxCountScale,
          capScale,
          tickModulo,
          sizeScale,
          spawnScale,
          minCount: __dgLowFpsMode ? 0 : undefined,
          emergencyFade: __dgLowFpsMode,
          emergencyFadeSeconds: 2.2,
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
    let inCommitWindow = __dgInCommitWindow(nowTs);
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
        rafId = requestAnimationFrame(renderLoop);
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
      const fpsLive = Number.isFinite(fpsSample)
        ? fpsSample
        : (Number.isFinite(__dgFpsValue) ? __dgFpsValue : null);
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
      const transportRunning = (typeof isRunning === 'function') && isRunning();
      const hasChainLink = panel.dataset.nextToyId || panel.dataset.prevToyId;
      const isChained = !!hasChainLink;
      const isActiveInChain = isChained ? (panel.dataset.chainActive === 'true') : true;
      const hasActiveNotes = currentMap && currentMap.active && currentMap.active.some(a => a);
      const chainHasNotes = isChained ? getChainHasNotesCached(panel, hasActiveNotes) : hasActiveNotes;

      const isTrulyIdle =
        !hasAnyNotes &&
        !hasOverlayFx &&
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
      const desiredDpr = adaptiveCap ? Math.min(deviceDpr, adaptiveCap) : deviceDpr;
      const nowAdaptiveTs = nowTs || (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
      const canAdjustDpr =
        !gesturing &&
        !__dgInCommitWindow(nowAdaptiveTs) &&
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
      // Overlays (notes, playhead, flashes) respect visibility & hydrations guard,
      // but are otherwise always on - they're core UX.
      const __overlayGateStart = __perfOn ? performance.now() : 0;
      const allowOverlayDraw = canDrawAnything && !disableOverlays;
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
      const overlayActive = allowOverlayDraw && (hasOverlayFx || overlayTransport || hasOverlayStrokesLive || (cur && previewGid));
      let overlayEvery = 1;
      if (gestureMoving && visiblePanels >= 6 && !isFocused) {
        overlayEvery = (visiblePanels >= 18) ? 4 : (visiblePanels >= 12) ? 3 : 2;
      }
      if (overlayEvery > 1) {
        panel.__dgOverlayFrame = (panel.__dgOverlayFrame || 0) + 1;
      }
      const skipOverlayHeavy = overlayEvery > 1 && ((panel.__dgOverlayFrame % overlayEvery) !== 0);
      const allowOverlayDrawHeavy = allowOverlayDraw && (!skipOverlayHeavy || __dgNeedsUIRefresh);
      const overlayCoreWanted = (hasOverlayFx || hasOverlayStrokesLive || (cur && previewGid));
      const overlayCoreActive = allowOverlayDrawHeavy && overlayCoreWanted;
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
          resetCtx(fctx);
          withLogicalSpace(fctx, () => {
              const { x, y, w, h } = getOverlayClearRect({
                canvas: flashSurface,
                pad: getOverlayClearPad(),
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
        !singleCompositeNeeded;
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
      const mod = __dgGestureDrawModulo();
      let drawModulo = mod;
      if (gestureMoving && !isFocused && visiblePanels >= 6) drawModulo = Math.max(drawModulo, 2);
      if (gestureMoving && !isFocused && visiblePanels >= 12) drawModulo = Math.max(drawModulo, 3);
      if (gestureMoving && !isFocused && visiblePanels >= 18) drawModulo = Math.max(drawModulo, 4);
      let doFullDraw = (!gesturing) || drawModulo <= 1 || ((__dgFrameIdx % drawModulo) === 0);
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
      const hasNodeFlash = (() => {
        for (let i = 0; i < flashes.length; i++) {
          if (flashes[i] > 0) return true;
        }
        return false;
      })();
      if (DG_SINGLE_CANVAS && canDrawAnything) {
        const needsFullDraw =
          panel.__dgSingleCompositeDirty ||
          __dgNeedsUIRefresh ||
          __dgFrontSwapNextDraw ||
          __hydrationJustApplied ||
          forceFullDraw ||
          !panel.__dgGridHasPainted ||
          hasNodeFlash ||
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
          const __pfUpdateStart = (__perfOn && typeof performance !== 'undefined' && performance.now)
            ? performance.now()
            : 0;
          dgField?.tick?.(dt);
          if (__perfOn && __pfUpdateStart) {
            try { window.__PerfFrameProf?.mark?.('drawgrid.update.particles', performance.now() - __pfUpdateStart); } catch {}
          }
          if (__perfZoomOn && __pfStart && !window.__PERF_PARTICLE_FIELD_PROFILE) {
            const __pfEnd = performance.now();
            try { window.__PerfFrameProf?.mark?.('drawgrid.particle', __pfEnd - __pfStart); } catch {}
          }
        }
      } catch (e) {
        dglog('particle-field.tick:error', String((e && e.message) || e));
      }

      const __dgUpdateDt = (__dgUpdateStart !== null) ? (performance.now() - __dgUpdateStart) : 0;

      try {
        if (window.__ZOOM_COMMIT_PHASE) {
          perfMark(__dgUpdateDt, 0);
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

      if (!doFullDraw && canDrawAnything && currentMap && (hasNodeFlash || __dgHadNodeFlash)) {
        try { drawNodes(currentMap.nodes); } catch {}
      }
      __dgHadNodeFlash = hasNodeFlash;

      if (DG_SINGLE_CANVAS && overlayCompositeNeeded) {
        __dgMarkSingleCanvasOverlayDirty(panel);
      }
    perfMark(__dgUpdateDt, __dgDrawDt);
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
            resetCtx(ghostCtx);
            withLogicalSpace(ghostCtx, () => {
              const { x, y, w, h } = getOverlayClearRect({
                canvas: ghostSurface || ghostCtx.canvas,
                pad: getOverlayClearPad() * 1.2,
                gridArea,
              });
              ghostCtx.clearRect(x, y, w, h);
            });
            markGhostLayerCleared();
          }
          if (fctx?.canvas) {
            const flashSurface = getActiveFlashCanvas();
            resetCtx(fctx);
            withLogicalSpace(fctx, () => {
              const { x, y, w, h } = getOverlayClearRect({
                canvas: flashSurface || fctx.canvas,
                pad: getOverlayClearPad(),
                allowFull: !!panel.__dgFlashOverlayOutOfGrid,
                gridArea,
              });
              fctx.clearRect(x, y, w, h);
            });
            markFlashLayerCleared();
          }
          if (tutorialCtx?.canvas) {
            resetCtx(tutorialCtx);
            withLogicalSpace(tutorialCtx, () => {
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

    const __domPulseStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
      ? performance.now()
      : 0;
      if (!skipDomUpdates) {
        let pulseClassOn = !!panel.__dgPulseClassOn;
        if (panel.__pulseRearm) {
          if (pulseClassOn) {
            const __pulseRemoveStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
              ? performance.now()
              : 0;
            panel.classList.remove('toy-playing-pulse');
            if (__pulseRemoveStart) {
              try { window.__PerfFrameProf?.mark?.('drawgrid.dom.pulse.remove', performance.now() - __pulseRemoveStart); } catch {}
            }
            pulseClassOn = false;
          }
          panel.__pulseRearm = false;
          panel.__dgPulseSkipAdd = true;
        }

        const pulseActive = !!(panel.__pulseHighlight && panel.__pulseHighlight > 0);
        if (pulseActive) {
          if (!pulseClassOn && !panel.__dgPulseSkipAdd) {
            const __pulseAddStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
              ? performance.now()
              : 0;
            panel.classList.add('toy-playing-pulse');
            if (__pulseAddStart) {
              try { window.__PerfFrameProf?.mark?.('drawgrid.dom.pulse.add', performance.now() - __pulseAddStart); } catch {}
            }
            pulseClassOn = true;
          }
          panel.__pulseHighlight = Math.max(0, panel.__pulseHighlight - 0.05);
        } else if (pulseClassOn) {
          const __pulseOffStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
            ? performance.now()
            : 0;
          panel.classList.remove('toy-playing-pulse');
          if (__pulseOffStart) {
            try { window.__PerfFrameProf?.mark?.('drawgrid.dom.pulse.remove', performance.now() - __pulseOffStart); } catch {}
          }
          pulseClassOn = false;
        }
        panel.__dgPulseClassOn = pulseClassOn;
        if (panel.__dgPulseSkipAdd) {
          panel.__dgPulseSkipAdd = false;
          requestAnimationFrame(() => {
            try {
              if (!panel.isConnected) return;
              if (!(panel.__pulseHighlight > 0)) return;
              if (!panel.classList.contains('toy-playing-pulse')) {
                panel.classList.add('toy-playing-pulse');
              }
            } catch {}
          });
        }
      }
    if (__domPulseStart) {
      const __domPulseDt = performance.now() - __domPulseStart;
      try { window.__PerfFrameProf?.mark?.('drawgrid.dom.pulse', __domPulseDt); } catch {}
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
        panel.classList.toggle('toy-playing', showPlaying);
        panel.__dgShowPlaying = showPlaying;
      }
    }
    if (__domPlayingStart) {
      const __domPlayingDt = performance.now() - __domPlayingStart;
      try { window.__PerfFrameProf?.mark?.('drawgrid.dom.playing', __domPlayingDt); } catch {}
    }

    // --- other overlay layers still respect allowOverlayDraw ---
    if (allowOverlayDrawHeavy && (overlayCoreActive || __dgNeedsUIRefresh)) {
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
      resetCtx(fctx);
      withLogicalSpace(fctx, () => {
        const { x, y, w, h } = getOverlayClearRect({
          canvas: flashSurface,
          pad: getOverlayClearPad(),
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
          const pad = hasGridBounds ? Math.max(2, (getLineWidth() + 2) * 0.6) : 0;
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
            __dgLayerDebugLog('overlay-strokes', {
              panelId: panel?.id || null,
              singleCanvas: !!DG_SINGLE_CANVAS,
              zoomed: panel?.classList?.contains('toy-zoomed') || false,
              specialCount: specialStrokes.length,
              colorizedCount: colorized.length,
              hasPreview: !!(cur && previewGid),
              flashVisible: flashCanvas?.style?.display || null,
            });
            markFlashLayerActive();
            withOverlayClip(fctx, gridArea, !!panel.__dgFlashOverlayOutOfGrid, () => {
            fctx.save();
            // Draw animated strokes in logical space once (avoid per-stroke reset/transform).
            withLogicalSpace(fctx, () => {
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
                      resetCtx(cctx);
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
              flashAlpha: __dgSampleAlphaFromCanvas(getActiveFlashCanvas()),
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
              withOverlayClip(fctx, gridArea, false, () => {
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
          withOverlayClip(fctx, gridArea, false, () => {
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
            withOverlayClip(fctx, gridArea, false, () => {
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
        if (__dgPlayheadModeWanted !== null && phaseJustWrapped) {
          const modeNow = performance?.now?.() ?? Date.now();
          if ((modeNow - __dgPlayheadModeWantedSince) >= DG_PLAYHEAD_MODE_MIN_MS) {
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
        const shouldRenderPlayhead = !!(info && isRunning() && isActiveInChain && !probablyStale);

        if (!shouldRenderPlayhead) {
          const lastX = Number.isFinite(panel.__dgPlayheadLastX) ? panel.__dgPlayheadLastX : null;
          const lastLayer = panel.__dgPlayheadLayer || playheadLayer;
          if (lastX != null) {
            if (lastLayer === 'tutorial' && tutorialHighlightMode === 'none' && tutorialCtx?.canvas) {
              const __overlayClearStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
                ? performance.now()
                : 0;
              resetCtx(tutorialCtx);
              withLogicalSpace(tutorialCtx, () => {
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
              resetCtx(playheadFrontCtx);
              withOverlayClip(playheadFrontCtx, gridArea, false, () => {
                const defaultBand = Math.max(6, Math.round(Math.max(0.8 * cw, Math.min(gridArea.w * 0.08, 2.2 * cw))));
                const band = Number.isFinite(panel.__dgPlayheadClearBand) ? panel.__dgPlayheadClearBand : defaultBand;
                playheadFrontCtx.clearRect(lastX - band, gridArea.y - 2, band * 2, gridArea.h + 4);
              });
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
              resetCtx(fctx);
              withLogicalSpace(fctx, () => {
                const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
                const width = cssW || (flashSurface?.width ?? fctx.canvas.width ?? 0) / scale;
                const height = cssH || (flashSurface?.height ?? fctx.canvas.height ?? 0) / scale;
                if (overlayCoreWanted) {
                  // Avoid clearing the overlay band here; it can expose the base (white) line
                  // for a frame if overlay redraw is throttled.
                  __dgNeedsUIRefresh = true;
                  overlayCompositeNeeded = true;
                } else {
                  const { x, y, w, h } = getOverlayClearRect({
                    canvas: flashSurface || fctx.canvas,
                    pad: getOverlayClearPad(),
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
              resetCtx(clearCtx);
              withOverlayClip(clearCtx, gridArea, false, () => {
                clearCtx.clearRect(lastX - band, gridArea.y - 2, band * 2, gridArea.h + 4);
              });
              emitDG('overlay-clear', { reason: 'playhead-band' });
            }
          }
        if (!useSeparatePlayhead && !overlayClearedThisFrame) {
          const __overlayClearStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
            ? performance.now()
            : 0;
          try {
            if (playheadCtx === tutorialCtx) {
              resetCtx(tutorialCtx);
              withLogicalSpace(tutorialCtx, () => {
                const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
                const active = getActiveTutorialCanvas();
                const width = cssW || (active?.width ?? tutorialCtx.canvas.width ?? 0) / scale;
                const height = cssH || (active?.height ?? tutorialCtx.canvas.height ?? 0) / scale;
                tutorialCtx.clearRect(0, 0, width, height);
              });
              markTutorialLayerCleared();
            } else {
              const flashSurface = getActiveFlashCanvas();
              resetCtx(fctx);
              withLogicalSpace(fctx, () => {
                const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
                const width = cssW || (flashSurface?.width ?? 0) / scale;
                const height = cssH || (flashSurface?.height ?? 0) / scale;
                if (!overlayCoreWanted) {
                  const { x, y, w, h } = getOverlayClearRect({
                    canvas: flashSurface,
                    pad: getOverlayClearPad(),
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
        withOverlayClip(playheadCtx, gridArea, false, () => {
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
          let sweepEvery = 1;
          if (gestureMoving || visiblePanels >= 12 || (fpsHint != null && fpsHint < 50)) sweepEvery = 2;
          if (visiblePanels >= 18 || (fpsHint != null && fpsHint < 40)) sweepEvery = 3;
          let sweepMaxSteps = 36;
          if (gestureMoving || visiblePanels >= 12 || (fpsHint != null && fpsHint < 55)) sweepMaxSteps = 24;
          if (visiblePanels >= 18 || (fpsHint != null && fpsHint < 45)) sweepMaxSteps = 16;
          panel.__dgPlayheadSweepFrame = (panel.__dgPlayheadSweepFrame || 0) + 1;
          if ((panel.__dgPlayheadSweepFrame % sweepEvery) === 0) {
            pushHeaderSweepAt(playheadX, { lineWidthPx: gradientWidth, maxSteps: sweepMaxSteps });
            dbgPoke('header');
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
        });
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
    rafId = requestAnimationFrame(renderLoop);
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
      clearCanvas(pctx);
      emitDG('paint-clear', { reason: 'restore-state' });
      clearCanvas(nctx);
      const flashSurface = getActiveFlashCanvas();
      withLogicalSpace(fctx, () => {
        const { x, y, w, h } = getOverlayClearRect({
          canvas: flashSurface,
          pad: getOverlayClearPad(),
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

      __dgMarkRegenSource('restore-state');
      __dgMarkRegenSource('randomize');
      regenerateMapFromStrokes();
      currentMap = normalizeMapColumns(currentMap, cols);

      withLogicalSpace(pctx, () => {
        clearCanvas(pctx);
        for (const s of strokes) drawFullStroke(pctx, s);
      });

      __hydrationJustApplied = true;
      __dgHydrationPendingRedraw = true;
      scheduleHydrationLayoutRetry(panel, () => layout(true));
      setTimeout(() => { __hydrationJustApplied = false; }, 32);
      ensurePostCommitRedraw('restoreFromState');
      emitDrawgridUpdate({ activityOnly: false });
      drawGrid();
      if (currentMap) drawNodes(currentMap.nodes);
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
      __dgFlowState('clear:start', makeFlowCtx());
      clearCanvas(pctx);
      // Clear both paint buffers to prevent stale composites.
      try { if (backCtx && pctx !== backCtx) clearCanvas(backCtx); } catch {}
      try { if (frontCtx && pctx !== frontCtx) clearCanvas(frontCtx); } catch {}
      emitDG('paint-clear', { reason: 'pre-redraw' });
      clearCanvas(nctx);
      const flashSurface = getActiveFlashCanvas();
      withLogicalSpace(fctx, () => {
        const { x, y, w, h } = getOverlayClearRect({
          canvas: flashSurface,
          pad: getOverlayClearPad(),
          allowFull: !!panel.__dgFlashOverlayOutOfGrid,
          gridArea,
        });
        fctx.clearRect(x, y, w, h);
        emitDG('overlay-clear', { reason: 'pre-redraw' });
      });
      try {
        if (flashBackCtx && flashBackCtx !== fctx) {
          resetCtx(flashBackCtx);
          withLogicalSpace(flashBackCtx, () => {
            const { x, y, w, h } = getOverlayClearRect({
              canvas: flashBackCtx.canvas,
              pad: getOverlayClearPad(),
              allowFull: !!panel.__dgFlashOverlayOutOfGrid,
              gridArea,
            });
            flashBackCtx.clearRect(x, y, w, h);
          });
        }
        if (flashFrontCtx && flashFrontCtx !== fctx) {
          resetCtx(flashFrontCtx);
          withLogicalSpace(flashFrontCtx, () => {
            const { x, y, w, h } = getOverlayClearRect({
              canvas: flashFrontCtx.canvas,
              pad: getOverlayClearPad(),
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
      hasDrawnFirstLine = false;
      updateDrawLabel(true);
      noteToggleEffects = [];
      __dgMarkSingleCanvasDirty(panel);
      if (DG_SINGLE_CANVAS && isPanelVisible) {
        try { compositeSingleCanvas(); } catch {}
        panel.__dgSingleCompositeDirty = false;
      }
      __dgFlowState('clear:end', makeFlowCtx());
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
            scheduleHydrationLayoutRetry(panel, () => layout(true));
            setTimeout(() => { __hydrationJustApplied = false; }, 32);
            ensurePostCommitRedraw('setState');
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

  function createRandomLineStroke() {
    const leftX = gridArea.x;
    const rightX = gridArea.x + gridArea.w;
    const minY = gridArea.y + topPad + ch; // Inset by one full row from the top
    const maxY = gridArea.y + topPad + (rows - 1) * ch; // Inset by one full row from the bottom
    const K = Math.max(6, Math.round(gridArea.w / Math.max(1, cw*0.9))); // control points
    const cps = [];
    for (let i=0;i<K;i++){
      const t = i/(K-1);
      const x = leftX + (rightX-leftX)*t;
      const y = minY + Math.random() * (maxY - minY);
      cps.push({ x, y });
    }
    function cr(p0,p1,p2,p3,t){ const t2=t*t, t3=t2*t; const a = (-t3+2*t2-t)/2, b = (3*t3-5*t2+2)/2, c = (-3*t3+4*t2+t)/2, d = (t3-t2)/2; return a*p0 + b*p1 + c*p2 + d*p3; }
    const pts = [];
    const samplesPerSeg = Math.max(8, Math.round(cw/3));
    for (let i=0;i<cps.length-1;i++){
      const p0 = cps[Math.max(0,i-1)], p1=cps[i], p2=cps[i+1], p3=cps[Math.min(cps.length-1,i+2)];
      for (let s=0;s<=samplesPerSeg;s++){
        const t = s/samplesPerSeg;
        const x = cr(p0.x, p1.x, p2.x, p3.x, t);
        let y = cr(p0.y, p1.y, p2.y, p3.y, t);
        y = Math.max(minY, Math.min(maxY, y)); // Clamp to the padded area
        pts.push({ x, y });
      }
    }
    return { pts, color: '#fff', isSpecial: true, generatorId: 1 };
  }

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

  function handleRandomize() {
    if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW) {
      console.log('[DG][flow] handleRandomize:enter', { panelId: panel?.id || null });
    }
    try {
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      panel.__dgDebugOverlayUntil = now + 1200;
      panel.__dgDebugOverlayLastLog = 0;
      panel.__dgDebugOverlayLogged = false;
    } catch {}
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
    __dgFlowLog('randomize:start', { panelId: panel?.id || null, usingBackBuffers });
    __dgFlowState('randomize:start', makeFlowCtx());
    try { markUserChange('randomize'); } catch (err) {
      if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW) {
        console.warn('[DG][flow] randomize:markUserChange failed', err);
      }
    }
    // Ensure no active draw state blocks clears or future drawing.
    try { setDrawingState(false); } catch {}
    __dgSkipSwapsDuringDrag = false;
    cur = null;
    pendingNodeTap = null;
    // Ensure data structures exist
    if (!currentMap) {
      currentMap = { active: Array(cols).fill(false), nodes: Array.from({length:cols},()=>new Set()), disabled: Array.from({length:cols},()=>new Set()) };
    }

    pctx = getActivePaintCtx();
    resetPaintBlend(pctx);
    // Clear all existing lines and nodes
    strokes = [];
    nodeGroupMap = Array.from({ length: cols }, () => new Map());
    manualOverrides = Array.from({ length: cols }, () => new Set());
    persistentDisabled = Array.from({ length: cols }, () => new Set());
    clearCanvas(pctx);
    // Clear both paint buffers to avoid stale composites across buffer flips.
    try { if (backCtx && pctx !== backCtx) clearCanvas(backCtx); } catch {}
    try { if (frontCtx && pctx !== frontCtx) clearCanvas(frontCtx); } catch {}
    emitDG('paint-clear', { reason: 'randomize' });
    clearCanvas(nctx);
    try {
      const flashSurface = getActiveFlashCanvas();
      resetCtx(fctx);
      withLogicalSpace(fctx, () => {
        const { x, y, w, h } = getOverlayClearRect({
          canvas: flashSurface || fctx.canvas,
          pad: getOverlayClearPad(),
          allowFull: !!panel.__dgFlashOverlayOutOfGrid,
          gridArea,
        });
        fctx.clearRect(x, y, w, h);
      });
      // Clear both flash buffers so no stale overlay survives buffer toggles.
      try {
        if (flashBackCtx && flashBackCtx !== fctx) {
          resetCtx(flashBackCtx);
          withLogicalSpace(flashBackCtx, () => {
            const { x, y, w, h } = getOverlayClearRect({
              canvas: flashBackCtx.canvas,
              pad: getOverlayClearPad(),
              allowFull: !!panel.__dgFlashOverlayOutOfGrid,
              gridArea,
            });
            flashBackCtx.clearRect(x, y, w, h);
          });
        }
        if (flashFrontCtx && flashFrontCtx !== fctx) {
          resetCtx(flashFrontCtx);
          withLogicalSpace(flashFrontCtx, () => {
            const { x, y, w, h } = getOverlayClearRect({
              canvas: flashFrontCtx.canvas,
              pad: getOverlayClearPad(),
              allowFull: !!panel.__dgFlashOverlayOutOfGrid,
              gridArea,
            });
            flashFrontCtx.clearRect(x, y, w, h);
          });
        }
      } catch {}
      markFlashLayerCleared();
      panel.__dgFlashOverlayOutOfGrid = false;
      __dgOverlayStrokeListCache = { paintRev: -1, len: 0, special: [], colorized: [], outOfGrid: false };
      __dgOverlayStrokeCache = { value: false, len: 0, ts: 0 };
      __dgMarkSingleCanvasOverlayDirty(panel);
    } catch {}
    try { previewGid = null; } catch {}
    try { nextDrawTarget = null; } catch {}

    // Build a smooth, dramatic wiggly line across the full grid height using Catmull-Rom interpolation
    try {
      const stroke = createRandomLineStroke();
      strokes.push(stroke);
      drawFullStroke(pctx, stroke);
      regenerateMapFromStrokes();
 
      // After generating the line, randomly deactivate some columns to create rests.
      // This addresses the user's feedback that "Random" no longer turns notes off.
      if (currentMap && currentMap.nodes) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() < 0.35) {
            // Deactivate the column by disabling all of its nodes. This state
            // is preserved by the `persistentDisabled` mechanism.
            if (currentMap.nodes[c]?.size > 0) {
              for (const r of currentMap.nodes[c]) persistentDisabled[c].add(r);
              currentMap.active[c] = false;
            }
          }
        }
      }
    } catch(e){}
    drawGrid();
    drawNodes(currentMap.nodes);
    emitDrawgridUpdate({ activityOnly: false });
    stopAutoGhostGuide({ immediate: true });
    updateDrawLabel(false);
    __dgMarkSingleCanvasDirty(panel);
    if (DG_SINGLE_CANVAS && isPanelVisible) {
      try { compositeSingleCanvas(); } catch {}
      panel.__dgSingleCompositeDirty = false;
    }
    __dgFlowLog('randomize:end', {
      panelId: panel?.id || null,
      usingBackBuffers,
      gridHasPainted: !!panel.__dgGridHasPainted,
      flashEmpty: !!panel.__dgFlashLayerEmpty,
    });
    __dgFlowState('randomize:end', makeFlowCtx());
  }

  function handleRandomizeBlocks() {
    __dgFlowLog('randomize-blocks:start');
    markUserChange('randomize-blocks');
    if (!currentMap || !currentMap.nodes) return;

    for (let c = 0; c < cols; c++) {
        if (currentMap.nodes[c]?.size > 0) {
            // For each node (which is a row `r` in a column `c`) that exists...
            currentMap.nodes[c].forEach(r => {
                // ...randomly decide whether to disable it or not.
                if (Math.random() < 0.5) {
                    persistentDisabled[c].add(r); // Disable the node at (c, r)
                } else {
                    persistentDisabled[c].delete(r); // Enable the node at (c, r)
                }
            });

            // Recompute active state for the column
            const anyOn = Array.from(currentMap.nodes[c]).some(r => !persistentDisabled[c].has(r));
            currentMap.active[c] = anyOn;
            currentMap.disabled[c] = persistentDisabled[c];
        }
    }

    drawGrid();
    drawNodes(currentMap.nodes);
    emitDrawgridUpdate({ activityOnly: false });
    stopAutoGhostGuide({ immediate: true });
    updateDrawLabel(false);
    __dgMarkSingleCanvasDirty(panel);
    if (DG_SINGLE_CANVAS && isPanelVisible) {
      try { compositeSingleCanvas(); } catch {}
      panel.__dgSingleCompositeDirty = false;
    }
    __dgFlowLog('randomize-blocks:end');
  }

  function handleRandomizeNotes() {
    __dgFlowLog('randomize-notes:start');
    markUserChange('randomize-notes');
    // Save the current active state before regenerating lines
    const oldActive = currentMap?.active ? [...currentMap.active] : null;

    const existingGenIds = new Set();
    strokes.forEach(s => {
      if (s.generatorId === 1 || s.generatorId === 2) { existingGenIds.add(s.generatorId); }
    });
    // If no generator lines exist, create Line 1. Don't call handleRandomize()
    // as that would clear decorative strokes and their disabled states.
    if (existingGenIds.size === 0) {
      existingGenIds.add(1);
    }
    strokes = strokes.filter(s => s.generatorId !== 1 && s.generatorId !== 2);
    const newGenStrokes = [];
    existingGenIds.forEach(gid => {
      const newStroke = createRandomLineStroke();
      newStroke.generatorId = gid;
      newStroke.justCreated = true; // Mark as new to avoid old erasures
      strokes.push(newStroke);
      newGenStrokes.push(newStroke);
    });
    clearAndRedrawFromStrokes(null, 'randomize-notes');
    // After drawing, unmark the new strokes so they behave normally.
    newGenStrokes.forEach(s => delete s.justCreated);

    // After regenerating, restore the old active state and update disabled nodes to match.
    if (currentMap && oldActive) {
        currentMap.active = oldActive;
        // Rebuild the disabled sets based on the restored active state.
        for (let c = 0; c < cols; c++) {
            if (oldActive[c]) {
                currentMap.disabled[c].clear(); // If column was active, ensure all its new nodes are enabled.
            } else {
                currentMap.nodes[c].forEach(r => currentMap.disabled[c].add(r)); // If column was inactive, disable all its new nodes.
            }
        }
        drawGrid();
        drawNodes(currentMap.nodes);
        emitDrawgridUpdate({ activityOnly: false });
    }
    stopAutoGhostGuide({ immediate: true });
    updateDrawLabel(false);
    __dgMarkSingleCanvasDirty(panel);
    if (DG_SINGLE_CANVAS && isPanelVisible) {
      try { compositeSingleCanvas(); } catch {}
      panel.__dgSingleCompositeDirty = false;
    }
    __dgFlowLog('randomize-notes:end');
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
      __dgFlowLog(`event:${kind}`, {
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
        hasRandomize: typeof handleRandomize === 'function',
        hasBlocks: typeof handleRandomizeBlocks === 'function',
        hasNotes: typeof handleRandomizeNotes === 'function',
      });
    }
    try {
      if (kind === 'toy-random') handleRandomize();
      else if (kind === 'toy-random-blocks') handleRandomizeBlocks();
      else if (kind === 'toy-random-notes') handleRandomizeNotes();
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
      resetCtx(ghostCtx);
      resetCtx(ghostCtx);
      withLogicalSpace(ghostCtx, () => {
      const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
      const { x, y, w, h } = getOverlayClearRect({
        canvas: ghostSurface,
        pad: getOverlayClearPad() * 1.2,
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
    resetCtx(ghostCtx);
    resetCtx(ghostCtx);
    withLogicalSpace(ghostCtx, () => {
      const { x, y, w, h } = getOverlayClearRect({
        canvas: ghostSurface,
        pad: getOverlayClearPad(),
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
        if (labelBand) drawGhostDebugBand(ghostCtx, labelBand);
        drawGhostDebugPath(ghostCtx, { from, to, crossY });
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

    resetCtx(ghostCtx);
    withLogicalSpace(ghostCtx, () => {
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
        if (band) drawGhostDebugBand(ghostCtx, band);
        drawGhostDebugPath(ghostCtx, __gpathStatic);
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
      const lw = (typeof getLineWidth === 'function') ? getLineWidth() : null;
      if (Number.isFinite(lw) && lw > 0) {
        // Treat the line width as our visual thickness baseline.
        visualRadius = Math.max(2, lw);
      }
    } catch {}

    if (last) {
      resetCtx(ghostCtx);
      withLogicalSpace(ghostCtx, () => {
        ghostCtx.globalCompositeOperation = 'source-over';
        ghostCtx.globalAlpha = 0.25;
        ghostCtx.lineCap = 'round';
        ghostCtx.lineJoin = 'round';

        // Make the ghost trail roughly the same thickness as the drawn line.
        let lw = (typeof getLineWidth === 'function') ? getLineWidth() : null;
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
    pokeFieldToy('ghostTrail', x, y, disturbanceRadius, DG_KNOCK.ghostTrail.strength, {
      mode: 'plow',
      highlightMs: 900,
    });
    if (!window.__DG_FIRST_GHOST_LOGGED__) {
      window.__DG_FIRST_GHOST_LOGGED__ = true;
      drawgridLog('[DG][ghostTrail] poke', { x, y, radius: disturbanceRadius, strength: DG_KNOCK.ghostTrail.strength });
    }
    __dgLogFirstPoke('ghostTrail', disturbanceRadius, DG_KNOCK.ghostTrail.strength);

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
        withLogicalSpace(ghostCtx, () => {
          ghostCtx.save();
          const pad = Math.max(20, disturbanceRadius * 3);
          ghostCtx.clearRect(x - pad, y - pad, pad * 2, pad * 2);
          ghostCtx.restore();
        });
        drawGhostDebugFrame(ghostCtx, {
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
      if (labelBand) drawGhostDebugBand(ghostCtx, labelBand);
      drawGhostDebugPath(ghostCtx, { from: gpath.from, to: gpath.to, crossY: gpath.crossY });
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

