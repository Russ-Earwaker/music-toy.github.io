
import { noteList, clamp } from './utils.js?toy18';
import { ensureAudioContext, triggerInstrument, getLoopInfo } from './audio.js?toy18';
import { initToyUI } from './toyui.js?toy18';
import { drawBlock, drawNoteStripsAndLabel, NOTE_BTN_H, randomizeRects } from './toyhelpers.js?toy18';

const BASE_BLOCK_SIZE = 48;
const BASE_EDGE_PAD   = 6;
const BASE_CANNON_R   = 12;
const BASE_BALL_R     = 10;

const LONG_PRESS_MS = 600;
const MAX_BLOCKS = 5;
const ZOOM_FACTOR = 2;
const RAND_MIN_NOTE = 48; // C3
const RAND_MAX_NOTE = 72; // C5

function resizeBacking(canvas){
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(1, Math.floor(parseFloat(canvas.style.width) || canvas.clientWidth || 1));
  const cssH = Math.max(1, Math.floor(parseFloat(canvas.style.height) || canvas.clientHeight || 1));
  const targetW = Math.floor(cssW * dpr);
  const targetH = Math.floor(cssH * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH){
    canvas.width = targetW;
    canvas.height = targetH;
  }
  canvas._cssW = cssW;
  canvas._cssH = cssH;
}

function setHeaderTitle(shell, name){
  const head = shell.querySelector('.toy-header h2');
  if (head) head.textContent = name;
}

