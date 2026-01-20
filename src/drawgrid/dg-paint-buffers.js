// src/drawgrid/dg-paint-buffers.js
// Paint/backbuffer resizing + swaps for DrawGrid.
// Rule: no imports from drawgrid.js. Everything comes from getHost().

export function createDgPaintBuffers(getHost) {
  function syncBackBufferSizes() {
    const h = getHost();
    const pairs = h?.backFrontPairs || [];
    for (const [back, front] of pairs) {
      if (!back || !front) continue;
      const bc = back.canvas, fc = front.canvas;
      if (!bc || !fc) continue;
      if (bc.width !== fc.width || bc.height !== fc.height) {
        bc.width = fc.width;
        bc.height = fc.height;
      }
    }
  }

  function updatePaintBackingStores(opts = {}) {
    const h = getHost();
    const force = !!opts.force;
    const target = opts.target || 'both';

    const cssW = h?.cssW || 0;
    const cssH = h?.cssH || 0;
    if (!cssW || !cssH) return;

    // Preserve the original behaviour: don't resize mid-gesture unless forced.
    if (!force && h?.zoomGestureActive) return;

    const paintDpr = Math.max(0.1, Number.isFinite(h?.paintDpr) ? h.paintDpr : 1);
    const targetW = Math.max(1, Math.round(cssW * paintDpr));
    const targetH = Math.max(1, Math.round(cssH * paintDpr));

    const resizeCtx = (ctx, label) => {
      if (!ctx || !ctx.canvas) return false;
      const c = ctx.canvas;
      if (!force && c.width === targetW && c.height === targetH) return false;
      c.width = targetW;
      c.height = targetH;
      try { ctx.setTransform(1, 0, 0, 1, 0, 0); } catch {}
      try { ctx.imageSmoothingEnabled = true; } catch {}
      h?.dgPaintTrace?.(`${label}:resize-cleared`, { force, targetW, targetH, target });
      return true;
    };

    // Decide which contexts to resize based on `target`
    // - front: only front contexts
    // - back: only back contexts
    // - both: everything
    const wantFront = (target === 'front' || target === 'both');
    const wantBack = (target === 'back' || target === 'both');

    let didResize = false;

    if (wantFront && Array.isArray(h?.frontCtxs)) {
      for (const { ctx, label } of h.frontCtxs) {
        if (resizeCtx(ctx, label || 'front')) didResize = true;
      }
    }

    if (wantBack && Array.isArray(h?.backCtxs)) {
      for (const { ctx, label } of h.backCtxs) {
        if (resizeCtx(ctx, label || 'back')) didResize = true;
      }
    }

    // Keep back buffers aligned to front after any front resize.
    if (wantFront && didResize) {
      try { syncBackBufferSizes(); } catch {}
    }

    // If resize cleared pixels, schedule redraw using the existing post-commit path
    if (
      didResize &&
      !h?.__dgSuppressPostCommitOnPaintResize &&
      Array.isArray(h?.strokes) &&
      h.strokes.length > 0
    ) {
      try { h?.dgLogLine?.('paint-resize:scheduled-redraw', { force, targetW, targetH, strokes: h.strokes.length }); } catch {}
      h?.dgPaintTrace?.('postCommit:scheduled', { reason: 'paint-backingstore-resize', targetW, targetH, strokes: h.strokes.length });
      try { h?.ensurePostCommitRedraw?.('paint-backingstore-resize'); } catch {}
    }

    if (h?.DG_LAYOUT_DEBUG && force) {
      try { h?.debugPaintSizes?.('updatePaintBackingStores', { target, force, targetW, targetH }); } catch {}
    }
  }

  function swapBackToFront() {
    const h = getHost();
    const { backCtx, frontCtx, backCanvas, frontCanvas } = h || {};
    if (!backCtx || !frontCtx || !backCanvas || !frontCanvas) return;
    if (!h?.cssW || !h?.cssH) return;

    h?.dgPaintTrace?.('swapBackToFront:begin');

    // Ensure front is correctly sized before blitting.
    updatePaintBackingStores({ force: true, target: 'front' });

    try { h?.debugPaintSizes?.('swapBackToFront:before'); } catch {}

    // Use the drawgrid's withDeviceSpace helper (passed through host)
    const withDeviceSpace = h?.withDeviceSpace;
    if (typeof withDeviceSpace === 'function') {
      withDeviceSpace(frontCtx, () => {
        frontCtx.drawImage(
          backCanvas,
          0, 0, backCanvas.width, backCanvas.height,
          0, 0, frontCanvas.width, frontCanvas.height
        );
      });
    } else {
      // Fallback (shouldn't happen, but avoids hard crash)
      frontCtx.drawImage(backCanvas, 0, 0);
    }

    h?.dgPaintTrace?.('swapBackToFront:end');
    try { h?.debugPaintSizes?.('swapBackToFront:after'); } catch {}
  }

  return {
    syncBackBufferSizes,
    updatePaintBackingStores,
    swapBackToFront,
  };
}
