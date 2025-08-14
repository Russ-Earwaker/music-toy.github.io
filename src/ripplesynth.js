// src/ripplesynth.js — Rippler (recorded loop + JIT scheduling + drag-exempt blocks)
import { noteList, getCanvasPos, clamp, resizeCanvasForDPR } from './utils.js';
import { ensureAudioContext, triggerInstrument, NUM_STEPS, stepSeconds } from './audio.js';
import { initToyUI } from './toyui.js';
import { initToySizing, drawBlock, drawNoteStripsAndLabel, NOTE_BTN_H, hitTopStrip, hitBottomStrip, randomizeRects, EDGE_PAD as EDGE } from './toyhelpers.js';

const BASE_BLOCK_SIZE = 48;
const HIT_COOLDOWN = 0.08;

// --- Notes ---
function noteIndexOf(name){ const i = noteList.indexOf(name); return (i>=0? i : Math.floor(noteList.length/2)); }
const C4_INDEX = noteIndexOf('C4');
const MAJOR_PENT = new Set([0,2,4,7,9]);
function pentIndices(center=C4_INDEX, radius=7){
  const arr=[];
  for (let off=-radius; off<=radius; off++){
    const idx = center + off;
    if (idx<0 || idx>=noteList.length) continue;
    const cls = ((off % 12) + 12) % 12;
    if (MAJOR_PENT.has(cls)) arr.push(idx);
  }
  return arr.length? arr : [center];
}
const PENTA = pentIndices(C4_INDEX, 7);
function randomPent(){ return PENTA[Math.floor(Math.random()*PENTA.length)]; }

