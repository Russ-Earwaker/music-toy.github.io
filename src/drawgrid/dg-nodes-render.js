// src/drawgrid/dg-nodes-render.js
// DrawGrid node rendering + caches.

export function createDgNodesRender({ state, deps } = {}) {
  const s = state;
  const d = deps;

  const nodesCache = { canvas: null, ctx: null, key: '', nodeCoords: null };
  const blocksCache = { canvas: null, ctx: null, key: '' };

  function resetNodesCache() {
    nodesCache.key = '';
    nodesCache.nodeCoords = null;
  }

  function resetBlocksCache() {
    blocksCache.key = '';
  }

  function bumpNodesRev(reason = '') {
    try {
      if (!s.currentMap) return;
      const prev = (Number.isFinite(s.currentMap.__dgRev) ? s.currentMap.__dgRev : 0) | 0;
      s.currentMap.__dgRev = (prev + 1) | 0;

      // Any change that affects nodes / active / disabled must invalidate the cached nodes layer.
      resetNodesCache();
      // Optional: make it easy to see rev churn while debugging.
      if (s.panel) {
        s.panel.__dgNodesRev = s.currentMap.__dgRev;
        if (reason) s.panel.__dgNodesRevReason = String(reason);
      }
    } catch {}
  }

  function drawNodes(nodes) {
    if (!d.isGridReady()) {
      return;
    }
    d.FD.layerTrace('drawNodes:enter', {
      panelId: s.panel?.id || null,
      usingBackBuffers: s.usingBackBuffers,
      nctxRole: s.nctx?.canvas?.getAttribute?.('data-role') || null,
      nctxSize: s.nctx?.canvas ? { w: s.nctx.canvas.width, h: s.nctx.canvas.height } : null,
    });
    let nodeCoords = null;
    d.setNodeCoordsForHitTest([]);
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
    const __layoutStart = __perfOn ? performance.now() : 0;
    d.R.resetCtx(s.nctx);
    d.R.resetCtx(s.nctx);
    if (s.DG_COMBINE_GRID_NODES) {
      if (!s.panel.__dgGridReadyForNodes) {
        d.drawGrid();
      }
      s.panel.__dgGridReadyForNodes = false;
    }
    const surface = s.nctx.canvas;
    const scale = (Number.isFinite(s.paintDpr) && s.paintDpr > 0) ? s.paintDpr : 1;
    const width = s.cssW || (surface?.width ?? 0) / scale;
    const height = s.cssH || (surface?.height ?? 0) / scale;
    if (!s.DG_COMBINE_GRID_NODES) {
      const surfacePxW = surface?.width ?? 0;
      const surfacePxH = surface?.height ?? 0;
      d.R.withDeviceSpace(s.nctx, () => {
        s.nctx.clearRect(0, 0, surfacePxW, surfacePxH);
      });
    }
    if (s.DG_SINGLE_CANVAS && s.nodesFrontCtx?.canvas) {
      const frontSurface = s.nodesFrontCtx.canvas;
      d.R.withDeviceSpace(s.nodesFrontCtx, () => {
        s.nodesFrontCtx.clearRect(0, 0, frontSurface.width, frontSurface.height);
      });
    }
    if (!s.__dgProbeDidFirstDraw && typeof window !== 'undefined' && window.__DG_PROBE_ON !== false) {
      s.__dgProbeDidFirstDraw = true;
      try { d.__dgProbeDump?.('first-draw:nodes'); } catch {}
    }
    d.__dgWithLogicalSpace(s.nctx, () => {
      if (!nodes) {
        return;
      }

      const radius = Math.max(4, Math.min(s.cw, s.ch) * 0.20);
      const isZoomed = s.panel.classList.contains('toy-zoomed');
      const hasTwoLines = Array.isArray(s.strokes) && s.strokes.some(stroke => stroke && stroke.generatorId === 2);
      let mapKey = 2166136261;
      const __dgHashStep = (h, v) => {
        const n = (Number.isFinite(v) ? v : 0) | 0;
        return ((h ^ n) * 16777619) >>> 0;
      };

      // Build a *sparse* key for nodes layout + render caching.
      // Important: do NOT iterate every row/col cell here (that's what we're trying to avoid).
      mapKey = __dgHashStep(mapKey, s.rows);
      mapKey = __dgHashStep(mapKey, s.cols);
      mapKey = __dgHashStep(mapKey, Math.round(s.cw * 1000));
      mapKey = __dgHashStep(mapKey, Math.round(s.ch * 1000));
      mapKey = __dgHashStep(mapKey, Math.round(s.topPad * 1000));
      mapKey = __dgHashStep(mapKey, Math.round((s.gridArea?.x || 0) * 1000));
      mapKey = __dgHashStep(mapKey, Math.round((s.gridArea?.y || 0) * 1000));
      mapKey = __dgHashStep(mapKey, Math.round((s.gridArea?.w || 0) * 1000));
      mapKey = __dgHashStep(mapKey, Math.round((s.gridArea?.h || 0) * 1000));
      mapKey = __dgHashStep(mapKey, hasTwoLines ? 1 : 0);
      mapKey = __dgHashStep(mapKey, isZoomed ? 1 : 0);

      if (s.currentMap) {
        // IMPORTANT PERF: avoid iterating over every node just to build a cache key.
        // Node sets can be large (and this was dominating drawgrid.nodes.layout in perf).
        // Instead, rely on a simple revision counter that we bump whenever nodes/active/disabled change.
        const __rev = (Number.isFinite(s.currentMap.__dgRev) ? s.currentMap.__dgRev : 0) | 0;
        mapKey = __dgHashStep(mapKey, __rev);

        // Also hash the active mask (cheap, cols is small) so toggles are reflected even if a caller forgets to bump rev.
        if (Array.isArray(s.currentMap.active)) {
          for (let c = 0; c < s.cols; c++) {
            mapKey = __dgHashStep(mapKey, s.currentMap.active[c] ? 1 : 0);
          }
        }
      }

      const dragCol = (typeof s.dragScaleHighlightCol === 'number') ? s.dragScaleHighlightCol : -1;
      const dragRow = (s.draggedNode && typeof s.draggedNode.row === 'number') ? s.draggedNode.row : -1;
      mapKey = __dgHashStep(mapKey, dragCol);
      mapKey = __dgHashStep(mapKey, dragRow);

      const cache = nodesCache;
      const surfacePxW = surface?.width ?? s.nctx.canvas?.width ?? 0;
      const surfacePxH = surface?.height ?? s.nctx.canvas?.height ?? 0;
      if (!cache.canvas) cache.canvas = document.createElement('canvas');
      if (cache.canvas.width !== surfacePxW) cache.canvas.width = surfacePxW;
      if (cache.canvas.height !== surfacePxH) cache.canvas.height = surfacePxH;
      if (!cache.ctx) cache.ctx = cache.canvas.getContext('2d');
      const cacheKey = `${mapKey}|${Math.round(radius * 1000)}|${surfacePxW}x${surfacePxH}`;
      const cacheMiss = cache.key !== cacheKey;

      const cacheHit = !cacheMiss && cache.canvas && Array.isArray(cache.nodeCoords);
      if (cacheHit) {
        // Reuse last layout for hit-testing; avoid O(cols*rows) rebuilds.
        nodeCoords = cache.nodeCoords;
        d.setNodeCoordsForHitTest(nodeCoords);

        if (__perfOn && __layoutStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.layout', performance.now() - __layoutStart); } catch {}
        }

        const __cacheBlitStart = __perfOn ? performance.now() : 0;
        // Cache is stored in device pixels; blit in device space to avoid double-scaling.
        d.R.withDeviceSpace(s.nctx, () => {
          s.nctx.drawImage(cache.canvas, 0, 0);
        });
        if (__perfOn && __cacheBlitStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.cacheBlit', performance.now() - __cacheBlitStart); } catch {}
        }
      }

      // Non-spammy node/canvas scale tracing (logs only when the relevant scale inputs change).
      // Repro: zoomed-out scene -> create draw toy -> draw line; notes/connectors/text appear smaller and shrink further on zoom.
      if (typeof window !== 'undefined' && window.__DG_NODE_SCALE_TRACE) {
        let __dgScaleHash = 2166136261;
        __dgScaleHash = __dgHashStep(__dgScaleHash, s.rows);
        __dgScaleHash = __dgHashStep(__dgScaleHash, s.cols);
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round(s.cw * 1000));
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round(s.ch * 1000));
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round(s.topPad * 1000));
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round((s.gridArea?.x || 0) * 1000));
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round((s.gridArea?.y || 0) * 1000));
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round((s.gridArea?.w || 0) * 1000));
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round((s.gridArea?.h || 0) * 1000));
        __dgScaleHash = __dgHashStep(__dgScaleHash, isZoomed ? 1 : 0);
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round((s.cssW || 0) * 10));
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round((s.cssH || 0) * 10));
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round(((Number.isFinite(s.paintDpr) ? s.paintDpr : 1) || 1) * 1000));

        const __last = s.panel.__dgLastNodeScaleHash;
        if (__last !== __dgScaleHash) {
          s.panel.__dgLastNodeScaleHash = __dgScaleHash;

          const panelRect = s.panel?.getBoundingClientRect?.();
          const wrapRect = s.wrap?.getBoundingClientRect?.();
          const nodesRect = s.nctx?.canvas?.getBoundingClientRect?.();
          const nodesPx = s.nctx?.canvas ? { w: s.nctx.canvas.width, h: s.nctx.canvas.height } : null;
          const paintCanvas = (typeof d.getActivePaintCanvas === 'function')
            ? d.getActivePaintCanvas()
            : (s.frontCanvas || s.paint || null);
          const nodesScale = d.__dgDescribeCanvasScale(s.nctx?.canvas, wrapRect);
          const paintScale = d.__dgDescribeCanvasScale(paintCanvas, wrapRect);
          const frontScale = d.__dgDescribeCanvasScale(s.frontCanvas, wrapRect);
          const backScale = d.__dgDescribeCanvasScale(s.backCanvas, wrapRect);
          const paintSnap = d.__dgGetCanvasSizingSnapshot(paintCanvas);
          const frontSnap = d.__dgGetCanvasSizingSnapshot(s.frontCanvas);
          const backSnap = d.__dgGetCanvasSizingSnapshot(s.backCanvas);
          const wrapScaleW = (wrapRect && wrapRect.width && s.wrap?.clientWidth)
            ? +(wrapRect.width / s.wrap.clientWidth).toFixed(3)
            : null;
          const wrapScaleH = (wrapRect && wrapRect.height && s.wrap?.clientHeight)
            ? +(wrapRect.height / s.wrap.clientHeight).toFixed(3)
            : null;
          const layoutCache = d.getLayoutCache?.();

          const payload = {
            panelId: s.panel?.id || null,
            paintDpr: s.paintDpr,
            deviceDpr: (typeof devicePixelRatio === 'number' ? devicePixelRatio : null),
            cssW: s.cssW, cssH: s.cssH,
            panelRect: panelRect ? { w: Math.round(panelRect.width), h: Math.round(panelRect.height) } : null,
            wrapRect: wrapRect ? { w: Math.round(wrapRect.width), h: Math.round(wrapRect.height) } : null,
            wrapClient: s.wrap ? { w: s.wrap.clientWidth || 0, h: s.wrap.clientHeight || 0 } : null,
            wrapScaleW,
            wrapScaleH,
            boardScale: (Number.isFinite(s.boardScale) ? +s.boardScale.toFixed(3) : null),
            layoutCache: layoutCache || null,
            nodesRect: nodesRect ? { w: Math.round(nodesRect.width), h: Math.round(nodesRect.height) } : null,
            nodesPx,
            nodesScale,
            paintScale,
            frontScale,
            backScale,
            activePaintRole: paintCanvas?.getAttribute?.('data-role') || null,
            usingBackBuffers: s.usingBackBuffers,
            paintSizes: { active: paintSnap, front: frontSnap, back: backSnap },
            paintActivePxW: paintSnap?.pxW ?? null,
            paintActivePxH: paintSnap?.pxH ?? null,
            paintActiveRectW: paintSnap?.rectW ?? null,
            paintActiveRectH: paintSnap?.rectH ?? null,
            paintActiveClientW: paintSnap?.clientW ?? null,
            paintActiveClientH: paintSnap?.clientH ?? null,
            paintActiveCssW: paintSnap?.cssW ?? null,
            paintActiveCssH: paintSnap?.cssH ?? null,
            paintActiveTsmCssW: paintSnap?.tsmCssW ?? null,
            paintActiveTsmCssH: paintSnap?.tsmCssH ?? null,
            paintActiveDgCssW: paintSnap?.dgCssW ?? null,
            paintActiveDgCssH: paintSnap?.dgCssH ?? null,
            paintActiveEffDprW: paintSnap?.effDprW ?? null,
            paintActiveEffDprH: paintSnap?.effDprH ?? null,
            gridArea: s.gridArea ? { x: Math.round(s.gridArea.x), y: Math.round(s.gridArea.y), w: Math.round(s.gridArea.w), h: Math.round(s.gridArea.h) } : null,
            cw: Number.isFinite(s.cw) ? +s.cw.toFixed(3) : s.cw,
            ch: Number.isFinite(s.ch) ? +s.ch.toFixed(3) : s.ch,
            topPad: Number.isFinite(s.topPad) ? +s.topPad.toFixed(3) : s.topPad,
            // sanity: if these drift, notes/connectors can visually "shrink" within the canvas
            gridColsW: Number.isFinite(s.cw) ? +(s.cw * s.cols).toFixed(2) : null,
            gridRowsH: Number.isFinite(s.ch) ? +(s.ch * s.rows).toFixed(2) : null,
          };
          d.dgNodeScaleTrace('drawNodes:basis', payload);
        }
      }

      if (!cacheHit) {
        nodeCoords = [];
        d.setNodeCoordsForHitTest(nodeCoords);
        for (let c = 0; c < s.cols; c++) {
          if (!nodes[c] || nodes[c].size === 0) continue;
          for (const r of nodes[c]) {
            const x = s.gridArea.x + c * s.cw + s.cw * 0.5;
            const y = s.gridArea.y + s.topPad + r * s.ch + s.ch * 0.5;
            const groupEntry = s.nodeGroupMap?.[c]?.get(r) ?? null;
            const disabledSet = s.currentMap?.disabled?.[c];
            const isDisabled = !!(disabledSet && disabledSet.has(r));
            if (Array.isArray(groupEntry) && groupEntry.length > 0) {
              for (let i = groupEntry.length - 1; i >= 0; i--) {
                const gid = groupEntry[i];
                const nodeData = { x, y, col: c, row: r, radius: radius * 1.5, group: gid, disabled: isDisabled };
                nodeCoords.push(nodeData);
              }
            } else {
              const groupId = typeof groupEntry === 'number' ? groupEntry : null;
              const nodeData = { x, y, col: c, row: r, radius: radius * 1.5, group: groupId, disabled: isDisabled };
              nodeCoords.push(nodeData);
            }
          }
        }

        cache.nodeCoords = nodeCoords;
        if (__perfOn && __layoutStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.layout', performance.now() - __layoutStart); } catch {}
        }
      }

      if (!cacheHit && cacheMiss) {
        d.FD.layerDebugLog('nodes-cache-miss', {
          panelId: s.panel?.id || null,
          cacheKey,
          surfacePxW,
          surfacePxH,
          cssW: s.cssW,
          cssH: s.cssH,
          nodeCount: nodeCoords.length,
        });
        const __drawStart = __perfOn ? performance.now() : 0;
        d.renderDragScaleBlueHints(s.nctx);
        s.nctx.lineWidth = 3;
        const colsMap = new Map();
        for (const node of nodeCoords) {
          if (!colsMap.has(node.col)) colsMap.set(node.col, []);
          colsMap.get(node.col).push(node);
        }

        const colorFor = (gid, active = true) => {
          if (!active) return 'rgba(80, 100, 160, 0.6)';
          if (gid === 1) return 'rgba(125, 180, 255, 0.9)';
          if (gid === 2) return 'rgba(255, 160, 120, 0.9)';
          return 'rgba(255, 255, 255, 0.85)';
        };

        const matchGroup = (value, gid) => {
          if (gid == null) return value == null;
          return value === gid;
        };

        const __connStart = __perfOn ? performance.now() : 0;
        for (let c = 0; c < s.cols - 1; c++) {
          const currentColNodes = colsMap.get(c);
          const nextColNodes = colsMap.get(c + 1);
          if (!currentColNodes || !nextColNodes) continue;
          const currentIsActive = s.currentMap?.active?.[c] ?? false;
          const nextIsActive = s.currentMap?.active?.[c + 1] ?? true;
          const advanced = s.panel.classList.contains('toy-zoomed');

          const drawGroupConnections = (gid) => {
            for (const nodeA of currentColNodes) {
              if (!matchGroup(nodeA.group ?? null, gid)) continue;
              for (const nodeB of nextColNodes) {
                if (!matchGroup(nodeB.group ?? null, gid)) continue;
                const eitherDisabled = nodeA.disabled || nodeB.disabled;
                s.nctx.strokeStyle = colorFor(gid, currentIsActive && nextIsActive && !eitherDisabled);
                if (gid && advanced && !eitherDisabled) {
                  s.nctx.shadowColor = s.nctx.strokeStyle;
                  s.nctx.shadowBlur = 12;
                } else {
                  s.nctx.shadowColor = 'transparent';
                  s.nctx.shadowBlur = 0;
                }
                s.nctx.beginPath();
                s.nctx.moveTo(nodeA.x, nodeA.y);
                s.nctx.lineTo(nodeB.x, nodeB.y);
                s.nctx.stroke();
              }
            }
          };

          drawGroupConnections(1);
          drawGroupConnections(2);
          drawGroupConnections(null);
        }
        if (__perfOn && __connStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.connections', performance.now() - __connStart); } catch {}
        }

        s.nctx.shadowColor = 'transparent';
        s.nctx.shadowBlur = 0;

        const gradientCache = new Map();
        const getGradient = (ctx, x, y, r, color) => {
          const key = `${color}-${r}`;
          if (!gradientCache.has(key)) {
            const grad = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
            grad.addColorStop(0, color);
            grad.addColorStop(0.92, 'rgba(143, 168, 255, 0)');
            grad.addColorStop(1, 'rgba(143, 168, 255, 0)');
            gradientCache.set(key, grad);
          }
          return gradientCache.get(key);
        };

        const __circleStart = __perfOn ? performance.now() : 0;
        for (const node of nodeCoords) {
          const disabled = node.disabled || s.currentMap?.disabled?.[node.col]?.has(node.row);
          const group = node.group ?? null;
          const advanced = s.panel.classList.contains('toy-zoomed');
          const isSpecialLine1 = group === 1;
          const isSpecialLine2 = group === 2;
          const mainColor = disabled
            ? 'rgba(143, 168, 255, 0.4)'
            : isSpecialLine1
              ? 'rgba(125, 180, 255, 0.92)'
              : isSpecialLine2
                ? 'rgba(255, 160, 120, 0.92)'
                : 'rgba(255, 255, 255, 0.92)';

          if (advanced && (isSpecialLine1 || isSpecialLine2) && !disabled) {
            const glowRadius = node.radius * 1.6;
            const glowColor = isSpecialLine1 ? 'rgba(125, 180, 255, 0.4)' : 'rgba(255, 160, 120, 0.4)';
            s.nctx.fillStyle = glowColor;
            s.nctx.beginPath();
            s.nctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
            s.nctx.fill();
          }

          s.nctx.fillStyle = getGradient(s.nctx, node.x, node.y, node.radius, mainColor);
          s.nctx.beginPath();
          s.nctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          s.nctx.fill();

          s.nctx.beginPath();
          s.nctx.fillStyle = disabled ? 'rgba(90, 110, 150, 0.65)' : 'rgba(255, 255, 255, 0.9)';
          s.nctx.arc(node.x, node.y, node.radius * 0.55, 0, Math.PI * 2);
          s.nctx.fill();

          s.nctx.fillStyle = disabled ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.5)';
          s.nctx.beginPath();
          s.nctx.arc(node.x, node.y - node.radius * 0.3, node.radius * 0.3, 0, Math.PI * 2);
          s.nctx.fill();
        }
        if (__perfOn && __circleStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.circles', performance.now() - __circleStart); } catch {}
        }

        if (s.panel.classList.contains('toy-zoomed')) {
          const __outlineStart = __perfOn ? performance.now() : 0;
          for (const node of nodeCoords) {
            if (!node.group) continue;
            const disabled = node.disabled || s.currentMap?.disabled?.[node.col]?.has(node.row);
            const outlineColor = node.group === 1
              ? 'rgba(125, 180, 255, 0.95)'
              : node.group === 2
                ? 'rgba(255, 160, 120, 0.95)'
                : 'rgba(255, 255, 255, 0.85)';
            const strokeAlpha = disabled ? 0.65 : 1;
            s.nctx.lineWidth = disabled ? 2 : 3.5;
            s.nctx.strokeStyle = outlineColor.replace(/0\.[0-9]+\)$/, `${strokeAlpha})`);
            s.nctx.beginPath();
            s.nctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            s.nctx.stroke();
          }
          if (__perfOn && __outlineStart) {
            try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.outlines', performance.now() - __outlineStart); } catch {}
          }
        }

        if (cache.ctx) {
          cache.ctx.setTransform(1, 0, 0, 1, 0, 0);
          cache.ctx.clearRect(0, 0, cache.canvas.width, cache.canvas.height);
          cache.ctx.drawImage(s.nctx.canvas, 0, 0);
        }
        cache.key = cacheKey;
        cache.nodeCoords = nodeCoords;
        if (__perfOn && __drawStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.draw', performance.now() - __drawStart); } catch {}
        }
      }

      const blockCache = blocksCache;
      if (!blockCache.canvas) blockCache.canvas = document.createElement('canvas');
      if (blockCache.canvas.width !== surfacePxW) blockCache.canvas.width = surfacePxW;
      if (blockCache.canvas.height !== surfacePxH) blockCache.canvas.height = surfacePxH;
      if (!blockCache.ctx) blockCache.ctx = blockCache.canvas.getContext('2d');
      const blockKey = `${mapKey}|${Math.round(radius * 1000)}|${surfacePxW}x${surfacePxH}|blocks`;
      if (blockCache.key !== blockKey && blockCache.ctx) {
        const __blocksBuildStart = __perfOn ? performance.now() : 0;
        blockCache.key = blockKey;
        d.R.resetCtx(blockCache.ctx);
        d.R.withLogicalSpace(blockCache.ctx, () => {
          blockCache.ctx.clearRect(0, 0, width, height);
          for (const node of nodeCoords) {
            const colActive = s.currentMap?.active?.[node.col] ?? true;
            const nodeOn = colActive && !node.disabled;
            const size = radius * 2;
            const cubeRect = { x: node.x - size / 2, y: node.y - size / 2, w: size, h: size };
            d.drawBlock(blockCache.ctx, cubeRect, {
              baseColor: nodeOn ? '#ff8c00' : '#333',
              active: nodeOn,
              variant: 'button',
              noteLabel: null,
              showArrows: false,
            });
          }
          d.drawNoteLabelsTo(blockCache.ctx, nodes);
        });
        if (__perfOn && __blocksBuildStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.blocks.build', performance.now() - __blocksBuildStart); } catch {}
        }
      }

      if (blockCache.canvas) {
        const __blocksBlitStart = __perfOn ? performance.now() : 0;
        // Block cache is device-pixel content; blit without logical scaling.
        d.R.withDeviceSpace(s.nctx, () => {
          s.nctx.drawImage(blockCache.canvas, 0, 0);
        });
        if (__perfOn && __blocksBlitStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.blocks.blit', performance.now() - __blocksBlitStart); } catch {}
        }
      }

      const __flashStart = __perfOn ? performance.now() : 0;
      for (const node of nodeCoords) {
        const flash = s.flashes[node.col] || 0;
        if (flash <= 0) continue;
        const size = radius * 2;
        const cubeRect = { x: node.x - size / 2, y: node.y - size / 2, w: size, h: size };
        s.nctx.save();
        const scaleFlash = 1 + 0.15 * Math.sin(flash * Math.PI);
        s.nctx.translate(node.x, node.y);
        s.nctx.scale(scaleFlash, scaleFlash);
        s.nctx.translate(-node.x, -node.y);
        d.drawBlock(s.nctx, cubeRect, {
          baseColor: '#FFFFFF',
          active: true,
          variant: 'button',
          noteLabel: null,
          showArrows: false,
        });
        s.nctx.restore();
      }
      if (__perfOn && __flashStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.flash', performance.now() - __flashStart); } catch {}
      }
      if (s.tutorialHighlightMode !== 'none') {
        const __tutorialStart = __perfOn ? performance.now() : 0;
        d.renderTutorialHighlight();
        if (__perfOn && __tutorialStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.tutorial', performance.now() - __tutorialStart); } catch {}
        }
      } else {
        const __tutorialStart = __perfOn ? performance.now() : 0;
        d.clearTutorialHighlight();
        if (__perfOn && __tutorialStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.tutorial', performance.now() - __tutorialStart); } catch {}
        }
      }

      d.setNodeCoordsForHitTest(nodeCoords);
    });
    if (s.DG_SINGLE_CANVAS && !s.DG_SINGLE_CANVAS_OVERLAYS) {
      d.__dgMarkSingleCanvasCompositeDirty(s.panel);
    }
    d.FD.layerTrace('drawNodes:exit', {
      panelId: s.panel?.id || null,
      usingBackBuffers: s.usingBackBuffers,
      nctxRole: s.nctx?.canvas?.getAttribute?.('data-role') || null,
    });
  }

  return {
    drawNodes,
    bumpNodesRev,
    resetNodesCache,
    resetBlocksCache,
  };
}
