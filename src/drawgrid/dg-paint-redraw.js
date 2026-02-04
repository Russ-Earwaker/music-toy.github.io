// src/drawgrid/dg-paint-redraw.js
// Paint redraw helpers for DrawGrid.

export function createDgPaintRedraw({ state, deps } = {}) {
  const s = state || {};
  const d = deps || {};

  function clearAndRedrawFromStrokes(targetCtx, reason) {
    return d.F?.perfMarkSection?.('drawgrid.paint.redraw', () => {
      if (reason) d.FD?.markRegenSource?.(reason);
      // IMPORTANT:
      // Keep the caller's target ctx, but ensure the composite back buffer stays in sync.
      // In DG_SINGLE_CANVAS, some call paths draw into frontCtx (visible) while composite
      // uses backCtx as the base. If backCtx isn't updated, the solid line can appear
      // scaled incorrectly after zoom-out.
      const resolvedTarget = targetCtx;
      // IMPORTANT:
      // The paint stroke must be redrawn into the *currently visible* paint buffer.
      // When `usingBackBuffers` is false we should never fall back to `backCtx`,
      // otherwise the redraw can land in a hidden backing store that has stale CSS sizing,
      // producing the "solid line scales up" bug when zoomed out.
      const activePaintCtx = (typeof d.getActivePaintCtx === 'function') ? d.getActivePaintCtx() : null;
      const ctx =
        resolvedTarget ||
        activePaintCtx ||
        (s.usingBackBuffers ? s.backCtx : s.frontCtx) ||
        s.pctx;
      if (!ctx) return;
      d.dgPaintTrace?.('clearAndRedrawFromStrokes:enter', {
        ctxIsFront: ctx === s.frontCtx,
        ctxIsBack: ctx === s.backCtx,
        canvasW: ctx?.canvas?.width || 0,
        canvasH: ctx?.canvas?.height || 0,
      });
      if (s.DG_LAYOUT_DEBUG) {
        const expectedW = Math.max(1, Math.round(s.cssW * s.paintDpr));
        const expectedH = Math.max(1, Math.round(s.cssH * s.paintDpr));
        if (ctx.canvas?.width !== expectedW || ctx.canvas?.height !== expectedH) {
          d.debugPaintSizes?.('clearAndRedrawFromStrokes:canvas-mismatch', { ctxW: ctx.canvas?.width, ctxH: ctx.canvas?.height });
        }
      }
      const normalStrokes = s.strokes.filter((stroke) => !stroke.justCreated);
      const newStrokes = s.strokes.filter((stroke) => stroke.justCreated);
      d.R.resetCtx(ctx);
      d.__dgWithLogicalSpace?.(ctx, () => {
        const surface = ctx.canvas;
        const scale = (Number.isFinite(s.paintDpr) && s.paintDpr > 0) ? s.paintDpr : 1;
        const width = s.cssW || (surface?.width ?? 0) / scale;
        const height = s.cssH || (surface?.height ?? 0) / scale;
        ctx.clearRect(0, 0, width, height);
        d.dgPaintTrace?.('clearAndRedrawFromStrokes:about-to-draw', { paintDpr: s.paintDpr, cssW: s.cssW, cssH: s.cssH });

        // 1. Draw all existing, non-new strokes first.
        for (const stroke of normalStrokes) {
          d.drawFullStroke?.(ctx, stroke, { skipReset: true, skipTransform: true });
        }
        // 2. Draw the brand new strokes on top.
        for (const stroke of newStrokes) {
          d.drawFullStroke?.(ctx, stroke, { skipReset: true, skipTransform: true });
        }
      });

      // If we drew into the front buffer in single-canvas mode, mirror it into the
      // back buffer before composite so the base isn't stale or mismatched.
      if (s.DG_SINGLE_CANVAS && ctx === s.frontCtx && s.backCtx && s.backCtx !== s.frontCtx) {
        try {
          const src = s.frontCtx?.canvas;
          const dst = s.backCtx?.canvas;
          if (src && dst && src.width > 0 && src.height > 0 && dst.width > 0 && dst.height > 0) {
            d.R.resetCtx(s.backCtx);
            d.R.withDeviceSpace(s.backCtx, () => {
              s.backCtx.clearRect(0, 0, dst.width, dst.height);
              s.backCtx.drawImage(
                src,
                0, 0, src.width, src.height,
                0, 0, dst.width, dst.height
              );
            });
            if (typeof window !== 'undefined' && window.__DG_RANDOM_TRACE_VERBOSE && reason && String(reason).includes('random')) {
              const payload = {
                panelId: s.panel?.id || null,
                reason,
                copied: true,
                srcRole: src.getAttribute?.('data-role') || null,
                dstRole: dst.getAttribute?.('data-role') || null,
                srcSize: { w: src.width, h: src.height, cssW: src.style?.width || null, cssH: src.style?.height || null },
                dstSize: { w: dst.width, h: dst.height, cssW: dst.style?.width || null, cssH: dst.style?.height || null },
              };
              console.log('[DG][random][sync]', JSON.stringify(payload));
            }
          }
        } catch {}
      }

      d.regenerateMapFromStrokes?.();
      try { (s.panel?.__dgUpdateButtons || d.updateGeneratorButtons || function(){})() } catch (e) { }
      d.syncLetterFade?.();
      d.__dgMarkSingleCanvasDirty?.(s.panel);
      if (s.DG_SINGLE_CANVAS) {
        try { d.compositeSingleCanvas?.(); } catch {}
      }
      if (!s.DG_SINGLE_CANVAS && s.usingBackBuffers) {
        s.pendingPaintSwap = true;
        d.requestFrontSwap?.();
      }
      d.markPaintDirty?.();
      d.__dgPaintDebugLog?.('clearAndRedrawFromStrokes', {
        reason: reason || null,
        ctxRole: ctx?.canvas?.getAttribute?.('data-role') || null,
        ctxW: ctx?.canvas?.width || 0,
        ctxH: ctx?.canvas?.height || 0,
      });
      d.dgPaintTrace?.('clearAndRedrawFromStrokes:exit');
    });
  }

  function drawIntoBackOnly(includeCurrentStroke = false) {
    if (!s.backCtx || !s.cssW || !s.cssH) return;
    clearAndRedrawFromStrokes(s.backCtx, 'zoom-recompute-back');
    if (includeCurrentStroke && s.cur && Array.isArray(s.cur.pts) && s.cur.pts.length > 0) {
      d.drawFullStroke?.(s.backCtx, s.cur);
    }
    d.__dgMarkSingleCanvasDirty?.(s.panel);
    if (!s.DG_SINGLE_CANVAS) {
      s.pendingPaintSwap = true;
    }
  }

  return {
    clearAndRedrawFromStrokes,
    drawIntoBackOnly,
  };
}
