// src/baseMusicToy/resizeCanvasForDpr.js
// Shared "truth-point" for canvas sizing:
// - CSS size (authoritative) via syncCanvasCssSize
// - Backing-store size via applyCanvasBackingSize
// - Optional DPR override + optional hard clamp (maxDprMul)
//
// Philosophy:
// - Keep layout reads out of here. Callers pass cssW/cssH.
// - This helper is intentionally generic and reusable across toys.

import { syncCanvasCssSize } from './canvasCss.js';
import { applyCanvasBackingSize } from './canvasBackingStore.js';
import { getDeviceDpr, computeEffectiveDpr } from './effectiveDpr.js';

export function resizeCanvasForDpr(canvas, ctx, cssW, cssH, opts = {}) {
  if (!canvas) return { resized: false, width: 0, height: 0, dpr: 1, deviceDpr: 1 };

  const deviceDpr = getDeviceDpr();
  const w = Math.max(1, (cssW | 0));
  const h = Math.max(1, (cssH | 0));

  const cachePrefix = opts.cachePrefix || '__bm';
  const alsoCachePrefixes = Array.isArray(opts.alsoCachePrefixes) ? opts.alsoCachePrefixes : null;

  // Keep CSS size authoritative + cached (no layout reads here).
  syncCanvasCssSize(canvas, w, h, { cachePrefix });

  // Compute final DPR (optional override + optional clamp).
  const rawDpr = (opts && Number.isFinite(opts.rawDpr) && opts.rawDpr > 0) ? opts.rawDpr : deviceDpr;
  const maxDprMul = (opts && Number.isFinite(opts.maxDprMul) && opts.maxDprMul > 0) ? opts.maxDprMul : null;
  const ed = computeEffectiveDpr({ deviceDpr, rawDpr, maxDprMul });
  const dpr = (Number.isFinite(ed?.effectiveDpr) && ed.effectiveDpr > 0) ? ed.effectiveDpr : rawDpr;

  const needW = Math.floor(w * dpr);
  const needH = Math.floor(h * dpr);

  const beforeW = canvas.width | 0;
  const beforeH = canvas.height | 0;

  applyCanvasBackingSize(canvas, needW, needH, dpr, { cachePrefix, alsoCachePrefixes });

  const afterW = canvas.width | 0;
  const afterH = canvas.height | 0;
  const resized = (beforeW !== afterW) || (beforeH !== afterH);

  // Resizing resets transforms; callers typically want identity after resize.
  if (resized && ctx && ctx.setTransform) {
    try { ctx.setTransform(1, 0, 0, 1, 0, 0); } catch {}
  }

  return { resized, width: afterW, height: afterH, dpr, deviceDpr };
}

