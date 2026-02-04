// src/drawgrid/dg-back-sync.js
// Back-buffer synchronization for DrawGrid.

export function createDgBackSync({ state, deps } = {}) {
  const s = state || {};
  const d = deps || {};

  function ensureBackVisualsFreshFromFront() {
    try {
      const paintScale = (Number.isFinite(s.paintDpr) && s.paintDpr > 0) ? s.paintDpr : 1;
      const logicalWidth = Math.max(1, s.cssW || ((s.frontCanvas?.width ?? 1) / paintScale));
      const logicalHeight = Math.max(1, s.cssH || ((s.frontCanvas?.height ?? 1) / paintScale));

      // Default all DOM-backed layers to paintScale, but allow "aux" layers (grid/nodes/ghost/tutorial/playhead/etc)
      // to reduce backing resolution when zoomed out or under frame-time pressure. This targets **raster/compositor**
      // cost ("frame.nonScript") without changing CSS size/layout.
      const deviceDpr = (Number.isFinite(window?.devicePixelRatio) && window.devicePixelRatio > 0) ? window.devicePixelRatio : 1;
      const toyScale = (Number.isFinite(s.panel?.__dgLastToyScale) && s.panel.__dgLastToyScale > 0) ? s.panel.__dgLastToyScale : 1;
      const visualMul = d.__dgComputeVisualBackingMul(toyScale);
      const pressureMul = d.__dgGetPressureDprMul();
      const autoMul = d.__dgGetAutoQualityMul();

      // Aux layer DPR: never exceed paintScale, but can drop below it smoothly.
      const auxDprRaw = deviceDpr * visualMul * pressureMul * autoMul;
      const auxScale = Math.min(
        paintScale,
        d.__dgCapDprForBackingStore(logicalWidth, logicalHeight, auxDprRaw, s.__dgAdaptivePaintDpr)
      );

      // Overlay layer DPR: drop earlier/more aggressively under pressure.
      // IMPORTANT: do NOT reduce overlay DPR based on gesture state; only generic pressure.
      const overlayMinMul = (Number.isFinite(window.__DG_OVERLAY_PRESSURE_DPR_MIN_MUL) && window.__DG_OVERLAY_PRESSURE_DPR_MIN_MUL > 0)
        ? window.__DG_OVERLAY_PRESSURE_DPR_MIN_MUL
        : 0.45;
      const overlayBias = (Number.isFinite(window.__DG_OVERLAY_PRESSURE_DPR_BIAS) && window.__DG_OVERLAY_PRESSURE_DPR_BIAS > 0)
        ? window.__DG_OVERLAY_PRESSURE_DPR_BIAS
        : 0.85;
      const overlayPressureMul = (pressureMul < 0.999)
        ? Math.max(overlayMinMul, Math.min(1, pressureMul * overlayBias))
        : 1;
      const overlayDprRaw = deviceDpr * visualMul * overlayPressureMul * autoMul;
      const overlayScale = Math.min(
        paintScale,
        d.__dgCapDprForBackingStore(logicalWidth, logicalHeight, overlayDprRaw, s.__dgAdaptivePaintDpr)
      );

      const overlayQuantPx = (Number.isFinite(window.__DG_OVERLAY_DPR_QUANT_PX) && window.__DG_OVERLAY_DPR_QUANT_PX >= 8)
        ? (window.__DG_OVERLAY_DPR_QUANT_PX|0)
        : 32;
      const quantPx = (n) => {
        const v = Math.max(1, (n|0));
        const step = overlayQuantPx;
        return Math.max(step, Math.round(v / step) * step);
      };

      const overlayStableFrames = (Number.isFinite(window.__DG_OVERLAY_RESIZE_STABLE_FRAMES) && window.__DG_OVERLAY_RESIZE_STABLE_FRAMES >= 1)
        ? (window.__DG_OVERLAY_RESIZE_STABLE_FRAMES|0)
        : 6;

      const isOverlayLayer = (c) => (c === s.flashCanvas) || (c === s.flashBackCanvas) || (c === s.ghostCanvas) || (c === s.ghostBackCanvas) || (c === s.tutorialCanvas) || (c === s.tutorialBackCanvas) || (c === s.playheadCanvas);
      const isOverlayDormant = (c) => {
        try {
          if (!c || !c.style) return false;
          if (c.style.display !== 'none') return false;
          if (c === s.flashCanvas || c === s.flashBackCanvas) return !!s.panel.__dgFlashLayerEmpty;
          if (c === s.ghostCanvas || c === s.ghostBackCanvas) return !!s.panel.__dgGhostLayerEmpty;
          if (c === s.tutorialCanvas || c === s.tutorialBackCanvas) return !!s.panel.__dgTutorialLayerEmpty;
          if (c === s.playheadCanvas) return !!s.panel.__dgPlayheadLayerEmpty;
        } catch {}
        return false;
      };

      const styleCanvases = d.__dgListAllLayerEls();

      const cssWpx = `${logicalWidth}px`;
      const cssHpx = `${logicalHeight}px`;
      for (const canvas of styleCanvases) {
        if (canvas.style.width !== cssWpx) canvas.style.width = cssWpx;
        if (canvas.style.height !== cssHpx) canvas.style.height = cssHpx;
        // Keep authoritative CSS size cached for DPR math.
        canvas.__dgCssW = logicalWidth;
        canvas.__dgCssH = logicalHeight;
      }

      const allCanvases = d.__dgListManagedBackingEls();
      for (const canvas of allCanvases) {
        try {
          canvas.__dgCssW = logicalWidth;
          canvas.__dgCssH = logicalHeight;
        } catch {}
      }

      // NOTE: avoid per-canvas getContext() calls here (can be surprisingly costly).
      // We only reset contexts we already hold references to.
      let resizedAny = false;

      const isPaintLayer = (c) => (c === s.frontCanvas) || (c === s.backCanvas) || (c === s.paint);

      for (const canvas of allCanvases) {
        // If an overlay layer is dormant (display:none + marked empty), do not resize it.
        // Resizing dormant overlays during pressure changes can create big realloc spikes
        // even though the layer isn't contributing any pixels this frame.
        if (isOverlayLayer(canvas) && isOverlayDormant(canvas)) {
          continue;
        }

        const dpr = isPaintLayer(canvas)
          ? paintScale
          : isOverlayLayer(canvas)
            ? overlayScale
            : (auxScale * d.__dgComputeGestureStaticMul(s.zoomGestureMoving));
        let pxW = Math.max(1, Math.round(logicalWidth * dpr));
        let pxH = Math.max(1, Math.round(logicalHeight * dpr));

        // Backing-store bucketing for overlays: reduces resize thrash when DPR oscillates.
        if (isOverlayLayer(canvas)) {
          pxW = quantPx(pxW);
          pxH = quantPx(pxH);
        }

        // Cache DPR used for this backing store (useful for debug and for ctx reset helpers).
        try { canvas.__dgBackingDpr = dpr; } catch {}

        // Overlay DPR can oscillate under pressure; avoid resize thrash by requiring a few
        // consecutive frames requesting the same backing size before we actually resize.
        // (Large jumps apply immediately.)
        if (isOverlayLayer(canvas)) {
          const wantW = pxW;
          const wantH = pxH;
          const curW = canvas.width|0;
          const curH = canvas.height|0;
          const dw = Math.abs(curW - wantW);
          const dh = Math.abs(curH - wantH);
          const bigJump = (dw >= (overlayQuantPx * 2)) || (dh >= (overlayQuantPx * 2));
          if (!bigJump && (curW !== wantW || curH !== wantH)) {
            const pw = canvas.__dgPendingW|0;
            const ph = canvas.__dgPendingH|0;
            if (pw === wantW && ph === wantH) {
              canvas.__dgPendingN = (canvas.__dgPendingN|0) + 1;
            } else {
              canvas.__dgPendingW = wantW;
              canvas.__dgPendingH = wantH;
              canvas.__dgPendingN = 1;
            }
            if ((canvas.__dgPendingN|0) < overlayStableFrames) {
              continue;
            }
          }
          // Applying: clear pending so the next oscillation must restabilize.
          canvas.__dgPendingN = 0;
        } else {
          // Non-overlay layers: don't accumulate pending state.
          try { canvas.__dgPendingN = 0; } catch {}
        }

        if (canvas.width !== pxW) {
          canvas.width = pxW;
          resizedAny = true;
          try { window.__PERF_DG_BACKING_RESIZE_COUNT = (window.__PERF_DG_BACKING_RESIZE_COUNT || 0) + 1; } catch {}
          if (isOverlayLayer(canvas)) { try { window.__PERF_DG_OVERLAY_RESIZE_COUNT = (window.__PERF_DG_OVERLAY_RESIZE_COUNT || 0) + 1; } catch {} }
        }
        if (canvas.height !== pxH) {
          canvas.height = pxH;
          resizedAny = true;
          try { window.__PERF_DG_BACKING_RESIZE_COUNT = (window.__PERF_DG_BACKING_RESIZE_COUNT || 0) + 1; } catch {}
          if (isOverlayLayer(canvas)) { try { window.__PERF_DG_OVERLAY_RESIZE_COUNT = (window.__PERF_DG_OVERLAY_RESIZE_COUNT || 0) + 1; } catch {} }
        }
        // style width/height is already set via styleCanvases above
      }
      if (resizedAny) {
        // Resizing clears grid/nodes backing stores; force a static redraw.
        s.panel.__dgGridHasPainted = false;
        try { d.markStaticDirty('sync-back-resize'); } catch {}
        s.__dgForceFullDrawNext = true;
      }

      // Reset known contexts after resize
      try { d.R.resetCtx(s.frontCtx); } catch {}
      try { d.R.resetCtx(s.backCtx); } catch {}
      try { d.R.resetCtx(s.gridFrontCtx); } catch {}
      try { d.R.resetCtx(s.gridBackCtx); } catch {}
      try { d.R.resetCtx(s.nodesFrontCtx); } catch {}
      try { d.R.resetCtx(s.nodesBackCtx); } catch {}
      try { d.R.resetCtx(s.flashFrontCtx); } catch {}
      try { d.R.resetCtx(s.flashBackCtx); } catch {}
      try { d.R.resetCtx(s.ghostFrontCtx); } catch {}
      try { d.R.resetCtx(s.ghostBackCtx); } catch {}
      try { d.R.resetCtx(s.tutorialFrontCtx); } catch {}
      try { d.R.resetCtx(s.tutorialBackCtx); } catch {}
      try { d.R.resetCtx(s.playheadFrontCtx); } catch {}

      const copyCtx = (srcCtx, dstCtx) => {
        if (!srcCtx || !dstCtx) return;
        if (srcCtx === dstCtx || srcCtx.canvas === dstCtx.canvas) return;
        if (s.DG_SINGLE_CANVAS && s.usingBackBuffers && (srcCtx === s.gridFrontCtx || srcCtx === s.nodesFrontCtx)) return;
        const dw = dstCtx.canvas?.width || 0;
        const dh = dstCtx.canvas?.height || 0;
        if (!dw || !dh) return;
        d.R.withDeviceSpace(dstCtx, () => {
          dstCtx.clearRect(0, 0, dw, dh);
          dstCtx.drawImage(
            srcCtx.canvas,
            0, 0, srcCtx.canvas.width, srcCtx.canvas.height,
            0, 0, dw, dh
          );
        });
      };

      if (!s.DG_SINGLE_CANVAS) {
        copyCtx(s.pctx, s.backCtx);
        copyCtx(s.gridFrontCtx, s.gridBackCtx);
        copyCtx(s.nodesFrontCtx, s.nodesBackCtx);
        copyCtx(s.flashFrontCtx, s.flashBackCtx);
        copyCtx(s.ghostFrontCtx, s.ghostBackCtx);
        copyCtx(s.tutorialFrontCtx, s.tutorialBackCtx);
      } else if (!s.usingBackBuffers) {
        // In single-canvas mode, backCtx must remain *paint-only*.
        // Copying from frontCtx (which includes grid/overlays) makes the grid
        // get composited twice, causing the "grid gets darker when zooming/panning".
        // Keep back updated via stroke redraws instead.
        try {
          if (s.backCtx && Array.isArray(s.strokes) && s.strokes.length > 0) {
            d.clearAndRedrawFromStrokes(s.backCtx, 'sync-back-from-strokes');
          }
        } catch {}
      }
    } catch {}
  }

  return {
    ensureBackVisualsFreshFromFront,
  };
}
