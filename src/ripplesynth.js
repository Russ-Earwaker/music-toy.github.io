// src/ripplesynth.js — Rippler: 5 draggable boxes, up to 3 draggable generators; ripples per loop at X-offset
import { noteList, resizeCanvasForDPR, getCanvasPos, clamp } from './utils.js';
import { ensureAudioContext, triggerInstrument, NUM_STEPS, stepSeconds } from './audio.js';
import { initToyUI } from './toyui.js';
import { drawBlock, drawNoteStripsAndLabel, NOTE_BTN_H, hitTopStrip, hitBottomStrip, clampRectWithin, randomizeRects } from './toyhelpers.js';
import { initToySizing } from './toyhelpers.js';

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
// removed local vw() (using sizing.vw)
// removed local vh() (using sizing.vh)
function makeBlocks(n=5){
    const size = Math.max(32, Math.min(64, Math.floor(Math.min(vw(), vh()) / 4)));
    const arr = [];
    for (let i=0;i<n;i++){
      arr.push({ x: EDGE+10, y: EDGE+10, w: size, h: size, noteIndex: (i*5)%noteList.length, activeFlash: 0 });
    }
    return arr;
  }
  let blocks = makeBlocks(5);
  randomizeRects(blocks, vw(), vh(), EDGE);

  const generators = []; // { x, y, stepOffset }
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

  // --- Interaction ---
  let draggingGen = null;
  let draggingBlock = null;
  let dragDx = 0, dragDy = 0;
  let dragOff = {x:0,y:0};

  function hitGenerator(p){
    for (let i = generators.length-1; i>=0; i--){
      const g = generators[i];
      const dx = p.x - g.x, dy = p.y - g.y;
      if (dx*dx + dy*dy <= 8*8) return { g, idx: i };
    }
    return null;
  }
  function hitBlock(p){
    for (let i = blocks.length-1; i>=0; i--){
      const b = blocks[i];
      if (p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+b.h) return { b, idx: i };
    }
    return null;
  }

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

    // Else create a new generator
    const g = addGenerator(p.x, p.y);
    if (g){
      draggingGen = g; dragDx = 0; dragDy = 0;
    }
    e.preventDefault();
  }

  function pointerMove(e){
    if (!draggingGen && !draggingBlock) return;
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
    resizeCanvasForDPR(canvas, ctx);
    const dpr = window.devicePixelRatio || 1;
    // Clear and paint using full CSS pixel size mapped to backing
    const cssW = canvas._vw || Math.max(1, Math.floor((canvas.width||1)/dpr));
    const cssH = canvas._vh || Math.max(1, Math.floor((canvas.height||1)/dpr));
    ctx.clearRect(0, 0, cssW, cssH);
    // background + border
    ctx.fillStyle = '#0b0f15';
    ctx.fillRect(0, 0, vw(), vh());
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(0.5, 0.5, vw()-1, vh()-1);

    // blocks
    for (const b of blocks){
      drawBlock(ctx, b, { baseColor: '#ff8c00', active: b.activeFlash>0 });
      if (sizing.scale > 1) drawNoteStripsAndLabel(ctx, b, noteList[b.noteIndex]);
      if (b.activeFlash>0) b.activeFlash = Math.max(0, b.activeFlash - 0.06);
    }

    // generators (yellow handle)
    for (const g of generators){
      ctx.beginPath();
      ctx.arc(g.x, g.y, 6, 0, Math.PI*2);
      ctx.fillStyle = '#ffd166';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff44';
      ctx.stroke();
    }

    // ripples
    const now = ensureAudioContext().currentTime;
    for (let i = ripples.length-1; i>=0; i--){
      const r = ripples[i];
      const age = now - r.startTime;
      if (age < 0) continue;
      const speed = Math.max(vw(), vh()) * 0.6;
      const rad = age * speed;

      ctx.beginPath();
      ctx.arc(r.gx, r.gy, rad, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      for (let bi=0; bi<blocks.length; bi++){
        if (r.firedFor.has(bi)) continue;
        const b = blocks[bi];
        const cx = b.x + b.w/2, cy = b.y + b.h/2;
        const dist = Math.hypot(cx - r.gx, cy - r.gy);
        if (Math.abs(dist - rad) < 6){
          triggerInstrument(ui.instrument, noteList[b.noteIndex], now);
          b.activeFlash = 1.0;
          r.firedFor.add(bi);
        }
      }

      if (rad > Math.hypot(vw(), vh())) ripples.splice(i,1);
    }

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  // --- Toy events ---
  shell.addEventListener('toy-random', ()=> {
    if (blocks.length === 0){
      blocks = makeBlocks(5);
    }
    randomizeRects(blocks, vw(), vh(), EDGE);
    for (const b of blocks){ b.noteIndex = Math.floor(Math.random() * noteList.length); }
  });
  shell.addEventListener('toy-reset', ()=> {
    generators.splice(0, generators.length);
    ripples.splice(0, ripples.length);
    blocks.splice(0, blocks.length);
  });
  
  shell.addEventListener('toy-zoom', (e)=>{
    const ratio = sizing.setZoom(!!(e?.detail?.zoomed));
    if (ratio !== 1){
      blocks.forEach(b=>{ b.x*=ratio; b.y*=ratio; b.w*=ratio; b.h*=ratio; });
      generators.forEach(g=>{ g.x*=ratio; g.y*=ratio; });
    }
  });

  // --- Loop Hook ---
  function onLoop(loopStartTime){ scheduleLoopRipples(loopStartTime); }
  function reset(){ generators.splice(0,generators.length); ripples.splice(0,ripples.length); blocks = makeBlocks(5); }
  function setInstrument(name){ /* no-op */ }
  function destroy(){ try{ sizing.disconnect(); }catch{} }

  return { onLoop, reset, setInstrument, element: canvas, destroy };
}
