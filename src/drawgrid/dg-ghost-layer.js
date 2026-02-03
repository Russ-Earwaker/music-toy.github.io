// src/drawgrid/dg-ghost-layer.js
// Ghost layer management helpers.

export function createDgGhostLayer({
  getPanel,
  getUsingBackBuffers,
  getGhostCtx,
  getGhostFrontCtx,
  getGhostBackCtx,
  getGhostCanvas,
  getGhostBackCanvas,
  markOverlayDirty,
  markSingleCanvasOverlayDirty,
  dgGhostTrace,
  __dgGhostMaybeStack,
  R,
} = {}) {
  const markGhostLayerActive = () => {
    try {
      const panel = getPanel?.();
      // This is called frequently during the ghost sweep; only log on the
      // transition from "empty" -> "active" to avoid spam.
      const __wasEmpty = panel?.__dgGhostLayerEmpty !== false;
      if (panel) panel.__dgGhostLayerEmpty = false;
      try { markOverlayDirty?.(panel); } catch {}
      try { markSingleCanvasOverlayDirty?.(panel); } catch {}
      if (!__wasEmpty) return;
      try {
        if (
          typeof window !== 'undefined' &&
          window.__DG_GHOST_TRACE &&
          !window.__DG_GHOST_TRACE_CLEAR_ONLY
        ) {
          const stack = __dgGhostMaybeStack?.('DG markGhostLayerActive');
          dgGhostTrace?.('layer:ghost-active', {
            id: panel?.id || null,
            usingBackBuffers: getUsingBackBuffers?.(),
            stack,
          });
        }
      } catch {}
    } catch {}
  };

  const markGhostLayerCleared = () => {
    try {
      const panel = getPanel?.();
      const __wasEmpty = panel?.__dgGhostLayerEmpty !== true;
      if (panel) panel.__dgGhostLayerEmpty = true;
      try { markOverlayDirty?.(panel); } catch {}
      try { markSingleCanvasOverlayDirty?.(panel); } catch {}
      if (!__wasEmpty) return;
      try {
        if (
          typeof window !== 'undefined' &&
          window.__DG_GHOST_TRACE &&
          !window.__DG_GHOST_TRACE_CLEAR_ONLY
        ) {
          const stack = __dgGhostMaybeStack?.('DG markGhostLayerCleared');
          dgGhostTrace?.('layer:ghost-cleared', {
            id: panel?.id || null,
            usingBackBuffers: getUsingBackBuffers?.(),
            stack,
          });
        }
      } catch {}
    } catch {}
  };

  function syncGhostBackToFront() {
    const ghostFrontCtx = getGhostFrontCtx?.();
    const ghostBackCtx = getGhostBackCtx?.();
    if (!ghostFrontCtx || !ghostBackCtx) return;
    const front = ghostFrontCtx.canvas;
    const back = ghostBackCtx.canvas;
    if (!front || !back) return;
    R?.withDeviceSpace?.(ghostFrontCtx, () => {
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

  function getActiveGhostCanvas() {
    const usingBackBuffers = getUsingBackBuffers?.();
    return usingBackBuffers ? getGhostBackCanvas?.() : getGhostCanvas?.();
  }

  function resetGhostCtx() {
    const ghostCtx = getGhostCtx?.();
    try { R?.resetCtx?.(ghostCtx); } catch {}
    return ghostCtx;
  }

  return {
    markGhostLayerActive,
    markGhostLayerCleared,
    syncGhostBackToFront,
    getActiveGhostCanvas,
    resetGhostCtx,
  };
}
