// src/ripplesynth-blocks.js
import { drawTileLabelAndArrows } from './ui-tiles.js';
import { ensureAudioContext } from './audio-core.js';
// Draws orange blocks with flash + unified label/arrows via shared helper.

const SHOW_TOP_UI = true;

export function drawBlocksSection(ctx, blocks, gx, gy, ripples, volume, noteList, sizing, _a, _b, now){
    const ac = ensureAudioContext?.(); const nowS = (typeof now==='number' && isFinite(now)) ? now : (ac ? ac.currentTime : ((typeof performance!=='undefined'? performance.now():0)/1000));
for (let i=0;i<blocks.length;i++){
    const b = blocks[i];
    const x = b.x|0, y = b.y|0, w = b.w|0, h = b.h|0;

    // flash overlay
    const flashA = (b.flashEnd && b.flashDur) ? Math.max(0, Math.min(1, (b.flashEnd - nowS) / b.flashDur)) : 0;
    const visFlash = Math.max(b.cflash||0, flashA);
    if (visFlash>0){
      const a = Math.min(1, visFlash);
      ctx.save(); const oldG = ctx.globalCompositeOperation; ctx.globalCompositeOperation='lighter';
      ctx.fillStyle = `rgba(255,255,255,${0.35*a})`;
      ctx.fillRect(x-3, y-3, w+6, h+6);
      ctx.globalCompositeOperation = oldG; ctx.restore();
    }
    /*CFLASH_VISUAL*/
    // block
    const scl = (b.pulse && b.pulse>0) ? (1 + 0.14 * b.pulse) : 1;
    const cx = x + w/2, cy = y + h/2;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(scl, scl); ctx.translate(-cx, -cy);
    // scale pulse from pulse or visFlash
      const __pulseA = Math.max(b.pulse||0, (typeof visFlash!=='undefined'? visFlash*0.85 : 0));
      const __scl = __pulseA>0 ? (1 + 0.14*__pulseA) : 1;
      const __cx = x + w/2, __cy = y + h/2;
      ctx.save(); ctx.translate(__cx, __cy); ctx.scale(__scl, __scl); ctx.translate(-__cx, -__cy);
      ctx.fillStyle = b.active ? '#f4932f' : '#293042';
    ctx.fillRect(x, y, w, h);
      ctx.restore();
      /*SHARED_CUBE_PULSE*/
    ctx.restore();
    /*PULSE_VISUAL*/
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
      let label = (noteList && b.noteIndex!=null) ? String(noteList[b.noteIndex % noteList.length]||'') : '';
      if (b && b.labelOverride) label = String(b.labelOverride);
      let zoomed = false;
      try {
        const cnv = ctx && ctx.canvas;
        const p = cnv && cnv.closest ? cnv.closest('.toy-panel') : null;
        zoomed = !!(p && p.classList && p.classList.contains('toy-zoomed'));
      } catch {}
      if (!zoomed && sizing && typeof sizing.vw==='function') zoomed = sizing.vw()>=600;
      const zoomForArrows = zoomed && !(b && b.hideArrows);
      drawTileLabelAndArrows(ctx, rect, { label, active: !!b.active, zoomed: zoomForArrows });
      // If we're dragging (Wheel), force a simple label overlay without arrows
      if (b && b.showLabelForce && label){
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.font = '14px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // subtle band behind text
        const px = Math.max(4, Math.min(w, h) * 0.12);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(x+px, y+h*0.38, w-2*px, h*0.24);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, x + w/2, y + h/2);
        ctx.restore();
      }
      // full-white flash overlay drawn last so it covers label background
      if (visFlash>0){
        const a = Math.min(1, visFlash);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x-3, y-3, w+6, h+6);
        ctx.restore();
      }
    }
  }
}