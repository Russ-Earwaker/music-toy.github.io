// Back-buffer synchronization for DrawGrid.
// Backing allocation is owned elsewhere: visible canvases by ToySurfaceManager,
// offscreen canvases by dg-offscreen-backing. This module only copies pixels.

export function createDgBackSync({ state, deps } = {}) {
  const s = state || {};
  const d = deps || {};

  function ensureBackVisualsFreshFromFront() {
    try {
      const copyCtx = (srcCtx, dstCtx) => {
        if (!srcCtx || !dstCtx) return;
        if (srcCtx === dstCtx || srcCtx.canvas === dstCtx.canvas) return;
        if (s.DG_SINGLE_CANVAS && s.usingBackBuffers && (srcCtx === s.gridFrontCtx || srcCtx === s.nodesFrontCtx)) return;
        const dw = dstCtx.canvas?.width || 0;
        const dh = dstCtx.canvas?.height || 0;
        if (!dw || !dh) return;
        d.R.withDeviceSpace(dstCtx, () => {
          dstCtx.clearRect(0, 0, dw, dh);
          dstCtx.drawImage(
            srcCtx.canvas,
            0, 0, srcCtx.canvas.width, srcCtx.canvas.height,
            0, 0, dw, dh
          );
        });
      };

      if (!s.DG_SINGLE_CANVAS) {
        copyCtx(s.pctx, s.backCtx);
        copyCtx(s.gridFrontCtx, s.gridBackCtx);
        copyCtx(s.nodesFrontCtx, s.nodesBackCtx);
        copyCtx(s.flashFrontCtx, s.flashBackCtx);
        copyCtx(s.ghostFrontCtx, s.ghostBackCtx);
        copyCtx(s.tutorialFrontCtx, s.tutorialBackCtx);
      } else if (!s.usingBackBuffers && s.backCtx && Array.isArray(s.strokes) && s.strokes.length > 0) {
        d.clearAndRedrawFromStrokes(s.backCtx, 'sync-back-from-strokes');
      }
    } catch {}
  }

  return { ensureBackVisualsFreshFromFront };
}
