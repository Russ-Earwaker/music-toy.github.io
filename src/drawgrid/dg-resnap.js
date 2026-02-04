// src/drawgrid/dg-resnap.js
// Resnap + redraw helper for drawgrid.

export function createDgResnap({ state, deps } = {}) {
  const s = state;
  const d = deps;

  function resnapAndRedraw(forceLayout = false, opts = {}) {
    const preservePaintIfNoStrokes = !!opts.preservePaintIfNoStrokes;
    const skipLayout = !!opts.skipLayout;
    d.dgRefreshTrace('resnap', {
      forceLayout,
      skipLayout,
      preservePaintIfNoStrokes,
      zoomMode: s.zoomMode,
      isPanelVisible: s.isPanelVisible,
    });
    if (s.zoomMode === 'gesturing' && !forceLayout) {
      d.dgRefreshTrace('resnap:defer gesturing');
      s.pendingZoomResnap = true;
      return;
    }
    if (!s.isPanelVisible && !forceLayout) {
      d.dgRefreshTrace('resnap:defer not visible');
      s.pendingResnapOnVisible = true;
      return;
    }

    const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (!forceLayout && (nowTs - s.lastResnapTs) < 50) {
      // Too soon; coalesce into a single resnap after the cooldown.
      s.pendingResnapOnVisible = true;
      return;
    }
    s.lastResnapTs = nowTs;

    const hasStrokes = Array.isArray(s.strokes) && s.strokes.length > 0;
    const hasNodes =
      s.currentMap &&
      Array.isArray(s.currentMap.nodes) &&
      s.currentMap.nodes.some(set => set && set.size > 0);

    d.syncLetterFade({ immediate: true });

    // Layout policy:
    // - Most callers should allow layout.
    // - Some callers (e.g. focus/DOM normalize) request skipLayout to avoid forced sync reads.
    // - HOWEVER: after refresh/boot and after RO size changes, we *must* run layout at least once,
    //   otherwise overlay canvases (grid/ghost/playhead) can keep stale backing sizes and appear to
    //   "scale wrong" or disappear until some other event triggers a full resnap.
    const needLayout =
      !!forceLayout ||
      !skipLayout ||
      !!s.layoutSizeDirty ||
      s.zoomMode === 'committing';

    if (needLayout) {
      d.layout(!!forceLayout);
    } else if (s.cssW <= 0 || s.cssH <= 0) {
      // Safety: if somehow we have no valid backing size, force a one-off layout.
      d.layout(true);
    }

    requestAnimationFrame(() => {
      if (!s.panel.isConnected) return;
      s.__dgNeedsUIRefresh = true;
      s.__dgStableFramesAfterCommit = 0;

      if (hasStrokes) {
        d.FD.markRegenSource('resnap');
        d.regenerateMapFromStrokes();
        d.R.resetCtx(s.pctx);
        d.__dgWithLogicalSpace(s.pctx, () => {
          d.R.clearCanvas(s.pctx);
          d.emitDG('paint-clear', { reason: 'resnap-redraw' });
          for (const stroke of s.strokes) {
            d.drawFullStroke(s.pctx, stroke, { skipReset: true, skipTransform: true });
          }
        });
        if (s.DG_SINGLE_CANVAS) {
          d.__dgMarkSingleCanvasDirty(s.panel);
          try { d.compositeSingleCanvas(); } catch {}
          s.panel.__dgSingleCompositeDirty = false;
        }
        d.updateGeneratorButtons();
        return;
      }

      if (hasNodes) {
        d.drawGrid();
        d.drawNodes(s.currentMap.nodes);
        if (s.DG_SINGLE_CANVAS) {
          d.__dgMarkSingleCanvasDirty(s.panel);
          try { d.compositeSingleCanvas(); } catch {}
          s.panel.__dgSingleCompositeDirty = false;
        }
        d.emitDrawgridUpdate({ activityOnly: false });
        d.updateGeneratorButtons();
        return;
      }

      const inboundNonEmpty = d.inboundWasNonEmpty();
      if (preservePaintIfNoStrokes) {
        // IMPORTANT: even when preserving paint state (blank / no-strokes toys),
        // we still need baseline visuals to be correct after refresh/zoom commit:
        // - grid background should be redrawn
        // - ghost guide should use the current layout backing size (otherwise it can "stick" at 1x)
        // - single-canvas composite must be refreshed so the user sees something immediately
        d.dgTraceWarn('[drawgrid][resnap] preserve paint (no strokes/nodes)', {
          guardActive: d.DG_HYDRATE.guardActive,
          inboundNonEmpty,
        });

        try { d.drawGrid(); } catch {}
        try { if (d.getGhostGuideAutoActive()) d.runAutoGhostGuideSweep(); } catch {}

        if (s.DG_SINGLE_CANVAS) {
          d.__dgMarkSingleCanvasDirty(s.panel);
          try { d.compositeSingleCanvas(); } catch {}
          s.panel.__dgSingleCompositeDirty = false;
        }

        d.updateGeneratorButtons();
        return;
      }
      if (!inboundNonEmpty && !d.DG_HYDRATE.guardActive) {
        d.clearDrawgridInternal({ reason: 'resnap-empty' });
      } else {
        d.dgTraceWarn('[drawgrid][boot] skip clear', {
          reason: 'resnap-empty',
          guardActive: d.DG_HYDRATE.guardActive,
          inboundNonEmpty,
        });
      }
      d.updateGeneratorButtons();
    });
  }

  return { resnapAndRedraw };
}
