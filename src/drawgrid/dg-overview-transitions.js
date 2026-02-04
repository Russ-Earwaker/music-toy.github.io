// src/drawgrid/dg-overview-transitions.js
// Overview transition handling for DrawGrid.

export function createDgOverviewTransitions({ state, deps } = {}) {
  const s = state;
  const d = deps;

  function installPanelTransitions() {
    const panel = s.panel;
    if (!panel) return () => {};
    const onPrecommit = () => {
      // Particle field handles its own throttling; no extra hooks needed.
    };
    const onCommit = () => {
      const t0 = performance?.now?.() ?? Date.now();
      try {
        try { d.dgViewport?.setNonReactive?.(d.zoomFreezeActive() ? true : null); } catch {}
        s.__dgDeferUntilTs = 0;
        s.__dgStableFramesAfterCommit = 0;
        s.__dgNeedsUIRefresh = true;
        s.__dgFrontSwapNextDraw = true;
        const sync = () => {
          try {
            // Mark dirty so ensureSizeReady can resize IF needed, but avoid forced resize
            // (forced resize clears the paint canvas and nukes drawn lines)
            try { d.markLayoutSizeDirty(); } catch {}
            d.ensureSizeReady({ force: false });
            const sizeChanged = !!s.__dgLastEnsureSizeChanged;
            try { if (d.DG_OV_DBG) console.debug('[DG] overview:commit sizeReady', { sizeChanged, cssW: s.cssW, cssH: s.cssH }); } catch {}
            // Always resnap/redraw to refresh paint + grid in overview, but avoid relayout
            d.resnapAndRedraw(false, { preservePaintIfNoStrokes: true, skipLayout: true });
            const t1 = performance?.now?.() ?? Date.now();
            try {
              if (d.DG_OV_DBG) console.debug('[DG][overview] commit redraw ms=', (t1 - t0).toFixed(1), { cssW: s.cssW, cssH: s.cssH, sizeChanged });
            } catch {}
          } catch (err) {
            d.dglog('overview:commit:sync-error', String((err && err.message) || err));
          }
        };
        requestAnimationFrame(() => requestAnimationFrame(sync));
      } catch (err) {
        d.dglog('overview:commit:error', String((err && err.message) || err));
      }
    };
    panel.addEventListener('overview:precommit', onPrecommit);
    panel.addEventListener('overview:commit', onCommit);
    return () => {
      try { panel.removeEventListener('overview:precommit', onPrecommit); } catch {}
      try { panel.removeEventListener('overview:commit', onCommit); } catch {}
    };
  }

  function installGlobalTransition() {
    const handler = (e) => {
      const panel = s.panel;
      const wrap = s.wrap;
      const grid = s.grid;
      const paint = s.paint;
      const particleCanvas = s.particleCanvas;
      const ghostCanvas = s.ghostCanvas;
      const flashCanvas = s.flashCanvas;
      const nodesCanvas = s.nodesCanvas;
      const tutorialCanvas = s.tutorialCanvas;
      const drawToyBg = s.drawToyBg;
      const gridArea = s.gridArea;
      const cssW = s.cssW;
      const cssH = s.cssH;
      const paintDpr = s.paintDpr;
      const currentMap = s.currentMap;
      const ghostCtx = s.ghostCtx;
      const fctx = s.fctx;

      const active = !!e?.detail?.active;
      s.__overviewActive = active;
      const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      const deferUntil = now + 32;
      s.__dgDeferUntilTs = Math.max(s.__dgDeferUntilTs || 0, deferUntil);
      s.__dgStableFramesAfterCommit = 0;
      s.__dgNeedsUIRefresh = true;
      d.dglog('overview:transition', { active });
      try { d.dgViewport?.setNonReactive?.(d.zoomFreezeActive() ? true : null); } catch {}
      try { d.dgViewport?.refreshSize?.({ snap: true }); } catch {}
      try { d.dgField?.resize?.(); } catch {}
      try {
        // Ensure all layers are visible & transparent
        [grid, paint, particleCanvas, ghostCanvas, flashCanvas, nodesCanvas, tutorialCanvas]
          .filter(Boolean)
          .forEach((cv) => {
            const sStyle = cv.style || {};
            if (sStyle.visibility === 'hidden') sStyle.visibility = '';
            if (sStyle.opacity === '0') sStyle.opacity = '';
            if (sStyle.display === 'none') sStyle.display = '';
            sStyle.background = 'transparent';
          });

        const body = panel.querySelector('.toy-body');
        if (body && body.style) {
          body.style.background = drawToyBg;
        }
        if (panel?.style) {
          panel.style.background = drawToyBg;
          panel.style.backgroundColor = drawToyBg;
        }
        if (wrap && wrap.style) {
          wrap.style.background = drawToyBg;
        }
      } catch {}
      try {
        s.__dgFrontSwapNextDraw = true;
        s.__dgNeedsUIRefresh = true;
        s.__dgStableFramesAfterCommit = 0;

        let __dgGridStart = null;
        if (d.perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf) {
          __dgGridStart = performance.now();
        }
        d.drawGrid();
        if (__dgGridStart !== null) {
          const __dgGridDt = performance.now() - __dgGridStart;
          try { window.__PerfFrameProf?.mark?.('drawgrid.grid', __dgGridDt); } catch {}
        }

        if (currentMap) {
          let __dgNodesStart = null;
          if (d.perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf) {
            __dgNodesStart = performance.now();
          }
          d.drawNodes(currentMap.nodes);
          if (__dgNodesStart !== null) {
            const __dgNodesDt = performance.now() - __dgNodesStart;
            try { window.__PerfFrameProf?.mark?.('drawgrid.nodes', __dgNodesDt); } catch {}
          }
        }

        const flashTarget = d.getActiveFlashCanvas();
        const __flashDpr = d.__dgGetCanvasDprFromCss(flashTarget, cssW, paintDpr);
        d.R.resetCtx(fctx);
        d.__dgWithLogicalSpaceDpr(d.R, fctx, __flashDpr, () => {
          const { x, y, w, h } = d.R.getOverlayClearRect({
            canvas: flashTarget,
            pad: d.R.getOverlayClearPad(),
            allowFull: !!panel.__dgFlashOverlayOutOfGrid,
            gridArea,
          });
          fctx.clearRect(x, y, w, h);
        });
        d.markFlashLayerCleared();

        // Ghost trail should NEVER be cleared by gesture settle / re-snap.
        // Only clear it when the ghost backing store has actually changed (resize / DPR change)
        // or when explicitly stopped via stopGhostGuide({ immediate: true }).
        {
          const ghostTarget = d.getActiveGhostCanvas();
          const __ghostDpr = d.__dgGetCanvasDprFromCss(ghostTarget, cssW, paintDpr);
          const __ghostKey = `${cssW}x${cssH}@${__ghostDpr}`;
          const __prevGhostKey = panel.__dgGhostClearKey || null;
          const __shouldClearGhost = (__prevGhostKey !== __ghostKey);
          if (__shouldClearGhost) {
            panel.__dgGhostClearKey = __ghostKey;
            d.R.resetCtx(ghostCtx);
            d.__dgWithLogicalSpaceDpr(d.R, ghostCtx, __ghostDpr, () => {
              const { x, y, w, h } = d.R.getOverlayClearRect({
                canvas: ghostTarget,
                pad: d.R.getOverlayClearPad() * 1.2,
                gridArea,
              });
              ghostCtx.clearRect(x, y, w, h);
            });
            d.markGhostLayerCleared();
            try {
              if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
                d.dgGhostTrace('clear:do', {
                  id: panel?.id || null,
                  reason: 'overview:transition:overlay-clear',
                  key: __ghostKey,
                  prevKey: __prevGhostKey,
                });
              }
            } catch {}
          } else {
            // Preserve existing trail.
            try {
              if (
                typeof window !== 'undefined' &&
                window.__DG_GHOST_TRACE &&
                !window.__DG_GHOST_TRACE_CLEAR_ONLY
              ) {
                d.dgGhostTrace('clear:skip (preserve-trail)', {
                  id: panel?.id || null,
                  reason: 'overview:transition:overlay-clear',
                  key: __ghostKey,
                });
              }
            } catch {}
          }
        }
      } catch {}
      // Don't re-home during overview toggles -- avoids visible lerp.
      // refreshHomes({ resetPositions: false });
      s.__dgFrontSwapNextDraw = true;
      try {
        if (typeof d.ovlog === 'function') d.ovlog('overview:transition handled', { active, cssW, cssH });
      } catch {}
    };

    try { window.addEventListener('overview:transition', handler, { passive: true }); } catch {}
    return () => {
      try { window.removeEventListener('overview:transition', handler); } catch {}
    };
  }

  function install() {
    const cleanPanel = installPanelTransitions();
    const cleanGlobal = installGlobalTransition();
    return () => {
      try { cleanPanel(); } catch {}
      try { cleanGlobal(); } catch {}
    };
  }

  return { install };
}
