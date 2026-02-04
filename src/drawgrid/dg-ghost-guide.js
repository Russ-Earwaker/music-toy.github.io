// src/drawgrid/dg-ghost-guide.js
// Ghost guide behavior and auto-sweep controller.

export function createDgGhostGuide({
  panel,
  body,
  layersRoot,
  frontCanvas,
  getLayoutSize,
  layout,
  isPanelCulled,
  getGridArea,
  getGridAreaLogical,
  getRows,
  getCssW,
  getCssH,
  getPaintDpr,
  getUsingBackBuffers,
  getActiveGhostCanvas,
  getGhostCtx,
  getGhostFrontCtx,
  getGhostBackCtx,
  markGhostLayerActive,
  markGhostLayerCleared,
  dgGhostTrace,
  __dgGhostMaybeStack,
  __dgGetCanvasDprFromCss,
  __dgWithLogicalSpaceDpr,
  __dgDescribeCanvasScale,
  __dgGetDrawLabelYRange,
  __dgComputeGhostSweepLR,
  getOverlayZoomSnapshot,
  R,
  DG_GHOST_DEBUG,
  DG_KNOCK,
  FF,
  dgRenderScaleTrace,
  drawgridLog,
  __dgLogFirstPoke,
  knockLettersAt,
  getLoopInfo,
  syncLetterFade,
  updateDrawLabel,
  __dgElSummary,
  __auditZoomSizes,
  getIsRestoring,
  getStrokes,
  getCurrentMap,
  setLocalLastPhase,
  pulseField,
} = {}) {
  let ghostGuideAnimFrame = null;
  let ghostGuideLoopId = null;
  let ghostGuideAutoActive = false;
  let ghostGuideRunning = false;
  let ghostFadeRAF = 0;
  const GHOST_SWEEP_DURATION = 2000;
  const GHOST_SWEEP_PAUSE = 1000;
  // Extra tracing to diagnose "restart mid-path" / unexpected clears.
  let __dgGhostAutoSeq = 0;
  let __dgGhostSweepSeq = 0;
  let __dgGhostLastAutoReason = null;
  let __dgGhostLastStopReason = null;
  let __dgGhostLastSweepReason = null;
  const readGridArea = () => (typeof getGridArea === 'function' ? getGridArea() : null) || { x: 0, y: 0, w: 0, h: 0 };
  const readGridAreaLogical = () => (typeof getGridAreaLogical === 'function' ? getGridAreaLogical() : null) || { w: 0, h: 0 };
  const readRows = () => (typeof getRows === 'function' ? getRows() : 0);
  const readCssW = () => (typeof getCssW === 'function' ? getCssW() : null);
  const readCssH = () => (typeof getCssH === 'function' ? getCssH() : null);
  const readPaintDpr = () => (typeof getPaintDpr === 'function' ? getPaintDpr() : null);
  const readUsingBackBuffers = () => (typeof getUsingBackBuffers === 'function' ? getUsingBackBuffers() : null);
  const readComputeGhostSweepLR = () => {
    const fn = (typeof __dgComputeGhostSweepLR === 'function') ? __dgComputeGhostSweepLR
      : (typeof window !== 'undefined' && typeof window.__DG_COMPUTE_GHOST_SWEEP_LR === 'function')
        ? window.__DG_COMPUTE_GHOST_SWEEP_LR
        : null;
    return fn;
  };

  function stopGhostGuide({ immediate = false, preserveTrail = false, reason = null } = {}) {
    const ghostCtx = (readUsingBackBuffers() ? getGhostBackCtx?.() : getGhostFrontCtx?.()) || getGhostCtx?.();
    if (ghostGuideAnimFrame) {
      cancelAnimationFrame(ghostGuideAnimFrame);
      ghostGuideAnimFrame = null;
    }
    ghostGuideRunning = false;
    if (ghostFadeRAF) {
      cancelAnimationFrame(ghostFadeRAF);
      ghostFadeRAF = 0;
    }
    // Record explicit caller reason (best-effort) for debug.
    if (reason) {
      __dgGhostLastStopReason = String(reason);
    }
    try {
      if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
        const stack = __dgGhostMaybeStack?.('DG stopGhostGuide');
        dgGhostTrace?.('stop:enter', {
          id: panel?.id || null,
          immediate,
          preserveTrail,
          ghostGuideRunning,
          usingBackBuffers: readUsingBackBuffers(),
          ghostLayerEmpty: panel?.__dgGhostLayerEmpty ?? null,
          autoActive: ghostGuideAutoActive,
          loopId: !!ghostGuideLoopId,
          animFrame: !!ghostGuideAnimFrame,
          lastAutoReason: __dgGhostLastAutoReason,
          stopReason: reason || null,
          lastStopReason: __dgGhostLastStopReason,
          lastSweepReason: __dgGhostLastSweepReason,
          stack,
        });
      }
    } catch {}

    // If we're about to start a new sweep, we want to stop the animation without clearing
    // or fading the existing trail (otherwise the trail appears to "cut out" mid-path).
    if (preserveTrail) {
      return;
    }
    if (immediate) {
      const ghostSurface = getActiveGhostCanvas?.();
      R.resetCtx(ghostCtx);
      R.resetCtx(ghostCtx);
      const ghostDpr = __dgGetCanvasDprFromCss?.(ghostCtx?.canvas, readCssW(), readPaintDpr());
      __dgWithLogicalSpaceDpr?.(R, ghostCtx, ghostDpr, () => {
        const { x, y, w, h } = R.getOverlayClearRect({
          canvas: ghostSurface,
          pad: R.getOverlayClearPad() * 1.2,
          gridArea: readGridArea(),
        });
        try {
          if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
            dgGhostTrace?.('stop:immediate-clear', {
              id: panel?.id || null,
              usingBackBuffers: readUsingBackBuffers(),
              ghostSurface: __dgElSummary?.(ghostSurface),
              ghostCtxCanvas: ghostCtx?.canvas ? __dgElSummary?.(ghostCtx.canvas) : null,
              clearRect: { x, y, w, h },
              cssW: readCssW(),
              cssH: readCssH(),
              paintDpr: readPaintDpr(),
              ghostAutoActive: ghostGuideAutoActive,
              ghostRunning: ghostGuideRunning,
              sweepSeq: __dgGhostSweepSeq,
            });
          }
        } catch {}
        ghostCtx.clearRect(x, y, w, h);
      });
      markGhostLayerCleared?.();
    }
  }

  // NOTE: We intentionally do not fade/clear the ghost trail over time.
  // The guide line should remain continuous and never "cut out" mid-path.
  // It will be cleared explicitly via stopGhostGuide({ immediate: true }) when needed.
  function fadeOutGhostTrail(step = 0) {
    const ghostCtx = (readUsingBackBuffers() ? getGhostBackCtx?.() : getGhostFrontCtx?.()) || getGhostCtx?.();
    const ghostSurface = getActiveGhostCanvas?.();
    try {
      if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
        dgGhostTrace?.('fade:enter', {
          id: panel?.id || null,
          step,
          usingBackBuffers: readUsingBackBuffers(),
          ghostGuideRunning,
          ghostGuideAutoActive,
          stack: __dgGhostMaybeStack?.('DG fadeOutGhostTrail'),
        });
      }
    } catch {}
    if (!ghostSurface) {
      ghostFadeRAF = 0;
      return;
    }
    R.resetCtx(ghostCtx);
    R.resetCtx(ghostCtx);
    const ghostDpr = __dgGetCanvasDprFromCss?.(ghostCtx?.canvas, readCssW(), readPaintDpr());
    __dgWithLogicalSpaceDpr?.(R, ghostCtx, ghostDpr, () => {
      const { x, y, w, h } = R.getOverlayClearRect({
        canvas: ghostSurface,
        pad: R.getOverlayClearPad(),
        gridArea: readGridArea(),
      });
      ghostCtx.globalCompositeOperation = 'destination-out';
      ghostCtx.globalAlpha = 0.18;
      ghostCtx.fillRect(x, y, w, h);
    });
    ghostCtx.globalCompositeOperation = 'source-over';
    ghostCtx.globalAlpha = 1.0;
    markGhostLayerActive?.();
    if (DG_GHOST_DEBUG && typeof startY === 'number' && typeof endY === 'number') {
      try {
        const from = { x: readGridArea().x - 24, y: startY };
        const to = { x: readGridArea().x + readGridArea().w + 24, y: endY };
        const labelBand = __dgGetDrawLabelYRange?.();
        if (labelBand) R.drawGhostDebugBand(ghostCtx, labelBand);
        R.drawGhostDebugPath(ghostCtx, { from, to, crossY });
      } catch {}
    }
    if (step < 5) {
      ghostFadeRAF = requestAnimationFrame(() => fadeOutGhostTrail(step + 1));
    } else {
      ghostFadeRAF = 0;
    }
  }

  function startGhostGuide({
    startX, endX,
    startY, endY,
    crossY = null,
    duration = 2000,
    wiggle = true,
    trail = true,
    trailEveryMs = 50,
    trailCount = 3,
    trailSpeed = 1.2,
  } = {}) {
    try {
      if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
        const stack = __dgGhostMaybeStack?.('DG startGhostGuide');
        dgGhostTrace?.('start:enter', {
          id: panel?.id || null,
          usingBackBuffers: readUsingBackBuffers(),
          params: {
            startX, endX, startY, endY, crossY,
            duration, wiggle, trail, trailEveryMs, trailCount, trailSpeed,
          },
          ghostLayerEmpty: panel?.__dgGhostLayerEmpty ?? null,
          ghostGuideRunning,
          stack,
        });
      }
    } catch {}
    // IMPORTANT: when starting a new sweep, do NOT hard-clear the ghost surface.
    // We want the trail to remain continuous across layout/viewport churn.
    stopGhostGuide({ immediate: false, preserveTrail: true, reason: 'start:new-sweep' });
    if (ghostFadeRAF) {
      cancelAnimationFrame(ghostFadeRAF);
      ghostFadeRAF = 0;
    }
    const { w, h } = getLayoutSize?.() || {};
    if (!w || !h) {
      layout?.(true);
    }
    const ghostCtx = getGhostCtx?.();
    const ghostDpr = __dgGetCanvasDprFromCss?.(ghostCtx?.canvas, readCssW(), readPaintDpr());

    dgGhostTrace?.('start', {
      startX, startY, endX, endY, crossY,
      duration,
      layout: { w: (getLayoutSize?.()?.w || w || 0), h: (getLayoutSize?.()?.h || h || 0) },
      cssW: readCssW(),
      cssH: readCssH(),
      elPanel: __dgElSummary?.(panel),
      elBody: __dgElSummary?.(body),
      elLayers: __dgElSummary?.(layersRoot),
      elPaint: __dgElSummary?.(frontCanvas),

      paintDpr: readPaintDpr(),
      ghostDpr,
      ghostCanvas: ghostCtx?.canvas ? { w: ghostCtx.canvas.width, h: ghostCtx.canvas.height, cssW: ghostCtx.canvas.style?.width || null, cssH: ghostCtx.canvas.style?.height || null } : null,
    });

    const gx = readGridArea().x, gy = readGridArea().y, gw = readGridArea().w, gh = readGridArea().h;

    if (typeof startX !== 'number' || Number.isNaN(startX)) {
      startX = gx;
    }
    if (typeof endX !== 'number' || Number.isNaN(endX)) {
      endX = gx + gw;
    }
    if (startX > endX) [startX, endX] = [endX, startX];

    if (typeof startY !== 'number' || Number.isNaN(startY)) {
      startY = gy;
    }
    if (typeof endY !== 'number' || Number.isNaN(endY)) {
      endY = gy + gh;
    }

    const __gpathStatic = {
      from: { x: startX, y: startY },
      to: { x: endX, y: endY },
      crossY,
    };

    if (typeof window !== 'undefined' && window.DG_ZOOM_AUDIT && !window.__DG_FIRST_GPATH__) {
      window.__DG_FIRST_GPATH__ = true;
      const camSnapshot = getOverlayZoomSnapshot?.();
      console.log('[DG][GHOST][PATH]', {
        zoomScale: camSnapshot?.scale || 1,
        from: { x: startX, y: startY },
        to: { x: endX, y: endY },
        crossY,
        gridArea: readGridArea() ? { ...readGridArea() } : null,
        gridAreaLogical: readGridAreaLogical() ? { ...readGridAreaLogical() } : null,
      });
    }

    const startTime = performance.now();
    let last = null;
    let lastTrail = 0;
    let lastGhostAudit = 0;
    // Cull can flicker briefly during first pan / viewport settle.
    // If we hard-stop immediately, the ghost sweep "restarts" and the trail looks like it cuts out.
    // Debounce cull before stopping the sweep.
    let culledSince = 0;
    const noiseSeed = Math.random() * 100;
    ghostGuideRunning = true;

    function frame(now) {
      if (!panel.isConnected) return;
      if (!ghostGuideRunning) return;
      if (isPanelCulled?.()) {
        if (!culledSince) culledSince = now;
        // Only stop if we're culled continuously for a while.
        if ((now - culledSince) > 800) {
          ghostGuideRunning = false;
          ghostGuideAnimFrame = null;
          return;
        }
      } else {
        culledSince = 0;
      }
      const ghostSurface = getActiveGhostCanvas?.();
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);

      if (!readGridArea() || !readGridArea().w || !readGridArea().h) {
        layout?.(true);
      }

      const gx = readGridArea().x, gy = readGridArea().y, gw = readGridArea().w, gh = readGridArea().h;
      const wiggleAmp = gh * 0.25;
      const x = startX + (endX - startX) * t;
      // Quadratic curve that bends toward the DRAW label mid-path.
      const q = (v0, v1, v2, tt) => {
        const u = 1 - tt;
        return u * u * v0 + 2 * u * tt * v1 + tt * tt * v2;
      };
      const t1 = Math.min(1, Math.max(0, t));
      const targetCrossY = (typeof crossY === 'number') ? crossY : (startY + endY) * 0.5;
      const tCurve = Math.max(0, Math.min(1, (t1 < 0.5) ? (t1 * 0.9) : (0.1 + t1 * 0.9)));
      let y = q(startY, targetCrossY, endY, tCurve);
      if (wiggle) {
        const wiggleFactor = Math.sin(t * Math.PI * 3) * Math.sin(t * Math.PI * 0.5 + noiseSeed);
        y += wiggleAmp * wiggleFactor;
      }

      const topBound = gy, bottomBound = gy + gh;
      if (y > bottomBound) y = bottomBound - (y - bottomBound);
      else if (y < topBound) y = topBound + (topBound - y);

      const ghostCtx = getGhostCtx?.();
      const __ghostDpr = __dgGetCanvasDprFromCss?.(ghostCtx?.canvas, readCssW(), readPaintDpr());
      try {
        const wr = layersRoot?.getBoundingClientRect?.();
        dgRenderScaleTrace?.('ghost:auto:sweep', {
          panelId: panel?.id || null,
          cssW: readCssW(),
          cssH: readCssH(),
          paintDpr: readPaintDpr(),
          ghostDpr: __ghostDpr,
          gridArea: readGridArea() ? { x: readGridArea().x, y: readGridArea().y, w: readGridArea().w, h: readGridArea().h } : null,
          gridAreaLogical: readGridAreaLogical() ? { w: readGridAreaLogical().w, h: readGridAreaLogical().h } : null,
          wrap: wr ? { w: Math.round(wr.width), h: Math.round(wr.height) } : null,
          ghost: __dgDescribeCanvasScale?.(ghostCtx?.canvas, wr),
        });
      } catch {}
      R.resetCtx(ghostCtx);
      __dgWithLogicalSpaceDpr?.(R, ghostCtx, __ghostDpr, () => {
        const scale = (Number.isFinite(__ghostDpr) && __ghostDpr > 0) ? __ghostDpr : 1;
        const width = readCssW() || (ghostSurface?.width ?? 0) / scale;
        const height = readCssH() || (ghostSurface?.height ?? 0) / scale;
        ghostCtx.globalCompositeOperation = 'destination-out';
        ghostCtx.globalAlpha = 0.1;
        ghostCtx.fillRect(0, 0, width, height);
      });
      ghostCtx.globalCompositeOperation = 'source-over';
      ghostCtx.globalAlpha = 1.0;
      if (DG_GHOST_DEBUG) {
        try {
          const band = __dgGetDrawLabelYRange?.();
          if (band) R.drawGhostDebugBand(ghostCtx, band);
          R.drawGhostDebugPath(ghostCtx, __gpathStatic);
        } catch {}
      } else if (typeof window !== 'undefined' && window.__PERF_DG_OVERLAY_CORE_OFF) {
        try {
          const info = getLoopInfo?.();
          const currentPhase = Number.isFinite(info?.phase01) ? info.phase01 : null;
          if (currentPhase != null) setLocalLastPhase?.(currentPhase);
        } catch {}
      }
      const camSnapshot = getOverlayZoomSnapshot?.();
      const z = camSnapshot?.scale;

      // Disturbance radius in toy space (unchanged: big, soft "snowplow" feel).
      const baseR = DG_KNOCK?.ghostTrail?.radiusToy?.(readGridArea());
      const pointerR = baseR * 1.5;
      const logicalMin = Math.min(
        (readGridAreaLogical()?.w ?? 0),
        (readGridAreaLogical()?.h ?? 0)
      );
      const capR = Math.max(8, Math.min(readGridAreaLogical()?.w ?? 0, readGridAreaLogical()?.h ?? 0) * 0.25);
      const disturbanceRadius = Math.min(pointerR, capR);

      // Visual radius: match the user's drawn line thickness (thickness ≈ lineWidth).
      let visualRadius = disturbanceRadius;
      try {
        const lw = (typeof R.getLineWidth === 'function') ? R.getLineWidth() : null;
        if (Number.isFinite(lw) && lw > 0) {
          // Treat the line width as our visual thickness baseline.
          visualRadius = Math.max(2, lw);
        }
      } catch {}

      if (last) {
        R.resetCtx(ghostCtx);
        __dgWithLogicalSpaceDpr?.(R, ghostCtx, __ghostDpr, () => {
          ghostCtx.globalCompositeOperation = 'source-over';
          ghostCtx.globalAlpha = 0.25;
          ghostCtx.lineCap = 'round';
          ghostCtx.lineJoin = 'round';

          // Make the ghost trail roughly the same thickness as the drawn line.
          let lw = (typeof R.getLineWidth === 'function') ? R.getLineWidth() : null;
          if (!Number.isFinite(lw) || lw <= 0) {
            lw = visualRadius;
          }

          const trailWidth = Math.max(2, lw);
          ghostCtx.lineWidth = trailWidth;
          ghostCtx.strokeStyle = 'rgba(68,112,255,0.7)';
          ghostCtx.beginPath();
          ghostCtx.moveTo(last.x, last.y);
          ghostCtx.lineTo(x, y);
          ghostCtx.stroke();

          // Core dot width ≈ line thickness
          const dotR = Math.max(2, lw * 0.5);
          ghostCtx.beginPath();
          ghostCtx.arc(x, y, dotR, 0, Math.PI * 2);
          ghostCtx.fillStyle = 'rgba(68,112,255,0.85)';
          ghostCtx.fill();
        });
        markGhostLayerActive?.();
      }
      last = { x, y };

      // Physics still uses the larger radius so particles "feel" a fat snowplow.
      FF?.pokeFieldToy?.('ghostTrail', x, y, disturbanceRadius, DG_KNOCK?.ghostTrail?.strength, {
        mode: 'plow',
        highlightMs: 1800,
      });
      if (!window.__DG_FIRST_GHOST_LOGGED__) {
        window.__DG_FIRST_GHOST_LOGGED__ = true;
        drawgridLog?.('[DG][ghostTrail] poke', { x, y, radius: disturbanceRadius, strength: DG_KNOCK?.ghostTrail?.strength });
      }
      __dgLogFirstPoke?.(drawgridLog, 'ghostTrail', disturbanceRadius, DG_KNOCK?.ghostTrail?.strength);

      const lettersRadius = Math.max(
        disturbanceRadius * 2.25,
        logicalMin * 0.2
      );
      knockLettersAt?.(
        x - (readGridArea()?.x || 0),
        y - (readGridArea()?.y || 0),
        { radius: lettersRadius, strength: DG_KNOCK?.lettersMove?.strength, source: 'ghost' }
      );
      if (DG_GHOST_DEBUG) {
        try {
          __dgWithLogicalSpaceDpr?.(R, ghostCtx, __ghostDpr, () => {
            ghostCtx.save();
            const pad = Math.max(20, disturbanceRadius * 3);
            ghostCtx.clearRect(x - pad, y - pad, pad * 2, pad * 2);
            ghostCtx.restore();
          });
          R.drawGhostDebugFrame(ghostCtx, {
            x,
            y,
            radius: disturbanceRadius,
            lettersRadius,
          });
          markGhostLayerActive?.();
        } catch {}
      }
      if (window.DG_ZOOM_AUDIT && (now - lastGhostAudit) >= 500) {
        __auditZoomSizes?.('ghostTrail');
        lastGhostAudit = now;
      }
      if (trail && now - lastTrail >= trailEveryMs) {
        try { pulseField?.(0.4 + Math.min(0.2, trailCount * 0.05)); } catch {}
        lastTrail = now;
      }

      if (ghostGuideRunning && t < 1) {
        ghostGuideAnimFrame = requestAnimationFrame(frame);
      } else {
        ghostGuideRunning = false;
        if (ghostFadeRAF) {
          cancelAnimationFrame(ghostFadeRAF);
        }
        ghostGuideAnimFrame = null;
      }
    }

    ghostGuideAnimFrame = requestAnimationFrame(frame);
  }

  function scheduleGhostIfEmpty({ initialDelay = 150 } = {}) {
    const check = () => {
      if (!panel.isConnected) return;
      if (isPanelCulled?.()) {
        stopAutoGhostGuide({ immediate: true, reason: 'schedule-empty:culled' });
        return;
      }
      if (getIsRestoring?.()) {                 // Wait until setState() finishes
        setTimeout(check, 100);
        return;
      }
      const strokes = getStrokes?.();
      const map = getCurrentMap?.();
      const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
      const hasNodes = Array.isArray(map?.nodes)
        ? map.nodes.some(set => set && set.size > 0)
        : false;

      dgGhostTrace?.('auto:empty-check', {
        id: panel?.id || null,
        hasStrokes,
        hasNodes,
        autoActive: ghostGuideAutoActive,
        running: ghostGuideRunning,
        animFrame: !!ghostGuideAnimFrame,
        sweepSeq: __dgGhostSweepSeq,
      });
      if (!hasStrokes && !hasNodes) {
        // IMPORTANT: do not restart while already active; restarting hard-clears the trail
        // and causes the ghost sweep to "jump back" mid-path.
        if (!ghostGuideAutoActive) {
          startAutoGhostGuide({ immediate: true, reason: 'schedule-empty:empty' });
        }
        updateDrawLabel?.(true);
      } else {
        // If content exists, ensure the ghost is fully stopped/cleared.
        stopAutoGhostGuide({ immediate: true, reason: 'schedule-empty:has-content' });
        updateDrawLabel?.(false);
      }
    };
    setTimeout(check, initialDelay);
  }

  function runAutoGhostGuideSweep() {
    if (!ghostGuideAutoActive) return;
    // IMPORTANT: never start a new sweep while one is already running.
    // Starting a new sweep calls startGhostGuide(), which stops the current one with
    // immediate:true (hard clear) and cuts the trail mid-path.
    if (ghostGuideAnimFrame || ghostGuideRunning) {
      dgGhostTrace?.('auto:sweep:skip-active', {
        ghostGuideAutoActive,
        ghostGuideRunning,
        ghostGuideAnimFrame: !!ghostGuideAnimFrame,
        sweepSeq: __dgGhostSweepSeq,
        lastSweepReason: __dgGhostLastSweepReason,
      });
      return;
    }
    const ghostCtx = getGhostCtx?.();
    const ghostDpr = __dgGetCanvasDprFromCss?.(ghostCtx?.canvas, readCssW(), readPaintDpr());

    const w = readGridArea()?.w ?? 0;
    const h = readGridArea()?.h ?? 0;
    // Guard against tiny layouts
    if (!w || !h || w <= 48 || h <= 48) {
      dgGhostTrace?.('auto:sweep:skip-tiny', {
        id: panel?.id || null,
        w,
        h,
        cssW: readCssW(),
        cssH: readCssH(),
        paintDpr: readPaintDpr(),
        ghostDpr,
        sweepSeq: __dgGhostSweepSeq,
      });
      return;
    }

    // Use left->right off-screen randomized Y path
    const area = readGridArea?.() || { x: 0, y: 0, w: 0, h: 0 };
    const gpathFn = readComputeGhostSweepLR?.() || null;
    const gpath = (typeof gpathFn === 'function') ? gpathFn() : null;
    if (!gpath || !gpath.from || !gpath.to) {
      dgGhostTrace?.('auto:sweep:skip-no-path', {
        id: panel?.id || null,
        hasPath: !!gpath,
        area,
      });
      return;
    }
    const { safeMinY = area.y ?? 0, safeMaxY = (area.y ?? 0) + (area.h ?? 0) } = gpath;
    const clampY = (v) => {
      if (!Number.isFinite(v)) return safeMinY;
      return Math.max(safeMinY, Math.min(safeMaxY, v));
    };
    const startX = gpath.from.x;
    const startY = clampY(gpath.from.y);
    const endX = gpath.to.x;
    const endY = clampY(gpath.to.y);

    __dgGhostSweepSeq++;
    __dgGhostLastSweepReason = __dgGhostLastAutoReason || __dgGhostLastSweepReason;
    if (DG_GHOST_DEBUG) {
      try {
        const labelBand = __dgGetDrawLabelYRange?.();
        if (labelBand) R.drawGhostDebugBand(getGhostCtx?.(), labelBand);
        R.drawGhostDebugPath(getGhostCtx?.(), { from: gpath.from, to: gpath.to, crossY: gpath.crossY });
      } catch {}
    }

    dgGhostTrace?.('auto:sweep', {
      sweepSeq: __dgGhostSweepSeq,
      startX, startY, endX, endY, crossY: gpath.crossY,
      cssW: readCssW(),
      cssH: readCssH(),
      elPanel: __dgElSummary?.(panel),
      elBody: __dgElSummary?.(body),
      elLayers: __dgElSummary?.(layersRoot),
      elPaint: __dgElSummary?.(frontCanvas),

      paintDpr: readPaintDpr(),
      ghostDpr,
      gridArea: readGridArea() ? { x: readGridArea().x, y: readGridArea().y, w: readGridArea().w, h: readGridArea().h } : null,
      ghostCanvas: getGhostCtx?.()?.canvas ? { w: getGhostCtx().canvas.width, h: getGhostCtx().canvas.height, cssW: getGhostCtx().canvas.style?.width || null, cssH: getGhostCtx().canvas.style?.height || null } : null,
      autoActive: ghostGuideAutoActive,
      running: ghostGuideRunning,
      stack: __dgGhostMaybeStack?.('DG runAutoGhostGuideSweep'),
    });

    startGhostGuide({
      startX, endX, startY, endY, crossY: gpath.crossY,
      duration: GHOST_SWEEP_DURATION,
      wiggle: true,
      trail: true,
      trailEveryMs: 50,
      trailCount: 3,
      trailSpeed: 1.2,
    });
  }

  function startAutoGhostGuide({ immediate = false, reason = 'unknown' } = {}) {
    if (ghostGuideAutoActive) return;
    __dgGhostAutoSeq++;
    __dgGhostLastAutoReason = reason;
    dgGhostTrace?.('auto:start', {
      id: panel?.id || null,
      seq: __dgGhostAutoSeq,
      immediate,
      reason,
      hasStrokes: Array.isArray(getStrokes?.()) ? getStrokes().length : null,
      hasNodes: Array.isArray(getCurrentMap?.()?.nodes) ? getCurrentMap().nodes.some(set => set && set.size > 0) : null,
      stack: __dgGhostMaybeStack?.('DG startAutoGhostGuide'),
    });
    ghostGuideAutoActive = true;
    syncLetterFade?.({ immediate });
    runAutoGhostGuideSweep();
    const interval = GHOST_SWEEP_DURATION + GHOST_SWEEP_PAUSE;
    ghostGuideLoopId = setInterval(() => {
      if (!ghostGuideAutoActive) return;
      runAutoGhostGuideSweep();
    }, interval);
  }

  function stopAutoGhostGuide({ immediate = false, preserveTrail = false, reason = 'unknown' } = {}) {
    const wasActive = ghostGuideAutoActive || ghostGuideLoopId !== null || !!ghostGuideAnimFrame;
    __dgGhostLastStopReason = reason;
    dgGhostTrace?.('auto:stop', {
      id: panel?.id || null,
      immediate,
      preserveTrail,
      reason,
      wasActive,
      autoActive: ghostGuideAutoActive,
      loopId: !!ghostGuideLoopId,
      animFrame: !!ghostGuideAnimFrame,
      running: ghostGuideRunning,
      sweepSeq: __dgGhostSweepSeq,
      stack: __dgGhostMaybeStack?.('DG stopAutoGhostGuide'),
    });
    ghostGuideAutoActive = false;
    if (ghostGuideLoopId) {
      clearInterval(ghostGuideLoopId);
      ghostGuideLoopId = null;
    }
    stopGhostGuide({ immediate, preserveTrail, reason: 'api.stopGhostGuide' });
    if (wasActive) {
      syncLetterFade?.({ immediate });
    }
  }

  return {
    startGhostGuide,
    stopGhostGuide,
    startAutoGhostGuide,
    stopAutoGhostGuide,
    scheduleGhostIfEmpty,
    runAutoGhostGuideSweep,
    get ghostGuideAutoActive() { return ghostGuideAutoActive; },
    get ghostGuideRunning() { return ghostGuideRunning; },
    get ghostGuideAnimFrame() { return ghostGuideAnimFrame; },
  };
}




