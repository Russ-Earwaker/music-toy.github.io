// Drawgrid debug/diagnostics helpers and flags.

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

export function __dgFlag(name) {
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

export const DG_DEBUG = __dgFlag('core');
export const DG_FRAME_DEBUG = __dgFlag('frame');

// Feature flag: per-panel particle field (ghost / background particles).
// Flip to false to test performance without dgField.tick().
export const DRAWGRID_ENABLE_PARTICLE_FIELD = true;
export const DG_SWAP_DEBUG = __dgFlag('swap');      // swap spam;

// Alpha debug (default OFF; toggle via localStorage('DG_ALPHA_DEBUG'='1') or DG_DEBUG_SET)
export const DG_ALPHA_DEBUG = __dgFlag('alpha');
try {
  if (typeof window !== 'undefined' && window.__DG_GRID_ALPHA_DEBUG === undefined) {
    window.__DG_GRID_ALPHA_DEBUG = false;
  }
} catch {}

// Ghost debug (off by default). Enable via ?dgghost=1 or localStorage('DG_GHOST_DEBUG'='1')
let dgGhostDebug = false;
try {
  if (typeof location !== 'undefined' && location.search.includes('dgghost=1')) dgGhostDebug = true;
  if (typeof localStorage !== 'undefined' && localStorage.getItem('DG_GHOST_DEBUG') === '1') dgGhostDebug = true;
} catch {}
export const DG_GHOST_DEBUG = dgGhostDebug;

if (DG_DEBUG) { try { console.info('[DG][alpha:boot]', { DG_ALPHA_DEBUG }); } catch {} }

export const dgAlphaState = {
  pathLastTs: 0,
  gridLastTs: 0,
};
export const DG_ALPHA_SPAM_MS = 300;

export const dglog = (...a) => { if (DG_DEBUG) console.log('[DG]', ...a); };
export const dgf = (...a) => { if (DG_FRAME_DEBUG) console.log('[DG] frame', ...a); };
export const dgs = (...a) => { if (DG_SWAP_DEBUG) console.log('[DG] swap', ...a); };

export const DG = {
  log: dglog,
  warn: (...a) => { if (DG_DEBUG) console.warn('[DG]', ...a); },
  time: (label) => { if (DG_DEBUG) console.time(label); },
  timeEnd: (label) => { if (DG_DEBUG) console.timeEnd(label); },
};

// --- Event diagnostics (off by default; enable via localStorage.setItem('dg_events','1')) ---
const DG_EVENTS_ON = __dgFlag('events');
const EMIT_PREFIX = 'dg:';

// Toggle for detailed drawgrid diagnostics. Flip to true when chasing state issues.
export const DG_TRACE_DEBUG = false;
export const dgTraceLog = (...args) => { if (DG_TRACE_DEBUG) console.log(...args); };
export const dgTraceWarn = (...args) => { if (DG_TRACE_DEBUG) console.warn(...args); };
export const DG_LAYOUT_DEBUG = __dgFlag('layout');
export const DG_LAYOUT_TRACE = __dgFlag('layoutTrace');

export function dgLogLine(tag, payload) {
  if (!DG_LAYOUT_DEBUG) return;
  try { console.log(`[DG][${tag}] ${JSON.stringify(payload)}`); } catch {}
}

// --- Drawgrid debug (off by default) ---
export const DBG_DRAW = false; // set true only for hyper-local issues
export const DG_INK_DEBUG = false;    // live ink logs
export const DG_CLEAR_DEBUG = false;  // paint clears with reasons
// --- TEMP DEBUG FLAGS ---
if (typeof window !== 'undefined') {
  window.DG_DRAW_DEBUG = false; // keep probes off unless debugging live draw
}

export const dbgCounters = {
  liveSegments: 0,
  pointerMoves: 0,
  paintClears: 0,
};

export function dbg(tag, payload) {
  if (!DG_INK_DEBUG) return;
  try { console.debug(`[DG][${tag}]`, payload || ''); } catch {}
}

export function createDGDebugHelpers({
  boardScaleHelper,
  getPanel,
  getUsingBackBuffers,
  getDGSingleCanvas,
  getPaintDpr,
  getCssW,
  getCssH,
} = {}) {
  function emitDG(eventName, detail = {}) {
    if (!DG_EVENTS_ON) return;
    let panelRef = null;
    try { panelRef = getPanel?.() || null; } catch {}
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

  function dgGridAlphaLog(tag, ctx, extra = {}) {
    try {
      if (!window?.__DG_GRID_ALPHA_DEBUG) return;
    } catch {
      return;
    }
    if (!ctx) return;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if ((now - dgAlphaState.gridLastTs) < 180) return;
    dgAlphaState.gridLastTs = now;
    let panelRef = null;
    try { panelRef = getPanel?.() || null; } catch {}
    let dgSingleCanvas = false;
    try { dgSingleCanvas = !!getDGSingleCanvas?.(); } catch {}
    let usingBackBuffers = null;
    try { usingBackBuffers = getUsingBackBuffers?.(); } catch {}
    try {
      console.log('[DG][grid-alpha]', {
        tag,
        role: ctx?.canvas?.getAttribute?.('data-role') || null,
        alpha: ctx.globalAlpha,
        composite: ctx.globalCompositeOperation,
        shadowBlur: ctx.shadowBlur,
        shadowColor: ctx.shadowColor,
        usingBackBuffers,
        dgSingleCanvas,
        gridReady: !!panelRef?.__dgGridHasPainted,
        ...extra,
      });
    } catch {}
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
      const paintDpr = getPaintDpr?.();
      const cssW = getCssW?.();
      const cssH = getCssH?.();
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

  return {
    dgGridAlphaLog,
    dgDumpCanvasMetrics,
    emitDG,
  };
}
