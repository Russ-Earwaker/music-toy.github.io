// src/drawgrid/dg-nodes-render.js
// DrawGrid node rendering + caches.

export function createDgNodesRender({ state, deps } = {}) {
  const s = state;
  const d = deps;

  const nodesCache = { canvas: null, ctx: null, key: 0, nodeCoords: null };
  const blocksCache = { canvas: null, ctx: null, key: '' };

  // ---------------------------------------------------------------------------
  // Debug (low spam):
  //   window.__DG_NODES_DEBUG = true
  //   window.__DG_NODES_DEBUG_VERBOSE = true
  //   window.__DG_DUMP_NODES_DEBUG()
  //
  // Stores a ring buffer on the panel so when the bug happens you can dump it.
  // ---------------------------------------------------------------------------
  function __dbgEnabled() {
    try { return !!(typeof window !== 'undefined' && window.__DG_NODES_DEBUG); } catch { return false; }
  }
  function __dbgVerbose() {
    try { return !!(typeof window !== 'undefined' && window.__DG_NODES_DEBUG_VERBOSE); } catch { return false; }
  }
  function __dbgRing(panel) {
    try {
      if (!panel) return null;
      if (!panel.__dgNodesDbg) panel.__dgNodesDbg = { i: 0, arr: new Array(60) };
      return panel.__dgNodesDbg;
    } catch { return null; }
  }
  function __dbgPush(panel, evt) {
    const ring = __dbgRing(panel);
    if (!ring) return;
    ring.arr[ring.i % ring.arr.length] = evt;
    ring.i++;
    try {
      if (typeof window !== 'undefined') window.__DG_LAST_NODES_PANEL = panel;
    } catch {}
  }
  function __dbgLogChanged(panel, key, payload) {
    if (!__dbgEnabled()) return;
    try {
      const lastKey = panel.__dgNodesDbgLastKey;
      if (!__dbgVerbose() && lastKey === key) return;
      panel.__dgNodesDbgLastKey = key;
      // Keep console output short; details are in ring buffer.
      console.log('[DG][NODES][DBG]', payload);
    } catch {}
  }

  function __probePixel(ctx, x, y) {
    try {
      const ix = Math.max(0, Math.min((ctx.canvas.width - 1) | 0, x | 0));
      const iy = Math.max(0, Math.min((ctx.canvas.height - 1) | 0, y | 0));
      const d = ctx.getImageData(ix, iy, 1, 1).data;
      return { x: ix, y: iy, rgba: [d[0], d[1], d[2], d[3]] };
    } catch {
      return null;
    }
  }

  function __dbgCanvasInfo(c) {
    try {
      if (!c) return null;
      return {
        role: c.getAttribute?.('data-role') || null,
        w: c.width || 0,
        h: c.height || 0,
        cssW: c.style?.width || null,
        cssH: c.style?.height || null,
        disp: c.style?.display || null,
        op: c.style?.opacity || null,
        vis: c.style?.visibility || null,
      };
    } catch {
      return null;
    }
  }
  // Install dumper once.
  try {
    if (typeof window !== 'undefined' && !window.__DG_DUMP_NODES_DEBUG) {
      window.__DG_DUMP_NODES_DEBUG = () => {
        const p = window.__DG_LAST_NODES_PANEL;
        const ring = p && p.__dgNodesDbg;
        if (!p || !ring) {
          console.warn('[DG][NODES][DBG] no ring buffer yet (toggle __DG_NODES_DEBUG and repro once)');
          return;
        }
        const out = [];
        const n = ring.arr.length;
        for (let k = 0; k < n; k++) {
          const idx = (ring.i - n + k);
          const e = ring.arr[(idx % n + n) % n];
          if (e) out.push(e);
        }
        console.log('[DG][NODES][DBG] dump panel=', p.id, 'events=', out.length);
        console.table(out);
      };
    }
  } catch {}

  // Small hash helper (kept allocation-free).
  const __dgHashStep = (h, v) => {
    const n = (Number.isFinite(v) ? v : 0) | 0;
    return ((h ^ n) * 16777619) >>> 0;
  };

  function __dgComputeNodesCacheKey(surfacePxW, surfacePxH, nodes) {
    // Build a sparse key: it must capture *visual-affecting* inputs only.
    let mapKey = 2166136261;

    // For debugging: build a tiny "nodes signature" hash (per-column sizes + first few rows).
    // This helps verify random-gen is actually changing node data across calls.
    let nodesSig = 2166136261;
    if (Array.isArray(nodes)) {
      for (let c = 0; c < s.cols; c++) {
        const col = nodes[c];
        const sz = (col && typeof col.size === 'number') ? (col.size | 0) : 0;
        nodesSig = __dgHashStep(nodesSig, sz);
        if (sz > 0 && col && typeof col[Symbol.iterator] === 'function') {
          let i = 0;
          for (const r of col) {
            nodesSig = __dgHashStep(nodesSig, r | 0);
            if (++i >= 3) break;
          }
        }
      }
    }

    // Layout / geometry
    mapKey = __dgHashStep(mapKey, s.rows);
    mapKey = __dgHashStep(mapKey, s.cols);
    mapKey = __dgHashStep(mapKey, Math.round(s.cw * 1000));
    mapKey = __dgHashStep(mapKey, Math.round(s.ch * 1000));
    mapKey = __dgHashStep(mapKey, Math.round(s.topPad * 1000));
    mapKey = __dgHashStep(mapKey, Math.round((s.gridArea?.x || 0) * 1000));
    mapKey = __dgHashStep(mapKey, Math.round((s.gridArea?.y || 0) * 1000));
    mapKey = __dgHashStep(mapKey, Math.round((s.gridArea?.w || 0) * 1000));
    mapKey = __dgHashStep(mapKey, Math.round((s.gridArea?.h || 0) * 1000));

    // Visual mode flags
    const isZoomed = !!s.panel?.classList?.contains?.('toy-zoomed');
    const hasTwoLines = Array.isArray(s.strokes) && s.strokes.some(stroke => stroke && stroke.generatorId === 2);
    mapKey = __dgHashStep(mapKey, hasTwoLines ? 1 : 0);
    mapKey = __dgHashStep(mapKey, isZoomed ? 1 : 0);

    // Include nodes signature so random-gen changes invalidate cache even if rev isn't bumped.
    mapKey = __dgHashStep(mapKey, nodesSig);

    // Any content mutation that affects nodes/active/disabled must bump __dgRev.
    if (s.currentMap) {
      const __rev = (Number.isFinite(s.currentMap.__dgRev) ? s.currentMap.__dgRev : 0) | 0;
      mapKey = __dgHashStep(mapKey, __rev);
    }

    // Drag highlight can change visuals.
    const dragCol = (typeof s.dragScaleHighlightCol === 'number') ? s.dragScaleHighlightCol : -1;
    const dragRow = (s.draggedNode && typeof s.draggedNode.row === 'number') ? s.draggedNode.row : -1;
    mapKey = __dgHashStep(mapKey, dragCol);
    mapKey = __dgHashStep(mapKey, dragRow);

    // Radius affects glyph size.
    const radius = Math.max(4, Math.min(s.cw, s.ch) * 0.20);
    let key = mapKey >>> 0;
    key = __dgHashStep(key, Math.round(radius * 1000));
    key = __dgHashStep(key, surfacePxW);
    key = __dgHashStep(key, surfacePxH);
    return { key: (key >>> 0), nodesSig: (nodesSig >>> 0) };
  }

  function resetNodesCache() {
    nodesCache.key = 0;
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
    // During pan/zoom/resize (and some random-gen paths), we can be called when the grid
    // layout isn't ready yet OR nodes aren't available for a frame. In those cases, do NOT
    // clear/reset; instead, re-blit the last cached layers so lines don't vanish.
    const gridReady = !!d.isGridReady();
    const haveNodes = !!nodes;

    const surface = s.nctx?.canvas || null;
    const surfacePxW = surface?.width ?? 0;
    const surfacePxH = surface?.height ?? 0;

    // Debug: detect surface backing-store changes (common during pan/zoom).
    const prevW = (s.panel && s.panel.__dgNodesPrevSurfW) || 0;
    const prevH = (s.panel && s.panel.__dgNodesPrevSurfH) || 0;
    const surfChanged = (prevW !== surfacePxW) || (prevH !== surfacePxH);
    try {
      if (s.panel) {
        s.panel.__dgNodesPrevSurfW = surfacePxW;
        s.panel.__dgNodesPrevSurfH = surfacePxH;
      }
    } catch {}

    const fallbackBlit = () => {
      const nc = nodesCache;
      const bc = blocksCache;
      if (!surfacePxW || !surfacePxH) return false;
      if (!nc?.canvas || !bc?.canvas) return false;
      // Only blit if caches match current surface size; otherwise they're stale.
      if (nc.canvas.width !== surfacePxW || nc.canvas.height !== surfacePxH) return false;
      if (bc.canvas.width !== surfacePxW || bc.canvas.height !== surfacePxH) return false;

      // In combined mode, ensure grid is present before blitting cached nodes.
      if (s.DG_COMBINE_GRID_NODES) {
        try {
          if (!s.panel.__dgGridReadyForNodes) d.drawGrid();
          s.panel.__dgGridReadyForNodes = false;
        } catch {}
      }

      // Nodes layer (connecting lines + node glow circles)
      d.R.withDeviceSpace(s.nctx, () => {
        if (!s.DG_COMBINE_GRID_NODES) {
          const prevOp = s.nctx.globalCompositeOperation;
          s.nctx.globalCompositeOperation = 'copy';
          s.nctx.drawImage(nc.canvas, 0, 0);
          s.nctx.globalCompositeOperation = prevOp;
        } else {
          s.nctx.drawImage(nc.canvas, 0, 0);
        }
      });

      // Blocks layer (orange nodes + note labels) must never wipe lines.
      d.R.withDeviceSpace(s.nctx, () => {
        const prevOp = s.nctx.globalCompositeOperation;
        const prevAlpha = s.nctx.globalAlpha;
        s.nctx.globalCompositeOperation = 'source-over';
        s.nctx.globalAlpha = 1;
        s.nctx.drawImage(bc.canvas, 0, 0);
        s.nctx.globalCompositeOperation = prevOp;
        s.nctx.globalAlpha = prevAlpha;
      });
      return true;
    };

    if (!gridReady || !haveNodes) {
      // Keep last good visuals during transitional frames.
      const ok = fallbackBlit();
      if (__dbgEnabled()) {
        __dbgPush(s.panel, {
          t: Math.round((performance?.now?.() ?? Date.now())),
          phase: 'pre',
          gridReady,
          haveNodes,
          surfPx: `${surfacePxW}x${surfacePxH}`,
          surfChanged,
          fallback: ok ? 'hit' : 'MISS',
          ncPx: nodesCache?.canvas ? `${nodesCache.canvas.width}x${nodesCache.canvas.height}` : 'none',
          bcPx: blocksCache?.canvas ? `${blocksCache.canvas.width}x${blocksCache.canvas.height}` : 'none',
        });
        __dbgLogChanged(s.panel, `pre|${gridReady}|${haveNodes}|${surfacePxW}x${surfacePxH}|${ok ? 1 : 0}`, {
          phase: 'pre',
          gridReady,
          haveNodes,
          surfPx: `${surfacePxW}x${surfacePxH}`,
          surfChanged,
          fallback: ok ? 'hit' : 'MISS',
        });
      }
      if (ok) return;
      // If we have nothing cached yet, there's nothing safe to draw.
      return;
    }

    if (__dbgEnabled()) {
      __dbgPush(s.panel, {
        t: Math.round((performance?.now?.() ?? Date.now())),
        phase: 'enter',
        gridReady,
        haveNodes,
        surfPx: `${surfacePxW}x${surfacePxH}`,
        surfChanged,
      });
      __dbgLogChanged(s.panel, `enter|${surfacePxW}x${surfacePxH}|${surfChanged ? 1 : 0}`, {
        phase: 'enter',
        surfPx: `${surfacePxW}x${surfacePxH}`,
        surfChanged,
      });
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
    // (surface/surfacePxW/surfacePxH already computed above)
    let __nodesBitmapHit = false;

    // --- FAST PATH: cached nodes bitmap hit --------------------------------
    // Compute cache key without entering logical-space transforms or resetting ctx.
    // If we hit, blit and return early.
    const cache = nodesCache;
    const { key: cacheKey, nodesSig } = __dgComputeNodesCacheKey(surfacePxW, surfacePxH, nodes);

    const cacheHit = (cache.key >>> 0) === (cacheKey >>> 0) && cache.canvas && Array.isArray(cache.nodeCoords);
    if (cacheHit) {
      __nodesBitmapHit = true;
      nodeCoords = cache.nodeCoords;
      d.setNodeCoordsForHitTest(nodeCoords);

      if (__dbgEnabled()) {
        __dbgPush(s.panel, { t: Math.round((performance?.now?.() ?? Date.now())), phase: 'cacheHit', cacheKey, nodesSig, nodeCoords: nodeCoords?.length ?? 0 });
        __dbgLogChanged(s.panel, `hit|${cacheKey}|${nodesSig}|${nodeCoords?.length ?? 0}`, { phase: 'cacheHit', cacheKey, nodesSig, nodeCoords: nodeCoords?.length ?? 0 });
      }

      if (__perfOn && __layoutStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.layout', performance.now() - __layoutStart); } catch {}
      }

      // If grid+nodes are combined, ensure the grid is present before we draw cached nodes.
      if (s.DG_COMBINE_GRID_NODES) {
        try {
          if (!s.panel.__dgGridReadyForNodes) {
            d.drawGrid();
          }
          s.panel.__dgGridReadyForNodes = false;
        } catch {}
      }

      const __cacheBlitStart = __perfOn ? performance.now() : 0;
      d.R.withDeviceSpace(s.nctx, () => {
        if (!s.DG_COMBINE_GRID_NODES) {
          const prevOp = s.nctx.globalCompositeOperation;
          s.nctx.globalCompositeOperation = 'copy';
          s.nctx.drawImage(cache.canvas, 0, 0);
          s.nctx.globalCompositeOperation = prevOp;
        } else {
          // In combined mode we must not wipe the already-rendered grid layer.
          s.nctx.drawImage(cache.canvas, 0, 0);
        }
      });
      if (__perfOn && __cacheBlitStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.cacheBlit', performance.now() - __cacheBlitStart); } catch {}
      }

      // IMPORTANT: on cache-hit we skipped resetCtx(). Make sure we don't carry over
      // a destructive composite mode like 'copy' into later overlays (blocksCache),
      // which would otherwise wipe out the connecting lines.
      try {
        s.nctx.globalCompositeOperation = 'source-over';
        s.nctx.globalAlpha = 1;
        s.nctx.shadowColor = 'transparent';
        s.nctx.shadowBlur = 0;
      } catch {}
      // IMPORTANT: do NOT return here.
      // The orange square nodes are drawn by blocksCache later in this function.
    }

    // --- Slow path (cache miss): do the full setup -------------------------
    if (!__nodesBitmapHit) {
      d.R.resetCtx(s.nctx);
      if (s.DG_COMBINE_GRID_NODES) {
        if (!s.panel.__dgGridReadyForNodes) {
          d.drawGrid();
        }
        s.panel.__dgGridReadyForNodes = false;
      }
      if (__dbgEnabled()) {
        __dbgPush(s.panel, { t: Math.round((performance?.now?.() ?? Date.now())), phase: 'slowPath', cacheKey, nodesSig });
        __dbgLogChanged(s.panel, `slow|${cacheKey}|${nodesSig}`, { phase: 'slowPath', cacheKey, nodesSig });
      }
    }
    const scale = (Number.isFinite(s.paintDpr) && s.paintDpr > 0) ? s.paintDpr : 1;
    const width = s.cssW || (surface?.width ?? 0) / scale;
    const height = s.cssH || (surface?.height ?? 0) / scale;
    if (!s.__dgProbeDidFirstDraw && typeof window !== 'undefined' && window.__DG_PROBE_ON !== false) {
      s.__dgProbeDidFirstDraw = true;
      try { d.__dgProbeDump?.('first-draw:nodes'); } catch {}
    }
    d.__dgWithLogicalSpace(s.nctx, () => {
      // If we took the fast path, we already have nodeCoords and already drew nodes bitmap.
      // Skip all nodes rendering on hit, but still draw blocksCache + flashes + tutorial below.
      if (__nodesBitmapHit) {
        // (Keep going; blocksCache uses nodeCoords.)
      }

      const radius = Math.max(4, Math.min(s.cw, s.ch) * 0.20);
      const isZoomed = s.panel.classList.contains('toy-zoomed');
      if (!cache.canvas) cache.canvas = document.createElement('canvas');
      if (cache.canvas.width !== surfacePxW) cache.canvas.width = surfacePxW;
      if (cache.canvas.height !== surfacePxH) cache.canvas.height = surfacePxH;
      if (!cache.ctx) cache.ctx = cache.canvas.getContext('2d');
      const cacheMiss = (cache.key >>> 0) !== (cacheKey >>> 0);
      if (!__nodesBitmapHit && !s.DG_COMBINE_GRID_NODES) {
        // Only clear when we are about to redraw nodes. When we have a cached bitmap we can
        // blit with globalCompositeOperation='copy' instead (which overwrites including transparency).
        d.R.withDeviceSpace(s.nctx, () => {
          s.nctx.clearRect(0, 0, surfacePxW, surfacePxH);
        });
      }
      if (!__nodesBitmapHit && cacheHit) {
        // Reuse last layout for hit-testing; avoid O(cols*rows) rebuilds.
        nodeCoords = cache.nodeCoords;
        d.setNodeCoordsForHitTest(nodeCoords);

        if (__perfOn && __layoutStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.layout', performance.now() - __layoutStart); } catch {}
        }

        const __cacheBlitStart = __perfOn ? performance.now() : 0;
        // Cache is stored in device pixels; blit in device space to avoid double-scaling.
        d.R.withDeviceSpace(s.nctx, () => {
          if (!s.DG_COMBINE_GRID_NODES) {
            const prevOp = s.nctx.globalCompositeOperation;
            s.nctx.globalCompositeOperation = 'copy';
            s.nctx.drawImage(cache.canvas, 0, 0);
            s.nctx.globalCompositeOperation = prevOp;
          } else {
            // In combined mode we must not wipe the already-rendered grid layer.
            s.nctx.drawImage(cache.canvas, 0, 0);
          }
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

      if (!__nodesBitmapHit && !cacheHit) {
        nodeCoords = [];
        d.setNodeCoordsForHitTest(nodeCoords);
        // Debug: capture per-column node sizes (helps verify random regen created contiguous cols).
        let __dbgColSizes = null;
        if (__dbgEnabled()) {
          try {
            __dbgColSizes = [];
            for (let c = 0; c < s.cols; c++) {
              const set = nodes?.[c];
              __dbgColSizes.push(set && typeof set.size === 'number' ? set.size : 0);
            }
          } catch {}
        }
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
        if (__dbgEnabled()) {
          __dbgPush(s.panel, {
            t: Math.round((performance?.now?.() ?? Date.now())),
            phase: 'layoutBuilt',
            nodeCoords: nodeCoords.length,
            colSizes: __dbgColSizes ? __dbgColSizes.join(',') : null
          });
        }
      }

      if (!__nodesBitmapHit && !cacheHit && cacheMiss) {
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
        // Debug counters: how many straight connections are actually drawn?
        let __dbgConnPairs = 0;
        let __dbgColsWithNodes = null;
        if (__dbgEnabled()) __dbgColsWithNodes = Array(s.cols).fill(0);
        let __dbgProbeMid = null;
        for (let c = 0; c < s.cols - 1; c++) {
          const currentColNodes = colsMap.get(c);
          const nextColNodes = colsMap.get(c + 1);
          if (!currentColNodes || !nextColNodes) continue;
          if (__dbgColsWithNodes) { __dbgColsWithNodes[c] = currentColNodes.length; __dbgColsWithNodes[c + 1] = nextColNodes.length; }
          const currentIsActive = s.currentMap?.active?.[c] ?? false;
          const nextIsActive = s.currentMap?.active?.[c + 1] ?? true;
          const advanced = s.panel.classList.contains('toy-zoomed');

          const drawGroupConnections = (gid) => {
            for (const nodeA of currentColNodes) {
              if (!matchGroup(nodeA.group ?? null, gid)) continue;
              for (const nodeB of nextColNodes) {
                if (!matchGroup(nodeB.group ?? null, gid)) continue;
                __dbgConnPairs++;
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

                // Take one probe sample on the very first drawn connection.
                if (!__dbgProbeMid && __dbgEnabled()) {
                  // node coords are logical-space; convert to device px inside withLogicalSpace:
                  // we can approximate by sampling the center of the canvas if unsure,
                  // but here we sample the midpoint and rely on current transform.
                  const mx = (nodeA.x + nodeB.x) * 0.5;
                  const my = (nodeA.y + nodeB.y) * 0.5;
                  // Transform logical->device using current ctx transform:
                  try {
                    const t = s.nctx.getTransform();
                    const dx = mx * t.a + my * t.c + t.e;
                    const dy = mx * t.b + my * t.d + t.f;
                    __dbgProbeMid = __probePixel(s.nctx, dx, dy);
                  } catch {
                    // Fallback: sample raw midpoint as px (still useful signal)
                    __dbgProbeMid = __probePixel(s.nctx, mx, my);
                  }
                }
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
        if (__dbgEnabled()) {
          __dbgPush(s.panel, {
            t: Math.round((performance?.now?.() ?? Date.now())),
            phase: 'connections',
            pairs: __dbgConnPairs,
            cols: __dbgColsWithNodes ? __dbgColsWithNodes.join(',') : null,
            isZoomed: !!s.panel.classList.contains('toy-zoomed'),
            activeCount: Array.isArray(s.currentMap?.active) ? s.currentMap.active.filter(Boolean).length : null,
            probe: __dbgProbeMid ? `${__dbgProbeMid.rgba.join(',')}` : null,
            probeXY: __dbgProbeMid ? `${__dbgProbeMid.x},${__dbgProbeMid.y}` : null,
            nctx: __dbgCanvasInfo(s.nctx?.canvas),
            front: __dbgCanvasInfo(s.frontCanvas),
            back: __dbgCanvasInfo(s.backCanvas),
          });
          __dbgLogChanged(s.panel, `conn|${__dbgConnPairs}|${__dbgColsWithNodes ? __dbgColsWithNodes.join(',') : ''}`, { phase: 'connections', pairs: __dbgConnPairs });
        }

        s.nctx.shadowColor = 'transparent';
        s.nctx.shadowBlur = 0;

        // NOTE: We intentionally do NOT draw the old "node glow circles" here.
        // They sit behind the orange square blocks and are never visible, so they
        // were wasted draw work on the hot path.

        if (cache.ctx) {
          cache.ctx.setTransform(1, 0, 0, 1, 0, 0);
          const prevOp = cache.ctx.globalCompositeOperation;
          cache.ctx.globalCompositeOperation = 'copy';
          cache.ctx.drawImage(s.nctx.canvas, 0, 0);
          cache.ctx.globalCompositeOperation = prevOp;
        }
        cache.key = cacheKey >>> 0;
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
      const fadeAlpha = Math.max(0, Math.min(1, Number.isFinite(s.gridVisibilityAlpha) ? s.gridVisibilityAlpha : 0));
      const fadeBucket = Math.round(fadeAlpha * 1000);
      const blockKey = `${cacheKey}|blocks|a:${fadeBucket}`;
      if (blockCache.key !== blockKey && blockCache.ctx) {
        const __blocksBuildStart = __perfOn ? performance.now() : 0;
        blockCache.key = blockKey;
        d.R.resetCtx(blockCache.ctx);
        d.R.withLogicalSpace(blockCache.ctx, () => {
          blockCache.ctx.clearRect(0, 0, width, height);
          d.renderDragScaleBlueHints(blockCache.ctx);
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
          const prevOp = s.nctx.globalCompositeOperation;
          const prevAlpha = s.nctx.globalAlpha;
          s.nctx.globalCompositeOperation = 'source-over';
          s.nctx.globalAlpha = 1;
          s.nctx.drawImage(blockCache.canvas, 0, 0);
          s.nctx.globalCompositeOperation = prevOp;
          s.nctx.globalAlpha = prevAlpha;
        });
        if (__perfOn && __blocksBlitStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.blocks.blit', performance.now() - __blocksBlitStart); } catch {}
        }
        if (__dbgEnabled()) {
          // Probe a stable pixel near canvas center after blocks blit too.
          const p = __probePixel(s.nctx, (s.nctx.canvas.width * 0.5) | 0, (s.nctx.canvas.height * 0.5) | 0);
          __dbgPush(s.panel, {
            t: Math.round((performance?.now?.() ?? Date.now())),
            phase: 'postBlocks',
            probe: p ? `${p.rgba.join(',')}` : null,
            probeXY: p ? `${p.x},${p.y}` : null,
            op: s.nctx.globalCompositeOperation,
            nctx: __dbgCanvasInfo(s.nctx?.canvas),
            front: __dbgCanvasInfo(s.frontCanvas),
            back: __dbgCanvasInfo(s.backCanvas),
          });
        }
      }

      const __flashStart = __perfOn ? performance.now() : 0;
      for (const node of nodeCoords) {
        const flash = s.flashes[node.col] || 0;
        if (flash <= 0) continue;
        // Flashes must never wipe nodes/lines; force safe composite.
        const __prevOp = s.nctx.globalCompositeOperation;
        s.nctx.globalCompositeOperation = 'source-over';
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
        s.nctx.globalCompositeOperation = __prevOp;
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
