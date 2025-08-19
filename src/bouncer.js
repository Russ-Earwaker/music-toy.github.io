// src/bouncer.js — bouncer with zoom-only cube controls (top=up, mid=toggle, bot=down)
import { noteList, clamp, resizeCanvasForDPR } from './utils.js';
import { ensureAudioContext } from './audio-core.js';
import { triggerInstrument } from './audio-samples.js';
import { initToyUI } from './toyui.js';
import { initToySizing, randomizeRects, EDGE_PAD as EDGE, whichThirdRect, drawThirdsGuides} from './toyhelpers.js';
import { drawTileLabelAndArrows } from './ui-tiles.js';

const BASE_BLOCK_SIZE = 48;
const BASE_CANNON_R   = 10;
const BASE_BALL_R     = 7;
const BASE_MAX_SPEED  = 18;

export function createBouncer(selector){
  const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector;
  if (!shell){ console.warn('[bouncer] missing', selector); return null; }

  const panel = shell.closest?.('.toy-panel') || shell;
  const ui = initToyUI(panel, { toyName: 'Bouncer' });

  const canvas = document.createElement('canvas');
  canvas.className = 'bouncer-canvas';
  canvas.style.display = 'block';
  shell.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const sizing = initToySizing(panel, canvas, ctx);
  function worldW(){ return panel.clientWidth  || 356; }
  function worldH(){ return panel.clientHeight || 280; }
  const blockSize = () => Math.round(BASE_BLOCK_SIZE * (sizing.scale || 1));
  const cannonR   = () => Math.round(BASE_CANNON_R   * (sizing.scale || 1));
  const ballR     = () => Math.round(BASE_BALL_R     * (sizing.scale || 1));
  const maxSpeed  = () => BASE_MAX_SPEED * (sizing.scale || 1);

  let blocks = new Array(5).fill(0).map((_,i)=>({ x: EDGE+6, y: EDGE+6, w: blockSize(), h: blockSize(), noteIndex: (i*3)%noteList.length, active:true, flash:0 }));
  randomizeRects(blocks, worldW(), worldH(), EDGE);

  let handle = { x: worldW()*0.25, y: worldH()*0.5 };
  let draggingHandle = false;

  let ball = null; // {x,y,vx,vy,r}
  let lastLaunch = null; // {x,y,vx,vy,r}
  let drawingPath = false;
  let dragStart = null;
  let dragCurr = null;

  function spawnBallFrom(launch){
    ball = { x: launch.x, y: launch.y, vx: launch.vx, vy: launch.vy, r: ballR() };
  }

  function drawRoundedRect(x, y, w, h, r=10){
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }

  function draw(){
    resizeCanvasForDPR(canvas, ctx);
    const w = worldW(), h = worldH();
    ctx.clearRect(0,0,w,h);

    // draw cannon handle
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(handle.x|0, handle.y|0, cannonR(), 0, Math.PI*2); ctx.fill();

    // blocks
    for (const b of blocks){
      // base fill
      ctx.fillStyle = b.active ? '#f4932f' : '#293042';
      ctx.fillRect(b.x, b.y, b.w, b.h);

      // flash overlay
      if (b.flash>0){
        ctx.globalAlpha = Math.min(1, b.flash);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.globalAlpha = 1;
        b.flash = Math.max(0, b.flash - 0.04);
      }

      // zoom-only thirds boundaries
      if (panel.classList.contains('toy-zoomed')){ drawThirdsGuides(ctx, b); }

      // outline
      ctx.strokeStyle = '#11151d'; ctx.lineWidth = 2; ctx.strokeRect(b.x+0.5,b.y+0.5,b.w-1,b.h-1);
            const label = noteList[(b.noteIndex % noteList.length + noteList.length) % noteList.length] || '';
      drawTileLabelAndArrows(ctx, b, { label, active: b.active, zoomed: panel.classList.contains('toy-zoomed') });
}
// draw ball (simple)
    if (ball){
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2); ctx.fill();
      // simple movement with bounce
      ball.x += ball.vx; ball.y += ball.vy;
      if (ball.x - ball.r < EDGE || ball.x + ball.r > w-EDGE){ ball.vx *= -1; }
      if (ball.y - ball.r < EDGE || ball.y + ball.r > h-EDGE){ ball.vy *= -1; }
      // hit blocks
      for (const b of blocks){
        if (ball.x > b.x && ball.x < b.x+b.w && ball.y > b.y && ball.y < b.y+b.h){
          b.flash = 0.5;
          if (b.active){
            const nn = noteList[b.noteIndex] || 'C4';
            try { triggerInstrument(ui.instrument || 'tone', nn); } catch {}
          }
        }
      }
    }

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  /* unified via whichThirdRect in toyhelpers */
  function whichThird(b, py){
    const t1 = b.y + b.h/3, t2 = b.y + 2*b.h/3;
    if (py < t1) return 'up'; if (py < t2) return 'toggle'; return 'down';
  }

  let drag = null;
  canvas.addEventListener('pointerdown', (e)=>{
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    // handle?
    const dx = px - handle.x, dy = py - handle.y;
    if (Math.hypot(dx,dy) <= cannonR()+6 && !panel.classList.contains('toy-zoomed')){
      draggingHandle = true;
      dragStart = {x:px, y:py};
      dragCurr  = {x:px, y:py};
      drawingPath = true;
      return;
    }
    // blocks
    for (let i=blocks.length-1;i>=0;i--){
      const b = blocks[i];
      if (px>=b.x && px<=b.x+b.w && py>=b.y && py<=b.y+b.h){
        if (panel.classList.contains('toy-zoomed')){
          const third = whichThirdRect(b, py);
          if (third==='up') b.noteIndex = Math.min(noteList.length-1, b.noteIndex+1);
          else if (third==='down') b.noteIndex = Math.max(0, b.noteIndex-1);
          else b.active = !b.active;
          b.flash = 0.3;
        } else {
          drag = { i, dx: px - b.x, dy: py - b.y };
        }
        return;
      }
    }
  });
  canvas.addEventListener('pointermove', (e)=>{
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    if (draggingHandle){
      dragCurr = {x:px, y:py};
    } else if (drag){
      const b = blocks[drag.i];
      b.x = clamp(px - drag.dx, EDGE, worldW()-b.w-EDGE);
      b.y = clamp(py - drag.dy, EDGE, worldH()-b.h-EDGE);
    }
  });
  function endDrag(){
    if (draggingHandle){
      const vx = (dragStart.x - dragCurr.x) * 0.25 * (sizing.scale||1);
      const vy = (dragStart.y - dragCurr.y) * 0.25 * (sizing.scale||1);
      lastLaunch = { x: handle.x, y: handle.y, vx, vy, r: ballR() };
      spawnBallFrom(lastLaunch);
    }
    draggingHandle = false; drawingPath=false; drag=null;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  window.addEventListener('pointerup', endDrag, true);

  function onLoop(){
    if (lastLaunch){
      const L = { x: handle.x, y: handle.y, vx: lastLaunch.vx, vy: lastLaunch.vy, r: ballR() };
      spawnBallFrom(L);
    }
  }
  function reset(){ ball=null; lastLaunch=null; }
  return { onLoop, reset, setInstrument: ui.setInstrument, element: canvas };
}
