// src/ripplesynth.js — Rippler: 5 draggable boxes, up to 3 draggable generators; ripples per loop at X-offset
import { noteList, resizeCanvasForDPR, getCanvasPos, clamp } from './utils.js';
import { ensureAudioContext, triggerInstrument, NUM_STEPS, stepSeconds } from './audio.js';
import { initToyUI } from './toyui.js';
import { drawBlock, drawNoteStripsAndLabel, NOTE_BTN_H, hitTopStrip, hitBottomStrip, clampRectWithin, randomizeRects } from './toyhelpers.js';
import { initToySizing } from './toyhelpers.js';

const BASE_BLOCK_SIZE = 48;

export function createRippleSynth(panel){
  // --- Canvas & UI ---
  const shell  = panel;
  const host = shell.querySelector('.toy-body') || shell;
  const canvas = (host.querySelector && (host.querySelector('.rippler-canvas') || host.querySelector('canvas'))) || (function(){
    const c = document.createElement('canvas');
    c.className='rippler-canvas';
    c.style.display = 'block';
    c.style.touchAction = 'none';
    host.appendChild(c); return c;
  })();
  const ctx = canvas.getContext('2d', { alpha:false });

  const ui = initToyUI(shell, { toyName: 'Rippler', defaultInstrument: 'tone' });

  // --- Sizing (shared) ---
  const sizing = initToySizing(shell, canvas, ctx, { squareFromWidth: true });
  const vw = sizing.vw, vh = sizing.vh;

  // --- World & Entities ---
  const EDGE = 6;
  function makeBlocks(n=5){
    const size = BASE_BLOCK_SIZE;
    const arr = [];
    for (let i=0;i<n;i++){
      arr.push({ x: EDGE+10, y: EDGE+10, w: size, h: size, noteIndex: (i*5)%noteList.length, activeFlash: 0, cooldownUntil: 0 });
    }
    return arr;
  }
  let blocks = makeBlocks(5);
  randomizeRects(blocks, vw(), vh(), EDGE);

  const generators = []; // { x, y, stepOffset }
  const HIT_COOLDOWN = 0.08; // seconds between hits per block
  const ripples = [];    // { gx, gy, startTime, firedFor:Set(idx) }

  function xToStep(x){
    const usable = Math.max(1, vw() - EDGE*2);
    const t = clamp((x - EDGE) / usable, 0, 0.9999);
    return Math.floor(t * NUM_STEPS);
  }

  function addGenerator(x, y){
    if (generators.length >= 3) return null;
    const g = { x: clamp(x, EDGE, vw()-EDGE), y: clamp(y, EDGE, vh()-EDGE), stepOffset: 0 };
    g.stepOffset = xToStep(g.x);
    generators.push(g);
    // fire a ripple immediately
    const now = ensureAudioContext().currentTime;
    ripples.push({ gx: g.x, gy: g.y, startTime: now, firedFor: new Set() });
    return g;
  }

  function scheduleLoopRipples(loopStartTime){
    const ss = stepSeconds();
    for (const g of generators){
      ripples.push({ gx: g.x, gy: g.y, startTime: loopStartTime + g.stepOffset * ss, firedFor: new Set() });
    }
  }

  function hitBlock(p){
    for (let i = blocks.length-1; i>=0; i--){
      const b = blocks[i];
      if (p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+b.h) return { b, idx: i };
    }
    return null;
  }

  function hitGenerator(p){
    for (let i = generators.length-1; i>=0; i--){
      const g = generators[i];
      const r = 9;
      if (p.x>=g.x-r && p.x<=g.x+r && p.y>=g.y-r && p.y<=g.y+r) return { g, idx: i };
    }
    return null;
  }

  // --- Pointer interactions ---
  let draggingGen = null, dragDx = 0, dragDy = 0;
  let draggingBlock = null, dragOff = {x:0,y:0};

  function pointerDown(e){
    const p = getCanvasPos(canvas, e);

    // Box first: drag (and note arrows in zoom)
    const hb = hitBlock(p);
    if (hb){
      const b = hb.b;
      if (sizing.scale > 1){
        if (hitTopStrip(p, b)){ b.noteIndex = (b.noteIndex + 1) % noteList.length; e.preventDefault(); return; }
        if (hitBottomStrip(p, b)){ b.noteIndex = (b.noteIndex - 1 + noteList.length) % noteList.length; e.preventDefault(); return; }
      }
      draggingBlock = b;
      dragOff = { x: p.x - b.x, y: p.y - b.y };
      e.preventDefault(); return;
    }

    // Generator second: drag
    const hg = hitGenerator(p);
    if (hg){
      draggingGen = hg.g;
      dragDx = p.x - draggingGen.x; dragDy = p.y - draggingGen.y;
      e.preventDefault(); return;
    }

    // Else: create a generator on click (limit 3)
    if (generators.length < 3){
      addGenerator(p.x, p.y);
      e.preventDefault(); return;
    }
  }
  function pointerMove(e){
    const p = getCanvasPos(canvas, e);
    if (draggingGen){
      draggingGen.x = clamp(p.x - dragDx, EDGE, vw()-EDGE);
      draggingGen.y = clamp(p.y - dragDy, EDGE, vh()-EDGE);
      draggingGen.stepOffset = xToStep(draggingGen.x);
    } else if (draggingBlock){
      draggingBlock.x = clamp(p.x - dragOff.x, EDGE, vw()-EDGE - draggingBlock.w);
      draggingBlock.y = clamp(p.y - dragOff.y, EDGE, vh()-EDGE - draggingBlock.h);
    }
    e.preventDefault();
  }
  function pointerUp(e){
    draggingGen = null; draggingBlock = null;
  }

  canvas.addEventListener('mousedown', pointerDown);
  canvas.addEventListener('mousemove', pointerMove);
  window.addEventListener('mouseup', pointerUp);
  canvas.addEventListener('touchstart', pointerDown, { passive:false });
  canvas.addEventListener('touchmove', pointerMove, { passive:false });
  window.addEventListener('touchend', pointerUp);

  // --- Draw ---
  function draw(){
    resizeCanvasForDPR(canvas, ctx);
    const dpr = window.devicePixelRatio || 1;
    // Clear and paint using full CSS pixel size mapped to backing
    const cssW = Math.max(1, Math.floor((canvas.width||1)/dpr));
    const cssH = Math.max(1, Math.floor((canvas.height||1)/dpr));
    ctx.clearRect(0, 0, cssW, cssH);
    // background + border
    ctx.fillStyle = '#0b0f15';
    ctx.fillRect(0, 0, vw(), vh());
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(0.5, 0.5, vw()-1, vh()-1);

    const now = ensureAudioContext().currentTime;

    // ripples
    const speed = Math.max(vw(), vh()) * 0.75; // px per second
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    for (let i = ripples.length-1; i>=0; i--){
      const r = (now - ripples[i].startTime) * speed;
      if (r > Math.max(vw(), vh()) * 1.5){ ripples.splice(i,1); continue; }
      ctx.beginPath();
      ctx.arc(ripples[i].gx, ripples[i].gy, Math.max(1, r), 0, Math.PI*2);
      ctx.stroke();
    }
    ctx.restore();

    // trigger notes when ripple crosses a block center
    for (let ri = 0; ri < ripples.length; ri++){
      const rp = ripples[ri];
      const radius = (now - rp.startTime) * speed;
      for (let bi = 0; bi < blocks.length; bi++){
        const b = blocks[bi];
        const cx = b.x + b.w/2, cy = b.y + b.h/2;
        const dist = Math.hypot(cx - rp.gx, cy - rp.gy);
        if (Math.abs(dist - radius) < Math.max(8, Math.min(b.w, b.h) * 0.25)){
          if (!rp.firedFor.has(bi)){
            rp.firedFor.add(bi);
            if (now >= (b.cooldownUntil||0)) { triggerInstrument(ui.instrument, noteList[b.noteIndex % noteList.length], now); b.cooldownUntil = now + HIT_COOLDOWN; }
            b.activeFlash = 1.0;
          }
        }
      }
    }

    // boxes
    for (const b of blocks){
      drawBlock(ctx, b, { baseColor: '#ff8c00', active: b.activeFlash > 0 });
      if (sizing.scale > 1){
        drawNoteStripsAndLabel(ctx, b, noteList[b.noteIndex % noteList.length]);
      }
      if (b.activeFlash > 0){ b.activeFlash = Math.max(0, b.activeFlash - 0.04); }
    }

    // generators
    ctx.save();
    for (const g of generators){
      ctx.strokeStyle = '#ffd95e';
      ctx.fillStyle = 'rgba(255,217,94,0.15)';
      ctx.beginPath();
      ctx.arc(g.x, g.y, 9, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  // --- Events from header ---
  panel.addEventListener('toy-zoom', (e)=>{
    const ratio = sizing.setZoom(!!(e?.detail?.zoomed));
    if (ratio !== 1){
      blocks.forEach(b=>{ b.x*=ratio; b.y*=ratio; b.w*=ratio; b.h*=ratio; });
      generators.forEach(g=>{ g.x*=ratio; g.y*=ratio; });
      ripples.forEach(rp=>{ rp.gx*=ratio; rp.gy*=ratio; });
    }
  });

  panel.addEventListener('toy-random', ()=>{
    // If blocks were cleared, recreate; otherwise randomize positions
    if (!blocks || !blocks.length){ blocks = makeBlocks(5); }
    randomizeRects(blocks, vw(), vh(), EDGE);
    for (const b of blocks){ b.noteIndex = Math.floor(Math.random()*noteList.length); b.activeFlash = 0; }
  });

  panel.addEventListener('toy-reset', ()=>{
    generators.splice(0, generators.length);
    ripples.splice(0, ripples.length);
    blocks.splice(0, blocks.length); // clear everything
  });

  // --- Loop Hook ---
  function onLoop(loopStartTime){ scheduleLoopRipples(loopStartTime); }
  function reset(){ generators.splice(0,generators.length); ripples.splice(0,ripples.length); blocks = makeBlocks(5); }
  function setInstrument(name){ /* no-op */ }
  function destroy(){ /* nothing to disconnect here */ }

  return { onLoop, reset, setInstrument, element: canvas, destroy };
}
