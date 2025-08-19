// src/bouncer.js — Bouncer (simple: click → music). No recording/options; visual FX only.
import { noteList, resizeCanvasForDPR } from './utils.js';
import { ensureAudioContext, getLoopInfo } from './audio-core.js';
import { triggerInstrument } from './audio-samples.js';
import { initToyUI } from './toyui.js';
import { initToySizing } from './toyhelpers-sizing.js';
import { randomizeRects, EDGE_PAD as EDGE, hitRect, whichThirdRect, drawThirdsGuides } from './toyhelpers.js';
import { drawBlocksSection } from './ripplesynth-blocks.js';
import { circleRectHit } from './bouncer-helpers.js';
import { BASE_BLOCK_SIZE, BASE_CANNON_R, BASE_BALL_R, MAX_SPEED, LAUNCH_K } from './bouncer-consts.js';
import { createImpactFX } from './bouncer-impact.js';

export function createBouncer(selector){
  const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector;
  if (!shell) return null;
  const panel = shell.closest('.toy-panel') || shell;
  const ui = initToyUI(panel, { toyName: 'Bouncer' });
  let instrument = ui.instrument || 'tone';
  panel.addEventListener('toy-instrument', (e)=>{ instrument = (e?.detail?.value) || instrument; });

  // Canvas
  const host = panel.querySelector('.toy-body') || panel;
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha:false });

  // Sizing (square like Wheel/Rippler)
  const sizing = initToySizing(panel, canvas, ctx, { squareFromWidth: true });
  const worldW = ()=> (canvas.clientWidth  || panel.clientWidth  || 356);
  const worldH = ()=> (canvas.clientHeight || panel.clientHeight || 260);
  const blockSize = () => Math.round(BASE_BLOCK_SIZE * (sizing.scale || 1));
  const cannonR   = () => Math.round(BASE_CANNON_R   * (sizing.scale || 1));
  const ballR     = () => Math.round(BASE_BALL_R     * (sizing.scale || 1));

  // Blocks (8) — WYSIWYG notes
  const N_BLOCKS = 8;
  let blocks = Array.from({length:N_BLOCKS}, (_,i)=> ({
    x: EDGE, y: EDGE, w: blockSize(), h: blockSize(),
    noteIndex: (i*3) % noteList.length, active: true, flash: 0, lastHitAT: 0
  }));
  randomizeRects(blocks, worldW(), worldH(), EDGE);

  // Cannon & ball state
  let handle = { x: worldW()*0.22, y: worldH()*0.5 };
  let draggingHandle = false, dragStart = null, dragCurr = null;
  let lastLaunch = null;      // {vx, vy}
  let launchPhase = 0;        // seconds into bar
  let nextLaunchAt = null;    // audio time to relaunch
  let ball = null;            // {x,y,vx,vy,r}
  const fx = createImpactFX();

  // Zoom rescale: keep positions AND speeds consistent when scale changes
  let lastScale = sizing.scale || 1;
  function rescaleAll(f){
    if (!f || f === 1) return;
    for (const b of blocks){ b.x *= f; b.y *= f; b.w = blockSize(); b.h = blockSize(); }
    handle.x *= f; handle.y *= f;
    if (ball){ ball.x *= f; ball.y *= f; ball.vx *= f; ball.vy *= f; ball.r = ballR(); }
    if (lastLaunch){ lastLaunch.vx *= f; lastLaunch.vy *= f; }
  }
  panel.addEventListener('toy-zoom', (e)=>{
    sizing.setZoom?.(!!e?.detail?.zoomed);
    const s = sizing.scale || 1;
    rescaleAll(s / lastScale);
    lastScale = s;
  });

  // UI buttons
  function doRandom(){ randomizeRects(blocks, worldW(), worldH(), EDGE); }
  function doReset(){ ball = null; lastLaunch = null; nextLaunchAt = null; for (const b of blocks){ b.flash = 0; b.lastHitAT = 0; } }
  panel.addEventListener('toy-random', doRandom);
  panel.addEventListener('toy-reset', doReset);
  panel.addEventListener('toy-clear', doReset);

  // Input
  function localPoint(evt){
    const rect = canvas.getBoundingClientRect();
    return { x: (evt.clientX - rect.left), y: (evt.clientY - rect.top) };
  }
  canvas.addEventListener('pointerdown', (e)=>{
    const p = localPoint(e);
    const near = Math.hypot(p.x - handle.x, p.y - handle.y) <= cannonR() + 14;
    const hit = blocks.find(b => hitRect(p, b));
    if (near){
      handle.x = p.x; handle.y = p.y;
      draggingHandle = true; dragStart = { x: handle.x, y: handle.y }; dragCurr = p;
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    } else if (panel.classList.contains('toy-zoomed') && hit){
      const t = whichThirdRect(p, hit);
      if (t === 'mid'){ hit.active = !hit.active; }
      else if (t === 'top'){ hit.noteIndex = (hit.noteIndex + 1) % noteList.length; }
      else if (t === 'bot'){ hit.noteIndex = (hit.noteIndex + noteList.length - 1) % noteList.length; }
    } else {
      // empty space: start a shot from this point
      handle.x = p.x; handle.y = p.y;
      draggingHandle = true; dragStart = { x: handle.x, y: handle.y }; dragCurr = p;
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    }
  });
  canvas.addEventListener('pointermove', (e)=>{ if (draggingHandle) dragCurr = localPoint(e); });
  function endDrag(e){
    if (!draggingHandle) return;
    draggingHandle = false;
    if (dragStart && dragCurr){
      const sc = (sizing.scale || 1);
      let vx = (dragCurr.x - dragStart.x) * (LAUNCH_K / sc);
      let vy = (dragCurr.y - dragStart.y) * (LAUNCH_K / sc);
      const sp = Math.hypot(vx, vy);
      if (sp > 1){
        const scl = Math.min(1, MAX_SPEED / sp); vx *= scl; vy *= scl;
        lastLaunch = { vx, vy };
        const ac = ensureAudioContext(); const li = getLoopInfo?.();
        if (ac && li){
          const now = ac.currentTime;
          const off = ((now - (li.loopStartTime||0)) % (li.barLen||1) + (li.barLen||1)) % (li.barLen||1);
          launchPhase = off;
        } else { launchPhase = 0; }
        spawnBallFrom({ x: handle.x, y: handle.y, vx, vy, r: ballR() });
        nextLaunchAt = null;
      }
    }
    dragStart = dragCurr = null;
    try { if (e?.pointerId != null) canvas.releasePointerCapture(e.pointerId); } catch {}
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  window.addEventListener('pointerup', endDrag, true);

  function spawnBallFrom(L){ ball = { x:L.x, y:L.y, vx:L.vx, vy:L.vy, r:L.r }; fx.onLaunch(L.x, L.y); }

  // Physics/update
  let lastAT = 0;
  function step(nowAT){
    const ac = ensureAudioContext();
    const now = nowAT || (ac ? ac.currentTime : 0);
    const dt = Math.min(0.04, Math.max(0, now - (lastAT || now)));
    // Scheduled relaunch at phase
    { if (lastLaunch && nextLaunchAt != null && ac && now >= nextLaunchAt - 0.005){ spawnBallFrom({ x: handle.x, y: handle.y, vx: lastLaunch.vx, vy: lastLaunch.vy, r: ballR() }); nextLaunchAt = null; } }
    lastAT = now;

    fx.onStep(ball);
    // Decay flashes
    for (const b of blocks){ b.flash = Math.max(0, b.flash - dt); b.__hitThisStep = false; }

    if (!ball) return;

    const L=EDGE, T=EDGE, R=worldW()-EDGE, B=worldH()-EDGE;
    const eps = 0.001;

    // Sub-stepped integration to reduce tunneling
    const maxComp = Math.max(Math.abs(ball.vx), Math.abs(ball.vy));
    const maxStep = Math.max(1, ball.r * 0.4);
    const steps = Math.max(1, Math.ceil(maxComp / maxStep));
    const stepx = ball.vx / steps, stepy = ball.vy / steps;

    for (let s=0; s<steps; s++){
      ball.x += stepx; ball.y += stepy;

      // Walls
      if (ball.x - ball.r < L){ ball.x = L + ball.r + eps; ball.vx = Math.abs(ball.vx); }
      if (ball.x + ball.r > R){ ball.x = R - ball.r - eps; ball.vx = -Math.abs(ball.vx); }
      if (ball.y - ball.r < T){ ball.y = T + ball.r + eps; ball.vy = Math.abs(ball.vy); }
      if (ball.y + ball.r > B){ ball.y = B - ball.r - eps; ball.vy = -Math.abs(ball.vy); }

      // Blocks
      for (const b of blocks){
        if (!b.active) continue;
        if (circleRectHit(ball.x, ball.y, ball.r, b)){
          const cx = Math.max(b.x, Math.min(ball.x, b.x + b.w));
          const cy = Math.max(b.y, Math.min(ball.y, b.y + b.h));
          const dx = ball.x - cx, dy = ball.y - cy;
          if (Math.abs(dx) > Math.abs(dy)){
            ball.vx = (dx>0? Math.abs(ball.vx): -Math.abs(ball.vx));
            ball.x = cx + (dx>0 ? ball.r + eps : -ball.r - eps);
          } else {
            ball.vy = (dy>0? Math.abs(ball.vy): -Math.abs(ball.vy));
            ball.y = cy + (dy>0 ? ball.r + eps : -ball.r - eps);
          }
          b.__hitThisStep = true;
        }
      }
    }

    // Friction
    ball.vx *= 0.999; ball.vy *= 0.999;

    // Triggers
    for (const b of blocks){
      if (b.__hitThisStep && (now - (b.lastHitAT || 0) > 0.09)){
        const name = noteList[b.noteIndex] || 'C4';
        try { triggerInstrument(instrument, name, now + 0.0005); } catch {}
        b.lastHitAT = now; b.flash = 0.18;
      }
      b.__hitThisStep = false;
    }
  }

  // Draw
  function draw(){
    // Sync scale on layout/zoom change
    const sNow = sizing.scale || 1;
    if (sNow !== lastScale){ rescaleAll(sNow / lastScale); lastScale = sNow; }

    resizeCanvasForDPR(canvas, ctx);
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#0b0f16'; ctx.fillRect(0,0,w,h);

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
    ctx.strokeRect(EDGE, EDGE, w-EDGE*2, h-EDGE*2);

    // Blocks (standardized look)
    for (const b of blocks){ b.w = blockSize(); b.h = blockSize(); }
    { const ac = ensureAudioContext(); const now = (ac?ac.currentTime:0); drawBlocksSection(ctx, blocks, 0, 0, null, 1, noteList, sizing, null, null, now); }

    // FX
    fx.draw(ctx);

    // Cannon
    ctx.beginPath(); ctx.arc(handle.x, handle.y, cannonR(), 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.stroke();

    // Drag vector
    if (draggingHandle && dragStart && dragCurr){
      ctx.beginPath(); ctx.moveTo(handle.x, handle.y); ctx.lineTo(dragCurr.x, dragCurr.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.stroke();
    }

    // Ball
    if (ball){
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2);
      ctx.fillStyle = 'white'; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
    }

    step();
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  // Loop callback (relaunch at captured phase each bar)
  function onLoop(){
    if (!lastLaunch) return;
    const ac = ensureAudioContext();
    const li = getLoopInfo?.(); const barLen = (li && li.barLen) ? li.barLen : 0;
    const phase = (launchPhase || 0) % (barLen || 1);
    if (!ac){ spawnBallFrom({ x: handle.x, y: handle.y, vx: lastLaunch.vx, vy: lastLaunch.vy, r: ballR() }); nextLaunchAt = null; return; }
    if (barLen && phase < 0.001){
      spawnBallFrom({ x: handle.x, y: handle.y, vx: lastLaunch.vx, vy: lastLaunch.vy, r: ballR() }); nextLaunchAt = null;
    } else {
      nextLaunchAt = ac.currentTime + (phase || 0);
    }
  }

  return { onLoop, reset: doReset, setInstrument: (n)=>{ instrument = n || instrument; }, element: canvas };
}
