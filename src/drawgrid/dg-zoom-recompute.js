// src/drawgrid/dg-zoom-recompute.js
// Zoom recompute helper for DrawGrid.

export function createDgZoomRecompute({ state, deps } = {}) {
  const s = state || {};
  const d = deps || {};

  function scheduleZoomRecompute() {
    if (s.zoomRAF) return;
    s.zoomRAF = requestAnimationFrame(() => {
      s.zoomRAF = 0;
      try {
        if (window.__ZOOM_COMMIT_PHASE) return;
      } catch {}
      // IMPORTANT:
      // If zoom recompute changes paintDpr but we do not resize the overlay backing stores,
      // the next draw will apply a different logical transform and nodes/connectors/text
      // can "jump" sometime after the zoom ends.
      {
        const deviceDpr = Math.max(1, Number.isFinite(window?.devicePixelRatio) ? window.devicePixelRatio : 1);
        const visualMul = d.__dgComputeVisualBackingMul(Number.isFinite(s.boardScale) ? s.boardScale : 1);
        const pressureMul = d.__dgGetPressureDprMul();
        // Prefer the most recent adaptive DPR (already includes non-gesture caps),
        // then apply size-based capping to avoid huge backing stores.
        let desiredDpr =
          (Number.isFinite(s.__dgAdaptivePaintDpr) && s.__dgAdaptivePaintDpr > 0)
            ? s.__dgAdaptivePaintDpr
            : Math.max(1, Math.min(deviceDpr, 3));
        const smallMul = d.__dgComputeSmallPanelBackingMul(s.cssW, s.cssH);
        desiredDpr = Math.min(deviceDpr, desiredDpr * visualMul * pressureMul * smallMul);
        // Keep ALL overlay surfaces in sync with the computed backing-store DPR.
        d.resizeSurfacesFor(s.cssW, s.cssH, desiredDpr, 'zoom-recompute');
        d.dgRefreshTrace?.('zoom-recompute', { cssW: s.cssW, cssH: s.cssH, desiredDpr, paintDpr: s.paintDpr, zoomMode: s.zoomMode });
      }
      s.pendingZoomResnap = false;

      // IMPORTANT:
      // Zoom recompute can rebuild/resize backing stores (and resnap can clear paint if it
      // thinks there's "no content"). In DrawGrid, the paint canvas may be the source of truth,
      // so we must preserve it across this path.
      const snap = d.capturePaintSnapshot?.();
      const hadInk = !!snap;
      const hadStrokes = Array.isArray(s.strokes) && s.strokes.length > 0;
      const hadNodes =
        s.currentMap &&
        Array.isArray(s.currentMap.nodes) &&
        s.currentMap.nodes.some((set) => set && set.size > 0);

      d.useBackBuffers?.();
      d.updatePaintBackingStores?.({ force: true, target: 'back' });

      // If paint is non-empty but there are no reconstructible sources, never clear it here.
      // ALSO: during gesture zoom/pan, a blank toy may still have a live ghost trail. Preserving avoids
      // the "resnap-empty -> clear" path, which would cut the trail.
      const __ghostNonEmpty = s.panel && s.panel.__dgGhostLayerEmpty === false;
      const __preserveBlankDuringZoom =
        (hadInk && !hadStrokes && !hadNodes) ||
        (!hadStrokes && !hadNodes && (d.getGhostGuideAutoActive?.() || __ghostNonEmpty));

      if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
        d.dgGhostTrace?.('zoom:recompute:resnap', {
          preserveBlankDuringZoom: __preserveBlankDuringZoom,
          hadInk,
          hadStrokes,
          hadNodes,
          ghostNonEmpty: __ghostNonEmpty,
          ghostAutoActive: d.getGhostGuideAutoActive?.(),
          zoomMode: s.zoomMode,
        });
      }

      d.resnapAndRedraw?.(true, { preservePaintIfNoStrokes: __preserveBlankDuringZoom });

      // After backing-store churn, restore paint if it was our only source of truth.
      if (hadInk && !hadStrokes && !hadNodes) {
        d.restorePaintSnapshot?.(snap);
      }
      d.drawIntoBackOnly?.();
      s.pendingSwap = true;
    });
  }

  return {
    scheduleZoomRecompute,
  };
}
