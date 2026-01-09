// src/drawgrid/dg-flow-debug.js

export function createDgFlowDebug(getState) {
  function maybeLogStall(panel, tag) {
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

  function layerDebugLog(tag, payload = {}) {
    try {
      if (typeof window !== 'undefined' && window.__DG_LAYER_DEBUG === undefined) {
        window.__DG_LAYER_DEBUG = false;
      }
      if (!window.__DG_LAYER_DEBUG) return;
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const S = getState();
      if ((now - S.__dgLayerDebugLastTs) < 400) return;
      S.__dgLayerDebugLastTs = now;
      console.log('[DG][layer]', tag, payload);
    } catch {}
  }

  function layerTrace(tag, payload = {}) {
    try {
      if (typeof window !== 'undefined' && window.__DG_LAYER_TRACE === undefined) {
        window.__DG_LAYER_TRACE = false;
      }
      if (!window.__DG_LAYER_TRACE) return;
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const S = getState();
      if ((now - S.__dgLayerTraceLastTs) < 200) return;
      S.__dgLayerTraceLastTs = now;
      console.log('[DG][layer-trace]', tag, payload);
    } catch {}
  }

  function layerEvent(tag, payload = {}) {
    try {
      if (typeof window !== 'undefined' && window.__DG_LAYER_EVENTS === undefined) {
        window.__DG_LAYER_EVENTS = false;
      }
      if (!window.__DG_LAYER_EVENTS) return;
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const panelRef = payload.panelRef || null;
      const last = panelRef?.__dgLayerEventLastTs || 0;
      if ((now - last) < 250) return;
      if (panelRef) panelRef.__dgLayerEventLastTs = now;
      const out = { ...payload };
      delete out.panelRef;
      console.log('[DG][layer-event]', tag, out);
    } catch {}
  }

  function flowLog(tag, payload = {}) {
    try {
      if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW === undefined) {
        window.__DG_DEBUG_DRAWFLOW = false;
      }
      if (!window.__DG_DEBUG_DRAWFLOW) return;
      const S = getState();
      console.log('[DG][flow]', tag, {
        panelId: payload.panelId ?? (S.panel?.id || null),
        usingBackBuffers: payload.usingBackBuffers ?? S.usingBackBuffers,
        skipSwapsDuringDrag: payload.skipSwapsDuringDrag ?? S.__dgSkipSwapsDuringDrag,
        drawingActive: payload.drawingActive ?? S.__dgDrawingActive,
        hasCur: payload.hasCur ?? !!S.cur,
        previewGid: payload.previewGid ?? S.previewGid,
        nextDrawTarget: payload.nextDrawTarget ?? S.nextDrawTarget,
        strokes: payload.strokes ?? (Array.isArray(S.strokes) ? S.strokes.length : 0),
        chainActive: payload.chainActive ?? (S.panel?.dataset?.chainActive || null),
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

  function __dgSampleAlphaFromCanvas(canvas) {
    try {
      if (!canvas || !canvas.width || !canvas.height) return null;
      const S = getState();
      if (!S.__dgSampleCanvas) {
        S.__dgSampleCanvas = document.createElement('canvas');
        S.__dgSampleCtx = S.__dgSampleCanvas.getContext('2d', { willReadFrequently: true });
      }
      if (!S.__dgSampleCtx) return null;
      const w = 16;
      const h = 16;
      if (S.__dgSampleCanvas.width !== w) S.__dgSampleCanvas.width = w;
      if (S.__dgSampleCanvas.height !== h) S.__dgSampleCanvas.height = h;
      S.__dgSampleCtx.setTransform(1, 0, 0, 1, 0, 0);
      S.__dgSampleCtx.clearRect(0, 0, w, h);
      S.__dgSampleCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, w, h);
      const data = S.__dgSampleCtx.getImageData(0, 0, w, h).data;
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
    const S = getState();
    const paintEl = ctx.paint ?? S.paint ?? null;
    const backEl = ctx.backCanvas ?? S.backCanvas ?? null;
    const flashEl = ctx.flashCanvas ?? S.flashCanvas ?? null;
    const flashBackEl = ctx.flashBackCanvas ?? S.flashBackCanvas ?? null;
    const activeFlashEl = ctx.activeFlashCanvas ?? (typeof S.getActiveFlashCanvas === 'function' ? S.getActiveFlashCanvas() : null);
    const strokeList = ctx.strokes ?? S.strokes ?? null;
    const panelRef = ctx.panel ?? S.panel ?? null;
    const hasOverlayFn = ctx.hasOverlayStrokesCached ?? (typeof S.hasOverlayStrokesCached === 'function' ? S.hasOverlayStrokesCached : null);
    return {
      panelId: panelRef?.id || null,
      strokes: Array.isArray(strokeList) ? strokeList.length : 0,
      hasOverlayStrokes: hasOverlayFn ? hasOverlayFn() : null,
      paintRev: ctx.paintRev ?? S.__dgPaintRev ?? null,
      flashEmpty: panelRef ? !!panelRef.__dgFlashLayerEmpty : null,
      flashOutOfGrid: panelRef ? !!panelRef.__dgFlashOverlayOutOfGrid : null,
      baseDirty: panelRef ? !!panelRef.__dgCompositeBaseDirty : null,
      overlayDirty: panelRef ? !!panelRef.__dgCompositeOverlayDirty : null,
      compositeDirty: ctx.compositeDirty ?? (panelRef ? !!panelRef.__dgSingleCompositeDirty : null),
      usingBackBuffers: ctx.usingBackBuffers ?? S.usingBackBuffers,
      paintSize: paintEl ? { w: paintEl.width, h: paintEl.height } : null,
      backSize: backEl ? { w: backEl.width, h: backEl.height } : null,
      paintAlpha: __dgSampleAlphaFromCanvas(paintEl),
      backAlpha: __dgSampleAlphaFromCanvas(backEl),
      flashAlpha: __dgSampleAlphaFromCanvas(flashEl),
      flashBackAlpha: __dgSampleAlphaFromCanvas(flashBackEl),
      activeFlashAlpha: __dgSampleAlphaFromCanvas(activeFlashEl),
    };
  }

  function flowState(tag, ctx) {
    if (typeof window === 'undefined' || !window.__DG_DEBUG_DRAWFLOW) return;
    try {
      const S = getState();
      const panelRef = ctx?.panel ?? S.panel ?? null;
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

  function markRegenSource(reason) {
    const S = getState();
    S.__dgRegenSource = typeof reason === 'string' ? reason : '';
  }

  return {
    flowLog,
    flowState,
    markRegenSource,
    layerDebugLog,
    layerTrace,
    layerEvent,
    maybeLogStall,
    __dgSampleAlphaFromCanvas,
    __dgCollectFlowState,
  };
}
