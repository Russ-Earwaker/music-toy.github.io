import { makeEdgeControllers, drawEdgeBondLines, handleEdgeControllerEdit, mapControllersByEdge, randomizeControllers, drawEdgeDecorations } from './bouncer-edges.js';
import { stepBouncer } from './bouncer-step.js';
import { noteList, resizeCanvasForDPR } from './utils.js';
import { ensureAudioContext, getLoopInfo } from './audio-core.js';
import { triggerInstrument } from './audio-samples.js';
import { initToyUI } from './toyui.js';
import { initToySizing } from './toyhelpers-sizing.js';
import { randomizeRects, EDGE_PAD as EDGE, hitRect, whichThirdRect, drawThirdsGuides } from './toyhelpers.js';
import { drawBlocksSection } from './ripplesynth-blocks.js';
// board scale via rect baseline (rippler-style)
import { createImpactFX } from './bouncer-impact.js';
import { createBouncerDraw } from './bouncer-render.js';
import { installAdvancedCubeUI } from './bouncer-adv-ui.js';
import { installBouncerInteractions } from './bouncer-interactions.js';
import { createBouncerParticles } from './bouncer-particles.js';
import { getPoliteDensityForToy } from './polite-random.js';
import { buildPentatonicPalette, processVisQ as processVisQBouncer } from './bouncer-actions.js';
import { computeLaunchVelocity, updateLaunchBaseline, setSpawnSpeedFromBallSpeed , getLaunchDiag} from './bouncer-geom.js';
import { localPoint as __localPoint } from './bouncer-pointer.js';
import { installSpeedUI } from './bouncer-speed-ui.js';
import { installBouncerOSD } from './bouncer-osd.js';
import { initBouncerPhysWorld } from './bouncer-physworld.js';
import './bouncer-scale.js';
const noteValue = (list, idx)=> list[Math.max(0, Math.min(list.length-1, (idx|0)))];
const BOUNCER_BARS_PER_LIFE = 1;
const MAX_SPEED = 700, LAUNCH_K = 0.9;
const BASE_BLOCK_SIZE = 44, BASE_CANNON_R = 10, BASE_BALL_R = 7;




