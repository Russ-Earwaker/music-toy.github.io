// src/ripplesynth-core.js (rebuild, <400 lines)
import { initToyUI } from './toyui.js';
import { initToySizing, randomizeRects, clamp, drawNoteStripsAndLabel } from './toyhelpers.js';
import { resizeCanvasForDPR, getCanvasPos, noteList } from './utils.js';
import { drawWaves } from './ripplesynth-waves.js';
import { drawBlocksSection } from './ripplesynth-blocks.js';
import { makePointerHandlers } from './ripplesynth-input.js';
import { ensureAudioContext, triggerInstrument, beatSeconds, barSeconds, stepSeconds as audioStepSeconds } from './audio.js';

const EDGE = 10;
const NUM_BLOCKS = 5;
const RING_SPEED = 120;     // px/s
const HIT_BAND   = 8;       // px tolerance on ring edge
const GEN_R      = 12;

function pentatonicChooser() {
  // Limit to C major pentatonic mid range
  const wanted = ['C4','D4','E4','G4','A4'];
  const idxs = wanted.map(n => Math.max(0, noteList.indexOf(n)));
  return (i) => idxs[i % idxs.length];
}

export function createRippleSynth(selector, { defaultInstrument='kalimba', title='Rippler' } = {}){
  const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector;
  if (!shell){ console.warn('[rippler] missing', selector); return null; }
  const panel = shell.closest?.('.toy-panel') || shell;
  const ui = initToyUI(panel, { toyName: title, defaultInstrument });

  // Canvas
  let canvas = panel.querySelector('canvas.rippler-canvas');
  if (!canvas){
    const body = panel.querySelector?.('.toy-body') || panel;
    canvas = document.createElement('canvas');
    canvas.className = 'rippler-canvas';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    body.appendChild(canvas);
  }
  const ctx = canvas.getContext('2d', { alpha: false });

  // Sizing
  const sizing = initToySizing(panel, canvas, ctx, { squareFromWidth:true, minH:220 });
  sizing.ambient = false; // disable idle wobble in blocks renderer

  // State
  const ripples = []; // { startTime, speed, x, y, fired:Set }
  const blocks = makeBlocks(NUM_BLOCKS);
  const gen = { x: 0, y: 0, r: GEN_R, placed: false };
  let lastLoopAt = 0;
  let clickGuardUntil = 0;
  let currentInstrument = defaultInstrument;

  // Layout helpers
  function vw(){ return Math.max(1, canvas.clientWidth || 1); }
  function vh(){ return Math.max(1, canvas.clientHeight || 1); }

  function ensureLaidOut(){
    if (!blocks._laidOut){
      randomizeRects(blocks, vw(), vh(), EDGE);
      blocks.forEach(b => { b.rx = b.x; b.ry = b.y; b.vx = 0; b.vy = 0; });
      // Assign pleasant notes
      const choose = pentatonicChooser();
      blocks.forEach((b,i)=> b.noteIndex = choose(i));
      blocks._laidOut = true;
    }
  }

  // Generator API for input
  const generatorRef = {
    get x(){ return gen.x; }, get y(){ return gen.y; },
    set(x,y){ gen.x = x; gen.y = y; },
    place(x,y){
      gen.x = x; gen.y = y; gen.placed = true;
      // on placement: clear old and spawn a ripple immediately
      ripples.length = 0;
      spawnRippleNow();
    }
  };

  // Input
  const handlers = makePointerHandlers({
    canvas, vw, vh, EDGE, blocks, ripples, generatorRef, clamp, getCanvasPos
  });
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); handlers.pointerDown(e); });
  canvas.addEventListener('pointermove', handlers.pointerMove);
  window.addEventListener('pointerup', handlers.pointerUp);

  // UI events
  panel.addEventListener('toy-instrument', (e)=>{ currentInstrument = e.detail?.value || currentInstrument; });
  panel.addEventListener('toy-random', ()=>{
    ensureLaidOut();
    randomizeRects(blocks, vw(), vh(), EDGE);
    const choose = pentatonicChooser();
    blocks.forEach((b,i)=>{ b.vx=0; b.vy=0; b.rx=b.x; b.ry=b.y; b.noteIndex = choose(i); });
  });
  panel.addEventListener('toy-reset', ()=>{
    ripples.length = 0;
    gen.placed = false; // hide until placed again
  });
  panel.addEventListener('toy-zoom', (ev)=>{
    const z = !!(ev && ev.detail && ev.detail.zoomed);
    try { sizing.setZoom(z ? 2 : 1); } catch {}
    // guard against click-through
    clickGuardUntil = performance.now() + 250;
  });

  // Ripple helpers
  function spawnRippleNow(){
    const now = performance.now() * 0.001;
    const halfBeat = (beatSeconds ? beatSeconds() : 0.5);
    const q = Math.max(halfBeat*0.5, halfBeat); // basic guard
    const start = Math.round(now / q) * q;
    ripples.push({ startTime: start, speed: RING_SPEED, x: gen.x, y: gen.y, fired: new Set() });
    lastLoopAt = start;
  }

  function loopIfNeeded(){
    if (!gen.placed) return;
    ensureAudioContext();
    const now = performance.now() * 0.001;
    const loopLen = (barSeconds ? barSeconds() : 4.0) || 4.0;
    if (now - lastLoopAt >= loopLen - 1e-3){
      spawnRippleNow();
    }
  }

  // Physics + hits
  function applyPhysics(dt){
    const k = 7.0e-2; // spring
    const d = 0.88;   // damping
    for (const b of blocks){
      // spring back toward rest (rx,ry)
      const ax = (b.rx - b.x) * k;
      const ay = (b.ry - b.y) * k;
      b.vx = (b.vx + ax); b.vy = (b.vy + ay);
      b.vx *= d; b.vy *= d;
      b.x += b.vx; b.y += b.vy;
      // keep within bounds
      b.x = clamp(b.x, EDGE, vw() - EDGE - b.w);
      b.y = clamp(b.y, EDGE, vh() - EDGE - b.h);
    }
  }

  function checkHits(now){
    if (!ripples.length) return;
    for (let ri = ripples.length - 1; ri >= 0; ri--){
      const rp = ripples[ri];
      const r = Math.max(0, (now - rp.startTime) * rp.speed);
      // cull when beyond corners
      const maxR = Math.max(
        Math.hypot(rp.x - 0, rp.y - 0),
        Math.hypot(rp.x - canvas.width, rp.y - 0),
        Math.hypot(rp.x - 0, rp.y - canvas.height),
        Math.hypot(rp.x - canvas.width, rp.y - canvas.height)
      ) + 60;
      if (r > maxR){ ripples.splice(ri,1); continue; }

      // hits
      for (let i=0;i<blocks.length;i++){
        if (rp.fired.has(i)) continue;
        const b = blocks[i];
        const cx = b.x + b.w * 0.5, cy = b.y + b.h * 0.5;
        const dist = Math.hypot(cx - rp.x, cy - rp.y);
        if (Math.abs(dist - r) <= HIT_BAND){
          rp.fired.add(i);
          // knockback impulse away from generator
          const dirx = (cx - rp.x) / (dist || 1);
          const diry = (cy - rp.y) / (dist || 1);
          b.vx += dirx * 1.6;
          b.vy += diry * 1.6;
          // audio
          const noteName = noteList[clamp(Math.floor(b.noteIndex), 0, noteList.length-1)];
          try { triggerInstrument(currentInstrument || 'kalimba', noteName, ensureAudioContext() && (performance.now()/1000)); } catch {}
        }
      }
    }
  }

  // Draw
  function drawBackground(w,h){
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0a0a0a'); grad.addColorStop(1, '#000');
    ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1; ctx.strokeRect(0.5,0.5,w-1,h-1);
  }
  function drawGenerator(){
    if (!gen.placed) return;
    ctx.save();
    ctx.fillStyle = '#ff9500';
    ctx.beginPath();
    ctx.arc(gen.x, gen.y, gen.r, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function frame(){
    resizeCanvasForDPR(canvas, ctx);
    ensureLaidOut();
    const now = performance.now()*0.001;
    const w = canvas.width, h = canvas.height;

    // rate independent physics
    applyPhysics(1/60);
    loopIfNeeded();
    checkHits(now);

    // draw
    drawBackground(w,h);
    if (gen.placed){
      drawWaves(ctx, gen.x, gen.y, now, RING_SPEED, ripples, 8, ()=> (barSeconds()? barSeconds()/8 : 0.5));
    }
    drawBlocksSection(ctx, blocks, gen.x, gen.y, ripples, 1.0, noteList, sizing, null, drawNoteStripsAndLabel, now);
    drawGenerator();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { panel, canvas, markPlayingColumn: ()=>{}, ping: ()=>{} };
}

function makeBlocks(n){
  const arr = [];
  for (let i=0;i<n;i++){
    arr.push({ x: 0, y: 0, w: 40, h: 40, vx: 0, vy: 0, rx: 0, ry: 0, noteIndex: 0 });
  }
  return arr;
}
