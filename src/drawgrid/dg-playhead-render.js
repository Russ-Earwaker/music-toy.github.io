// src/drawgrid/dg-playhead-render.js
// Playhead render (overlay) for DrawGrid.

export function createDgPlayheadRender({ state, deps } = {}) {
  const s = state;
  const d = deps;

  function renderPlayhead({
    allowOverlayDraw = false,
    disableOverlayCore = false,
    allowOverlayDrawHeavy = false,
    overlayCoreWanted = false,
    overlayClearedThisFrame = false,
    overlayCompositeNeeded = false,
    zoomForOverlay = 1,
    fpsLive = null,
    perfOn = false,
    isActiveInChain = false,
  } = {}) {
    const panel = s.panel;
    const gridArea = s.gridArea;
    const cw = s.cw;
    const cssW = s.cssW;
    const cssH = s.cssH;
    const paintDpr = s.paintDpr;
    const strokes = s.strokes;
    const tutorialCtx = s.tutorialCtx;
    const playheadFrontCtx = s.playheadFrontCtx;
    const fctx = s.fctx;
    const DG_SINGLE_CANVAS = !!d.DG_SINGLE_CANVAS;

    if (typeof window !== 'undefined' && window.__DG_PLAYHEAD_TRACE) {
      try {
        if (!panel.__dgPlayheadTraceLastTs || (performance.now() - panel.__dgPlayheadTraceLastTs) > 500) {
          panel.__dgPlayheadTraceLastTs = performance.now();
          const info = d.getLoopInfo();
          const useSeparatePlayhead = !!(typeof window !== 'undefined' && window.__DG_PLAYHEAD_SEPARATE_CANVAS);
          const wantsPlayhead = !!(info && d.isRunning() && isActiveInChain);
          const playheadLayer = useSeparatePlayhead
            ? 'playhead'
            : ((s.__dgPlayheadSimpleMode && d.getTutorialHighlightMode() === 'none' && !!tutorialCtx?.canvas) ? 'tutorial' : 'flash');
          const payload = {
            id: panel?.id || null,
            allowOverlayDraw,
            disableOverlayCore,
            isActiveInChain,
            running: !!d.isRunning(),
            hasLoop: !!info,
            wantsPlayhead,
            useSeparatePlayhead,
            playheadLayer,
            playheadCanvasVisible: playheadFrontCtx?.canvas?.style?.display || null,
            dgSingleCanvas: !!d.DG_SINGLE_CANVAS,
            dgSingleCanvasOverlays: !!(typeof window !== 'undefined' && window.__DG_SINGLE_CANVAS_OVERLAYS),
            playheadCanvasSize: playheadFrontCtx?.canvas ? {
              w: playheadFrontCtx.canvas.width || 0,
              h: playheadFrontCtx.canvas.height || 0,
              cssW: playheadFrontCtx.canvas.style?.width || null,
              cssH: playheadFrontCtx.canvas.style?.height || null,
            } : null,
            gridArea: gridArea ? { x: gridArea.x, y: gridArea.y, w: gridArea.w, h: gridArea.h } : null,
          };
          console.log(`[DG][playhead][trace] ${JSON.stringify(payload)}`);
        }
      } catch {}
    }

    if (!disableOverlayCore && allowOverlayDraw) {
      const __playheadStart = (perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
        ? performance.now()
        : 0;
      const __phMark = (perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf?.mark)
        ? window.__PerfFrameProf.mark.bind(window.__PerfFrameProf)
        : null;
      try {
        const info = d.getLoopInfo();
        const prevPhase = Number.isFinite(s.localLastPhase) ? s.localLastPhase : null;
        const currentPhase = Number.isFinite(info?.phase01) ? info.phase01 : null;
        const phaseJustWrapped = currentPhase != null && prevPhase != null && currentPhase < prevPhase && prevPhase > 0.9;
        if (currentPhase != null) {
          s.localLastPhase = currentPhase;
        }
        if (panel.__dgPlayheadWrapCount == null) panel.__dgPlayheadWrapCount = 0;
        if (phaseJustWrapped) panel.__dgPlayheadWrapCount++;
        if (s.__dgPlayheadModeWanted !== null && phaseJustWrapped) {
          const modeNow = performance?.now?.() ?? Date.now();
          if ((modeNow - s.__dgPlayheadModeWantedSince) >= s.DG_PLAYHEAD_MODE_MIN_MS &&
              (panel.__dgPlayheadWrapCount || 0) >= 2) {
            s.__dgPlayheadSimpleMode = s.__dgPlayheadModeWanted;
            s.__dgPlayheadModeWanted = null;
            s.__dgPlayheadModeWantedSince = 0;
          }
        }

        // Only draw and repulse particles if transport is running and this toy is the active one in its chain.
        // If this toy thinks it's active, but the global transport phase just wrapped,
        // it's possible its active status is stale. Skip one frame of playhead drawing
        // to wait for the scheduler to update the `data-chain-active` attribute.
        const probablyStale = isActiveInChain && phaseJustWrapped;

        const playheadSimpleOnly = s.__dgPlayheadSimpleMode;
        const useSeparatePlayhead = !!(typeof window !== 'undefined' && window.__DG_PLAYHEAD_SEPARATE_CANVAS);
        const playheadFpsHint = d.readHeaderFpsHint();
        const playheadFps = Number.isFinite(playheadFpsHint) ? playheadFpsHint : 60;

        // IMPORTANT: playhead quality is *generic* (FPS-based), not gesture-based and not panel-count-based.
        // We only drop to the simple playhead when the frame rate suggests we need to.
        const fancyMinFps = Number.isFinite(window.__DG_PLAYHEAD_FANCY_MIN_FPS) ? Number(window.__DG_PLAYHEAD_FANCY_MIN_FPS) : 55;
        const fancyMinFpsZoomedIn = Number.isFinite(window.__DG_PLAYHEAD_FANCY_MIN_FPS_ZOOMED_IN) ? Number(window.__DG_PLAYHEAD_FANCY_MIN_FPS_ZOOMED_IN) : 50;

        const playheadFancyDesired = !playheadSimpleOnly && (
          (playheadFps >= fancyMinFps) ||
          ((zoomForOverlay > 0.9) && (playheadFps >= fancyMinFpsZoomedIn))
        );
        // If global FPS pressure has switched us into "simple playhead" mode,
        // drop fancy immediately (do NOT wait for a phase wrap to re-lock).
        // This is generic (FPS-based), not gesture-based, and not device-count-based.
        if (playheadSimpleOnly) {
          panel.__dgPlayheadFancyLocked = false;
        }
        if (phaseJustWrapped || panel.__dgPlayheadFancyLocked == null) {
          panel.__dgPlayheadFancyLocked = playheadFancyDesired;
        }
        if (phaseJustWrapped || panel.__dgPlayheadHue == null) {
          panel.__dgPlayheadHue = d.pickPlayheadHue(strokes);
        }
        const playheadFancy = !!panel.__dgPlayheadFancyLocked;
        const playheadDrawSimple = playheadSimpleOnly || !playheadFancy;
        const canUseTutorialLayer = d.getTutorialHighlightMode() === 'none' && !!tutorialCtx?.canvas;
        const playheadLayer = useSeparatePlayhead
          ? 'playhead'
          : (playheadDrawSimple && canUseTutorialLayer) ? 'tutorial' : 'flash';
        const wantsPlayhead = !!(info && d.isRunning() && isActiveInChain && !probablyStale);

        // Throttle playhead draws during heavy pan/zoom (especially with many panels),
        // but DO NOT clear the existing playhead unless it genuinely shouldn't exist.
        // Otherwise we'd flicker because the "!shouldRenderPlayhead" clear-path also
        // resets __dgPlayheadLastX.
        let allowPlayheadThisFrame = wantsPlayhead;
        try {
          const overrideEvery = Number(window.__PERF_DG_PLAYHEAD_EVERY);
          // Quality should NOT change just because the user is gesturing.
          // All visible toys are treated equally (unless in small-screen focus edit mode).
          const __dgFps =
            (typeof window !== 'undefined' && Number.isFinite(window.__MT_SM_FPS)) ? window.__MT_SM_FPS :
            ((typeof window !== 'undefined' && Number.isFinite(window.__MT_FPS)) ? window.__MT_FPS : 60);
          void __dgFps;

          // Global quality knob (not gesture-based). When low, we may reduce *detail*, not cadence.
          // Leave playhead cadence at full rate; later we can swap to low-detail visual instead of skipping frames.
          let playheadEvery = 1;
          if (Number.isFinite(overrideEvery) && overrideEvery >= 1) {
            playheadEvery = Math.floor(overrideEvery);
          }
          if (playheadEvery > 1) {
            panel.__dgPlayheadFrame = (panel.__dgPlayheadFrame | 0) + 1;
            allowPlayheadThisFrame = ((panel.__dgPlayheadFrame % playheadEvery) === 0);
          }
        } catch {}

        const shouldRenderPlayhead = wantsPlayhead && allowPlayheadThisFrame;
        const lastX = Number.isFinite(panel.__dgPlayheadLastX) ? panel.__dgPlayheadLastX : null;
        const lastLayer = panel.__dgPlayheadLayer || playheadLayer;
        const lastGridArea = panel.__dgPlayheadLastGridArea || gridArea;
        const clearPlayheadBandAt = (clearX, layer) => {
          if (!Number.isFinite(clearX) || !gridArea) return;
          const clearArea = (lastGridArea && lastGridArea.w > 0) ? lastGridArea : gridArea;
          const clearCtx = (layer === 'tutorial')
            ? tutorialCtx
            : (layer === 'playhead') ? playheadFrontCtx : fctx;
          if (!clearCtx?.canvas) return;
          const defaultBand = Math.max(6, Math.round(Math.max(0.8 * cw, Math.min(clearArea.w * 0.08, 2.2 * cw))));
          const band = Number.isFinite(panel.__dgPlayheadClearBand) ? panel.__dgPlayheadClearBand : defaultBand;
          const clearBandAt = () => {
            const y0 = Math.floor(clearArea.y) - 4;
            const y1 = Math.ceil(clearArea.y + clearArea.h) + 4;
            const h = Math.max(0, y1 - y0);
            clearCtx.clearRect(clearX - band - 1, y0, band * 2 + 2, h);
          };
          if (clearCtx === playheadFrontCtx) {
            d.R.resetCtx(clearCtx);
            d.__dgWithLogicalSpace(clearCtx, clearBandAt);
          } else {
            const clipArea = { x: clearArea.x, y: Math.floor(clearArea.y) - 2, w: clearArea.w, h: Math.ceil(clearArea.h) + 4 };
            d.R.resetCtx(clearCtx);
            d.__dgWithLogicalSpace(clearCtx, () => {
              d.R.withOverlayClip(clearCtx, clipArea, false, clearBandAt);
            });
          }
        };

        // If the phase wrapped but we skip rendering this frame (e.g. zoom/throttle),
        // clear the previous end-band so the playhead doesn't "stick".
        if (phaseJustWrapped && lastX != null) {
          try { clearPlayheadBandAt(lastX, lastLayer); } catch {}
        }

        if (!wantsPlayhead) {
          const lastGridAreaFallback = panel.__dgPlayheadLastGridArea || gridArea;
          if (lastX != null) {
            if (lastLayer === 'tutorial' && d.getTutorialHighlightMode() === 'none' && tutorialCtx?.canvas) {
              const __overlayClearStart = (perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
                ? performance.now()
                : 0;
              d.R.resetCtx(tutorialCtx);
              d.R.withLogicalSpace(tutorialCtx, () => {
                const active = d.getActiveTutorialCanvas();
                const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
                const tw = cssW || (active?.width ?? tutorialCtx.canvas.width ?? 0) / scale;
                const th = cssH || (active?.height ?? tutorialCtx.canvas.height ?? 0) / scale;
                tutorialCtx.clearRect(0, 0, tw, th);
              });
              d.markTutorialLayerCleared();
              if (DG_SINGLE_CANVAS) overlayCompositeNeeded = true;
              if (__overlayClearStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.clear', performance.now() - __overlayClearStart); } catch {}
              }
            } else if (lastLayer === 'playhead' && playheadFrontCtx?.canvas) {
              const __overlayClearStart = (perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
                ? performance.now()
                : 0;
              d.R.resetCtx(playheadFrontCtx);
              const clearPlayheadBand = () => {
                const clearArea = (lastGridAreaFallback && lastGridAreaFallback.w > 0) ? lastGridAreaFallback : gridArea;
                const defaultBand = Math.max(6, Math.round(Math.max(0.8 * cw, Math.min(clearArea.w * 0.08, 2.2 * cw))));
                const band = Number.isFinite(panel.__dgPlayheadClearBand) ? panel.__dgPlayheadClearBand : defaultBand;
                const y0 = Math.floor(clearArea.y) - 4;
                const y1 = Math.ceil(clearArea.y + clearArea.h) + 4;
                const h = Math.max(0, y1 - y0);
                playheadFrontCtx.clearRect(lastX - band - 1, y0, band * 2 + 2, h);
              };
              clearPlayheadBand();
              d.markPlayheadLayerCleared();
              if (DG_SINGLE_CANVAS) overlayCompositeNeeded = true;
              if (__overlayClearStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.clear', performance.now() - __overlayClearStart); } catch {}
              }
            } else if (fctx?.canvas) {
              const __overlayClearStart = (perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
                ? performance.now()
                : 0;
              const flashSurface = d.getActiveFlashCanvas();
              const __flashDpr = d.__dgGetCanvasDprFromCss(flashSurface, cssW, paintDpr);
              d.R.resetCtx(fctx);
              d.__dgWithLogicalSpaceDpr(d.R, fctx, __flashDpr, () => {
                const scale = (Number.isFinite(__flashDpr) && __flashDpr > 0) ? __flashDpr : 1;
                const width = cssW || (flashSurface?.width ?? fctx.canvas.width ?? 0) / scale;
                const height = cssH || (flashSurface?.height ?? fctx.canvas.height ?? 0) / scale;
                void width;
                void height;
                if (overlayCoreWanted) {
                  // We can't clear the full overlay here without risking a 1-frame expose
                  // of the base (white) line if overlay redraw is throttled.
                  // BUT: if the playhead is no longer wanted (e.g. chain-active race at wrap),
                  // we *must* clear the playhead itself, otherwise it can get "stuck" at the
                  // end of the path until a later playhead overlaps it.
                  const clearArea = (lastGridAreaFallback && lastGridAreaFallback.w > 0) ? lastGridAreaFallback : gridArea;
                  const defaultBand = Math.max(6, Math.round(Math.max(0.8 * cw, Math.min(clearArea.w * 0.08, 2.2 * cw))));
                  const band = Number.isFinite(panel.__dgPlayheadClearBand) ? panel.__dgPlayheadClearBand : defaultBand;
                  const y0 = Math.floor(clearArea.y) - 4;
                  const y1 = Math.ceil(clearArea.y + clearArea.h) + 4;
                  const h = Math.max(0, y1 - y0);
                  fctx.clearRect(lastX - band - 1, y0, band * 2 + 2, h);

                  d.setNeedsUIRefresh();
                  overlayCompositeNeeded = true;
                } else {
                  const { x, y, w, h } = d.R.getOverlayClearRect({
                    canvas: flashSurface || fctx.canvas,
                    pad: d.R.getOverlayClearPad(),
                    allowFull: !!panel.__dgFlashOverlayOutOfGrid,
                    gridArea,
                  });
                  fctx.clearRect(x, y, w, h);
                }
              });
              if (overlayCoreWanted) {
                d.markFlashLayerActive();
              } else {
                d.markFlashLayerCleared();
              }
              if (DG_SINGLE_CANVAS) overlayCompositeNeeded = true;
              if (__overlayClearStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.clear', performance.now() - __overlayClearStart); } catch {}
              }
            }
          }
          panel.__dgPlayheadLastX = null;
          panel.__dgPlayheadLayer = null;
          panel.__dgPlayheadLastGridArea = null;
        }

        if (shouldRenderPlayhead) {
          const playheadCtx = (playheadLayer === 'tutorial')
            ? tutorialCtx
            : (playheadLayer === 'playhead') ? playheadFrontCtx : fctx;
          panel.__dgPlayheadLastRenderTs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now()
            : Date.now();
          if ((playheadCtx === tutorialCtx || playheadCtx === playheadFrontCtx || !overlayClearedThisFrame) && lastX != null) {
            const clearCtx = (lastLayer === 'tutorial')
              ? tutorialCtx
              : (lastLayer === 'playhead') ? playheadFrontCtx : fctx;
            if (clearCtx?.canvas && gridArea) {
              const clearArea = (lastGridArea && lastGridArea.w > 0) ? lastGridArea : gridArea;
              const defaultBand = Math.max(6, Math.round(Math.max(0.8 * cw, Math.min(clearArea.w * 0.08, 2.2 * cw))));
              const band = Number.isFinite(panel.__dgPlayheadClearBand) ? panel.__dgPlayheadClearBand : defaultBand;
              d.R.resetCtx(clearCtx);
              const clearPlayheadBand = () => {
                const y0 = Math.floor(clearArea.y) - 4;
                const y1 = Math.ceil(clearArea.y + clearArea.h) + 4;
                const h = Math.max(0, y1 - y0);
                clearCtx.clearRect(lastX - band - 1, y0, band * 2 + 2, h);
              };
              if (clearCtx === playheadFrontCtx) {
                d.R.resetCtx(clearCtx);
                d.__dgWithLogicalSpace(clearCtx, clearPlayheadBand);
              } else {
                const clipArea = { x: clearArea.x, y: Math.floor(clearArea.y) - 2, w: clearArea.w, h: Math.ceil(clearArea.h) + 4 };
                d.R.resetCtx(clearCtx);
                d.__dgWithLogicalSpace(clearCtx, () => {
                  d.R.withOverlayClip(clearCtx, clipArea, false, clearPlayheadBand);
                });
              }
              d.emitDG('overlay-clear', { reason: 'playhead-band' });
            }
          }
          if (!useSeparatePlayhead && !overlayClearedThisFrame) {
            const __overlayClearStart = (perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
              ? performance.now()
              : 0;
            try {
              if (playheadCtx === tutorialCtx) {
                d.R.resetCtx(tutorialCtx);
                d.R.withLogicalSpace(tutorialCtx, () => {
                  const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
                  const active = d.getActiveTutorialCanvas();
                  const width = cssW || (active?.width ?? tutorialCtx.canvas.width ?? 0) / scale;
                  const height = cssH || (active?.height ?? tutorialCtx.canvas.height ?? 0) / scale;
                  tutorialCtx.clearRect(0, 0, width, height);
                });
                d.markTutorialLayerCleared();
              } else {
                const flashSurface = d.getActiveFlashCanvas();
                d.R.resetCtx(fctx);
                d.R.withLogicalSpace(fctx, () => {
                  const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
                  const width = cssW || (flashSurface?.width ?? 0) / scale;
                  const height = cssH || (flashSurface?.height ?? 0) / scale;
                  void width;
                  void height;
                  if (!overlayCoreWanted) {
                    const { x, y, w, h } = d.R.getOverlayClearRect({
                      canvas: flashSurface,
                      pad: d.R.getOverlayClearPad(),
                      allowFull: !!panel.__dgFlashOverlayOutOfGrid,
                      gridArea,
                    });
                    fctx.clearRect(x, y, w, h);
                    d.emitDG('overlay-clear', { reason: 'playhead' });
                    d.markFlashLayerCleared();
                  }
                });
                overlayClearedThisFrame = true;
              }
            } catch {}
            if (perfOn && __overlayClearStart) {
              try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.clear', performance.now() - __overlayClearStart); } catch {}
            }
          }
          overlayCompositeNeeded = true;
          if (playheadCtx === tutorialCtx) {
            d.markTutorialLayerActive();
          } else if (playheadCtx === playheadFrontCtx) {
            d.markPlayheadLayerActive();
          } else {
            d.markFlashLayerActive();
          }
          // Calculate playhead X position based on loop phase
          const playheadX = gridArea.x + info.phase01 * gridArea.w;
          if (typeof window !== 'undefined' && window.__DG_PLAYHEAD_TRACE) {
            try {
              const drawPayload = {
                id: panel?.id || null,
                playheadLayer,
                playheadX: Number.isFinite(playheadX) ? +playheadX.toFixed(2) : playheadX,
                gridArea: gridArea ? { x: gridArea.x, y: gridArea.y, w: gridArea.w, h: gridArea.h } : null,
                ctxRole: playheadCtx?.canvas?.getAttribute?.('data-role') || null,
                ctxSize: playheadCtx?.canvas ? { w: playheadCtx.canvas.width || 0, h: playheadCtx.canvas.height || 0 } : null,
              };
              console.log(`[DG][playhead][draw] ${JSON.stringify(drawPayload)}`);
            } catch {}
          }
          // If the playhead wrapped (end -> start), ensure we clear the "stuck" end segment.
          // This can happen if playback briefly stops rendering at the end-of-loop boundary.
          try {
            const prevX = Number.isFinite(lastX) ? lastX : null;
            if (prevX != null && gridArea && Number.isFinite(gridArea.w) && gridArea.w > 0) {
              const wrapped = (playheadX < (gridArea.x + gridArea.w * 0.25)) && (prevX > (gridArea.x + gridArea.w * 0.75));
              if (wrapped) {
                const clearCtx = (lastLayer === 'tutorial')
                  ? tutorialCtx
                  : (lastLayer === 'playhead') ? playheadFrontCtx : fctx;
                if (clearCtx?.canvas) {
                  const defaultBand = Math.max(6, Math.round(Math.max(0.8 * cw, Math.min(gridArea.w * 0.08, 2.2 * cw))));
                  const band = Number.isFinite(panel.__dgPlayheadClearBand) ? panel.__dgPlayheadClearBand : defaultBand;
                  const clearBandAt = () => {
                    const y0 = Math.floor(gridArea.y) - 4;
                    const y1 = Math.ceil(gridArea.y + gridArea.h) + 4;
                    const h = Math.max(0, y1 - y0);
                    clearCtx.clearRect(prevX - band - 1, y0, band * 2 + 2, h);
                  };
                  if (clearCtx === playheadFrontCtx) {
                    d.R.resetCtx(clearCtx);
                    d.__dgWithLogicalSpace(clearCtx, clearBandAt);
                  } else {
                    const clipArea = { x: gridArea.x, y: Math.floor(gridArea.y) - 2, w: gridArea.w, h: Math.ceil(gridArea.h) + 4 };
                    d.R.resetCtx(clearCtx);
                    d.__dgWithLogicalSpace(clearCtx, () => {
                      d.R.withOverlayClip(clearCtx, clipArea, false, clearBandAt);
                    });
                  }
                }
              }
            }
          } catch {}
          panel.__dgPlayheadLastX = playheadX;
          panel.__dgPlayheadLayer = playheadLayer;
          panel.__dgPlayheadLastGridArea = gridArea ? { x: gridArea.x, y: gridArea.y, w: gridArea.w, h: gridArea.h } : null;

          // Use a dedicated overlay context for the playhead to avoid wiping strokes.
          const __drawPlayheadInner = () => {
            playheadCtx.save();

            // Width of the soft highlight band scales with a column, clamped
            const gradientWidth = Math.round(
              Math.max(0.8 * cw, Math.min(gridArea.w * 0.08, 2.2 * cw))
            );

            // IMPORTANT: the fancy playhead uses cached glow sprites.
            // During zoom, cw/gridArea.h change continuously -> cache misses -> expensive sprite rebuilds.
            // Quantize dimensions so the cache actually hits while gesturing.
            const __dgQuant = (v, step, min = step) => {
              const n = Number(v);
              if (!Number.isFinite(n)) return min;
              const sStep = Math.max(1, Number(step) || 1);
              return Math.max(min, Math.round(n / sStep) * sStep);
            };
            const spriteGradientWidth = __dgQuant(gradientWidth, 8, 32);
            const spriteHeight = __dgQuant(gridArea.h, 16, 96);
            const playheadLineW = playheadDrawSimple ? Math.max(2, cw * 0.08) : 3;
            const trailLineCount = playheadDrawSimple ? 0 : 3;
            const gap = playheadDrawSimple ? 0 : 28; // A constant, larger gap
            const trailW0 = 2.5;
            const trailWStep = 0.6;
            const extraTrail = playheadDrawSimple ? 0 : (trailLineCount * gap + 6);
            const baseBand = Math.max(gradientWidth / 2, playheadLineW / 2);
            panel.__dgPlayheadClearBand = Math.max(6, Math.ceil(baseBand + extraTrail));

            const hue = Number.isFinite(panel.__dgPlayheadHue)
              ? panel.__dgPlayheadHue
              : d.pickPlayheadHue(strokes);

            // Header sweep: decouple VISUAL from FORCE.
            //
            // - Visual sweep is a cheap translucent band drawn on the playhead overlay (always "looks right").
            // - Force sweep is the expensive field push along the segment (particle simulation).
            //
            // Both degrade by FPS (generic "framerate is low, fix it"), not gesture or panel count.
            try {
              let sweepDir = s.headerSweepDirX || 1;
              if (currentPhase != null && prevPhase != null) {
                if (phaseJustWrapped) {
                  sweepDir = 1;
                } else if (Math.abs(currentPhase - prevPhase) > 1e-4) {
                  sweepDir = (currentPhase - prevPhase) >= 0 ? 1 : -1;
                }
              }
              s.headerSweepDirX = sweepDir;

              const fpsHint = Number.isFinite(fpsLive) ? fpsLive : null;
              const __disableForceFps =
                (typeof window !== 'undefined' && Number.isFinite(window.__DG_HEADER_SWEEP_FORCE_DISABLE_FPS))
                  ? Number(window.__DG_HEADER_SWEEP_FORCE_DISABLE_FPS)
                  : 50; // default: disable forces below ~50fps
              const __disableVisualFps =
                (typeof window !== 'undefined' && Number.isFinite(window.__DG_HEADER_SWEEP_VISUAL_DISABLE_FPS))
                  ? Number(window.__DG_HEADER_SWEEP_VISUAL_DISABLE_FPS)
                  : 28; // visual can survive lower; off only when things are dire

              const allowVisual = (fpsHint == null) ? true : (fpsHint >= __disableVisualFps);
              const allowForce  = (fpsHint == null) ? true : (fpsHint >= __disableForceFps);

              // VISUAL-ONLY sweep (cheap): translucent band behind/with playhead.
              if (allowVisual) {
                const bandW = Math.max(18, Math.round(gradientWidth * 0.9));
                const x0 = playheadX - bandW * 0.5;
                const x1 = playheadX + bandW * 0.5;
                const g = playheadCtx.createLinearGradient(x0, 0, x1, 0);
                g.addColorStop(0.00, 'rgba(255,255,255,0)');
                g.addColorStop(0.45, `hsla(${(hue + 45).toFixed(0)}, 100%, 70%, 0.035)`);
                g.addColorStop(0.55, `hsla(${(hue + 45).toFixed(0)}, 100%, 70%, 0.035)`);
                g.addColorStop(1.00, 'rgba(255,255,255,0)');
                const __vStart = (__phMark ? performance.now() : 0);
                playheadCtx.save();
                playheadCtx.globalCompositeOperation = 'source-over';
                playheadCtx.fillStyle = g;
                playheadCtx.fillRect(x0, gridArea.y, bandW, gridArea.h);
                playheadCtx.restore();
                if (__vStart) {
                  try { __phMark('drawgrid.playhead.headerSweepVisual', performance.now() - __vStart); } catch {}
                }
              }

              // FORCE sweep (expensive): push along the full segment.
              // Degrade aggressively by FPS: run less often + fewer steps, and OFF entirely when needed.
              let sweepEvery = 1;
              let sweepMaxSteps = 36;
              if (fpsHint != null) {
                if (fpsHint < (__disableForceFps + 3)) { sweepEvery = 10; sweepMaxSteps = 6; }
                else if (fpsHint < 55) { sweepEvery = 6; sweepMaxSteps = 10; }
                else if (fpsHint < 60) { sweepEvery = 3; sweepMaxSteps = 18; }
                else { sweepEvery = 2; sweepMaxSteps = 24; }
              }

              panel.__dgPlayheadSweepFrame = (panel.__dgPlayheadSweepFrame || 0) + 1;
              if (allowForce && sweepEvery > 0 && (panel.__dgPlayheadSweepFrame % sweepEvery) === 0) {
                const baseSweepMaxSteps = 36;
                const forceMul = Math.max(
                  1,
                  sweepEvery * (baseSweepMaxSteps / Math.max(1, sweepMaxSteps)) * 1.35
                );
                const __hsStart = (__phMark ? performance.now() : 0);
                d.FF.pushHeaderSweepAt(playheadX, { lineWidthPx: gradientWidth, maxSteps: sweepMaxSteps, forceMul });
                if (__hsStart) {
                  try { __phMark('drawgrid.playhead.headerSweep', performance.now() - __hsStart); } catch {}
                }
              }
            } catch (e) { /* fail silently */ }

            if (playheadDrawSimple) {
              playheadCtx.globalAlpha = 0.9;
              playheadCtx.strokeStyle = `hsl(${(hue + 45).toFixed(0)}, 100%, 70%)`;
              playheadCtx.lineWidth = playheadLineW;
              playheadCtx.shadowColor = 'transparent';
              playheadCtx.shadowBlur = 0;
              playheadCtx.beginPath();
              playheadCtx.moveTo(playheadX, gridArea.y);
              playheadCtx.lineTo(playheadX, gridArea.y + gridArea.h);
              playheadCtx.stroke();
              playheadCtx.globalAlpha = 1.0;
            } else {
              const __spriteGetStart = __phMark ? performance.now() : 0;
              const composite = d.getPlayheadCompositeSprite({
                gradientWidth: spriteGradientWidth,
                height: spriteHeight,
                hue,
                trailLineCount,
                gap,
                mainLineW: playheadLineW,
                trailW0,
                trailWStep,
              });
              if (__spriteGetStart) {
                try { __phMark('drawgrid.playhead.spriteGet', performance.now() - __spriteGetStart); } catch {}
              }
              if (composite) {
                const originX = Number.isFinite(composite.__dgOriginX)
                  ? composite.__dgOriginX
                  : (composite.width / 2);
                // If our cached sprite dims are already "close enough", avoid per-frame scaling.
                // Scaling a tall glow sprite is surprisingly expensive during pan/zoom.
                const dstH = (Math.abs(gridArea.h - spriteHeight) <= 8) ? spriteHeight : gridArea.h;
                const dstY = gridArea.y + (gridArea.h - dstH) * 0.5;
                const __imgStart = __phMark ? performance.now() : 0;
                playheadCtx.drawImage(
                  composite,
                  playheadX - originX,
                  dstY,
                  composite.width,
                  dstH
                );
                if (__imgStart) {
                  try { __phMark('drawgrid.playhead.drawImage', performance.now() - __imgStart); } catch {}
                }
              }
            }

            playheadCtx.restore();
          };
          const drawPlayhead = () => {
            d.R.resetCtx(playheadCtx);
            d.__dgWithLogicalSpace(playheadCtx, __drawPlayheadInner);
          };
          if (playheadCtx === playheadFrontCtx) {
            drawPlayhead();
          } else {
            d.R.withOverlayClip(playheadCtx, gridArea, false, drawPlayhead);
          }
        }
      } catch (e) { /* fail silently */ }
      if (__playheadStart) {
        const __playheadDt = performance.now() - __playheadStart;
        try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.playhead', __playheadDt); } catch {}
      }
    } else {
      const info = d.getLoopInfo();
      if (info) {
        s.localLastPhase = info.phase01;
      }
    }

    return { overlayCompositeNeeded, overlayClearedThisFrame };
  }

  return { renderPlayhead };
}
