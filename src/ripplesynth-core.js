// src/ripplesynth-core.js — clean structured build

import { initToyUI } from './toyui.js';
import { initToySizing, randomizeRects, clamp } from './toyhelpers.js';
import { resizeCanvasForDPR, getCanvasPos, noteList, barSeconds } from './utils.js';
import { makePointerHandlers } from './ripplesynth-input.js';
import { drawWaves } from './ripplesynth-waves.js';
import { drawBlocksSection } from './ripplesynth-blocks.js';
import { initParticles, drawParticles, scaleParticles, reshuffleParticles, setParticleBounds } from './ripplesynth-particles.js';
import { ensureAudioContext, triggerInstrument } from './audio.js';

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

  // Loop / particles / time
  let suppressPointerUntil = 0;
  let particlesInitialized = false;
  let nextLoopAt = null;
  let lastZoomAt = 0;

  // Loop recorder
  let loopRecording = true;
  let playbackActive = false;
  let loopStartAt = null;
  let loopEvents = [];
  let playbackPrevT = 0;
  const mutedBlocks = new Set();
  const recordArm = new Set();
  let lastDragIdx = null;
  let skipPlaybackFrame = false;

  let justWrapped = false;
  // Input handlers
  const inputState = { dragIndex: -1, dragOff:{x:0,y:0} };
  const generatorRef = {
    get x(){ return generator.x; }, get y(){ return generator.y; }, r: generator.r,
    get placed(){ return generator.placed; },
    set(x,y){ generator.x = x; generator.y = y; },
    exists(){ return generator.placed; },
    place(x,y){
      generator.placed = true; generator.x=x; generator.y=y;
      loopRecording = true; playbackActive = false; loopEvents = []; recordArm.clear();
      mutedBlocks.clear(); loopStartAt = null; nextLoopAt = null;
    }
  };
  const handlers = makePointerHandlers({
    canvas, vw: worldW, vh: worldH,
    EDGE, blocks, ripples, generatorRef, clamp, getCanvasPos, state: inputState
  });

  // ---- helpers INSIDE factory ----
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
      const step = Math.max(0.001, barDur()/8);
      start = Math.round(now/step)*step;
    }
    const w = worldW(), h = worldH();
    const maxDx = Math.max(generator.x, w - generator.x);
    const maxDy = Math.max(generator.y, h - generator.y);
    const targetR = Math.max(maxDx, maxDy);
    const dur = Math.max(0.001, barDur());
    const ringSpeed = targetR / dur;
    ripples.push({ id: Math.random().toString(36).slice(2), startTime:start, speed:ringSpeed, x:generator.x, y:generator.y });
    return start;
  }

  function loopScheduler(now){
    if (!generator.placed) return;
    if (inputState && inputState.draggingGenerator) return;
    const bar = Math.max(0.001, barDur());
    if (nextLoopAt == null){ nextLoopAt = now + bar; if (loopStartAt == null) loopStartAt = now; }
    if (now + 1/180 >= nextLoopAt){
      const s = spawnRipple(true);
      const anchor = (typeof s === 'number') ? s : now;
      loopStartAt = anchor;
      nextLoopAt = anchor + bar;

      justWrapped = true;
      if (loopRecording){
        loopRecording = false; playbackActive = true;
      } else if (recordArm.size){
        const armed = new Set(recordArm);
        const kept = loopEvents.filter(ev => !armed.has(ev.idx));
        const recent = loopEvents.filter(ev => armed.has(ev.idx));
        loopEvents = kept.concat(recent);
        recordArm.clear();
      }
      // playbackPrevT preserved across wraps
      skipPlaybackFrame = true;
    }

    if (playbackActive && loopEvents.length){
      if (skipPlaybackFrame){ skipPlaybackFrame = false; return; }
      const tNow = (now - loopStartAt);
      const curT = ((tNow % bar) + bar) % bar;
      const prevT = playbackPrevT;
      if (justWrapped) { playbackPrevT = curT; justWrapped = false; return; }
      if (curT >= prevT){
        for (const ev of loopEvents){
          if (ev.t > prevT && ev.t <= curT && !mutedBlocks.has(ev.idx)){
            const b = blocks[ev.idx]; if (b) onBlockHit(b, now);
          }
        }
      } else {
        for (const ev of loopEvents){
          if ((ev.t > prevT && ev.t <= bar) || (ev.t >= 0 && ev.t <= curT)){
            if (!mutedBlocks.has(ev.idx)){ const b = blocks[ev.idx]; if (b) onBlockHit(b, now); }
          }
        }
      }
      playbackPrevT = curT;
    }
  }

  function clampAllBlocksToBounds(){
    const w = worldW(), h = worldH();
    for (const b of blocks){
      b.x = clamp(b.x, EDGE, Math.max(EDGE, w - EDGE - b.w));
      b.y = clamp(b.y, EDGE, Math.max(EDGE, h - EDGE - b.h));
    }
  }

  function onBlockHit(b, now){
    // brighten immediately
    b.flashDur = 0.12;
    b.flashEnd = now + b.flashDur;
    b.rippleAge = 0;
    b.rippleMax = 0.25;
    // push-back
    const KNOCKBACK = 28;
    const cx = b.x + b.w/2, cy = b.y + b.h/2;
    const dx = cx - generator.x, dy = cy - generator.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const k = KNOCKBACK / d;
    b.vx += dx * k; b.vy += dy * k;

    // record into loop (normalized)
    const idx = blocks.indexOf(b);
    if (idx >= 0 && loopStartAt != null){
      const bar = Math.max(0.001, barDur());
      const t = ((now - loopStartAt) % bar + bar) % bar;
      if (loopRecording || recordArm.has(idx)) loopEvents.push({ t, idx });
    }

    // trigger note
    try {
      ensureAudioContext();
      const note = noteList[b.noteIndex % noteList.length];
      triggerInstrument(ui.instrument, note, 0.9);
    } catch (e) { console.warn('triggerInstrument failed', e); }
  }

  function catchUpHits(now){
    const WIDEN = 2.5;
    for (let rIndex=0; rIndex<ripples.length; rIndex++){
      const r = ripples[rIndex]; const radius = Math.max(0, (now - r.startTime) * r.speed);
      for (let i=0;i<blocks.length;i++){
        const b = blocks[i], cx = b.x + b.w/2, cy = b.y + b.h/2;
        const dist = Math.hypot(cx - r.x, cy - r.y);
        if (Math.abs(dist - radius) <= HIT_BAND*WIDEN){
          const key = r.id+':'+i;
          if (!hitsFired.has(key)){ hitsFired.add(key); onBlockHit(b, now); }
        }
      }
    }
    hitsFired.forEach((_, key)=>{ const rid = key.split(':')[0]; if (!ripples.find(rp=>rp.id===rid)) hitsFired.delete(key); });
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
    hitsFired.forEach((_, key)=>{ const rid = key.split(':')[0]; if (!ripples.find(rp=>rp.id===rid)) hitsFired.delete(key); });
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

  // Pointer
  function onPointerDown(e){
    if (performance.now() < suppressPointerUntil) return;
    lastDragIdx = null;
    const wasPlaced = generator.placed;
    handlers.pointerDown(e);
    if (typeof inputState.dragIndex === 'number' && inputState.dragIndex >= 0){
      mutedBlocks.add(inputState.dragIndex);
      lastDragIdx = inputState.dragIndex;
    }
    if (!wasPlaced && generator.placed){
      clearRipples();
      const s = spawnRipple(false); scheduleNextFrom(s); if (loopStartAt == null) loopStartAt = s;
    }
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', handlers.pointerMove);
  window.addEventListener('pointerup', (e)=>{
    handlers.pointerUp(e);
    if (inputState && inputState.generatorDragEnded){
      clearRipples();
      const s = spawnRipple(true);
      loopEvents = []; recordArm.clear();
      playbackActive = false; loopRecording = true;
      playbackPrevT = 0;
      skipPlaybackFrame = true;
      scheduleNextFrom(s);
      loopStartAt = s; // anchor the timeline to the first ripple's start
      inputState.generatorDragEnded = false;
    }
    if (lastDragIdx != null){ recordArm.add(lastDragIdx); mutedBlocks.delete(lastDragIdx); lastDragIdx = null; }
    for (const b of blocks){ b.rx = b.x; b.ry = b.y; b.vx = 0; b.vy = 0; }
  });

  // UI
  panel.addEventListener('toy-random', ()=>{
    loopRecording = true; playbackActive = false; loopEvents = []; recordArm.clear();
    mutedBlocks.clear(); loopStartAt = null; nextLoopAt = null;
    randomizeRects(blocks, worldW(), worldH(), EDGE);
    assignPentatonic(blocks);
    for (const b of blocks){ b.rx=b.x; b.ry=b.y; b.vx=0; b.vy=0; }
    clampAllBlocksToBounds();
    try { reshuffleParticles(); } catch(e) {}
  });

  panel.addEventListener('toy-reset', ()=>{
    clearRipples();
    generator.placed = false;
    loopRecording = true; playbackActive = false; loopEvents = []; recordArm.clear();
    mutedBlocks.clear(); loopStartAt = null; nextLoopAt = null;
  });

  panel.addEventListener('toy-zoom', (e)=>{
    const nowSec = performance.now()*0.001;
    if ((nowSec - lastZoomAt) < 0.12) return;
    lastZoomAt = nowSec;
    const zoomed = !!(e?.detail?.zoomed);
    const ratio = sizing.setZoom(zoomed);
    if (ratio !== 1){
      for (const b of blocks){ b.x*=ratio; b.y*=ratio; b.w*=ratio; b.h*=ratio; b.rx=b.x; b.ry=b.y; }
      generator.x *= ratio; generator.y *= ratio; generator.r *= ratio;
      try { scaleParticles(ratio); } catch(e) {}
      clampAllBlocksToBounds();
    }
    const w = worldW(), h = worldH();
    try { setParticleBounds(w, h); } catch(e) {}
    const dur = Math.max(0.001, barDur());
    for (const r of ripples){
      const oldR = Math.max(0, (nowSec - r.startTime) * r.speed);
      const newR = oldR * (ratio || 1);
      const maxDx = Math.max(generator.x, w - generator.x);
      const maxDy = Math.max(generator.y, h - generator.y);
      const targetR = Math.max(maxDx, maxDy);
      const newSpeed = targetR / dur;
      r.speed = newSpeed;
      r.startTime = nowSec - (newR / Math.max(1e-6, newSpeed));
    }
    if (!playbackActive){ catchUpHits(nowSec - 0.02); catchUpHits(nowSec); }
    suppressPointerUntil = performance.now() + 150;
  });

  // Draw
  function draw(){
    resizeCanvasForDPR(canvas, ctx);
    const w = worldW(), h = worldH();
    if (!particlesInitialized && w>0 && h>0){ try { initParticles(w, h, EDGE, 56); setParticleBounds(w,h); particlesInitialized = true; } catch(e) {} }

    ctx.fillStyle = '#0b0f15'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.strokeRect(0.5,0.5,w-1,h-1);

    const now = performance.now()*0.001;
    const dur = Math.max(0.001, barDur());
    const maxDxV = Math.max(generator.x, w - generator.x);
    const maxDyV = Math.max(generator.y, h - generator.y);
    const targetRV = Math.max(maxDxV, maxDyV);
    const visSpeed = targetRV / dur;
    drawWaves(ctx, generator.x, generator.y, now, visSpeed, ripples, 16, ()=>Math.max(0.03, barDur()/16));

    updatePhysics(1/60);
    if (!playbackActive){ checkRippleHits(now); }

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

  return { panel, canvas, markPlayingColumn: ()=>{}, ping: ()=>{} };
}

// helpers (outside factory)
function makeBlocks(n){
  const arr = [];
  for (let i=0;i<n;i++){
    arr.push({ x:0,y:0,w:40,h:40, rx:0,ry:0, vx:0,vy:0, rippleAge:999, rippleMax:0, noteIndex: i % PENTATONIC.length });
  }
  return arr;
}
function assignPentatonic(blocks){ for (let i=0;i<blocks.length;i++){ blocks[i].noteIndex = i % PENTATONIC.length; } }