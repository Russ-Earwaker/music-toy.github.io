// src/drawgrid/dg-zoom-handler.js
// Zoom handling for DrawGrid.

export function createDgZoomHandler({ state, deps } = {}) {
  const s = state || {};
  const d = deps || {};

  function handleZoom(z = {}) {
    s.__lastZoomEventTs = d.nowMs();
    d.noteZoomMotion?.(z);
    d.__auditZoomSizes?.('zoom-change');
    const phase = z?.phase;
    const mode = z?.mode;
    // Keep pctx aligned with current buffer choice to avoid drawing into stale back buffers.
    try {
      if (s.usingBackBuffers && s.pctx !== s.backCtx) s.pctx = s.backCtx;
      if (!s.usingBackBuffers && s.pctx !== s.frontCtx) s.pctx = s.frontCtx;
    } catch {}
    d.__dgPaintDebugLog?.('zoom-phase', {
      phase: phase || null,
      mode: mode || s.zoomMode || null,
      currentScale: z?.currentScale ?? null,
      targetScale: z?.targetScale ?? null,
    });
    try {
      if (typeof window !== 'undefined' && window.__DG_ZOOM_COMMIT_TRACE) {
        const isCommitLike =
          phase === 'freeze' ||
          phase === 'recompute' ||
          phase === 'swap' ||
          phase === 'done' ||
          phase === 'commit' ||
          phase === 'idle';
        if (isCommitLike) {
          const active = (typeof d.getActivePaintCanvas === 'function') ? d.getActivePaintCanvas() : null;
          const ctx = (typeof d.getActivePaintCtx === 'function') ? d.getActivePaintCtx() : null;
          const payload = {
            panelId: s.panel?.id || null,
            phase: phase || null,
            mode: mode || s.zoomMode || null,
            currentScale: z?.currentScale ?? null,
            targetScale: z?.targetScale ?? null,
            usingBackBuffers: s.usingBackBuffers,
            paintDpr: s.paintDpr,
            cssW: s.cssW,
            cssH: s.cssH,
            pctxRole: s.pctx?.canvas?.getAttribute?.('data-role') || null,
            ctxRole: ctx?.canvas?.getAttribute?.('data-role') || null,
            activeRole: active?.getAttribute?.('data-role') || null,
            frontW: s.frontCanvas?.width || 0,
            frontH: s.frontCanvas?.height || 0,
            backW: s.backCanvas?.width || 0,
            backH: s.backCanvas?.height || 0,
          };
          console.log('[DG][zoom] phase', JSON.stringify(payload));
        }
      }
    } catch {}
    if (mode) {
      s.zoomMode = mode;
    }
    const currentlyGesturing = s.zoomMode === 'gesturing';
    if (currentlyGesturing && !s.__zoomActive) {
      s.__zoomActive = true;
      d.markZoomActive?.();
      s.zoomGestureActive = true;
      try { s.dgViewport?.setNonReactive?.(true); } catch {}
    } else if (!currentlyGesturing && !phase && s.__zoomActive && s.zoomMode === 'idle') {
      s.suppressHeaderPushUntil = d.nowMs() + s.HEADER_PUSH_SUPPRESS_MS;
      d.releaseZoomFreeze?.({ reason: 'mode-idle', zoomPayload: z });
    } else {
      s.zoomGestureActive = currentlyGesturing;
    }

    if (phase === 'begin') {
      if (!s.__zoomActive) {
        s.__zoomActive = true;
        s.zoomGestureActive = true;
        d.markZoomActive?.();
      }
      try { s.dgViewport?.setNonReactive?.(true); } catch {}
      const beginScale = Number.isFinite(z?.currentScale) ? z.currentScale : (Number.isFinite(z?.targetScale) ? z.targetScale : null);
      d.dglog?.('zoom:begin', { scale: beginScale });
      s.suppressHeaderPushUntil = d.nowMs() + s.HEADER_PUSH_SUPPRESS_MS;
      return;
    }

    if (phase === 'commit' || phase === 'idle' || phase === 'done') {
      d.markLayoutSizeDirty?.();
      try { s.particles?.snapAllToHomes?.(); } catch {}
      s.suppressHeaderPushUntil = d.nowMs() + s.HEADER_PUSH_SUPPRESS_MS;

      // Let ZoomCoordinator know we're done with the freeze,
      // but only request a heavy layout on 'done'.
      d.releaseZoomFreeze?.({
        reason: `phase-${phase}`,
        refreshLayout: phase === 'done',
        zoomPayload: z,
      });

      if (phase === 'done') {
        // Avoid restoring paint snapshots after zoom settle; redraw from strokes instead.
        // Set count > 1 because both ensureSizeReady and layout can attempt a restore.
        s.__dgSkipPaintSnapshotCount = Math.max(s.__dgSkipPaintSnapshotCount || 0, 2);
        // Ensure we end commit on front buffers so paint isn't stuck scaled in back buffers.
        try { d.useFrontBuffers?.(); } catch {}
        // Only do heavy layout + field resize once commit fully settles.
        try { d.layout?.(true); } catch {}
        try { s.dgField?.resize?.(); } catch {}
        s.layoutSizeDirty = true;
        d.ensureSizeReady?.({ force: true });
        const zoomSnapshot = d.extractZoomSnapshot?.(z);
        const doneScale = Number.isFinite(zoomSnapshot?.scale) ? zoomSnapshot.scale : null;
        const scaleChanged =
          Number.isFinite(doneScale) &&
          (!Number.isFinite(s.__dgLastZoomDoneScale) || Math.abs(doneScale - s.__dgLastZoomDoneScale) > 1e-4) &&
          (Number.isFinite(s.lastCommittedScale) ? Math.abs(doneScale - s.lastCommittedScale) > 1e-4 : true);
        if (Number.isFinite(doneScale)) {
          s.__dgLastZoomDoneScale = doneScale;
        }
        const dprChanged =
          Number.isFinite(s.paintDpr) && s.paintDpr > 0 &&
          (!Number.isFinite(s.__dgLastZoomDonePaintDpr) || Math.abs(s.paintDpr - s.__dgLastZoomDonePaintDpr) > 1e-6);
        if (Number.isFinite(s.paintDpr) && s.paintDpr > 0) {
          s.__dgLastZoomDonePaintDpr = s.paintDpr;
        }
        const hasStrokes = Array.isArray(s.strokes) && s.strokes.length > 0;
        const hasNodes = !!(s.currentMap && Array.isArray(s.currentMap.nodes) && s.currentMap.nodes.some((set) => set && set.size > 0));
        // IMPORTANT:
        // Our "scaleChanged" heuristic looks at the camera scale, but the paint backing-store DPR can
        // still change independently (visual/pressure/small multipliers). When that happens, we MUST
        // redraw the paint stroke layer into the new logical space, otherwise the solid (paint) line
        // can appear to "scale up" while the animated overlay remains correct.
        if ((scaleChanged || dprChanged) && (hasStrokes || hasNodes)) {
          try {
            if (typeof window !== 'undefined' && window.__DG_ZOOM_COMMIT_TRACE) {
              const payload = {
                panelId: s.panel?.id || null,
                hasStrokes,
                hasNodes,
                dprChanged,
                usingBackBuffers: s.usingBackBuffers,
                paintDpr: s.paintDpr,
                cssW: s.cssW,
                cssH: s.cssH,
                pctxRole: s.pctx?.canvas?.getAttribute?.('data-role') || null,
                frontW: s.frontCanvas?.width || 0,
                frontH: s.frontCanvas?.height || 0,
                backW: s.backCanvas?.width || 0,
                backH: s.backCanvas?.height || 0,
              };
              console.log('[DG][zoom] done:redraw', JSON.stringify(payload));
            }
          } catch {}
          if (hasStrokes) {
            // IMPORTANT: redraw into the currently visible paint buffer.
            // (Don't force backCtx in single-canvas mode unless back buffers are enabled.)
            try { d.clearAndRedrawFromStrokes?.(s.usingBackBuffers ? s.backCtx : s.frontCtx, 'zoom-done'); } catch {}
            // If we're in a zoom commit and render onto back, force a front swap so paint is visible.
            try {
              if (s.usingBackBuffers && typeof d.requestFrontSwap === 'function') {
                d.requestFrontSwap(d.useFrontBuffers);
              }
            } catch {}
            d.__dgPaintDebugLog?.('zoom-done:redraw', {
              hasStrokes,
              hasNodes,
            });
          } else {
            // No strokes, but we still need static layers to match the new zoom basis.
            try { d.drawNodes?.(s.currentMap.nodes); } catch {}
            try { d.drawGrid?.(); } catch {}
          }
          try { d.ensureBackVisualsFreshFromFront?.(); } catch {}
          try { d.markStaticDirty?.('zoom-done'); } catch {}
          s.__dgForceFullDrawNext = true;
          // In single-canvas mode, ensure we composite immediately so the
          // toy doesn't appear blank/mis-scaled
          // until the next camera move triggers a redraw.
          if (s.DG_SINGLE_CANVAS && s.isPanelVisible) {
            try { d.compositeSingleCanvas?.(); } catch {}
            try { s.panel.__dgSingleCompositeDirty = false; } catch {}
          }
        }

        // BUGFIX: prevent delayed "snap later" jumps after zoom/pan.
        // resnapAndRedraw() can defer while zoomMode==='gesturing' and set pendingZoomResnap.
        // If we leave that flag set, it will apply later (RO/layout timer/etc.) and the
        // nodes/connectors/text appear to "jump" after the zoom ends.
        try {
          const hadPending = s.pendingZoomResnap || s.pendingResnapOnVisible;
          if (hadPending) {
            d.dgRefreshTrace?.('zoom-done:apply-pending-resnap', { pendingZoomResnap: s.pendingZoomResnap, pendingResnapOnVisible: s.pendingResnapOnVisible });
            s.pendingZoomResnap = false;
            s.pendingResnapOnVisible = false;
            // Ensure resnap executes immediately and is not blocked by gesturing state.
            s.zoomMode = 'idle';
            s.zoomGestureActive = false;
            // IMPORTANT:
            // After a gesture ends, a blank toy can still have a live ghost trail (auto guide).
            // If we run the "resnap-empty -> clearDrawgridInternal" path here, it will cut the trail.
            const __hasStrokes = Array.isArray(s.strokes) && s.strokes.length > 0;
            const __hasNodes =
              !!(s.currentMap && Array.isArray(s.currentMap.nodes) && s.currentMap.nodes.some((set) => set && set.size > 0));
            const __hasAnyPaint = ((s.__dgPaintRev | 0) > 0) || d.hasOverlayStrokesCached?.();
            const __ghostNonEmpty = s.panel && s.panel.__dgGhostLayerEmpty === false;
            const __preserveBlankDuringDoneResnap =
              (!__hasStrokes && !__hasNodes) && (d.getGhostGuideAutoActive?.() || __ghostNonEmpty || !__hasAnyPaint);
            if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
              d.dgGhostTrace?.('zoom:done:pending-resnap', {
                preserveBlankDuringDoneResnap: __preserveBlankDuringDoneResnap,
                hasStrokes: __hasStrokes,
                hasNodes: __hasNodes,
                hasAnyPaint: __hasAnyPaint,
                ghostNonEmpty: __ghostNonEmpty,
                ghostAutoActive: d.getGhostGuideAutoActive?.(),
                zoomMode: s.zoomMode,
              });
            }
            d.resnapAndRedraw?.(true, { preservePaintIfNoStrokes: __preserveBlankDuringDoneResnap });
          }
        } catch {}
      }

      return;
    }
  }

  return {
    handleZoom,
  };
}
