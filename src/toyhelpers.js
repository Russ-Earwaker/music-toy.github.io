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

  // Uniform random placement with no intentional clumping
  const placed = [];
  const MAX_TRIES = 300;
  for (const r of rects){
    const maxX = Math.max(bx, bx + bw - r.w);
    const maxY = Math.max(by, by + bh - r.h);
    let tries = 0, ok = false;
    while (tries < MAX_TRIES && !ok){
      r.x = Math.floor(bx + Math.random() * Math.max(1, (maxX - bx)));
      r.y = Math.floor(by + Math.random() * Math.max(1, (maxY - by)));
      ok = !placed.some(p => (r.x < p.x + p.w) && (r.x + r.w > p.x) && (r.y < p.y + p.h) && (r.y + r.h > p.y));
      tries++;
    }
    // If we couldn't find a free spot, just place and let separation pass resolve it
    placed.push({ x:r.x, y:r.y, w:r.w, h:r.h });
  }

  // Iterative separation to remove any overlaps (edges may touch)
  const MAX_ITERS = 400;
  for (let iter=0; iter<MAX_ITERS; iter++){
    let moved = false;
    for (let i=0; i<rects.length; i++){
      for (let j=i+1; j<rects.length; j++){
        const a = rects[i], b = rects[j];
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (overlapX > 0 && overlapY > 0){
          if (overlapX < overlapY){
            const dir = (a.x + a.w/2) < (b.x + b.w/2) ? -1 : 1;
            const push = Math.ceil(overlapX/2);
            a.x = clamp(a.x + dir*push, bx, bx + bw - a.w);
            b.x = clamp(b.x - dir*push, bx, bx + bw - b.w);
          } else {
            const dir = (a.y + a.h/2) < (b.y + b.h/2) ? -1 : 1;
            const push = Math.ceil(overlapY/2);
            a.y = clamp(a.y + dir*push, by, by + bh - a.h);
            b.y = clamp(b.y - dir*push, by, by + bh - b.h);
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return rects;
}



// ---------- drawing ----------
// ---------- drawing ----------

export function drawBlock(ctx, b, opts = {}){
  const {
    baseColor = '#ff8c00',
    active = false,
    offsetX = 0,
    offsetY = 0,
    noteLabel = null,
    showArrows = true,
    variant = 'block' // 'block' | 'button'
  } = opts;
  const x = (b.x|0) + offsetX, y = (b.y|0) + offsetY, w = (b.w|0), h = (b.h|0);

  // Clip to block rect to prevent any bevel/outline bleed
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // background
  ctx.fillStyle = baseColor;
  ctx.fillRect(x, y, w, h);

  // variant styling
  if (variant === 'button'){
    // Beveled button look
    // base bevel
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x+1, y+1, w-2, 2);
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#000000';
    ctx.fillRect(x+1, y + h - 3, w-2, 2);
    // if active, add inner glow
    if (active){
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x+2, y+2, w-4, Math.max(2, Math.floor(h*0.35)));
      ctx.globalAlpha = 1;
    }
  } else {
    // active pulse overlay (legacy block look)
    if (active) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
  }

  // stroke
  ctx.strokeStyle = active ? 'rgba(255,255,255,0.50)' : 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x+0.5, y+0.5, w-1, h-1);

  // arrows + label (only if requested by caller)
  if (showArrows || noteLabel != null){
    // small top band behind label to separate visually (used in zoom mode)
    if (noteLabel != null){
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y - NOTE_BTN_H, w, NOTE_BTN_H);
      ctx.restore();
    }

    // arrows we draw via UI helper elsewhere; just render text label if provided
    if (noteLabel != null) {
      if (showArrows) {
        // In Advanced view, draw the note label in the center of the cube.
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(String(noteLabel), x + w / 2, y + h / 2);
      } else {
        // In Standard view, draw the label above the block (legacy behavior).
        ctx.fillStyle = '#fff';
        ctx.font = '12px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(String(noteLabel), x + w/2, y - NOTE_BTN_H/2);
      }
    }

    if (showArrows) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      const arrowW = w * 0.2;
      const arrowH = h * 0.1;
      const cx = x + w / 2;

      // Up arrow
      const topY = y + h * 0.15;
      ctx.beginPath();
      ctx.moveTo(cx, topY - arrowH / 2);
      ctx.lineTo(cx + arrowW / 2, topY + arrowH / 2);
      ctx.lineTo(cx - arrowW / 2, topY + arrowH / 2);
      ctx.closePath();
      ctx.fill();

      // Down arrow
      const botY = y + h * 0.85;
      ctx.beginPath();
      ctx.moveTo(cx, botY + arrowH / 2);
      ctx.lineTo(cx + arrowW / 2, botY - arrowH / 2);
      ctx.lineTo(cx - arrowW / 2, botY - arrowH / 2);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore(); /*__restore_marker__*/
}


export function drawNoteStripsAndLabel(ctx, b, label) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(b.x, b.y, b.w, NOTE_BTN_H);
  ctx.fillRect(b.x, b.y + b.h - NOTE_BTN_H, b.w, NOTE_BTN_H);
  ctx.fillStyle = '#fff';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(label ?? ''), b.x + 6, b.y + b.h / 2);
  ctx.restore();
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

// The legacy initToySizing helper has been removed and is now handled by toy-layout-manager.js


export function findTopmostHit(p, blocks){
  return blocks.slice().reverse().find(b => hitRect(p, b));
}


// ---------- shared cube UI helpers ----------
/** Return 'up' | 'toggle' | 'down' based on Y position within rect */
export function whichThirdRect(rect, py){
  const t1 = rect.y + rect.h/3, t2 = rect.y + 2*rect.h/3;
  if (py < t1) return 'up';
  if (py < t2) return 'toggle';
  return 'down';
}

/** Draw two horizontal divider lines at 1/3 and 2/3 inside rect (zoom-only hint) */
export function drawThirdsGuides(ctx, rect){
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  const cx = rect.x + rect.w/2;
  const left = rect.x + 6;
  const right = rect.x + rect.w - 6;
  const gap = Math.max(40, rect.w * 0.75); // center gap to avoid label area
  const halfGap = gap / 2;

  const y1 = rect.y + rect.h/3;
  const y2 = rect.y + 2*rect.h/3;

  // top line with center gap
  ctx.beginPath();
  ctx.moveTo(left, y1); ctx.lineTo(cx - halfGap, y1);
  ctx.moveTo(cx + halfGap, y1); ctx.lineTo(right, y1);
  ctx.stroke();

  // bottom line with center gap
  ctx.beginPath();
  ctx.moveTo(left, y2); ctx.lineTo(cx - halfGap, y2);
  ctx.moveTo(cx + halfGap, y2); ctx.lineTo(right, y2);
  ctx.stroke();

  ctx.restore();
}

/** Round-rect path helper (no fill/stroke) */
export function roundRectPath(ctx, x, y, w, h, r=10){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
  ctx.restore();
}
