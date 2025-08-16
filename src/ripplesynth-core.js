// src/ripplesynth-core.js
// Clean rebuild: stable zoom, no drift, correct ripple timing, clamped randomization.

import { initToyUI } from './toyui.js';
import { initToySizing, randomizeRects, clamp } from './toyhelpers.js';
import { resizeCanvasForDPR, getCanvasPos, noteList, barSeconds } from './utils.js';
import { makePointerHandlers } from './ripplesynth-input.js';
import { drawWaves } from './ripplesynth-waves.js';
import { drawBlocksSection } from './ripplesynth-blocks.js';
import { initParticles, drawParticles, scaleParticles, reshuffleParticles, setParticleBounds } from './ripplesynth-particles.js';
import { ensureAudioContext, triggerInstrument } from './audio.js';

const DEBUG = false;

const EDGE = 10;
const NUM_CUBES = 5;
const SPRING = 0.10;
const DAMPING = 0.90;
const MAX_V = 480;
const HIT_BAND = 10;
const PENTATONIC = [0,2,4,7,9,12,14,16];

export function createRippleSynth(selector, { title = 'Rippler', defaultInstrument = 'kalimba' } = {}){
  const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector;
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
  const ctx = canvas.getContext('2d', { alpha:false });

  // Sizing
  const sizing = initToySizing(panel, canvas, ctx, { squareFromWidth: true });
  const worldW = () => sizing.vw();
  const worldH = () => sizing.vh();

  // State
  const blocks = makeBlocks(NUM_CUBES); assignPentatonic(blocks);
  randomizeRects(blocks, worldW(), worldH(), EDGE);
  for (const b of blocks){ b.rx=b.x; b.ry=b.y; }
  const ripples = [];
  const hitsFired = new Set();
  const generator = { placed:false, x: worldW()*0.5, y: worldH()*0.5, r: 10 };

  let suppressPointerUntil = 0;
  let particlesInitialized = false;
  let nextLoopAt = null;

  // Input API
  const generatorRef = {
    get x(){ return generator.x; }, get y(){ return generator.y; }, r: generator.r,
    set(x,y){ generator.x=x; generator.y=y; },
    exists(){ return generator.placed; },
    place(x,y){ generator.placed = true; generator.x=x; generator.y=y; }
  };

  const handlers = makePointerHandlers({
    canvas, vw: worldW, vh: worldH,
    EDGE, blocks, ripples, generatorRef, clamp, getCanvasPos, state:{}
  });

  function onPointerDown(e){
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
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', handlers.pointerMove);
  window.addEventListener('pointerup', handlers.pointerUp);

  // Helpers
  function clearRipples(){ ripples.length = 0; hitsFired.clear(); }
  function barDur(){ return (typeof barSeconds === 'function') ? barSeconds() : 2.0; }
  function scheduleNextFrom(startTime){
    const s = (typeof startTime === 'number') ? startTime : performance.now()*0.001;
    nextLoopAt = s + barDur();
  }

  function spawnRipple(quantise=true){
    if (!generator.placed) return null;
    const now = performance.now()*0.001;
    let start = now;
    if (quantise && typeof barSeconds === 'function'){
      const half = Math.max(0.001, (barSeconds()/4)); // half-beat if bar=4 beats
      start = Math.round(now/half)*half;
    }
    const w = worldW(), h = worldH();
    const maxDx = Math.max(generator.x, w - generator.x);
    const maxDy = Math.max(generator.y, h - generator.y);
    const targetR = Math.max(maxDx, maxDy);
    const dur = Math.max(0.001, barDur());
    const ringSpeed = targetR / dur; // reach edge in one bar
    ripples.push({ id: Math.random().toString(36).slice(2), startTime:start, speed:ringSpeed, x:generator.x, y:generator.y });
    if (DEBUG) console.debug('[rippler] spawn', {quantise, start, now, ringSpeed, targetR, dur});
    return start;
  }

  function loopScheduler(now){
    if (!generator.placed) return;
    if (nextLoopAt == null){ nextLoopAt = now + barDur(); }
    if (now + 1/180 >= nextLoopAt){
      const s = spawnRipple(true);
      nextLoopAt = (s ?? now) + barDur();
      if (DEBUG) console.debug('[rippler] loop tick', { now, nextLoopAt, bar: barDur() });
    }
  }

  function clampAllBlocksToBounds(){
    const w = worldW(), h = worldH();
    for (const b of blocks){
      b.x = clamp(b.x, EDGE, Math.max(EDGE, w - EDGE - b.w));
      b.y = clamp(b.y, EDGE, Math.max(EDGE, h - EDGE - b.h));
    }
  }

  // Events
  panel.addEventListener('toy-random', ()=>{
    randomizeRects(blocks, worldW(), worldH(), EDGE);
    assignPentatonic(blocks);
    for (const b of blocks){ b.rx=b.x; b.ry=b.y; b.vx=0; b.vy=0; }
    clampAllBlocksToBounds();
    try { reshuffleParticles(); } catch {}
    if (DEBUG) console.debug('[rippler] randomize blocks + particles');
  });

  panel.addEventListener('toy-reset', ()=>{ clearRipples(); if (DEBUG) console.debug('[rippler] reset'); });

  panel.addEventListener('toy-zoom', (e)=>{
    const zoomed = !!(e?.detail?.zoomed);
    const ratio = sizing.setZoom(zoomed);
    if (ratio !== 1){
      for (const b of blocks){
        b.x*=ratio; b.y*=ratio; b.w*=ratio; b.h*=ratio; b.rx=b.x; b.ry=b.y;
      }
      generator.x *= ratio; generator.y *= ratio; generator.r *= ratio;
      try { scaleParticles(ratio); } catch {}
      clampAllBlocksToBounds();
    }
    // Recompute ripple speeds & progress at new scale
    const now = performance.now()*0.001;
    const w = worldW(), h = worldH();
    try { setParticleBounds(w, h); } catch {}
    const dur = Math.max(0.001, barDur());
    for (const r of ripples){
      const maxDx = Math.max(generator.x, w - generator.x);
      const maxDy = Math.max(generator.y, h - generator.y);
      const targetR = Math.max(maxDx, maxDy);
      const oldR = Math.max(0, (now - r.startTime) * r.speed);
      const newR = oldR * (ratio || 1);
      const newSpeed = targetR / dur;
      r.speed = newSpeed;
      r.startTime = now - (newR / Math.max(1e-6, newSpeed));
    }
    suppressPointerUntil = performance.now() + 150;
  });

  // Draw
  function draw(){
    resizeCanvasForDPR(canvas, ctx);
    const w = worldW(), h = worldH();

    if (!particlesInitialized && w>0 && h>0){ try { initParticles(w, h, EDGE, 56); setParticleBounds(w,h); particlesInitialized = true; } catch {} }

    // bg + border
    ctx.fillStyle = '#0b0f15'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.strokeRect(0.5,0.5,w-1,h-1);

    const now = performance.now()*0.001;

    // waves (visual only; uses its own speed param)
    const visSpeed = Math.max(20, Math.max(w,h) / Math.max(0.001, barDur()));
    drawWaves(ctx, generator.x, generator.y, now, visSpeed, ripples, 16, ()=>Math.max(0.03, barDur()/16));

    // collisions + physics
    updatePhysics(dt());
    checkRippleHits(now);

    // particles & blocks
    drawParticles(ctx, now, ripples, generator);
    drawBlocksSection(ctx, blocks, generator.x, generator.y, ripples, 1.0, noteList, sizing, null, null, now);

    if (generator.placed){
      ctx.fillStyle = '#ff9500';
      ctx.beginPath();
      ctx.arc(generator.x, generator.y, generator.r, 0, Math.PI*2);
      ctx.fill();
    }

    loopScheduler(now);
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  function dt(){
    // simple fixed-step approximation tied to 60fps
    return 1/60;
  }

  function updatePhysics(dt){
    const w = worldW(), h = worldH();
    for (let i=0;i<blocks.length;i++){
      const b = blocks[i];
      const ax = (b.rx - b.x) * SPRING, ay = (b.ry - b.y) * SPRING;
      b.vx = (b.vx + ax) * DAMPING; b.vy = (b.vy + ay) * DAMPING;
      const sp = Math.hypot(b.vx, b.vy); if (sp > MAX_V){ const s = MAX_V/sp; b.vx*=s; b.vy*=s; }
      b.x = clamp(b.x + b.vx*dt, EDGE, w-EDGE-b.w);
      b.y = clamp(b.y + b.vy*dt, EDGE, h-EDGE-b.h);
      if (b.rippleAge != null && b.rippleMax != null){ b.rippleAge = Math.min(b.rippleAge + dt, b.rippleMax); }
    }
  }

  function checkRippleHits(now){
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
    // Clean up hits for old ripples
    hitsFired.forEach((_, key)=>{ const rid = key.split(':')[0]; if (!ripples.find(rp=>rp.id===rid)) hitsFired.delete(key); });
  }

  function onBlockHit(b, now){
    b.flashDur = 0.18; b.flashEnd = now + 0.18; b.rippleAge = 0; b.rippleMax = 0.35;
    const cx = b.x + b.w/2, cy = b.y + b.h/2;
    const dx = cx - generator.x, dy = cy - generator.y; const d = Math.max(1, Math.hypot(dx, dy));
    const KNOCKBACK = 16;
    const k = KNOCKBACK / d; b.vx += dx * k; b.vy += dy * k;
    try { ensureAudioContext(); const note = PENTATONIC[b.noteIndex % PENTATONIC.length] ?? PENTATONIC[0]; triggerInstrument(ui.instrument, note, 0.9); } catch {}
  }

  return { panel, canvas, markPlayingColumn: ()=>{}, ping: ()=>{} };
}

// helpers
function makeBlocks(n){
  const arr = [];
  for (let i=0;i<n;i++){
    arr.push({ x:0,y:0,w:40,h:40, rx:0,ry:0, vx:0,vy:0, rippleAge:999, rippleMax:0, noteIndex:i % PENTATONIC.length });
  }
  return arr;
}
function assignPentatonic(blocks){ for (let i=0;i<blocks.length;i++){ blocks[i].noteIndex = i % PENTATONIC.length; } }
