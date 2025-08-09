// src/bouncer.js
import { resizeCanvasForDPR, getCanvasPos, noteList, clamp } from './utils.js';
import { ensureAudioContext, triggerInstrument, getLoopInfo } from './audio.js';
import { NOTE_BTN_H, EDGE_PAD, randomizeRects, clampRectWithin, drawNoteStripsAndLabel, hitRect, hitTopStrip, hitBottomStrip, findTopmostHit } from './toyhelpers.js';
import { initToyUI, DEFAULT_INSTRUMENTS } from './toyui.js';

const INSTRUMENTS = DEFAULT_INSTRUMENTS;
const BLOCK_SIZE = 48;
const LONG_PRESS_MS = 600;
const TAP_PX = 6;
const TAP_MS = 300;

export function createBouncer(target) {
  // target: selector or .toy-panel element that contains .toy-header and .bouncer-canvas
  const shell  = (typeof target === 'string') ? document.querySelector(target) : target;
  const canvas = shell.querySelector('canvas.bouncer-canvas');
  const ctx    = canvas.getContext('2d');

  // ---------------- Header UI via toyui ----------------
  const ui = initToyUI(shell, {
    instrumentOptions: INSTRUMENTS,
    defaultInstrument: 'tone',
    addText: 'Add Cube',
    delText: 'Delete Cube',
    hintAdd: 'Tap inside to place a cube',
    hintDelete: 'Tap a cube to delete it'
  });
  let instrument = ui.instrument;
  // Tool mode handled by toyui

  // ---------------- Blocks ----------------
  let blocks = [
    { x:  96, y:  96, w: BLOCK_SIZE, h: BLOCK_SIZE, noteIndex: noteList.indexOf('C4') },
    { x: 192, y:  32, w: BLOCK_SIZE, h: BLOCK_SIZE, noteIndex: noteList.indexOf('E4') },
    { x: 320, y: 128, w: BLOCK_SIZE, h: BLOCK_SIZE, noteIndex: noteList.indexOf('G4') },
    { x: 416, y:  80, w: BLOCK_SIZE, h: BLOCK_SIZE, noteIndex: noteList.indexOf('B4') }
  ];
  const noteName = (i)=> noteList[clamp(i,0,noteList.length-1)];

  // ---------------- Ball + timing (anti-desync) ----------------
  let ball = null;                     // {x,y,vx,vy,r}
  let startPos = { x: 60, y: 60 };     // “armed” spawn point for reset
  let lastLaunch = null;               // {x,y,vx,vy,offset}
  let nextLaunchAt = null;             // ac.currentTime at which to re-spawn
  let armed = false;

  const spawnBall = (x,y,vx,vy)=> { ball = { x, y, vx, vy, r: 10 }; };
  const stopBall  = ()=> { ball = null; };

  // ---------------- Size & DPR ----------------
  function ensureSized(){
    if (!canvas._vw || !canvas._vh) resizeCanvasForDPR(canvas, ctx);
  }
  const doResize = ()=> resizeCanvasForDPR(canvas, ctx);
  requestAnimationFrame(() => { // allow CSS layout to apply
    doResize();
    if (blocks.length) randomizeRects(blocks, canvas); // scatter if any blocks exist
  });
  window.addEventListener('resize', doResize);

  // ---------------- Helpers ----------------
    const hitBlock = (p)=> findTopmostHit(p, blocks);

  function addBlockAt(x,y,idx = Math.floor(Math.random()*noteList.length)){
    ensureSized();
    const vw = canvas._vw ?? canvas.width, vh = canvas._vh ?? canvas.height;
    const b = { x: x - BLOCK_SIZE/2, y: y - BLOCK_SIZE/2, w: BLOCK_SIZE, h: BLOCK_SIZE, noteIndex: clamp(idx,0,noteList.length-1) };
    clampRectWithin(canvas, b, EDGE_PAD);
    blocks.push(b);
  }
  function deleteBlock(b){ blocks = blocks.filter(x => x !== b); }

  // ---------------- Pointer input ----------------
  let aiming = false, aimStart={x:0,y:0}, aimCurrent={x:0,y:0};
  let draggingBlock = null, dragOff={x:0,y:0}, movedDuringDrag=false;

  // touch-friendly long-press delete while in aim mode
  let longPressTimer = null, longPressVictim = null;
  function clearLongPress(){ if (longPressTimer){ clearTimeout(longPressTimer); longPressTimer=null; } longPressVictim=null; }

  // prevent OS context menu (we’ve removed right-click delete anyway)
  canvas.addEventListener('contextmenu', (e)=> e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    const p = getCanvasPos(canvas, e);
    const b = hitBlock(p);
    movedDuringDrag = false;
    
    // ADD tool: place once then exit tool
    if (ui.tool === 'add') {
      addBlockAt(p.x, p.y);
      ui.toast('Cube added');
      ui.setTool('aim');
      return;
    }

    // DELETE tool: tap a cube to delete, then exit tool
    if (ui.tool === 'delete') {
      if (b) { deleteBlock(b); ui.toast('Cube deleted'); }
      ui.setTool('aim');
      return;
    }

    // AIM tool
    if (b) {
      // Grid-like note change via top/bottom strip
            if (hitTopStrip(p, b)) { b.noteIndex = clamp(b.noteIndex + 1, 0, noteList.length-1); return; }
      if (hitBottomStrip(p, b)) { b.noteIndex = clamp(b.noteIndex - 1, 0, noteList.length-1); return; }

      // Otherwise start dragging
      draggingBlock = b;
      dragOff.x = p.x - b.x;
      dragOff.y = p.y - b.y;

      // long-press delete (if user holds still)
      longPressVictim = b;
      clearLongPress();
      longPressTimer = setTimeout(()=>{
        if (longPressVictim === b && !movedDuringDrag){
          deleteBlock(b);
          draggingBlock = null;
          ui.toast('Cube deleted');
        }
        clearLongPress();
      }, LONG_PRESS_MS);
      return;
    }

    // Not on a block → aim shot
    aiming = true;
    aimStart   = { x: p.x, y: p.y };
    aimCurrent = { x: p.x, y: p.y };
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = getCanvasPos(canvas, e);
    if (draggingBlock) {
      movedDuringDrag = true;
      const vw = canvas._vw ?? canvas.width, vh = canvas._vh ?? canvas.height;
      draggingBlock.x = p.x - dragOff.x; draggingBlock.y = p.y - dragOff.y;
      clampRectWithin(canvas, draggingBlock, EDGE_PAD);
      return;
    }
    if (aiming) { aimCurrent = { x: p.x, y: p.y }; }
  });

  canvas.addEventListener('pointerup', (e) => {
    canvas.releasePointerCapture?.(e.pointerId);
    // ensure one-shot tool resets even if earlier return paths missed
    if (ui && (ui.tool === 'add' || ui.tool === 'delete')) { ui.setTool('aim'); } /*__AIM_RESET__*/
    clearLongPress();
    const p = getCanvasPos(canvas, e);

    if (draggingBlock) { draggingBlock = null; return; }
    if (!aiming) return;
    aiming = false;

    // Fire the ball
    const vx = (p.x - aimStart.x) / 10;
    const vy = (p.y - aimStart.y) / 10;
    spawnBall(aimStart.x, aimStart.y, vx, vy);
    armed = true;

    // Record launch offset for repeat
    const { loopStartTime, barLen } = getLoopInfo();
    const audio = ensureAudioContext();
    const offset = ((audio.currentTime - loopStartTime) % barLen + barLen) % barLen;
    lastLaunch = { x: aimStart.x, y: aimStart.y, vx, vy, offset };
    startPos   = { x: aimStart.x, y: aimStart.y };

    // schedule next (exact audio time; no setTimeout drift)
    nextLaunchAt = loopStartTime + barLen + offset;
  });
