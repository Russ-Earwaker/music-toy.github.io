// src/ui-tiles-compat.js — shared orange tile strip (compat helper, <=300 lines)
export function drawBlocksSection(ctx, rect, { active=[], radius=8, pad=6, onCol=-1 } = {}){
  if (!ctx || !rect) return;
  const ORANGE_ON  = 'rgba(255,144,64,0.95)';
  const ORANGE_OFF = 'rgba(255,144,64,0.25)';
  const W = rect.w, H = rect.h, N = active.length||8;
  const cw = W / N;
  for (let i=0;i<N;i++){
    const x = i*cw + pad;
    const y = rect.y + pad;
    const w = cw - pad*2;
    const h = rect.h - pad*2;
    const r = Math.min(radius, Math.min(w,h)/2 - 1);
    const color = active[i] ? ORANGE_ON : ORANGE_OFF;

    // base tile
    ctx.save();
    ctx.fillStyle = color;
    roundedRect(ctx, x, y, w, h, r); ctx.fill();

    // outline
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = Math.max(1, Math.round(Math.min(w,h)*0.06));
    roundedRect(ctx, x, y, w, h, r); ctx.stroke();

    // inner bevel
    ctx.beginPath();
    roundedRect(ctx, x, y, w, h*0.55, r*0.8);
    const grad = ctx.createLinearGradient(0, y, 0, y+h*0.55);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = grad; ctx.fill();
    ctx.restore();

    // active ring
    if (i === onCol){
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(2, Math.round(Math.min(w,h)*0.14));
      roundedRect(ctx, x+2, y+2, w-4, h-4, Math.max(2, r-2));
      ctx.stroke();
      ctx.restore();
    }
  }
}

function roundedRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}
