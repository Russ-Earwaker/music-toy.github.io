// src/ripplesynth-blocks.js
// Draws orange blocks with flash + white edge ripples and gentle spring UI overlays when zoomed.

export function drawBlocksSection(ctx, blocks, gx, gy, ripples, volume, noteList, sizing, _a, _b, now){
  for (let i=0;i<blocks.length;i++){
    const b = blocks[i];
    const x = b.x|0, y = b.y|0, w = b.w|0, h = b.h|0;

    // flash overlay
    const flashA = (b.flashEnd && b.flashDur) ? Math.max(0, Math.min(1, (b.flashEnd - now) / b.flashDur)) : 0;
    // block
    ctx.fillStyle = '#f4932f';
    ctx.fillRect(x, y, w, h);
    if (flashA > 0){
      ctx.fillStyle = `rgba(255,255,255,${0.35*flashA})`;
      ctx.fillRect(x, y, w, h);
    }
    // outline
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x+0.5, y+0.5, w-1, h-1);

    // subtle white edge ripple (expanding square outline starting at edges)
    if (b.rippleAge != null && b.rippleMax && b.rippleAge < b.rippleMax){
      const t = b.rippleAge / b.rippleMax; // 0..1
      const expand = 20 * t;               // grow outward ~20px
      const alpha = 0.45 * (1 - t);        // fade out
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - expand + 0.5, y - expand + 0.5, w + expand*2 - 1, h + expand*2 - 1);
    }

    // zoomed edit UI (simple up/down + note label)
    if (sizing && typeof sizing.vw === 'function' && sizing.vw() >= 600){
      const label = (noteList && b.noteIndex != null) ? (noteList[b.noteIndex % noteList.length] || '') : '';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x, y-18, Math.max(34, ctx.measureText(label).width+12), 16);
      ctx.fillStyle = '#fff';
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.textBaseline = 'top';
      ctx.fillText(label, x+6, y-16);
      // Up/Down hints (triangles)
      ctx.beginPath(); ctx.moveTo(x+w-16, y-15); ctx.lineTo(x+w-8, y-15); ctx.lineTo(x+w-12, y-9); ctx.closePath();
      ctx.fill();
      ctx.beginPath(); ctx.moveTo(x+w-16, y-2); ctx.lineTo(x+w-8, y-2); ctx.lineTo(x+w-12, y-8); ctx.closePath();
      ctx.fill();
    }
  }
}