function reset(){
  // kill any active ball
  stopBall();                 // sets ball = null

  // clear launch scheduling
  armed = false;
  lastLaunch   = null;
  nextLaunchAt = null;

  // clear any aim/drag in progress
  aiming        = false;
  aimStart      = null;
  aimCurrent    = null;
  draggingBlock = null;
  dragOff       = null;

  // (optional) visually re-arm at the spawn point next draw
  // startPos is your default launch point; if you want a dot again:
  // aimStart = { ...startPos }; aimCurrent = { ...startPos }; aiming = false;

  draw?.();
}

function onLoop(loopStartTime){
  if (!armed || !lastLaunch) return;        // don’t respawn if we were reset
  const { barLen } = getLoopInfo();
  nextLaunchAt = loopStartTime + lastLaunch.offset;
}

  // ---------------- Physics ----------------
  function bounceOffRect(b, c) {
    const prevX = c.x - c.vx;
    const prevY = c.y - c.vy;
    const wasInsideX = prevX + c.r > b.x && prevX - c.r < b.x + b.w;
    const wasInsideY = prevY + c.r > b.y && prevY - c.r < b.y + b.h;

    if (!wasInsideX && !wasInsideY) {
      const penX = Math.min((c.x + c.r) - b.x, (b.x + b.w) - (c.x - c.r));
      const penY = Math.min((c.y + c.r) - b.y, (b.y + b.h) - (c.y - c.r));
      if (penX < penY) c.vx *= -1; else c.vy *= -1;
    } else if (!wasInsideX) {
      c.vx *= -1;
    } else {
      c.vy *= -1;
    }
    const vw = canvas._vw ?? canvas.width, vh = canvas._vh ?? canvas.height;
    c.x = clamp(c.x, c.r, vw - c.r);
    c.y = clamp(c.y, c.r, vh - c.r);
  }

  // ---------------- Render loop (and anti-desync relaunch) ----------------
  function draw() {
    const vw = canvas._vw ?? canvas.width;
    const vh = canvas._vh ?? canvas.height;
    ctx.clearRect(0, 0, vw, vh);

    // Draw cubes with ▲ / ▼ zones + note label
    blocks.forEach(b => {
      // body
      ctx.fillStyle = '#ff8c00';
      ctx.fillRect(b.x, b.y, b.w, b.h);

      // draw note strips and label
      drawNoteStripsAndLabel(ctx, b, noteName(b.noteIndex));

      // top ▲ zone (hit area preserved)
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(b.x, b.y, b.w, NOTE_BTN_H);
      ctx.fillStyle = '#fff';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('▲', b.x + b.w - 14, b.y + 11);

      // bottom ▼ zone
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(b.x, b.y + b.h - NOTE_BTN_H, b.w, NOTE_BTN_H);
      ctx.fillStyle = '#fff';
      ctx.fillText('▼', b.x + b.w - 14, b.y + b.h - 4);

      // note label
      ctx.fillStyle = '#000';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(noteName(b.noteIndex), b.x + 6, b.y + 16);
    });

    // aiming guide
    if (aiming) {
      ctx.strokeStyle = 'lime';
      ctx.beginPath();
      ctx.moveTo(aimStart.x, aimStart.y);
      ctx.lineTo(aimCurrent.x, aimCurrent.y);
      ctx.stroke();
    }

    // exact-time relaunch from audio clock
    if (armed && nextLaunchAt != null) {
      const audio = ensureAudioContext();
      if (audio.currentTime >= nextLaunchAt) {
        const { x, y, vx, vy } = lastLaunch || { x: startPos.x, y: startPos.y, vx: 0, vy: 0 };
        spawnBall(x, y, vx, vy);
        nextLaunchAt = null; // will be reset on next loop boundary
      }
    }

    // ball physics + sound hits
    if (ball) {
      ball.x += ball.vx; ball.y += ball.vy;

      if (ball.x - ball.r < EDGE_PAD || ball.x + ball.r > (vw - EDGE_PAD)) {
        ball.vx *= -1; ball.x = clamp(ball.x, ball.r + EDGE_PAD, vw - EDGE_PAD - ball.r);
      }
      if (ball.y - ball.r < EDGE_PAD || ball.y + ball.r > (vh - EDGE_PAD)) {
        ball.vy *= -1; ball.y = clamp(ball.y, ball.r + EDGE_PAD, vh - EDGE_PAD - ball.r);
      }

      blocks.forEach(b=>{
        const hit = (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w &&
                     ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h);
        if (hit){
          bounceOffRect(b, ball);
          triggerInstrument(ui.instrument, noteName(b.noteIndex), ensureAudioContext().currentTime);
        }
      });

      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2);
      ctx.fill();
    } else {
      // show “armed” dot
      ctx.fillStyle = '#777';
      ctx.beginPath();
      ctx.arc(startPos.x, startPos.y, 4, 0, Math.PI*2);
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }
  draw();

  return { onLoop, reset, element: canvas };
}