// c:\Users\Russ_\Desktop\music-toy\music-toy.github.io\src\bouncer.main.js
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
import { circleRectHit } from './bouncer-helpers.js';
const noteValue = (list, idx)=> list[Math.max(0, Math.min(list.length-1, (idx|0)))];
const BOUNCER_BARS_PER_LIFE = 1;
const MAX_SPEED = 700, LAUNCH_K = 0.9;
const BASE_BLOCK_SIZE = 44, BASE_CANNON_R = 10, BASE_BALL_R = 7;

const DBG_RESPAWN = ()=> window.BOUNCER_RESPAWN_DBG;

export function createBouncer(selector){
  const shell = (typeof selector==='string') ? document.querySelector(selector) : selector; if (!shell) return null;
  const panel = shell.closest('.toy-panel') || shell;
  // Prevent double-initialization, which can cause duplicate draw loops and event listeners.
  if (panel.__bouncer_main_instance) {
    console.warn('[bouncer.main] createBouncer called on an already-initialized panel. Aborting to prevent duplicates.', panel.id);
    return panel.__bouncer_main_instance;
  }
  // Enable OSD + quant debug by default (can be turned off later)
  try{ if (!panel.dataset.debug) panel.dataset.debug = '1'; }catch{}
  try{ window.BOUNCER_QUANT_DBG = true; }catch{}
  let instrument = (panel.dataset.instrument || 'retro_square'); panel.addEventListener('toy-instrument', (e)=>{ instrument = (e?.detail?.value)||instrument; });
  let speedFactor = parseFloat((panel?.dataset?.speed)||'1.60'); // +60% faster default // 0.60 = calmer default
  const toyId = (panel?.dataset?.toy || 'bouncer').toLowerCase();
  try{ panel.dataset.toyid = toyId; }catch{}

  // --- Persistence hooks ---
  // Define these early so they are available for pending state application.
  panel.__getBouncerSnapshot = () => {
    try{
      const blocksSnap = Array.isArray(blocks) ? blocks.map(b=> b ? ({ x: Math.round(b.x||0), y: Math.round(b.y||0), w: Math.round(b.w||b.size||BASE_BLOCK_SIZE), h: Math.round(b.h||b.size||BASE_BLOCK_SIZE), active: !!b.active, noteIndex: (b.noteIndex|0) }) : null) : [];
      const edgesSnap = Array.isArray(edgeControllers) ? edgeControllers.map(c=> c ? ({ x: Math.round(c.x||0), y: Math.round(c.y||0), w: Math.round(c.w||BASE_BLOCK_SIZE), h: Math.round(c.h||BASE_BLOCK_SIZE), active: !!c.active, noteIndex: (c.noteIndex|0), edge: c.edge }) : null) : [];
      const speed = (typeof __getSpeed === 'function') ? __getSpeed() : (parseFloat(panel.dataset.speed||'')||undefined);
      const quantDiv = (typeof __getQuantDiv === 'function') ? __getQuantDiv() : (parseFloat(panel.dataset.quantDiv||panel.dataset.quant||'')||undefined);
      const ac = ensureAudioContext();
      const now = ac ? ac.currentTime : 0;
      const ballSnap = (ball && typeof ball==='object') ? ({ x: Math.round(ball.x||0), y: Math.round(ball.y||0), vx: Number(ball.vx||0), vy: Number(ball.vy||0), r: Number(ball.r||ballR()), flightTimeRemaining: (ball.flightEnd != null) ? Math.max(0, ball.flightEnd - now) : undefined }) : null;
      const lastLaunchSnap = (lastLaunch && typeof lastLaunch==='object') ? ({ x: Math.round(lastLaunch.x||0), y: Math.round(lastLaunch.y||0), vx: Number(lastLaunch.vx||0), vy: Number(lastLaunch.vy||0) }) : null;
      const nextLaunchAtRemaining = (nextLaunchAt != null) ? Math.max(0, nextLaunchAt - now) : undefined;
      if (DBG_RESPAWN()) console.log('[BNC_DBG] getSnapshot', {
        now: now.toFixed(3),
        flightEnd: ball?.flightEnd?.toFixed(3),
        flightTimeRemaining: ballSnap?.flightTimeRemaining?.toFixed(3),
        nextLaunchAt: nextLaunchAt?.toFixed(3),
        nextLaunchAtRemaining: nextLaunchAtRemaining?.toFixed(3),
      });
      const loopRecSnap = {
        mode: loopRec.mode,
        pattern: loopRec.pattern,
        signature: loopRec.signature,
      };
      if (DBG_RESPAWN()) console.log('[BNC_DBG] getSnapshot: Saving loopRec', { mode: loopRecSnap.mode, patternLen: loopRecSnap.pattern.length, signature: loopRecSnap.signature?.slice(0,30) });
      return { instrument, speed, quantDiv, blocks: blocksSnap, edges: edgesSnap, ball: ballSnap, lastLaunch: lastLaunchSnap, nextLaunchAtRemaining, handleFx: handle._fx, handleFy: handle._fy, loopRec: loopRecSnap };
    }catch(e){ return { instrument }; }
  };
  panel.__applyBouncerSnapshot = (st)=>{
    try{
      if (!st || typeof st !== 'object') return;
      if (st.instrument){ instrument = st.instrument; panel.dataset.instrument = st.instrument; try{ panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name: st.instrument, value: st.instrument }, bubbles:true })); }catch{} }
      if (DBG_RESPAWN()) console.log('[BNC_DBG] applySnapshot: Received state', {
        ballFlightTimeRemaining: st.ball?.flightTimeRemaining,
        nextLaunchAtRemaining: st.nextLaunchAtRemaining,
      });
      if (typeof st.speed === 'number'){
        try{ panel.dataset.speed = String(st.speed); const r = panel.querySelector('.bouncer-speed-ctrl input[type="range"]'); if (r){ r.value = String(st.speed); r.dispatchEvent(new Event('input', { bubbles:true })); } }catch{}
      }
      if (typeof st.quantDiv !== 'undefined'){
        try{ panel.dataset.quantDiv = String(st.quantDiv); const sel = panel.querySelector('.bouncer-quant-ctrl select'); if (sel){ sel.value = String(st.quantDiv); sel.dispatchEvent(new Event('change', { bubbles:true })); } }catch{}
      }
      // Blocks
      if (Array.isArray(st.blocks) && Array.isArray(blocks)){
        for (let i=0;i<Math.min(blocks.length, st.blocks.length); i++){
          const src = st.blocks[i]; const dst = blocks[i]; if (!src || !dst) continue;
          dst.x = Math.round(src.x||dst.x); dst.y = Math.round(src.y||dst.y);
          dst.w = Math.round(src.w||dst.w); dst.h = Math.round(src.h||dst.h);
          dst.active = !!src.active; dst.noteIndex = (src.noteIndex|0);
        }
        try{ window.syncAnchorsFromBlocks && window.syncAnchorsFromBlocks(); }catch{}
      }
      // Edge controllers
      try{ ensureEdgeControllers(physW(), physH()); }catch{}
      if (Array.isArray(st.edges) && Array.isArray(edgeControllers)){
        const mapByEdge = (arr)=>{ const m={}; try{ arr.forEach((c,i)=>{ if (c && c.edge) m[c.edge]= {c,i}; }); }catch{} return m; };
        const srcMap = mapByEdge(st.edges);
        const dstMap = mapByEdge(edgeControllers);
        const keys = ['left','right','top','bot'];
        keys.forEach(k=>{
          const src = srcMap[k]?.c; const dst = dstMap[k]?.c; if (!src || !dst) return;
          dst.x = Math.round(src.x||dst.x); dst.y = Math.round(src.y||dst.y);
          dst.w = Math.round(src.w||dst.w); dst.h = Math.round(src.h||dst.h);
          dst.active = !!src.active; dst.noteIndex = (src.noteIndex|0);
        });
      }
      // Handle spawn handle position
      try{
        if (typeof st.handleFx === 'number') handle._fx = Math.max(0, Math.min(1, st.handleFx));
        if (typeof st.handleFy === 'number') handle._fy = Math.max(0, Math.min(1, st.handleFy));
        const w = physW(), h = physH();
        if (w>0 && h>0){
          handle.x = Math.round(EDGE + (handle._fx ?? 0.5) * Math.max(1, w-EDGE*2));
          handle.y = Math.round(EDGE + (handle._fy ?? 0.5) * Math.max(1, h-EDGE*2));
        }
      }catch{}

      // Loop recorder state
      try{
        if (st.loopRec && typeof st.loopRec === 'object') {
          if (DBG_RESPAWN()) console.log('[BNC_DBG] applySnapshot: Restoring loopRec', { mode: st.loopRec.mode, patternLen: st.loopRec.pattern?.length, signature: st.loopRec.signature?.slice(0,30) });
          if (st.loopRec.mode) loopRec.mode = st.loopRec.mode;
          if (Array.isArray(st.loopRec.pattern)) loopRec.pattern = st.loopRec.pattern;
          loopRec.signature = st.loopRec.signature || '';
          // Reset runtime-only state that shouldn't be persisted
          loopRec.lastBarIndex = -1; loopRec.scheduledBarIndex = -999; loopRec.seen = new Set();
        }
      }catch{}

      // Ball + lastLaunch
      try{
        if (st.ball && typeof st.ball==='object'){
          // Defer calculating absolute end time until transport resumes.
          ball = { x: Number(st.ball.x||0), y: Number(st.ball.y||0), vx: Number(st.ball.vx||0), vy: Number(st.ball.vy||0), r: Number(st.ball.r||ballR()), active:true, flightTimeRemaining: st.ball.flightTimeRemaining, flightEnd: undefined };
        }
        if (st.lastLaunch && typeof st.lastLaunch==='object'){
          lastLaunch = { x: Number(st.lastLaunch.x||0), y: Number(st.lastLaunch.y||0), vx: Number(st.lastLaunch.vx||0), vy: Number(st.lastLaunch.vy||0) };
        }
        if (typeof st.nextLaunchAtRemaining === 'number') {
          nextLaunchAtRemaining = st.nextLaunchAtRemaining;
          nextLaunchAt = null; // Clear absolute time
        }
        if (DBG_RESPAWN()) console.log('[BNC_DBG] applySnapshot: Applied state', {
            ballFlightTimeRemaining: ball?.flightTimeRemaining,
            nextLaunchAtRemaining: nextLaunchAtRemaining,
            nextLaunchAt: nextLaunchAt
        });
      }catch{}

    }catch(e){ try{ console.warn('[bouncer] apply snapshot failed', e); }catch{} }
  };

  // If a pending snapshot exists (from early restore), apply it ASAP so
  // anchors/blocks/handle are in place before we sync from anchors.
  try{
    const pendingEarly = panel.__pendingBouncerState;
    if (pendingEarly && typeof pendingEarly === 'object'){
      if (typeof panel.__applyBouncerSnapshot === 'function'){
        try{ panel.__applyBouncerSnapshot(pendingEarly); delete panel.__pendingBouncerState; }catch{}
      }
    }
  }catch{}

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
  // Default quant to 1/2 (div=2) if not provided
  try{ if (!panel.dataset.quantDiv && !panel.dataset.quant) panel.dataset.quantDiv = '2'; }catch{}
  const __getQuantDiv = installQuantUI(panel, parseFloat(panel?.dataset?.quantDiv||panel?.dataset?.quant||'2'));
  // apply speed changes to queued launch
  let __speedCache = (__getSpeed?__getSpeed():1);
  panel.addEventListener('toy-speed', (e)=>{ const ns = (e && e.detail && Number(e.detail.value)) ? e.detail.value : (__getSpeed?__getSpeed():1); const os = __speedCache || 1; const ratio = os ? (ns/os) : 1; __speedCache = ns; try{ if (lastLaunch && Number.isFinite(ratio) && ratio>0){ lastLaunch.vx *= ratio; lastLaunch.vy *= ratio; } }catch{} });

  // When quantization changes, reset the loop to start a new recording.
  // This prevents the old pattern from replaying with mismatched timing.
  panel.addEventListener('bouncer:quant', () => {
    if (loopRec) {
      // Immediately clear the old pattern and switch to record mode.
      // This prevents the old notes from replaying with the new timing.
      // The signature is also invalidated to ensure a clean slate on the next bar.
      loopRec.pattern.length = 0;
      loopRec.mode = 'record';
      loopRec.signature = ''; // Guarantees onNewBar will confirm the reset.
    }
  });

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
  let lastLaunch=null, launchPhase=0, nextLaunchAt=null, prevNow=0, ball=null, __unmuteAt = 0, __resumeHandled = false,
      nextLaunchAtRemaining = null, wasRunning = null;
  // __resumeHandled and wasRunning are no longer needed for ball state restoration.
  // The presence of ball.flightTimeRemaining is the sole indicator.
  let loopRec = {
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
    if (DBG_RESPAWN()) console.log(`[BNC_DBG] onNewBar (k=${k}): mode=${loopRec.mode}, changed=${changed}, patternLen=${loopRec.pattern.length}, sig=${sig.slice(0,30)}...`);

    if (changed){
      loopRec.signature = sig;
      loopRec.mode = 'record';
         if ((globalThis.BOUNCER_DBG_LEVEL|0)>=1) console.log('[bouncer-rec] loop reset: state changed; recording new bar');
      loopRec.pattern.length = 0;
    } else {
      // If the state hasn't changed, we're done recording. Switch to replay mode
      // if we aren't already in it.
      if (loopRec.mode !== 'replay') {
        // Only switch to replay if a pattern was actually recorded.
        if (loopRec.pattern.length > 0) {
          loopRec.mode = 'replay';
          if ((globalThis.BOUNCER_DBG_LEVEL|0)>=1) console.log('[bouncer-rec] loop recorded — switching to replay (events:', loopRec.pattern.length, ')');
        }
      }
    }
    loopRec.lastBarIndex = k;
    loopRec.scheduledBarIndex = -999;


    loopRec.seen = new Set();
    if (DBG_RESPAWN() || (window && window.BOUNCER_LOOP_DBG)){
      if ((globalThis.BOUNCER_DBG_LEVEL|0)>=1) console.log('[bouncer-rec] new bar', k, 'mode', loopRec.mode, 'changed', changed, 'patLen', loopRec.pattern.length);
    }
  }
  // Spawn debounce to prevent multiple spawns on a single release
  let __spawnLastAt = 0;
  const __spawnCooldown = 0.08; // seconds
  let lastCanvasW=0, lastCanvasH=0;
  // visQ is a carrier for the loop recorder state, passed to the physics/render steps.
  let visQ = { loopRec: loopRec }; const fx = createImpactFX()
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
  function velFrom(hx, hy, px, py){
    let dx = (px - hx), dy = (py - hy);
    let len = Math.hypot(dx, dy) || 1;
    let ux = dx/len, uy = dy/len;
    if (len < 3){ ux = 0; uy = -1; }
    const speed = (typeof __getSpeed === 'function') ? __getSpeed() : 1;
    const BASE = 4.8;
    const v = BASE * speed;
    return { vx: ux * v, vy: uy * v };
  }

  
  function doRandom(){
    // Randomize a bit of everything in standard view: spawn a ball,
    // shuffle cube positions/actives, and randomize notes for a fresh vibe.
    const w = physW(), h = physH();
    const r = ballR();
    const spawnableW = w - 2 * (EDGE + r + 4);
    const spawnableH = h - 2 * (EDGE + r + 4);
    let x, y, attempts = 0;
    const collidables = [...blocks, ...edgeControllers].filter(b => b && b.active !== false);

    do {
      x = (EDGE + r + 4) + Math.random() * spawnableW;
      y = (EDGE + r + 4) + Math.random() * spawnableH;
      attempts++;
      if (attempts > 100) {
        console.warn('[bouncer] Could not find a clear spawn point after 100 attempts.');
        break; // Give up to avoid an infinite loop
      }
    } while (collidables.some(b => circleRectHit(x, y, r, b)));

    // Update the visual spawn handle to match the new random position
    handle.x = x;
    handle.y = y;

    const angle = Math.random() * Math.PI * 2;
    const endX = x + Math.cos(angle) * 10; // create a point in a random direction
    const endY = y + Math.sin(angle) * 10;
    const { vx, vy } = velFrom(x, y, endX, endY);
    spawnBallFrom({ x, y, vx, vy, r });

    // Also randomize cubes and notes lightly
    try{ doRandomCubes(); }catch{}
    try{ doRandomNotes(); }catch{}
  }

  function doRandomCubes() {
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
    
    let picks = [];
    if (K >= N) {
      picks = Array.from({length: N}, (_, i) => i);
    } else {
      const uniq = [];
      while (uniq.length < K) {
        const r = (Math.random() * N) | 0;
        if (!uniq.includes(r)) uniq.push(r);
      }
      picks = uniq;
    }

    for (let i = 0; i < N; i++) { if (blocks[i]) blocks[i].active = false; }
    for (const i of picks) { if (blocks[i]) blocks[i].active = true; }
  }

  function doRandomNotes() {
    randomizeControllers(edgeControllers, noteList);
    const pal = buildPentatonicPalette(noteList, 'C4', 'minor', 1);
    for (let i = pal.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pal[i], pal[j]] = [pal[j], pal[i]];
    }
    for (let i=0;i<blocks.length;i++) { if (blocks[i]) blocks[i].noteIndex = pal[i % pal.length]; }
  }
  
  function doReset(){
    ball = null; lastLaunch = null;
    try { for (const b of blocks){ b.flash = 0; } } catch {}
    try { for (const c of edgeControllers){ c.flash = 0; c.lastHitAT = 0; } } catch {}
  }

  panel.addEventListener('toy-random', doRandom);
  panel.addEventListener('toy-random-cubes', doRandomCubes);
  panel.addEventListener('toy-random-notes', doRandomNotes);
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
  function spawnBallFrom(L, opts = {}, S_ref = null) {
    const isRespawn = !!opts.isRespawn;
    const ac = (typeof ensureAudioContext === 'function') ? ensureAudioContext() : null;
    const nowT = ac ? ac.currentTime : 0;
    if (DBG_RESPAWN()) console.log(`[BNC_DBG] spawnBallFrom (isRespawn: ${isRespawn}) at ${nowT.toFixed(3)}`);

    // Any new ball, whether a user launch or a respawn, starts a new recording sequence.
    // This prevents a respawned ball from becoming a "ghost" during a replay.
    // A new user-initiated launch always starts a new recording.
    if (!isRespawn) {
        if (DBG_RESPAWN()) console.log(`[BNC_DBG] Resetting loop recorder due to new ball (isRespawn: ${isRespawn})`);

        if (loopRec && loopRec.mode === 'replay') {
            try {
                loopRec.isInvalid = true; // Prevent scheduler from firing on next frame
                setToyMuted(toyId, true, 0.08); // 80ms fade-out
                __unmuteAt = ensureAudioContext().currentTime + 0.150; // Unmute in 150ms (after 100ms lookahead)
            } catch(e) { console.warn('[bouncer] mute/unmute failed', e); }
        }

        loopRec = { signature: '', mode: 'record', pattern: [], anchorStartTime: 0, lastBarIndex: -1, scheduledBarIndex: -999, seen: new Set(), };
                // Ensure the shared state carrier used by the renderer points to the new object.
        if (visQ) visQ.loopRec = loopRec;
        try {
            loopRec.signature = stateSignature();
            // Record relative to the local spawn time to ensure the full bar is captured.
            loopRec.anchorStartTime = nowT;
        } catch {}
    }

    const o = { x:L.x, y:L.y, vx:L.vx, vy:L.vy, r: ballR() };

    // If not called from within the physics step (i.e., no state object is passed),
    // this is a manual launch. We must update the module-scoped `ball` variable
    // directly so it appears immediately.
    if (!S_ref) {
        ball = o;
    }

    if (!isRespawn) {
        lastLaunch = { vx: L.vx, vy: L.vy, x: L.x, y: L.y };
    }

    // Set the flight time for the new ball (applies to both launches and respawns).
    try {
      const li = (typeof getLoopInfo==='function') ? getLoopInfo() : null;
      const ac = (typeof ensureAudioContext==='function') ? ensureAudioContext() : null;
      const now = ac ? ac.currentTime : 0;
      let life = 2.0; // Default lifetime of 2 seconds as a fallback.
      if (li && Number.isFinite(li.barLen) && li.barLen > 0){
        life = li.barLen * BOUNCER_BARS_PER_LIFE;
      }
      nextLaunchAt = now + life;
      o.flightEnd = nextLaunchAt;
      if (DBG_RESPAWN()) console.log(`[BNC_DBG] spawnBallFrom: Set nextLaunchAt to ${nextLaunchAt.toFixed(3)} (life: ${life.toFixed(3)})`);
    }catch(e){
      if (DBG_RESPAWN()) console.error('[BNC_DBG] Error in spawnBallFrom while setting flightEnd:', e);
    }

    if (!isRespawn) {
        try { fx.onLaunch && fx.onLaunch(L.x, L.y); } catch {}
    }
    // If a state object was passed, update its nextLaunchAt property directly
    // to prevent applyFromStep from overwriting the new value.
    if (S_ref && typeof S_ref === 'object') {
      S_ref.nextLaunchAt = nextLaunchAt;
    }
    if (DBG_RESPAWN()) console.log('[BNC_DBG] spawnBallFrom: Returning new ball object', { flightEnd: o?.flightEnd?.toFixed(3) });
    return o;
  }
