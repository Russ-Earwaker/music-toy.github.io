// src/bouncer.js — rebuilt cleanly with shared sizing/zoom
import { noteList, clamp, resizeCanvasForDPR } from './utils.js';
import { ensureAudioContext, triggerInstrument } from './audio.js';
import { initToyUI } from './toyui.js';
import { initToySizing, drawBlock, drawNoteStripsAndLabel, NOTE_BTN_H, randomizeRects, EDGE_PAD as EDGE } from './toyhelpers.js';

const BASE_BLOCK_SIZE = 48;
const BASE_CANNON_R   = 12;
const BASE_BALL_R     = 7;

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

  function spawnBallFrom(launch){
    const r = ballR();
    ball = { x: launch.x, y: launch.y, vx: launch.vx, vy: launch.vy, r };
  }

  // Physics helpers
  function circleRectMTV(cx, cy, r, rect){
    // Minimum translation vector for circle vs rect
    const nearestX = clamp(cx, rect.x, rect.x + rect.w);
    const nearestY = clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    const dist2 = dx*dx + dy*dy;
    if (dist2 > r*r) return null;
    const dist = Math.sqrt(Math.max(1e-6, dist2));
    const overlap = r - dist;
    // Normalized push
    const nx = (dist === 0) ? (cx < rect.x+rect.w/2 ? -1 : 1) : dx/dist;
    const ny = (dist === 0) ? (cy < rect.y+rect.h/2 ? -1 : 1) : dy/dist;
    return { nx, ny, overlap };
  }

  function updateBall(){
    if (!ball) return;
    // move
    ball.x += ball.vx;
    ball.y += ball.vy;

    // wall bounces
    if (ball.x - ball.r < EDGE){ ball.x = EDGE + ball.r; ball.vx *= -1; }
    if (ball.x + ball.r > worldW()-EDGE){ ball.x = worldW()-EDGE - ball.r; ball.vx *= -1; }
    if (ball.y - ball.r < EDGE){ ball.y = EDGE + ball.r; ball.vy *= -1; }
    if (ball.y + ball.r > worldH()-EDGE){ ball.y = worldH()-EDGE - ball.r; ball.vy *= -1; }

    // block collisions
    const now = ensureAudioContext().currentTime;
    for (const b of blocks){
      const mtv = circleRectMTV(ball.x, ball.y, ball.r, b);
      if (mtv){
        // move out
        ball.x += mtv.nx * mtv.overlap;
        ball.y += mtv.ny * mtv.overlap;
        // reflect velocity along the dominant axis
        if (Math.abs(mtv.nx) > Math.abs(mtv.ny)) ball.vx *= -1;
        else ball.vy *= -1;
        // trigger note + flash
        triggerInstrument(ui.instrument, b.noteIndex, now);
        b.activeFlash = 1.0;
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
    // If clicking a block (and zoomed), maybe adjust pitch
    const over = blocks.slice().reverse().find(b => p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+b.h);
    if (over){
      if (sizing.scale > 1){
        const localY = p.y - over.y;
        if (localY <= NOTE_BTN_H){ over.noteIndex = (over.noteIndex + 1) % noteList.length; return; }
        if (localY >= over.h - NOTE_BTN_H){ over.noteIndex = (over.noteIndex - 1 + noteList.length) % noteList.length; return; }
      }
      // allow dragging block
      over.drag = { dx: p.x - over.x, dy: p.y - over.y };
      over.dragging = true;
      return;
    }
    // Else: draw a path (single handle)
    drawingPath = true;
    dragStart = p;
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
  }
  function onUp(e){
    const p = dragStart;
    if (drawingPath && p){
      const end = getPos(e.changedTouches ? e.changedTouches[0]||e : e);
      const vx = (end.x - p.x) * 0.12; // power factor
      const vy = (end.y - p.y) * 0.12;
      lastLaunch = { x: handle.x, y: handle.y, vx, vy, r: ballR() };
      spawnBallFrom(lastLaunch);
    }
    drawingPath = false; dragStart = null; draggingHandle = false;
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
    if (ball){ ball.r = ballR(); }
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

    // drag path preview
    if (drawingPath && dragStart){
      const m = dragStart;
      ctx.strokeStyle = 'rgba(255,217,94,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(m.x, m.y);
      ctx.lineTo(handle.x, handle.y); ctx.stroke();
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
      if (lastLaunch){ lastLaunch.x *= ratio; lastLaunch.y *= ratio; lastLaunch.vx *= ratio; lastLaunch.vy *= ratio; lastLaunch.r = ballR(); }
    }
  });

  panel.addEventListener('toy-random', ()=>{
    randomizeRects(blocks, worldW(), worldH(), EDGE);
    for (const b of blocks){ b.noteIndex = Math.floor(Math.random()*noteList.length); b.activeFlash = 0; }
    // Kill ball; next path sets proper spawn; (respawn will occur on next drag)
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
