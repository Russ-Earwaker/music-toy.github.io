import { makeEdgeControllers, drawEdgeBondLines, handleEdgeControllerEdit, mapControllersByEdge, randomizeControllers, drawEdgeDecorations } from './bouncer-edges.js';
import { stepBouncer } from './bouncer-step.js';
import { noteList, resizeCanvasForDPR } from './utils.js';
import { ensureAudioContext, getLoopInfo } from './audio-core.js';
import { triggerInstrument } from './audio-samples.js';
import { initToyUI } from './toyui.js';
import { initToySizing } from './toyhelpers-sizing.js';
import { randomizeRects, EDGE_PAD as EDGE, hitRect, whichThirdRect, drawThirdsGuides } from './toyhelpers.js';
import { drawBlocksSection } from './ripplesynth-blocks.js';
import { stepIndexUp, stepIndexDown, noteValue } from './note-helpers.js';
import { circleRectHit } from './bouncer-helpers.js';
import { BASE_BLOCK_SIZE, BASE_CANNON_R, BASE_BALL_R, MAX_SPEED, LAUNCH_K } from './bouncer-consts.js';
import { createImpactFX } from './bouncer-impact.js';
import { getPoliteDensityForToy } from './polite-random.js';
// palette helpers: minor pentatonic aligned with Wheel/Rippler
function buildPentatonicPalette(noteList, rootName='C4', mode='minor', octaves=2){
  const baseIx = noteList.indexOf(rootName)>=0 ? noteList.indexOf(rootName) : 48; // C4 fallback
  const minor = [0,3,5,7,10]; // semitone offsets
  const major = [0,2,4,7,9];
  const offs = (mode==='major') ? major : minor;
  const out = [];
  const span = Math.max(1, Math.min(octaves, 3));
  for (let o=0;o<span;o++){
    for (let k=0;k<offs.length;k++){
      const ix = baseIx + offs[k] + o*12;
      if (ix >= 0 && ix < noteList.length) out.push(ix);
    }
  }
  return out.length ? out : [baseIx];
}
export function createBouncer(selector){
  // Runtime state predecl (avoid TDZ in handlers/draw)
  let handle;
  let draggingHandle, dragStart, dragCurr;
  let draggingBlock, dragBlockRef, dragOffset;
  let zoomDragCand, zoomDragStart, zoomTapT;
  let lastLaunch, launchPhase, nextLaunchAt, prevNow, ball;
  // Predeclare interaction/state vars to avoid TDZ issues in handlers/draw
  const BOUNCER_BARS_PER_LIFE = 1; // duration of a shot in bars
 const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector; if (!shell) return null; const panel = shell.closest('.toy-panel') || shell; const ui = initToyUI(panel, { toyName: 'Bouncer', defaultInstrument: 'Retro Square' });
  let toyId = (panel && panel.dataset && panel.dataset.toyid) ? String(panel.dataset.toyid) : null;
  if (!toyId){
    const kind = (panel && panel.dataset && panel.dataset.toy ? String(panel.dataset.toy) : 'bouncer').toLowerCase();
    const c = (window.__bouncerIds__ = window.__bouncerIds__ || { n: 0 });
    toyId = `${kind}-${++c.n}`;
    try { panel.dataset.toyid = toyId; } catch {}
  }
  toyId = String(toyId).toLowerCase(); let instrument = 'Retro-Square'; // locked for testing
  const edgeFlash = { left: 0, right: 0, top: 0, bot: 0 }; function flashEdge(which){ const m = mapControllersByEdge(edgeControllers); const c = m && m[which]; if (!c || !c.active) return; if (edgeFlash[which] !== undefined) edgeFlash[which] = 1.0; } const edgeLastHitAT = { left: 0, right: 0, top: 0, bot: 0 }; const edgeHitThisStep = { left: false, right: false, top: false, bot: false }; panel.addEventListener('toy-instrument', (e)=>{ instrument = (e.detail.value) || instrument; }); const host = panel.querySelector('.toy-body') || panel; const canvas = document.createElement('canvas'); canvas.style.width = '100%'; canvas.style.display='block'; host.appendChild(canvas); const ctx = canvas.getContext('2d', { alpha:false }); const sizing = initToySizing(panel, canvas, ctx, { squareFromWidth: true }); let edgeControllers = [];
  let __edgeAligned = false; function ensureEdgeControllers(w,h){ if (!edgeControllers.length){ edgeControllers = makeEdgeControllers(w, h, blockSize(), EDGE, noteList); } else { const s = blockSize(); const half = s/2; const map = mapControllersByEdge(edgeControllers); if (map.left){  map.left.x = EDGE;        map.left.y = h/2 - half; map.left.w = s; map.left.h = s; } if (map.right){ map.right.x = w-EDGE-s;   map.right.y = h/2 - half; map.right.w = s; map.right.h = s; }
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
  // Initialize interaction state early to avoid TDZ/undefined during UI init
  handle = { x: worldW()*0.22, y: worldH()*0.5 }; draggingHandle = false; dragStart = null; dragCurr = null;
  draggingBlock = false; dragBlockRef = null; dragOffset = {dx:0, dy:0}; zoomDragCand = null; zoomDragStart = null; zoomTapT = null; lastLaunch = null; launchPhase = 0; nextLaunchAt = null; prevNow = 0; ball = null;
  draggingBlock = false; dragBlockRef = null; dragOffset = {dx:0, dy:0};
  zoomDragCand = null; zoomDragStart = null; zoomTapT = null; lastLaunch = null; launchPhase = 0; nextLaunchAt = null; prevNow = 0; ball = null;
 const blockSize = () => Math.round(BASE_BLOCK_SIZE * (sizing.scale || 1)); const cannonR   = () => Math.round(BASE_CANNON_R   * (sizing.scale || 1)); const ballR     = () => Math.round(BASE_BALL_R     * (sizing.scale || 1)); const N_BLOCKS = 4; let visQ = [];
  let blocks = Array.from({length:N_BLOCKS}, (_,i)=> ({
    x: EDGE, y: EDGE, w: blockSize(), h: blockSize(),
    noteIndex: 0, active: true, flash: 0, lastHitAT: 0
  , oct:4 }));
  (()=>{ const w=worldW(), h=worldH(); const bx=Math.round(w*0.2), by=Math.round(h*0.2), bw=Math.round(w*0.6), bh=Math.round(h*0.6); 
  // Build shared minor pentatonic palette aligned with Wheel/Rippler (root C4)
  const palette = buildPentatonicPalette(noteList, 'C4', 'minor', 1);
  function stepIdxInPalette(currIdx, dir){
    // Find nearest index in palette, then move ±1 in palette order
    if (!Array.isArray(palette) || !palette.length) return currIdx||0;
    let nearest = 0, bestd = Infinity;
    for (let i=0;i<palette.length;i++){
      const d = Math.abs((currIdx||0) - palette[i]);
      if (d < bestd){ bestd = d; nearest = i; }
    }
    const next = (nearest + (dir>0?1:-1) + palette.length) % palette.length;
    return palette[next];
  }
  // Assign initial block notes from palette (even spread)
  for (let i=0;i<blocks.length;i++){
    blocks[i].noteIndex = palette[i % palette.length];
  }
randomizeRects(blocks, {x:bx,y:by,w:bw,h:bh}, EDGE); })(); // removed legacy chromatic random; palette-based assignment now; handle = { x: worldW()*0.22, y: worldH()*0.5 }; draggingHandle = false, dragStart = null, dragCurr = null; draggingBlock = false; zoomDragCand=null, zoomDragStart=null, zoomTapT=null; dragBlockRef = null; dragOffset = {dx:0,dy:0}; lastLaunch =  null;      // {vx, vy}
  launchPhase =  0;        // seconds into bar
  nextLaunchAt =  null; prevNow =  0;    // audio time to relaunch
  ball =  null;            // {x,y,vx,vy,r}
  const fx = createImpactFX(); let lastScale = sizing.scale || 1;
  // Shared state bag for step/draw helpers (populated each frame)
  const S = {};
  function processVisQ(S, now){ if (!S.visQ||!S.visQ.length) return; const due=[]; const rest=[]; for (const e of S.visQ){ if (e.t <= now + 1e-4) due.push(e); else rest.push(e); } S.visQ = rest; for (const e of due){ if (e.kind==='block'){ const bi = e.idx|0; if (blocks[bi]){ blocks[bi].flash = 1.0; blocks[bi].lastHitAT = now; } if (fx && fx.onHit) fx.onHit(e.x||handle.x, e.y||handle.y); } else if (e.kind==='edge'){ if (typeof flashEdge==='function') flashEdge(e.edge); } } }
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
    const pr = Number(panel?.dataset?.priority ?? '0.25');
    const density = getPoliteDensityForToy(toyId, 1, { priority: pr, minScale: 0.05 });
    // Determine how many blocks to keep active out of N (0..N), scale by density
    const N = blocks.length;
    const K = Math.max(0, Math.min(N, Math.round(density * N)));

    // Base random area (60% of panel), then scale range with density (busy mix => smaller area)
    const w = worldW(), h = worldH();
    const baseBW = Math.round(w * 0.6), baseBH = Math.round(h * 0.6);
    const areaScale = 0.2 + 0.8 * density; // busier => smaller area
    const bw = Math.max(EDGE*4, Math.round(baseBW * areaScale));
    const bh = Math.max(EDGE*4, Math.round(baseBH * areaScale));
    const bx = Math.round((w - bw) / 2);
    const by = Math.round((h - bh) / 2);

    // Position blocks within shrunk/expanded area
    randomizeRects(blocks, { x: bx, y: by, w: bw, h: bh }, EDGE);

    // Choose K blocks to keep active (others off) — evenly across the set
    const picks = [];
    if (K >= N) {
      for (let i=0;i<N;i++) picks.push(i);
    } else {
      const step = N / K;
      let pos = 0;
      for (let i=0;i<K;i++){ picks.push(Math.round(pos) % N); pos += step; }
      // de-dupe if rounding collided
      const uniq = Array.from(new Set(picks));
      while (uniq.length < K){
        const r = Math.floor(Math.random() * N);
        if (!uniq.includes(r)) uniq.push(r);
      }
      picks.length = 0; picks.push(...uniq);
    }
    for (let i=0;i<N;i++) blocks[i].active = false;
    for (const i of picks) if (blocks[i]) blocks[i].active = true;

    // Randomize edge controller notes as before
    randomizeControllers(edgeControllers, noteList);
}

  function doReset(){
    ball = null; lastLaunch = null;
    for (const b of blocks){ b.flash = 0; b.lastHitAT = 0; }
    if (edgeControllers){ for (const c of edgeControllers){ c.flash = 0; c.lastHitAT = 0; } }
  }
panel.addEventListener('toy-random', doRandom);
  panel.addEventListener('toy-reset', doReset);
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
          try { triggerInstrument(instrument, nm, now+0.0005, toyId); } catch (err) {}
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
      if (t==='up'){ zoomDragCand.noteIndex = stepIdxInPalette(zoomDragCand.noteIndex, +1); } else if (t==='down'){ zoomDragCand.noteIndex = stepIdxInPalette(zoomDragCand.noteIndex, -1); }
      const ac=ensureAudioContext(); const now=(ac?ac.currentTime:0);
      const nm=noteValue(noteList, zoomDragCand.noteIndex);
      try{ triggerInstrument(instrument, nm, now+0.0005, toyId); }catch(e){}
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
  const pal = (typeof palette!=='undefined' && Array.isArray(palette) && palette.length) ? palette : [0];
  const r = Math.floor(Math.random()*pal.length);
  edgeNotes.left.noteIndex  = pal[(r+0) % pal.length];
  edgeNotes.right.noteIndex = pal[(r+2) % pal.length];
  edgeNotes.top.noteIndex   = pal[(r+3) % pal.length];
  edgeNotes.bot.noteIndex   = pal[(r+1) % pal.length];
}
function draw(){
    const sNow = sizing.scale || 1;
    if (sNow !== lastScale){ rescaleAll(sNow / lastScale); lastScale = sNow; }
    const __s=resizeCanvasForDPR(canvas, ctx); const w = __s.width, h = __s.height;
    ctx.fillStyle = '#0b0f16'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
    ctx.strokeRect(EDGE, EDGE, w-EDGE*2, h-EDGE*2);
    ensureEdgeControllers(w,h);
    if (!__edgeAligned) {
      const pal = (typeof palette!=='undefined' && Array.isArray(palette) && palette.length) ? palette : null;
      if (pal){
        const m = mapControllersByEdge(edgeControllers);
        const order = ['left','right','top','bot'];
        let r = Math.floor(Math.random() * pal.length);
        order.forEach((k, idx)=>{ if(m && m[k]) m[k].noteIndex = pal[(r+idx*2)%pal.length]; });
        __edgeAligned = true;
      }
    }
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
    { const ac = ensureAudioContext(); const now = (ac?ac.currentTime:0); processVisQ(S, now);
    drawBlocksSection(ctx, blocks, 0, 0, null, 1, noteList, sizing, null, null, now); }
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
  ensureAudioContext, noteValue, noteList, instrument, fx, lastLaunch, nextLaunchAt, lastAT, flashEdge, handle, spawnBallFrom, edgeHitThisStep, edgeLastHitAT, getLoopInfo , triggerInstrument: (i,n,t)=>triggerInstrument(i, n, t,'bouncer', toyId), BOUNCER_BARS_PER_LIFE, setNextLaunchAt , setBallOut });
    stepBouncer(S);
    visQ = S.visQ || visQ;
  requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
function onLoop(loopStartTime){ /* no-op */ }
  return { onLoop, reset: doReset, setInstrument: (n)=>{ instrument = n || instrument; }, element: canvas };
}