export function createRippleSynth(panel){
  // --- Debug ---
  let DEBUG = /ripplerDebug=1/.test(location.search) || localStorage.getItem('ripplerDebug') === '1';
  function dbg(){ if (!DEBUG) return; try { console.log('[Rippler]', ...arguments); } catch {} }
  function dbgGroup(label, data){ if (!DEBUG) return; try { console.groupCollapsed('[Rippler]', label); console.log(data); console.groupEnd(); } catch {} }
  window.addEventListener('keydown', (e)=>{
    if ((e.metaKey || e.ctrlKey || e.shiftKey) && e.key.toLowerCase() === 'd'){
      DEBUG = !DEBUG; localStorage.setItem('ripplerDebug', DEBUG ? '1' : '0');
      console.log('[Rippler] DEBUG', DEBUG ? 'ON' : 'OFF');
    }
  });

  // --- Canvas & UI ---
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
  const ui = initToyUI(shell, { toyName: 'Rippler', defaultInstrument: 'kalimba' });

  // --- Sizing ---
  const sizing = initToySizing(shell, canvas, ctx, { squareFromWidth: true });
  const vw = sizing.vw, vh = sizing.vh;

  // --- World ---
  function makeBlocks(n=5){
    const s = BASE_BLOCK_SIZE;
    const arr = [];
    for (let i=0;i<n;i++){
      arr.push({ x: EDGE+10, y: EDGE+10, w: s, h: s, noteIndex: randomPent(), activeFlash: 0, cooldownUntil: 0 });
    }
    return arr;
  }
  let blocks = makeBlocks(5);
  randomizeRects(blocks, vw(), vh(), EDGE);

  // Generator (user-placed ripple center)
  let generator = null; // { x,y, anchorTime:number, nextTime:number|null }

  // Ripples (for visuals only)
  const ripples = []; // { startTime:number, firedFor:Set<number> }
  let lastLoopStartTime = 0;
  let gridEpoch = null; // stable quantization origin (first loop start)
  let lastQueuedTime = -1; // for de-dup only

  // Recording membership & scheduler state
  let enrolled = new Set();         // blocks included in the recorded loop
  let rejoinNextLoop = new Set();   // blocks to rejoin on next loop after drag
  let scheduledThisLoop = new Set();// which blocks have been scheduled for the current loop
  let currentLoopRippleStart = null;// start time of the ripple for this loop
  const LOOKAHEAD = 0.08;           // seconds of scheduling lookahead

  let lastLoopProcessedAt = null;    // guard against duplicate onLoop processing

  // Precomputed phase offsets for each block (in steps from ripple start)
  let blockPhases = []; // integer steps per block

  // Helpers
  function getCurrentLoopStart(now){
    if (!generator || !generator.anchorTime) return null;
    const loopDur = NUM_STEPS * stepSeconds();
    const tA = generator.anchorTime;
    if (now <= tA + 1e-4) return tA;
    const n = Math.floor((now - tA) / loopDur);
    return tA + n * loopDur;
  }

  function computeSpeed(){
    const q = stepSeconds();
    const loopDur = NUM_STEPS * q;
    if (!generator){
      // fallback: center-to-nearest-edge
      const ccx = vw()/2, ccy = vh()/2;
      const minEdgeDistCenter = Math.min(ccx - EDGE, vw()-EDGE - ccx, ccy - EDGE, vh()-EDGE - ccy);
      return loopDur > 0 ? Math.max(0, minEdgeDistCenter) / loopDur : 0;
    }
    const gx = generator.x, gy = generator.y;
    const maxCorner = Math.max(
      Math.hypot(gx - 0,    gy - 0),
      Math.hypot(gx - vw(), gy - 0),
      Math.hypot(gx - 0,    gy - vh()),
      Math.hypot(gx - vw(), gy - vh())
    );
    return loopDur > 0 ? maxCorner / loopDur : 0;
  }

  function recalcBlockPhases(){
    blockPhases = new Array(blocks.length).fill(0);
    if (!generator) return;
    const q = stepSeconds();
    const speed = computeSpeed();
    const EPS = 1e-6;
    for (let i=0;i<blocks.length;i++){
      const b = blocks[i];
      const bx = b.x + b.w/2, by = b.y + b.h/2;
      const dist = Math.hypot(bx - generator.x, by - generator.y);
      const steps = (speed > 0) ? (dist / (speed * q)) : 0;
      let k = Math.ceil(steps - EPS);
      if (k < 0) k = 0;
      if (k > (NUM_STEPS-1)) k = NUM_STEPS-1;
      blockPhases[i] = k|0;
    }
    dbgGroup('recalcBlockPhases', { blockPhases });
  }

  function quantizeNextStep(now){
    const q = stepSeconds();
    if (gridEpoch != null){
      return gridEpoch + Math.ceil((now - gridEpoch) / q) * q;
    }
    if (lastLoopStartTime){
      return lastLoopStartTime + Math.ceil((now - lastLoopStartTime) / q) * q;
    }
    return Math.ceil(now / q) * q;
  }

  function enqueueRippleAt(t){
    const now = ensureAudioContext().currentTime;
    if (lastQueuedTime >= 0 && Math.abs(t - lastQueuedTime) < 1e-4){ dbg('enqueue dup-skip', {t}); return; }
    ripples.push({ startTime: t, firedFor: new Set() });
    lastQueuedTime = t;
    dbg('enqueue', { t, in: +(t-now).toFixed(3) });
  }

  // Just-in-time scheduler for recorded blocks
  function scheduleDueHits(now){
    if (!generator || currentLoopRippleStart == null) return;
    const t0 = currentLoopRippleStart;
    const q = stepSeconds();
    const windowStart = now - 0.01;
    const windowEnd   = now + LOOKAHEAD;
    for (const i of enrolled){
      if (scheduledThisLoop.has(i)) continue;
      const phase = (blockPhases[i] | 0);
      const tHit = t0 + phase * q;
      if (tHit > windowStart && tHit <= windowEnd){
        const b = blocks[i];
        triggerInstrument(ui.instrument, noteList[b.noteIndex % noteList.length], tHit);
        scheduledThisLoop.add(i);
      }
    }
  }

  // --- Input state ---
  let draggingGen = false;
  let draggingBlock = null;
  const dragOff = { x:0, y:0 };

  function pointerDown(e){
    const p = getCanvasPos(canvas, e);

    // If no generator: place immediately (ignore blocks)
    if (!generator){
      generator = { x: clamp(p.x, EDGE, vw()-EDGE), y: clamp(p.y, EDGE, vh()-EDGE), anchorTime: 0, nextTime: null };
      const now = ensureAudioContext().currentTime;
      const tQ  = quantizeNextStep(now);
      generator.anchorTime = tQ;
      ripples.length = 0;
      recalcBlockPhases();
      // enroll all blocks
      enrolled = new Set(blocks.map((_,i)=>i));
      rejoinNextLoop.clear();
      scheduledThisLoop.clear();
      currentLoopRippleStart = tQ;
      enqueueRippleAt(tQ);
      const loopDur = NUM_STEPS * stepSeconds();
      generator.nextTime = tQ + loopDur;
      e.preventDefault(); return;
    }

    // Block interactions (only once generator exists)
    for (let i = blocks.length-1; i>=0; i--){
      const b = blocks[i];
      if (p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+b.h){
        if (sizing.scale > 1){
          if (hitTopStrip(p, b)){ b.noteIndex = (b.noteIndex + 1) % noteList.length; e.preventDefault(); return; }
          if (hitBottomStrip(p, b)){ b.noteIndex = (b.noteIndex - 1 + noteList.length) % noteList.length; e.preventDefault(); return; }
        }
        draggingBlock = b;
        dragOff.x = p.x - b.x; dragOff.y = p.y - b.y;
        // remove from recording while dragging
        const bi = i;
        enrolled.delete(bi);
        e.preventDefault(); return;
      }
    }

    // Handle drag on generator?
    const r = 12;
    if (p.x>=generator.x-r && p.x<=generator.x+r && p.y>=generator.y-r && p.y<=generator.y+r){
      draggingGen = true;
      dragOff.x = p.x - generator.x; dragOff.y = p.y - generator.y;
      e.preventDefault(); return;
    }

    // Empty space: snap + quantized first hit
    generator.x = clamp(p.x, EDGE, vw()-EDGE);
    generator.y = clamp(p.y, EDGE, vh()-EDGE);
    const now = ensureAudioContext().currentTime;
    const tQ  = quantizeNextStep(now);
    generator.anchorTime = tQ;
    ripples.length = 0;
    recalcBlockPhases();
    enrolled = new Set(blocks.map((_,i)=>i));
    rejoinNextLoop.clear();
    scheduledThisLoop.clear();
    currentLoopRippleStart = tQ;
    enqueueRippleAt(tQ);
    const loopDur = NUM_STEPS * stepSeconds();
    generator.nextTime = tQ + loopDur;
    e.preventDefault();
  }

  function pointerMove(e){
    const p = getCanvasPos(canvas, e);
    if (draggingGen && generator){
      generator.x = clamp(p.x - dragOff.x, EDGE, vw()-EDGE);
      generator.y = clamp(p.y - dragOff.y, EDGE, vh()-EDGE);
      ripples.length = 0; // clear while moving
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
      const tQ  = quantizeNextStep(now);
      generator.anchorTime = tQ;
      recalcBlockPhases();
      enrolled = new Set(blocks.map((_,i)=>i));
      rejoinNextLoop.clear();
      scheduledThisLoop.clear();
      currentLoopRippleStart = tQ;
      enqueueRippleAt(tQ);
      const loopDur = NUM_STEPS * stepSeconds();
      generator.nextTime = tQ + loopDur;
    }
    if (draggingBlock){
      // compute new phase and rejoin in the next loop
      recalcBlockPhases();
      const idx = blocks.indexOf(draggingBlock);
      if (idx >= 0) { rejoinNextLoop.add(idx); }
    }
    draggingBlock = null; draggingGen = false;
  }

  canvas.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', pointerUp);
  window.addEventListener('blur', pointerUp);

  // --- Draw & visuals ---
  let lastDrawTime = 0;
  function draw(){
    resizeCanvasForDPR(canvas, ctx);
    ctx.clearRect(0,0,vw(),vh());
    ctx.fillStyle = '#0b0f15';
    ctx.fillRect(0,0,vw(),vh());
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(0.5,0.5,vw()-1,vh()-1);

    const now = ensureAudioContext().currentTime;
    const prev = lastDrawTime || now;

    const cx = generator ? generator.x : vw()/2;
    const cy = generator ? generator.y : vh()/2;

    // Constant ripple speed: from generator to farthest corner over exactly one loop
    const q = stepSeconds();
    const loopDur = NUM_STEPS * q;
    const speed = computeSpeed();

    // Draw ripples and cull
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    for (let i = ripples.length-1; i>=0; i--){
      const rp = ripples[i];
      const radius = Math.max(0, (now - rp.startTime) * speed);
      const cornerMax = Math.max(
        Math.hypot(cx - 0,    cy - 0),
        Math.hypot(cx - vw(), cy - 0),
        Math.hypot(cx - 0,    cy - vh()),
        Math.hypot(cx - vw(), cy - vh())
      );
      if (radius > cornerMax + 50){ ripples.splice(i,1); continue; }
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI*2); ctx.stroke();
    }
    ctx.restore();

    // Visual hits using crossing-time; if the block is being dragged, also trigger on-the-fly hit
    for (const rp of ripples){
      const r0 = Math.max(0, (prev - rp.startTime) * speed);
      const r1 = Math.max(0, (now  - rp.startTime) * speed);
      for (let bi=0; bi<blocks.length; bi++){
        const b = blocks[bi];
        const bx = b.x + b.w/2, by = b.y + b.h/2;
        const dist = Math.hypot(bx - cx, by - cy);
        const band = Math.max(8, Math.min(b.w, b.h) * 0.25);
        const crossed = (dist + band >= r0) && (dist - band <= r1);
        if (crossed){
          if (!rp.firedFor) rp.firedFor = new Set();
          if (!rp.firedFor.has(bi)){
            rp.firedFor.add(bi);
            b.cooldownUntil = now + HIT_COOLDOWN;
            b.activeFlash = 1.0;
            // If dragging this block, schedule an immediate quantized hit
            if (draggingBlock === b){
              const ls = (gridEpoch != null ? gridEpoch : (lastLoopStartTime || now));
              const stepsDrag = Math.floor((now - ls + 1e-4) / q) + 1;
              const tQdrag = ls + stepsDrag * q;
              triggerInstrument(ui.instrument, noteList[b.noteIndex % noteList.length], tQdrag);
            }
          }
        }
      }
    }

    // Draw blocks
    for (const b of blocks){
      drawBlock(ctx, b, { baseColor: '#ff8c00', active: b.activeFlash > 0 });
      if (sizing.scale > 1){ drawNoteStripsAndLabel(ctx, b, noteList[b.noteIndex % noteList.length]); }
      if (b.activeFlash > 0){
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 * b.activeFlash) + ')';
        ctx.lineWidth = 2 + 3 * b.activeFlash;
        ctx.strokeRect(b.x - 2*b.activeFlash, b.y - 2*b.activeFlash, b.w + 4*b.activeFlash, b.h + 4*b.activeFlash);
        ctx.restore();
        b.activeFlash = Math.max(0, b.activeFlash - 0.06);
      }
    }

    // Debug overlay
    if (DEBUG){
      ctx.save();
      ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const lines = [
        'now: ' + now.toFixed(3),
        'loopStart: ' + (lastLoopStartTime? lastLoopStartTime.toFixed(3) : '—'),
        'epoch: ' + (gridEpoch!=null ? gridEpoch.toFixed(3) : '—'),
        'anchor: ' + (generator && generator.anchorTime ? generator.anchorTime.toFixed(3) : '—'),
        'nextTime: ' + (generator && generator.nextTime != null ? generator.nextTime.toFixed(3) : '—'),
        'loopRippleStart: ' + (currentLoopRippleStart!=null ? currentLoopRippleStart.toFixed(3) : '—'),
      ];
      for (let i=0;i<lines.length;i++) ctx.fillText(lines[i], 8, 14 + i*14);
      ctx.restore();
    }

    // Determine current loop start from anchor and roll state
    const t0 = getCurrentLoopStart(now);
    if (t0 != null){
      // If we've entered a new loop (or just placed), reset per-loop scheduling
      if (currentLoopRippleStart == null || Math.abs(t0 - currentLoopRippleStart) > 1e-4){
        currentLoopRippleStart = t0;
        scheduledThisLoop.clear();
        if (rejoinNextLoop.size){ rejoinNextLoop.forEach(i => enrolled.add(i)); rejoinNextLoop.clear(); }
        // enqueue visual ripple (one per loop)
        if (Math.abs((lastQueuedTime ?? -1) - t0) > 1e-4) enqueueRippleAt(t0);
      }
      // Keep nextTime in sync for overlay
      generator.nextTime = t0 + (NUM_STEPS * stepSeconds());
      // JIT schedule from the recorded loop
      scheduleDueHits(now);
    }
