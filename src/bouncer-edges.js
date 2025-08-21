// src/bouncer-edges.js — edge controller cubes & visuals (keeps bouncer.js lean)
import { clamp } from './utils.js';

export function makeEdgeControllers(w, h, s, EDGE_PAD, noteList){
  const mk = (edge, x, y)=>({ edge, x, y, w:s, h:s, active:true, noteIndex: Math.floor(Math.random()*noteList.length), fixed:true, collide:true, flash:0, lastHitAT:0 });
  return [
    mk('left',  EDGE_PAD+2,       (h/2 - s/2)),
    mk('right', w-EDGE_PAD-s-2,   (h/2 - s/2)),
    mk('top',   (w/2 - s/2),      EDGE_PAD+2),
    mk('bot',   (w/2 - s/2),      h-EDGE_PAD-s-2),
  ];
}

// Draw thin orange inner edge line to bond controller with its edge
export function drawEdgeBondLines(ctx, w, h, EDGE_PAD){
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,140,0,0.9)';
  // top
  ctx.beginPath(); ctx.moveTo(EDGE_PAD+1, EDGE_PAD+1); ctx.lineTo(w-EDGE_PAD-1, EDGE_PAD+1); ctx.stroke();
  // bottom
  ctx.beginPath(); ctx.moveTo(EDGE_PAD+1, h-EDGE_PAD-1); ctx.lineTo(w-EDGE_PAD-1, h-EDGE_PAD-1); ctx.stroke();
  // left
  ctx.beginPath(); ctx.moveTo(EDGE_PAD+1, EDGE_PAD+1); ctx.lineTo(EDGE_PAD+1, h-EDGE_PAD-1); ctx.stroke();
  // right
  ctx.beginPath(); ctx.moveTo(w-EDGE_PAD-1, EDGE_PAD+1); ctx.lineTo(w-EDGE_PAD-1, h-EDGE_PAD-1); ctx.stroke();
  ctx.restore();
}

// Handle thirds editing on a controller cube; returns true if it handled it
export function handleEdgeControllerEdit(p, hit, whichThirdRect, noteList){
  const t = whichThirdRect(p, hit);
  if (t === 'mid'){ hit.active = !hit.active; return true; }
  if (t === 'top'){ hit.noteIndex = (hit.noteIndex + 1) % noteList.length; return true; }
  if (t === 'bot'){ hit.noteIndex = (hit.noteIndex + noteList.length - 1) % noteList.length; return true; }
  return false;
}

// Map edge->controller object for quick lookup
export function mapControllersByEdge(ctrls){
  const m = { left:null, right:null, top:null, bot:null };
  for (const c of ctrls){ m[c.edge] = c; }
  return m;
}

// Randomize controller note/active but keep position
export function randomizeControllers(ctrls, noteList){
  for (const c of ctrls){
    c.noteIndex = Math.floor(Math.random()*noteList.length);
    c.active = Math.random() < 0.85;
  }
}

// Simple draw (same rounded rect hit-area) with a small lock indicator
export function drawControllers(ctx, ctrls){
  for (const c of ctrls){
    const x=c.x, y=c.y, w=c.w, h=c.h, r=8;
    // shell
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
    ctx.fillStyle = c.active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
    ctx.fill();
    ctx.lineWidth=2; ctx.strokeStyle='rgba(255,255,255,0.20)'; ctx.stroke();
    // lock glyph (small padlock)
    const gx = x+w-11, gy=y+7;
    ctx.beginPath();
    ctx.rect(gx, gy+3, 6, 5);
    ctx.moveTo(gx+1, gy+3); ctx.arc(gx+3, gy+3, 2, Math.PI, 0);
    ctx.lineWidth=1.5; ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.stroke();
  }
}


export function drawEdgeDecorations(ctx, ctrls, EDGE_PAD){
  ctx.save();
  for (const c of ctrls){
    // Wedge connecting block to wall
    const x=c.x, y=c.y, w=c.w, h=c.h, n=Math.max(6, Math.min(12, Math.floor(h*0.18)));
    ctx.fillStyle = '#f4932f';
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath();
    if (c.edge==='left'){ ctx.moveTo(x, y+h*0.33); ctx.lineTo(EDGE_PAD+1, y+h*0.5); ctx.lineTo(x, y+h*0.67); }
    if (c.edge==='right'){ ctx.moveTo(x+w, y+h*0.33); ctx.lineTo(x+w, y+h*0.67); ctx.lineTo(x+w+(EDGE_PAD?-1:1), y+h*0.5); }
    if (c.edge==='top'){ ctx.moveTo(x+w*0.33, y); ctx.lineTo(x+w*0.67, y); ctx.lineTo(x+w*0.5, EDGE_PAD+1); }
    if (c.edge==='bot'){ ctx.moveTo(x+w*0.33, y+h); ctx.lineTo(x+w*0.67, y+h); ctx.lineTo(x+w*0.5, y+h+(EDGE_PAD?-1:1)); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // Lock glyph at top-right of block
    const gx = x+w-12, gy=y+7;
    ctx.beginPath(); ctx.rect(gx, gy+3, 7, 6); ctx.moveTo(gx+1, gy+3); ctx.arc(gx+3.5, gy+3, 2, Math.PI, 0); ctx.lineWidth=1.5; ctx.strokeStyle='rgba(0,0,0,0.7)'; ctx.stroke();
  }
  ctx.restore();
}
