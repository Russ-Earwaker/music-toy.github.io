// src/ripplesynth-core.js — clean structured build
import { initToyUI } from './toyui.js';
import { initToySizing, randomizeRects, clamp } from './toyhelpers.js';
import { resizeCanvasForDPR, getCanvasPos, noteList } from './utils.js';
import { makePointerHandlers } from './ripplesynth-input.js';
import { drawWaves } from './ripplesynth-waves.js';
import { drawBlocksSection } from './ripplesynth-blocks.js';
import { initParticles, drawParticles, scaleParticles, reshuffleParticles, setParticleBounds } from './ripplesynth-particles.js';
import { ensureAudioContext, triggerInstrument, barSeconds as audioBarSeconds } from './audio.js';
const EDGE = 10;
const DEBUG_RIPPLER = false;
const dbg=(...a)=>{ if(DEBUG_RIPPLER) console.log('[rippler]',...a); };
const NUM_CUBES = 8;
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
  const firedThisCycle = new Set();
  let lastCycle = -1;
  let wrapIndex = 0;
  let lastScanT = performance.now()*0.001;
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
    set(x,y){ generator.x=x; generator.y=y; },
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
  function barDur(){ return (typeof audioBarSeconds === 'function') ? audioBarSeconds() : 2.0; }
  function scheduleNextFrom(startTime){
    const s = (typeof startTime === 'number') ? startTime : performance.now()*0.001;
    nextLoopAt = s + barDur();
  }
  function spawnRipple(quantise=true){ if (!generator.placed) return null;
    const now = performance.now()*0.001;
    let start = now;
    if (quantise && typeof barSeconds === 'function'){
      const step = Math.max(0.001, barDur()/8);
      start = Math.ceil(now/step)*step;
    }
    const w = worldW(), h = worldH();
    const cornerMax = Math.max(
      Math.hypot(generator.x - 0,        generator.y - 0),
      Math.hypot(generator.x - w,        generator.y - 0),
      Math.hypot(generator.x - 0,        generator.y - h),
      Math.hypot(generator.x - w,        generator.y - h)
    );
    const dur = Math.max(0.001, barDur());
    const ringSpeed = cornerMax / dur;
    ripples.push({ id: Math.random().toString(36).slice(2), startTime:start, speed:ringSpeed, x:generator.x, y:generator.y });
    return start;
  }
  function loopScheduler(now){
    if (!generator.placed) return;
    if (inputState && inputState.draggingGenerator) return;
    const bar = Math.max(0.001, barDur());
    if (nextLoopAt == null){ nextLoopAt = now + bar; if (loopStartAt == null) loopStartAt = now; }
    if (now + 1/180 >= nextLoopAt){
      // lock to scheduled boundary to keep cycles stable
      dbg('wrap check', {now, nextLoopAt});
      const boundary = nextLoopAt;
      const s = spawnRipple(false);
      if (ripples.length) ripples[ripples.length-1].startTime = boundary;
      loopStartAt = boundary; dbg('wrap', {boundary, events: loopEvents.length});
      nextLoopAt = boundary + bar;
      justWrapped = true; wrapIndex++;
      if (loopRecording){
        loopRecording = false; playbackActive = true;
        {
          { const best=new Map(); for (const ev of loopEvents){ const cur=best.get(ev.idx); if(!cur||(ev.t||0)<(cur.t||0)) best.set(ev.idx,{t:ev.t||0,q:(ev.q!=null?ev.q:null),idx:ev.idx}); } loopEvents=Array.from(best.values()).sort((a,b)=>a.t-b.t); }}
      } else if (recordArm.size){
        const armed = new Set(recordArm);
        const kept = loopEvents.filter(ev => !armed.has(ev.idx));
        const recent = loopEvents.filter(ev => armed.has(ev.idx));
        loopEvents = kept.concat(recent);
        recordArm.clear();
      }
      playbackPrevT = 0;
      skipPlaybackFrame = true;
    }
if (loopEvents.length){ const ctxAudio=ensureAudioContext(); try{ if (ctxAudio.state==='suspended') ctxAudio.resume(); }catch{}
  if (skipPlaybackFrame){ skipPlaybackFrame = false; return; }
  const tNow = (now - loopStartAt);
  const curT = ((tNow % bar) + bar) % bar;
  const prevT = playbackPrevT;
  if (justWrapped){ playbackPrevT = curT; justWrapped = false; return; }
  const NB = 8; const step = Math.max(1e-6, bar/NB);
  const bPrev = Math.floor(prevT/step), bCur = Math.floor(curT/step);
  const cycleNow = wrapIndex;
  if (cycleNow !== lastCycle){ firedThisCycle.clear(); lastCycle = cycleNow; }
  function triggerBucket(k){ dbg('bucket', {k, cycle:cycleNow});
    for (const ev of loopEvents){
      const q = (ev.q != null) ? (ev.q % NB) : (Math.round((ev.t||0)/step) % NB);
      if (q === (k % NB) && !mutedBlocks.has(ev.idx)){
        const key = ev.idx + ':' + (q%NB) + ':' + cycleNow;
        if (!firedThisCycle.has(key)){
          firedThisCycle.add(key);
          const b = blocks[ev.idx]; if (b){ const ctxA=ensureAudioContext(); const when=(ctxA.currentTime||0)+0.001; dbg('TRIG', {idx:ev.idx, q, when, curTime:ctxA.currentTime}); onBlockHit(b, now, true);}
        }
      }
    }
  }
  if (curT >= prevT){ for (let k=bPrev+1; k<=bCur; k++) triggerBucket(k); }
  else { for (let k=bPrev+1; k<NB; k++) triggerBucket(k); for (let k=0; k<=bCur; k++) triggerBucket(k); }
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

  
  function onBlockHit(b, now, scan=false){
    // Only flash + knockback on scheduled (scan===true) playback
    if (scan){
      b.flashDur = 0.12; b.flashEnd = now + b.flashDur; b.rippleAge = 0; b.rippleMax = 0.25; b.lastVisualAt = now;
      const KNOCKBACK = 28;
      const cx = b.x + b.w/2, cy = b.y + b.h/2;
      const dx = cx - generator.x, dy = cy - generator.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const k = KNOCKBACK / d; b.vx += dx * k; b.vy += dy * k;
    }

    // record into loop (normalized, quantized)
    const idx = blocks.indexOf(b);
    if (idx >= 0 && loopStartAt != null){
      const bar = Math.max(0.001, barDur());
      const step = Math.max(1e-6, bar/8);
      let t = ((now - loopStartAt) % bar + bar) % bar;
      // forward quantize to avoid first-loop misses
      let tQ = Math.round(t/step)*step; if (tQ < t - 1e-6) tQ += step; if (tQ >= bar) tQ -= bar;
      const EPS = step*0.25;
      if (loopRecording || recordArm.has(idx)){
        const q = Math.round(tQ/step) % 8;
        const exists=loopEvents.some(ev=>ev.idx===idx); if(!exists) loopEvents.push({t:tQ,q,idx});
      }
    }

    // trigger note
    try {
      if (scan){
        const ctx = ensureAudioContext();
        const note = noteList[b.noteIndex % noteList.length];
        const when = (ctx.currentTime || 0) + 0.001;
        triggerInstrument(ui.instrument, note, when);
      }
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
    hitsFired.forEach((_, key)=>{ const rid = key.split(':')[0]; if (!ripples.some(rp=>rp.id===rid)) hitsFired.delete(key); });
}

  function checkRippleHits(now){
    const prev = lastScanT; lastScanT = now;
    for (let rIndex=0; rIndex<ripples.length; rIndex++){
      const r = ripples[rIndex];
      const r0 = Math.max(0, (prev - r.startTime) * r.speed);
      const r1 = Math.max(0, (now  - r.startTime) * r.speed);
      const lo = Math.min(r0, r1), hi = Math.max(r0, r1);
      const dynBand = Math.max(HIT_BAND, (hi - lo) * 1.25);
      for (let i=0;i<blocks.length;i++){
        const b = blocks[i], cx = b.x + b.w/2, cy = b.y + b.h/2;
        const dist = Math.hypot(cx - r.x, cy - r.y);
        if (dist >= lo - dynBand && dist <= hi + dynBand){
          const key = r.id+':'+i;
          if (!hitsFired.has(key)){ hitsFired.add(key); onBlockHit(b, now); }
        }
      }
    }
    hitsFired.forEach((_, key)=>{ const rid = key.split(':')[0]; if (!ripples.some(rp=>rp.id===rid)) hitsFired.delete(key); });
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
      const idx = inputState.dragIndex;
      // remove any existing scheduled event for this block; re-arm to capture new timing
      loopEvents = loopEvents.filter(ev => ev.idx !== idx);
      recordArm.add(idx);
      mutedBlocks.delete(idx);
      lastDragIdx = idx;
    }
    if (!wasPlaced && generator.placed){
      clearRipples();
      const s = spawnRipple(false); scheduleNextFrom(s); if (loopStartAt == null) loopStartAt = s;
    } else if (wasPlaced){
      // no ripple on drag start
    }
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', handlers.pointerMove);
  window.addEventListener('pointerup', (e)=>{
    handlers.pointerUp(e);
    if (lastDragIdx != null){ recordArm.add(lastDragIdx); mutedBlocks.delete(lastDragIdx); lastDragIdx = null; }
    for (const b of blocks){ b.rx = b.x; b.ry = b.y; b.vx = 0; b.vy = 0; }
  
    if (inputState && inputState.generatorDragEnded){
      clearRipples();
      const s = spawnRipple(true);
      playbackActive = false; loopRecording = true;
      loopEvents = []; recordArm.clear();
      loopStartAt = (typeof s === 'number') ? s : (performance.now()*0.001);
      playbackPrevT = 0; skipPlaybackFrame = true; justWrapped = false;
      scheduleNextFrom(loopStartAt);
      inputState.generatorDragEnded = false;
    }
  });

  // UI
  panel.addEventListener('toy-random', ()=>{ clearRipples();
    loopRecording = true; playbackActive = false; loopEvents = []; recordArm.clear();
    mutedBlocks.clear(); loopStartAt = null; nextLoopAt = null;
    randomizeRects(blocks, worldW(), worldH(), EDGE);
    assignPentatonic(blocks);
    for (const b of blocks){ b.rx=b.x; b.ry=b.y; b.vx=0; b.vy=0; }
    clampAllBlocksToBounds();
    try { reshuffleParticles(); } catch(e) {}
    const s = spawnRipple(true); if (typeof s==='number'){ scheduleNextFrom(s); loopStartAt = s; } dbg && dbg('random->spawn', {s});
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
      const cornerMaxR = Math.max(
        Math.hypot(generator.x - 0,        generator.y - 0),
        Math.hypot(generator.x - w,        generator.y - 0),
        Math.hypot(generator.x - 0,        generator.y - h),
        Math.hypot(generator.x - w,        generator.y - h)
      );
      const newSpeed = cornerMaxR / dur;
      r.speed = newSpeed;
      r.startTime = nowSec - (newR / Math.max(1e-6, newSpeed));
    }
    // catchUpHits disabled (bracketed hits handle gaps)
    
    suppressPointerUntil = performance.now() + 150;
  });

  // Draw
  function draw(){
    resizeCanvasForDPR(canvas, ctx);
    const w = worldW(), h = worldH();
    if (!particlesInitialized && w>0 && h>0){ try { initParticles(w, h, EDGE, 56); setParticleBounds(w,h); particlesInitialized = true; } catch(e) {} }

    ctx.fillStyle = '#0b0f15'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='rgba(255,255,255,0.12)';ctx.strokeRect(0.5,0.5,w-1,h-1);if(DEBUG_RIPPLER){ctx.fillStyle='#0f0';ctx.font='10px monospace';ctx.fillText(`ev:${loopEvents.length} rip:${ripples.length} act:${playbackActive?'1':'0'}`,6,12);}

    const now = performance.now()*0.001;
    const dur = Math.max(0.001, barDur());
    const cornerMaxV = Math.max(
      Math.hypot(generator.x - 0,        generator.y - 0),
      Math.hypot(generator.x - w,        generator.y - 0),
      Math.hypot(generator.x - 0,        generator.y - h),
      Math.hypot(generator.x - w,        generator.y - h)
    );
    const visSpeed = cornerMaxV / dur;
    drawWaves(ctx, generator.x, generator.y, now, visSpeed, ripples, 16, ()=>Math.max(0.03, barDur()/16));

    updatePhysics(1/60);
    checkRippleHits(now);

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
    arr.push({ x:0,y:0,w:40,h:40, rx:0,ry:0, vx:0,vy:0, rippleAge:999, rippleMax:0, noteIndex: i % PENTATONIC.length, lastVisualAt:-1 });
  }
  return arr;
}
function assignPentatonic(blocks){ for (let i=0;i<blocks.length;i++){ blocks[i].noteIndex = i % PENTATONIC.length; } }