// src/bouncer.js (unified cubes + cannon handle + toyui header)
import { resizeCanvasForDPR, getCanvasPos, noteList, clamp } from './utils.js';
import { ensureAudioContext, triggerInstrument, getLoopInfo } from './audio.js';
import { initToyUI } from './toyui.js';
import { drawBlock, drawNoteStripsAndLabel, NOTE_BTN_H } from './toyhelpers.js';

const BLOCK_SIZE = 48;
const EDGE_PAD   = 6;
const CANNON_R   = 12;
const LONG_PRESS_MS = 600;
const MAX_BLOCKS = 5;

export function createBouncer(target){
  const shell  = (typeof target === 'string') ? document.querySelector(target) : target;
  const canvas = shell.querySelector('canvas.bouncer-canvas') || shell.querySelector('canvas') || (()=>{
    const c = document.createElement('canvas'); c.className='bouncer-canvas'; c.style.width='100%'; c.style.height='328px'; shell.appendChild(c); return c;
  })();
  const ctx    = canvas.getContext('2d');

  // UI header
  const ui = initToyUI(shell, {
    addText: 'Add Node',
    hintAdd: 'Tap to place a cube',
    hintDelete: 'Tap cubes to delete',
    showAdd: true,
    showDelete: true,
    deleteMode: 'until-empty',
    getDeletableCount: () => blocks.length
  });

  console.log('[bouncer] init, tool=', ui.tool);

  // Blocks
  let blocks = [
    { x:  96, y:  96, w: BLOCK_SIZE, h: BLOCK_SIZE, noteIndex: noteList.indexOf('C4'), activeFlash:0 },
    { x: 192, y:  32, w: BLOCK_SIZE, h: BLOCK_SIZE, noteIndex: noteList.indexOf('E4'), activeFlash:0 },
    { x: 320, y: 128, w: BLOCK_SIZE, h: BLOCK_SIZE, noteIndex: noteList.indexOf('G4'), activeFlash:0 },
    { x: 416, y:  80, w: BLOCK_SIZE, h: BLOCK_SIZE, noteIndex: noteList.indexOf('B4'), activeFlash:0 }
  ];

  const noteName = (i)=> noteList[clamp(i,0,noteList.length-1)];

  // Ball + cannon
  let ball = null; // {x,y,vx,vy,r}
  let cannon = { x: 60, y: 60, r: CANNON_R };
  let lastLaunch = null;
  let nextLaunchAt = null;

  const spawnBall = (x,y,vx,vy)=> { ball = { x, y, vx, vy, r: 10 }; };
  const stopBall  = ()=> { ball = null; };

  function ensureSized(){
    if (!canvas._vw || !canvas._vh) resizeCanvasForDPR(canvas, ctx);
  }
  const doResize = ()=> resizeCanvasForDPR(canvas, ctx);
  requestAnimationFrame(() => { doResize(); randomizeBlocks(); });
  window.addEventListener('resize', doResize);

  function randomizeBlocks(){
    const vw = canvas._vw ?? canvas.width, vh = canvas._vh ?? canvas.height;
    blocks.forEach(b=>{
      b.x = Math.floor(Math.random()*(vw - 2*EDGE_PAD - b.w)) + EDGE_PAD;
      b.y = Math.floor(Math.random()*(vh - 2*EDGE_PAD - b.h)) + EDGE_PAD;
    });
  }

  // Hit helpers
  const hitBlock = (p)=> blocks.slice().reverse().find(b => p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+b.h);
  const hitCannon = (p)=> ((p.x-cannon.x)**2 + (p.y-cannon.y)**2) <= (cannon.r*cannon.r);

  // Input
  let aiming = false, aimStart={x:0,y:0}, aimCurrent={x:0,y:0};
  let draggingBlock = null, dragOff={x:0,y:0}, movedDuringDrag=false;
  let draggingCannon = false, cannonOff={x:0,y:0};
  let longPressTimer = null, longPressVictim = null;
  function clearLongPress(){ if (longPressTimer){ clearTimeout(longPressTimer); longPressTimer=null; } longPressVictim=null; }

  canvas.addEventListener('contextmenu', (e)=> e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    const p = getCanvasPos(canvas, e);
    const b = hitBlock(p);
    movedDuringDrag = false;

    if (ui.tool === 'add') {
      const bx = clamp(p.x - BLOCK_SIZE/2, EDGE_PAD, (canvas._vw ?? canvas.width) - EDGE_PAD - BLOCK_SIZE);
      const by = clamp(p.y - BLOCK_SIZE/2, EDGE_PAD, (canvas._vh ?? canvas.height) - EDGE_PAD - BLOCK_SIZE);
      if (blocks.length < MAX_BLOCKS) {
        blocks.push({ x: bx, y: by, w: BLOCK_SIZE, h: BLOCK_SIZE, noteIndex: noteList.indexOf('C4'), activeFlash:0 });
        ui.toast?.('Node added');
      }
      if (blocks.length >= MAX_BLOCKS) { ui.setAddEnabled?.(false); ui.setTool('aim'); }
      return;
    }
    if (ui.tool === 'delete') {
      if (b){ blocks = blocks.filter(x => x!==b); ui.toast?.('Deleted'); }
      if (blocks.length < MAX_BLOCKS) { ui.setAddEnabled?.(true); }
      if (typeof ui.onDeleted === 'function') ui.onDeleted();
      return;
    }

    if (hitCannon(p)){
      draggingCannon = true;
      cannonOff.x = p.x - cannon.x; cannonOff.y = p.y - cannon.y;
      return;
    }

    if (b) {
      const localY = p.y - b.y;
      if (localY <= NOTE_BTN_H) { b.noteIndex = clamp(b.noteIndex + 1, 0, noteList.length-1); return; }
      if (localY >= b.h - NOTE_BTN_H) { b.noteIndex = clamp(b.noteIndex - 1, 0, noteList.length-1); return; }
      draggingBlock = b;
      dragOff.x = p.x - b.x; dragOff.y = p.y - b.y;
      longPressVictim = b;
      clearLongPress();
      longPressTimer = setTimeout(()=>{
        if (longPressVictim === b && !movedDuringDrag){
          blocks = blocks.filter(x => x!==b);
          draggingBlock = null;
          ui.toast?.('Deleted');
          if (blocks.length < MAX_BLOCKS) { ui.setAddEnabled?.(true); }
        }
        clearLongPress();
      }, LONG_PRESS_MS);
      return;
    }

    // Aim shot
    aiming = true;
    aimStart   = { x: p.x, y: p.y };
    aimCurrent = { x: p.x, y: p.y };
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = getCanvasPos(canvas, e);
    if (draggingCannon){
      const vw = canvas._vw ?? canvas.width, vh = canvas._vh ?? canvas.height;
      cannon.x = clamp(p.x - cannonOff.x, EDGE_PAD + CANNON_R, vw - EDGE_PAD - CANNON_R);
      cannon.y = clamp(p.y - cannonOff.y, EDGE_PAD + CANNON_R, vh - EDGE_PAD - CANNON_R);
      return;
    }
    if (draggingBlock) {
      movedDuringDrag = true;
      const vw = canvas._vw ?? canvas.width, vh = canvas._vh ?? canvas.height;
      draggingBlock.x = clamp(p.x - dragOff.x, EDGE_PAD, vw - EDGE_PAD - draggingBlock.w);
      draggingBlock.y = clamp(p.y - dragOff.y, EDGE_PAD, vh - EDGE_PAD - draggingBlock.h);
      return;
    }
    if (aiming) { aimCurrent = { x: p.x, y: p.y }; }
  });

  canvas.addEventListener('pointerup', (e) => {
    canvas.releasePointerCapture?.(e.pointerId);
    clearLongPress();
    const p = getCanvasPos(canvas, e);

    if (draggingCannon){ draggingCannon=false; return; }
    if (draggingBlock) { draggingBlock = null; return; }
    if (!aiming) return;
    aiming = false;

    // Fire
    const vx = (p.x - aimStart.x) / 10;
    const vy = (p.y - aimStart.y) / 10;
    spawnBall(aimStart.x, aimStart.y, vx, vy);

    // Sync with loop
    const { loopStartTime, barLen } = getLoopInfo();
    const audio = ensureAudioContext();
    const offset = ((audio.currentTime - loopStartTime) % barLen + barLen) % barLen;
    lastLaunch = { x: aimStart.x, y: aimStart.y, vx, vy, offset };
    nextLaunchAt = loopStartTime + barLen + offset;
  });

  function onLoop(loopStartTime){
    if (!lastLaunch) return;
    const { barLen } = getLoopInfo();
    nextLaunchAt = loopStartTime + lastLaunch.offset;
  }

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
  }

  function draw(){
    ensureSized();
    const vw = canvas._vw ?? canvas.width;
    const vh = canvas._vh ?? canvas.height;
    ctx.clearRect(0, 0, vw, vh);

    // Aiming
    if (aiming) {
      ctx.strokeStyle = 'lime';
      ctx.beginPath();
      ctx.moveTo(aimStart.x, aimStart.y);
      ctx.lineTo(aimCurrent.x, aimCurrent.y);
      ctx.stroke();
    }

    // Relaunch
    if (nextLaunchAt != null) {
      const audio = ensureAudioContext();
      if (audio.currentTime >= nextLaunchAt) {
        const { x, y, vx, vy } = lastLaunch || { x: cannon.x, y: cannon.y, vx: 0, vy: 0 };
        spawnBall(x, y, vx, vy);
        nextLaunchAt = null;
      }
    }

    // Physics + hits
    if (ball) {
      ball.x += ball.vx; ball.y += ball.vy;
      if (ball.x - ball.r < EDGE_PAD || ball.x + ball.r > (vw - EDGE_PAD)) { ball.vx *= -1; }
      if (ball.y - ball.r < EDGE_PAD || ball.y + ball.r > (vh - EDGE_PAD)) { ball.vy *= -1; }

      blocks.forEach(b=>{
        const hit = (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w &&
                     ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h);
        if (hit){
          bounceOffRect(b, ball);
          triggerInstrument(ui.instrument, noteName(b.noteIndex), ensureAudioContext().currentTime);
          b.activeFlash = 1.0;
        }
      });

      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2);
      ctx.fill();
    } else {
      // armed dot at cannon
      ctx.fillStyle = '#777';
      ctx.beginPath();
      ctx.arc(cannon.x, cannon.y, 4, 0, Math.PI*2);
      ctx.fill();
    }

    // Draw blocks unified
    blocks.forEach(b => {
      drawBlock(ctx, b, { baseColor: '#ff8c00', active: b.activeFlash>0 });
      drawNoteStripsAndLabel(ctx, b, '');
      // centered label only
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const ts = Math.floor(Math.min(b.w, b.h) * 0.44);
      ctx.font = `${ts}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
      ctx.fillStyle = b.activeFlash>0 ? '#000000' : '#ffffff';
      ctx.fillText(noteName(b.noteIndex), b.x + b.w/2, b.y + b.h/2 + 0.5);
      ctx.restore();
      if (b.activeFlash>0) b.activeFlash = Math.max(0, b.activeFlash - 0.06);
    });

    // Draw cannon handle
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(cannon.x, cannon.y, CANNON_R, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = '#14532d';
    ctx.lineWidth = 2;
    ctx.stroke();

    requestAnimationFrame(draw);
  }
  draw();

  function reset(){
    stopBall();
    lastLaunch = null;
    nextLaunchAt = null;
    aiming = false;
    draggingBlock = null;
    draggingCannon = false;
  }

  return { onLoop, reset, setInstrument: ui.setInstrument, element: canvas };
}
