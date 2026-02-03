// src/drawgrid/dg-pointer-trace.js
// DrawGrid pointer trace helper (debug-only, opt-in via console flags).

export function createDgPointerTrace({
  getPanel,
  getCssW,
  getCssH,
  getPaintDpr,
  getUsingBackBuffers,
  getDgSingleCanvas,
  getWrap,
  getLayersRoot,
  getFrontCanvas,
  getBackCanvas,
  getPaintCanvas,
  getActivePaintCanvas,
  __dgDescribeCanvasScale,
  __dgStableStringify,
  __dgMaybeTraceStack,
} = {}) {
  let __dgPointerTraceId = null;
  let __dgPointerTraceMoveLogged = false;
  let __dgPointerSigLast = '';

  function __dgPointerTraceLocal(tag, e, p) {
    try {
      if (typeof window === 'undefined' || !window.__DG_POINTER_TRACE) return;
      const paintCanvas = (typeof getActivePaintCanvas === 'function')
        ? getActivePaintCanvas()
        : (getFrontCanvas?.() || getPaintCanvas?.() || null);
      const paintRect = paintCanvas?.getBoundingClientRect?.();
      const wrap = getWrap?.();
      const wrapRect = wrap?.getBoundingClientRect?.();
      const layersRoot = getLayersRoot?.();
      const layerRect = layersRoot?.getBoundingClientRect?.();
      const panel = getPanel?.();
      const cssW = getCssW?.();
      const cssH = getCssH?.();
      const paintDpr = getPaintDpr?.();
      const frontCanvas = getFrontCanvas?.();
      const backCanvas = getBackCanvas?.();
      const payload = {
        tag,
        panelId: panel?.id || null,
        pointerId: e?.pointerId ?? null,
        buttons: e?.buttons ?? null,
        client: { x: e?.clientX ?? null, y: e?.clientY ?? null },
        logical: { x: p?.x ?? null, y: p?.y ?? null },
        basis: p?.__dbg || null,
        cssW,
        cssH,
        paintDpr,
        usingBackBuffers: getUsingBackBuffers?.(),
        DG_SINGLE_CANVAS: getDgSingleCanvas?.(),
        wrapRect: wrapRect ? { w: Math.round(wrapRect.width), h: Math.round(wrapRect.height) } : null,
        wrapClient: wrap ? { w: wrap.clientWidth || 0, h: wrap.clientHeight || 0 } : null,
        layerRect: layerRect ? { w: Math.round(layerRect.width), h: Math.round(layerRect.height) } : null,
        paintRole: paintCanvas?.getAttribute?.('data-role') || null,
        paintRect: paintRect ? { w: Math.round(paintRect.width), h: Math.round(paintRect.height) } : null,
        paintSize: paintCanvas ? {
          pxW: paintCanvas.width || 0,
          pxH: paintCanvas.height || 0,
          cssW: paintCanvas.style?.width || null,
          cssH: paintCanvas.style?.height || null,
          clientW: paintCanvas.clientWidth || 0,
          clientH: paintCanvas.clientHeight || 0,
          tsmCssW: Number.isFinite(paintCanvas.__tsmCssW) ? paintCanvas.__tsmCssW : null,
          tsmCssH: Number.isFinite(paintCanvas.__tsmCssH) ? paintCanvas.__tsmCssH : null,
          dgCssW: Number.isFinite(paintCanvas.__dgCssW) ? paintCanvas.__dgCssW : null,
          dgCssH: Number.isFinite(paintCanvas.__dgCssH) ? paintCanvas.__dgCssH : null,
        } : null,
        frontScale: __dgDescribeCanvasScale?.(frontCanvas, wrapRect),
        backScale: __dgDescribeCanvasScale?.(backCanvas, wrapRect),
      };
      const sig = __dgStableStringify?.(payload);
      if (__dgPointerSigLast === sig) return;
      __dgPointerSigLast = sig;
      const stack = __dgMaybeTraceStack?.('__DG_POINTER_TRACE_STACK', `DG pointer trace: ${tag}`);
      if (stack) console.log(`[DG][pointer] ${tag}`, payload, stack);
      else console.log(`[DG][pointer] ${tag}`, payload);
    } catch {}
  }

  function onPointerDown(e, p) {
    if (typeof window !== 'undefined' && window.__DG_POINTER_TRACE) {
      __dgPointerTraceId = e.pointerId;
      __dgPointerTraceMoveLogged = false;
      __dgPointerTraceLocal('down', e, p);
    }
  }

  function onPointerMove(e, p) {
    if (typeof window !== 'undefined' && window.__DG_POINTER_TRACE) {
      if (__dgPointerTraceId === e.pointerId && !__dgPointerTraceMoveLogged) {
        __dgPointerTraceMoveLogged = true;
        __dgPointerTraceLocal('move', e, p);
      }
    }
  }

  function onPointerUp(e, p) {
    if (typeof window !== 'undefined' && window.__DG_POINTER_TRACE) {
      if (__dgPointerTraceId === e.pointerId) {
        __dgPointerTraceLocal('up', e, p);
        __dgPointerTraceId = null;
        __dgPointerTraceMoveLogged = false;
      }
    }
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
