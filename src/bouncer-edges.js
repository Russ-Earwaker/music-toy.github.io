// src/bouncer-edges.js — edge controller cubes & visuals (minimal, wedges off)
import { stepIndexUp, stepIndexDown } from './note-helpers.js';

export const WEDGE_DEBUG = false;
export const WEDGE_BIG_DEBUG = false;

// Create 4 edge controller cubes (locked, collidable, oct=4)
export function makeEdgeControllers(w, h, size, EDGE_PAD, noteList){
  const mk = (edge, x, y) => ({
    edge, x, y, w:size, h:size,
    active: true, noteIndex: Math.floor(Math.random()*Math.max(1, (noteList && noteList.length) || 12)), oct: 4,
    fixed: true, collide: true, flash: 0, lastHitAT: 0
  });
  return [
    mk('left',  EDGE_PAD+10,        (h/2 - size/2)),
    mk('right', w-EDGE_PAD-size-10, (h/2 - size/2)),
    mk('top',   (w/2 - size/2),     EDGE_PAD+10),
    mk('bot',   (w/2 - size/2),     h-EDGE_PAD-size-10),
  ];
}

// Orange inner bond lines; dim when corresponding controller is disabled.
export function drawEdgeBondLines(ctx, w, h, EDGE_PAD, ctrls=null){
  const map = ctrls ? mapControllersByEdge(ctrls) : null;
  const activeCol = 'rgba(255,140,0,0.9)';
  const inactiveCol = '#293042';
  ctx.save(); ctx.lineWidth = 2;

  // top
  ctx.beginPath(); ctx.moveTo(EDGE_PAD+1, EDGE_PAD+1); ctx.lineTo(w-EDGE_PAD-1, EDGE_PAD+1);
  ctx.strokeStyle = (map && map.top && !map.top.active) ? inactiveCol : activeCol; ctx.stroke();

  // bottom
  ctx.beginPath(); ctx.moveTo(EDGE_PAD+1, h-EDGE_PAD-1); ctx.lineTo(w-EDGE_PAD-1, h-EDGE_PAD-1);
  ctx.strokeStyle = (map && map.bot && !map.bot.active) ? inactiveCol : activeCol; ctx.stroke();

  // left
  ctx.beginPath(); ctx.moveTo(EDGE_PAD+1, EDGE_PAD+1); ctx.lineTo(EDGE_PAD+1, h-EDGE_PAD-1);
  ctx.strokeStyle = (map && map.left && !map.left.active) ? inactiveCol : activeCol; ctx.stroke();

  // right
  ctx.beginPath(); ctx.moveTo(w-EDGE_PAD-1, EDGE_PAD+1); ctx.lineTo(w-EDGE_PAD-1, h-EDGE_PAD-1);
  ctx.strokeStyle = (map && map.right && !map.right.active) ? inactiveCol : activeCol; ctx.stroke();

  ctx.restore();
}

// Zoom edit helper: thirds on the controller rect.
export function handleEdgeControllerEdit(hit, py, whichThirdRect, noteList){
  const t = whichThirdRect(hit, py);
  if (t === 'toggle'){ hit.active = !hit.active; return true; }
  if (t === 'up'){ return stepIndexUp(hit, noteList); }
  if (t === 'down'){ return stepIndexDown(hit, noteList); }
  return false;
}

export function mapControllersByEdge(ctrls){
  const m = { left:null, right:null, top:null, bot:null };
  for (const c of ctrls){ if (c && c.edge) m[c.edge] = c; }
  return m;
}

export function randomizeControllers(ctrls, noteList){
  const n = Math.max(1, (noteList && noteList.length) || 12);
  for (const c of ctrls){
    c.noteIndex = Math.floor(Math.random() * n);
    // keep active state as-is to respect user
  }
}

// Minimal decorations: small orange tab + lock glyph; wedges disabled.
export function drawEdgeDecorations(ctx, ctrls, EDGE_PAD, CW, CH){
  ctx.save();
  for (const c of ctrls){
    const x=c.x, y=c.y, bw=c.w, bh=c.h;
    // Orange tab indicating connection
    ctx.fillStyle = '#f4932f';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (c.edge==='left'){
      ctx.moveTo(x, y + bh*0.25);
      ctx.lineTo(EDGE_PAD+1, y + bh*0.5);
      ctx.lineTo(x, y + bh*0.75);
    } else if (c.edge==='right'){
      ctx.moveTo(x + bw, y + bh*0.25);
      ctx.lineTo(CW - EDGE_PAD - 1, y + bh*0.5);
      ctx.lineTo(x + bw, y + bh*0.75);
    } else if (c.edge==='top'){
      ctx.moveTo(x + bw*0.25, y);
      ctx.lineTo(x + bw*0.5, EDGE_PAD+1);
      ctx.lineTo(x + bw*0.75, y);
    } else if (c.edge==='bot'){
      ctx.moveTo(x + bw*0.25, y + bh);
      ctx.lineTo(x + bw*0.5, CH - EDGE_PAD - 1);
      ctx.lineTo(x + bw*0.75, y + bh);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // Lock glyph
    const gx = x + bw - 12, gy = y + 7;
    ctx.beginPath(); ctx.rect(gx, gy+3, 7, 6);
    ctx.moveTo(gx+1, gy+3); ctx.arc(gx+3.5, gy+3, 2, Math.PI, 0);
    ctx.lineWidth=1.5; ctx.strokeStyle='rgba(0,0,0,0.75)'; ctx.stroke();
  }
  ctx.restore();
}
