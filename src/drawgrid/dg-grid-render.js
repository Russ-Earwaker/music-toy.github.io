// src/drawgrid/dg-grid-render.js
// DrawGrid grid-layer rendering (grid only).

export function createDgGridRender({ state, deps } = {}) {
  const s = state;
  const d = deps;

  let __dgGridPath = null;
  let __dgGridPathKey = '';
  let __dgGridCache = { canvas: null, ctx: null, key: '' };

  function crisp(v) {
    return Math.round(v) + 0.5;
  }

  function buildGridPath(noteGridY) {
    const path = new Path2D();
    // Verticals (including outer lines)
    for (let i = 0; i <= s.cols; i++) {
      const x = crisp(s.gridArea.x + i * s.cw);
      path.moveTo(x, noteGridY);
      path.lineTo(x, s.gridArea.y + s.gridArea.h);
    }
    // Horizontals (including outer lines)
    for (let j = 0; j <= s.rows; j++) {
      const y = crisp(noteGridY + j * s.ch);
      path.moveTo(s.gridArea.x, y);
      path.lineTo(s.gridArea.x + s.gridArea.w, y);
    }
    return path;
  }

  function renderGridTo(ctx, width, height, noteGridY, noteGridH, hasTwoLines) {
    if (!ctx) return;
    d.R.resetCtx(ctx);
    d.R.withLogicalSpace(ctx, () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Draw the note grid area below the top padding
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(s.gridArea.x, noteGridY, s.gridArea.w, noteGridH);

      // 2. Subtle fill for active columns
      if (s.currentMap) {
        for (let c = 0; c < s.cols; c++) {
          if (s.currentMap.nodes[c]?.size > 0 && s.currentMap.active[c]) {
            let fillOpacity = 0.1;
            if (hasTwoLines) {
              const totalNodes = s.currentMap.nodes[c].size;
              const disabledNodes = s.currentMap.disabled[c]?.size || 0;
              const activeNodes = totalNodes - disabledNodes;
              if (activeNodes === 1) fillOpacity = 0.05;
            }
            ctx.fillStyle = `rgba(143, 168, 255, ${fillOpacity})`;
            const x = s.gridArea.x + c * s.cw;
            ctx.fillRect(x, noteGridY, s.cw, noteGridH);
          }
        }
      }

      // 3. Draw all grid lines with the base color
      const cellW = s.cw || 24;
      const cellH = s.ch || 24;
      const cell = Math.max(4, Math.min(cellW, cellH));
      const gridLineWidthPx = Math.max(1, Math.min(cell * 0.03, 8));
      ctx.strokeStyle = 'rgba(143, 168, 255, 0.35)';
      ctx.lineWidth = gridLineWidthPx;
      if (typeof Path2D !== 'undefined') {
        const key = [
          s.gridArea.x, s.gridArea.y, s.gridArea.w, s.gridArea.h,
          s.rows, s.cols, s.cw, s.ch, s.topPad, noteGridY,
        ].join('|');
        if (key !== __dgGridPathKey || !__dgGridPath) {
          __dgGridPath = buildGridPath(noteGridY);
          __dgGridPathKey = key;
        }
        ctx.stroke(__dgGridPath);
      } else {
        // Verticals (including outer lines)
        for (let i = 0; i <= s.cols; i++) {
          const x = crisp(s.gridArea.x + i * s.cw);
          ctx.beginPath();
          ctx.moveTo(x, noteGridY);
          ctx.lineTo(x, s.gridArea.y + s.gridArea.h);
          ctx.stroke();
        }
        // Horizontals (including outer lines)
        for (let j = 0; j <= s.rows; j++) {
          const y = crisp(noteGridY + j * s.ch);
          ctx.beginPath();
          ctx.moveTo(s.gridArea.x, y);
          ctx.lineTo(s.gridArea.x + s.gridArea.w, y);
          ctx.stroke();
        }
      }

      // 4. Highlight active columns by thickening their vertical lines
      if (s.currentMap) {
        ctx.strokeStyle = 'rgba(143, 168, 255, 0.7)';
        for (let c = 0; c < s.cols; c++) {
          if (s.currentMap.nodes[c]?.size > 0 && s.currentMap.active[c]) {
            const x1 = crisp(s.gridArea.x + c * s.cw);
            ctx.beginPath();
            ctx.moveTo(x1, noteGridY);
            ctx.lineTo(x1, s.gridArea.y + s.gridArea.h);
            ctx.stroke();

            const x2 = crisp(s.gridArea.x + (c + 1) * s.cw);
            ctx.beginPath();
            ctx.moveTo(x2, noteGridY);
            ctx.lineTo(x2, s.gridArea.y + s.gridArea.h);
            ctx.stroke();
          }
        }
      }
    });
  }

  function drawGrid() {
    if (typeof window !== 'undefined' && window.__PERF_DG_DISABLE_GRID) {
      s.panel.__dgGridHasPainted = false;
      return;
    }
    if (typeof window !== 'undefined' && window.__DG_LAYER_SIZE_ENFORCE) {
      try { d.__dgEnsureLayerSizes('drawGrid'); } catch {}
    }

    // Bootstrap sizing:
    // In perf runs we still see drawGrid:skip-not-ready with cssW/cssH=0.
    // That means we're drawing before we have any stable layout size.
    // Try once per panel to recover a stable size before taking the "not ready" path.
    if ((s.cssW <= 1 || s.cssH <= 1) && !s.panel.__dgBootstrapSizeTried) {
      s.panel.__dgBootstrapSizeTried = true;
      try {
        // Prefer RO-derived stable size (zoom-safe).
        const stable = (typeof d.__dgGetStableWrapSize === 'function') ? d.__dgGetStableWrapSize() : { w: 0, h: 0 };
        if (stable && stable.w > 1 && stable.h > 1) {
          s.cssW = stable.w;
          s.cssH = stable.h;
        } else {
          // Force one layout pass. This is guarded so it can't hammer every frame.
          try { d.layout(true); } catch {}
          const stable2 = (typeof d.__dgGetStableWrapSize === 'function') ? d.__dgGetStableWrapSize() : { w: 0, h: 0 };
          if (stable2 && stable2.w > 1 && stable2.h > 1) {
            s.cssW = stable2.w;
            s.cssH = stable2.h;
          }
        }
      } catch {}
    }

    if (!d.__dgGridReady()) {
      // Transient layout hiccup protection:
      // If we had a valid grid recently, reuse it for this frame instead of bailing.
      if (s.__dgLastGoodGridArea && s.__dgLastGoodCw > 0 && s.__dgLastGoodCh > 0) {
        s.gridArea = { ...s.__dgLastGoodGridArea };
        s.cw = s.__dgLastGoodCw;
        s.ch = s.__dgLastGoodCh;
        d.dgSizeTrace('drawGrid:use-last-good', {
          cssW: s.cssW,
          cssH: s.cssH,
          gridArea: s.gridArea ? { ...s.gridArea } : null,
          cw: s.cw,
          ch: s.ch,
        });
      } else {
        // If we don't have a last-known-good grid yet (e.g. brand new panel), still try a safe fallback
        // based on CSS size so we avoid repeated "skip-not-ready" churn.
        if (s.cssW >= 2 && s.cssH >= 2) {
          s.gridArea = { x: 0, y: 0, w: s.cssW, h: s.cssH };
          s.cw = s.gridArea.w / s.cols;
          s.ch = (s.gridArea.h - s.topPad) / s.rows;
          d.dgSizeTrace('drawGrid:fallback-not-ready', {
            cssW: s.cssW,
            cssH: s.cssH,
            gridArea: { ...s.gridArea },
            cw: s.cw,
            ch: s.ch,
          });
        } else {
          // De-spam: only log skip-not-ready once per panel instance.
          if (!s.panel.__dgLoggedSkipNotReady) {
            s.panel.__dgLoggedSkipNotReady = true;
            d.dgGridAlphaLog('drawGrid:skip-not-ready', s.gctx, {
              gridArea: s.gridArea ? { ...s.gridArea } : null,
              cw: s.cw,
              ch: s.ch,
              cssW: s.cssW,
              cssH: s.cssH,
            });
            d.dgSizeTrace('drawGrid:skip-not-ready', {
              cssW: s.cssW,
              cssH: s.cssH,
              gridArea: s.gridArea ? { ...s.gridArea } : null,
              cw: s.cw,
              ch: s.ch,
            });
          }
          s.panel.__dgGridHasPainted = false;

          // If we hit this state, we want to promptly recover as soon as RO reports / layout stabilizes,
          // but without hammering resnap every frame.
          if (!s.panel.__dgResnapQueuedNotReady) {
            s.panel.__dgResnapQueuedNotReady = true;
            requestAnimationFrame(() => {
              if (!s.panel.isConnected) return;
              s.panel.__dgResnapQueuedNotReady = false;
              // Force layout here because RO may be pending and we want to rebuild canvases ASAP.
              try { d.resnapAndRedraw(true, { preservePaintIfNoStrokes: true }); } catch {}
            });
          }

          return;
        }
      }
    }
    d.dgGridAlphaLog('drawGrid:begin', s.gctx, {
      cacheKey: __dgGridCache?.key || null,
    });
    d.dgSizeTrace('drawGrid:begin', {
      cssW: s.cssW,
      cssH: s.cssH,
      gridArea: s.gridArea ? { ...s.gridArea } : null,
      cw: s.cw,
      ch: s.ch,
      cacheKey: __dgGridCache?.key || null,
    });
    d.FD.layerTrace('drawGrid:enter', {
      panelId: s.panel?.id || null,
      usingBackBuffers: s.usingBackBuffers,
      gctxRole: s.gctx?.canvas?.getAttribute?.('data-role') || null,
      gctxSize: s.gctx?.canvas ? { w: s.gctx.canvas.width, h: s.gctx.canvas.height } : null,
    });
    let __dgProfileStart = null;
    if (d.DG_PROFILE && typeof performance !== 'undefined' && performance.now) {
      __dgProfileStart = performance.now();
    }
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);

    const surface = s.gctx.canvas;
    const scale = (Number.isFinite(s.paintDpr) && s.paintDpr > 0) ? s.paintDpr : 1;
    const width = s.cssW || (surface?.width ?? 0) / scale;
    const height = s.cssH || (surface?.height ?? 0) / scale;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 1 || height <= 1) {
      s.panel.__dgGridHasPainted = false;
      return;
    }
    if (!s.__dgProbeDidFirstDraw && typeof window !== 'undefined' && window.__DG_PROBE_ON !== false) {
      s.__dgProbeDidFirstDraw = true;
      try { d.__dgProbeDump('first-draw:grid'); } catch {}
    }
    const noteGridY = s.gridArea.y + s.topPad;
    const noteGridH = s.gridArea.h - s.topPad;
    const hasTwoLines = s.strokes.some(st => st.generatorId === 2);

    let __dgHash = 2166136261;
    const __dgHashStep = (h, v) => {
      const n = (Number.isFinite(v) ? v : 0) | 0;
      return ((h ^ n) * 16777619) >>> 0;
    };
    __dgHash = __dgHashStep(__dgHash, s.rows);
    __dgHash = __dgHashStep(__dgHash, s.cols);
    __dgHash = __dgHashStep(__dgHash, Math.round(s.cw * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round(s.ch * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round(s.topPad * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round((s.gridArea?.x || 0) * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round((s.gridArea?.y || 0) * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round((s.gridArea?.w || 0) * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round((s.gridArea?.h || 0) * 1000));
    __dgHash = __dgHashStep(__dgHash, hasTwoLines ? 1 : 0);
    if (s.currentMap) {
      for (let c = 0; c < s.cols; c++) {
        const nodes = s.currentMap.nodes[c];
        const totalNodes = nodes ? nodes.size : 0;
        const disabledNodes = s.currentMap.disabled[c]?.size || 0;
        const active = s.currentMap.active[c] ? 1 : 0;
        __dgHash = __dgHashStep(__dgHash, totalNodes);
        __dgHash = __dgHashStep(__dgHash, disabledNodes);
        __dgHash = __dgHashStep(__dgHash, active);
      }
    }

    const cache = __dgGridCache;
    const surfacePxW = surface?.width ?? s.gctx.canvas?.width ?? 0;
    const surfacePxH = surface?.height ?? s.gctx.canvas?.height ?? 0;
    if (!cache.canvas) cache.canvas = document.createElement('canvas');
    if (cache.canvas.width !== surfacePxW) cache.canvas.width = surfacePxW;
    if (cache.canvas.height !== surfacePxH) cache.canvas.height = surfacePxH;
    if (!cache.ctx) cache.ctx = cache.canvas.getContext('2d');
    const cacheKey = `${__dgHash}|${surfacePxW}x${surfacePxH}`;

    if (cache.key !== cacheKey) {
      d.FD.layerDebugLog('grid-cache-miss', {
        panelId: s.panel?.id || null,
        cacheKey,
        surfacePxW,
        surfacePxH,
        cssW: s.cssW,
        cssH: s.cssH,
        gridArea: s.gridArea ? { ...s.gridArea } : null,
      });
      const __cacheStart = __perfOn ? performance.now() : 0;
      renderGridTo(cache.ctx, width, height, noteGridY, noteGridH, hasTwoLines);
      if (__perfOn && __cacheStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.grid.cache', performance.now() - __cacheStart); } catch {}
      }
      cache.key = cacheKey;
    }

    d.R.resetCtx(s.gctx);
    const __blitStart = __perfOn ? performance.now() : 0;
    const gridAlpha = Number.isFinite(s.gridVisibilityAlpha) ? Math.max(0, Math.min(1, s.gridVisibilityAlpha)) : 1;
    d.R.withDeviceSpace(s.gctx, () => {
      s.gctx.clearRect(0, 0, surfacePxW, surfacePxH);
      if (cache.canvas && gridAlpha > 0.001) {
        s.gctx.save();
        s.gctx.globalAlpha = gridAlpha;
        s.gctx.drawImage(cache.canvas, 0, 0, surfacePxW, surfacePxH);
        s.gctx.restore();
      }
    });
    d.dgGridAlphaLog('drawGrid:blit', s.gctx, {
      cacheKey,
      cacheHit: cache.key === cacheKey,
      gridAlpha,
    });
    if (d.DG_SINGLE_CANVAS && s.gridFrontCtx?.canvas) {
      const frontSurface = s.gridFrontCtx.canvas;
      d.R.withDeviceSpace(s.gridFrontCtx, () => {
        s.gridFrontCtx.clearRect(0, 0, frontSurface.width, frontSurface.height);
      });
    }
    if (__perfOn && __blitStart) {
      try { window.__PerfFrameProf?.mark?.('drawgrid.grid.blit', performance.now() - __blitStart); } catch {}
    }

    if (__dgProfileStart !== null) {
      const dt = performance.now() - __dgProfileStart;
      d.F.dgProfileSample(dt);
    }
    s.panel.__dgGridReadyForNodes = true;
    s.panel.__dgGridHasPainted = true;
    d.__dgMarkSingleCanvasDirty(s.panel);
    d.dgGridAlphaLog('drawGrid:end', s.gctx);
    d.dgSizeTrace('drawGrid:end', {
      cssW: s.cssW,
      cssH: s.cssH,
      gridArea: s.gridArea ? { ...s.gridArea } : null,
      cw: s.cw,
      ch: s.ch,
      cacheKey: cache.key || null,
    });
    d.FD.layerTrace('drawGrid:exit', {
      panelId: s.panel?.id || null,
      usingBackBuffers: s.usingBackBuffers,
      gctxRole: s.gctx?.canvas?.getAttribute?.('data-role') || null,
    });
  }

  function resetGridCache() {
    __dgGridCache.key = '';
    __dgGridPath = null;
    __dgGridPathKey = '';
  }

  return { drawGrid, resetGridCache };
}
