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

    // Flash/pulse (match Simple Rhythm feel: scale pulse + full white flash fill).
    // NOTE: `onCol` is treated as a "hit" column, not a selection ring.
    const flash = (i === onCol) ? 1 : 0;

    let dx = x, dy = y, dw = w, dh = h;
    if (flash > 0){
      const f = Math.max(0, Math.min(1, flash));
      const p = 1 - f;
      const scale = 1.0 + Math.sin(p * Math.PI) * 0.1;
      const shrinkW = dw * (1 - scale);
      const shrinkH = dh * (1 - scale);
      ctx.save();
      ctx.translate(dx + shrinkW / 2, dy + shrinkH / 2);
      ctx.scale(scale, scale);
      dx = 0; dy = 0;
    }

    // base fill (plain square, no bevel/rounding)
    ctx.fillStyle = color;
    ctx.fillRect(dx|0, dy|0, dw|0, dh|0);

    // Full flash overlay (fill, not edge ring)
    if (flash > 0){
      const f = Math.max(0, Math.min(1, flash));
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.55 * f;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(dx|0, dy|0, dw|0, dh|0);
      ctx.restore();
    }

    // outline
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect((dx+0.5)|0, (dy+0.5)|0, (dw-1)|0, (dh-1)|0);

    if (flash > 0){
      ctx.restore(); // paired with ctx.save() above for pulse transform
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
