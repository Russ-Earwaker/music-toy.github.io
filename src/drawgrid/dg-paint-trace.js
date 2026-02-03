// src/drawgrid/dg-paint-trace.js
// DrawGrid paint lifecycle tracing (debug-only, opt-in via console flags).

export function initDgPaintTraceFlags() {
  try {
    if (typeof window !== 'undefined' && window.__DG_PAINT_TRACE === undefined) {
      window.__DG_PAINT_TRACE = false;
    }
  } catch {}
}

export function createDgPaintTrace({
  __dgFlag,
  dgLogLine,
  getPanel,
  getUsingBackBuffers,
  getZoomGestureActive,
  getZoomMode,
  getCssW,
  getCssH,
  getPaintDpr,
  getFrontCanvas,
  getBackCanvas,
} = {}) {
  function dgPaintTrace(event, data = null) {
    try {
      const on = __dgFlag?.('paintTrace') || !!(window && window.__DG_PAINT_TRACE);
      if (!on) return;
    } catch { return; }

    try {
      const panel = getPanel?.();
      const frontCanvas = getFrontCanvas?.();
      const backCanvas = getBackCanvas?.();
      dgLogLine?.('paint-trace', {
        event,
        panelId: panel?.id || null,
        usingBackBuffers: getUsingBackBuffers?.(),
        zoomGestureActive: getZoomGestureActive?.(),
        zoomMode: getZoomMode?.(),
        cssW: getCssW?.(),
        cssH: getCssH?.(),
        paintDpr: getPaintDpr?.(),
        front: { w: frontCanvas?.width || 0, h: frontCanvas?.height || 0 },
        back: { w: backCanvas?.width || 0, h: backCanvas?.height || 0 },
        // This helps detect "double scaling" issues:
        frontRect: (() => { try { const r = frontCanvas?.getBoundingClientRect?.(); return r ? { w: r.width, h: r.height } : null; } catch {} return null; })(),
        data
      });
    } catch {}
  }

  return {
    dgPaintTrace,
  };
}
