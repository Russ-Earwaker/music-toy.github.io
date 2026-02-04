// src/drawgrid/dg-composite.js
// Single-canvas compositing for DrawGrid.

export function createDgComposite({ state, deps } = {}) {
  const s = state || {};
  const d = deps || {};

  function __dgSampleAlphaLocal(ctx, xCss, yCss) {
    if (!ctx || !ctx.canvas) return null;
    const scale = (Number.isFinite(s.paintDpr) && s.paintDpr > 0) ? s.paintDpr : 1;
    const px = Math.max(0, Math.min(ctx.canvas.width - 1, Math.round(xCss * scale)));
    const py = Math.max(0, Math.min(ctx.canvas.height - 1, Math.round(yCss * scale)));
    try {
      const data = ctx.getImageData(px, py, 1, 1).data;
      return { r: data[0], g: data[1], b: data[2], a: data[3], px, py };
    } catch {
      return { error: true, px, py };
    }
  }

  const __dgSampleAlpha = d.__dgSampleAlpha || __dgSampleAlphaLocal;

  function __dgSampleCanvasStyles(canvas) {
    if (!canvas) return null;
    try {
      const cs = getComputedStyle(canvas);
      return {
        display: cs?.display || null,
        visibility: cs?.visibility || null,
        opacity: cs?.opacity || null,
        transform: cs?.transform || null,
      };
    } catch {
      return null;
    }
  }

  function compositeSingleCanvas() {
    if (!s.DG_SINGLE_CANVAS || !s.frontCtx) return;
    if (!d.__dgGridReady()) return;
    const surface = s.frontCtx.canvas;
    if (!surface || !surface.width || !surface.height) return;
    const sampleX = s.gridArea ? (s.gridArea.x + 2) : null;
    const sampleY = s.gridArea ? (s.gridArea.y + s.topPad + 2) : null;
    // Guard: if the front backing store was resized to the scaled DOM rect,
    // fix sizes before compositing to avoid "scaled up" strokes.
    try {
      const expW = (s.__dgLastResizeTargetW || (s.cssW ? Math.max(1, Math.round(s.cssW * s.paintDpr)) : 0));
      const expH = (s.__dgLastResizeTargetH || (s.cssH ? Math.max(1, Math.round(s.cssH * s.paintDpr)) : 0));
      if (expW && expH) {
        const rect = d.getRect(surface);
        const rectW = Math.max(1, Math.round(rect?.width || 0));
        const rectH = Math.max(1, Math.round(rect?.height || 0));
        const looksLikeScaledRect =
          (surface.width === rectW && surface.height === rectH && (rectW !== expW || rectH !== expH));
        const wrongBackingStore = (surface.width !== expW || surface.height !== expH);
        if (wrongBackingStore && looksLikeScaledRect) {
          d.dgSizeTrace('composite:front-guard', {
            cssW: s.cssW,
            cssH: s.cssH,
            paintDpr: s.paintDpr,
            expW,
            expH,
            rectW,
            rectH,
            frontW: surface.width,
            frontH: surface.height,
          });
          d.resizeSurfacesFor(s.cssW, s.cssH, s.paintDpr, 'front-size-guard');
          d.markStaticDirty('front-size-guard');
          s.__dgForceFullDrawNext = true;
          return;
        }
      }
    } catch {}
    if (!s.panel.__dgSingleCompositeDirty && !s.panel.__dgCompositeBaseDirty && !s.panel.__dgCompositeOverlayDirty) {
      return;
    }

    // Perf: when overlays are separate DOM canvases (DG_SINGLE_CANVAS_OVERLAYS),
    // we should NOT re-composite the base just because an overlay got marked dirty.
    // In that mode, only base-ish dirtiness should trigger an expensive composite pass.
    // (Overlay canvases will render independently on top.)
    if (s.DG_SINGLE_CANVAS_OVERLAYS) {
      const needBaseComposite = !!s.panel.__dgSingleCompositeDirty || !!s.panel.__dgCompositeBaseDirty;
      if (!needBaseComposite) {
        s.panel.__dgCompositeOverlayDirty = false;
        return;
      }
    }

    d.FD.layerEvent('composite:begin', {
      panelId: s.panel?.id || null,
      panelRef: s.panel,
      singleCanvas: !!s.DG_SINGLE_CANVAS,
      overlays: !!s.DG_SINGLE_CANVAS_OVERLAYS,
      baseDirty: !!s.panel.__dgCompositeBaseDirty,
      overlayDirty: !!s.panel.__dgCompositeOverlayDirty,
      singleDirty: !!s.panel.__dgSingleCompositeDirty,
    });
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
    d.dgGridAlphaLog('composite:begin', s.frontCtx);
    d.FD.layerTrace('composite:enter', {
      panelId: s.panel?.id || null,
      usingBackBuffers: s.usingBackBuffers,
      frontRole: s.frontCtx?.canvas?.getAttribute?.('data-role') || null,
      frontSize: s.frontCtx?.canvas ? { w: s.frontCtx.canvas.width, h: s.frontCtx.canvas.height } : null,
    });
    if (!s.panel.__dgGridHasPainted) {
      try { d.drawGrid(); } catch {}
    }
    if (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE && s.gridBackCtx && s.gridArea) {
      const doSample =
        !!(typeof window !== 'undefined' && (window.__DG_REFRESH_SIZE_TRACE_SAMPLE || window.__DG_RESIZE_TRACE_SAMPLE));
      const sample = (doSample && sampleX !== null && sampleY !== null)
        ? __dgSampleAlpha(s.gridBackCtx, sampleX, sampleY)
        : null;
      d.dgSizeTrace('gridBack-sample', {
        cssW: s.cssW,
        cssH: s.cssH,
        gridHasPainted: !!s.panel.__dgGridHasPainted,
        baseDirty: !!s.panel.__dgCompositeBaseDirty,
        sample,
        sampleX,
        sampleY,
        gridArea: s.gridArea ? { ...s.gridArea } : null,
      });
    }
    d.dgSizeTraceCanvas('before-composite');
    const width = surface.width;
    const height = surface.height;

    // Perf: many "overlay-like" surfaces are visually confined to the grid area.
    // When possible, clip blits to the grid rect (device px) to reduce raster work.
    const __compDpr = (Number.isFinite(s.paintDpr) && s.paintDpr > 0) ? s.paintDpr : 1;
    const __gridBoundsPx = (s.gridArea && s.gridArea.w > 0 && s.gridArea.h > 0)
      ? (() => {
          // NOTE: gridArea.y is typically relative to the grid region; include topPad.
          const gx = s.gridArea.x || 0;
          const gy = (s.gridArea.y || 0) + (s.topPad || 0);
          const x = Math.max(0, Math.min(width, Math.round(gx * __compDpr)));
          const y = Math.max(0, Math.min(height, Math.round(gy * __compDpr)));
          const w = Math.max(0, Math.min(width - x, Math.round(s.gridArea.w * __compDpr)));
          const h = Math.max(0, Math.min(height - y, Math.round(s.gridArea.h * __compDpr)));
          return (w > 0 && h > 0) ? { x, y, w, h } : null;
        })()
      : null;

    function __dgBlitTo(ctx, srcCanvas) {
      if (!ctx || !srcCanvas || !srcCanvas.width || !srcCanvas.height) return;
      const b = __gridBoundsPx;
      // Fast path: same backing store size -> direct clipped blit.
      if (b && srcCanvas.width === width && srcCanvas.height === height) {
        ctx.drawImage(srcCanvas, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);
        return;
      }
      // Fallback: scale full canvas (previous behavior).
      ctx.drawImage(
        srcCanvas,
        0, 0, srcCanvas.width, srcCanvas.height,
        0, 0, width, height
      );
    }
    const baseCanvas = s.panel.__dgCompositeBaseCanvas;
    let compositeBaseCanvas = baseCanvas;
    if (!compositeBaseCanvas) {
      compositeBaseCanvas = document.createElement('canvas');
      s.panel.__dgCompositeBaseCanvas = compositeBaseCanvas;
      s.panel.__dgCompositeBaseDirty = true;
    }
    if (compositeBaseCanvas.width !== width || compositeBaseCanvas.height !== height) {
      compositeBaseCanvas.width = width;
      compositeBaseCanvas.height = height;
      s.panel.__dgCompositeBaseDirty = true;
    }
    let compositeBaseCtx = s.panel.__dgCompositeBaseCtx;
    if (!compositeBaseCtx) {
      compositeBaseCtx = compositeBaseCanvas.getContext('2d');
      s.panel.__dgCompositeBaseCtx = compositeBaseCtx;
      s.panel.__dgCompositeBaseDirty = true;
    }

    if (s.panel.__dgCompositeBaseDirty && compositeBaseCtx) {
      const __baseStart = __perfOn ? performance.now() : 0;
      const baseCtx = compositeBaseCtx;
      d.R.withDeviceSpace(baseCtx, () => {
        // Use 'copy' to overwrite the backing store without a separate clearRect.
        baseCtx.globalAlpha = 1;
        baseCtx.globalCompositeOperation = 'copy';
        if (s.gridBackCanvas && s.gridBackCanvas.width && s.gridBackCanvas.height) {
          baseCtx.drawImage(
            s.gridBackCanvas,
            0, 0, s.gridBackCanvas.width, s.gridBackCanvas.height,
            0, 0, width, height
          );
        } else {
          baseCtx.clearRect(0, 0, width, height);
        }
        baseCtx.globalCompositeOperation = 'source-over';
        if (s.backCanvas && s.backCanvas.width && s.backCanvas.height) {
          baseCtx.drawImage(
            s.backCanvas,
            0, 0, s.backCanvas.width, s.backCanvas.height,
            0, 0, width, height
          );
        }
      });
      s.panel.__dgCompositeBaseDirty = false;
      if (__perfOn && __baseStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.composite.base', performance.now() - __baseStart); } catch {}
      }
      d.dgSizeTrace('composite:base-rebuild', {
        cssW: s.cssW,
        cssH: s.cssH,
        paintDpr: s.paintDpr,
        surfaceW: width,
        surfaceH: height,
        gridArea: s.gridArea ? { ...s.gridArea } : null,
      });
    }

    const __finalStart = __perfOn ? performance.now() : 0;
    d.R.withDeviceSpace(s.frontCtx, () => {
      if (compositeBaseCanvas && compositeBaseCanvas.width && compositeBaseCanvas.height) {
        // Use 'copy' to overwrite the destination in a single draw (no separate clearRect).
        s.frontCtx.globalAlpha = 1;
        s.frontCtx.globalCompositeOperation = 'copy';
        const __baseBlitStart = __perfOn ? performance.now() : 0;
        s.frontCtx.drawImage(
          compositeBaseCanvas,
          0, 0, compositeBaseCanvas.width, compositeBaseCanvas.height,
          0, 0, width, height
        );
        if (__perfOn && __baseBlitStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.composite.base.blit', performance.now() - __baseBlitStart); } catch {}
        }
        s.frontCtx.globalCompositeOperation = 'source-over';
      } else {
        s.frontCtx.globalAlpha = 1;
        s.frontCtx.globalCompositeOperation = 'source-over';
        s.frontCtx.clearRect(0, 0, width, height);
      }
      const __doSample =
        (typeof window !== 'undefined') &&
        !!window.__DG_REFRESH_SIZE_TRACE &&
        window.__DG_REFRESH_SIZE_TRACE_SAMPLE === true &&
        sampleX !== null && sampleY !== null;
      if (__doSample) {
        const frontSample = __dgSampleAlpha(s.frontCtx, sampleX, sampleY);
        d.dgSizeTrace('front-sample', {
          cssW: s.cssW,
          cssH: s.cssH,
          gridHasPainted: !!s.panel.__dgGridHasPainted,
          baseDirty: !!s.panel.__dgCompositeBaseDirty,
          sample: frontSample,
          sampleX,
          sampleY,
          frontStyle: __dgSampleCanvasStyles(surface),
        });
      }
      const flashSource = d.getActiveFlashCanvas();
      if (!s.DG_SINGLE_CANVAS_OVERLAYS && !s.panel.__dgFlashLayerEmpty && flashSource && flashSource.width && flashSource.height) {
        const __flashStart = __perfOn ? performance.now() : 0;
        const scale = (Number.isFinite(s.paintDpr) && s.paintDpr > 0) ? s.paintDpr : 1;
        const allowFullFlash = !!s.panel.__dgFlashOverlayOutOfGrid;
        const bounds = (allowFullFlash || !(s.gridArea && s.gridArea.w > 0 && s.gridArea.h > 0))
          ? {
              x: 0,
              y: 0,
              w: Math.round(width),
              h: Math.round(height),
            }
          : {
              x: Math.round(s.gridArea.x * scale),
              y: Math.round(s.gridArea.y * scale),
              w: Math.round(s.gridArea.w * scale),
              h: Math.round(s.gridArea.h * scale),
            };
        let sx = 0;
        let sy = 0;
        let sw = flashSource.width;
        let sh = flashSource.height;
        if (bounds) {
          const maxX = flashSource.width;
          const maxY = flashSource.height;
          const bx = Math.max(0, Math.min(bounds.x, maxX));
          const by = Math.max(0, Math.min(bounds.y, maxY));
          const bw = Math.max(0, Math.min(bounds.w, maxX - bx));
          const bh = Math.max(0, Math.min(bounds.h, maxY - by));
          if (bw > 0 && bh > 0) {
            sx = bx;
            sy = by;
            sw = bw;
            sh = bh;
          }
        }
        s.frontCtx.drawImage(flashSource, sx, sy, sw, sh, sx, sy, sw, sh);
        if (__perfOn && __flashStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.composite.flash', performance.now() - __flashStart); } catch {}
        }
      }
      if (!s.DG_SINGLE_CANVAS_OVERLAYS) {
        // Compose overlays into a single overlay canvas, then blit once to the main surface.
        // This tends to reduce raster/compositor pressure vs multiple drawImage calls to the
        // full composite surface (especially at high DPR).

        // Perf: most overlay-like surfaces are visually confined to the grid area.
        // When possible, build the overlay canvas only for the grid bounds (device px),
        // and then blit it back into place. This reduces the pixel work involved in:
        //   - clearing the overlay
        //   - blitting multiple overlay sources into the overlay
        //   - blitting the overlay back to the main surface
        const __ovBounds = __gridBoundsPx;
        const __ovBoundsKey = __ovBounds ? `${__ovBounds.x},${__ovBounds.y},${__ovBounds.w},${__ovBounds.h}` : 'full';
        if (s.panel.__dgCompositeOverlayBoundsKey !== __ovBoundsKey) {
          s.panel.__dgCompositeOverlayBoundsKey = __ovBoundsKey;
          s.panel.__dgCompositeOverlayDirty = true;
        }
        const __ovW = (__ovBounds && __ovBounds.w > 0) ? __ovBounds.w : width;
        const __ovH = (__ovBounds && __ovBounds.h > 0) ? __ovBounds.h : height;
        let overlayCanvas = s.panel.__dgCompositeOverlayCanvas;
        if (!overlayCanvas) {
          overlayCanvas = document.createElement('canvas');
          s.panel.__dgCompositeOverlayCanvas = overlayCanvas;
          s.panel.__dgCompositeOverlayDirty = true;
        }
        if (overlayCanvas.width !== __ovW || overlayCanvas.height !== __ovH) {
          overlayCanvas.width = __ovW;
          overlayCanvas.height = __ovH;
          s.panel.__dgCompositeOverlayDirty = true;
        }
        let overlayCtx = s.panel.__dgCompositeOverlayCtx;
        if (!overlayCtx) {
          overlayCtx = overlayCanvas.getContext('2d');
          s.panel.__dgCompositeOverlayCtx = overlayCtx;
          s.panel.__dgCompositeOverlayDirty = true;
        }

        if (s.panel.__dgCompositeOverlayDirty && overlayCtx) {
          const __ovBuildStart = __perfOn ? performance.now() : 0;
          d.R.withDeviceSpace(overlayCtx, () => {
            // Clear to transparent without a separate clearRect.
            overlayCtx.globalAlpha = 1;
            overlayCtx.globalCompositeOperation = 'copy';
            overlayCtx.fillStyle = 'rgba(0,0,0,0)';
            overlayCtx.fillRect(0, 0, __ovW, __ovH);
            overlayCtx.globalCompositeOperation = 'source-over';

            function __dgBlitOverlaySource(srcCanvas) {
              if (!srcCanvas || !srcCanvas.width || !srcCanvas.height) return;
              if (__ovBounds) {
                // Copy only the grid bounds into the overlay canvas.
                overlayCtx.drawImage(
                  srcCanvas,
                  __ovBounds.x, __ovBounds.y, __ovBounds.w, __ovBounds.h,
                  0, 0, __ovW, __ovH
                );
              } else {
                __dgBlitTo(overlayCtx, srcCanvas);
              }
            }

            // Nodes (back then front if distinct)
            const nodesFrontCanvas = s.nodesFrontCtx?.canvas;
            const nodeSources = [];
            if (s.nodesBackCanvas && s.nodesBackCanvas.width && s.nodesBackCanvas.height) nodeSources.push(s.nodesBackCanvas);
            if (
              nodesFrontCanvas &&
              nodesFrontCanvas !== s.nodesBackCanvas &&
              nodesFrontCanvas.width &&
              nodesFrontCanvas.height
            ) nodeSources.push(nodesFrontCanvas);

            for (const nodeCanvas of nodeSources) {
              const __nodesStart = __perfOn ? performance.now() : 0;
              __dgBlitOverlaySource(nodeCanvas);
              if (__perfOn && __nodesStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.composite.nodes', performance.now() - __nodesStart); } catch {}
              }
            }

            const ghostSource = d.getActiveGhostCanvas();
            if (!s.panel.__dgGhostLayerEmpty && ghostSource && ghostSource.width && ghostSource.height) {
              const __ghostStart = __perfOn ? performance.now() : 0;
              __dgBlitOverlaySource(ghostSource);
              if (__perfOn && __ghostStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.composite.ghost', performance.now() - __ghostStart); } catch {}
              }
            }

            const tutorialSource = d.getActiveTutorialCanvas();
            if (!s.panel.__dgTutorialLayerEmpty && tutorialSource && tutorialSource.width && tutorialSource.height) {
              const __tutorialStart = __perfOn ? performance.now() : 0;
              __dgBlitOverlaySource(tutorialSource);
              if (__perfOn && __tutorialStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.composite.tutorial', performance.now() - __tutorialStart); } catch {}
              }
            }

            if (!s.panel.__dgPlayheadLayerEmpty && s.playheadCanvas && s.playheadCanvas.width && s.playheadCanvas.height) {
              const __playheadStart = __perfOn ? performance.now() : 0;
              __dgBlitOverlaySource(s.playheadCanvas);
              if (__perfOn && __playheadStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.composite.playhead', performance.now() - __playheadStart); } catch {}
              }
            }
          });
          s.panel.__dgCompositeOverlayDirty = false;
          if (__perfOn && __ovBuildStart) {
            try { window.__PerfFrameProf?.mark?.('drawgrid.composite.overlayBuild', performance.now() - __ovBuildStart); } catch {}
          }
        }

        // Finally, blit the composed overlay to the main surface (clipped if possible).
        if (overlayCanvas && overlayCanvas.width && overlayCanvas.height) {
          const __ovBlitStart = __perfOn ? performance.now() : 0;
          if (__ovBounds) {
            s.frontCtx.drawImage(
              overlayCanvas,
              0, 0, __ovW, __ovH,
              __ovBounds.x, __ovBounds.y, __ovBounds.w, __ovBounds.h
            );
          } else {
            __dgBlitTo(s.frontCtx, overlayCanvas);
          }
          if (__perfOn && __ovBlitStart) {
            try { window.__PerfFrameProf?.mark?.('drawgrid.composite.overlayBlit', performance.now() - __ovBlitStart); } catch {}
          }
        }
      }
    });
    if (__perfOn && __finalStart) {
      try { window.__PerfFrameProf?.mark?.('drawgrid.composite.final', performance.now() - __finalStart); } catch {}
    }
    try { s.panel.__dgLastCompositeTs = (performance?.now ? performance.now() : Date.now()); } catch {}
    d.dgGridAlphaLog('composite:end', s.frontCtx);
    d.FD.layerTrace('composite:exit', {
      panelId: s.panel?.id || null,
      usingBackBuffers: s.usingBackBuffers,
    });
  }

  return {
    compositeSingleCanvas,
  };
}
