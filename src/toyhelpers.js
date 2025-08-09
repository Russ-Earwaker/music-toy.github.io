// src/toyhelpers.js
// Shared helpers/constants for canvas toys
export const NOTE_BTN_H = 14;   // height of ▲ / ▼ click zones
export const EDGE_PAD   = 6;    // keep blocks/nodes a bit off walls

export function randomizeRects(rects, canvas, edgePad = EDGE_PAD){
  const vw = canvas._vw ?? canvas.width, vh = canvas._vh ?? canvas.height;
  rects.forEach(b=>{
    b.x = Math.floor(Math.random() * (vw - 2*edgePad - b.w)) + edgePad;
    b.y = Math.floor(Math.random() * (vh - 2*edgePad - b.h)) + edgePad;
  });
}

export function clampRectWithin(canvas, rect, edgePad = EDGE_PAD){
  const vw = canvas._vw ?? canvas.width, vh = canvas._vh ?? canvas.height;
  rect.x = Math.max(edgePad, Math.min(rect.x, vw - edgePad - rect.w));
  rect.y = Math.max(edgePad, Math.min(rect.y, vh - edgePad - rect.h));
}

export function drawNoteStripsAndLabel(ctx, b, labelText){
  // top ▲ zone
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(b.x, b.y, b.w, NOTE_BTN_H);
  ctx.fillStyle = '#fff';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('▲', b.x + b.w - 14, b.y + 11);

  // bottom ▼ zone
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(b.x, b.y + b.h - NOTE_BTN_H, b.w, NOTE_BTN_H);
  ctx.fillStyle = '#fff';
  ctx.fillText('▼', b.x + b.w - 14, b.y + b.h - 4);

  // note label
  ctx.fillStyle = '#aee0ff';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(labelText, b.x + 6, b.y + 16);
}


export function hitRect(p, r){
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function hitTopStrip(p, r, stripH = NOTE_BTN_H){
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + stripH;
}

export function hitBottomStrip(p, r, stripH = NOTE_BTN_H){
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y + r.h - stripH && p.y <= r.y + r.h;
}

export function findTopmostHit(p, rects){
  for (let i = rects.length - 1; i >= 0; --i){
    const r = rects[i];
    if (hitRect(p, r)) return r;
  }
  return null;
}
