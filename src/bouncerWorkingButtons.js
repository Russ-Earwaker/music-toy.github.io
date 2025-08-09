// src/bouncer.js
import { resizeCanvasForDPR, getCanvasPos, noteList, clamp } from './utils.js';
import { ensureAudioContext, triggerInstrument, getLoopInfo } from './audio.js';

const INSTRUMENTS = ['tone','Kick','Snare','Hat','Clap'];
const BLOCK_SIZE = 48;
const NOTE_BTN_H = 14;   // height of ▲ / ▼ click zones
const EDGE_PAD   = 6;    // keep cubes a bit off walls
const LONG_PRESS_MS = 600;
const TAP_PX = 6;
const TAP_MS = 300;

export function createBouncer(target) {
  // target: selector or .toy-panel element that contains .toy-header and .bouncer-canvas
  const shell  = (typeof target === 'string') ? document.querySelector(target) : target;
  const canvas = shell.querySelector('canvas.bouncer-canvas');
  const ctx    = canvas.getContext('2d');

  // ---------------- Header UI (Instrument + Tool buttons) ----------------
  const header = shell.querySelector('.toy-header');
  const right  = document.createElement('div');
  right.style.display = 'flex';
  right.style.gap = '8px';
  right.style.alignItems = 'center';
  header.style.position='relative'; header.style.zIndex='5';


  const label  = document.createElement('span'); label.textContent = 'Instrument:';
  const select = document.createElement('select');
  INSTRUMENTS.forEach(n => { const o=document.createElement('option'); o.value=o.textContent=n; select.appendChild(o); });

  const addBtn = document.createElement('button'); addBtn.textContent = 'Add Cube';
  const delBtn = document.createElement('button'); delBtn.textContent = 'Delete Cube';

  right.appendChild(label);
  right.appendChild(select);
  right.appendChild(addBtn);
  right.appendChild(delBtn);
  header.appendChild(right);

  let instrument = select.value || 'tone';
  select.addEventListener('change', () => { instrument = select.value; });

  function setInstrument(name){ instrument = name; select.value = name; }


  // Tool mode
  
  let tool = 'aim'; // 'aim' | 'add' | 'delete'
function reflectTool() {
  const isAdd = tool === 'add';
  const isDel = tool === 'delete';

  addBtn.classList.toggle('active', isAdd);
  delBtn.classList.toggle('active', isDel);

  addBtn.setAttribute('aria-pressed', isAdd);
  delBtn.setAttribute('aria-pressed', isDel);

  // simple pressed look without extra CSS
  const press = (btn, on) => {
    btn.style.transform   = on ? 'translateY(1px)' : '';
    btn.style.boxShadow   = on ? 'inset 0 2px 4px rgba(0,0,0,.25)' : '';
    btn.style.background  = on ? '#333' : '';
    btn.style.color       = on ? '#fff' : '';
    btn.style.borderColor = on ? '#555' : '';
  };
  press(addBtn, isAdd);
  press(delBtn, isDel);
}

  // init UI now that tool + reflectTool exist
  reflectTool(); console.log('[bouncer] init, tool=', tool);

  function setTool(t){
    tool = t;
    reflectTool(); console.log('[bouncer] init, tool=', tool);
    updateHint();
    console.log('[bouncer] tool ->', tool);
  }

 addBtn.addEventListener('pointerdown', (e) => { console.log('[bouncer] addBtn pointerdown');
  e.preventDefault(); e.stopPropagation();
  setTool(tool === 'add' ? 'aim' : 'add', 'user');
});

delBtn.addEventListener('pointerdown', (e) => { console.log('[bouncer] delBtn pointerdown');
  e.preventDefault(); e.stopPropagation();
  setTool(tool === 'delete' ? 'aim' : 'delete', 'user');
});
  // Hint / toast (bottom-left of panel)
  const hint = document.createElement('div');
  hint.style.cssText = `
    position:absolute; left:12px; bottom:12px; z-index:4;
    background:rgba(0,0,0,.7); color:#fff; padding:6px 8px;
    border:1px solid #333; border-radius:8px; font:12px system-ui,sans-serif;
    pointer-events:none; display:none;
  `;
  shell.appendChild(hint);
  let toastTimer = null;
  function updateHint(){
    if (tool === 'add')      { hint.textContent = 'Tap inside to place a cube'; hint.style.display='block'; }
    else if (tool === 'delete'){ hint.textContent = 'Tap a cube to delete it';   hint.style.display='block'; }
    else                     { hint.style.display='none'; }
  }
  function toast(msg){
    hint.textContent = msg;
    hint.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(updateHint, 900);
  }

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

  const spawnBall = (x,y,vx,vy)=> { ball = { x, y, vx, vy, r: 10 }; };
  const stopBall  = ()=> { ball = null; };

  // ---------------- Size & DPR ----------------
  function ensureSized(){
    if (!canvas._vw || !canvas._vh) resizeCanvasForDPR(canvas, ctx);
  }
  const doResize = ()=> resizeCanvasForDPR(canvas, ctx);
  requestAnimationFrame(() => { // allow CSS layout to apply
    doResize();
    if (blocks.length) randomizeBlocks(); // scatter if any blocks exist
  });
  window.addEventListener('resize', doResize);

  // ---------------- Helpers ----------------
  const hitBlock = (p)=> blocks.slice().reverse().find(b => p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+b.h);

  function addBlockAt(x,y,idx = Math.floor(Math.random()*noteList.length)){
    ensureSized();
    const vw = canvas._vw ?? canvas.width, vh = canvas._vh ?? canvas.height;
    const bx = clamp(x - BLOCK_SIZE/2, EDGE_PAD, vw - EDGE_PAD - BLOCK_SIZE);
    const by = clamp(y - BLOCK_SIZE/2, EDGE_PAD, vh - EDGE_PAD - BLOCK_SIZE);
    blocks.push({ x: bx, y: by, w: BLOCK_SIZE, h: BLOCK_SIZE, noteIndex: clamp(idx,0,noteList.length-1) });
  }
  function deleteBlock(b){ blocks = blocks.filter(x => x !== b); }
  function randomizeBlocks(){
    const vw = canvas._vw ?? canvas.width, vh = canvas._vh ?? canvas.height;
    blocks.forEach(b=>{
      b.x = Math.floor(Math.random()*(vw - 2*EDGE_PAD - b.w)) + EDGE_PAD;
      b.y = Math.floor(Math.random()*(vh - 2*EDGE_PAD - b.h)) + EDGE_PAD;
    });
  }

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
    if (tool === 'add') {
      addBlockAt(p.x, p.y);
      toast('Cube added');
      setTool('aim');
      return;
    }

    // DELETE tool: tap a cube to delete, then exit tool
    if (tool === 'delete') {
      if (b) { deleteBlock(b); toast('Cube deleted'); }
      setTool('aim');
      return;
    }

    // AIM tool
    if (b) {
      // Grid-like note change via top/bottom strip
      const localY = p.y - b.y;
      if (localY <= NOTE_BTN_H) { b.noteIndex = clamp(b.noteIndex + 1, 0, noteList.length-1); return; }
      if (localY >= b.h - NOTE_BTN_H) { b.noteIndex = clamp(b.noteIndex - 1, 0, noteList.length-1); return; }

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
          toast('Cube deleted');
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

    if (draggingBlock) { draggingBlock = null; return; }
    if (!aiming) return;
    aiming = false;

    // Fire the ball
    const vx = (p.x - aimStart.x) / 10;
    const vy = (p.y - aimStart.y) / 10;
    spawnBall(aimStart.x, aimStart.y, vx, vy);

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
  if (!lastLaunch) return;        // don’t respawn if we were reset
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

      // top ▲ zone
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
    if (nextLaunchAt != null) {
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
          triggerInstrument(instrument, noteName(b.noteIndex), ensureAudioContext().currentTime);
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

  return { onLoop, reset, setInstrument, element: canvas };
}