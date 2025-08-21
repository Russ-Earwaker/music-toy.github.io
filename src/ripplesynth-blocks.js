// src/ripplesynth-blocks.js
import { drawTileLabelAndArrows } from './ui-tiles.js';
// Draws orange blocks with flash + unified label/arrows via shared helper.

const SHOW_TOP_UI = true;

export function drawBlocksSection(ctx, blocks, gx, gy, ripples, volume, noteList, sizing, _a, _b, now){
  for (let i=0;i<blocks.length;i++){
    const b = blocks[i];
    const x = b.x|0, y = b.y|0, w = b.w|0, h = b.h|0;

    // flash overlay
    const flashA = (b.flashEnd && b.flashDur) ? Math.max(0, Math.min(1, (b.flashEnd - now) / b.flashDur)) : 0;
    // block
    ctx.fillStyle = b.active ? '#f4932f' : '#293042';
    ctx.fillRect(x, y, w, h);
    if (flashA > 0){
      ctx.fillStyle = `rgba(255,255,255,${0.35*flashA})`;
      ctx.fillRect(x, y, w, h);
      ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${0.9*flashA})`; ctx.lineWidth = 3; ctx.strokeRect(x+0.5, y+0.5, w-1, h-1); ctx.restore();
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

        // unified label + arrows
    {
      const rect = {x, y, w, h};
      const label = (noteList && b.noteIndex!=null) ? String(noteList[b.noteIndex % noteList.length]||'') : '';
      const zoomed = !!(sizing && typeof sizing.vw==='function' && sizing.vw()>=600);
      drawTileLabelAndArrows(ctx, rect, { label, active: !!b.active, zoomed });
    }
  }
}
