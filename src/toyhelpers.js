// src/toyhelpers.js (unified helpers for cubes/notes/rects)
import { resizeCanvasForDPR } from './utils.js';

export const NOTE_BTN_H = 14;
export const EDGE_PAD   = 6;

// ---------- math / geometry ----------
export function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

export function hitRect(p, r){
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// Accepts (rect, width, height, pad?) or (rect, boundsRect, pad?)
export function clampRectWithin(rect, boundsOrW, hMaybe, pad = EDGE_PAD){
  let bx, by, bw, bh;
  if (typeof boundsOrW === 'number'){
    bx = pad; by = pad; bw = boundsOrW - pad*2; bh = hMaybe - pad*2;
  } else {
    const b = boundsOrW;
    bx = (b.x ?? 0) + pad; by = (b.y ?? 0) + pad;
    bw = (b.w ?? b.width ?? 0) - pad*2;
    bh = (b.h ?? b.height ?? 0) - pad*2;
  }
  rect.x = clamp(rect.x, bx, bx + bw - rect.w);
  rect.y = clamp(rect.y, by, by + bh - rect.h);
  return rect;
}

// Randomize .x/.y for an array of rect-like objects within bounds.
// Usage: randomizeRects(blocks, canvasWidth, canvasHeight) OR randomizeRects(blocks, {x:0,y:0,w:W,h:H})
export function randomizeRects(rects, boundsOrW, hMaybe, pad = EDGE_PAD){
  if (!Array.isArray(rects) || !rects.length) return rects;
  let bx, by, bw, bh;
  if (typeof boundsOrW === 'number'){
    bx = pad; by = pad; bw = boundsOrW - pad*2; bh = hMaybe - pad*2;
  } else {
    const b = boundsOrW;
    bx = (b.x ?? 0) + pad; by = (b.y ?? 0) + pad;
    bw = (b.w ?? b.width ?? 0) - pad*2;
    bh = (b.h ?? b.height ?? 0) - pad*2;
  }
  for (const r of rects){
    const maxX = Math.max(bx, bx + bw - r.w);
    const maxY = Math.max(by, by + bh - r.h);
    r.x = Math.floor(bx + Math.random() * Math.max(1, (maxX - bx)));
    r.y = Math.floor(by + Math.random() * Math.max(1, (maxY - by)));
  }
  return rects;
}

// ---------- drawing ----------
export function drawBlock(ctx, b, { baseColor = '#ff8c00', active = false } = {}){
  const { x, y, w, h } = b;
  // background
  ctx.fillStyle = baseColor;
  ctx.fillRect(x, y, w, h);

  // active pulse overlay
  if (active){
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  // border
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x+0.5, y+0.5, w-1, h-1);
  ctx.globalAlpha = 1;
}

export function drawNoteStripsAndLabel(ctx, b, noteLabel){
  // top strip
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(b.x, b.y, b.w, NOTE_BTN_H);
  // bottom strip
  ctx.fillRect(b.x, b.y + b.h - NOTE_BTN_H, b.w, NOTE_BTN_H);

  // arrows
  ctx.fillStyle = '#fff';
  // up (top)
  ctx.beginPath();
  ctx.moveTo(b.x + b.w - 12, b.y + 4);
  ctx.lineTo(b.x + b.w - 4, b.y + 4);
  ctx.lineTo(b.x + b.w - 8, b.y + 10);
  ctx.closePath();
  ctx.fill();
  // down (bottom)
  ctx.beginPath();
  ctx.moveTo(b.x + b.w - 12, b.y + b.h - 4);
  ctx.lineTo(b.x + b.w - 4, b.y + b.h - 4);
  ctx.lineTo(b.x + b.w - 8, b.y + b.h - 10);
  ctx.closePath();
  ctx.fill();

  // label
  ctx.fillStyle = '#fff';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(noteLabel ?? ''), b.x + 6, b.y + b.h/2);
}

export function hitTopStrip(p, b){
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + NOTE_BTN_H;
}
export function hitBottomStrip(p, b){
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y + b.h - NOTE_BTN_H && p.y <= b.y + b.h;
}

// ---------- sizing / zoom (shared) ----------
/**
 * Initialize consistent sizing & zoom for a toy canvas.
 * - Measures width from .toy-body (or shell). Height from aspect function or squareFromWidth or initial snapshot.
 * - Manages a ResizeObserver; suspends observation during zoom to avoid feedback loops.
 * - Exposes vw/vh (CSS px), setZoom(zoomed) -> ratio, and scale (1 or 2).
 */

export function initToySizing(shell, canvas, ctx, { squareFromWidth = false, aspectFrom = null, minH = 60 } = {}){
  const host = shell.querySelector?.('.toy-body') || shell;

  // Measure a stable "slot width" once (or when unzoomed) and use it for both zoom states
  function measureWidthFallback(){
    const r = host.getBoundingClientRect?.();
    const w = Math.max(1, Math.floor(r?.width || host.clientWidth || shell.clientWidth || 360));
    return w;
  }

  let slotW = measureWidthFallback();
  let scale = 1; // 1x standard, 2x zoom

  function baseHeightFor(w){
    if (typeof aspectFrom === 'function') return Math.max(minH, Math.floor(aspectFrom(w)));
    if (squareFromWidth) return w;
    const r = host.getBoundingClientRect?.();
    const hSnap = Math.max(minH, Math.floor(r?.height || host.clientHeight || shell.clientHeight || 200));
    return hSnap;
  }

  function applySize(){
    const cssW = Math.max(1, Math.floor(slotW * scale));
    const cssH = Math.max(1, Math.floor(baseHeightFor(slotW) * scale));
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    // Keep canvas from influencing ancestor reflow weirdly
    canvas.style.maxWidth = '100%';
    resizeCanvasForDPR(canvas, ctx);
  }

  function ensureFit(){
    // Only update slotW when unzoomed; avoid feedback during zoom
    if (scale === 1){
      const wNow = measureWidthFallback();
      if (wNow !== slotW) slotW = wNow;
    }
    applySize();
  }

  // Window resize is enough; avoid ResizeObserver feedback entirely
  const onResize = ()=> ensureFit();
  window.addEventListener('resize', onResize);
  // Initial apply
  ensureFit();

  function setZoom(zoomed){
    const target = zoomed ? 2 : 1;
    if (target === scale) return 1;
    const ratio = target / scale;
    scale = target;
    applySize();
    return ratio;
  }

  function vw(){ return Math.max(1, Math.floor(canvas.clientWidth || slotW * scale)); }
  function vh(){ return Math.max(1, Math.floor(canvas.clientHeight || baseHeightFor(slotW) * scale)); }

  return {
    host,
    vw, vh,
    setZoom,
    get scale(){ return scale; },
    disconnect(){
      try { window.removeEventListener('resize', onResize); } catch {}
    }
  };
}
// Utilities
export function findTopmostHit(p, blocks){
  return blocks.slice().reverse().find(b => hitRect(p, b));
}
