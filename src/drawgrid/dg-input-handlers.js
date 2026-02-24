// src/drawgrid/dg-input-handlers.js
// DrawGrid pointer input handlers.

export function createDgInputHandlers({ state, deps } = {}) {
  let __dgMoveRAF = 0;
  let __dgPendingMoveEvt = null;

  function onPointerDown(e) {
    const s = state;
    const d = deps;
    e.stopPropagation();
    d.dgInputTrace('paint:down', {
      pointerId: e.pointerId,
      buttons: e.buttons,
      isPrimary: e.isPrimary,
      targetRole: e?.target?.getAttribute?.('data-role') || e?.target?.id || e?.target?.className || null,
      cssW: s.cssW,
      cssH: s.cssH,
      paintDpr: s.paintDpr,
      gridArea: s.gridArea ? { x: s.gridArea.x, y: s.gridArea.y, w: s.gridArea.w, h: s.gridArea.h } : null,
      drawing: s.drawing,
      pendingNodeTap: !!s.pendingNodeTap,
      draggedNode: !!s.draggedNode,
      skipSwapsDuringDrag: !!s.skipSwapsDuringDrag,
    });
    d.dgPaintTrace('pointer:down', { pointerId: e.pointerId, buttons: e.buttons, isPrimary: e.isPrimary, zoomMode: s.zoomMode, zoomGestureActive: s.zoomGestureActive });

    d.FD.flowLog('pointer:down:entry', {
      focusedId: window.gFocusedToy?.id || null,
      focusMismatch: !!(window.gFocusedToy && window.gFocusedToy !== s.panel),
      unfocused: s.panel?.classList?.contains?.('toy-unfocused') || false,
    });
    if (window.gFocusedToy && window.gFocusedToy !== s.panel) {
      // If another toy is focused, request focus here but still allow drawing.
      try { window.requestToyFocus?.(s.panel, { center: false }); } catch {}
    }
    // When the user starts manual drawing, the ghost guide particles must disappear (not freeze).
    // immediate:true forces a visual clear so we don't leave a "stuck" ghost frame on screen.
    d.stopAutoGhostGuide({ immediate: true, reason: 'pointerdown:manual-draw' });
    d.markUserChange('pointerdown');
    d.FD.flowLog('pointer:down', {});
    const p = d.pointerToPaintLogical(e);
    d.dgPointerTrace.onPointerDown(e, p);

    // Check for node hit first using full grid cell bounds (bigger tap area)
    for (const node of s.nodeCoordsForHitTest) {
      const cellX = s.gridArea.x + node.col * s.cw;
      const cellY = s.gridArea.y + s.topPad + node.row * s.ch;
      if (p.x >= cellX && p.x <= cellX + s.cw && p.y >= cellY && p.y <= cellY + s.ch) {
        s.pendingNodeTap = { col: node.col, row: node.row, x: p.x, y: p.y, group: node.group ?? null };
        d.setDragScaleHighlight?.(node.col);
        d.markStaticDirty?.('node-grab:start');
        d.ensureRenderLoopRunning?.();
        d.setDrawingState(true); // capture move/up
        try { s.paint.setPointerCapture?.(e.pointerId); } catch {}
        e.preventDefault?.();
        return; // Defer deciding until move/up
      }
    }

    // Manual drawing should temporarily hide tutorial highlights (ghost finger particles).
    d.pauseTutorialHighlightForDraw();

    d.setDrawingState(true);
    try { s.paint.setPointerCapture?.(e.pointerId); } catch {}
    e.preventDefault?.();

    // Live ink should draw straight to the visible canvas; suppress swaps during drag.
    s.skipSwapsDuringDrag = true;
    if (typeof d.useFrontBuffers === 'function') d.useFrontBuffers();
    s.pctx = d.getActivePaintCtx();
    if (typeof window !== 'undefined' && window.DG_DRAW_DEBUG && s.pctx && s.pctx.canvas) {
      const c = s.pctx.canvas;
      console.debug('[DG][PAINT/ctx]', {
        role: c.getAttribute?.('data-role') || c.id || 'unknown',
        w: c.width,
        h: c.height,
        cssW: s.cssW,
        cssH: s.cssH,
        dpr: s.paintDpr,
        alpha: s.pctx.globalAlpha,
        comp: s.pctx.globalCompositeOperation,
      });
    }
    d.resetPaintBlend(s.pctx);

    // When starting a new line, don't clear the canvas. This makes drawing additive.
    // If we are about to draw a special line (previewGid decided), demote any existing line of that kind.
    try {
      const isZoomed = s.panel.classList.contains('toy-zoomed');
      const hasLine1 = s.strokes.some(st => st.generatorId === 1);
      const hasLine2 = s.strokes.some(st => st.generatorId === 2);
      let intendedGid = null;
      if (!isZoomed) {
        if (!hasLine1 && !hasLine2) intendedGid = 1;
      } else {
        if (!hasLine1) intendedGid = 1; else if (s.nextDrawTarget) intendedGid = s.nextDrawTarget;
      }
      if (intendedGid) {
        const existing = s.strokes.find(st => st.generatorId === intendedGid);
        if (existing) {
          existing.isSpecial = false;
          existing.generatorId = null;
          existing.overlayColorize = true;
          // assign a random palette color
          const idx = Math.floor(Math.random() * s.STROKE_COLORS.length);
          existing.color = s.STROKE_COLORS[idx];
        }
      }
    } catch {}
    const paintStart = p;
    const { x: x0, y: y0 } = paintStart;
    // Particle push on gesture start — snowplow a full-width band even before movement.
    try {
      const area = (s.gridArea && s.gridArea.w > 0 && s.gridArea.h > 0)
        ? s.gridArea
        : { w: s.cssW || 0, h: s.cssH || 0 };
      const baseRadius = s.DG_KNOCK.ghostTrail.radiusToy(area);
      const lw = (typeof d.R.getLineWidth === 'function') ? d.R.getLineWidth() : 12;
      s.FF.pokeAlongStrokeBand(x0, y0, x0, y0, lw, s.DG_KNOCK.ghostTrail);
      const pushRadius = baseRadius * 1.5;
      s.FF.pokeFieldToy('pointerDown', x0, y0, pushRadius, s.DG_KNOCK.ghostTrail.strength, { mode: 'plow' });
    } catch {}
    s.cur = {
      pts: [paintStart],
      color: s.STROKE_COLORS[s.colorIndex++ % s.STROKE_COLORS.length]
    };
    try {
      d.knockLettersAt(
        p.x - (s.gridArea?.x || 0),
        p.y - (s.gridArea?.y || 0),
        { radius: 100, strength: 14, source: 'line' }
      );
    } catch {}
    // The full stroke will be drawn on pointermove.
  }

  function onPointerMove(e) {
    const s = state;
    const d = deps;
    d.dgInputTrace('paint:move:enqueue', { pointerId: e.pointerId, buttons: e.buttons, drawing: s.drawing, pendingNodeTap: !!s.pendingNodeTap, draggedNode: !!s.draggedNode });
    __dgPendingMoveEvt = e;
    if (__dgMoveRAF) return;
    __dgMoveRAF = requestAnimationFrame(() => {
      __dgMoveRAF = 0;
      const evt = __dgPendingMoveEvt;
      __dgPendingMoveEvt = null;
      handlePointerMove(evt || e);
    });
  }

  function handlePointerMove(e) {
    const s = state;
    const d = deps;
    const p = d.pointerToPaintLogical(e);
    d.dgPointerTrace.onPointerMove(e, p);
    d.dgInputTrace('paint:move:handle', {
      pointerId: e.pointerId,
      buttons: e.buttons,
      x: p?.x,
      y: p?.y,
      drawing: s.drawing,
      pendingNodeTap: !!s.pendingNodeTap,
      draggedNode: !!s.draggedNode,
      hasCur: !!s.cur,
    });
    if (!s.pctx) {
      d.DG.warn('pctx missing; forcing front buffers');
      if (typeof d.useFrontBuffers === 'function') d.useFrontBuffers();
    }

    // Update cursor for draggable nodes
    if (!s.draggedNode) {
      let onNode = false;
      for (const node of s.nodeCoordsForHitTest) {
        const cellX = s.gridArea.x + node.col * s.cw;
        const cellY = s.gridArea.y + s.topPad + node.row * s.ch;
        if (p.x >= cellX && p.x <= cellX + s.cw && p.y >= cellY && p.y <= cellY + s.ch) { onNode = true; break; }
      }
      s.paint.style.cursor = onNode ? 'grab' : 'default';
    }

    // Promote pending tap to drag if moved sufficiently
    if (s.pendingNodeTap && s.drawing && !s.draggedNode) {
      const dx = p.x - s.pendingNodeTap.x;
      const dy = p.y - s.pendingNodeTap.y;
      if (Math.hypot(dx, dy) > 6) {
        s.draggedNode = {
          col: s.pendingNodeTap.col,
          row: s.pendingNodeTap.row,
          group: s.pendingNodeTap.group ?? null,
          moved: false,
          originalRow: s.pendingNodeTap.row
        };
        s.paint.style.cursor = 'grabbing';
        s.pendingNodeTap = null;
        d.setDragScaleHighlight(s.draggedNode.col);
      }
    }

    if (s.draggedNode && s.drawing) {
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      const newRow = clamp(Math.round((p.y - (s.gridArea.y + s.topPad)) / s.ch), 0, s.rows - 1);

      if (newRow !== s.draggedNode.row && s.currentMap) {
        const col = s.draggedNode.col;
        const oldRow = s.draggedNode.row;
        const gid = s.draggedNode.group ?? null;

        // Ensure group map exists for this column
        if (!s.nodeGroupMap[col]) s.nodeGroupMap[col] = new Map();
        const colGroupMap = s.nodeGroupMap[col];

        // Remove this group's presence from the old row's stack
        if (gid != null) {
          const oldArr = (colGroupMap.get(oldRow) || []).filter(g => g !== gid);
          if (oldArr.length > 0) colGroupMap.set(oldRow, oldArr); else colGroupMap.delete(oldRow);
        }

        // Update nodes set for old row only if no groups remain there
        if (!(colGroupMap.has(oldRow))) {
          s.currentMap.nodes[col].delete(oldRow);
        }

        // Add/move to new row; place on top of z-stack
        if (gid != null) {
          const newArr = colGroupMap.get(newRow) || [];
          const filtered = newArr.filter(g => g !== gid);
          filtered.push(gid);
          colGroupMap.set(newRow, filtered);
        }
        s.currentMap.nodes[col].add(newRow);

        // record manual override for standard view preservation
        try {
          if (!s.manualOverrides[col]) s.manualOverrides[col] = new Set();
          s.manualOverrides[col] = new Set(s.currentMap.nodes[col]);
        } catch {}

        s.draggedNode.row = newRow;
        s.draggedNode.moved = true;
        try {
          s.panel.dispatchEvent(new CustomEvent('drawgrid:node-drag', { detail: { col, row: newRow, group: gid } }));
        } catch {}

        // Let RAF handle redraw so grid/text/hints stay in sync with fade alpha.
        d.markStaticDirty?.('node-drag:move');
        d.ensureRenderLoopRunning?.();
      } else if (s.dragScaleHighlightCol === null) {
        d.setDragScaleHighlight(s.draggedNode.col);
      }
      return;
    }

    if (!s.drawing) return; // Guard for drawing logic below

    if (s.cur) {
      s.pctx = d.getActivePaintCtx();
      d.resetPaintBlend(s.pctx);
      const paintPt = p;
      try {
        if (!s.previewGid && s.pctx) {
          const sz = Math.max(1, Math.floor(d.R.getLineWidth() / 6));
          d.R.withLogicalSpace(s.pctx, () => {
            s.pctx.fillStyle = '#ffffff';
            s.pctx.fillRect(paintPt.x, paintPt.y, sz, sz);
          });
        }
        if (s.DG_TRACE_DEBUG) {
          console.debug('[DG][ink] livemove', {
            id: s.panel.id,
            w: s.pctx?.canvas?.width ?? null,
            h: s.pctx?.canvas?.height ?? null,
            cssW: s.cssW,
            cssH: s.cssH,
            dpr: s.paintDpr,
            usingBackBuffers: s.usingBackBuffers,
            previewGid: s.previewGid,
            nextDrawTarget: s.nextDrawTarget,
          });
        }
      } catch {}
      s.cur.pts.push(paintPt);
      // Determine if current stroke should show a special-line preview
      const isAdvanced = s.panel.classList.contains('toy-zoomed');
      const hasLine1 = s.strokes.some(st => st.generatorId === 1);
      const hasLine2 = s.strokes.some(st => st.generatorId === 2);

      s.previewGid = null;
      // Only show preview in advanced mode or when a line button is explicitly armed.
      if (isAdvanced) {
        if (!hasLine1) s.previewGid = 1;
        else if (s.nextDrawTarget) s.previewGid = s.nextDrawTarget;
      } else if (s.nextDrawTarget) {
        s.previewGid = s.nextDrawTarget;
      }
      // If overlay strokes are disabled, fall back to paint so live lines remain visible.
      if (s.previewGid && typeof window !== 'undefined' && window.__PERF_DG_OVERLAY_STROKES_OFF) {
        s.previewGid = null;
      }
      s.dbgCounters.pointerMoves++;
      // Debug: track preview vs paint to ensure live line visibility
      try {
        if ((s.dbgCounters.pointerMoves % 7) === 1) {
          d.dgTraceLog('[drawgrid] liveMove', {
            id: s.panel.id,
            advanced: isAdvanced,
            nextDrawTarget: s.nextDrawTarget,
            previewGid: s.previewGid,
            hasLine1,
            hasLine2,
          });
        }
      } catch {}
      if ((s.dbgCounters.pointerMoves % 12) === 1) {
        d.FD.flowLog('draw:move', { previewGid: s.previewGid, nextDrawTarget: s.nextDrawTarget, advanced: isAdvanced });
      }
      // For normal lines (no previewGid), paint segment onto paint; otherwise, overlay will show it
      if (!s.previewGid) {
        const lastIdx = s.cur.pts.length - 1;
        const prevIdx = Math.max(0, s.cur.pts.length - 2);
        const lastPt = s.cur.pts[lastIdx];
        const prevPt = s.cur.pts[prevIdx];
        // ensure we're actually painting opaque pixels in normal mode
        d.resetPaintBlend(s.pctx);
        const hasSpecialLine = s.strokes.some(st => st.isSpecial || st.generatorId);
        const wantsSpecialLive = !isAdvanced && !hasSpecialLine;
        const liveStrokeMeta = { ...s.cur, isSpecial: wantsSpecialLive, liveAlphaOverride: 1 };
        d.R.drawLiveStrokePoint(s.pctx, lastPt, prevPt, liveStrokeMeta);

        s.__dgNeedsUIRefresh = false; // don't trigger overlay clears during draw
      }
      try {
        const lastIdx = s.cur.pts.length - 1;
        const lastPt = s.cur.pts[lastIdx];
        if (lastPt) {
          const area = (s.gridArea && s.gridArea.w > 0 && s.gridArea.h > 0)
            ? s.gridArea
            : { w: s.cssW || 0, h: s.cssH || 0 };
          let baseRadius = typeof s.DG_KNOCK?.ghostTrail?.radiusToy === 'function'
            ? s.DG_KNOCK.ghostTrail.radiusToy(area)
            : 0;
          if (!Number.isFinite(baseRadius) || baseRadius <= 0) baseRadius = 18;
          const pointerR = baseRadius * 1.5;
          const logicalW = (Number.isFinite(s.gridAreaLogical?.w) && s.gridAreaLogical.w > 0)
            ? s.gridAreaLogical.w
            : (area?.w || s.cssW || 0);
          const logicalH = (Number.isFinite(s.gridAreaLogical?.h) && s.gridAreaLogical.h > 0)
            ? s.gridAreaLogical.h
            : (area?.h || s.cssH || 0);
          const logicalMin = Math.min(
            Number.isFinite(logicalW) && logicalW > 0 ? logicalW : 0,
            Number.isFinite(logicalH) && logicalH > 0 ? logicalH : 0,
          );
          const capR = Math.max(8, logicalMin > 0 ? logicalMin * 0.25 : pointerR * 1.25);
          const disturbanceRadius = Math.min(pointerR, capR);
          s.FF.pokeFieldToy('ghostTrail', lastPt.x, lastPt.y, disturbanceRadius, s.DG_KNOCK.ghostTrail.strength, {
            mode: 'plow',
            highlightMs: 900,
          });
          const lettersRadius = Math.max(
            disturbanceRadius * 2.25,
            logicalMin * 0.2,
            40,
          );
          const localX = lastPt.x - (s.gridArea?.x || 0);
          const localY = lastPt.y - (s.gridArea?.y || 0);
          d.knockLettersAt(localX, localY, {
            radius: lettersRadius,
            strength: 12,
            source: 'line',
          });
        }
      } catch {}
      // pendingPaintSwap = true;
    }
  }

  function onPointerUp(e) {
    const s = state;
    const d = deps;
    d.dgInputTrace('paint:up', { pointerId: e.pointerId, buttons: e.buttons, drawing: s.drawing, pendingNodeTap: !!s.pendingNodeTap, draggedNode: !!s.draggedNode, hasCur: !!s.cur, usingBackBuffers: s.usingBackBuffers, pendingPaintSwap: s.pendingPaintSwap });
    d.dgPointerTrace.onPointerUp(e, d.pointerToPaintLogical(e));
    d.dgPaintTrace('pointer:up', { pointerId: e.pointerId, buttons: e.buttons, isPrimary: e.isPrimary, zoomMode: s.zoomMode, zoomGestureActive: s.zoomGestureActive });

    // Resume tutorial highlights after manual drawing completes.
    d.resumeTutorialHighlightAfterDraw();

    s.skipSwapsDuringDrag = false;
    // Only defer/blank if a *zoom commit* is actually settling.
    const now = performance?.now?.() ?? Date.now();
    const settleTs = (typeof window !== 'undefined') ? window.__GESTURE_SETTLE_UNTIL_TS : 0;
    const inZoomCommit = Number.isFinite(settleTs) && settleTs > now;

    if (inZoomCommit) {
      s.__dgDeferUntilTs = Math.max(s.__dgDeferUntilTs, settleTs);
      s.__dgStableFramesAfterCommit = 0;          // only reset when a zoom commit is settling
      s.__dgNeedsUIRefresh = true;                // schedule safe clears
    }
    // IMPORTANT: do not clear here; renderLoop will do it safely.
    if (s.draggedNode) {
      const finalDetail = { col: s.draggedNode.col, row: s.draggedNode.row, group: s.draggedNode.group ?? null };
      const didMove = !!s.draggedNode.moved;
      if (didMove || inZoomCommit) s.__dgNeedsUIRefresh = true;
      d.emitDrawgridUpdate({ activityOnly: false });
      if (didMove) {
        try { s.panel.dispatchEvent(new CustomEvent('drawgrid:node-drag-end', { detail: finalDetail })); } catch {}
        try {
          const cx = s.gridArea.x + s.draggedNode.col * s.cw + s.cw * 0.5;
          const cy = s.gridArea.y + s.topPad + s.draggedNode.row * s.ch + s.ch * 0.5;
          const baseRadius = Math.max(6, Math.min(s.cw, s.ch) * 0.5);
          d.spawnNoteRingEffect(cx, cy, baseRadius);
          s.dgField?.pulse?.(0.25);
          const wrapRect = s.wrap?.getBoundingClientRect?.();
          if (wrapRect && wrapRect.width && wrapRect.height) {
            const localX = (wrapRect.width * 0.5) - (s.gridArea?.x || 0);
            const localY = (wrapRect.height * 0.5) - (s.gridArea?.y || 0);
            d.knockLettersAt(localX, localY, { radius: 80, strength: 10 });
          }
        } catch {}
      }
      s.draggedNode = null;
      d.setDragScaleHighlight(null);
      d.setDrawingState(false);
      s.paint.style.cursor = 'default';
      return;
    }

    // Tap on a node toggles column active state
    if (s.pendingNodeTap) {
      const col = s.pendingNodeTap.col;
      const row = s.pendingNodeTap.row;
      if (!s.currentMap) {
        s.currentMap = {
          active: Array(s.cols).fill(false),
          nodes: Array.from({ length: s.cols }, () => new Set()),
          disabled: Array.from({ length: s.cols }, () => new Set()),
        };
      }

      const dis = s.persistentDisabled[col] || new Set();
      if (dis.has(row)) dis.delete(row); else dis.add(row);
      s.persistentDisabled[col] = dis;
      s.currentMap.disabled[col] = dis;
      // Recompute column active: any node present and not disabled
      const anyOn = Array.from(s.currentMap.nodes[col] || []).some(r => !dis.has(r));
      s.currentMap.active[col] = anyOn;

      d.__dgBumpNodesRev('node-toggle');

      // Flash feedback on toggle
      s.flashes[col] = 1.0;
      d.useBackBuffers();
      d.drawGrid();
      d.drawNodes(s.currentMap.nodes);
      // We just redrew static layers, so treat them as clean.
      s.panel.__dgStaticDirty = false;
      s.__dgNeedsUIRefresh = true;
      d.FD.flowLog('node-toggle', {
        col,
        row,
        active: s.currentMap?.active?.[col] ?? null,
        disabledCount: s.currentMap?.disabled?.[col]?.size ?? null,
      });
      d.requestFrontSwap(d.useFrontBuffers);
      d.emitDrawgridUpdate({ activityOnly: false });
      s.panel.dispatchEvent(new CustomEvent('drawgrid:node-toggle', { detail: { col, row, disabled: dis.has(row) } }));
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('drawgrid:refresh-all', {
            detail: { sourcePanelId: s.panel?.id || null }
          }));
        }
      } catch {}

      const cx = s.gridArea.x + col * s.cw + s.cw * 0.5;
      const cy = s.gridArea.y + s.topPad + row * s.ch + s.ch * 0.5;
      const baseRadius = Math.max(6, Math.min(s.cw, s.ch) * 0.5);
      d.spawnNoteRingEffect(cx, cy, baseRadius);
      try {
        s.dgField?.pulse?.(0.25);
        const wrapRect = s.wrap?.getBoundingClientRect?.();
        if (wrapRect && wrapRect.width && wrapRect.height) {
          const localX = (wrapRect.width * 0.5) - (s.gridArea?.x || 0);
          const localY = (wrapRect.height * 0.5) - (s.gridArea?.y || 0);
          d.knockLettersAt(localX, localY, { radius: 80, strength: 10 });
        }
      } catch {}

      s.pendingNodeTap = null;
      d.setDragScaleHighlight(null);
      d.setDrawingState(false);
      s.paint.style.cursor = 'default';
      return;
    }

    if (typeof d.finishLine === 'function') {
      d.finishLine(e);
    }
  }

  function onGlobalPointerUp(e) {
    const s = state;
    const d = deps;
    if (!s.drawing) return;
    if (s.draggedNode || s.pendingNodeTap) return;
    if (e && e.button === 2) return; // right-click
    try { s.paint.releasePointerCapture?.(e.pointerId); } catch {}
    onPointerUp(e);
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onGlobalPointerUp,
  };
}
