// src/ripplesynth-blocks.js — shared block renderer (plain squares) used by Bouncer/Rippler/Wheel
// Keeps the original signature so existing toys can call it unchanged.
export function drawBlocksSection(ctx, blocks, gx=0, gy=0, ripples=null, volume=1, noteList=null, sizing=null, _a=null, _b=null, now=null){
  const nowS = (typeof performance!=='undefined' ? performance.now()/1000 : 0);
  for (let i=0;i<blocks.length;i++){
    const b = blocks[i];
    const x = (gx + (b.x|0))|0, y = (gy + (b.y|0))|0, w = (b.w|0), h = (b.h|0);

    // base color
    ctx.save();
    // pulse scale from b.pulse or flash
    const flashDur = b.flashDur||0;
    const flashA = (b.flashEnd && flashDur) ? Math.max(0, Math.min(1, (b.flashEnd - nowS) / flashDur)) : 0;
    const visFlash = Math.max(b.cflash||0, flashA);
    const scl = visFlash>0 ? (1 + 0.14*visFlash) : 1;
    const cx = x + w/2, cy = y + h/2;
    ctx.translate(cx, cy); ctx.scale(scl, scl); ctx.translate(-cx, -cy);

    ctx.fillStyle = b.active ? '#f4932f' : '#293042';
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    // flash overlay
    if (flashA > 0){
      ctx.fillStyle = `rgba(255,255,255,${0.35*flashA})`;
      ctx.fillRect(x, y, w, h);
      ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${0.9*flashA})`; ctx.lineWidth = 3;
      ctx.strokeRect(x+0.5, y+0.5, w-1, h-1); ctx.restore();
    }

    // outline
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x+0.5, y+0.5, w-1, h-1);
  }
}
