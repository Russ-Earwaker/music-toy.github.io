// src/bouncer.js (toy18: guard tiny panels; stable header; audio-unlock safe)
import { noteList, clamp } from './utils.js?toy18';
import { ensureAudioContext, triggerInstrument, getLoopInfo } from './audio.js?toy18';
import { initToyUI } from './toyui.js?toy18';
import { drawBlock, drawNoteStripsAndLabel, NOTE_BTN_H } from './toyhelpers.js?toy18';

const BLOCK_SIZE = 48;
const EDGE_PAD   = 6;
const CANNON_R   = 12;
const LONG_PRESS_MS = 600;
const MAX_BLOCKS = 5;

function hardResize(canvas, host){
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  const rect = host.getBoundingClientRect();
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));
  if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
    canvas.width  = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas._vw = cssW;
    canvas._vh = cssH;
  }
}


function ensurePanelSizing(shell, host, headH){
  try{
    const cs = getComputedStyle(shell);
    if (cs.position === 'static') shell.style.position = 'relative';
  }catch{ shell.style.position = shell.style.position || 'relative'; }

  // Provide sensible defaults only if panel is tiny (e.g., 20x20)
  const w = Math.max(0, shell.clientWidth|0);
  const h = Math.max(0, shell.clientHeight|0);

  if (w < 220) shell.style.width = shell.style.width || '380px';
  if (h < (headH + 140)) shell.style.height = shell.style.height || (headH + 300) + 'px';

  // Make body fill the interior and have a minimum drawing area
  host.style.minHeight = host.style.minHeight || '260px';
  host.style.minWidth  = host.style.minWidth  || '320px';
}


function setHeaderTitle(shell, name){
  const h = shell?.querySelector?.('.toy-header');
  if (!h) return;
  let span = h.querySelector('.toy-title');
  if (!span) { span = document.createElement('span'); span.className='toy-title'; h.appendChild(span); }
  span.textContent = name;
}

