import { makeEdgeControllers, drawEdgeBondLines, handleEdgeControllerEdit, mapControllersByEdge, randomizeControllers, drawEdgeDecorations } from './bouncer-edges.js';
import { stepBouncer } from './bouncer-step.js';
import { noteList, resizeCanvasForDPR } from './utils.js';
import { ensureAudioContext, getLoopInfo } from './audio-core.js';
import { triggerInstrument } from './audio-samples.js';
import { gateTriggerForToy, isToyMuted } from './toy-audio.js';
import { initToyUI } from './toyui.js';
import { initToySizing } from './toyhelpers-sizing.js';
import { randomizeRects, EDGE_PAD as EDGE, hitRect, whichThirdRect, drawThirdsGuides } from './toyhelpers.js';
import { drawBlocksSection } from './ripplesynth-blocks.js';
import { stepIndexUp, stepIndexDown, noteValue } from './note-helpers.js';
import { circleRectHit } from './bouncer-helpers.js';
import { BASE_BLOCK_SIZE, BASE_CANNON_R, BASE_BALL_R, MAX_SPEED, LAUNCH_K } from './bouncer-consts.js';
import { createImpactFX } from './bouncer-impact.js';
export function createBouncer(selector){
  const BOUNCER_BARS_PER_LIFE = 1; // duration of a shot in bars
 const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector; if (!shell) return null; const panel = shell.closest('.toy-panel') || shell;
  const toyId = (panel && panel.dataset && panel.dataset.toy ? String(panel.dataset.toy) : 'bouncer').toLowerCase();
 const ui = initToyUI(panel, { toyName: 'Bouncer', defaultInstrument: 'Retro Square' }); let instrument = 'Retro Square'; // locked for testing
  const edgeFlash = { left: 0, right: 0, top: 0, bot: 0 }; function flashEdge(which){ const m = mapControllersByEdge(edgeControllers); const c = m && m[which]; if (!c || !c.active) return; if (edgeFlash[which] !== undefined) edgeFlash[which] = 1.0; } const edgeLastHitAT = { left: 0, right: 0, top: 0, bot: 0 }; const edgeHitThisStep = { left: false, right: false, top: false, bot: false }; panel.addEventListener('toy-instrument', (e)=>{ instrument = (e.detail.value) || instrument; }); const host = panel.querySelector('.toy-body') || panel; const canvas = document.createElement('canvas'); canvas.style.width = '100%'; canvas.style.display='block'; host.appendChild(canvas); const ctx = canvas.getContext('2d', { alpha:false }); const sizing = initToySizing(panel, canvas, ctx, { squareFromWidth: true }); let edgeControllers = []; function ensureEdgeControllers(w,h){ if (!edgeControllers.length){ edgeControllers = makeEdgeControllers(w, h, blockSize(), EDGE, noteList); } else { const s = blockSize(); const half = s/2; const map = mapControllersByEdge(edgeControllers); if (map.left){  map.left.x = EDGE;        map.left.y = h/2 - half; map.left.w = s; map.left.h = s; } if (map.right){ map.right.x = w-EDGE-s;   map.right.y = h/2 - half; map.right.w = s; map.right.h = s; }
      if (map.top){   map.top.x = w/2 - half;   map.top.y = EDGE;        map.top.w = s; map.top.h = s; }
      if (map.bot){   map.bot.x = w/2 - half;   map.bot.y = h-EDGE-s;    map.bot.w = s; map.bot.h = s; }
    }
  }
  
  // --- Canvas world dimensions in CSS pixels (match what we draw) ---
  function __getCssCanvasSize(){
    try {
      const r = canvas.getBoundingClientRect();
      const w = Math.floor(r.width || canvas.clientWidth || canvas.offsetWidth || 0);
      const h = Math.floor(r.height || canvas.clientHeight || canvas.offsetHeight || 0);
      return { w: Math.max(1, w), h: Math.max(1, h) };
    } catch { return { w: Math.max(1, canvas.clientWidth||0), h: Math.max(1, canvas.clientHeight||0) }; }
  }
  const worldW = ()=> __getCssCanvasSize().w;
  const worldH = ()=> __getCssCanvasSize().h;
 const blockSize = () => Math.round(BASE_BLOCK_SIZE * (sizing.scale || 1)); const cannonR   = () => Math.round(BASE_CANNON_R   * (sizing.scale || 1)); const ballR     = () => Math.round(BASE_BALL_R     * (sizing.scale || 1)); const N_BLOCKS = 4; let blocks = Array.from({length:N_BLOCKS}, (_,i)=> ({
    x: EDGE, y: EDGE, w: blockSize(), h: blockSize(),
    noteIndex: (i*3) % 12, active: true, flash: 0, lastHitAT: 0
  , oct:4 }));
  randomizeRects(blocks, worldW(), worldH(), EDGE); for (const b of blocks){ b.noteIndex = Math.floor(Math.random()*12);}; let handle = { x: worldW()*0.22, y: worldH()*0.5 }; let draggingHandle = false, dragStart = null, dragCurr = null; let draggingBlock = false; let zoomDragCand=null, zoomDragStart=null, zoomTapT=null; let dragBlockRef = null; let dragOffset = {dx:0,dy:0}; let lastLaunch = null;      // {vx, vy}
  let launchPhase = 0;        // seconds into bar
  let nextLaunchAt = null; let prevNow = 0;    // audio time to relaunch
  let ball = null;            // {x,y,vx,vy,r}
  const fx = createImpactFX(); let lastScale = sizing.scale || 1;

  // Shared state bag for step/draw helpers (populated each frame)
  const S = {};
// Gate audio triggers by bouncer's mute state
const __bouncerTrigger = gateTriggerForToy(toyId, (i,n,w)=>triggerInstrument(i,n,w,toyId));
function rescaleAll(f){
    if (!f || f === 1) return;
    for (const b of blocks){ b.x *= f; b.y *= f; b.w = blockSize(); b.h = blockSize(); }
    handle.x *= f; handle.y *= f;
    if (ball){ ball.x *= f; ball.y *= f; ball.vx *= f; ball.vy *= f; ball.r = ballR(); }
    if (lastLaunch){ lastLaunch.vx *= f; lastLaunch.vy *= f; }
  }
  panel.addEventListener('toy-zoom', (e)=>{
    sizing.setZoom && sizing.setZoom(!!e.detail.zoomed); const s = sizing.scale || 1;
    rescaleAll(s / lastScale);
    lastScale = s;
  });
  function doRandom(){
  // Randomize floating blocks within the central 60% of the canvas (same as Random button)
  const r = canvas.getBoundingClientRect();
  const W = r.width|0, H = r.height|0;
  const cw = Math.max(1, Math.floor(W * 0.60));
  const ch = Math.max(1, Math.floor(H * 0.60));
  const cx = Math.floor((W - cw) * 0.5);
  const cy = Math.floor((H - ch) * 0.5);
  const centerRect = { x: cx, y: cy, w: cw, h: ch };
  randomizeRects(blocks, centerRect, undefined, EDGE);
  lastLaunch = 0; // reset launch timer so launch visuals/music stay consistent after random
}

  function doReset(){
    ball = null; lastLaunch = null;
    for (const b of blocks){ b.flash = 0; b.lastHitAT = 0; }
    if (edgeControllers){ for (const c of edgeControllers){ c.flash = 0; c.lastHitAT = 0; } }
  }
panel.addEventListener('toy-random', doRandom);
  panel.addEventListener('toy-reset', doReset);
  // First-load: randomize within central 60% to match Random button
  try { doRandom(); } catch(e){}
  panel.addEventListener('toy-clear', doReset);
  function localPoint(evt){
    const rect = canvas.getBoundingClientRect();
    return { x: (evt.clientX - rect.left), y: (evt.clientY - rect.top) };
  }
  canvas.addEventListener('pointerdown', (e)=>{
    const p = localPoint(e);
    const zoomed = (sizing && typeof sizing.scale==='number') ? (sizing.scale > 1.01) : false;
    const hit = blocks.find(b => hitRect(p, b));
    const hitCtrl = edgeControllers.find(b => hitRect(p, b));

    if (zoomed){
      // In zoom: drag floating cubes; edit edge controllers
      if (hit && !hit.fixed){
        zoomDragCand = hit; zoomDragStart = {x:p.x, y:p.y}; zoomTapT = whichThirdRect(hit, p.y);
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault(); return;
      }
      if (hitCtrl){
        const beforeI = hitCtrl.noteIndex, beforeO = hitCtrl.oct || 4;
        const ok = handleEdgeControllerEdit(hitCtrl, p.y, whichThirdRect, noteList);
        if (ok && (hitCtrl.noteIndex !== beforeI || (hitCtrl.oct||4) !== beforeO)){
          const ac = ensureAudioContext(); const now = (ac ? ac.currentTime : 0);
          const nm = noteValue(noteList, hitCtrl.noteIndex);
          try { __bouncerTrigger(instrument, nm, now+0.0005); } catch (err) {}
        }
        return;
      }
    } else {
      // Normal view: drag floating cubes; ignore edge cubes
      if (hit && !hit.fixed){
        draggingBlock = true; dragBlockRef = hit; dragOffset = { dx: p.x - hit.x, dy: p.y - hit.y };
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault(); return;
      }
      if (hitCtrl) return;
    }

    // Otherwise, start aiming handle (will launch a ball on pointerup)
    handle.x = p.x; handle.y = p.y;
    draggingHandle = true; dragStart = { x: handle.x, y: handle.y }; dragCurr = p;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e)=>{
  const p=localPoint(e);
  if (zoomDragCand && !draggingBlock){ const dx=p.x-zoomDragStart.x, dy=p.y-zoomDragStart.y; if (Math.hypot(dx,dy) > 6){ draggingBlock=true; dragBlockRef=zoomDragCand; dragOffset={dx: p.x-zoomDragCand.x, dy: p.y-zoomDragCand.y}; } }
  if (draggingBlock && dragBlockRef){ let nx=p.x-dragOffset.dx, ny=p.y-dragOffset.dy; const w=worldW(), h=worldH(); nx=Math.max(EDGE, Math.min(nx, w-EDGE-dragBlockRef.w)); ny=Math.max(EDGE, Math.min(ny, h-EDGE-dragBlockRef.h)); dragBlockRef.x=nx; dragBlockRef.y=ny; e.preventDefault(); return; }
  if (draggingHandle) dragCurr = localPoint(e);
});
function endDrag(e){
  if (draggingBlock){
    draggingBlock=false; dragBlockRef=null; zoomDragCand=null;
    try{ if (e && e.pointerId != null) canvas.releasePointerCapture(e.pointerId); }catch(e){}
    return;
  }
  if (zoomDragCand){
    const p = localPoint(e);
    const t = whichThirdRect(zoomDragCand, p.y);
    if (t==='toggle'){ zoomDragCand.active=!zoomDragCand.active; }
    else {
      let prev=zoomDragCand.noteIndex, prevOct=zoomDragCand.oct||4;
      if (t==='up'){ stepIndexUp(zoomDragCand, noteList); } else if (t==='down'){ stepIndexDown(zoomDragCand, noteList); }
      const ac=ensureAudioContext(); const now=(ac?ac.currentTime:0);
      const nm=noteValue(noteList, zoomDragCand.noteIndex);
      try{ __bouncerTrigger(instrument, nm, now+0.0005); }catch(e){}
    }
    zoomDragCand=null;
    try{ if (e && e.pointerId != null) canvas.releasePointerCapture(e.pointerId); }catch(e){}
    return;
  }
  if (!draggingHandle) return;
  const p2 = localPoint(e);
  const dx = p2.x - dragStart.x, dy = p2.y - dragStart.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 2){
    const sc = (sizing.scale || 1);
    let vx = (p2.x - dragStart.x) * (LAUNCH_K / sc);
    let vy = (p2.y - dragStart.y) * (LAUNCH_K / sc);
    const sp = Math.hypot(vx, vy);
    if (sp > 1){
      const scl = Math.min(1, MAX_SPEED / sp); vx *= scl; vy *= scl;
      lastLaunch = { vx, vy };
      const ac = ensureAudioContext(); const li = (typeof getLoopInfo==='function' ? getLoopInfo() : null);
      if (ac && li){
        const now = ac.currentTime;
        const off = ((now - (li.loopStartTime||0)) % (li.barLen||1) + (li.barLen||1)) % (li.barLen||1);
        launchPhase = off;
      } else { launchPhase = 0; }
      spawnBallFrom({ x: handle.x, y: handle.y, vx, vy, r: ballR() });
      const __li = (typeof getLoopInfo==='function' ? getLoopInfo() : null);
      const __bl = __li ? __li.barLen : 0;
      if (__bl){ const __now = (ensureAudioContext()?.currentTime || 0);
        const __lifeEnd = __now + __bl * BOUNCER_BARS_PER_LIFE;
        ball.flightEnd = __lifeEnd;
        nextLaunchAt = __lifeEnd;
      } else { nextLaunchAt = null; }
      }
  }
  draggingHandle = false; dragCurr = dragStart = null;
  try{ if (e && e.pointerId != null) canvas.releasePointerCapture(e.pointerId); }catch(e){}
}
canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  window.addEventListener('pointerup', endDrag, true);
  function spawnBallFrom(L){ const o = {  x:L.x, y:L.y, vx:L.vx, vy:L.vy, r:L.r }; ball = o; fx.onLaunch(L.x, L.y); return o; }

  // setters for step module to persist primitive state
  function setNextLaunchAt(t){ nextLaunchAt = t; }
  function setBallOut(o){ ball = o; }
  let lastAT = 0;
  
  const edgeNotes = {
    left:  { noteIndex: Math.floor(Math.random()*noteList.length) },
    right: { noteIndex: Math.floor(Math.random()*noteList.length) },
    top:   { noteIndex: Math.floor(Math.random()*noteList.length) },
    bot:   { noteIndex: Math.floor(Math.random()*noteList.length) },
  };
  function randomizeEdgeNotes(){
    edgeNotes.left.noteIndex  = Math.floor(Math.random()*noteList.length);
    edgeNotes.right.noteIndex = Math.floor(Math.random()*noteList.length);
    edgeNotes.top.noteIndex   = Math.floor(Math.random()*noteList.length);
    edgeNotes.bot.noteIndex   = Math.floor(Math.random()*noteList.length);
  }
