// src/ripplesynth.js — Rippler (clean build with ASAP click + loop phase from click)
import { noteList, getCanvasPos, clamp, resizeCanvasForDPR } from './utils.js';
import { ensureAudioContext, triggerInstrument, NUM_STEPS, stepSeconds } from './audio.js';
import { initToyUI } from './toyui.js';
import { initToySizing, drawBlock, drawNoteStripsAndLabel, NOTE_BTN_H, hitTopStrip, hitBottomStrip, clampRectWithin, randomizeRects, EDGE_PAD as EDGE } from './toyhelpers.js';

const BASE_BLOCK_SIZE = 48;
const HIT_COOLDOWN = 0.08; // per-block cooldown to avoid double-fires

// --- Note helpers (tight major pentatonic near C4) ---
function noteIndexOf(name){ const i = noteList.indexOf(name); return (i>=0? i : Math.floor(noteList.length/2)); }
const C4_INDEX = noteIndexOf('C4');
const MAJOR_PENT = new Set([0,2,4,7,9]); // semitone classes
function pentIndices(centerIdx=C4_INDEX, radius=7){
  const arr=[];
  for (let off=-radius; off<=radius; off++){
    const idx = centerIdx + off;
    if (idx>=0 && idx<noteList.length){
      const cls = ((off % 12) + 12) % 12;
      if (MAJOR_PENT.has(cls)) arr.push(idx);
    }
  }
  return arr.length? arr : [centerIdx];
}
const PENTA_NEAR_C4 = pentIndices(C4_INDEX, 7);
function randomPent(){ return PENTA_NEAR_C4[Math.floor(Math.random()*PENTA_NEAR_C4.length)]; }

