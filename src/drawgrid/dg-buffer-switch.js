// src/drawgrid/dg-buffer-switch.js
// Buffer switching and canvas routing for DrawGrid.

export function createDgBufferSwitch({ state, deps } = {}) {
  const s = state || {};
  const d = deps || {};

  function copyCanvas(backCtx, frontCtx) {
    if (!backCtx || !frontCtx) return;
    const front = frontCtx.canvas, back = backCtx.canvas;
    if (!front || !back || !front.width || !front.height || !back.width || !back.height) return;
    d.R.withDeviceSpace(frontCtx, () => {
      frontCtx.clearRect(0, 0, front.width, front.height);
      frontCtx.drawImage(back, 0, 0, back.width, back.height, 0, 0, front.width, front.height);
    });
  }

  function useBackBuffers() {
    if (s.usingBackBuffers) return;
    s.usingBackBuffers = true;
    d.syncBackBufferSizes();
    s.gctx = s.gridBackCtx;
    s.nctx = s.nodesBackCtx;
    if (s.DG_SINGLE_CANVAS) {
      s.gctx = s.gridBackCtx;
      // IMPORTANT: when using back buffers we must draw nodes into the BACK ctx.
      s.nctx = (s.DG_SINGLE_CANVAS_OVERLAYS && s.nodesCanvas !== s.grid) ? s.nodesBackCtx : s.nodesBackCtx;
      // Keep the back overlay seeded from what is currently visible.
      if (s.DG_SINGLE_CANVAS_OVERLAYS && s.nodesCanvas !== s.grid) {
        try { copyCanvas(s.nodesFrontCtx, s.nodesBackCtx); } catch {}
      }
    }
    s.fctx = s.flashBackCtx;
    s.ghostCtx = s.ghostBackCtx;
    s.tutorialCtx = s.tutorialBackCtx;
    // Keep paint context aligned to active buffer.
    try { s.pctx = (typeof d.getActivePaintCtx === 'function') ? d.getActivePaintCtx() : s.backCtx; } catch { s.pctx = s.backCtx; }
    d.emitDG('buffers', { action: 'useBackBuffers', usingBackBuffers: s.usingBackBuffers });
  }

  function useFrontBuffers() {
    if (!s.usingBackBuffers) return;
    s.usingBackBuffers = false;
    s.gctx = s.gridFrontCtx;
    s.nctx = s.nodesFrontCtx;
    if (s.DG_SINGLE_CANVAS) {
      s.gctx = s.gridBackCtx;
      // In single-canvas + overlay mode, the visible nodes layer is the FRONT ctx.
      s.nctx = (s.DG_SINGLE_CANVAS_OVERLAYS && s.nodesCanvas !== s.grid) ? s.nodesFrontCtx : s.nodesBackCtx;
      // Commit any overlay work drawn while using back buffers.
      if (s.DG_SINGLE_CANVAS_OVERLAYS && s.nodesCanvas !== s.grid) {
        try { copyCanvas(s.nodesBackCtx, s.nodesFrontCtx); } catch {}
      }
    }
    s.fctx = s.flashFrontCtx;
    s.ghostCtx = s.ghostFrontCtx;
    s.tutorialCtx = s.tutorialFrontCtx;
    // Keep paint context aligned to active buffer.
    try { s.pctx = (typeof d.getActivePaintCtx === 'function') ? d.getActivePaintCtx() : s.frontCtx; } catch { s.pctx = s.frontCtx; }
    d.emitDG('buffers', { action: 'useFrontBuffers', usingBackBuffers: s.usingBackBuffers });
  }

  function getActiveFlashCanvas() {
    return s.usingBackBuffers ? s.flashBackCanvas : s.flashCanvas;
  }

  function getActiveTutorialCanvas() {
    return s.usingBackBuffers ? s.tutorialBackCanvas : s.tutorialCanvas;
  }

  return {
    copyCanvas,
    useBackBuffers,
    useFrontBuffers,
    getActiveFlashCanvas,
    getActiveTutorialCanvas,
  };
}
