// src/ripplesynth-core.js
// Ripple synth toy core — stable zoom, solid loop timing, particles, <400 lines.

import { initToyUI } from './toyui.js';
import { initToySizing, randomizeRects, clamp } from './toyhelpers.js';
import { resizeCanvasForDPR, getCanvasPos, noteList } from './utils.js';
import { makePointerHandlers } from './ripplesynth-input.js';
import { drawWaves } from './ripplesynth-waves.js';
import { drawBlocksSection } from './ripplesynth-blocks.js';
import { initParticles, drawParticles, scaleParticles, reshuffleParticles } from './ripplesynth-particles.js';
import { ensureAudioContext, triggerInstrument, beatSeconds, barSeconds } from './audio.js';

const EDGE = 10, NUM_CUBES = 5;
const LOOP_FALLBACK_SEC = 4, HIT_BAND = 8;
const KNOCKBACK = 16, SPRING = 0.11, DAMPING = 0.90, MAX_V = 250;
const PENTATONIC = ['C4','D4','E4','G4','A4'];

export function createRippleSynth(selector, { title='Rippler', defaultInstrument='kalimba' } = {}){
  const shell = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!shell) { console.warn('[rippler] missing selector', selector); return null; }

  const panel = shell.closest?.('.toy-panel') || shell;
  const ui = initToyUI(panel, { toyName: title, defaultInstrument });

  // Canvas
  const body = panel.querySelector('.toy-body') || panel;
  let canvas = body.querySelector('canvas.rippler-canvas');
  if (!canvas){
    canvas = document.createElement('canvas');
    canvas.className = 'rippler-canvas';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    body.appendChild(canvas);
  }
  const ctx = canvas.getContext('2d', { alpha: false });

  // Sizing baseline (square from width)
  initToySizing(panel, canvas, ctx, { squareFromWidth: true });
  let zoomFactor = 1;
  let logicalSide = 0;

  // State
  const blocks = makeBlocks(NUM_CUBES); assignPentatonic(blocks);
  const ripples = []; const hitsFired = new Set();
  const generator = { placed:false, x:0, y:0, r:12 };
  let suppressPointerUntil = 0;
  let particlesInitialized = false;
  let nextLoopAt = null; // seconds

  // Input API
  const generatorRef = {
    get x(){ return generator.x; }, get y(){ return generator.y; }, r: generator.r,
    set(x,y){ generator.x=x; generator.y=y; },
    exists(){ return generator.placed; },
    place(x,y){ generator.placed = true; generator.x=x; generator.y=y; }
  };

  const handlers = makePointerHandlers({
    canvas, vw: () => logicalSide || canvas.clientWidth || 1, vh: () => logicalSide || canvas.clientHeight || 1,
    EDGE, blocks, ripples, generatorRef, clamp, getCanvasPos, state:{}
  });

  const onPointerDown = (e)=>{
    if (performance.now() < suppressPointerUntil) return;
    const wasPlaced = generator.placed;
    handlers.pointerDown(e);
    if (!wasPlaced && generator.placed){
      clearRipples();
      const s = spawnRipple(false); // immediate first
      scheduleNextFrom(s);
    } else if (wasPlaced){
      clearRipples();
      const s = spawnRipple(true);  // quantised
      scheduleNextFrom(s);
    }
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', handlers.pointerMove);
  window.addEventListener('pointerup', handlers.pointerUp);

  // Helpers
  function clearRipples(){ ripples.length = 0; hitsFired.clear(); }

  function barDur(){ return (typeof barSeconds === 'function') ? barSeconds() : LOOP_FALLBACK_SEC; }

  function scheduleNextFrom(startTime){
    const s = (typeof startTime === 'number') ? startTime : performance.now()*0.001;
    nextLoopAt = s + barDur();
  }

  function spawnRipple(quantise=true){
    if (!generator.placed) return null;
    const now = performance.now()*0.001;
    let start = now;
    if (quantise && typeof beatSeconds === 'function'){
      const half = Math.max(0.001, beatSeconds()*0.5);
      start = Math.round(now/half)*half;
    }
    ripples.push({ id: Math.random().toString(36).slice(2), startTime:start, speed:120, x:generator.x, y:generator.y });
    return start;
  }

  function loopScheduler(now){
    if (!generator.placed) return;
    if (nextLoopAt == null){ nextLoopAt = now + barDur(); }
    // Small epsilon for frame granularity
    if (now + 1/180 >= nextLoopAt){
      const s = spawnRipple(true);
      nextLoopAt = (s ?? now) + barDur();
    }
  }

  function updatePhysics(dt){
    const w = logicalSide || canvas.clientWidth || 1, h = w; // square
    for (let i=0;i<blocks.length;i++){
      const b = blocks[i];
      const ax = (b.rx - b.x) * SPRING, ay = (b.ry - b.y) * SPRING;
      b.vx = (b.vx + ax) * DAMPING; b.vy = (b.vy + ay) * DAMPING;
      const sp = Math.hypot(b.vx, b.vy); if (sp > MAX_V){ const s = MAX_V/sp; b.vx*=s; b.vy*=s; }
      b.x = clamp(b.x + b.vx*dt, EDGE, w-EDGE-b.w);
      b.y = clamp(b.y + b.vy*dt, EDGE, h-EDGE-b.h);
      if (b.rippleAge != null && b.rippleMax != null){ b.rippleAge = Math.min(b.rippleAge + dt, b.rippleMax); }
    }
    hitsFired.forEach((_, key)=>{ const rid = key.split(':')[0]; if (!ripples.find(r=>r.id===rid)) hitsFired.delete(key); });
  }

  function detectHits(now){
    for (let rIndex=0; rIndex<ripples.length; rIndex++){
      const r = ripples[rIndex]; const radius = Math.max(0, (now - r.startTime) * r.speed);
      for (let i=0;i<blocks.length;i++){
        const b = blocks[i], cx = b.x + b.w/2, cy = b.y + b.h/2;
        const dist = Math.hypot(cx - r.x, cy - r.y);
        if (Math.abs(dist - radius) <= HIT_BAND){
          const key = r.id+':'+i;
          if (!hitsFired.has(key)){ hitsFired.add(key); onBlockHit(b, now); }
        }
      }
    }
  }

  function onBlockHit(b, now){
    b.flashDur = 0.18; b.flashEnd = now + 0.18; b.rippleAge = 0; b.rippleMax = 0.35;
    const cx = b.x + b.w/2, cy = b.y + b.h/2;
    const dx = cx - generator.x, dy = cy - generator.y; const d = Math.max(1, Math.hypot(dx, dy));
    const k = KNOCKBACK / d; b.vx += dx * k; b.vy += dy * k;
    try{ ensureAudioContext(); const note = PENTATONIC[b.noteIndex % PENTATONIC.length] || PENTATONIC[0]; triggerInstrument(ui.instrument, note, 0.9); }catch{}
  }

  function sizeCanvasBox(){
    // Canvas scales with zoomFactor (like bouncer), clamped to visible viewport to avoid page stretch
    const bw = body.clientWidth || 1;
    const desired = Math.round(bw * zoomFactor);
    const panelTop = panel.getBoundingClientRect ? panel.getBoundingClientRect().top : 0;
    const available = Math.max(200, (window.innerHeight || desired) - panelTop - 24);
    const side = Math.min(desired, available);
    logicalSide = side;
    canvas.style.width = side+'px'; canvas.style.height = side+'px';
    resizeCanvasForDPR(canvas, side, side);
  }

  function drawBackground(w,h){
    const g = ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,'#0b0b0b'); g.addColorStop(1,'#000');
    ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.strokeRect(0.5,0.5,w-1,h-1);
  }

  function draw(){
    const now = performance.now()*0.001;
    sizeCanvasBox();
    const w = logicalSide || canvas.clientWidth || 1, h = w;

    if (!particlesInitialized && w>0 && h>0){ try { initParticles(w, h, EDGE, 56); } catch {} particlesInitialized = true; }

    loopScheduler(now);
    updatePhysics(1/60);
    detectHits(now);

    drawBackground(w,h);
    drawWaves(ctx, generator.x, generator.y, now, 120, ripples, 16, ()=> (typeof barSeconds==='function' ? barSeconds()/16 : LOOP_FALLBACK_SEC/16));
    try { drawParticles(ctx, now, ripples, generator); } catch {}
    drawBlocksSection(ctx, blocks, generator.x, generator.y, ripples, 1.0, noteList, null, null, null, now);

    if (generator.placed){ ctx.fillStyle = '#ff9500'; ctx.beginPath(); ctx.arc(generator.x, generator.y, generator.r, 0, Math.PI*2); ctx.fill(); }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  // UI
  panel.addEventListener('toy-random', ()=>{
    randomizeRects(blocks, logicalSide||480, logicalSide||480, EDGE);
    assignPentatonic(blocks);
    for (const b of blocks){ b.rx=b.x; b.ry=b.y; b.vx=0; b.vy=0; }
    try { reshuffleParticles(); } catch {}
  });

  panel.addEventListener('toy-reset', ()=>{ clearRipples(); });

  panel.addEventListener('toy-zoom', (ev)=>{
    const newZ = !!(ev?.detail?.zoomed) ? 2 : 1;
    const ratio = newZ / zoomFactor;
    const side = logicalSide || canvas.clientWidth || 1;
    const cx = side * 0.5, cy = cx;

    for (const b of blocks){
      b.x = cx + (b.x - cx) * ratio;
      b.y = cy + (b.y - cy) * ratio;
      b.rx = cx + (b.rx - cx) * ratio;
      b.ry = cy + (b.ry - cy) * ratio;
      b.w *= ratio; b.h *= ratio;
      b.vx = (b.vx * ratio) * 0.25;
      b.vy = (b.vy * ratio) * 0.25;
      b.x = clamp(b.x, EDGE, side-EDGE-b.w);
      b.y = clamp(b.y, EDGE, side-EDGE-b.h);
    }
    if (generator.placed){
      generator.x = cx + (generator.x - cx)*ratio;
      generator.y = cy + (generator.y - cy)*ratio;
      generator.r *= ratio;
    }
    try { scaleParticles(ratio); } catch {}

    zoomFactor = newZ;
    // re-size canvas to match the new zoom factor (clamped to viewport)
    sizeCanvasBox();
    suppressPointerUntil = performance.now() + 200;
  });

  return { panel, canvas, markPlayingColumn: ()=>{}, ping: ()=>{} };
}

// helpers
function makeBlocks(n){
  const arr = [];
  for (let i=0;i<n;i++){
    arr.push({ x:0,y:0,w:40,h:40, rx:0,ry:0, vx:0,vy:0, rippleAge:999, rippleMax:0, noteIndex:i % PENTATONIC.length });
  }
  randomizeRects(arr, 480, 480, EDGE);
  for (const b of arr){ b.rx=b.x; b.ry=b.y; }
  return arr;
}
function assignPentatonic(blocks){ for (let i=0;i<blocks.length;i++){ blocks[i].noteIndex = i % PENTATONIC.length; } }
