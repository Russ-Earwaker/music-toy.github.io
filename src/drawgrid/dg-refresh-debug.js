// src/drawgrid/dg-refresh-debug.js
// DrawGrid refresh/size trace helpers (debug-only, opt-in via console flags).

export function createDgRefreshDebug({
  getPanel,
  getCssW,
  getCssH,
  getPaintDpr,
  getFrontCanvas,
  getBackCanvas,
  getPlayheadCanvas,
  getGridBackCanvas,
  getNodesBackCanvas,
  getFlashBackCanvas,
  getGhostBackCanvas,
  getTutorialBackCanvas,
  boardScaleHelper,
} = {}) {
  // Size/scale trace for refresh flicker debugging (disabled by default).
  // Enable manually if required:
  //   window.__DG_REFRESH_SIZE_TRACE = true
  try {
    if (typeof window !== 'undefined' && window.__DG_REFRESH_DEBUG === undefined) {
      window.__DG_REFRESH_DEBUG = false;
    }
    if (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE === undefined) {
      window.__DG_REFRESH_SIZE_TRACE = false;
    }
    // IMPORTANT:
    // Size trace is safe to enable during perf runs (buffered, throttled),
    // but pixel sampling can trigger expensive GPU readbacks (e.g. getImageData).
    // Keep sampling OFF by default; only enable it when actively debugging a visual.
    if (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE_SAMPLE === undefined) {
      window.__DG_REFRESH_SIZE_TRACE_SAMPLE = false;
    }
    if (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE_LIMIT === undefined) {
      window.__DG_REFRESH_SIZE_TRACE_LIMIT = 200;
    }
    // Throttle noisy size-trace logs (per panel instance).
    // Default is intentionally conservative; bump lower only when actively diagnosing.
    //   window.__DG_REFRESH_SIZE_TRACE_THROTTLE_MS = 0   // disables throttling
    if (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE_THROTTLE_MS === undefined) {
      window.__DG_REFRESH_SIZE_TRACE_THROTTLE_MS = 800;
    }
  } catch {}

  let __dgSizeTraceCount = 0;
  let __dgSizeTraceLastTs = 0;
  let __dgLastEffectiveDprSig = '';

  function __dgSizeTraceGate(consume = false) {
    try {
      const on = (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE);
      if (!on) return false;
    } catch { return false; }

    // Throttle: this trace can spam hard during resize/commit churn.
    let now = 0;
    try {
      const throttleMs = (typeof window !== 'undefined') ? Number(window.__DG_REFRESH_SIZE_TRACE_THROTTLE_MS) : 0;
      now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (Number.isFinite(throttleMs) && throttleMs > 0) {
        if (__dgSizeTraceLastTs && (now - __dgSizeTraceLastTs) < throttleMs) return false;
      }
    } catch {}

    // Hard cap (per panel instance).
    try {
      const limit = (typeof window !== 'undefined') ? window.__DG_REFRESH_SIZE_TRACE_LIMIT : null;
      if (Number.isFinite(limit) && limit >= 0 && __dgSizeTraceCount >= limit) return false;
    } catch {}

    // Consume gate (advance counters) only when we're actually going to log.
    if (consume) {
      try { __dgSizeTraceLastTs = now || __dgSizeTraceLastTs; } catch {}
      try { __dgSizeTraceCount++; } catch {}
    }
    return true;
  }

  // Cheap predicate so size-trace callers can avoid expensive DOM reads unless a log will actually be recorded.
  function dgSizeTraceCanLog() {
    return __dgSizeTraceGate(false);
  }

  function dgSizeTrace(event, data = null) {
    if (!__dgSizeTraceGate(true)) return;
    try {
      const panel = getPanel?.();
      const payload = data && typeof data === 'object' ? data : {};
      payload.panelId = panel?.id || null;

      // Prefer the perf trace buffer (cheap + bounded). Console logging is opt-in.
      try {
        if (typeof window !== 'undefined' && typeof window.__PERF_TRACE_PUSH === 'function') {
          window.__PERF_TRACE_PUSH('DG.size-trace', { event, ...payload });
        }
      } catch {}

      // Console logging is *explicit* opt-in (no dependency on DG_DEBUG).
      const toConsole = (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE_TO_CONSOLE === true);
      if (!toConsole) return;

      const text = (() => {
        try { return JSON.stringify(payload); } catch { return null; }
      })();
      if (text) console.log('[DG][size-trace]', event, text);
      else console.log('[DG][size-trace]', event, payload);
    } catch {}
  }

  // Extra targeted logs for refresh/zoom/layout issues.
  // Enable with: window.__DG_REFRESH_DEBUG = true
  function dgRefreshTrace(event, data = null) {
    try {
      const on = (typeof window !== 'undefined' && window.__DG_REFRESH_DEBUG);
      if (!on) return;
      // ro:size can be noisy during initial mount/overview settling.
      // Keep it opt-in so refresh debug stays usable.
      if (event === 'ro:size' && !window.__DG_REFRESH_DEBUG_RO_SIZE) return;
    } catch { return; }
    try {
      if (data !== null && data !== undefined) console.log('[DG][refresh]', event, data);
      else console.log('[DG][refresh]', event);
    } catch {}
  }

  function dgSizeTraceCanvas(tag, extra = null) {
    try {
      const on = (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE);
      if (!on) return;
    } catch { return; }
    try {
      const panel = getPanel?.();
      const cssW = getCssW?.() ?? 0;
      const cssH = getCssH?.() ?? 0;
      const paintDpr = getPaintDpr?.() ?? 1;
      const frontCanvas = getFrontCanvas?.();
      const backCanvas = getBackCanvas?.();
      const playheadCanvas = getPlayheadCanvas?.();
      const gridBackCanvas = getGridBackCanvas?.();
      const nodesBackCanvas = getNodesBackCanvas?.();
      const flashBackCanvas = getFlashBackCanvas?.();
      const ghostBackCanvas = getGhostBackCanvas?.();
      const tutorialBackCanvas = getTutorialBackCanvas?.();

      const describeCanvas = (c) => {
        if (!c) return null;
        const w = c.width || 0;
        const h = c.height || 0;
        const effDprW = (cssW > 0 && w > 0) ? (w / cssW) : null;
        const effDprH = (cssH > 0 && h > 0) ? (h / cssH) : null;
        return { w, h, effDprW, effDprH };
      };
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
        // Snapshot all major composited surfaces so we can see effective DPR + backing-store sizes.
        // NOTE: particles are owned by field-generic; see __FG_EFFECTIVE_DPR_TRACE for that.
        surfaces: {
          front: describeCanvas(frontCanvas),
          back: describeCanvas(backCanvas),
          playhead: describeCanvas(playheadCanvas),
          gridBack: describeCanvas(gridBackCanvas),
          nodesBack: describeCanvas(nodesBackCanvas),
          flashBack: describeCanvas(flashBackCanvas),
          ghostBack: describeCanvas(ghostBackCanvas),
          tutorialBack: describeCanvas(tutorialBackCanvas),
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

  // Effective DPR tracer (per surface).
  // Purpose: prove that pressure-DPR is *actually* applying to every heavy canvas, and
  // catch backing-store churn (e.g. oscillating 1px resizes) after refactors.
  function dgEffectiveDprTrace(tag, extra = null) {
    try {
      const on = (typeof window !== 'undefined' && window.__DG_EFFECTIVE_DPR_TRACE);
      if (!on) return;
    } catch { return; }

    try {
      const cssW = getCssW?.() ?? 0;
      const cssH = getCssH?.() ?? 0;
      const paintDpr = getPaintDpr?.() ?? 1;
      const frontCanvas = getFrontCanvas?.();
      const backCanvas = getBackCanvas?.();
      const playheadCanvas = getPlayheadCanvas?.();
      const gridBackCanvas = getGridBackCanvas?.();
      const nodesBackCanvas = getNodesBackCanvas?.();
      const flashBackCanvas = getFlashBackCanvas?.();
      const ghostBackCanvas = getGhostBackCanvas?.();
      const tutorialBackCanvas = getTutorialBackCanvas?.();

      const describe = (c) => {
        if (!c) return null;
        const w = c.width || 0;
        const h = c.height || 0;
        const effDprW = (cssW > 0 && w > 0) ? (w / cssW) : null;
        const effDprH = (cssH > 0 && h > 0) ? (h / cssH) : null;
        return { w, h, effDprW, effDprH };
      };

      const payload = {
        tag,
        cssW,
        cssH,
        paintDpr,
        surfaces: {
          front: describe(frontCanvas),
          back: describe(backCanvas),
          playhead: describe(playheadCanvas),
          gridBack: describe(gridBackCanvas),
          nodesBack: describe(nodesBackCanvas),
          flashBack: describe(flashBackCanvas),
          ghostBack: describe(ghostBackCanvas),
          tutorialBack: describe(tutorialBackCanvas),
        },
        extra: extra || null,
      };

      const sig = JSON.stringify(payload);
      if (sig === __dgLastEffectiveDprSig) return;
      __dgLastEffectiveDprSig = sig;

      // Prefer buffered trace (PerfLab) to avoid console stalls during perf runs.
      try {
        const push = (typeof window !== 'undefined') ? window.__PERF_TRACE_PUSH : null;
        if (typeof push === 'function') push('DG.dpr', payload);
      } catch {}

      // Console is opt-in only (debugging, not perf).
      try {
        const toConsole = (typeof window !== 'undefined') ? !!window.__PERF_TRACE_TO_CONSOLE : true;
        if (toConsole) console.log('[DG][dpr]', payload);
      } catch {}
    } catch {}
  }

  return {
    dgSizeTraceCanLog,
    dgSizeTrace,
    dgSizeTraceCanvas,
    dgEffectiveDprTrace,
    dgRefreshTrace,
  };
}
