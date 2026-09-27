// src/drawgrid/dg-layout.js
// Layout sizing + paint restore for DrawGrid.

export function createDgLayout({ state, deps } = {}) {
  const s = state || {};
  const d = deps || {};

  function layout(force = false) {
    return d.F.perfMarkSection('drawgrid.layout', () => {
      // IMPORTANT:
      // Do NOT force-wrap to a measured pixel size here.
      // The wrap must remain `100%` so it tracks the toy body without being "locked"
      // to a transient scaled value during zoom/drag settle (which causes RO:size resnaps
      // and mixed-scale layers).
      // Fast-path: if RO has already given us a stable size that matches our current
      // cssW/cssH, and layout isn't dirty, avoid *all* DOM reads in this frame.
      // This reduces forced style/layout work (often shows up as "nonScript" time).
      if (!force && !s.layoutSizeDirty) {
        const roW = s.__dgLayoutW || 0;
        const roH = s.__dgLayoutH || 0;
        if (roW > 0 && roH > 0 && Math.abs(roW - s.cssW) <= 1 && Math.abs(roH - s.cssH) <= 1) {
          return;
        }
      }
      // Keep the wrap responsive (CSS %) so it tracks the toy body through drag/zoom settle.
      // If we pin it to pixels here, later transforms can leave different internal canvases
      // rendering at different effective scales.
      s.wrap.style.width  = '100%';
      s.wrap.style.height = '100%';

      // Only measure BODY as a fallback when RO hasn't reported yet (or when forced).
      let bodyW = 0;
      let bodyH = 0;
      if (force || (s.__dgLayoutW <= 0 || s.__dgLayoutH <= 0)) {
        const bodySize = s.body ? d.measureCSSSize(s.body) : d.measureCSSSize(s.wrap);
        bodyW = bodySize.w;
        bodyH = bodySize.h;
      }

      // Measure transform-immune base...
      // Prefer RO-backed wrap size; if RO hasn't reported yet (common just after refresh),
      // fall back to BODY size (untransformed layout pixels). This avoids "self-locking" a 0-size
      // layout while still staying zoom/transform safe.
      let { w: baseW, h: baseH } = d.__dgGetStableWrapSize();
      if ((baseW <= 0 || baseH <= 0) && bodyW > 0 && bodyH > 0) {
        baseW = bodyW;
        baseH = bodyH;
      }
      const { x: zoomX, y: zoomY } = d.getZoomScale(s.panel); // tracking only for logs/debug
      // IMPORTANT: During refresh/boot the RO-backed size can legitimately be 0 for a frame.
      // Do NOT clamp to 1 before checking; that would force a 1px backing-store resize and
      // effectively "lock in" a broken layout until something else triggers a resnap.
      const rawW = Math.round(baseW || 0);
      const rawH = Math.round(baseH || 0);
      if (rawW <= 0 || rawH <= 0) {
        d.dgRefreshTrace('layout:bail zero size', { force, newW: rawW, newH: rawH, roW: s.__dgLayoutW, roH: s.__dgLayoutH });
        requestAnimationFrame(() => d.resnapAndRedraw(force));
        return;
      }

      const newW = Math.max(1, rawW);
      const newH = Math.max(1, rawH);
      try {
        // Avoid forced-layout DOM reads unless we're tracing size or actively zooming.
        // (getBoundingClientRect + getComputedStyle can trigger synchronous layout.)
        const wantLayoutTrace = (() => { try { return !!window.__DG_REFRESH_SIZE_TRACE; } catch {} return false; })();
        // Only read DOM synchronously when we truly need it (gesture/forced paths).
        // Size trace should not force expensive reads every frame; it is throttled + gated.
        const shouldReadDom = force || s.zoomGestureActive;

        let rect = null;
        let toyScale = null;

        if (shouldReadDom) {
          rect = s.panel?.getBoundingClientRect?.();
          const toyScaleRaw = s.panel ? getComputedStyle(s.panel).getPropertyValue('--toy-scale') : '';
          const ts = parseFloat(toyScaleRaw);
          toyScale = Number.isFinite(ts) ? ts : null;
          // Cache last known toyScale for fast paths (used by backing DPR decisions).
          try { s.panel.__dgLastToyScale = toyScale ?? (s.panel.__dgLastToyScale ?? 1); } catch {}
        } else {
          const ts = s.panel?.__dgLastToyScale;
          toyScale = Number.isFinite(ts) ? ts : null;
        }

        if (wantLayoutTrace && d.dgSizeTraceCanLog()) {
          // Only gather DOM/layout reads when a trace sample will actually be recorded.
          if (!rect) rect = s.panel?.getBoundingClientRect?.();
          if (toyScale === null || toyScale === undefined) {
            const toyScaleRaw = s.panel ? getComputedStyle(s.panel).getPropertyValue('--toy-scale') : '';
            const ts = parseFloat(toyScaleRaw);
            toyScale = Number.isFinite(ts) ? ts : null;
            try { s.panel.__dgLastToyScale = toyScale ?? (s.panel.__dgLastToyScale ?? 1); } catch {}
          }
          d.dgSizeTrace('layout:measure', {
            force,
            bodyW,
            bodyH,
            baseW,
            baseH,
            newW,
            newH,
            wrapClientW: s.wrap?.clientWidth || 0,
            wrapClientH: s.wrap?.clientHeight || 0,
            panelRectW: rect?.width || 0,
            panelRectH: rect?.height || 0,
            toyScale,
            zoomMode: s.zoomMode,
            zoomGestureActive: s.zoomGestureActive,
            overview: !!s.__overviewActive,
          });
        }
      } catch {}

      if ((!s.zoomGestureActive && (force || Math.abs(newW - s.cssW) > 1 || Math.abs(newH - s.cssH) > 1)) || (force && s.zoomGestureActive)) {
        const oldW = s.cssW;
        const oldH = s.cssH;
        d.dgSizeTrace('layout:apply', {
          force,
          oldW,
          oldH,
          newW,
          newH,
          zoomMode: s.zoomMode,
          zoomGestureActive: s.zoomGestureActive,
          overview: !!s.__overviewActive,
        });
        s.cssW = newW;
        s.cssH = newH;
        s.progressMeasureW = s.cssW;
        s.progressMeasureH = s.cssH;
        // IMPORTANT:
        // Do NOT use __dgAdaptivePaintDpr as a "fallback" during generic layout sizing.
        // That causes delayed backing-store DPR changes (RO/ensureSize/layout) which show up
        // as staggered "scale jumps" after zoom/pan settles.
        const __layoutDpr =
          (Number.isFinite(s.paintDpr) && s.paintDpr > 0)
            ? s.paintDpr
            : (Number.isFinite(window?.devicePixelRatio) ? window.devicePixelRatio : 1);
        d.resizeSurfacesFor(s.cssW, s.cssH, __layoutDpr, 'layout:paintDpr');
        if (d.getTutorialHighlightMode() !== 'none') {
          // Only render highlight when actually enabled; no hidden DPR "fallback" resizes.
          d.renderTutorialHighlight();
        }

        // Layout changes invalidate static layers (grid geometry / node positions).
        try { d.markStaticDirty('layout'); } catch {}
        s.__dgForceFullDrawNext = true;

        s.lastZoomX = zoomX;
        s.lastZoomY = zoomY;

        const recentlyHydrated =
          s.__hydrationJustApplied ||
          (d.DG_HYDRATE.hydratedAt && (d.dgNow() - d.DG_HYDRATE.hydratedAt < 1200));
        // Stroke coordinates are authoritative logical state. A presentation
        // resize must never scale or reproject them.

        // Drawing geometry is fixed in the authored 800x600 logical surface.
        // Layout changes presentation/backing only; they never rebuild the grid.
        const geometry = d.createLogicalGeometry({ cols: s.cols, rows: s.rows });
        s.logicalGeometry = geometry;
        s.gridArea = { ...geometry.gridRect };
        s.topPad = geometry.topPad;
        s.cw = geometry.cellWidth;
        s.ch = geometry.cellHeight;
        // Record last-known-good sizing so transient "not ready" moments don't nuke the grid.
        if (d.__dgGridReady()) {
          s.__dgLastGoodGridArea = { ...s.gridArea };
          s.__dgLastGoodCw = s.cw;
          s.__dgLastGoodCh = s.ch;
        }
        if (d.__dgGridReady()) {
          d.resetGridCache?.();
          d.resetNodesCache();
          d.resetBlocksCache();
          try {
            if (s.gridBackCtx?.canvas) d.R.withDeviceSpace(s.gridBackCtx, () => s.gridBackCtx.clearRect(0, 0, s.gridBackCtx.canvas.width, s.gridBackCtx.canvas.height));
            if (s.nodesBackCtx?.canvas) d.R.withDeviceSpace(s.nodesBackCtx, () => s.nodesBackCtx.clearRect(0, 0, s.nodesBackCtx.canvas.width, s.nodesBackCtx.canvas.height));
          } catch {}
          s.panel.__dgGridHasPainted = false;
          try { d.markStaticDirty('layout-clear'); } catch {}
          s.__dgForceFullDrawNext = true;
        }
        const layoutKey = `${Math.round(s.cssW)}x${Math.round(s.cssH)}:${Math.round(s.gridArea.w)}x${Math.round(s.gridArea.h)}`;
        if (layoutKey === s.__dgLastLayoutKey) s.__dgLayoutStableFrames++;
        else {
          s.__dgLayoutStableFrames = 0;
          s.__dgLastLayoutKey = layoutKey;
          if (d.DG_LAYOUT_DEBUG) {
            try {
              d.dgLogLine('layout-change', {
                panelId: s.panel.id || null,
                cssW: s.cssW,
                cssH: s.cssH,
                gridW: s.gridArea.w,
                gridH: s.gridArea.h,
                zoomGestureActive: s.zoomGestureActive,
                zoomMode: s.zoomMode,
                overview: !!s.__overviewActive,
                recentlyHydrated,
              });
              d.dgDumpCanvasMetrics(s.panel, 'layout-change', s.frontCanvas, s.wrap, s.body);
            } catch {}
          }
        }
        s.__dgHydrationPendingRedraw = false;
        s.hydrationState.retryCount = 0;

        // === DRAW label responsive sizing tied to toy, not viewport ===
        d.updateDrawLabelLayout(s.drawLabelState, { gridAreaLogical: s.gridAreaLogical, wrap: s.wrap });

        d.drawGrid();
        if (!s.drawing && Array.isArray(s.strokes) && s.strokes.length > 0) {
          try { d.clearAndRedrawFromStrokes(null, 'layout:vector-redraw'); } catch {}
        }
        if (s.DG_SINGLE_CANVAS) {
          d.__dgMarkSingleCanvasDirty(s.panel);
          try { d.compositeSingleCanvas(); } catch {}
        }
        // Clear other content canvases. The caller is responsible for redrawing nodes/overlay.
        // Defer overlay clears if we are in/near a gesture commit; renderLoop will clear safely.
        const __now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if ((d.HY.inCommitWindow(__now) || s.__dgStableFramesAfterCommit < 2) && !s.__dgForceOverlayClearNext) {
          s.__dgNeedsUIRefresh = true;
        } else {
          s.__dgForceOverlayClearNext = false;
          d.R.clearCanvas(s.nctx);
          const flashTarget = d.getActiveFlashCanvas();
          const __flashDpr = d.__dgGetCanvasDprFromCss(flashTarget, s.cssW, s.paintDpr);
          d.R.resetCtx(s.fctx);
          d.__dgWithLogicalSpaceDpr(d.R, s.fctx, __flashDpr, () => {
            const { x, y, w, h } = d.R.getOverlayClearRect({
              canvas: flashTarget,
              pad: d.R.getOverlayClearPad(),
              allowFull: !!s.panel.__dgFlashOverlayOutOfGrid,
              gridArea: s.gridArea,
            });
            s.fctx.clearRect(x, y, w, h);
          });
          d.markFlashLayerCleared();
          // Ghost trail should NEVER be cleared by gesture settle / re-snap.
          // Only clear it when the ghost backing store has actually changed (resize / DPR change)
          // or when explicitly stopped via stopGhostGuide({ immediate: true }).
          const ghostTarget = d.getActiveGhostCanvas();
          const __ghostDpr = d.__dgGetCanvasDprFromCss(ghostTarget, s.cssW, s.paintDpr);
          const __ghostKey = `${s.cssW}x${s.cssH}@${__ghostDpr}`;
          const __prevGhostKey = s.panel.__dgGhostClearKey || null;
          const __shouldClearGhost = (__prevGhostKey !== __ghostKey);
          if (__shouldClearGhost) {
            s.panel.__dgGhostClearKey = __ghostKey;
            d.R.resetCtx(s.ghostCtx);
            d.__dgWithLogicalSpaceDpr(d.R, s.ghostCtx, __ghostDpr, () => {
              const { x, y, w, h } = d.R.getOverlayClearRect({
                canvas: ghostTarget,
                pad: d.R.getOverlayClearPad() * 1.2,
                gridArea: s.gridArea,
              });
              s.ghostCtx.clearRect(x, y, w, h);
            });
            d.markGhostLayerCleared();
          } else {
            // Preserve existing trail.
            if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
              d.dgGhostTrace('clear:skip (preserve-trail)', {
                id: s.panel?.id || null,
                reason: 'layout:overlay-clear',
                key: __ghostKey,
              });
            }
          }
        }
      }
    });
  }

  return {
    layout,
  };
}