export function createBouncer(target){
  const shell  = (typeof target === 'string') ? document.querySelector(target) : target;
  const host = shell.querySelector('.toy-body') || shell;

  const canvas = (host.querySelector && (host.querySelector('canvas.bouncer-canvas') || host.querySelector('canvas'))) || (function(){
    const c = document.createElement('canvas');
    c.className='bouncer-canvas';
    c.style.display = 'block';
    host.appendChild(c); return c;
  })();
  const ctx = canvas.getContext('2d', { alpha:false });

  // Capture base CSS size once and treat it as immutable world base
  let baseCssW = host.clientWidth  || canvas.clientWidth || 300;
  let baseCssH = host.clientHeight || canvas.clientHeight || 300;
  canvas.style.width  = baseCssW + 'px';
  canvas.style.height = baseCssH + 'px';
  resizeBacking(canvas);

  // Zoom state
  let canvasScale = 1;   // 1 or 2
  let worldScale  = 1;   // scales entity sizes/vels
  const worldW = () => Math.max(1, Math.floor(baseCssW * canvasScale));
  const worldH = () => Math.max(1, Math.floor(baseCssH * canvasScale));

  const edgePad = () => BASE_EDGE_PAD * worldScale;
  const blockSize = () => BASE_BLOCK_SIZE * worldScale;
  const cannonR = () => BASE_CANNON_R * worldScale;
  const ballR   = () => BASE_BALL_R * worldScale;

  function makeBlocks(n = MAX_BLOCKS){
    const size = blockSize();
    const arr = Array.from({length:n}, ()=>({
      x: edgePad(), y: edgePad(), w: size, h: size,
      noteIndex: Math.min(noteList.length-1, Math.max(0, RAND_MIN_NOTE + Math.floor(Math.random() * (RAND_MAX_NOTE - RAND_MIN_NOTE + 1)))),
      activeFlash: 0
    }));
    randomizeRects(arr, worldW(), worldH(), edgePad());
    return arr;
  }
  let blocks = makeBlocks(MAX_BLOCKS);
  let ball = null;
  let cannon = { x: 60, y: 60, r: cannonR() };

  // Launch bookkeeping
  let lastLaunch = null;   // { x, y, vx, vy, offset }
  let nextLaunchAt = null;

  function spawnBall(x,y,vx,vy){ ball = { x, y, vx, vy, r: ballR() }; }
  const stopBall  = ()=> { ball = null; };

  function screenToWorld(e){
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left), y: (e.clientY - rect.top) };
  }

  function scaleEntities(s){
    if (s === 1) return;
    blocks.forEach(b=>{ b.x*=s; b.y*=s; b.w*=s; b.h*=s; });
    cannon.x*=s; cannon.y*=s; cannon.r*=s;
    if (ball){ ball.x*=s; ball.y*=s; ball.r*=s; ball.vx*=s; ball.vy*=s; }
    if (lastLaunch){ lastLaunch.x*=s; lastLaunch.y*=s; lastLaunch.vx*=s; lastLaunch.vy*=s; }
    worldScale *= s;
  }

  function clampEntitiesTo(vw, vh){
    const ep = edgePad();
    const maxX = Math.max(ep, vw - ep);
    const maxY = Math.max(ep, vh - ep);
    blocks.forEach(b=>{
      b.x = clamp(b.x, ep, Math.max(ep, vw - ep - b.w));
      b.y = clamp(b.y, ep, Math.max(ep, vh - ep - b.h));
    });
    cannon.x = clamp(cannon.x, ep + cannon.r, Math.max(ep + cannon.r, vw - ep - cannon.r));
    cannon.y = clamp(cannon.y, ep + cannon.r, Math.max(ep + cannon.r, vh - ep - cannon.r));
    if (ball){
      ball.x = clamp(ball.x, ep + ball.r, Math.max(ep + ball.r, maxX - ball.r));
      ball.y = clamp(ball.y, ep + ball.r, Math.max(ep + ball.r, maxY - ball.r));
    }
  }

  // Resize backing only (doesn't affect world size now)
  let resizeRAF = 0;
  const requestResize = ()=>{
    if (resizeRAF) cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(()=>{ resizeBacking(canvas); });
  };
  window.addEventListener('resize', requestResize);

  const ro = new ResizeObserver(requestResize);
  ro.observe(host);
  ro.observe(shell);
  ro.observe(canvas);

  function hitBlock(p){ return blocks.slice().reverse().find(b => p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+b.h); }
  const hitCannon = (p)=> ((p.x-cannon.x)**2 + (p.y-cannon.y)**2) <= (cannon.r*cannon.r);

  let aiming = false, aimStart={x:0,y:0}, aimCurrent={x:0,y:0};
  let draggingBlock = null, dragOff={x:0,y:0}, movedDuringDrag=false;
  let draggingCannon = false, cannonOff={x:0,y:0};
  let longPressTimer = null, longPressVictim = null;
  function clearLongPress(){ if (longPressTimer){ clearTimeout(longPressTimer); longPressTimer=null; } longPressVictim=null; }

  canvas.addEventListener('contextmenu', (e)=> e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    const p = screenToWorld(e);
    const b = hitBlock(p);
    movedDuringDrag = false;

    if (hitCannon(p)){
      draggingCannon = true;
      cannonOff.x = p.x - cannon.x; cannonOff.y = p.y - cannon.y;
      return;
    }

    if (b) {
      if (canvasScale > 1) {
        const localY = p.y - b.y;
        if (localY <= NOTE_BTN_H) { b.noteIndex = clamp(b.noteIndex + 1, 0, noteList.length-1); return; }
        if (localY >= b.h - NOTE_BTN_H) { b.noteIndex = clamp(b.noteIndex - 1, 0, noteList.length-1); return; }
      }
      draggingBlock = b;
      dragOff.x = p.x - b.x; dragOff.y = p.y - b.y;
      longPressVictim = b;
      clearLongPress();
      longPressTimer = setTimeout(()=>{
        if (longPressVictim === b && !movedDuringDrag){
          blocks = blocks.filter(x => x!==b);
          draggingBlock = null;
        }
        clearLongPress();
      }, LONG_PRESS_MS);
      return;
    }

    aiming = true;
    aimStart   = { x: p.x, y: p.y };
    aimCurrent = { x: p.x, y: p.y };
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = screenToWorld(e);
    const vw = worldW(), vh = worldH();
    if (draggingCannon){
      cannon.x = clamp(p.x - cannonOff.x, edgePad() + cannon.r, vw - edgePad() - cannon.r);
      cannon.y = clamp(p.y - cannonOff.y, edgePad() + cannon.r, vh - edgePad() - cannon.r);
      return;
    }
    if (draggingBlock) {
      movedDuringDrag = true;
      draggingBlock.x = clamp(p.x - dragOff.x, edgePad(), vw - edgePad() - draggingBlock.w);
      draggingBlock.y = clamp(p.y - dragOff.y, edgePad(), vh - edgePad() - draggingBlock.h);
      return;
    }
    if (aiming) { aimCurrent = { x: p.x, y: p.y }; }
  });

  canvas.addEventListener('pointerup', (e) => {
    canvas.releasePointerCapture?.(e.pointerId);
    clearLongPress();
    const p = screenToWorld(e);

    if (draggingCannon){ draggingCannon=false; return; }
    if (draggingBlock) { draggingBlock = null; return; }
    if (!aiming) return;
    aiming = false;

    const vx = ((p.x - aimStart.x) / 10) * worldScale;
    const vy = ((p.y - aimStart.y) / 10) * worldScale;
    spawnBall(aimStart.x, aimStart.y, vx, vy);

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

  function bounceOffRect(rect, ball){
    const dxLeft   = (ball.x + ball.r) - rect.x;
    const dxRight  = (rect.x + rect.w) - (ball.x - ball.r);
    const dyTop    = (ball.y + ball.r) - rect.y;
    const dyBottom = (rect.y + rect.h) - (ball.y - ball.r);
    if (dxLeft <= 0 || dxRight <= 0 || dyTop <= 0 || dyBottom <= 0) return;
    const minX = Math.min(dxLeft, dxRight);
    const minY = Math.min(dyTop, dyBottom);
    if (minX < minY){
      if (dxLeft < dxRight){ ball.x = rect.x - ball.r; ball.vx = -Math.abs(ball.vx); }
      else { ball.x = rect.x + rect.w + ball.r; ball.vx = Math.abs(ball.vx); }
    } else {
      if (dyTop < dyBottom){ ball.y = rect.y - ball.r; ball.vy = -Math.abs(ball.vy); }
      else { ball.y = rect.y + rect.h + ball.r; ball.vy = Math.abs(ball.vy); }
    }
  }

  function draw(){
    // Backing store updated to current style sizes
    resizeBacking(canvas);

    const dpr = window.devicePixelRatio || 1;
    ctx.resetTransform?.();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const vw = worldW(), vh = worldH();

    ctx.clearRect(0, 0, canvas.width/dpr, canvas.height/dpr);

    ctx.fillStyle = '#0b0f15';
    ctx.fillRect(0, 0, vw, vh);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(0.5, 0.5, vw-1, vh-1);

    if (aiming){
      ctx.lineWidth = 2;
      ctx.setLineDash([6,4]);
      ctx.strokeStyle = '#bbbbbb';
      ctx.beginPath(); ctx.moveTo(aimStart.x, aimStart.y); ctx.lineTo(aimCurrent.x, aimCurrent.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#bbbbbb'; ctx.beginPath(); ctx.arc(aimStart.x, aimStart.y, 4, 0, Math.PI*2); ctx.fill();
    }

    if (lastLaunch && nextLaunchAt != null){
      const audio = ensureAudioContext();
      if (audio.currentTime + 0.002 >= nextLaunchAt){
        spawnBall(lastLaunch.x, lastLaunch.y, lastLaunch.vx, lastLaunch.vy);
        const { barLen } = getLoopInfo();
        nextLaunchAt += barLen;
      }
    }

    if (ball) {
      ball.x += ball.vx; ball.y += ball.vy;
      const ep = edgePad();
      if (ball.x - ball.r < ep){ ball.x = ep + ball.r; ball.vx *= -1; }
      if (ball.x + ball.r > (vw - ep)){ ball.x = vw - ep - ball.r; ball.vx *= -1; }
      if (ball.y - ball.r < ep){ ball.y = ep + ball.r; ball.vy *= -1; }
      if (ball.y + ball.r > (vh - ep)){ ball.y = vh - ep - ball.r; ball.vy *= -1; }

      for (const b of blocks){
        const hit = (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w &&
                     ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h);
        if (hit){
          bounceOffRect(b, ball);
          b.activeFlash = 1.0;
          try {
            triggerInstrument(currentInstrument || ui.instrument, noteList[b.noteIndex], ensureAudioContext().currentTime);
          } catch(e) {
            // swallow audio errors to keep draw loop alive
            // console.warn('instrument trigger failed', e);
          }
        }
      }

      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2); ctx.fill();
    } else {
      ctx.fillStyle = '#777';
      ctx.beginPath(); ctx.arc(cannon.x, cannon.y, 4, 0, Math.PI*2); ctx.fill();
    }

    for (const b of blocks){
      drawBlock(ctx, b, { baseColor: '#ff8c00', active: b.activeFlash>0 });
      if (canvasScale > 1) drawNoteStripsAndLabel(ctx, b, noteList[b.noteIndex]);
      if (b.activeFlash>0) b.activeFlash = Math.max(0, b.activeFlash - 0.06);
    }

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
    blocks = [];
  }

  function applyZoom(zIn){
    const targetScale = zIn ? ZOOM_FACTOR : 1;
    if (targetScale === canvasScale) return;
    // 1) Set canvas CSS size from immutable base
    canvasScale = targetScale;
    canvas.style.width  = (baseCssW * canvasScale) + 'px';
    canvas.style.height = (baseCssH * canvasScale) + 'px';
    resizeBacking(canvas);
    // 2) Scale entities to match world
    const s = targetScale / worldScale;
    if (s !== 1){ scaleEntities(s); }
    // 3) Clamp to deterministic bounds
    clampEntitiesTo(worldW(), worldH());
  }

  const ui = initToyUI(shell, {
    toyName: 'Bouncer',
    showAdd: true,
    showDelete: true,
    deleteMode: 'until-empty',
    getDeletableCount: () => blocks.length,
    onRandom: () => { blocks = makeBlocks(MAX_BLOCKS); },
    onReset: () => { reset(); }
  });
  setHeaderTitle(shell, 'Bouncer');
  // Track instrument from this panel's header <select>
  let currentInstrument = ui.instrument;
  const instSel = shell.querySelector('.toy-instrument');
  if (instSel){
    instSel.addEventListener('change', ()=> { currentInstrument = instSel.value; });
  }
  // Also handle bubbled instrument events from toyui header
  shell.addEventListener('toy-instrument', (e)=>{
    const v = e?.detail?.value;
    if (v) currentInstrument = v;
  });



  
shell.addEventListener('toy-zoom', (e)=>{
  applyZoom(!!e?.detail?.zoomed);
  const header = shell.querySelector('.toy-header');
  if (header){
    if (e?.detail?.zoomed){
      header.style.userSelect = 'none';
      header.style.touchAction = 'none';
      header.dataset._pd = '1';
      header.addEventListener('_pd_dummy', ()=>{}); // no-op to keep reference
      const onPD = (ev)=> { ev.preventDefault(); };
      // store ref so we can remove later
      header._onPD && header.removeEventListener('pointerdown', header._onPD, { capture:true });
      header._onPD = onPD;
      header.addEventListener('pointerdown', onPD, { capture:true });
    } else {
      header.style.userSelect = '';
      header.style.touchAction = '';
      if (header._onPD){ header.removeEventListener('pointerdown', header._onPD, { capture:true }); header._onPD = null; }
    }
  }
});
  shell.addEventListener('toy-random', ()=> { blocks = makeBlocks(MAX_BLOCKS); });
  shell.addEventListener('toy-reset',  ()=> { reset(); });

  applyZoom(false);
  return { onLoop, reset, setInstrument: ui.setInstrument, element: canvas };
}
