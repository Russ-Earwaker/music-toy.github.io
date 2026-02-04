// src/drawgrid/dg-tutorial-highlight.js
// Tutorial highlight overlay (render + loop control).

export function createDgTutorialHighlight({ state, deps } = {}) {
  const s = state;
  const d = deps;

  const dgTutorialTrace = (tag, data) => {
    if (typeof window === 'undefined' || !window.__DG_TUTORIAL_TRACE) return;
    try { console.log(`[DG][tutorial] ${tag}`, data || {}); } catch {}
  };

  const isTutorialActive = () => {
    return typeof document !== 'undefined' && !!document.body?.classList?.contains('tutorial-active');
  };

  const isHighlightActive = () => isTutorialActive() || s.tutorialHighlightOverride;

  const clearTutorialHighlight = () => {
    const ctx = s.tutorialCtx;
    if (!ctx) return;
    dgTutorialTrace('clear', {
      mode: s.tutorialHighlightMode,
      active: isHighlightActive(),
      culled: d.isPanelCulled(),
    });
    d.R.resetCtx(ctx);
    d.R.withLogicalSpace(ctx, () => {
      const tutorialSurface = d.getActiveTutorialCanvas();
      if (!tutorialSurface) return;
      const scale = (Number.isFinite(s.paintDpr) && s.paintDpr > 0) ? s.paintDpr : 1;
      const width = s.cssW || (tutorialSurface.width ?? 0) / scale;
      const height = s.cssH || (tutorialSurface.height ?? 0) / scale;
      ctx.clearRect(0, 0, width, height);
    });
    d.markTutorialLayerCleared();
  };

  const renderTutorialHighlight = () => {
    const ctx = s.tutorialCtx;
    if (!ctx) return;
    const tutorialSurface = d.getActiveTutorialCanvas();
    const nodeCoordsForHitTest = d.getNodeCoordsForHitTest();
    dgTutorialTrace('render', {
      mode: s.tutorialHighlightMode,
      active: isHighlightActive(),
      culled: d.isPanelCulled(),
      hasNodes: !!nodeCoordsForHitTest?.length,
    });
    d.R.resetCtx(ctx);
    d.R.withLogicalSpace(ctx, () => {
      const scale = (Number.isFinite(s.paintDpr) && s.paintDpr > 0) ? s.paintDpr : 1;
      const width = s.cssW || (tutorialSurface?.width ?? 0) / scale;
      const height = s.cssH || (tutorialSurface?.height ?? 0) / scale;
      ctx.clearRect(0, 0, width, height);
      if (s.tutorialHighlightMode === 'none' || !nodeCoordsForHitTest?.length) {
        d.markTutorialLayerCleared();
        return;
      }
      d.markTutorialLayerActive();
      const baseRadius = Math.max(6, Math.min(s.cw || 0, s.ch || 0) * 0.55);
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = Math.max(4, baseRadius * 0.3);
      const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      const pulsePhase = (now / 480) % (Math.PI * 2);
      const pulseScale = 1 + Math.sin(pulsePhase) * 0.24;
      const highlightNodes = nodeCoordsForHitTest;
      let anchorNode = null;
      if (s.tutorialHighlightMode === 'drag') {
        const effectiveWidth = (s.gridArea.w && s.gridArea.w > 0) ? s.gridArea.w : (s.cw * s.cols);
        const effectiveHeight = (s.gridArea.h && s.gridArea.h > 0) ? s.gridArea.h : (s.ch * s.rows);
        const fallbackX = s.gridArea.x + (effectiveWidth / 2);
        const fallbackY = s.gridArea.y + s.topPad + Math.max(0, effectiveHeight - s.topPad) / 2;
        const activeNode = highlightNodes.find(node => !node?.disabled);
        anchorNode = activeNode || (highlightNodes.length ? highlightNodes[0] : { x: fallbackX, y: fallbackY });
      }

      highlightNodes.forEach((node) => {
        if (!node) return;
        ctx.globalAlpha = node.disabled ? 0.45 : 1;
        ctx.lineWidth = Math.max(2, baseRadius * 0.22);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(node.x, node.y, baseRadius * pulseScale, 0, Math.PI * 2);
        ctx.stroke();
      });

      if (s.tutorialHighlightMode === 'drag' && anchorNode) {
        const bob = Math.sin(now / 420) * Math.min(12, s.ch * 0.35);
        const arrowColor = 'rgba(255, 255, 255, 0.9)';
        const arrowWidth = Math.max(10, Math.min(s.cw, s.ch) * 0.45);
        const arrowHeight = arrowWidth * 1.25;

        const drawArrow = (x, y, direction) => {
          ctx.beginPath();
          if (direction < 0) {
            ctx.moveTo(x, y);
            ctx.lineTo(x - arrowWidth * 0.5, y + arrowHeight);
            ctx.lineTo(x + arrowWidth * 0.5, y + arrowHeight);
          } else {
            ctx.moveTo(x, y);
            ctx.lineTo(x - arrowWidth * 0.5, y - arrowHeight);
            ctx.lineTo(x + arrowWidth * 0.5, y - arrowHeight);
          }
          ctx.closePath();
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = arrowColor;
          ctx.fill();
        };

        highlightNodes.forEach((node) => {
          if (!node) return;
          const topY = node.y - baseRadius - arrowHeight - 16 - bob;
          const bottomY = node.y + baseRadius + arrowHeight + 16 + bob;
          drawArrow(node.x, topY, -1);
          drawArrow(node.x, bottomY, 1);
        });
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    });
  };

  const startTutorialHighlightLoop = () => {
    if (s.tutorialHighlightMode === 'none') return;
    if (!isHighlightActive() || d.isPanelCulled()) return;
    if (s.tutorialHighlightRaf !== null) return;
    dgTutorialTrace('loop:start', {
      mode: s.tutorialHighlightMode,
      active: isHighlightActive(),
      culled: d.isPanelCulled(),
    });
    const tick = () => {
      // IMPORTANT:
      // If we stop the loop without clearing, the last rendered highlight frame
      // (ghost-finger particles) can appear "frozen" on the tutorial canvas.
      // Use isHighlightActive() (respects allowGuide override), and always clear on exit.
      if (s.tutorialHighlightMode === 'none' || !isHighlightActive() || d.isPanelCulled()) {
        s.tutorialHighlightRaf = null;
        clearTutorialHighlight();
        dgTutorialTrace('loop:stop', {
          mode: s.tutorialHighlightMode,
          active: isHighlightActive(),
          culled: d.isPanelCulled(),
        });
        return;
      }
      renderTutorialHighlight();
      s.tutorialHighlightRaf = requestAnimationFrame(tick);
    };
    renderTutorialHighlight();
    s.tutorialHighlightRaf = requestAnimationFrame(tick);
  };

  const stopTutorialHighlightLoop = () => {
    if (s.tutorialHighlightRaf !== null) {
      cancelAnimationFrame(s.tutorialHighlightRaf);
      s.tutorialHighlightRaf = null;
    }
    clearTutorialHighlight();
    dgTutorialTrace('loop:stop:manual', {
      mode: s.tutorialHighlightMode,
      active: isHighlightActive(),
      culled: d.isPanelCulled(),
    });
  };

  const pauseTutorialHighlightForDraw = () => {
    if (s.tutorialHighlightPausedByDraw) return;
    s.tutorialHighlightPausedByDraw = true;
    dgTutorialTrace('pause:draw', {
      mode: s.tutorialHighlightMode,
      active: isHighlightActive(),
      culled: d.isPanelCulled(),
      raf: !!s.tutorialHighlightRaf,
    });
    stopTutorialHighlightLoop();
  };

  const resumeTutorialHighlightAfterDraw = () => {
    if (!s.tutorialHighlightPausedByDraw) return;
    s.tutorialHighlightPausedByDraw = false;
    dgTutorialTrace('resume:draw', {
      mode: s.tutorialHighlightMode,
      active: isHighlightActive(),
      culled: d.isPanelCulled(),
      raf: !!s.tutorialHighlightRaf,
    });
    if (s.tutorialHighlightMode === 'none') return;
    if (!isHighlightActive() || d.isPanelCulled()) return;
    startTutorialHighlightLoop();
  };

  return {
    getMode: () => s.tutorialHighlightMode,
    setMode: (mode) => { s.tutorialHighlightMode = mode; },
    getOverride: () => s.tutorialHighlightOverride,
    setOverride: (value) => { s.tutorialHighlightOverride = !!value; },
    isHighlightActive,
    clearTutorialHighlight,
    renderTutorialHighlight,
    startTutorialHighlightLoop,
    stopTutorialHighlightLoop,
    pauseTutorialHighlightForDraw,
    resumeTutorialHighlightAfterDraw,
  };
}
