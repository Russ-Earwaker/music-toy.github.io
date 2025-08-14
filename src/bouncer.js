// src/bouncer.js — clean rebuild (no ellipses)
import { noteList, clamp, resizeCanvasForDPR } from './utils.js';
import { ensureAudioContext, triggerInstrument } from './audio.js';
import { initToyUI } from './toyui.js';
import { initToySizing, drawBlock, drawNoteStripsAndLabel, NOTE_BTN_H, randomizeRects, EDGE_PAD as EDGE } from './toyhelpers.js';

const BASE_BLOCK_SIZE = 48;
const BASE_CANNON_R   = 10; // slightly smaller anchor
const BASE_BALL_R     = 7;
const BASE_MAX_SPEED = 18; // px/frame at 1x


export function createBouncer(selector){
  const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector;
  if (!shell){ console.warn('[bouncer] missing', selector); return null; }
  const panel = shell.closest?.('.toy-panel') || shell;
  const host  = shell.querySelector('.toy-body') || shell;

  // Canvas
  const canvas = (host.querySelector && (host.querySelector('.bouncer-canvas') || host.querySelector('canvas'))) || (function(){
    const c = document.createElement('canvas');
    c.className = 'bouncer-canvas';
    c.style.display = 'block';
    c.style.touchAction = 'none';
    host.appendChild(c); return c;
  })();
  const ctx = canvas.getContext('2d', { alpha:false });

  // UI/instrument
  const ui = initToyUI(panel, { toyName: 'Bouncer', defaultInstrument: 'tone' });

  // Sizing
  const sizing = initToySizing(panel, canvas, ctx, { squareFromWidth: true });
  const worldW = () => sizing.vw();
  const worldH = () => sizing.vh();
  const blockSize = () => Math.round(BASE_BLOCK_SIZE * (sizing.scale || 1));
  const cannonR   = () => Math.round(BASE_CANNON_R   * (sizing.scale || 1));
  const ballR     = () => Math.round(BASE_BALL_R     * (sizing.scale || 1));
  const maxSpeed  = () => BASE_MAX_SPEED * (sizing.scale || 1);

  // State
  let blocks = new Array(5).fill(0).map((_,i)=>({ x: EDGE+6, y: EDGE+6, w: blockSize(), h: blockSize(), noteIndex: i*3 % noteList.length, activeFlash: 0 }));
  randomizeRects(blocks, worldW(), worldH(), EDGE);

  // Handle (spawn anchor)
  let handle = { x: worldW()*0.25, y: worldH()*0.5 };
  let draggingHandle = false;

  // Ball + last launch
  let ball = null; // {x,y,vx,vy,r}
  let lastLaunch = null; // {x,y,vx,vy,r}
  let drawingPath = false; // dragging to define a path
  let dragStart = null;
  let dragCurr = null;

  function spawnBallFrom(launch){
    ball = { x: launch.x, y: launch.y, vx: launch.vx, vy: launch.vy, r: ballR() };
  }

  // Physics helpers
  function circleRectMTV(cx, cy, r, rect){
    // Nearest point on rect to circle center
    const nearestX = clamp(cx, rect.x, rect.x + rect.w);
    const nearestY = clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    const dist2 = dx*dx + dy*dy;
    if (dist2 >= r*r) return null; // tangent or outside = no collision
    const dist = Math.sqrt(Math.max(1e-6, dist2));

    // Default normal from nearest point vector
    let nx = dx / (dist || 1);
    let ny = dy / (dist || 1);
    let overlap = r - dist;

    // If we are at a corner or fully inside, bias to the nearer axis to prevent sliding
    if (dist < 1e-6){
      const midX = rect.x + rect.w/2;
      const midY = rect.y + rect.h/2;
      const penL = Math.abs(cx - rect.x);
      const penR = Math.abs(rect.x + rect.w - cx);
      const penT = Math.abs(cy - rect.y);
      const penB = Math.abs(rect.y + rect.h - cy);
      const minX = Math.min(penL, penR);
      const minY = Math.min(penT, penB);
      if (minX < minY){
        nx = (cx < midX) ? -1 : 1; ny = 0;
      } else {
        nx = 0; ny = (cy < midY) ? -1 : 1;
      }
      overlap = r;
    }
    return { nx, ny, overlap };
  }

  function updateBall(){
    if (!ball) return;

    // Sub-steps to reduce tunneling (more when zoomed)
    const SUBSTEPS = (sizing.scale > 1 ? 3 : 2);
    for (let step=0; step<SUBSTEPS; step++){
      {
        const sp = Math.hypot(ball.vx, ball.vy);
        const ms = maxSpeed();
        if (sp > ms && sp > 0){ const s = ms / sp; ball.vx *= s; ball.vy *= s; }
      }
      ball.x += ball.vx / SUBSTEPS;
      ball.y += ball.vy / SUBSTEPS;

      // wall bounces
      if (ball.x - ball.r < EDGE){ ball.x = EDGE + ball.r; ball.vx = Math.abs(ball.vx); }
      if (ball.x + ball.r > worldW()-EDGE){ ball.x = worldW()-EDGE - ball.r; ball.vx = -Math.abs(ball.vx); }
      if (ball.y - ball.r < EDGE){ ball.y = EDGE + ball.r; ball.vy = Math.abs(ball.vy); }
      if (ball.y + ball.r > worldH()-EDGE){ ball.y = worldH()-EDGE - ball.r; ball.vy = -Math.abs(ball.vy); }

      // Iterative resolution to avoid sticking
      let iter = 0, collided = true;
      const now = ensureAudioContext().currentTime;
      const firedThisIter = new Set();
      while (collided && iter < 4){
        collided = false;
        for (let bi=0; bi<blocks.length; bi++){
          const b = blocks[bi];
          const mtv = circleRectMTV(ball.x, ball.y, ball.r, b);
          if (mtv){
            const SEP_EPS = 0.25;
            ball.x += (mtv.nx * (mtv.overlap + SEP_EPS));
            ball.y += (mtv.ny * (mtv.overlap + SEP_EPS));
            // reflect along normal
            const vn = ball.vx * mtv.nx + ball.vy * mtv.ny;
            if (vn < 0){
              ball.vx -= 2 * vn * mtv.nx;
              ball.vy -= 2 * vn * mtv.ny;
            }
            // trigger once per iter per block
            if (!firedThisIter.has(bi)){
              triggerInstrument(ui.instrument, noteList[b.noteIndex % noteList.length], now);
              b.activeFlash = 1.0;
              firedThisIter.add(bi);
            }
            collided = true;
            /* clamp speed */
            {
              const sp = Math.hypot(ball.vx, ball.vy);
              const ms = maxSpeed();
              if (sp > ms && sp > 0){ const s = ms / sp; ball.vx *= s; ball.vy *= s; }
            }
          }
        }
        iter++;
      }
    }
  }

  // Input
  function getPos(e){
    const r = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return { x, y };
  }

  function onDown(e){
    e.preventDefault();
    const p = getPos(e);
    // If near handle, drag it
    const d = Math.hypot(p.x - handle.x, p.y - handle.y);
    if (d <= Math.max(12, cannonR()+4)){
      draggingHandle = true;
      return;
    }
    // If clicking a block (and zoomed), maybe adjust pitch; otherwise drag
    const over = blocks.slice().reverse().find(b => p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+b.h);
    if (over){
      if (sizing.scale > 1){
        const localY = p.y - over.y;
        if (localY <= NOTE_BTN_H){ over.noteIndex = (over.noteIndex + 1) % noteList.length; return; }
        if (localY >= over.h - NOTE_BTN_H){ over.noteIndex = (over.noteIndex - 1 + noteList.length) % noteList.length; return; }
      }
      over.drag = { dx: p.x - over.x, dy: p.y - over.y };
      over.dragging = true;
      return;
    }
    // Else: draw a path (single handle)
    drawingPath = true;
    dragStart = p;
    dragCurr = p;
    handle.x = p.x; handle.y = p.y;
  }
  function onMove(e){
    const p = getPos(e);
    if (draggingHandle){
      handle.x = clamp(p.x, EDGE, worldW()-EDGE);
      handle.y = clamp(p.y, EDGE, worldH()-EDGE);
      return;
    }
    const draggingBlock = blocks.find(b => b.dragging);
    if (draggingBlock){
      draggingBlock.x = clamp(p.x - draggingBlock.drag.dx, EDGE, worldW()-EDGE - draggingBlock.w);
      draggingBlock.y = clamp(p.y - draggingBlock.drag.dy, EDGE, worldH()-EDGE - draggingBlock.h);
      return;
    }
    if (drawingPath){ dragCurr = p; }
  }
  function onUp(e){
    const p = dragStart;
    if (drawingPath && p){
      const end = dragCurr || getPos(e.changedTouches ? e.changedTouches[0]||e : e);
      let vx = (end.x - p.x) * 0.12; // power factor
      let vy = (end.y - p.y) * 0.12;
      // clamp to max speed
      {
        const mag = Math.hypot(vx, vy);
        const ms = maxSpeed();
        if (mag > ms && mag > 0){ const s = ms / mag; vx *= s; vy *= s; }
      }
      lastLaunch = { x: handle.x, y: handle.y, vx, vy, r: ballR() };
      spawnBallFrom(lastLaunch);
    }
    drawingPath = false; dragStart = null; dragCurr = null; draggingHandle = false;
    for (const b of blocks){ b.dragging = false; b.drag = null; }
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  canvas.addEventListener('touchstart', onDown, { passive:false });
  canvas.addEventListener('touchmove', onMove, { passive:false });
  window.addEventListener('touchend', onUp);

  // Draw
  function draw(){
    resizeCanvasForDPR(canvas, ctx);
    if (ball){ ball.r = ballR(); } // keep radius synced to zoom
    const W = worldW(), H = worldH();
    ctx.clearRect(0,0,W,H);

    // bg + border
    ctx.fillStyle = '#0b0f15'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.strokeRect(0.5,0.5,W-1,H-1);

    // blocks
    for (const b of blocks){
      drawBlock(ctx, b, { baseColor:'#ff8c00', active: b.activeFlash > 0 });
      if (sizing.scale > 1){
        drawNoteStripsAndLabel(ctx, b, noteList[b.noteIndex]);
      }
      if (b.activeFlash > 0) b.activeFlash = Math.max(0, b.activeFlash - 0.05);
    }

    // cannon/handle
    ctx.fillStyle = '#ffd95e';
    ctx.beginPath();
    ctx.arc(handle.x, handle.y, cannonR(), 0, Math.PI*2);
    ctx.fill();

    // drag path preview (dotted)
    if (drawingPath && dragStart){
      const m = dragStart;
      ctx.save();
      ctx.setLineDash([5,4]);
      ctx.strokeStyle = 'rgba(255,217,94,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(m.x, m.y);
      const d = dragCurr || m;
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
      ctx.restore();
    }

    // ball
    if (ball){
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2); ctx.fill();
      updateBall();
    }

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  // Header events
  panel.addEventListener('toy-zoom', (e)=>{
    const ratio = sizing.setZoom(!!(e?.detail?.zoomed));
    if (ratio !== 1){
      blocks.forEach(b=>{ b.x*=ratio; b.y*=ratio; b.w*=ratio; b.h*=ratio; });
      handle.x *= ratio; handle.y *= ratio;
      if (ball){ ball.x *= ratio; ball.y *= ratio; ball.vx *= ratio; ball.vy *= ratio; }
      if (lastLaunch){
        lastLaunch.x *= ratio;
        lastLaunch.y *= ratio;
        lastLaunch.vx *= ratio;
        lastLaunch.vy *= ratio;
        lastLaunch.r = ballR();
      }
    }
  });

  panel.addEventListener('toy-random', ()=>{
    randomizeRects(blocks, worldW(), worldH(), EDGE);
    for (const b of blocks){ b.noteIndex = Math.floor(Math.random()*noteList.length); b.activeFlash = 0; }
    // Kill ball; next path sets proper spawn
    ball = null;
  });

  panel.addEventListener('toy-reset', ()=>{
    ball = null;
    blocks = new Array(5).fill(0).map((_,i)=>({ x: EDGE+6, y: EDGE+6, w: blockSize(), h: blockSize(), noteIndex: i*3 % noteList.length, activeFlash: 0 }));
    randomizeRects(blocks, worldW(), worldH(), EDGE);
  });

  // Loop hook: relaunch each loop if we have a lastLaunch
  function onLoop(){
    if (lastLaunch){
      const L = { x: handle.x, y: handle.y, vx: lastLaunch.vx, vy: lastLaunch.vy, r: ballR() };
      spawnBallFrom(L);
    }
  }

  function reset(){ ball=null; lastLaunch=null; }

  return { onLoop, reset, setInstrument: ui.setInstrument, element: canvas };
}
