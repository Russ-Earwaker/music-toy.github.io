// src/drawgrid/dg-stroke-render.js
// Stroke path caching + draw routine.

export function createDgStrokeRender({ state, deps } = {}) {
  const s = state;
  const d = deps;

  function getStrokePath(stroke) {
    if (!stroke || !stroke.pts || stroke.pts.length < 2) return null;
    if (typeof Path2D === 'undefined') return null;
    const pts = stroke.pts;
    const last = pts[pts.length - 1];
    const needsRebuild =
      !stroke.__overlayPath ||
      stroke.__overlayPathPts !== pts ||
      stroke.__overlayPathLen !== pts.length ||
      stroke.__overlayPathLastX !== last.x ||
      stroke.__overlayPathLastY !== last.y;
    if (needsRebuild) {
      const path = new Path2D();
      path.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        path.lineTo(pts[i].x, pts[i].y);
      }
      stroke.__overlayPath = path;
      stroke.__overlayPathPts = pts;
      stroke.__overlayPathLen = pts.length;
      stroke.__overlayPathLastX = last.x;
      stroke.__overlayPathLastY = last.y;
    }
    return stroke.__overlayPath;
  }

  // A helper to draw a complete stroke from a point array.
  // This is used to create a clean image for snapping.
  function drawFullStroke(ctx, stroke, opts = {}) {
    if (!stroke || !stroke.pts || stroke.pts.length < 1) return;
    if (s.DG_SINGLE_CANVAS && s.usingBackBuffers && ctx?.canvas?.getAttribute?.('data-role') === 'drawgrid-paint' && s.backCtx && ctx !== s.backCtx) {
      ctx = s.backCtx;
    }
    try {
      if (typeof window !== 'undefined' && window.__DG_RANDOM_TRACE_VERBOSE && stroke?.generatorId != null) {
        const isOverlay = (ctx === s.fctx) || !!ctx.__dgIsOverlay;
        const flag = isOverlay ? '__dgRandomOverlayLogged' : '__dgRandomPaintLogged';
        if (!stroke[flag]) {
          stroke[flag] = true;
          const canvas = ctx?.canvas || null;
          const dpr = d.__dgGetCanvasDprFromCss(canvas, s.cssW, s.paintDpr);
          const payload = {
            panelId: s.panel?.id || null,
            layer: isOverlay ? 'overlay' : 'paint',
            generatorId: stroke.generatorId,
            cssW: s.cssW,
            cssH: s.cssH,
            paintDpr: s.paintDpr,
            dpr,
            canvasRole: canvas?.getAttribute?.('data-role') || null,
            canvasSize: canvas ? { w: canvas.width, h: canvas.height, cssW: canvas.style?.width || null, cssH: canvas.style?.height || null } : null,
            logicalActive: !!ctx.__dgLogicalSpaceActive,
            transform: (() => {
              try {
                const t = (typeof ctx.getTransform === 'function') ? ctx.getTransform() : null;
                return t ? { a: t.a, d: t.d, e: t.e, f: t.f } : null;
              } catch {
                return null;
              }
            })(),
          };
          console.log('[DG][random][stroke]', JSON.stringify(payload));
        }
      }
    } catch {}
    const color = stroke.color || s.STROKE_COLORS[0];
    const skipReset = !!opts.skipReset;
    const skipTransform = !!opts.skipTransform;

    const drawCore = () => {
      ctx.save();
      const isOverlay = (ctx === s.fctx) || !!ctx.__dgIsOverlay;
      const wantsSpecial = !!stroke.isSpecial;
      const visualOnly = d.isVisualOnlyStroke(stroke);
      const alpha = d.getPathAlpha({
        isOverlay,
        wantsSpecial,
        isVisualOnly: visualOnly,
        generatorId: stroke.generatorId ?? null,
      });

      d.emitDG('path-alpha', {
        layer: (ctx === s.fctx) ? 'overlay' : 'paint',
        wantsSpecial: !!stroke.isSpecial,
        visualOnly,
        alpha,
        overlayColorize: !!stroke.overlayColorize,
        hasGeneratorId: !!stroke.generatorId,
        pts: stroke.pts?.length || 0
      });

      if (s.DG_ALPHA_DEBUG) {
        const now = performance?.now?.() ?? Date.now();
        if (now - s.dgAlphaState.pathLastTs > s.DG_ALPHA_SPAM_MS) {
          s.dgAlphaState.pathLastTs = now;
          console.debug('[DG][alpha:path]', {
            isOverlay,
            wantsSpecial,
            VISUAL_ONLY_ALPHA: s.VISUAL_ONLY_ALPHA,
          });
        }
      }

      ctx.globalAlpha = alpha;

      const useMultiColour = wantsSpecial && isOverlay;

      if (!useMultiColour) {
        if (isOverlay) {
          ctx.strokeStyle = stroke.overlayColor || '#ffffff';
          ctx.fillStyle = ctx.strokeStyle;
        } else {
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
        }
      }

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      ctx.beginPath();
      if (stroke.pts.length === 1) {
        const lineWidth = d.R.getLineWidth();
        const p = stroke.pts[0];
        if (useMultiColour) {
          const r = lineWidth / 2;
          const t = (performance.now ? performance.now() : Date.now());
          const gid = stroke.generatorId ?? 1;
          const hue = gid === 1
            ? (200 + 20 * Math.sin((t / 1600) * Math.PI * 2))
            : (20 + 20 * Math.sin((t / 1800) * Math.PI * 2));
          const hueKey = Math.round(hue * 0.5) * 2;
          const gradKey = `${hueKey}|${p.x.toFixed(1)}|${p.y.toFixed(1)}|${r.toFixed(2)}`;
          let grad = stroke.__overlayRadialGrad;
          if (!grad || stroke.__overlayRadialGradKey !== gradKey) {
            grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            if (gid === 1) {
              grad.addColorStop(0, `hsl(${hueKey}, 100%, 75%)`);
              grad.addColorStop(0.7, `hsl(${(hueKey + 60) % 360}, 100%, 68%)`);
              grad.addColorStop(1, `hsla(${(hueKey + 120) % 360}, 100%, 60%, 0.35)`);
            } else {
              grad.addColorStop(0, `hsl(${hueKey}, 100%, 70%)`);
              grad.addColorStop(0.7, `hsl(${(hueKey - 25 + 360) % 360}, 100%, 65%)`);
              grad.addColorStop(1, `hsla(${(hueKey - 45 + 360) % 360}, 100%, 55%, 0.35)`);
            }
            stroke.__overlayRadialGrad = grad;
            stroke.__overlayRadialGradKey = gradKey;
          }
          ctx.fillStyle = grad;
        }
        ctx.arc(p.x, p.y, lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const lw = d.R.getLineWidth() + (isOverlay ? 1.25 : 0);
        ctx.lineWidth = lw;
        if (useMultiColour) {
          const p1 = stroke.pts[0];
          const pLast = stroke.pts[stroke.pts.length - 1];
          const t = (performance.now ? performance.now() : Date.now());
          const gid = stroke.generatorId ?? 1;
          const hue = gid === 1
            ? (200 + 20 * Math.sin((t / 1600) * Math.PI * 2))
            : (20 + 20 * Math.sin((t / 1800) * Math.PI * 2));
          const hueKey = Math.round(hue * 0.5) * 2;
          const gradKey = `${hueKey}|${p1.x.toFixed(1)}|${p1.y.toFixed(1)}|${pLast.x.toFixed(1)}|${pLast.y.toFixed(1)}`;
          let grad = stroke.__overlayLinearGrad;
          if (!grad || stroke.__overlayLinearGradKey !== gradKey) {
            grad = ctx.createLinearGradient(p1.x, p1.y, pLast.x, pLast.y);
            if (gid === 1) {
              grad.addColorStop(0, `hsl(${hueKey}, 100%, 70%)`);
              grad.addColorStop(0.5, `hsl(${(hueKey + 45) % 360}, 100%, 70%)`);
              grad.addColorStop(1, `hsl(${(hueKey + 90) % 360}, 100%, 68%)`);
            } else {
              grad.addColorStop(0, `hsl(${hueKey}, 100%, 68%)`);
              grad.addColorStop(0.5, `hsl(${(hueKey - 25 + 360) % 360}, 100%, 66%)`);
              grad.addColorStop(1, `hsl(${(hueKey - 50 + 360) % 360}, 100%, 64%)`);
            }
            stroke.__overlayLinearGrad = grad;
            stroke.__overlayLinearGradKey = gradKey;
          }
          ctx.strokeStyle = grad;
        }

        const path = getStrokePath(stroke);
        if (path) {
          ctx.stroke(path);
        } else {
          ctx.moveTo(stroke.pts[0].x, stroke.pts[0].y);
          for (let i = 1; i < stroke.pts.length; i++) {
            ctx.lineTo(stroke.pts[i].x, stroke.pts[i].y);
          }
          ctx.stroke();
        }
      }

      ctx.restore();
    };

    const wasOverlay = (ctx === s.fctx) || !!ctx.__dgIsOverlay;
    if (!skipReset) d.R.resetCtx(ctx);
    if (skipTransform) {
      drawCore();
    } else {
      // IMPORTANT:
      // Many call paths are already wrapped in logical-space (e.g. nodes/overlays).
      // Using R.withLogicalSpace here can double-apply the DPR scale when paintDpr < 1
      // (common after zoom-out), causing nodes/connectors/text to shrink or grow incorrectly.
      // __dgWithLogicalSpace has a nesting guard (ctx.__dgLogicalSpaceActive) and uses the
      // canvas's actual backing-store DPR (canvas.width / CSS width) to stay in sync.
      d.__dgWithLogicalSpace(ctx, drawCore);
    }
    if (!wasOverlay) d.markPaintDirty();
  }

  return { getStrokePath, drawFullStroke };
}