lastDrawTime = now;
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  // --- Panel events ---
  panel.addEventListener('toy-zoom', (e)=>{
    const ratio = sizing.setZoom(!!(e?.detail?.zoomed));
    if (ratio !== 1){
      blocks.forEach(b => { b.x *= ratio; b.y *= ratio; b.w *= ratio; b.h *= ratio; });
      if (generator){ generator.x *= ratio; generator.y *= ratio; }
      recalcBlockPhases();
    }
  });

  panel.addEventListener('toy-random', ()=>{
    randomizeRects(blocks, vw(), vh(), EDGE);
    for (const b of blocks){ b.noteIndex = randomPent(); b.activeFlash = 0; }
    // Full clear: stop any future scheduling
    ripples.length = 0;
    generator = null;
    blockPhases = [];
    enrolled.clear(); rejoinNextLoop.clear(); scheduledThisLoop.clear();
    currentLoopRippleStart = null; lastQueuedTime = -1;
  });

  panel.addEventListener('toy-reset', ()=>{
    ripples.length = 0;
    generator = null;
    blockPhases = [];
    enrolled.clear(); rejoinNextLoop.clear(); scheduledThisLoop.clear();
    currentLoopRippleStart = null; lastQueuedTime = -1;
    for (const b of blocks){ b.noteIndex = C4_INDEX; b.activeFlash = 0; }
  });

  // --- Loop hook ---
  function scheduleLoopRipple(loopStartTime){
    lastLoopStartTime = loopStartTime;
    if (gridEpoch == null) gridEpoch = loopStartTime;
    // No scheduling here; draw() derives loop timing from anchor every frame.
  }
  function onLoop(loopStartTime){ scheduleLoopRipple(loopStartTime); }

  // --- API ---
  function reset(){
    ripples.length = 0;
    generator = null;
    blockPhases = [];
    enrolled.clear(); rejoinNextLoop.clear(); scheduledThisLoop.clear();
    currentLoopRippleStart = null; lastQueuedTime = -1;
    for (const b of blocks){ b.noteIndex = C4_INDEX; b.activeFlash = 0; }
  }
  function setInstrument(_name){ /* via UI */ }
  function destroy(){
    canvas.removeEventListener('pointerdown', pointerDown);
    window.removeEventListener('pointermove', pointerMove);
    window.removeEventListener('pointerup', pointerUp);
    window.removeEventListener('pointercancel', pointerUp);
    window.removeEventListener('blur', pointerUp);
  }

  return { onLoop, reset, setInstrument, destroy };
}