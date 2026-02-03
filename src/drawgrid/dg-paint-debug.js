// src/drawgrid/dg-paint-debug.js
// DrawGrid paint debug logging (opt-in via console flag).

export function createDgPaintDebug({
  getPanel,
  getUsingBackBuffers,
  getPaintDpr,
  getCssW,
  getCssH,
  getPctx,
  getFrontCanvas,
  getBackCanvas,
  getFrontCtx,
  getBackCtx,
  getActivePaintCanvas,
  getGridArea,
  getTopPad,
  __dgSampleAlpha,
} = {}) {
  function __dgPaintDebugLog(tag, extra = null) {
    try {
      if (typeof window === 'undefined' || !window.__DG_PAINT_DEBUG) return;
      const active = (typeof getActivePaintCanvas === 'function') ? getActivePaintCanvas() : null;
      const pctx = getPctx?.();
      let pctxTransform = null;
      try {
        if (pctx && typeof pctx.getTransform === 'function') {
          const t = pctx.getTransform();
          pctxTransform = { a: t.a, b: t.b, c: t.c, d: t.d, e: t.e, f: t.f };
        }
      } catch {}
      const panel = getPanel?.();
      const frontCanvas = getFrontCanvas?.();
      const backCanvas = getBackCanvas?.();
      const cssW = getCssW?.();
      const cssH = getCssH?.();
      const payload = {
        panelId: panel?.id || null,
        tag,
        usingBackBuffers: getUsingBackBuffers?.(),
        paintDpr: getPaintDpr?.(),
        cssW,
        cssH,
        pctxRole: pctx?.canvas?.getAttribute?.('data-role') || null,
        activeRole: active?.getAttribute?.('data-role') || null,
        frontW: frontCanvas?.width || 0,
        frontH: frontCanvas?.height || 0,
        backW: backCanvas?.width || 0,
        backH: backCanvas?.height || 0,
        frontClientW: frontCanvas?.clientWidth || 0,
        frontClientH: frontCanvas?.clientHeight || 0,
        frontEffDpr: (cssW && frontCanvas?.width) ? +(frontCanvas.width / cssW).toFixed(3) : null,
        backEffDpr: (cssW && backCanvas?.width) ? +(backCanvas.width / cssW).toFixed(3) : null,
        pctxTransform,
      };
      if (extra && typeof extra === 'object') {
        Object.assign(payload, extra);
      }
      const gridArea = getGridArea?.();
      if (window.__DG_PAINT_SAMPLE && gridArea && gridArea.w > 0 && gridArea.h > 0) {
        const topPad = getTopPad?.() || 0;
        const sx = Math.round(gridArea.x + gridArea.w * 0.5);
        const sy = Math.round(gridArea.y + topPad + (gridArea.h - topPad) * 0.5);
        const frontCtx = getFrontCtx?.();
        const backCtx = getBackCtx?.();
        payload.sample = {
          x: sx,
          y: sy,
          front: __dgSampleAlpha?.(frontCtx, sx, sy),
          back: __dgSampleAlpha?.(backCtx, sx, sy),
        };
      }
      console.log('[DG][paintDBG]', JSON.stringify(payload));
    } catch {}
  }

  return {
    __dgPaintDebugLog,
  };
}
