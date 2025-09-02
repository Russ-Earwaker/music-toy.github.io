// src/ui-tiles.js — shared orange tile visuals (plain squares, no bevel/rounding)
/** Draw the horizontal strip of N orange tiles, plain squares with optional active ring.
 * rect: {x,y,w,h}. opts: { active:bool[], onCol:number, pad:number, labels?:string[], zoomed?:boolean }
 */
export function drawBlocksSection(ctx, rect, { active=[], onCol=-1, pad=6, labels=null, zoomed=false } = {}){
  if (!ctx || !rect) return;
  const N = active.length || 8;
  const cw = rect.w / N;
  for (let i=0;i<N;i++){
    const x = rect.x + i*cw + pad;
    const y = rect.y + pad;
    const w = Math.max(2, cw - pad*2);
    const h = Math.max(2, rect.h - pad*2);
    const color = active[i] ? '#f4932f' : '#293042';

    // base fill (plain square)
    ctx.fillStyle = color;
    ctx.fillRect(x|0, y|0, w|0, h|0);

    // outline
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect((x+0.5)|0, (y+0.5)|0, (w-1)|0, (h-1)|0);

    // active ring highlight
    if (i === onCol){
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.strokeRect((x+1.5)|0, (y+1.5)|0, (w-3)|0, (h-3)|0);
    }
  }
}

// Optional label/chevrons pass (kept for API compatibility; no-op unless labels provided)
export function drawTileLabelAndArrows(ctx, rect, { label='', active=true, zoomed=false } = {}){
  if (!zoomed || !label) return;
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.fillStyle = active ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.35)';
  ctx.fillRect(x+4, y+h*0.62, Math.max(0,w-8), h*0.22);
  ctx.fillStyle = active ? '#ffffff' : '#000000';
  ctx.font = '12px ui-sans-serif, system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(label, x + w/2, y + h*0.72);
  ctx.restore();
}
