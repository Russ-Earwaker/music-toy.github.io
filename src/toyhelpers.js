// src/toyhelpers.js (unified helpers for cubes/notes/rects)
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
    r.x = Math.floor(bx + Math.random() * (maxX - bx + 1));
    r.y = Math.floor(by + Math.random() * (maxY - by + 1));
  }
  return rects;
}

// ---------- rendering ----------
export function drawBlock(ctx, b, { baseColor = '#ff8c00', active = false } = {}){
  // Active pulse: scale + glow
  const pulse = active ? 1.0 : 0.0;
  const scale = 1 + 0.08 * pulse;
  const cx = b.x + b.w/2, cy = b.y + b.h/2;
  const w = b.w * scale, h = b.h * scale;
  const x = cx - w/2, y = cy - h/2;

  // body flat fill
  ctx.fillStyle = baseColor;
  if (pulse > 0){
    ctx.save();
    ctx.shadowColor = 'rgba(255,200,120,0.45)';
    ctx.shadowBlur = 10;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  } else {
    ctx.fillRect(x, y, w, h);
  }

  // border
  ctx.strokeStyle = '#000';
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
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('▲', b.x + b.w - 14, b.y + 11);
  ctx.fillText('▼', b.x + b.w - 14, b.y + b.h - 4);

  // label
  ctx.fillStyle = '#000';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(noteLabel, b.x + 6, b.y + 16);
}

// Hit helpers for the ▲ / ▼ strips
export function hitTopStrip(p, b){
  return (p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+NOTE_BTN_H);
}
export function hitBottomStrip(p, b){
  return (p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y+b.h-NOTE_BTN_H && p.y<=b.y+b.h);
}

// Utilities
export function findTopmostHit(p, blocks){
  return blocks.slice().reverse().find(b => hitRect(p, b));
}