function setNextLaunchAt(t){ nextLaunchAt = t; }
  function setBallOut(o){ ball = o; }

    const __aim = { active:false, sx:0, sy:0, cx:0, cy:0 };
// Persistent per-step state for physics (dedupe & spawn windows)
let __lastTickByBlock = new Map();
let __lastTickByEdge  = new Map();
let __justSpawnedUntil = 0;

try { setToyMuted(toyId, false); } catch(e) {}

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
    blocks, edgeControllers, handle, spawnBallFrom, setNextLaunchAt, setBallOut, instrument: ()=>instrument, toyId, noteList, velFrom, isAdvanced: ()=>panel.classList.contains('toy-zoomed') });
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
  buildStateForStep: (now, prevNow)=>{ // now is current AudioContext.currentTime
    // Time conversion logic is now handled inside bouncer-step.js to ensure perfect sync with physics.

    const li0 = (typeof getLoopInfo==='function') ? getLoopInfo() : null;
    const triggerPhysAware = (i,n,t,meta)=>{
      if (window && window.BOUNCER_LOOP_DBG) try{ if ((globalThis.BOUNCER_DBG_LEVEL|0)>=2) console.log('[bouncer-audio] fire?', n, 't=', (typeof t==='number')?t.toFixed(4):'imm'); }catch{}
      try{
        const li = (typeof getLoopInfo==='function') ? getLoopInfo() : li0;
        const lr = (visQ && visQ.loopRec) ? visQ.loopRec : null;
        const nowT = li ? li.now : (t||0);
        const barLen = li ? li.barLen : 1;
        const beatDur = barLen/4;
        const anchor = (visQ && visQ.loopRec && visQ.loopRec.anchorStartTime) ? visQ.loopRec.anchorStartTime : (li ? li.loopStartTime : 0);
        const k = Math.floor(Math.max(0, (nowT - anchor) / barLen));

        // During replay, all sound comes from the scheduler. The live ball is silent.
        if (lr && lr.mode === 'replay') {
            return;
        }

        if (lr && lr.mode === 'record'){
          try {
            const ac = ensureAudioContext ? ensureAudioContext() : null;
            const scheduledT = (typeof t === 'number') ? t : ((ac ? ac.currentTime : 0) + 0.0008);
            triggerInstrument(i||instrument, n, scheduledT, toyId);
          } catch(e){}
          const at = (typeof t==='number' ? t : nowT);
          // To align with the global beat, calculate offset relative to the start of the global bar
          // that was active at the time of the hit.
          const globalBarIndex = Math.floor(Math.max(0, (at - li.loopStartTime) / barLen));
          const globalBarStart = li.loopStartTime + globalBarIndex * barLen;
          const offBeats = (at - globalBarStart) / beatDur;
          // Store the raw, unquantized offset. Quantization will be applied on replay.
          const off = offBeats;
          if (visQ && visQ.loopRec && Array.isArray(visQ.loopRec.pattern)){
            // De-dupe notes recorded in the same bar to prevent runaway pattern growth.
            // Key by note and quantized 16th-note time.
            const key = `${n}@${Math.round(off * 4)}`;
            if (lr.seen && !lr.seen.has(key)) {
              lr.seen.add(key);
              const event = { note: n, offset: off };
              if (meta && meta.blockIndex != null) event.blockIndex = meta.blockIndex;
              if (meta && meta.edgeControllerIndex != null) event.edgeControllerIndex = meta.edgeControllerIndex;
              if (meta && meta.edgeName != null) event.edgeName = meta.edgeName;
              visQ.loopRec.pattern.push(event);
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
      __unmuteAt,
      lastLaunch,
      nextLaunchAt,
      nextLaunchAtRemaining,
      spawnBallFrom, // The triggerInstrument passed to stepBouncer now accepts a meta object
      triggerInstrument: (i,n,t,meta)=>{ try{ if (window && window.BOUNCER_FORCE_RAW){   return triggerInstrument(i||instrument, n, t, toyId); } }catch{} return triggerPhysAware(i,n,t,meta);},
      triggerInstrumentRaw: (i,n,t)=>triggerInstrument(i||instrument, n, t, toyId),
      getQuantDiv: ()=>{ try{ const v = __getQuantDiv ? __getQuantDiv() : 4; return (Number.isFinite(v)? v : 4); }catch(_){ return 4; } },
      BOUNCER_BARS_PER_LIFE,
      setNextLaunchAt: (t)=>{ nextLaunchAt = t; },
      setBallOut: (o)=>{ ball = o; },
      fx,
      __lastTickByBlock,
      __lastTickByEdge,
      __justSpawnedUntil
    };
    S.visQ = visQ;
    S.ball = ball; // Use the module-scoped `ball` directly.
    if (DBG_RESPAWN()) {
      console.log('[BNC_DBG] buildStateForStep: Ball state pre-step', { flightEnd: S.ball?.flightEnd?.toFixed(3) });
    }
    return S;
  },
  applyFromStep: (S)=>{
    if (S){
      visQ = S.visQ || visQ;
      if ('ball' in S) ball = S.ball;
      if ('lastLaunch' in S && S.lastLaunch) lastLaunch = S.lastLaunch;
      // Overwrite nextLaunchAt: spawnBallFrom updates S.nextLaunchAt, and we need to persist it for the next frame.
      if ('nextLaunchAt' in S) {
        const changed = nextLaunchAt !== S.nextLaunchAt;
        const oldVal = nextLaunchAt;
        nextLaunchAt = S.nextLaunchAt;
        if (DBG_RESPAWN() && changed) {
            console.log(`[BNC_DBG] applyFromStep: Updated nextLaunchAt from ${oldVal?.toFixed(3)} to ${nextLaunchAt?.toFixed(3)}`);
        }
      }
      if (S.__lastTickByBlock) __lastTickByBlock = S.__lastTickByBlock;
      if (S.__lastTickByEdge) __lastTickByEdge = S.__lastTickByEdge;
      if (typeof S.__justSpawnedUntil === 'number') __justSpawnedUntil = S.__justSpawnedUntil;
      if ('nextLaunchAtRemaining' in S) {
        nextLaunchAtRemaining = S.nextLaunchAtRemaining;
      }
      if (typeof S.__unmuteAt === 'number') __unmuteAt = S.__unmuteAt;
      if (DBG_RESPAWN()) {
        console.log('[BNC_DBG] applyFromStep: Ball state is now', { flightEnd: ball?.flightEnd?.toFixed(3) });
      }
    }
  }
});
requestAnimationFrame(draw);


  function onLoop(_loopStart){} // no-op
  const instanceApi = { onLoop, reset: doReset, setInstrument: (n)=>{ instrument = n || instrument; }, element: canvas };

  // Apply any pending snapshot provided before init
  try{
    const pending = panel.__pendingBouncerState;
    if (pending && typeof panel.__applyBouncerSnapshot === 'function'){
      panel.__applyBouncerSnapshot(pending);
      delete panel.__pendingBouncerState;
    }
  }catch{}
  panel.__bouncer_main_instance = instanceApi;
  return instanceApi;
}
