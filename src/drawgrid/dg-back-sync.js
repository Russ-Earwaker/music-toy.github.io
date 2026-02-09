// src/drawgrid/dg-back-sync.js
// Back-buffer synchronization for DrawGrid.

import {
  syncCanvasCssSize,
  applyCanvasBackingSize,
  clampDprForBackingStore,
  createOverlayResizeGate,
  computeEffectiveDpr,
  resizeCanvasForDpr,
} from '../baseMusicToy/index.js';

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

      // Tier hard clamp (pixels-first lever). We keep this deliberately generic:
      // - if the tier system publishes a maxDprMul, we use it
      // - otherwise we leave it unclamped (null)
      const tierMaxDprMul =
        (Number.isFinite(s.__dgTierMaxDprMul) && s.__dgTierMaxDprMul > 0) ? s.__dgTierMaxDprMul :
        (s.__dgTierProfile && Number.isFinite(s.__dgTierProfile.maxDprMul) && s.__dgTierProfile.maxDprMul > 0) ? s.__dgTierProfile.maxDprMul :
        null;

      // Aux layer DPR: never exceed paintScale, but can drop below it smoothly.
      const auxDprRaw = deviceDpr * visualMul * pressureMul * autoMul;
      const auxEd = computeEffectiveDpr({
        deviceDpr,
        rawDpr: auxDprRaw,
        maxDprMul: tierMaxDprMul,
      });
      const auxScale = clampDprForBackingStore({
        logicalW: logicalWidth,
        logicalH: logicalHeight,
        paintScale,
        rawDpr: auxEd.effectiveDpr,
        capFn: d.__dgCapDprForBackingStore,
        adaptivePaintDpr: s.__dgAdaptivePaintDpr,
      });

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
      const overlayEd = computeEffectiveDpr({
        deviceDpr,
        rawDpr: overlayDprRaw,
        maxDprMul: tierMaxDprMul,
      });
      const overlayScale = clampDprForBackingStore({
        logicalW: logicalWidth,
        logicalH: logicalHeight,
        paintScale,
        rawDpr: overlayEd.effectiveDpr,
        capFn: d.__dgCapDprForBackingStore,
        adaptivePaintDpr: s.__dgAdaptivePaintDpr,
      });

      const overlayQuantPx = (Number.isFinite(window.__DG_OVERLAY_DPR_QUANT_PX) && window.__DG_OVERLAY_DPR_QUANT_PX >= 8)
        ? (window.__DG_OVERLAY_DPR_QUANT_PX|0)
        : 32;
      const overlayStableFrames = (Number.isFinite(window.__DG_OVERLAY_RESIZE_STABLE_FRAMES) && window.__DG_OVERLAY_RESIZE_STABLE_FRAMES >= 1)
        ? (window.__DG_OVERLAY_RESIZE_STABLE_FRAMES|0)
        : 6;

      // Shared overlay resize gate: quantize + stable-frame gating + big-jump immediate apply.
      const overlayGate = createOverlayResizeGate({
        quantStepPx: overlayQuantPx,
        stableFrames: overlayStableFrames,
        bigJumpSteps: 2,
        // IMPORTANT: keep using DrawGrid's existing pending fields for perfect behaviour parity.
        cachePrefix: '__dg',
      });

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
      // Apply logical CSS size to all DOM-backed layers and keep cached CSS size authoritative.
      // This avoids repeated DOM reads and gives all DPR math a single source of truth.
      for (const canvas of styleCanvases) {
        syncCanvasCssSize(canvas, logicalWidth, logicalHeight, { cachePrefix: '__bm', alsoCachePrefixes: ['__dg'] });
      }

      const allCanvases = d.__dgListManagedBackingEls();
      for (const canvas of allCanvases) {
        // Keep authoritative CSS size cached even for non-DOM canvases (back buffers).
        syncCanvasCssSize(canvas, logicalWidth, logicalHeight, { cachePrefix: '__bm', alsoCachePrefixes: ['__dg'] });
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

        // Backing-store bucketing for overlays: quantize first (gate will re-quantize too, but keep parity).
        if (isOverlayLayer(canvas)) {
          // gate() returns quantized w/h.
          const g0 = overlayGate.gate(canvas, pxW, pxH, canvas.width|0, canvas.height|0);
          pxW = g0.w;
          pxH = g0.h;
          // If gate says "not yet", skip applying resize this frame.
          if (!g0.apply) {
            continue;
          }
        }

        // Cache DPR used for this backing store (useful for debug and for ctx reset helpers).
        try { canvas.__dgBackingDpr = dpr; } catch {}

        if (!isOverlayLayer(canvas)) {
          // Non-overlay layers: don't accumulate pending state.
          try { canvas.__dgPendingN = 0; } catch {}
        }

        {
          const oldW = canvas.width|0;
          const oldH = canvas.height|0;

          if (isOverlayLayer(canvas)) {
            // Overlays keep their special quantize+stabilize behaviour; apply directly.
            applyCanvasBackingSize(canvas, pxW, pxH, dpr, { cachePrefix: '__bm', alsoCachePrefixes: ['__dg'] });
          } else {
            // Non-overlay layers: route through the shared baseMusicToy truth-point.
            // Note: CSS size has already been set/cached above; this call is backing-store focused.
            resizeCanvasForDpr(canvas, null, logicalWidth, logicalHeight, {
              rawDpr: dpr,
              cachePrefix: '__bm',
              alsoCachePrefixes: ['__dg'],
              skipCssSync: true,
            });
          }

          const newW = canvas.width|0;
          const newH = canvas.height|0;

          if (oldW !== newW) {
            resizedAny = true;
            try { window.__PERF_DG_BACKING_RESIZE_COUNT = (window.__PERF_DG_BACKING_RESIZE_COUNT || 0) + 1; } catch {}
            if (isOverlayLayer(canvas)) { try { window.__PERF_DG_OVERLAY_RESIZE_COUNT = (window.__PERF_DG_OVERLAY_RESIZE_COUNT || 0) + 1; } catch {} }
          }
          if (oldH !== newH) {
            resizedAny = true;
            try { window.__PERF_DG_BACKING_RESIZE_COUNT = (window.__PERF_DG_BACKING_RESIZE_COUNT || 0) + 1; } catch {}
            if (isOverlayLayer(canvas)) { try { window.__PERF_DG_OVERLAY_RESIZE_COUNT = (window.__PERF_DG_OVERLAY_RESIZE_COUNT || 0) + 1; } catch {} }
          }
          // style width/height is already set via styleCanvases above
        }
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
