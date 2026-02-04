// src/drawgrid/dg-paint-snapshot.js
// Paint snapshot helpers (capture/restore).

export function createDgPaintSnapshot({ state, deps } = {}) {
  const s = state;
  const d = deps;

  function capturePaintSnapshot() {
    try {
      const snapSrc = (s.DG_SINGLE_CANVAS && s.backCanvas) ? s.backCanvas : s.paint;
      if (snapSrc && snapSrc.width > 0 && snapSrc.height > 0) {
        const snap = document.createElement('canvas');
        snap.width = snapSrc.width;
        snap.height = snapSrc.height;
        snap.getContext('2d')?.drawImage(snapSrc, 0, 0);
        return {
          canvas: snap,
          dpr: (Number.isFinite(s.paintDpr) && s.paintDpr > 0) ? s.paintDpr : null,
        };
      }
    } catch {}
    return null;
  }

  function restorePaintSnapshot(snap) {
    if (!snap) return;
    try {
      d.updatePaintBackingStores({ target: s.usingBackBuffers ? 'back' : 'both' });
      s.pctx = d.getActivePaintCtx();
      if (!s.pctx) {
        try {
          const active = d.getActivePaintCanvas?.();
          console.warn('[DG][ink] NO paint ctx', {
            id: s.panel.id,
            usingBackBuffers: s.usingBackBuffers,
            cssW: s.cssW, cssH: s.cssH,
            paintDpr: s.paintDpr,
            activeRole: active?.getAttribute?.('data-role') || active?.id || null,
            activeW: active?.width || null,
            activeH: active?.height || null,
          });
        } catch {}
      }

      const snapCanvas = snap?.canvas || snap;
      const snapDpr = (snap && typeof snap === 'object' && 'dpr' in snap) ? snap.dpr : null;
      const dprMismatch =
        Number.isFinite(snapDpr) &&
        Number.isFinite(s.paintDpr) &&
        Math.abs(snapDpr - s.paintDpr) > 1e-3;
      if (dprMismatch && Array.isArray(s.strokes) && s.strokes.length > 0) {
        // Avoid scaling old pixels across DPR changes; redraw from strokes for correct scale.
        try { d.clearAndRedrawFromStrokes(null, 'paintSnapshot-skip:dpr:zoom-recompute'); } catch {}
        return;
      }
      if (!snapCanvas) return;
      d.resetPaintBlend(s.pctx);
      d.R.clearCanvas(s.pctx);
      d.emitDG('paint-clear', { reason: 'restore-snapshot' });
      d.R.resetCtx(s.pctx);
      d.R.resetCtx(s.pctx);
      d.R.withLogicalSpace(s.pctx, () => {
        s.pctx.drawImage(snapCanvas, 0, 0, snapCanvas.width, snapCanvas.height, 0, 0, s.cssW, s.cssH);
        d.markPaintDirty();
      });
    } catch {}
  }

  return { capturePaintSnapshot, restorePaintSnapshot };
}