export function createBouncer(selector){
  const shell = (typeof selector==='string') ? document.querySelector(selector) : selector; if (!shell) return null;
  const panel = shell.closest('.toy-panel') || shell;
  const ui = initToyUI(panel, { toyName: 'Bouncer', defaultInstrument: 'Retro Square' }) || {};
  let instrument = ui.instrument; panel.addEventListener('toy-instrument', (e)=>{ instrument = (e?.detail?.value)||instrument; });
  let speedFactor = parseFloat((panel?.dataset?.speed)||'0.60'); // 0.60 = calmer default
  const toyId = (panel?.dataset?.toy || 'bouncer').toLowerCase();

  const host = panel.querySelector('.toy-body') || panel;
  const canvas = document.createElement('canvas'); canvas.style.width='100%'; canvas.style.display='block';canvas.style.height='100%'; host.appendChild(canvas);
  try{ canvas.removeAttribute('data-lock-scale'); canvas.style.transform=''; }catch{};
  const ctx = canvas.getContext('2d', { alpha:false });
  const sizing = initToySizing(panel, canvas, ctx, { squareFromWidth: true });

  // Physics world scaffold (dynamic = no behaviour change)
  const __phys = initBouncerPhysWorld(panel, canvas, sizing, { mode: 'dynamic' });
  
  try{ __phys.setMode && __phys.setMode('fixed'); }catch{}
// Fixed-physics world: capture once and keep constant across modes
  let PHYS_W = 0, PHYS_H = 0;
  const physW = ()=> (PHYS_W || worldW());
  function lockPhysWorld(){ if (!PHYS_W || !PHYS_H){ PHYS_W = worldW(); PHYS_H = worldH(); } }
  const physH = ()=> (PHYS_H || worldH());
  
  function renderScale(){
    const CW = canvas.width || 1;
    const CH = canvas.height || 1;
    return { sx: (CW/physW()), sy: (CH/physH()), tx: 0, ty: 0 };
  }
  function toWorld(pt){
    const { sx, sy } = renderScale();
    return { x: pt.x / (sx || 1), y: pt.y / (sy || 1) };
  }
// On-screen debug (set panel.dataset.debug='1' to enable)
  const __osd = document.createElement('div');
  __osd.style.cssText='position:absolute;left:6px;top:6px;padding:4px 6px;background:rgba(0,0,0,0.4);color:#fff;font:12px/1.3 monospace;z-index:10;border-radius:4px;display:none;pointer-events:none';
  if (panel?.dataset?.debug==='1'){ panel.appendChild(__osd); }
  function __tickOSD(){
    __osd.style.display = (panel?.dataset?.debug==='1') ? 'block' : 'none';
    if (__osd.style.display==='block' && !__osd.parentNode){ try{ panel.appendChild(__osd); }catch{} } /*OSD_ATTACH*/
    if (__osd.style.display==='block'){
      const d = getLaunchDiag?.()||{};
      const sp = (typeof speedFactor!=='undefined')? speedFactor : (__getSpeed?__getSpeed():1);
      const vmag = (ball && ball.vx!=null) ? Math.hypot(ball.vx, ball.vy) : 0;
      __osd.textContent = `scale=${sizing.scale.toFixed(3)} speed=${sp.toFixed(2)} v=${vmag.toFixed(3)} baseDiag=${(d.baseDiag||0).toFixed(1)} ppfOv=${(d.ppfOverride||0).toFixed(3)}`;
    }
    requestAnimationFrame(__tickOSD);
  }
  requestAnimationFrame(__tickOSD); /*OSD_DEBUG*/

  const __getSpeed = installSpeedUI(panel, sizing, parseFloat((panel?.dataset?.speed)||'1.00'));
  // apply speed changes to queued launch
  let __speedCache = (__getSpeed?__getSpeed():1);
  panel.addEventListener('toy-speed', (e)=>{ const ns = (e && e.detail && Number(e.detail.value)) ? e.detail.value : (__getSpeed?__getSpeed():1); const os = __speedCache || 1; const ratio = os ? (ns/os) : 1; __speedCache = ns; try{ if (lastLaunch && Number.isFinite(ratio) && ratio>0){ lastLaunch.vx *= ratio; lastLaunch.vy *= ratio; } }catch{} });



  /* speed UI moved to bouncer-speed-ui.js */


  const worldW = ()=> Math.max(1, Math.floor(canvas.clientWidth||0));
  const worldH = ()=> Math.max(1, Math.floor(canvas.clientHeight||0));
  // board zoom scaling based on visual width ratio (like Rippler)
  let __baseAttrW = 0;
  function rectScale(){
    const w = canvas.width || 0; // device-pixel width after DPR & board zoom via utils.js
    if (!__baseAttrW && w>0) __baseAttrW = w;
    return (__baseAttrW>0 && w>0) ? (w/__baseAttrW) : 1;
  }
  const worldScaleForSize = ()=> ((PHYS_W && PHYS_H) ? 1 : rectScale());
  const blockSize = ()=> Math.round(BASE_BLOCK_SIZE * worldScaleForSize());
  const cannonR  = ()=> Math.round(BASE_CANNON_R  * worldScaleForSize());
  const ballR    = ()=> Math.round(BASE_BALL_R    * worldScaleForSize());
  // background particles (polite density)
  const particles = createBouncerParticles(physW, physH, { count: getPoliteDensityForToy(panel, 240, 640) });


  // interaction state
  let handle = { x: physW()*0.22, y: physH()*0.5 };
  handle._fx = 0.22; handle._fy = 0.5;
  let draggingHandle=false, dragStart=null, dragCurr=null;
  let draggingBlock=false, dragBlockRef=null, dragOffset={dx:0,dy:0};
  let zoomDragCand=null, zoomDragStart=null, zoomTapT=null;
  let tapCand=null, tapStart=null, tapMoved=false;
  let lastLaunch=null, launchPhase=0, nextLaunchAt=null, prevNow=0, ball=null;
  let lastCanvasW=0, lastCanvasH=0;
  let visQ = []; const fx = createImpactFX()
  // Debug OSD (toggle with globalThis.BOUNCER_DIAG = true)
  try{ installBouncerOSD(panel, sizing, (()=>speedFactor), ()=>ball, ()=>getLaunchDiag?.()); }catch{}
; let lastScale = sizing.scale||1;

  // edge controllers + flash
  let edgeControllers = []; const edgeFlash = { left:0, right:0, top:0, bot:0 };
  function flashEdge(which){ const m = mapControllersByEdge(edgeControllers), c = m && m[which]; if (!c || !c.active) return; if (edgeFlash[which]!==undefined) edgeFlash[which]=1.0; }

  // blocks
  const N_BLOCKS = 4;
  let blocks = Array.from({length:N_BLOCKS}, ()=>({ x:EDGE, y:EDGE, w:blockSize(), h:blockSize(), noteIndex:0, active:true, flash:0, lastHitAT:0 }));
  const isAdvanced = ()=> panel.classList.contains('toy-zoomed') || !!panel.closest('#zoom-overlay');
  function hitTest(x,y){
    for (let i=0;i<blocks.length;i++){ const b=blocks[i]; if (x>=b.x && x<b.x+b.w && y>=b.y && y<b.y+b.h) return i; }
    return -1;
  }
  const advUI = installAdvancedCubeUI(panel, canvas, {
    isAdvanced, toWorld, getBlocks: ()=> blocks, noteList, onChange: ()=>{}, hitTest
  });


// --- anchor-based sizing for blocks & handle (fractions of world size) ---


  // seed positions + palette
  (function seed(){
    const w=physW(), h=physH(); const bx=Math.round(w*0.2), by=Math.round(h*0.2), bw=Math.round(w*0.6), bh=Math.round(h*0.6);
    const pal = buildPentatonicPalette(noteList, 'C4', 'minor', 1);
    for (let i=0;i<blocks.length;i++) blocks[i].noteIndex = pal[i % pal.length];
    randomizeRects(blocks, {x:bx,y:by,w:bw,h:bh}, EDGE);
    try{window.syncAnchorsFromBlocks();}catch{}
  })();

  function ensureEdgeControllers(w,h){
    if (!edgeControllers.length){
      edgeControllers = makeEdgeControllers(w, h, blockSize(), EDGE, noteList);
    }else{
      const s=blockSize(), half=s/2; const map=mapControllersByEdge(edgeControllers);
      if (map.left ){ map.left .x=EDGE;        map.left .y=h/2-half; map.left .w=s; map.left .h=s; }
      if (map.right){ map.right.x=w-EDGE-s;   map.right.y=h/2-half; map.right.w=s; map.right.h=s; }
      if (map.top  ){ map.top  .x=w/2-half;   map.top  .y=EDGE;     map.top  .w=s; map.top  .h=s; }
      if (map.bot  ){ map.bot  .x=w/2-half;   map.bot  .y=h-EDGE-s; map.bot  .w=s; map.bot  .h=s; }
    }
  }

  // toy controls
  
  function doRandom(){
    const pr = Number(panel?.dataset?.priority || '1') || 1;
    const density = getPoliteDensityForToy(toyId, 1, pr);
    const N = blocks.length;
    const w = physW(), h = physH();
    const baseBW = Math.round(w * 0.6), baseBH = Math.round(h * 0.6);
    const K = Math.max(1, Math.min(N, Math.round(1 + density * (N - 1))));
    const areaScale = 0.5 + 0.5 * density;
    const bw = Math.max(EDGE*4, Math.round(baseBW * areaScale));
    const bh = Math.max(EDGE*4, Math.round(baseBH * areaScale));
    const bx = Math.round((w - bw) / 2);
    const by = Math.round((h - bh) / 2);
    randomizeRects(blocks, {x:bx, y:by, w:bw, h:bh}, EDGE);
    try { window.syncAnchorsFromBlocks(); } catch {}
    const picks = [];
    if (K >= N) {
      for (let i = 0; i < N; i++) picks.push(i);
    } else {
      const uniq = [];
      while (uniq.length < K) {
        const r = (Math.random() * N) | 0;
        if (!uniq.includes(r)) uniq.push(r);
      }
      picks.push(uniq);
    }
    for (let i = 0; i < N; i++) blocks[i].active = false;
    for (const i of picks) if (blocks[i]) blocks[i].active = true;
    randomizeControllers(edgeControllers, noteList);
  }

  
  function doReset(){
    ball = null; lastLaunch = null;
    try { for (const b of blocks){ b.flash = 0; } } catch {}
    try { for (const c of edgeControllers){ c.flash = 0; c.lastHitAT = 0; } } catch {}
  }

  panel.addEventListener('toy-random', doRandom);
  panel.addEventListener('toy-reset', doReset);
  panel.addEventListener('toy-clear', doReset);
  panel.addEventListener('toy-zoom', (e)=>{ try{ sizing.setZoom && sizing.setZoom(!!(e?.detail?.zoomed)); updateSpeedVisibility && updateSpeedVisibility(); }catch{} });

  
// Recompute from normalized anchors; ignore incremental multipliers
  window.syncBlocksFromAnchors({ blocks, physW, physH });
  // Handle position from anchors
  try{
    const w = physW(), h = physH();
    const hfx = (typeof handle._fx==='number') ? handle._fx : (w? handle.x/w : 0.22); if (globalThis.BOUNCER_DEBUG){ console.log('[bouncer] handle anchors', {hfx, hfy:handle._fy, w, h}); } /*HANDLE_DBG*/
    const hfy = (typeof handle._fy==='number') ? handle._fy : (h? handle.y/h : 0.5);
    handle.x = Math.round(EDGE + hfx * Math.max(1, w - EDGE*2));
    handle.y = Math.round(EDGE + hfy * Math.max(1, h - EDGE*2));
  }catch{}
  // Rebuild/position edge controllers to current world
  try{ ensureEdgeControllers(physW(), physH()); }catch{}
  // Update ball radius and keep inside frame, but do not translate by fx/fy
  try{
    if (ball){
        try{
    // fixed-physics: do not scale current ball position or velocity on resize
    // (we keep ball.x/ball.y/vx/vy as-is to preserve timing across modes)
    // Update spawn baseline as a fallback
    
  }catch{}
 ball.r = ballR();
      const br = ball.r;
      const eL = EDGE + br, eT = EDGE + br, eR = physW() - EDGE - br, eB = physH() - EDGE - br;
      if (ball.x < eL) ball.x = eL;
      if (ball.y < eT) ball.y = eT;
      if (ball.x > eR) ball.x = eR;
      if (ball.y > eB) ball.y = eB;
    }
  }catch{}

  
  // interactions moved to bouncer-adv-ui.js
  // basic ball control helpers (restored after split)
  function spawnBallFrom(L){
    const o = { x:L.x, y:L.y, vx:L.vx, vy:L.vy, r: ballR() };
    ball = o;
    lastLaunch = { vx: L.vx, vy: L.vy, x: L.x, y: L.y };
    try{
      const li = (typeof getLoopInfo==='function') ? getLoopInfo() : null;
      const ac = (typeof ensureAudioContext==='function') ? ensureAudioContext() : null;
      const now = ac ? ac.currentTime : 0;
      if (li && Number.isFinite(li.barLen) && li.barLen > 0){
        nextLaunchAt = now + li.barLen;
      } else {
        nextLaunchAt = null;
      }
    }catch{}
    try{ fx.onLaunch && fx.onLaunch(L.x, L.y); }catch{}
    return o;
  }
function setNextLaunchAt(t){ nextLaunchAt = t; }
  function setBallOut(o){ ball = o; }

    const __aim = { active:false, sx:0, sy:0, cx:0, cy:0 };
  function __setAim(a){ try{ if (a && typeof a==='object'){ Object.assign(__aim, a); } }catch(e){} }

  const _int = installBouncerInteractions({ setAim: __setAim, canvas, sizing, toWorld, EDGE, physW, physH, ballR, __getSpeed,
    blocks, edgeControllers, handle, spawnBallFrom, setNextLaunchAt, setBallOut, instrument, toyId, noteList });
// draw loop
  
  lockPhysWorld();
  // draw loop moved to bouncer-render.js
const draw = createBouncerDraw({ getAim: ()=>__aim,  lockPhysWorld, 
  canvas, ctx, sizing, resizeCanvasForDPR, renderScale, physW, physH, EDGE,
  ensureEdgeControllers: (w,h)=>ensureEdgeControllers(w,h), edgeControllers,
  blockSize, particles, blocks, handle, drawEdgeBondLines, ensureAudioContext, noteList, drawBlocksSection,
  drawEdgeDecorations, edgeFlash,
  stepBouncer,
  ball,
        getBall: ()=>ball,
  rescale: ()=>{ try{ window.rescaleBouncer({ blocks, handle, edgeControllers, physW, physH, EDGE, blockSize, ballRef: ball,
        getBall: ()=>ball, ballR, ensureEdgeControllers }); }catch{} },
  updateLaunchBaseline,
  buildStateForStep: (now, prevNow)=>{
    const S = {
      ball,
        getBall: ()=>ball, blocks, edgeControllers, EDGE, worldW: physW, worldH: physH, ballR, blockSize, mapControllersByEdge,
      edgeFlash, ensureAudioContext, noteValue, noteList, instrument, fx,
      lastLaunch, nextLaunchAt, lastAT: prevNow, flashEdge, handle, spawnBallFrom, getLoopInfo,
      triggerInstrument: (i,n,t)=>triggerInstrument(i,n,t,'bouncer', toyId),
      BOUNCER_BARS_PER_LIFE, setNextLaunchAt, setBallOut, visQ
    };
    return S;
  },
  applyFromStep: (S)=>{ visQ = S.visQ || visQ; }
});
requestAnimationFrame(draw);


  function onLoop(_loopStart){} // no-op
  return { onLoop, reset: doReset, setInstrument: (n)=>{ instrument = n || instrument; }, element: canvas };
}