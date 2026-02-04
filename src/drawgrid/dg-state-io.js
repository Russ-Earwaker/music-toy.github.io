// src/drawgrid/dg-state-io.js
// Capture/restore state helpers for DrawGrid.

export function createDgStateIo({ state, deps } = {}) {
  const s = state || {};
  const d = deps || {};

  function applyInstrumentFromState(value, { emitEvents = true } = {}) {
    const resolved = (typeof value === 'string') ? value.trim() : '';
    if (!resolved) return false;
    const prev = s.panel?.dataset?.instrument || '';
    const changed = prev !== resolved;
    if (s.panel?.dataset) {
      s.panel.dataset.instrument = resolved;
      s.panel.dataset.instrumentPersisted = '1';
    }
    if (changed && emitEvents) {
      try { s.panel?.dispatchEvent?.(new CustomEvent('toy-instrument', { detail: { value: resolved }, bubbles: true })); } catch {}
      try { s.panel?.dispatchEvent?.(new CustomEvent('toy:instrument', { detail: { name: resolved, value: resolved }, bubbles: true })); } catch {}
    }
    return changed;
  }

  function captureState() {
    try {
      const serializeSetArr = (arr) => Array.isArray(arr) ? arr.map((set) => Array.from(set || [])) : [];
      const serializeNodes = (arr) => Array.isArray(arr) ? arr.map((set) => Array.from(set || [])) : [];
      const normPt = (p) => {
        try {
          const nx = (s.gridArea.w > 0) ? (p.x - s.gridArea.x) / s.gridArea.w : 0;
          const gh = Math.max(1, s.gridArea.h - s.topPad);
          const ny = gh > 0 ? (p.y - (s.gridArea.y + s.topPad)) / gh : 0;
          return { nx, ny };
        } catch { return { nx: 0, ny: 0 }; }
      };
      return {
        steps: s.cols | 0,
        autotune: !!s.autoTune,
        instrument: s.panel?.dataset?.instrument || undefined,
        strokes: (s.strokes || []).map((stroke) => ({
          ptsN: Array.isArray(stroke.pts) ? stroke.pts.map(normPt) : [],
          color: stroke.color,
          isSpecial: !!stroke.isSpecial,
          generatorId: (typeof stroke.generatorId === 'number') ? stroke.generatorId : undefined,
          overlayColorize: !!stroke.overlayColorize,
        })),
        nodes: {
          active: (s.currentMap?.active && Array.isArray(s.currentMap.active)) ? s.currentMap.active.slice() : Array(s.cols).fill(false),
          disabled: serializeSetArr(s.persistentDisabled || []),
          list: serializeNodes(s.currentMap?.nodes || []),
          groups: (s.nodeGroupMap || []).map((map) => map instanceof Map ? Array.from(map.entries()) : []),
        },
        manualOverrides: Array.isArray(s.manualOverrides) ? s.manualOverrides.map((set) => Array.from(set || [])) : [],
      };
    } catch (e) {
      return { steps: s.cols | 0, autotune: !!s.autoTune };
    }
  }

  function restoreFromState(state) {
    const prevRestoring = s.isRestoring;
    s.isRestoring = true;
    if (state && typeof state.instrument === 'string') {
      applyInstrumentFromState(state.instrument, { emitEvents: true });
    }
    const hasStrokes = Array.isArray(state?.strokes) && state.strokes.length > 0;
    const hasActiveNodes = Array.isArray(state?.nodes?.active) && state.nodes.active.some(Boolean);
    const hasNodeList = Array.isArray(state?.nodes?.list) && state.nodes.list.some((arr) => Array.isArray(arr) && arr.length > 0);
    try {
      const stats = {
        strokes: Array.isArray(state?.strokes) ? state.strokes.length : 0,
        nodeCount: d.computeSerializedNodeStats?.(state?.nodes?.list, state?.nodes?.disabled).nodeCount,
        activeCols: Array.isArray(state?.nodes?.active) ? state.nodes.active.filter(Boolean).length : 0,
      };
      const stack = (new Error('restore-state')).stack?.split('\n').slice(0, 6).join('\n');
      d.dgTraceLog?.('[drawgrid][RESTORE] requested', { panelId: s.panel?.id, stats, stack });
    } catch {}
    d.updateHydrateInboundFromState?.(state, { reason: 'restoreFromState', panelId: s.panel?.id });
    if (!hasStrokes && !hasActiveNodes && !hasNodeList) {
      s.isRestoring = prevRestoring;
      return;
    }
    try {
      d.R.clearCanvas(s.pctx);
      d.emitDG?.('paint-clear', { reason: 'restore-state' });
      d.R.clearCanvas(s.nctx);
      const flashSurface = d.getActiveFlashCanvas?.();
      const __flashDpr = d.__dgGetCanvasDprFromCss?.(flashSurface, s.cssW, s.paintDpr);
      d.R.resetCtx(s.fctx);
      d.__dgWithLogicalSpaceDpr(d.R, s.fctx, __flashDpr, () => {
        const { x, y, w, h } = d.R.getOverlayClearRect({
          canvas: flashSurface,
          pad: d.R.getOverlayClearPad(),
          allowFull: !!s.panel?.__dgFlashOverlayOutOfGrid,
          gridArea: s.gridArea,
        });
        s.fctx.clearRect(x, y, w, h);
        d.emitDG?.('overlay-clear', { reason: 'restore-state' });
      });

      const denormPt = (nx, ny) => {
        const gh = Math.max(1, s.gridArea.h - s.topPad);
        return {
          x: s.gridArea.x + nx * s.gridArea.w,
          y: s.gridArea.y + s.topPad + ny * gh,
        };
      };

      s.strokes = (state?.strokes || []).map((stroke) => {
        const ptsN = Array.isArray(stroke.ptsN) ? stroke.ptsN.map((pt) => ({
          nx: Math.max(0, Math.min(1, Number(pt?.nx) || 0)),
          ny: Math.max(0, Math.min(1, Number(pt?.ny) || 0)),
        })) : null;
        return {
          pts: (stroke.ptsN || []).map((pt) => denormPt(pt.nx || 0, pt.ny || 0)),
          __ptsN: ptsN,
          color: stroke.color,
          isSpecial: !!stroke.isSpecial,
          generatorId: (typeof stroke.generatorId === 'number') ? stroke.generatorId : undefined,
          overlayColorize: !!stroke.overlayColorize,
        };
      });

      d.FD?.markRegenSource?.('restore-state');
      d.FD?.markRegenSource?.('randomize');
      d.regenerateMapFromStrokes?.();
      s.currentMap = d.normalizeMapColumns?.(s.currentMap, s.cols);

      d.__dgWithLogicalSpace(s.pctx, () => {
        d.R.clearCanvas(s.pctx);
        for (const stroke of s.strokes) d.drawFullStroke?.(s.pctx, stroke, { skipReset: true, skipTransform: true });
      });

      s.__hydrationJustApplied = true;
      s.__dgHydrationPendingRedraw = true;
      d.HY?.scheduleHydrationLayoutRetry?.(s.panel, () => d.layout?.(true));
      setTimeout(() => { s.__hydrationJustApplied = false; }, 32);

      // IMPORTANT:
      // On refresh, zoom/overview boot can briefly report a *scaled* DOM rect (see debug: rectW/rectH)
      // while cssW/cssH are already correct. In that window, the single-canvas composite can miss a
      // guaranteed "final" swap, leaving the user seeing an empty body (grid hidden / stroke scale wrong)
      // until an interaction triggers a redraw.
      //
      // So: after hydration/restore, force a full draw + composite and a front swap deterministically.
      try {
        d.markStaticDirty?.('restore-from-state');
      } catch {}
      try {
        s.panel.__dgSingleCompositeDirty = true;
      } catch {}
      s.__dgNeedsUIRefresh = true;
      s.__dgFrontSwapNextDraw = true;
      s.__dgForceFullDrawNext = true;
      s.__dgForceFullDrawFrames = Math.max(s.__dgForceFullDrawFrames || 0, 8);

      d.ensurePostCommitRedraw?.('restoreFromState');
      try {
        if (typeof d.requestFrontSwap === 'function') {
          d.requestFrontSwap(d.useFrontBuffers);
        }
      } catch {}

      // Deterministically stabilize restore across the "overview settling" window.
      try { schedulePostRestoreStabilize('restoreFromState'); } catch {}
      d.emitDrawgridUpdate?.({ activityOnly: false });
      d.markStaticDirty?.('external-state-change');
    } catch (e) {
      d.emitDrawgridUpdate?.({ activityOnly: false });
    } finally {
      s.isRestoring = prevRestoring;
      s.__dgNeedsUIRefresh = true;
      s.__dgStableFramesAfterCommit = 0;
      try {
        const hasStrokesFinal = Array.isArray(s.strokes) && s.strokes.length > 0;
        const hasNodesFinal = Array.isArray(s.currentMap?.nodes)
          ? s.currentMap.nodes.some((set) => set && set.size > 0)
          : false;
        try {
          d.updateHydrateInboundFromState?.(captureState(), { reason: 'restore-from-state-applied', panelId: s.panel?.id });
        } catch {}

        if (hasStrokesFinal || hasNodesFinal) {
          d.schedulePersistState?.({ source: 'restore-from-state' });
        }
      } catch {
        // Ignore persist errors during hydration; keep prior local save intact.
      }
    }
  }

  // After hydration/restore, the app can spend a few frames "settling" overview/zoom/layout.
  // If we only resnap once, we can lock in a wrong basis (grid hidden / stroke scale wrong)
  // until the next interaction (camera move) forces a resnap. So: stabilize deterministically.
  function cancelPostRestoreStabilize() {
    if (s.__dgPostRestoreStabilizeRAF) {
      try { cancelAnimationFrame(s.__dgPostRestoreStabilizeRAF); } catch {}
      s.__dgPostRestoreStabilizeRAF = 0;
    }
  }
  function schedulePostRestoreStabilize(tag = 'post-restore') {
    cancelPostRestoreStabilize();
    let framesLeft = 12;     // hard cap: don't loop forever
    let stable = 0;          // need 2 stable frames in a row
    let lastKey = null;
    const step = () => {
      s.__dgPostRestoreStabilizeRAF = 0;
      if (!s.panel?.isConnected) return;
      try {
        // Force layout + redraw even if culling currently thinks we're not visible.
        // (This mirrors the "camera move fixes it" behavior, but deterministically.)
        try { d.layout?.(true); } catch {}
        try {
          const hasStrokes = Array.isArray(s.strokes) && s.strokes.length > 0;
          const hasNodes = Array.isArray(s.currentMap?.nodes)
            ? s.currentMap.nodes.some((set) => set && set.size > 0)
            : false;
          const hasAnyPaint = ((s.__dgPaintRev | 0) > 0) || d.hasOverlayStrokesCached?.();
          const ghostNonEmpty = s.panel && s.panel.__dgGhostLayerEmpty === false;
          // IMPORTANT: stabilize pass can run right after a gesture (pan/zoom) ends.
          // A blank toy may still have a live ghost trail; never let a resnap trigger the
          // "resnap-empty -> clearDrawgridInternal" path in that case.
          const preservePaintIfNoStrokes = (!hasStrokes && !hasNodes) && (d.getGhostGuideAutoActive?.() || ghostNonEmpty || !hasAnyPaint);
          if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
            d.dgGhostTrace?.('post-restore:stabilize-resnap', {
              preservePaintIfNoStrokes,
              hasStrokes,
              hasNodes,
              hasAnyPaint,
              ghostNonEmpty,
              ghostAutoActive: d.getGhostGuideAutoActive?.(),
            });
          }
          d.resnapAndRedraw?.(true, { preservePaintIfNoStrokes });
        } catch {}
      } catch {}

      const key = `${Math.round(s.cssW)}x${Math.round(s.cssH)}:${Math.round(s.gridArea.w)}x${Math.round(s.gridArea.h)}`;
      if (key === lastKey) stable++;
      else { stable = 0; lastKey = key; }

      framesLeft--;
      if (stable >= 2) return;
      if (framesLeft <= 0) return;
      s.__dgPostRestoreStabilizeRAF = requestAnimationFrame(step);
    };

    // Give the DOM at least one frame to apply any pending transforms before we start stabilizing.
    s.__dgPostRestoreStabilizeRAF = requestAnimationFrame(step);
  }

  return {
    applyInstrumentFromState,
    captureState,
    restoreFromState,
    cancelPostRestoreStabilize,
    schedulePostRestoreStabilize,
  };
}
