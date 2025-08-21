// src/bouncer-edges.js — edge controller cubes & visuals
const WEDGE_DEBUG = true;
export function makeEdgeControllers(w, h, s, EDGE_PAD, noteList){
  const mk = (edge, x, y)=>({ edge, x, y, w:s, h:s, active:true, noteIndex: Math.floor(Math.random()*noteList.length), oct:4, fixed:true, collide:true, flash:0, lastHitAT:0 });
  return [
    mk('left',  EDGE_PAD+10,       (h/2 - s/2)),
    mk('right', w-EDGE_PAD-s-10,   (h/2 - s/2)),
    mk('top',   (w/2 - s/2),       EDGE_PAD+10),
    mk('bot',   (w/2 - s/2),       h-EDGE_PAD-s-10),
  ];
}

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

export function handleEdgeControllerEdit(hit, py, whichThirdRect, noteList){
  const t = whichThirdRect(hit, py);
  if (t === 'toggle'){ hit.active = !hit.active; return true; }
  let changed=false, prev=hit.noteIndex, prevOct=hit.oct||4;
  if (t === 'up'){ hit.noteIndex = (hit.noteIndex + 1) % noteList.length; if (hit.noteIndex < prev) hit.oct = Math.min(6, prevOct + 1); changed=true; }
  else if (t === 'down'){ hit.noteIndex = (hit.noteIndex + noteList.length - 1) % noteList.length; if (hit.noteIndex > prev) hit.oct = Math.max(2, prevOct - 1); changed=true; }
  return changed;
}

export function mapControllersByEdge(ctrls){
  const m = { left:null, right:null, top:null, bot:null };
  for (const c of ctrls){ m[c.edge] = c; }
  return m;
}

export function randomizeControllers(ctrls, noteList){
  for (const c of ctrls){
    c.noteIndex = Math.floor(Math.random()*noteList.length);
    c.active = Math.random() < 0.9;
  }
}

export function drawEdgeDecorations(ctx, ctrls, EDGE_PAD, CW, CH){
  ctx.save();
  for (const c of ctrls){
    const x=c.x, y=c.y, bw=c.w, bh=c.h;
    ctx.fillStyle = 'rgba(255,140,0,0.95)';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (c.edge==='left'){
      ctx.moveTo(x, y + bh*0.33);
      ctx.lineTo(EDGE_PAD+1, y + bh*0.5);
      ctx.lineTo(x, y + bh*0.67);
    } else if (c.edge==='right'){
      ctx.moveTo(x + bw, y + bh*0.33);
      ctx.lineTo(x + bw, y + bh*0.67);
      ctx.lineTo(CW - EDGE_PAD - 1, y + bh*0.5);
    } else if (c.edge==='top'){
      ctx.moveTo(x + bw*0.33, y);
      ctx.lineTo(x + bw*0.67, y);
      ctx.lineTo(x + bw*0.5, EDGE_PAD+1);
    } else if (c.edge==='bot'){
      ctx.moveTo(x + bw*0.33, y + bh);
      ctx.lineTo(x + bw*0.67, y + bh);
      ctx.lineTo(x + bw*0.5, CH - EDGE_PAD - 1);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (WEDGE_DEBUG){
      // two tips per edge: half cube width out along the wall line
      let tips = [];
      if (c.edge==='left' || c.edge==='right'){
        const tx = (c.edge==='left') ? EDGE_PAD+1 : (CW - EDGE_PAD - 1);
        tips = [[tx, y + bh*0.5 - bw*0.5], [tx, y + bh*0.5 + bw*0.5]];
      } else if (c.edge==='top' || c.edge==='bot'){
        const ty = (c.edge==='top') ? EDGE_PAD+1 : (CH - EDGE_PAD - 1);
        tips = [[x + bw*0.5 - bw*0.5, ty], [x + bw*0.5 + bw*0.5, ty]];
      }
      // draw connector from cube face center to each tip
      ctx.strokeStyle = 'magenta'; ctx.lineWidth = 1.5;
      for (const [tx,ty] of tips){
        ctx.beginPath();
        const cx = (c.edge==='left') ? x : (c.edge==='right') ? x+bw : x+bw*0.5;
        const cy = (c.edge==='top') ? y : (c.edge==='bot') ? y+bh : y+bh*0.5;
        ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.beginPath(); ctx.arc(tx, ty, 4, 0, Math.PI*2); ctx.fillStyle='magenta'; ctx.fill();
      }
    }
    // lock glyph
    const gx = x + bw - 12, gy = y + 7;
    ctx.beginPath();
    ctx.rect(gx, gy+3, 7, 6);
    ctx.moveTo(gx+1, gy+3);
    ctx.arc(gx+3.5, gy+3, 2, Math.PI, 0);
    ctx.lineWidth=1.5;
    ctx.strokeStyle='rgba(0,0,0,0.75)';
    ctx.stroke();
  }
  ctx.restore();
}
