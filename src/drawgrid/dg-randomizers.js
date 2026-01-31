// src/drawgrid/dg-randomizers.js

export function createDgRandomizers(getState) {
  // Keep this palette in sync with drawgrid.js STROKE_COLORS.
  // (We keep it local here so randomizers don't depend on drawgrid module internals.)
  const STROKE_COLORS = [
    'rgba(95,179,255,0.95)',  // Blue
    'rgba(255,95,179,0.95)',  // Pink
    'rgba(95,255,179,0.95)',  // Green
    'rgba(255,220,95,0.95)',  // Yellow
  ];

  let __dgRandomColorIndex = 0;

  function createRandomLineStroke(S) {
    const leftX = S.gridArea.x;
    const rightX = S.gridArea.x + S.gridArea.w;
    const minY = S.gridArea.y + S.topPad + S.ch; // Inset by one full row from the top
    const maxY = S.gridArea.y + S.topPad + (S.rows - 1) * S.ch; // Inset by one full row from the bottom
    const K = Math.max(6, Math.round(S.gridArea.w / Math.max(1, S.cw * 0.9))); // control points
    const cps = [];
    for (let i = 0; i < K; i++) {
      const t = i / (K - 1);
      const x = leftX + (rightX - leftX) * t;
      const y = minY + Math.random() * (maxY - minY);
      cps.push({ x, y });
    }
    function cr(p0, p1, p2, p3, t) {
      const t2 = t * t, t3 = t2 * t;
      const a = (-t3 + 2 * t2 - t) / 2;
      const b = (3 * t3 - 5 * t2 + 2) / 2;
      const c = (-3 * t3 + 4 * t2 + t) / 2;
      const d = (t3 - t2) / 2;
      return a * p0 + b * p1 + c * p2 + d * p3;
    }
    const pts = [];
    const samplesPerSeg = Math.max(8, Math.round(S.cw / 3));
    for (let i = 0; i < cps.length - 1; i++) {
      const p0 = cps[Math.max(0, i - 1)], p1 = cps[i], p2 = cps[i + 1], p3 = cps[Math.min(cps.length - 1, i + 2)];
      for (let s = 0; s <= samplesPerSeg; s++) {
        const t = s / samplesPerSeg;
        const x = cr(p0.x, p1.x, p2.x, p3.x, t);
        let y = cr(p0.y, p1.y, p2.y, p3.y, t);
        y = Math.max(minY, Math.min(maxY, y)); // Clamp to the padded area
        pts.push({ x, y });
      }
    }
    const color = STROKE_COLORS[(__dgRandomColorIndex++) % STROKE_COLORS.length];
    return { pts, color, isSpecial: true, generatorId: 1 };
  }

  function handleRandomizeLine() {
    const S = getState();
    if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW) {
      console.log('[DG][flow] handleRandomize:enter', { panelId: S.panel?.id || null });
    }
    try {
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      S.panel.__dgDebugOverlayUntil = now + 1200;
      S.panel.__dgDebugOverlayLastLog = 0;
      S.panel.__dgDebugOverlayLogged = false;
    } catch {}
    S.FD.flowLog('randomize:start', { panelId: S.panel?.id || null, usingBackBuffers: S.usingBackBuffers });
    S.FD.flowState('randomize:start', S.makeFlowCtx());
    try { S.markUserChange('randomize'); } catch (err) {
      if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW) {
        console.warn('[DG][flow] randomize:markUserChange failed', err);
      }
    }
    // Ensure no active draw state blocks clears or future drawing.
    try { S.setDrawingState(false); } catch {}
    S.__dgSkipSwapsDuringDrag = false;
    S.cur = null;
    S.pendingNodeTap = null;
    // Ensure data structures exist
    if (!S.currentMap) {
      S.currentMap = { active: Array(S.cols).fill(false), nodes: Array.from({ length: S.cols }, () => new Set()), disabled: Array.from({ length: S.cols }, () => new Set()) };
    }

    S.pctx = S.getActivePaintCtx();
    const pctx = S.pctx;
    S.resetPaintBlend(pctx);
    // Clear all existing lines and nodes
    S.strokes = [];
    S.nodeGroupMap = Array.from({ length: S.cols }, () => new Map());
    S.manualOverrides = Array.from({ length: S.cols }, () => new Set());
    S.persistentDisabled = Array.from({ length: S.cols }, () => new Set());
    S.R.clearCanvas(pctx);
    // Clear both paint buffers to avoid stale composites across buffer flips.
    try { if (S.backCtx && pctx !== S.backCtx) S.R.clearCanvas(S.backCtx); } catch {}
    try { if (S.frontCtx && pctx !== S.frontCtx) S.R.clearCanvas(S.frontCtx); } catch {}
    S.emitDG('paint-clear', { reason: 'randomize' });
    S.R.clearCanvas(S.nctx);
    try {
      const flashSurface = S.getActiveFlashCanvas();
      S.R.resetCtx(S.fctx);
      S.R.withLogicalSpace(S.fctx, () => {
        const { x, y, w, h } = S.R.getOverlayClearRect({
          canvas: flashSurface || S.fctx.canvas,
          pad: S.R.getOverlayClearPad(),
          allowFull: !!S.panel.__dgFlashOverlayOutOfGrid,
          gridArea: S.gridArea,
        });
        S.fctx.clearRect(x, y, w, h);
      });
      // Clear both flash buffers so no stale overlay survives buffer toggles.
      try {
        if (S.flashBackCtx && S.flashBackCtx !== S.fctx) {
          S.R.resetCtx(S.flashBackCtx);
          S.R.withLogicalSpace(S.flashBackCtx, () => {
            const { x, y, w, h } = S.R.getOverlayClearRect({
              canvas: S.flashBackCtx.canvas,
              pad: S.R.getOverlayClearPad(),
              allowFull: !!S.panel.__dgFlashOverlayOutOfGrid,
              gridArea: S.gridArea,
            });
            S.flashBackCtx.clearRect(x, y, w, h);
          });
        }
        if (S.flashFrontCtx && S.flashFrontCtx !== S.fctx) {
          S.R.resetCtx(S.flashFrontCtx);
          S.R.withLogicalSpace(S.flashFrontCtx, () => {
            const { x, y, w, h } = S.R.getOverlayClearRect({
              canvas: S.flashFrontCtx.canvas,
              pad: S.R.getOverlayClearPad(),
              allowFull: !!S.panel.__dgFlashOverlayOutOfGrid,
              gridArea: S.gridArea,
            });
            S.flashFrontCtx.clearRect(x, y, w, h);
          });
        }
      } catch {}
      S.markFlashLayerCleared();
      S.panel.__dgFlashOverlayOutOfGrid = false;
      S.__dgOverlayStrokeListCache = { paintRev: -1, len: 0, special: [], colorized: [], outOfGrid: false };
      S.__dgOverlayStrokeCache = { value: false, len: 0, ts: 0 };
      S.__dgMarkSingleCanvasOverlayDirty(S.panel);
    } catch {}
    try { S.previewGid = null; } catch {}
    try { S.nextDrawTarget = null; } catch {}

    // Build a smooth, dramatic wiggly line across the full grid height using Catmull-Rom interpolation
    try {
      const stroke = createRandomLineStroke(S);
      S.strokes.push(stroke);
      if (typeof window !== 'undefined' && window.__DG_RANDOM_TRACE_VERBOSE) {
        try {
          const c = S.getActivePaintCtx?.();
          const canvas = c?.canvas || null;
          const payload = {
            panelId: S.panel?.id || null,
            paintDpr: S.paintDpr,
            cssW: S.cssW,
            cssH: S.cssH,
            usingBackBuffers: S.usingBackBuffers,
            canvasRole: canvas?.getAttribute?.('data-role') || null,
            canvasSize: canvas ? { w: canvas.width, h: canvas.height, cssW: canvas.style?.width || null, cssH: canvas.style?.height || null } : null,
          };
          console.log('[DG][random][redraw]', JSON.stringify(payload));
        } catch {}
      }
      // Use the centralized redraw pipeline to avoid stale back-buffer scale.
      S.clearAndRedrawFromStrokes(null, 'randomize-line');

      // After generating the line, randomly deactivate some columns to create rests.
      // This addresses the user's feedback that "Random" no longer turns notes off.
      if (S.currentMap && S.currentMap.nodes) {
        for (let c = 0; c < S.cols; c++) {
          if (Math.random() < 0.35) {
            // Deactivate the column by disabling all of its nodes. This state
            // is preserved by the `persistentDisabled` mechanism.
            if (S.currentMap.nodes[c]?.size > 0) {
              for (const r of S.currentMap.nodes[c]) S.persistentDisabled[c].add(r);
              S.currentMap.active[c] = false;
            }
          }
        }
      }
    } catch {}
    S.drawGrid();
    S.drawNodes(S.currentMap.nodes);
    S.emitDrawgridUpdate({ activityOnly: false });
    S.stopAutoGhostGuide({ immediate: true });
    S.updateDrawLabel(false);
    S.__dgMarkSingleCanvasDirty(S.panel);
    if (S.DG_SINGLE_CANVAS && S.isPanelVisible) {
      try { S.compositeSingleCanvas(); } catch {}
      S.panel.__dgSingleCompositeDirty = false;
    }
    S.FD.flowLog('randomize:end', {
      panelId: S.panel?.id || null,
      usingBackBuffers: S.usingBackBuffers,
      gridHasPainted: !!S.panel.__dgGridHasPainted,
      flashEmpty: !!S.panel.__dgFlashLayerEmpty,
    });
    S.FD.flowState('randomize:end', S.makeFlowCtx());
  }

  function handleRandomizeBlocks() {
    const S = getState();
    S.FD.flowLog('randomize-blocks:start');
    S.markUserChange('randomize-blocks');
    if (!S.currentMap || !S.currentMap.nodes) return;

    for (let c = 0; c < S.cols; c++) {
      if (S.currentMap.nodes[c]?.size > 0) {
        // For each node (which is a row `r` in a column `c`) that exists...
        S.currentMap.nodes[c].forEach(r => {
          // ...randomly decide whether to disable it or not.
          if (Math.random() < 0.5) {
            S.persistentDisabled[c].add(r); // Disable the node at (c, r)
          } else {
            S.persistentDisabled[c].delete(r); // Enable the node at (c, r)
          }
        });

        // Recompute active state for the column
        const anyOn = Array.from(S.currentMap.nodes[c]).some(r => !S.persistentDisabled[c].has(r));
        S.currentMap.active[c] = anyOn;
        S.currentMap.disabled[c] = S.persistentDisabled[c];
      }
    }

    S.drawGrid();
    S.drawNodes(S.currentMap.nodes);
    S.emitDrawgridUpdate({ activityOnly: false });
    S.stopAutoGhostGuide({ immediate: true });
    S.updateDrawLabel(false);
    S.__dgMarkSingleCanvasDirty(S.panel);
    if (S.DG_SINGLE_CANVAS && S.isPanelVisible) {
      try { S.compositeSingleCanvas(); } catch {}
      S.panel.__dgSingleCompositeDirty = false;
    }
    S.FD.flowLog('randomize-blocks:end');
  }

  function handleRandomizeNotes() {
    const S = getState();
    S.FD.flowLog('randomize-notes:start');
    S.markUserChange('randomize-notes');
    // Save the current active state before regenerating lines
    const oldActive = S.currentMap?.active ? [...S.currentMap.active] : null;

    const existingGenIds = new Set();
    S.strokes.forEach(s => {
      if (s.generatorId === 1 || s.generatorId === 2) { existingGenIds.add(s.generatorId); }
    });
    // If no generator lines exist, create Line 1. Don't call handleRandomizeLine()
    // as that would clear decorative strokes and their disabled states.
    if (existingGenIds.size === 0) {
      existingGenIds.add(1);
    }
    S.strokes = S.strokes.filter(s => s.generatorId !== 1 && s.generatorId !== 2);
    const newGenStrokes = [];
    existingGenIds.forEach(gid => {
      const newStroke = createRandomLineStroke(S);
      newStroke.generatorId = gid;
      newStroke.justCreated = true; // Mark as new to avoid old erasures
      S.strokes.push(newStroke);
      newGenStrokes.push(newStroke);
    });
    S.clearAndRedrawFromStrokes(null, 'randomize-notes');
    // After drawing, unmark the new strokes so they behave normally.
    newGenStrokes.forEach(s => delete s.justCreated);

    // After regenerating, restore the old active state and update disabled nodes to match.
    if (S.currentMap && oldActive) {
      S.currentMap.active = oldActive;
      // Rebuild the disabled sets based on the restored active state.
      for (let c = 0; c < S.cols; c++) {
        if (oldActive[c]) {
          S.currentMap.disabled[c].clear(); // If column was active, ensure all its new nodes are enabled.
        } else {
          S.currentMap.nodes[c].forEach(r => S.currentMap.disabled[c].add(r)); // If column was inactive, disable all its new nodes.
        }
      }
      S.drawGrid();
      S.drawNodes(S.currentMap.nodes);
      S.emitDrawgridUpdate({ activityOnly: false });
    }
    S.stopAutoGhostGuide({ immediate: true });
    S.updateDrawLabel(false);
    S.__dgMarkSingleCanvasDirty(S.panel);
    if (S.DG_SINGLE_CANVAS && S.isPanelVisible) {
      try { S.compositeSingleCanvas(); } catch {}
      S.panel.__dgSingleCompositeDirty = false;
    }
    S.FD.flowLog('randomize-notes:end');
  }

  return {
    handleRandomizeLine,
    handleRandomizeBlocks,
    handleRandomizeNotes,
  };
}