export function createBouncer(target){
  const shell  = (typeof target === 'string') ? document.querySelector(target) : target;
  console.log('[Bouncer] mount on', shell?.id || shell);

  // Body
  let host = shell?.querySelector?.('.toy-body');
  if (!host){
    host = document.createElement('div');
    host.className = 'toy-body';
    shell?.appendChild?.(host);
  }

  const header = shell?.querySelector?.('.toy-header');
  const headH = header ? Math.max(44, Math.round(header.getBoundingClientRect().height)) : 44;

  Object.assign(host.style, {
    position: 'absolute',
    left: '10px', right: '10px', bottom: '10px',
    top: (headH + 6) + 'px',
    display: 'block',
    background: 'rgba(0,128,255,0.08)'
  });

  ensurePanelSizing(shell, host, headH);

  const canvas = (host.querySelector && (host.querySelector('canvas.bouncer-canvas') || host.querySelector('canvas'))) || (()=>{
    const c = document.createElement('canvas');
    c.className='bouncer-canvas';
    host.appendChild(c); return c;
  })();
  const ctx = canvas.getContext('2d');
  hardResize(canvas, host);
  console.log('[Bouncer] ctx ok, canvas css=', canvas.style.width, canvas.style.height);

  const ui = initToyUI(shell, {
    toyName: 'Bouncer',
    showAdd: true,
    showDelete: true,
    deleteMode: 'until-empty',
    getDeletableCount: () => blocks.length
  });
  setHeaderTitle(shell, 'Bouncer');
  requestAnimationFrame(() => setHeaderTitle(shell, 'Bouncer'));

  // Blocks
  let blocks = [
    { x:  96, y:  96, w: BLOCK_SIZE, h: BLOCK_SIZE, noteIndex: noteList.indexOf('C4'), activeFlash:0 },
    { x: 192, y:  32, w: BLOCK_SIZE, h: BLOCK_SIZE, noteIndex: noteList.indexOf('E4'), activeFlash:0 },
    { x: 320, y: 128, w: BLOCK_SIZE, h: BLOCK_SIZE, noteIndex: noteList.indexOf('G4'), activeFlash:0 },
    { x: 416, y:  80,  w: BLOCK_SIZE, h: BLOCK_SIZE, noteIndex: noteList.indexOf('B4'), activeFlash:0 }
  ];

  const noteName = (i)=> noteList[clamp(i,0,noteList.length-1)];

  // Ball + cannon
  let ball = null; // {x,y,vx,vy,r}
  let cannon = { x: 60, y: 60, r: CANNON_R };
  let lastLaunch = null;
  let nextLaunchAt = null;

  const spawnBall = (x,y,vx,vy)=> { ball = { x, y, vx, vy, r: 10 }; };
  const stopBall  = ()=> { ball = null; };

  function maybeStartDemo(){
    if (window.__audioUnlocked) {
      if (!ball) spawnBall(cannon.x + 10, cannon.y + 8, 3.2, 2.4);
    } else {
      const once = () => { if (!ball) spawnBall(cannon.x + 10, cannon.y + 8, 3.2, 2.4); window.removeEventListener('audio-unlocked', once); };
      window.addEventListener('audio-unlocked', once);
    }
  }
  maybeStartDemo();

  const doResize = ()=> hardResize(canvas, host);
  window.addEventListener('resize', doResize);
  new ResizeObserver(() => hardResize(canvas, host)).observe(host);
  requestAnimationFrame(doResize);

  function hitBlock(p){ return blocks.slice().reverse().find(b => p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+b.h); }
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
    const rect = canvas.getBoundingClientRect();
    const p = { x: (e.clientX-rect.left), y: (e.clientY-rect.top) };
    const b = hitBlock(p);
    movedDuringDrag = false;

    if (ui.tool === 'add') {
      const bx = clamp(p.x - BLOCK_SIZE/2, EDGE_PAD, (canvas._vw ?? rect.width) - EDGE_PAD - BLOCK_SIZE);
      const by = clamp(p.y - BLOCK_SIZE/2, EDGE_PAD, (canvas._vh ?? rect.height) - EDGE_PAD - BLOCK_SIZE);
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
    const rect = canvas.getBoundingClientRect();
    const p = { x: (e.clientX-rect.left), y: (e.clientY-rect.top) };
    if (draggingCannon){
      const vw = canvas._vw ?? rect.width, vh = canvas._vh ?? rect.height;
      cannon.x = clamp(p.x - cannonOff.x, EDGE_PAD + CANNON_R, vw - EDGE_PAD - CANNON_R);
      cannon.y = clamp(p.y - cannonOff.y, EDGE_PAD + CANNON_R, vh - EDGE_PAD - CANNON_R);
      return;
    }
    if (draggingBlock) {
      movedDuringDrag = true;
      const vw = canvas._vw ?? rect.width, vh = canvas._vh ?? rect.height;
      draggingBlock.x = clamp(p.x - dragOff.x, EDGE_PAD, vw - EDGE_PAD - draggingBlock.w);
      draggingBlock.y = clamp(p.y - dragOff.y, EDGE_PAD, vh - EDGE_PAD - draggingBlock.h);
      return;
    }
    if (aiming) { aimCurrent = { x: p.x, y: p.y }; }
  });

  canvas.addEventListener('pointerup', (e) => {
    canvas.releasePointerCapture?.(e.pointerId);
    clearLongPress();
    const rect = canvas.getBoundingClientRect();
    const p = { x: (e.clientX-rect.left), y: (e.clientY-rect.top) };

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

  function onLoop(loopStartTime){ if (!lastLaunch) return; nextLaunchAt = loopStartTime + lastLaunch.offset; }

  function bounceOffRect(b, c) {
    const prevX = c.x - c.vx;
    const prevY = c.y - c.vy;
    const wasInsideX = prevX + c.r > b.x && prevX - c.r < b.x + b.w;
    const wasInsideY = prevY + c.r > b.y && prevY - c.r < b.y + b.h;
    if (!wasInsideX && !wasInsideY) {
      const penX = Math.min((c.x + c.r) - b.x, (b.x + b.w) - (c.x - c.r));
      const penY = Math.min((c.y + c.r) - b.y, (b.y + b.h) - (c.y - c.r));
      if (penX < penY) c.vx *= -1; else c.vy *= -1;
    } else if (!wasInsideX) { c.vx *= -1; } else { c.vy *= -1; }
  }

  function draw(){
    hardResize(canvas, host);
    const vw = canvas._vw ?? canvas.width;
    const vh = canvas._vh ?? canvas.height;
    const g = ctx;

    // background
    g.fillStyle = '#0b0f15';
    g.fillRect(0, 0, vw, vh);

    // walls
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.strokeRect(0.5, 0.5, vw-1, vh-1);

    // ball & interactions
    if (ball) {
      ball.x += ball.vx; ball.y += ball.vy;
      if (ball.x - ball.r < EDGE_PAD || ball.x + ball.r > (vw - EDGE_PAD)) { ball.vx *= -1; }
      if (ball.y - ball.r < EDGE_PAD || ball.y + ball.r > (vh - EDGE_PAD)) { ball.vy *= -1; }
      blocks.forEach(b=>{
        const hit = (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w &&
                     ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h);
        if (hit){ bounceOffRect(b, ball); triggerInstrument(ui.instrument, noteName(b.noteIndex), ensureAudioContext().currentTime); b.activeFlash = 1.0; }
      });
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(ball.x, ball.y, ball.r, 0, Math.PI*2); g.fill();
    } else {
      g.fillStyle = '#777';
      g.beginPath(); g.arc(cannon.x, cannon.y, 4, 0, Math.PI*2); g.fill();
    }

    // blocks
    blocks.forEach(b => {
      drawBlock(g, b, { baseColor: '#ff8c00', active: b.activeFlash>0 });
      drawNoteStripsAndLabel(g, b, '');
      g.save(); g.textAlign='center'; g.textBaseline='middle';
      const ts = Math.floor(Math.min(b.w, b.h) * 0.44);
      g.font = `${ts}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
      g.fillStyle = b.activeFlash>0 ? '#000000' : '#ffffff';
      g.fillText(noteName(b.noteIndex), b.x + b.w/2, b.y + b.h/2 + 0.5);
      g.restore();
      if (b.activeFlash>0) b.activeFlash = Math.max(0, b.activeFlash - 0.06);
    });

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

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
