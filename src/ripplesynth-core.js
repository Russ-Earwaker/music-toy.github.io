// src/ripplesynth-core.js — Rippler (full) with unified cube-thirds UI, waves, particles
import { initToyUI } from './toyui.js';
import { initToySizing, randomizeRects, clamp, whichThirdRect, drawThirdsGuides } from './toyhelpers.js';
import { resizeCanvasForDPR, getCanvasPos, noteList } from './utils.js';
import { ensureAudioContext, triggerInstrument, barSeconds, stepSeconds, NUM_STEPS } from './audio.js';

const EDGE = 10;
const N_BLOCKS = 8;

// Simple RNG helpers
function rand(min, max){ return Math.random() * (max - min) + min; }

export function createRippleSynth(selector, { title='Rippler', defaultInstrument='kalimba' } = {}){
  const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector;
  if (!shell){ console.warn('[rippler] missing', selector); return null; }
  const panel = shell.closest?.('.toy-panel') || shell;
  const ui = initToyUI(panel, { toyName: title, defaultInstrument });

  // Canvas
  const canvas = document.createElement('canvas');
  canvas.className = 'rippler-canvas';
  canvas.style.display = 'block';
  shell.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Sizing (square canvas)
  const sizing = initToySizing(panel, canvas, ctx, { squareFromWidth: true });
  panel.addEventListener('toy-zoom', (e)=> { try { sizing.setZoom(!!e.detail.zoomed); } catch {} });

  // World size accessors
  const worldW = () => sizing.vw();
  const worldH = () => sizing.vh();

  // Blocks (cubes): square, slightly smaller for this toy
  const BASE = 56;
  function cubeSize(){ return Math.max(30, Math.round(BASE * (sizing.scale || 1) * 0.75)); } // 25% smaller
  const blocks = new Array(N_BLOCKS).fill(0).map((_,i)=>({ 
    x: EDGE+6, y: EDGE+6, w: cubeSize(), h: cubeSize(),
    noteIndex: Math.max(0, noteList.indexOf('C4')) + i*2,
    muted: false, flash: 0,
    jx: 0, jy: 0, vx: 0, vy: 0
  }));
  randomizeRects(blocks, worldW(), worldH(), EDGE);

  // Generator (placed by first click)
  const generator = { placed: false, x: worldW()*0.5, y: worldH()*0.5, r: 9 };

  // Ripple rings + dedupe (per-ring/per-block)
  const ripples = []; // {id, startTime, speed}
  let ringIdCounter = 1;
  const fired = new Set(); // `${id}:${blockIndex}`

  // Particles: spring-to-rest field, impulse on ring pass
  const P_COUNT = 70;
  const particles = [];
  function initParticles(){
    particles.length = 0;
    for (let i=0;i<P_COUNT;i++){
      const rx = rand(EDGE, worldW()-EDGE);
      const ry = rand(EDGE, worldH()-EDGE);
      particles.push({ rx, ry, x: rx, y: ry, vx: 0, vy: 0, flash: 0 });
    }
  }
  initParticles();

  // Loop timing
  let loopStartPerf = null;
  function startLoop(now){
    loopStartPerf = now;
  }
  function stepLen(){ try { return stepSeconds(); } catch { return barSeconds()/NUM_STEPS; } }
  function barLen(){ try { return barSeconds(); } catch { return 2.0; } }

  function spawnRipple(){
    if (!generator.placed) return;
    const now = performance.now()*0.001;
    if (!loopStartPerf) startLoop(now);
    // speed so ring reaches farthest corner by one bar
    const w = worldW(), h = worldH();
    const far = Math.max(
      Math.hypot(generator.x - 0,        generator.y - 0),
      Math.hypot(generator.x - w,        generator.y - 0),
      Math.hypot(generator.x - 0,        generator.y - h),
      Math.hypot(generator.x - w,        generator.y - h)
    );
    const speed = Math.max(60, far / Math.max(0.001, barLen()));
    ripples.push({ id: ringIdCounter++, startTime: now, speed });
  }

  function scheduleHit(noteIdx){
    try {
      const ac = ensureAudioContext();
      const now = performance.now()*0.001;
      if (!loopStartPerf) loopStartPerf = now;
      const step = stepLen();
      const tFromStart = now - loopStartPerf;
      const nextQ = Math.ceil(tFromStart / step) * step;
      const delta = Math.max(0.01, nextQ - tFromStart);
      const when = ac.currentTime + delta;
      const name = noteList[(noteIdx % noteList.length + noteList.length) % noteList.length] || 'C4';
      triggerInstrument(ui.instrument || defaultInstrument, name, when);
    } catch (e) {
      // Fallback immediate if scheduling fails
      try {
        const name = noteList[(noteIdx % noteList.length + noteList.length) % noteList.length] || 'C4';
        triggerInstrument(ui.instrument || defaultInstrument, name);
      } catch {}
    }
  }

  // Hit a block (flash + schedule)
  function fireHit(bi){
    const b = blocks[bi];
    if (!b || b.muted) return;
    b.flash = 0.9;
    scheduleHit(b.noteIndex);
  }

  // Drawing helpers
  function drawCubes(zoomed){
    const s = cubeSize();
    for (let i=0;i<blocks.length;i++){
      const b = blocks[i];
      // enforce square + keep inside bounds
      b.w = b.h = s;
      b.x = clamp(b.x, EDGE, worldW()-EDGE - b.w);
      b.y = clamp(b.y, EDGE, worldH()-EDGE - b.h);

      const sx = b.x + b.jx, sy = b.y + b.jy;
      // cube base
      ctx.fillStyle = b.muted ? '#293042' : '#f4932f';
      ctx.fillRect(sx, sy, b.w, b.h);
      // flash overlay
      if (b.flash > 0){
        ctx.globalAlpha = Math.min(1, b.flash);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx, sy, b.w, b.h);
        ctx.globalAlpha = 1;
        b.flash = Math.max(0, b.flash - 0.05);
      }
      // thirds guides only in zoom
      if (zoomed) drawThirdsGuides(ctx, b);
      // label only in zoom
      if (zoomed){
        const label = noteList[(b.noteIndex % noteList.length + noteList.length) % noteList.length] || '';
        ctx.fillStyle = b.muted ? '#e6e8ef' : '#0b0f16';
        ctx.font = '12px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, b.x + b.w/2, b.y + b.h/2);
      }
    }
  }

  function drawRings(now){
    // stylized multi-band rings
    for (let i=ripples.length-1; i>=0; i--){
      const rp = ripples[i];
      const r = Math.max(0, (now - rp.startTime) * rp.speed);
      // cull after it leaves canvas bounds
      const far = Math.max(
        Math.hypot(generator.x - 0,        generator.y - 0),
        Math.hypot(generator.x - worldW(), generator.y - 0),
        Math.hypot(generator.x - 0,        generator.y - worldH()),
        Math.hypot(generator.x - worldW(), generator.y - worldH())
      );
      if (r > far + 10){ ripples.splice(i,1); continue; }

      // sequential rings: main + two echoes
      ctx.save();
      ctx.lineCap = 'round';
      const bar = barSeconds();
      const E1 = 0.20 * bar, E2 = 0.40 * bar; // echo delays
      const rMain = r;
      const rEcho1 = Math.max(0, (now - (rp.startTime + E1)) * rp.speed);
      const rEcho2 = Math.max(0, (now - (rp.startTime + E2)) * rp.speed);

      function strokeRing(rad, w, a){
        if (rad <= 0) return;
        ctx.globalAlpha = a;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(generator.x, generator.y, Math.max(0.1, rad), 0, Math.PI*2);
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      // main ring slightly less intense, a bit thicker
      strokeRing(rMain, 3.0, 0.48);
      // echoes later, thinner + faint
      if (now >= rp.startTime + E1) strokeRing(rEcho1, 2.5, 0.18);
      if (now >= rp.startTime + E2) strokeRing(rEcho2, 2.0, 0.12);
      ctx.restore();
      // Check hits per block (dedupe)
      for (let bi=0; bi<blocks.length; bi++){
        const key = rp.id + ':' + bi;
        if (fired.has(key)) continue;
        const b = blocks[bi];
        // Distance from generator to block edge (closest point)
        const cx = clamp(generator.x, b.x, b.x + b.w);
        const cy = clamp(generator.y, b.y, b.y + b.h);
        const dist = Math.hypot(generator.x - cx, generator.y - cy);
              if (Math.abs(dist - rMain) <= 2){
                fired.add(key);
                fireHit(bi);
                // direction from generator to block center/closest point
                const ang = Math.atan2(cy - generator.y, cx - generator.x);
                // cube buoy impulse
                const bx = Math.cos(ang) * 48, by = Math.sin(ang) * 48;
                b.vx += bx; b.vy += by;
                // particle impulse near the ring front
                const kick = 34;
                for (const p of particles){
                  const pd = Math.hypot(p.x - generator.x, p.y - generator.y);
                  if (Math.abs(pd - rMain) < 10){
                    p.vx += Math.cos(ang) * kick * 0.02;
                    p.vy += Math.sin(ang) * kick * 0.02;
                    p.flash = 1;
                  }
                }
              }
    }
    }

  }

  function updateBuoy(dt){
    const K = 40.0, D = 0.82; // spring constant, damping
    for (const b of blocks){
      // spring back to 0,0
      const fx = -b.jx * K;
      const fy = -b.jy * K;
      b.vx = (b.vx + fx * dt) * D;
      b.vy = (b.vy + fy * dt) * D;
      // clamp
      if (b.vx > 200) b.vx = 200; if (b.vx < -200) b.vx = -200;
      if (b.vy > 200) b.vy = 200; if (b.vy < -200) b.vy = -200;
      b.jx += b.vx * dt;
      b.jy += b.vy * dt;
    }
  }

  function updateParticles(dt){
    const K = 10.0, DAMP = 0.90, MAXV = 120;
    for (const p of particles){
      const fx = (p.rx - p.x) * K;
      const fy = (p.ry - p.y) * K;
      p.vx = (p.vx + fx * dt) * DAMP;
      p.vy = (p.vy + fy * dt) * DAMP;
      // clamp velocity
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > MAXV){ const s = MAXV / Math.max(1e-6, sp); p.vx *= s; p.vy *= s; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.flash > 0) p.flash = Math.max(0, p.flash - 1.5*dt);
    }
  }

  function drawParticles(){
    ctx.save();
    for (const p of particles){
      const a = 0.25 + 0.75 * p.flash;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x, p.y, 2.2, 2.2);
    }
    ctx.restore();
  }

  // Interaction
  let draggingGen = false;
  let dragOffset = {dx:0, dy:0};
  let draggingBlock = null;

  function isZoomed(){ return panel.classList.contains('toy-zoomed'); }

  canvas.addEventListener('pointerdown', (e)=>{
    const p = getCanvasPos(canvas, e);
    // Hit cubes first
    for (let i=blocks.length-1;i>=0;i--){
      const b = blocks[i];
      const sx = b.x + b.jx, sy = b.y + b.jy;
      if (p.x>=sx && p.x<=sx+b.w && p.y>=sy && p.y<=sy+b.h){
        if (isZoomed()){
          const third = whichThirdRect({x:sx,y:sy,w:b.w,h:b.h}, p.y);
          if (third === 'up')   { b.noteIndex = Math.min(noteList.length-1, b.noteIndex + 1); }
          else if (third==='down'){ b.noteIndex = Math.max(0, b.noteIndex - 1); }
          else { b.muted = !b.muted; }
          b.flash = 0.35;
        } else {
          // zero buoy offsets during drag to keep stable
          b.jx = 0; b.jy = 0; b.vx = 0; b.vy = 0;
          draggingBlock = { i, dx: p.x - b.x, dy: p.y - b.y };
        }
        return;
      }
    }
    // Generator hit?
    const dx = p.x - generator.x, dy = p.y - generator.y;
    if (!isZoomed() && generator.placed && Math.hypot(dx,dy) <= generator.r + 10){
      draggingGen = true;
      dragOffset = { dx, dy };
      // suspend hits: clear rings & fired
      ripples.length = 0; fired.clear();
      return;
    }
    // Otherwise: place/move generator and start one ripple
    generator.x = clamp(p.x, EDGE, worldW()-EDGE);
    generator.y = clamp(p.y, EDGE, worldH()-EDGE);
    generator.placed = true;
    ripples.length = 0; fired.clear();
    spawnRipple();
  });

  canvas.addEventListener('pointermove', (e)=>{
    const p = getCanvasPos(canvas, e);
    if (draggingGen){
      generator.x = clamp(p.x - dragOffset.dx, EDGE, worldW()-EDGE);
      generator.y = clamp(p.y - dragOffset.dy, EDGE, worldH()-EDGE);
    } else if (draggingBlock){
      const b = blocks[draggingBlock.i];
      b.x = clamp(p.x - draggingBlock.dx, EDGE, worldW()-EDGE - b.w);
      b.y = clamp(p.y - draggingBlock.dy, EDGE, worldH()-EDGE - b.h);
    }
  });

  function endDrag(){
    if (draggingGen){
      // one clean ripple on release
      ripples.length = 0; fired.clear();
      spawnRipple();
    }
    draggingGen = false; draggingBlock = null;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  window.addEventListener('pointerup', endDrag, true);

  // Draw loop
  let prevT = performance.now()*0.001;
  function draw(){
    resizeCanvasForDPR(canvas, ctx);
    const W = worldW(), H = worldH();
    ctx.clearRect(0,0,W,H);
    const now = performance.now()*0.001;
    const dt = Math.max(0.001, Math.min(0.05, now - prevT));
    prevT = now;

    // Background particles & waves
    updateParticles(dt);
    drawParticles();
    drawRings(now);
    updateBuoy(dt);

    // Cubes + generator handle
    drawCubes(isZoomed());
    if (generator.placed){
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(generator.x, generator.y, generator.r, 0, Math.PI*2);
      ctx.fill();
    }

    // Auto-spawn a ripple at bar wrap
    if (generator.placed && loopStartPerf){
      const elapsed = now - loopStartPerf;
      const bar = barLen();
      if (elapsed >= bar){
        // wrap
        loopStartPerf = now;
        fired.clear();
        ripples.length = 0;
        spawnRipple();
      }
    }

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  function onLoop(){ /* engine spawns ripples based on bar wrap */ }
  function reset(){
    ripples.length = 0; fired.clear();
    for (const b of blocks){ b.muted = false; b.flash = 0; }
  }

  return { onLoop, reset, setInstrument: ui.setInstrument, element: canvas };
}
