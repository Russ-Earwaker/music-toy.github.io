import './bouncer-square-fit.js';
import { makeEdgeControllers, drawEdgeBondLines, handleEdgeControllerEdit, mapControllersByEdge, randomizeControllers, drawEdgeDecorations } from './bouncer-edges.js';
import { stepBouncer } from './bouncer-step.js';
import { noteList, resizeCanvasForDPR } from './utils.js';
import { ensureAudioContext, getLoopInfo, setToyMuted } from './audio-core.js';
import { triggerInstrument } from './audio-samples.js';
import { randomizeRects, EDGE_PAD as EDGE, hitRect, whichThirdRect, drawThirdsGuides } from './toyhelpers.js';
import { drawBlocksSection } from './ripplesynth-blocks.js';
// board scale via rect baseline (rippler-style)
import { createImpactFX } from './bouncer-impact.js';
import { installVolumeUI } from './volume-ui.js';
import { createBouncerDraw } from './bouncer-render.js';
import { installAdvancedCubeUI } from './bouncer-adv-ui.js';
import { installBouncerInteractions } from './bouncer-interactions.js';
import { createBouncerParticles } from './bouncer-particles.js';
import { getPoliteDensityForToy } from './polite-random.js';
import { buildPentatonicPalette, processVisQ as processVisQBouncer } from './bouncer-actions.js';
import { computeLaunchVelocity, updateLaunchBaseline, setSpawnSpeedFromBallSpeed , getLaunchDiag} from './bouncer-geom.js';
import { localPoint as __localPoint } from './bouncer-pointer.js';
import { installSpeedUI } from './bouncer-speed-ui.js';
import { installQuantUI } from './bouncer-quant-ui.js';
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
  // Enable OSD + quant debug by default (can be turned off later)
  try{ if (!panel.dataset.debug) panel.dataset.debug = '1'; }catch{}
  try{ window.BOUNCER_QUANT_DBG = true; }catch{}
  let instrument = (panel.dataset.instrument || 'retro_square'); panel.addEventListener('toy-instrument', (e)=>{ instrument = (e?.detail?.value)||instrument; });
  let speedFactor = parseFloat((panel?.dataset?.speed)||'1.60'); // +60% faster default // 0.60 = calmer default
  const toyId = (panel?.dataset?.toy || 'bouncer').toLowerCase();
  try{ panel.dataset.toyid = toyId; }catch{}

  const host = panel.querySelector('.toy-body') || panel;
  const canvas = document.createElement('canvas'); canvas.style.width='100%'; canvas.style.display='block';canvas.style.height='100%'; host.appendChild(canvas);
  try{ canvas.removeAttribute('data-lock-scale'); canvas.style.transform=''; }catch{};
  // Ensure a footer exists and volume UI is installed (matches routing via data-toyid)
  try{
    let footer = panel.querySelector('.toy-footer');
    if (!footer){ footer = document.createElement('div'); footer.className = 'toy-footer'; panel.appendChild(footer); }
    installVolumeUI(footer);
  }catch{}
  const ctx = canvas.getContext('2d', { alpha:false });
  // The legacy sizing helper has been removed. The new toy-layout-manager.js
  // handles canvas sizing automatically. This dummy object prevents runtime
  // errors from any remaining legacy debug code that might reference it.
  const sizing = { scale: 1, setZoom: () => {} };

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
  __osd.style.cssText='position:absolute;left:6px;top:6px;padding:0;background:transparent;color:#fff;font:12px/1.3 monospace;z-index:10;border-radius:4px;display:none;pointer-events:none';
  // Do not append OSD text by default anymore; header flash serves as the visual clock.
  function __tickOSD(){
    // Always compute quant tick and flash header; keep OSD hidden
    __osd.style.display = 'none';
    try {
      if (window.BOUNCER_QUANT_DBG) {
        const li = (typeof getLoopInfo==='function') ? getLoopInfo() : null;
        // Read quant divisor robustly: live <select> value > getter > dataset > default
        let div = NaN;
        try{
          const sel = panel.querySelector('.bouncer-quant-ctrl select');
          if (sel) { const vv = parseFloat(sel.value); if (Number.isFinite(vv)) div = vv; }
        }catch{}
        if (!Number.isFinite(div)){
          try{ const v2 = (__getQuantDiv && __getQuantDiv()); if (Number.isFinite(v2)) div = v2; }catch{}
        }
        if (!Number.isFinite(div)){
          const ds = parseFloat(panel.dataset.quantDiv || panel.dataset.quant || '');
          if (Number.isFinite(ds)) div = ds;
        }
        if (!Number.isFinite(div)) div = 4;
        const beatLen = li ? li.beatLen : 0;
        const grid = (div>0 && beatLen) ? (beatLen/div) : 0;
        const now = (typeof ensureAudioContext==='function') ? ensureAudioContext().currentTime : 0;
        const rel = li ? Math.max(0, now - li.loopStartTime) : 0;
        const k = grid>0 ? Math.ceil((rel+1e-6)/grid) : -1;
        // Flash quant dot next to dropdown on quant tick
        if (!window.__bouncerLastQuantTick) window.__bouncerLastQuantTick = new WeakMap();
        const last = window.__bouncerLastQuantTick.get(panel) ?? -1;
        if (k !== last && k >= 0) {
          window.__bouncerLastQuantTick.set(panel, k);
          const dot = panel.querySelector('.bouncer-quant-ctrl .bouncer-quant-dot');
          if (dot && dot.animate){
            dot.animate([
              { transform:'scale(1)', background:'rgba(255,255,255,0.35)', boxShadow:'0 0 0 0 rgba(255,255,255,0.0)' },
              { transform:'scale(1.35)', background:'#fff', boxShadow:'0 0 10px 4px rgba(255,255,255,0.65)' },
              { transform:'scale(1)', background:'rgba(255,255,255,0.35)', boxShadow:'0 0 0 0 rgba(255,255,255,0.0)' }
            ], { duration: Math.max(140, Math.min(260, (grid||0.2)*700 )), easing: 'ease-out' });
          }
        }
      }
    } catch {}
    requestAnimationFrame(__tickOSD);
  }
  requestAnimationFrame(__tickOSD); /*OSD_DEBUG*/

  const __getSpeed = installSpeedUI(panel, sizing, parseFloat((panel?.dataset?.speed)||'1.60'));
  // Default quant to 1/4 (div=4) if not provided
  try{ if (!panel.dataset.quantDiv && !panel.dataset.quant) panel.dataset.quantDiv = '4'; }catch{}
  const __getQuantDiv = installQuantUI(panel, parseFloat(panel?.dataset?.quantDiv||panel?.dataset?.quant||'4'));
  // apply speed changes to queued launch
  let __speedCache = (__getSpeed?__getSpeed():1);
  panel.addEventListener('toy-speed', (e)=>{ const ns = (e && e.detail && Number(e.detail.value)) ? e.detail.value : (__getSpeed?__getSpeed():1); const os = __speedCache || 1; const ratio = os ? (ns/os) : 1; __speedCache = ns; try{ if (lastLaunch && Number.isFinite(ratio) && ratio>0){ lastLaunch.vx *= ratio; lastLaunch.vy *= ratio; } }catch{} });



  /* speed UI moved to bouncer-speed-ui.js */


  const worldW = ()=> Math.max(1, Math.floor(canvas.clientWidth||0));
  const worldH = ()=> Math.max(1, Math.floor(canvas.clientHeight||0));
  // board zoom scaling based on visual width ratio (like Rippler)
  const __BASELINE_ATTR_W = 300;
  function rectScale(){
    const w = canvas.clientWidth || canvas.width || __BASELINE_ATTR_W;
    // clamp very small/large to avoid extreme tiny/huge artefacts
    const s = w / __BASELINE_ATTR_W;
    return Math.max(0.5, Math.min(2.25, s));
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
  // When manually spawning, briefly mute any already-scheduled replay notes;
  // stepBouncer will unmute on the first new physics hit.
  // Start with unmute pending so the very first physics hit after boot is audible.
  let __spawnPendingUnmute = true;
  // --- Loop Recorder (record a bar, replay verbatim) ----------------------
  const loopRec = {
    signature: '',
    mode: 'record',        // 'record' | 'replay'
    pattern: [],           // [{note, offset}] in seconds within bar
    // Anchor start time for loop (spawn + 1 beat)
    anchorStartTime: 0,
    lastBarIndex: -1,
    scheduledBarIndex: -999,
    seen: new Set(),       // de-dupe within a bar: note@ms
  };
  function stateSignature(){
    try{
      const parts = [];
      // blocks (position/size/active/noteIndex)
      if (Array.isArray(blocks)){
        for (let i=0;i<blocks.length;i++){
          const b=blocks[i]; if (!b) continue;
          parts.push(i, Math.round(b.x), Math.round(b.y), Math.round(b.w||b.size||36), Math.round(b.h||b.size||36), b.active?1:0, b.noteIndex|0);
        }
      }
      // launch vector/pos
      const L = lastLaunch || {};
      parts.push('launch', Math.round(L.x||0), Math.round(L.y||0), Math.round((L.vx||0)*100), Math.round((L.vy||0)*100));
      return parts.join(',');
    }catch{ return 'sig_err'; }
  }
  function barIndexOfTime(li, t){ return Math.floor(Math.max(0, t - li.loopStartTime) / li.barLen); }
  function barStartOfIndex(li, k){ return li.loopStartTime + k * li.barLen; }
  function onNewBar(li, k){
    const sig = stateSignature();
    const changed = (sig !== loopRec.signature);
    if (changed){
      loopRec.signature = sig;
      loopRec.mode = 'record';
      if ((globalThis.BOUNCER_DBG_LEVEL|0)>=1) console.log('[bouncer-rec] loop reset: state changed; recording new bar');
      loopRec.pattern.length = 0;
    } else {
      if (loopRec.pattern.length > 0) { loopRec.mode = 'replay'; if ((globalThis.BOUNCER_DBG_LEVEL|0)>=1) console.log('[bouncer-rec] loop recorded — switching to replay (events:', loopRec.pattern.length, ')'); }
    }
    // If entering replay, ensure we are unmuted before scheduler queues playback.
    // This guarantees the first scheduled notes are audible.
    try{
      if (loopRec.mode === 'replay') {
        setToyMuted(toyId, false);
        __spawnPendingUnmute = false;
      }
    }catch{}
    loopRec.lastBarIndex = k;
    loopRec.scheduledBarIndex = -999;
    loopRec.seen = new Set();
    if (window && window.BOUNCER_LOOP_DBG){
      if ((globalThis.BOUNCER_DBG_LEVEL|0)>=1) console.log('[bouncer-rec] new bar', k, 'mode', loopRec.mode, 'changed', changed, 'patLen', loopRec.pattern.length);
    }
  }
  // Spawn debounce to prevent multiple spawns on a single release
  let __spawnLastAt = 0;
  const __spawnCooldown = 0.08; // seconds
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
      /*DEBUG_SPAWN*/ try{ if ((globalThis.BOUNCER_DBG_LEVEL|0)>=2) console.log('[bouncer-main] spawn', 'x',L.x,'y',L.y,'vx',L.vx,'vy',L.vy); }catch{}
      // Debounce rapid duplicate spawns
      try {
        const ac = (typeof ensureAudioContext==='function') ? ensureAudioContext() : null;
        const nowT = ac ? ac.currentTime : 0;
        if (ball && (nowT - __spawnLastAt) < __spawnCooldown){
          if ((globalThis.BOUNCER_DBG_LEVEL|0)>=2) console.log('[bouncer-main] spawn ignored (cooldown)');
          return ball;
        }
        __spawnLastAt = nowT;
      }catch{}
    const o = { x:L.x, y:L.y, vx:L.vx, vy:L.vy, r: ballR() };
    ball = o;
    lastLaunch = { vx: L.vx, vy: L.vy, x: L.x, y: L.y };
    // Reset loop recorder immediately to avoid overlap with prior replay
    try{
      const lr = (visQ && visQ.loopRec) ? visQ.loopRec : null;
      if (lr){
        lr.mode = 'record';
        lr.pattern.length = 0;
        lr.scheduledBarIndex = -999;
        if (lr.scheduledKeys && typeof lr.scheduledKeys.clear === 'function') lr.scheduledKeys.clear();
        try{ lr.signature = stateSignature(); }catch{}
        // Set loop anchor to spawn time + 1 beat
        try{
          const li = (typeof getLoopInfo==='function') ? getLoopInfo() : null;
          const ac = (typeof ensureAudioContext==='function') ? ensureAudioContext() : null;
          const now = ac ? ac.currentTime : 0;
          const beat = li && Number.isFinite(li.beatLen) ? li.beatLen : (60/120);
          lr.anchorStartTime = now + beat;
        }catch{}
      }
    }catch{}
    // Do not mute on spawn; rely on short replay lookahead and recorder reset
    // to avoid overlap, keeping first-loop hits fully audible.
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
// Persistent per-step state for physics (dedupe & spawn windows)
let __lastTickByBlock = new Map();
let __lastTickByEdge  = new Map();
let __justSpawnedUntil = 0;

// Mute old scheduled events immediately; unmute on first new physics hit
try {
  try{
    if (typeof window?.setToyMuted==="function") window.setToyMuted(toyId, true);
    // Mark that the next physics hit should unmute so fresh interactions are audible.
    __spawnPendingUnmute = true;
  }catch{}
} catch {}


try{
  const lr = (visQ && visQ.loopRec) ? visQ.loopRec : null;
  if (lr){
    lr.mode = 'record'; // ensure physics plays immediately, and replay-scheduling pauses
    if (lr.scheduledKeys && typeof lr.scheduledKeys.clear === 'function') lr.scheduledKeys.clear();
    lr.scheduledBarIndex = -999;
  }
}catch{}


  function __setAim(a){ try{ if (a && typeof a==='object'){ Object.assign(__aim, a); } }catch(e){} }

  const _int = installBouncerInteractions({ setAim: __setAim, canvas, sizing, toWorld, EDGE, physW, physH, ballR, __getSpeed,
    blocks, edgeControllers, handle, spawnBallFrom, setNextLaunchAt, setBallOut, instrument: ()=>instrument, toyId, noteList, isAdvanced: ()=>panel.classList.contains('toy-zoomed') });
// draw loop
  
  lockPhysWorld();
  // draw loop moved to bouncer-render.js
const draw = createBouncerDraw({ getAim: ()=>__aim,  lockPhysWorld, 
  canvas, ctx, sizing, resizeCanvasForDPR, renderScale, physW, physH, EDGE,
  ensureEdgeControllers: (w,h)=>ensureEdgeControllers(w,h), edgeControllers,
  blockSize, particles, blocks, handle, drawEdgeBondLines, ensureAudioContext, noteList, drawBlocksSection,
  drawEdgeDecorations, edgeFlash,
  stepBouncer,
  spawnBallFrom,
  ball,
        getBall: ()=>ball,
  rescale: ()=>{ try{ window.rescaleBouncer({ blocks, handle, edgeControllers, physW, physH, EDGE, blockSize, ballRef: ball,
        getBall: ()=>ball, ballR, ensureEdgeControllers }); }catch{} },
  updateLaunchBaseline,
  buildStateForStep: (now, prevNow)=>{
    const li0 = (typeof getLoopInfo==='function') ? getLoopInfo() : null;
    const triggerPhysAware = (i,n,t)=>{
      if (window && window.BOUNCER_LOOP_DBG) try{ if ((globalThis.BOUNCER_DBG_LEVEL|0)>=2) console.log('[bouncer-audio] fire?', n, 't=', (typeof t==='number')?t.toFixed(4):'imm'); }catch{}
      try{
        const li = (typeof getLoopInfo==='function') ? getLoopInfo() : li0;
        const lr = (visQ && visQ.loopRec) ? visQ.loopRec : null;
        const nowT = li ? li.now : (t||0);
        const barLen = li ? li.barLen : 1;
        const beatDur = barLen/4;
        const anchor = (visQ && visQ.loopRec && visQ.loopRec.anchorStartTime) ? visQ.loopRec.anchorStartTime : (li ? li.loopStartTime : 0);
        const k = Math.floor(Math.max(0, (nowT - anchor) / barLen));
        if (lr && lr.mode === 'replay'){ return; }
        if (lr && lr.mode === 'record'){
          try {
            const ac = ensureAudioContext ? ensureAudioContext() : null;
            // Respect scheduled time if provided; otherwise fire near-now
            const scheduledT = (typeof t === 'number') ? t : ((ac ? ac.currentTime : 0) + 0.0008);
            triggerInstrument(i||instrument, n, scheduledT, toyId);
          } catch(e){}
          const barStart = anchor + k*barLen;
          const at = (typeof t==='number' ? t : nowT);
          // Only start recording once we pass the anchor
          if (at >= anchor - 1e-4){
            const offBeats = (at - barStart)/beatDur;
            // Round offsets to current quant grid so replay matches quant exactly
            let divRec = 4;
            try{ const vq = (__getQuantDiv && __getQuantDiv()); if (Number.isFinite(vq) && vq>0) divRec = vq; }catch{}
            const off = Math.max(0, Math.min(4, Math.round(offBeats * divRec)/divRec));
            if (visQ && visQ.loopRec && Array.isArray(visQ.loopRec.pattern)){
              visQ.loopRec.pattern.push({ note: n, offset: off });
            }
          }
          return;
        }
      }catch(e){}
      try { triggerInstrument(i||instrument, n, (typeof t==='number'?t:undefined), toyId); }catch(e){}
    };
    const S = {
      now,
      lastAT: prevNow || 0,
      EDGE,
      worldW, worldH,
      physW, physH,
      renderScale,
      ensureAudioContext,
      onNewBar,
      mapControllersByEdge,
      flashEdge,
      blocks,
      edgeControllers,
      instrument,
      noteList,
      noteValue,
      getLoopInfo,
      ballR,
      handle,
      toyId,
      setToyMuted,
      __spawnPendingUnmute,
      lastLaunch,
      nextLaunchAt,
      spawnBallFrom,
      triggerInstrument: (i,n,t)=>{ try{ if (window && window.BOUNCER_FORCE_RAW){   return triggerInstrument(i||instrument, n, t, toyId); } }catch{} return triggerPhysAware(i,n,t);},
      triggerInstrumentRaw: (i,n,t)=>triggerInstrument(i||instrument, n, t, toyId),
      getQuantDiv: ()=>{ try{ const v = __getQuantDiv ? __getQuantDiv() : 8; return (Number.isFinite(v)? v : 8); }catch(_){ return 8; } },
      BOUNCER_BARS_PER_LIFE,
      setNextLaunchAt: (t)=>{ nextLaunchAt = t; },
      setBallOut: (o)=>{ ball = o; },
      fx,
      __lastTickByBlock,
      __lastTickByEdge,
      __justSpawnedUntil
    };
    S.visQ = Object.assign({}, visQ, { loopRec });
    S.ball = ball;
    return S;
  },
  applyFromStep: (S)=>{
    if (S){
      visQ = S.visQ || visQ;
      if ('ball' in S) ball = S.ball;
      if ('lastLaunch' in S && S.lastLaunch) lastLaunch = S.lastLaunch;
      if ('nextLaunchAt' in S) nextLaunchAt = S.nextLaunchAt;
      if (S.__lastTickByBlock) __lastTickByBlock = S.__lastTickByBlock;
      if (S.__lastTickByEdge) __lastTickByEdge = S.__lastTickByEdge;
      if (typeof S.__justSpawnedUntil === 'number') __justSpawnedUntil = S.__justSpawnedUntil;
      if (typeof S.__spawnPendingUnmute === 'boolean') __spawnPendingUnmute = S.__spawnPendingUnmute;
    }
  }
});
requestAnimationFrame(draw);


  function onLoop(_loopStart){} // no-op
  return { onLoop, reset: doReset, setInstrument: (n)=>{ instrument = n || instrument; }, element: canvas };
}