function draw(){
    const sNow = sizing.scale || 1;
    if (sNow !== lastScale){ rescaleAll(sNow / lastScale); lastScale = sNow; }
    const __s=resizeCanvasForDPR(canvas, ctx); const w = __s.width, h = __s.height;
    ctx.fillStyle = '#0b0f16'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
    ctx.strokeRect(EDGE, EDGE, w-EDGE*2, h-EDGE*2);
    ensureEdgeControllers(w,h);
    drawEdgeBondLines(ctx, w, h, EDGE, edgeControllers); const __ac2 = ensureAudioContext(); const __now2 = (__ac2?__ac2.currentTime:0);
    drawBlocksSection(ctx, edgeControllers, 0, 0, null, 1, noteList, sizing, null, null, __now2);
    drawEdgeDecorations(ctx, edgeControllers, EDGE, w, h);
    for (const c of edgeControllers){ if (c.flash>0){ c.flash *= 0.85; if (c.flash < 0.03) c.flash = 0; } }
    if (edgeFlash.left > 0 || edgeFlash.right > 0 || edgeFlash.top > 0 || edgeFlash.bot > 0){
      ctx.lineWidth = 4;
      if (edgeFlash.top > 0){ ctx.strokeStyle = `rgba(255,255,255,${edgeFlash.top})`; ctx.beginPath(); ctx.moveTo(EDGE, EDGE); ctx.lineTo(w-EDGE, EDGE); ctx.stroke(); }
      if (edgeFlash.bot > 0){ ctx.strokeStyle = `rgba(255,255,255,${edgeFlash.bot})`; ctx.beginPath(); ctx.moveTo(EDGE, h-EDGE); ctx.lineTo(w-EDGE, h-EDGE); ctx.stroke(); }
      if (edgeFlash.left > 0){ ctx.strokeStyle = `rgba(255,255,255,${edgeFlash.left})`; ctx.beginPath(); ctx.moveTo(EDGE, EDGE); ctx.lineTo(EDGE, h-EDGE); ctx.stroke(); }
      if (edgeFlash.right > 0){ ctx.strokeStyle = `rgba(255,255,255,${edgeFlash.right})`; ctx.beginPath(); ctx.moveTo(w-EDGE, EDGE); ctx.lineTo(w-EDGE, h-EDGE); ctx.stroke(); }
      edgeFlash.top *= 0.85; edgeFlash.bot *= 0.85; edgeFlash.left *= 0.85; edgeFlash.right *= 0.85;
      if (edgeFlash.top < 0.03) edgeFlash.top = 0;
      if (edgeFlash.bot < 0.03) edgeFlash.bot = 0;
      if (edgeFlash.left < 0.03) edgeFlash.left = 0;
      if (edgeFlash.right < 0.03) edgeFlash.right = 0;
    }
    for (const b of blocks){ b.w = blockSize(); b.h = blockSize(); }
    { const ac = ensureAudioContext(); const now = (ac?ac.currentTime:0); drawBlocksSection(ctx, blocks, 0, 0, null, 1, noteList, sizing, null, null, now); }
    fx.draw(ctx);
    ctx.beginPath(); ctx.arc(handle.x, handle.y, cannonR(), 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.stroke();
    if (draggingHandle && dragStart && dragCurr){
      ctx.beginPath(); ctx.moveTo(handle.x, handle.y); ctx.lineTo(dragCurr.x, dragCurr.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (ball){
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2);
      ctx.fillStyle = 'white'; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
    }
    Object.assign(S, { ball, blocks, edgeControllers, EDGE, worldW, worldH, ballR, blockSize, edgeFlash, mapControllersByEdge,
  ensureAudioContext, triggerInstrument, noteValue, noteList, instrument, fx, lastLaunch, nextLaunchAt, lastAT, flashEdge, handle, spawnBallFrom, edgeHitThisStep, edgeLastHitAT, getLoopInfo , BOUNCER_BARS_PER_LIFE, setNextLaunchAt , setBallOut });
    stepBouncer(S);
  requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  
function onLoop(loopStartTime){ /* scheduling driven by absolute times; no-op */ }



  return { onLoop, reset: doReset, setInstrument: (n)=>{ instrument = n || instrument; }, element: canvas };
}