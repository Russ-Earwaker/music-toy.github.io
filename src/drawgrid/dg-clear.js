// src/drawgrid/dg-clear.js
// Clear/reset logic for DrawGrid.

export function createDgClear({ state, deps } = {}) {
  const s = state || {};
  const d = deps || {};

  function clearDrawgridInternal(options = {}) {
    const opts = (options && typeof options === 'object') ? options : {};
    const user = !!opts.user;
    const reason = typeof opts.reason === 'string' ? opts.reason : 'api.clear';
    const guardActive = !!s.DG_HYDRATE?.guardActive;
    const inboundNonEmpty = (typeof d.inboundWasNonEmpty === 'function') ? d.inboundWasNonEmpty() : false;
    // If a programmatic clear lands on a toy that already has strokes/nodes,
    // veto it unless detail.user === true. This prevents unintended wipes.
    if (!opts.user) {
      const hasStrokes = Array.isArray(s.strokes) && s.strokes.length > 0;
      const hasActiveCols = s.currentMap?.active?.some(Boolean);
      if (hasStrokes || hasActiveCols) {
        d.dgTraceWarn?.('[drawgrid][CLEAR][VETO] programmatic clear blocked on non-empty toy', {
          reason,
          hasStrokes,
          hasActiveCols,
        });
        return false;
      }
    }
    // If we're already empty and the ghost guide is currently sweeping, avoid a redundant
    // clear that would stop/restart the guide and cut its trail mid-path.
    if (!user) {
      const alreadyEmpty = !(Array.isArray(s.strokes) && s.strokes.length > 0) && !(s.currentMap?.active?.some(Boolean));
      if (alreadyEmpty && d.getGhostGuideRunning?.()) {
        d.dgGhostTrace?.('clear:no-op', {
          id: s.panel?.id || null,
          reason,
          running: d.getGhostGuideRunning?.(),
          autoActive: d.getGhostGuideAutoActive?.(),
          stack: d.__dgGhostMaybeStack?.('DG clearDrawgridInternal:no-op'),
        });
        // Still ensure the empty-state guide is active.
        if (!d.getGhostGuideAutoActive?.()) {
          d.startAutoGhostGuide?.({ immediate: true, reason: 'clear:no-op:ensure-empty' });
        }
        return true;
      }
    }
    let stackSnippet = null;
    try {
      stackSnippet = (new Error('clear-call')).stack?.split('\n').slice(0, 6).join('\n');
    } catch {}
    const clearLog = {
      reason,
      user,
      guardActive,
      pendingUserClear: s.DG_HYDRATE?.pendingUserClear,
      inboundNonEmpty,
      stack: stackSnippet,
    };
    if (!user && (guardActive || inboundNonEmpty)) {
      d.dgTraceWarn?.('[drawgrid][CLEAR][VETO] blocked programmatic clear', clearLog);
      return false;
    }
    if (user) {
      d.dgTraceLog?.('[drawgrid][CLEAR] user', clearLog);
      if (s.DG_HYDRATE) s.DG_HYDRATE.pendingUserClear = true;
      d.markUserChange?.('user-clear', { reason });
    } else {
      d.dgTraceWarn?.('[drawgrid][CLEAR] programmatic', clearLog);
    }
    const makeFlowCtx = () => ({
      panel: s.panel,
      paint: s.paint,
      backCanvas: s.backCanvas,
      flashCanvas: s.flashCanvas,
      flashBackCanvas: s.flashBackCanvas,
      activeFlashCanvas: (typeof d.getActiveFlashCanvas === 'function') ? d.getActiveFlashCanvas() : null,
      strokes: s.strokes,
      usingBackBuffers: s.usingBackBuffers,
      paintRev: s.__dgPaintRev,
      compositeDirty: s.panel?.__dgSingleCompositeDirty,
      hasOverlayStrokesCached: s.hasOverlayStrokesCached,
    });
    d.FD?.flowState?.('clear:start', makeFlowCtx());
    d.R.clearCanvas(s.pctx);
    // Clear both paint buffers to prevent stale composites.
    try { if (s.backCtx && s.pctx !== s.backCtx) d.R.clearCanvas(s.backCtx); } catch {}
    try { if (s.frontCtx && s.pctx !== s.frontCtx) d.R.clearCanvas(s.frontCtx); } catch {}
    d.emitDG?.('paint-clear', { reason: 'pre-redraw' });
    d.R.clearCanvas(s.nctx);
    const flashSurface = d.getActiveFlashCanvas?.();
    const __flashDpr = d.__dgGetCanvasDprFromCss?.(flashSurface, s.cssW, s.paintDpr);
    d.R.resetCtx(s.fctx);
    d.__dgWithLogicalSpaceDpr(d.R, s.fctx, __flashDpr, () => {
      const { x, y, w, h } = d.R.getOverlayClearRect({
        canvas: flashSurface,
        pad: d.R.getOverlayClearPad(),
        allowFull: !!s.panel.__dgFlashOverlayOutOfGrid,
        gridArea: s.gridArea,
      });
      s.fctx.clearRect(x, y, w, h);
      d.emitDG?.('overlay-clear', { reason: 'pre-redraw' });
    });
    try {
      if (s.flashBackCtx && s.flashBackCtx !== s.fctx) {
        d.R.resetCtx(s.flashBackCtx);
        d.R.withLogicalSpace(s.flashBackCtx, () => {
          const { x, y, w, h } = d.R.getOverlayClearRect({
            canvas: s.flashBackCtx.canvas,
            pad: d.R.getOverlayClearPad(),
            allowFull: !!s.panel.__dgFlashOverlayOutOfGrid,
            gridArea: s.gridArea,
          });
          s.flashBackCtx.clearRect(x, y, w, h);
        });
      }
      if (s.flashFrontCtx && s.flashFrontCtx !== s.fctx) {
        d.R.resetCtx(s.flashFrontCtx);
        d.R.withLogicalSpace(s.flashFrontCtx, () => {
          const { x, y, w, h } = d.R.getOverlayClearRect({
            canvas: s.flashFrontCtx.canvas,
            pad: d.R.getOverlayClearPad(),
            allowFull: !!s.panel.__dgFlashOverlayOutOfGrid,
            gridArea: s.gridArea,
          });
          s.flashFrontCtx.clearRect(x, y, w, h);
        });
      }
    } catch {}
    try { d.markFlashLayerCleared?.(); } catch {}
    s.panel.__dgFlashOverlayOutOfGrid = false;
    s.__dgOverlayStrokeListCache = { paintRev: -1, len: 0, special: [], colorized: [], outOfGrid: false };
    s.__dgOverlayStrokeCache = { value: false, len: 0, ts: 0 };
    s.strokes = [];
    s.prevStrokeCount = 0;
    s.manualOverrides = Array.from({ length: s.cols }, () => new Set());
    s.persistentDisabled = Array.from({ length: s.cols }, () => new Set());
    const emptyMap = { active: Array(s.cols).fill(false), nodes: Array.from({ length: s.cols }, () => new Set()), disabled: Array.from({ length: s.cols }, () => new Set()) };
    s.currentMap = emptyMap;
    if (Array.isArray(s.nodeCoordsForHitTest)) {
      s.nodeCoordsForHitTest = [];
    }
    if ('draggedNode' in s) {
      s.draggedNode = null;
    }
    d.emitDrawgridUpdate?.({ activityOnly: false });
    d.drawGrid?.();
    s.nextDrawTarget = null; // Disarm any pending line draw
    d.updateGeneratorButtons?.(); // Refresh button state to "Draw"
    // IMPORTANT: if a transient programmatic clear lands while the guide is sweeping,
    // preserve its trail to avoid visible cut-outs.
    d.stopAutoGhostGuide?.({ immediate: false, reason: 'clear:end', preserveTrail: true });
    // Restart/ensure the empty-state guide.
    if (!d.getGhostGuideAutoActive?.()) {
      d.startAutoGhostGuide?.({ immediate: true, reason: 'clear:empty' });
    }
    s.drawLabelState.hasDrawnFirstLine = false;
    d.updateDrawLabel?.(true);
    s.noteEffects?.reset?.();
    d.__dgMarkSingleCanvasDirty?.(s.panel);
    if (s.DG_SINGLE_CANVAS && s.isPanelVisible) {
      try { d.compositeSingleCanvas?.(); } catch {}
      s.panel.__dgSingleCompositeDirty = false;
    }
    d.FD?.flowState?.('clear:end', makeFlowCtx());
    return true;
  }

  return {
    clearDrawgridInternal,
  };
}