export function createRippleSynth(panel){
  // --- Canvas ---
  const shell  = panel;
  const host   = shell.querySelector('.toy-body') || shell;
  const canvas = (host.querySelector && (host.querySelector('.rippler-canvas') || host.querySelector('canvas'))) || (function(){
    const c = document.createElement('canvas');
    c.className = 'rippler-canvas';
    c.style.display = 'block';
    c.style.touchAction = 'none';
    host.appendChild(c);
    return c;
  })();
  const ctx = canvas.getContext('2d', { alpha:false });

  // --- UI ---
  const ui = initToyUI(shell, { toyName: 'Rippler', defaultInstrument: 'kalimba' });

  // --- Sizing ---
  const sizing = initToySizing(shell, canvas, ctx, { squareFromWidth: true });
  const vw = sizing.vw, vh = sizing.vh;

  // --- World ---
  function makeBlocks(n=5){
    const size = BASE_BLOCK_SIZE;
    const arr = [];
    for (let i=0;i<n;i++){
      arr.push({ x: EDGE+10, y: EDGE+10, w: size, h: size, noteIndex: randomPent(), activeFlash: 0, cooldownUntil: 0 });
    }
    return arr;
  }
  let blocks = makeBlocks(5);
  randomizeRects(blocks, vw(), vh(), EDGE);

  // Single user-placed generator (none at start)
  let generator = null; // { x, y, loopStep:number|null, placedTime:number }

  // Ripples and scheduling
  const ripples = []; // { startTime:number, firedFor:Set<number> }
  let lastLoopStartTime = 0;
  let lastQueuedTime = -1;

  
  // Quantize 'now' to the next half-beat (aligned to lastLoopStartTime if known)
  function quantizeNextStep(now){
    const q = stepSeconds();
    if (lastLoopStartTime){
      return lastLoopStartTime + Math.ceil((now - lastLoopStartTime) / q) * q;
    }
    return Math.ceil(now / q) * q;
  }

  function loopStepFromTime(time, loopStart){
    const q = stepSeconds();
    const steps = Math.round((time - loopStart) / q);
    return ((steps % NUM_STEPS) + NUM_STEPS) % NUM_STEPS;
  }
// Prevent near-duplicate ripples
  function enqueueRippleAt(tQ){
    // Only suppress exact-duplicate timestamps (floating tolerance)
    if (lastQueuedTime >= 0 && Math.abs(tQ - lastQueuedTime) < 1e-4) return;
    ripples.push({ startTime: tQ, firedFor: new Set() });
    lastQueuedTime = tQ;
  }

  // Push a ripple right now (ASAP, no quantization)


  // --- Input state ---
  let draggingGen = false;
  let draggingBlock = null;
  const dragOff = { x:0, y:0 };

  function pointerDown(e){
    const p = getCanvasPos(canvas, e);

    // If no generator yet: place immediately (ignore blocks)
    if (!generator){
      generator = { x: clamp(p.x, EDGE, vw()-EDGE), y: clamp(p.y, EDGE, vh()-EDGE), anchorTime: 0, placedTime: 0 };
      const now = ensureAudioContext().currentTime;
      const tQ = quantizeNextStep(now);
      generator.placedTime = now;
      generator.anchorTime = tQ;
      ripples.length = 0;
      enqueueRippleAt(tQ); // quantized first hit
      e.preventDefault(); return;
    }

    // Blocks first
    for (let i = blocks.length-1; i>=0; i--){
      const b = blocks[i];
      if (p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+b.h){
        if (sizing.scale > 1){
          if (hitTopStrip(p, b)){ b.noteIndex = (b.noteIndex + 1) % noteList.length; e.preventDefault(); return; }
          if (hitBottomStrip(p, b)){ b.noteIndex = (b.noteIndex - 1 + noteList.length) % noteList.length; e.preventDefault(); return; }
        }
        draggingBlock = b;
        dragOff.x = p.x - b.x; dragOff.y = p.y - b.y;
        e.preventDefault(); return;
      }
    }

    // Generator handle?
    const r = 12;
    if (p.x>=generator.x-r && p.x<=generator.x+r && p.y>=generator.y-r && p.y<=generator.y+r){
      draggingGen = true;
      dragOff.x = p.x - generator.x; dragOff.y = p.y - generator.y;
      e.preventDefault(); return;
    }

    // Empty-space: snap generator and fire
    generator.x = clamp(p.x, EDGE, vw()-EDGE);
    generator.y = clamp(p.y, EDGE, vh()-EDGE);
    const now = ensureAudioContext().currentTime;
    const tQ = quantizeNextStep(now);
    generator.anchorTime = tQ;
    ripples.length = 0;
    enqueueRippleAt(tQ);
    e.preventDefault();
  }

  function pointerMove(e){
    const p = getCanvasPos(canvas, e);
    if (draggingGen && generator){
      generator.x = clamp(p.x - dragOff.x, EDGE, vw()-EDGE);
      generator.y = clamp(p.y - dragOff.y, EDGE, vh()-EDGE);
      ripples.length = 0; // clear while moving to avoid overlaps
      e.preventDefault(); return;
    }
    if (draggingBlock){
      draggingBlock.x = clamp(p.x - dragOff.x, EDGE, vw()-EDGE - draggingBlock.w);
      draggingBlock.y = clamp(p.y - dragOff.y, EDGE, vh()-EDGE - draggingBlock.h);
      e.preventDefault(); return;
    }
  }

  function pointerUp(){
    if (draggingGen && generator){
      const now = ensureAudioContext().currentTime;
      const tQ = quantizeNextStep(now);
      generator.anchorTime = tQ;
      enqueueRippleAt(tQ);
    }
    draggingBlock = null; draggingGen = false;
  }

  canvas.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', pointerUp);
  window.addEventListener('blur', pointerUp);

  // --- Drawing & audio ---
  function draw(){
    // clear
    resizeCanvasForDPR(canvas, ctx);
    ctx.clearRect(0,0,vw(),vh());
    // bg
    ctx.fillStyle = '#0b0f15';
    ctx.fillRect(0,0,vw(),vh());
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(0.5,0.5,vw()-1,vh()-1);

    const now = ensureAudioContext().currentTime;

    // Ripple center for drawing
    const hasGen = !!generator;
    const cx = hasGen ? generator.x : vw()/2;
    const cy = hasGen ? generator.y : vh()/2;

    // Constant speed based on CANVAS CENTER to nearest edge over one loop
    const loopDur = NUM_STEPS * stepSeconds();
    const ccx = vw()/2, ccy = vh()/2;
    const minEdgeDistCenter = Math.min(ccx - EDGE, vw()-EDGE - ccx, ccy - EDGE, vh()-EDGE - ccy);
    const speed = loopDur > 0 ? Math.max(0, minEdgeDistCenter) / loopDur : 0;

    // Draw ripples & cull
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    for (let i = ripples.length-1; i>=0; i--){
      const rp = ripples[i];
      const r = Math.max(0, (now - rp.startTime) * speed);
      const cornerMax = Math.max(
        Math.hypot(cx - 0,    cy - 0),
        Math.hypot(cx - vw(), cy - 0),
        Math.hypot(cx - 0,    cy - vh()),
        Math.hypot(cx - vw(), cy - vh())
      );
      if (r > cornerMax + 50){ ripples.splice(i,1); continue; }
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.stroke();
    }
    ctx.restore();

    // Trigger blocks (once per ripple) — quantize hits to next half-beat
    const q = stepSeconds();
    const ls = lastLoopStartTime || now;
    for (const rp of ripples){
      const radius = Math.max(0, (now - rp.startTime) * speed);
      for (let bi=0; bi<blocks.length; bi++){
        const b = blocks[bi];
        const bx = b.x + b.w/2, by = b.y + b.h/2;
        const dist = Math.hypot(bx - cx, by - cy);
        const threshold = Math.max(8, Math.min(b.w, b.h) * 0.25);
        if (Math.abs(dist - radius) < threshold){
          if (!rp.firedFor) rp.firedFor = new Set();
          if (!rp.firedFor.has(bi)){
            const steps = Math.ceil((now - ls) / q);
            const tQ = ls + steps * q;
            triggerInstrument(ui.instrument, noteList[b.noteIndex % noteList.length], tQ);
            rp.firedFor.add(bi);
            b.cooldownUntil = now + HIT_COOLDOWN;
            b.activeFlash = 1.0;
          }
        }
      }
    }

    // Draw blocks
    for (const b of blocks){
      drawBlock(ctx, b, { baseColor: '#ff8c00', active: b.activeFlash > 0 });
      if (sizing.scale > 1){ drawNoteStripsAndLabel(ctx, b, noteList[b.noteIndex % noteList.length]); }
      if (b.activeFlash > 0){
        // Extra activation pulse
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 * b.activeFlash) + ')';
        ctx.lineWidth = 2 + 3 * b.activeFlash;
        ctx.strokeRect(b.x - 2*b.activeFlash, b.y - 2*b.activeFlash, b.w + 4*b.activeFlash, b.h + 4*b.activeFlash);
        ctx.restore();
        b.activeFlash = Math.max(0, b.activeFlash - 0.06);
      }
    }

    // Draw generator handle
    if (generator){
      ctx.save();
      ctx.strokeStyle = '#ffd95e';
      ctx.fillStyle = 'rgba(255,217,94,0.15)';
      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  // --- UI Events ---
  panel.addEventListener('toy-zoom', (e)=>{
    const ratio = sizing.setZoom(!!(e?.detail?.zoomed));
    if (ratio !== 1){
      blocks.forEach(b => { b.x *= ratio; b.y *= ratio; b.w *= ratio; b.h *= ratio; });
      if (generator){ generator.x *= ratio; generator.y *= ratio; }
    }
  });

  panel.addEventListener('toy-random', ()=>{
    randomizeRects(blocks, vw(), vh(), EDGE);
    for (const b of blocks){ b.noteIndex = randomPent(); b.activeFlash = 0; }
  });

  panel.addEventListener('toy-reset', ()=>{
    ripples.length = 0;
    generator = null;
    for (const b of blocks){ b.noteIndex = C4_INDEX; b.activeFlash = 0; }
  });

  
  // Loop scheduler: anchor-based (exactly 1 loop after the first)
  function scheduleLoopRipple(loopStartTime){
    lastLoopStartTime = loopStartTime;
    if (!generator || !generator.anchorTime) return;
    const q = stepSeconds();
    const loopDur = NUM_STEPS * q;
    const anchor = generator.anchorTime;
    // Compute the next occurrence strictly after the current loopStart (unless anchor is still ahead)
    let n = Math.floor((loopStartTime - anchor) / loopDur) + 1;
    if (loopStartTime < anchor) n = 0; // anchor is still upcoming in this loop
    const t = anchor + Math.max(0, n) * loopDur;
    enqueueRippleAt(t);
  }
// --- Loop hook ---
  function onLoop(loopStartTime){ scheduleLoopRipple(loopStartTime); }

  // API
  function reset(){ ripples.length = 0; generator = null; for (const b of blocks){ b.noteIndex = C4_INDEX; b.activeFlash = 0; } }
  function setInstrument(_name){ /* managed by UI */ }
  function destroy(){
    canvas.removeEventListener('pointerdown', pointerDown);
    window.removeEventListener('pointermove', pointerMove);
    window.removeEventListener('pointerup', pointerUp);
    window.removeEventListener('pointercancel', pointerUp);
    window.removeEventListener('blur', pointerUp);
  }

  return { onLoop, reset, setInstrument, destroy };
}