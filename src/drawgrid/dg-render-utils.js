// src/drawgrid/dg-render-utils.js
import { DG_GHOST_DEBUG, DG_CLEAR_DEBUG, dbgCounters } from './dg-debug.js';

export function createDgRenderUtils(getState) {
  function withIdentity(ctx, fn) {
    if (!ctx || typeof fn !== 'function') return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    try {
      fn();
    } finally {
      ctx.restore();
    }
  }

  function getCanvasDpr(ctx) {
    if (!ctx) return 1;
    const S = getState();
    const fallback = (Number.isFinite(S.paintDpr) && S.paintDpr > 0) ? S.paintDpr : 1;
    const canvas = ctx.canvas;
    if (!canvas) return fallback;
    let cssW = (Number.isFinite(S.cssW) && S.cssW > 0) ? S.cssW : 0;
    if (!cssW && Number.isFinite(canvas.__tsmCssW)) cssW = canvas.__tsmCssW;
    if (!cssW && Number.isFinite(canvas.__dgCssW)) cssW = canvas.__dgCssW;
    if (!cssW && canvas.style?.width) {
      const sw = parseFloat(canvas.style.width) || 0;
      if (sw > 0) cssW = sw;
    }
    if (!cssW) cssW = canvas.clientWidth || 0;
    if (cssW > 0 && canvas.width > 0) return canvas.width / cssW;
    return fallback;
  }

  // Draw in logical (CSS) space; use for stroke/path operations.
  function withLogicalSpace(ctx, fn) {
    if (!ctx || typeof fn !== 'function') return;
    if (ctx.__dgLogicalSpaceActive) return fn();
    const scale = getCanvasDpr(ctx);
    try { ctx.__dgLogicalSpaceActive = true; } catch {}
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    try {
      fn();
    } finally {
      ctx.restore();
      try { ctx.__dgLogicalSpaceActive = false; } catch {}
    }
  }

  // Draw in raw device pixels without additional scaling; ideal for blits / drawImage.
  function withDeviceSpace(ctx, fn) {
    if (!ctx || typeof fn !== 'function') return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    try {
      fn();
    } finally {
      ctx.restore();
    }
  }

  function resetCtx(ctx) {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
  }

  function clearCanvas(ctx) {
    if (!ctx || !ctx.canvas) return;
    const S = getState();
    // Do not clear the paint layer during a live stroke
    const role = ctx.canvas?.getAttribute?.('data-role');
    const isPaintSurface = role === 'drawgrid-paint' || role === 'drawgrid-paint-back';
    const __dgSingleCanvasOn =
      (typeof S.DG_SINGLE_CANVAS !== 'undefined' && S.DG_SINGLE_CANVAS) ||
      (typeof window !== 'undefined' && window.__DG_SINGLE_CANVAS);
    if (__dgSingleCanvasOn && role === 'drawgrid-paint' && S.backCtx && ctx !== S.backCtx) {
      clearCanvas(S.backCtx);
      return;
    }
    if (typeof window !== 'undefined' && window.DG_DRAW_DEBUG && S.__dgDrawingActive && isPaintSurface) {
      console.debug('[DG][CLEAR/SKIP] attempted to clear paint during drag.');
      return;
    }
    const surface = ctx.canvas;
    const scale = (Number.isFinite(S.paintDpr) && S.paintDpr > 0) ? S.paintDpr : 1;
    const width = S.cssW || (surface?.width ?? 0) / scale;
    const height = S.cssH || (surface?.height ?? 0) / scale;
    resetCtx(ctx);
    withLogicalSpace(ctx, () => ctx.clearRect(0, 0, width, height));
    if (isPaintSurface) {
      S.__dgMarkSingleCanvasDirty(ctx?.canvas?.__dgPanel);
    }
    dbgCounters.paintClears++;
    if (DG_CLEAR_DEBUG) {
      let stack = '';
      try { stack = (new Error('clear')).stack?.split('\n').slice(1, 6).join('\n'); } catch {}
      console.debug('[DG][CLEAR]', {
        target: surface.getAttribute?.('data-role') || 'paint?',
        clears: dbgCounters.paintClears,
        usingBackBuffers: S.usingBackBuffers,
      }, stack);
    }
  }

  function getLineWidth() {
    const S = getState();
    // Camera-like behaviour: line thickness is in toy space, not scaled by zoom
    const cellW = S.cw || 24;
    const cellH = S.ch || 24;
    const cell = Math.max(4, Math.min(cellW, cellH));

    // Tune these numbers if it looks too thick/thin
    // (doubled from 0.4 → 0.8 to make strokes ~2x thicker)
    const base = cell * 0.8;
    const clamped = Math.max(2, Math.min(base, 60));
    return clamped;
  }

  function getOverlayClearPad() {
    try {
      const lw = (typeof getLineWidth === 'function') ? getLineWidth() : 0;
      const safe = Number.isFinite(lw) ? lw : 0;
      return Math.min(24, Math.max(4, safe * 0.6));
    } catch {}
    return 6;
  }

  function getOverlayClearRect({ canvas, pad = 0, allowFull = false, gridArea: gridAreaOverride } = {}) {
    const S = getState();
    const scale = (Number.isFinite(S.paintDpr) && S.paintDpr > 0) ? S.paintDpr : 1;
    const maxW = S.cssW || ((canvas?.width || 0) / scale);
    const maxH = S.cssH || ((canvas?.height || 0) / scale);
    const grid = gridAreaOverride;
    const hasGrid = !!(grid && grid.w > 0 && grid.h > 0);
    if (allowFull || !hasGrid || !maxW || !maxH) {
      return { x: 0, y: 0, w: maxW, h: maxH };
    }
    const x = Math.max(0, grid.x - pad);
    const y = Math.max(0, grid.y - pad);
    let w = grid.w + pad * 2;
    let h = grid.h + pad * 2;
    if (Number.isFinite(maxW) && maxW > 0 && (x + w) > maxW) w = Math.max(0, maxW - x);
    if (Number.isFinite(maxH) && maxH > 0 && (y + h) > maxH) h = Math.max(0, maxH - y);
    return { x, y, w, h };
  }

  function withOverlayClip(ctx, gridArea, allowFull, fn) {
    if (!ctx || typeof fn !== 'function') return;
    const hasGrid = !!(gridArea && gridArea.w > 0 && gridArea.h > 0);
    if (allowFull || !hasGrid) {
      return fn();
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(gridArea.x, gridArea.y, gridArea.w, gridArea.h);
    ctx.clip();
    try {
      return fn();
    } finally {
      ctx.restore();
    }
  }

  function drawLiveStrokePoint(ctx, pt, prevPt, strokeOrColor) {
    if (!ctx || !pt) return;

    const stroke =
      strokeOrColor && typeof strokeOrColor === 'object' && strokeOrColor.pts
        ? strokeOrColor
        : null;
    const color = stroke ? (stroke.color || '#ffffff') : (strokeOrColor || '#ffffff');

    let alpha = 1;
    if (stroke) {
      const overrideAlpha = Number.isFinite(stroke.liveAlphaOverride)
        ? stroke.liveAlphaOverride
        : null;
      if (overrideAlpha !== null) {
        alpha = overrideAlpha;
      } else {
        const S = getState();
        const wantsSpecial = !!stroke.isSpecial;
        const isVisualOnly = S.isVisualOnlyStroke(stroke);
        const generatorId = stroke.generatorId ?? null;
        alpha = S.getPathAlpha({
          isOverlay: false,
          wantsSpecial,
          isVisualOnly,
          generatorId,
        });
      }
    }

    resetCtx(ctx);
    withLogicalSpace(ctx, () => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;

      const lw = typeof getLineWidth === 'function' ? getLineWidth() : 8;
      ctx.lineWidth = lw;

      ctx.beginPath();
      if (prevPt) ctx.moveTo(prevPt.x, prevPt.y);
      else ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    });
    getState().__dgMarkSingleCanvasDirty(ctx?.canvas?.__dgPanel);
  }

  function drawGhostDebugBand(ctx, band) {
    const S = getState();
    const gridArea = S.gridArea;
    if (!DG_GHOST_DEBUG || !ctx || !band || !gridArea) return;
    withLogicalSpace(ctx, () => {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,255,255,0.8)';
      ctx.beginPath();
      ctx.moveTo(gridArea.x, band.minY);
      ctx.lineTo(gridArea.x + gridArea.w, band.minY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gridArea.x, band.maxY);
      ctx.lineTo(gridArea.x + gridArea.w, band.maxY);
      ctx.stroke();
      ctx.setLineDash([2, 6]);
      ctx.strokeStyle = 'rgba(0,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(gridArea.x, band.midY);
      ctx.lineTo(gridArea.x + gridArea.w, band.midY);
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawGhostDebugPath(ctx, { from, to, crossY }) {
    if (!DG_GHOST_DEBUG || !ctx || !from || !to) return;
    withLogicalSpace(ctx, () => {
      ctx.save();
      const q = (v0, v1, v2, t) => {
        const u = 1 - t;
        return u * u * v0 + 2 * u * t * v1 + t * t * v2;
      };
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 4]);
      ctx.strokeStyle = 'rgba(255,0,200,0.8)';
      ctx.beginPath();
      for (let i = 0; i <= 48; i++) {
        const t = i / 48;
        const x = from.x + (to.x - from.x) * t;
        const y = q(from.y, typeof crossY === 'number' ? crossY : (from.y + to.y) * 0.5, to.y, t);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      const cx = (from.x + to.x) * 0.5;
      const cy = typeof crossY === 'number' ? crossY : (from.y + to.y) * 0.5;
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,0,200,0.7)';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,180,255,0.9)';
      ctx.beginPath(); ctx.arc(from.x, from.y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(to.x, to.y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }

  function drawGhostDebugFrame(ctx, { x, y, radius, lettersRadius }) {
    if (!DG_GHOST_DEBUG || !ctx) return;
    withLogicalSpace(ctx, () => {
      ctx.save();
      ctx.fillStyle = 'rgba(0,210,255,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,210,255,0.5)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, radius), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([2, 6]);
      ctx.strokeStyle = 'rgba(50,255,120,0.5)';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, lettersRadius), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  return {
    withIdentity,
    withLogicalSpace,
    withDeviceSpace,
    resetCtx,
    clearCanvas,
    getLineWidth,
    getOverlayClearPad,
    getOverlayClearRect,
    withOverlayClip,
    drawLiveStrokePoint,
    drawGhostDebugBand,
    drawGhostDebugPath,
    drawGhostDebugFrame,
  };
}
