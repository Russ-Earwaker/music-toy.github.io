import { initToyUI } from './toyui.js';
import { randomizeAllImpl } from './ripplesynth-random.js';
import { randomizeRects } from './toyhelpers.js';
import { resizeCanvasForDPR, noteList } from './utils.js';
import { PENTATONIC_OFFSETS } from './ripplesynth-scale.js';
import { boardScale } from './board-scale-helpers.js';
import { ensureAudioContext, barSeconds as audioBarSeconds, getLoopInfo } from './audio-core.js';
import { installQuantUI } from './bouncer-quant-ui.js';
import { triggerInstrument as __rawTrig } from './audio-samples.js';
import { drawBlocksSection } from './ripplesynth-blocks.js';
import { makePointerHandlers } from './ripplesynth-input.js';
import { initParticles, setParticleBounds, drawParticles } from './ripplesynth-particles.js';
import { drawWaves, drawGenerator } from './ripplesynth-waves.js';
import { handleBlockTap } from './ripplesynth-zoomtap.js';
import { makeGetBlockRects } from './ripplesynth-rects.js';
import { installLoopGuards } from './rippler-loopguard.js';
import { createScheduler } from './ripplesynth-scheduler.js';

export function createRippleSynth(selector){
  const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector;
  const panel  = shell?.closest?.('.toy-panel') || shell;
  const toyId = (panel?.dataset?.toyid || panel?.dataset?.toy || 'rippler').toLowerCase();
  const triggerInstrument = (inst, name, when)=> __rawTrig(inst, name, when, toyId);

  const canvas = document.createElement('canvas');
  let __baseAttrW = 0;
  function rectScale(){
    const w = canvas.width || 0;
    if (!__baseAttrW && w>0) __baseAttrW = w;
    return (__baseAttrW>0 && w>0) ? (w/__baseAttrW) : 1;
  }

  try{ if (typeof window!=='undefined' && typeof window.__ripplerUserArmed==='undefined'){ window.__ripplerUserArmed=false; } }catch{}
  try{ canvas.addEventListener('pointerdown', ()=>{ try{ window.__ripplerUserArmed=true; }catch{} }); }catch{}
  try{ canvas.style.setProperty('width','100%','important'); canvas.style.setProperty('height','100%','important'); canvas.style.display='block'; }catch{};

  canvas.className = 'rippler-canvas';
  canvas.style.display = 'block';

  // Mount into a square wrapper inside toy-body to ensure a true square area
  let __mountHost = panel.querySelector?.('.rippler-wrap');
  try {
    if (!__mountHost) {
      const body = panel.querySelector?.('.toy-body') || panel;
      __mountHost = document.createElement('div');
      __mountHost.className = 'rippler-wrap';
      body.appendChild(__mountHost);
    }
  } catch {}
  __mountHost = __mountHost || panel.querySelector?.('.toy-body') || panel;
  __mountHost.appendChild(canvas);
  try{
    const host = __mountHost;
    if((host.clientHeight|0)<40){
      canvas.style.display='block';
      canvas.style.width='100%';
      canvas.style.height='100%';
      canvas.style.minHeight='0px';
    }
  }catch{}

  const ctx = canvas.getContext('2d');
  const ui  = initToyUI(panel, { toyName: 'Rippler' });
  // Install quantization UI (shared with Bouncer), default to 1/4
  try{ if (!panel.dataset.quantDiv && !panel.dataset.quant) panel.dataset.quantDiv = '4'; }catch{}
  // Keep a getter to read current quant divisor reliably (like Bouncer)
  let __getQuantDiv = null;
  try{ __getQuantDiv = installQuantUI(panel, parseFloat(panel?.dataset?.quantDiv||panel?.dataset?.quant||'4')); }catch{}

  let currentInstrument = (ui.instrument && ui.instrument !== 'tone') ? ui.instrument : 'kalimba';
  try { ui.setInstrument(currentInstrument); } catch {}
  const baseNoteName = (panel?.dataset?.ripplerOct || 'C4');
  panel.addEventListener('toy-instrument', (e)=>{ try{ currentInstrument = (e?.detail?.value)||currentInstrument; }catch{} });

  // Zoom state helper used by renderers
  const isZoomed = ()=> panel.classList.contains('toy-zoomed');
  // Sizing object passed to shared renderers; include isZoomed so they can show arrows/labels in Advanced view
  const sizing = { scale: 1, isZoomed };
  panel.addEventListener('toy-zoom', ()=>{ try { setParticleBounds(canvas.width|0, canvas.height|0); } catch {} });
  // Debug helper
  const __dbg = (...args)=>{ try{ if (window && window.RIPPLER_TIMING_DBG) console.log('[rippler]', ...args); }catch{} };

  // Flash the quant dot on each tick (same visual as Bouncer)
  try{
    let lastTick = -1;
    const tickDot = ()=>{
      try{
        const li = getLoopInfo();
        // Prefer live getter, then live <select>, then dataset
        let div = NaN;
        try{ const v0 = (__getQuantDiv && __getQuantDiv()); if (Number.isFinite(v0)) div = v0; }catch{}
        const sel = (!Number.isFinite(div)) ? panel.querySelector('.bouncer-quant-ctrl select') : null;
        if (sel){ const v = parseFloat(sel.value); if (Number.isFinite(v)) div = v; }
        if (!Number.isFinite(div)){
          const ds = parseFloat(panel.dataset.quantDiv || panel.dataset.quant || '');
          if (Number.isFinite(ds)) div = ds;
        }
        if (!Number.isFinite(div)) div = 4;
        const beatLen = li?.beatLen || 0;
        const grid = (div>0 && beatLen) ? (beatLen/div) : 0;
        const now = ensureAudioContext().currentTime;
        const rel = li ? Math.max(0, now - li.loopStartTime) : 0;
        const k = grid>0 ? Math.ceil((rel+1e-6)/grid) : -1;
        if (k !== lastTick && k >= 0){
          lastTick = k;
          const dot = panel.querySelector('.bouncer-quant-ctrl .bouncer-quant-dot');
          if (dot && dot.animate){
            dot.animate([
              { transform:'scale(1)', background:'rgba(255,255,255,0.35)', boxShadow:'0 0 0 0 rgba(255,255,255,0.0)' },
              { transform:'scale(1.35)', background:'#fff', boxShadow:'0 0 10px 4px rgba(255,255,255,0.65)' },
              { transform:'scale(1)', background:'rgba(255,255,255,0.35)', boxShadow:'0 0 0 0 rgba(255,255,255,0.0)' }
            ], { duration: Math.max(140, Math.min(260, (grid||0.2)*700 )), easing: 'ease-out' });
          }
        }
      }catch{}
      requestAnimationFrame(tickDot);
    };
    requestAnimationFrame(tickDot);
  }catch{}

  const EDGE=4;
  const W = ()=> (canvas.width|0);
  const H = ()=> (canvas.height|0);
  const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

  const n2x = (nx)=>{ const z=isZoomed(); const side=z? Math.max(0, Math.min(W(),H())-2*EDGE) : (W()-2*EDGE); const offX = z? Math.max(EDGE, (W()-side)/2): EDGE; return offX + nx*side; };
  const n2y = (ny)=>{ const z=isZoomed(); const side=z? Math.max(0, Math.min(W(),H())-2*EDGE) : (H()-2*EDGE); const offY = z? Math.max(EDGE, (H()-side)/2): EDGE; return offY + ny*side; };
  const x2n = (x)=>{ const z=isZoomed(); const side=z? Math.max(0, Math.min(W(),H())-2*EDGE) : (W()-2*EDGE); const offX = z? Math.max(EDGE, (W()-side)/2): EDGE; return Math.min(1, Math.max(0, (x-offX)/side)); };
  const y2n = (y)=>{ const z=isZoomed(); const side=z? Math.max(0, Math.min(W(),H())-2*EDGE) : (H()-2*EDGE); const offY = z? Math.max(EDGE, (H()-side)/2): EDGE; return Math.min(1, Math.max(0, (y-offY)/side)); };

  const getCanvasPos = (el, e)=>{ const r = el.getBoundingClientRect(); const sx = r.width? (el.width / r.width) : 1; const sy = r.height? (el.height / r.height) : 1; return { x: (e.clientX - r.left)*sx, y: (e.clientY - r.top)*sy }; };

  const CUBES = 8, BASE = 56 * 0.75;
  const blocks = Array.from({length:CUBES}, (_,i)=>({ nx:0.5, ny:0.5, nx0:0.5, ny0:0.5, vx:0, vy:0, flashEnd:0, flashDur:0.18, active:true, noteIndex: ((noteList.indexOf('C4')>=0?noteList.indexOf('C4'):48) + PENTATONIC_OFFSETS[i % PENTATONIC_OFFSETS.length]) }));

  let didLayout=false;
  function layoutBlocks(){
    if (didLayout || !W() || !H()) return;
    const size = Math.round(BASE*(sizing.scale||1)*boardScale(canvas));
    const bounds = { x: EDGE, y: EDGE, w: Math.max(1, W()-EDGE*2), h: Math.max(1, H()-EDGE*2) };
    const rects = Array.from({length:CUBES}, ()=>({
      x: Math.round(bounds.x + Math.random()*(bounds.w - size)),
      y: Math.round(bounds.y + Math.random()*(bounds.h - size)),
      w: size, h: size
    }));
    try { randomizeRects(rects, bounds, 6); } catch {}
    for (let i=0;i<CUBES;i++){
      const r = rects[i];
      const cx = r.x + r.w/2, cy = r.y + r.h/2;
      blocks[i].nx = blocks[i].nx0 = x2n(cx);
      blocks[i].ny = blocks[i].ny0 = y2n(cy);
    }
    try {
      const baseIx = (noteList.indexOf('C4')>=0?noteList.indexOf('C4'):48);
      for (let i=0;i<CUBES;i++){
        const b = blocks[i];
        b.noteIndex = baseIx + PENTATONIC_OFFSETS[i % PENTATONIC_OFFSETS.length];
      }
    } catch {}
    didLayout = true;
  }
  layoutBlocks();

  const generator = { nx:0.5, ny:0.5, r:10, placed:false };
  let ripples = []; // {x,y,startAT,speed}
  const RING_SPEED = ()=> Math.hypot(W(), H()) / (audioBarSeconds() || 2.0); // px/sec

  let particlesInit = false;
  const ac = ensureAudioContext();
  const NUM_STEPS = 8;
  const barSec = ()=> audioBarSeconds() || 2.0;
  const stepSeconds = ()=> barSec()/NUM_STEPS;
  let barStartAT = ac.currentTime, nextSlotAT = barStartAT + stepSeconds(), nextSlotIx = 1;

  const pattern = Array.from({length:NUM_STEPS}, ()=> new Set());
  const liveBlocks = new Set();      // blocks that play from ripple while dragging
  const recordOnly = new Set();      // blocks to (re)record on next ripple hit
  let skipNextBarRing = false;
  let recording = false;
  let dragMuteActive = false;
  let playbackMuted = false;
  let _genDownPos = null;
  let lastSpawnPerf = 0;
  let _wasPlacedAtDown = false;

  const __schedState = { suppressSlots: new Set(), suppressUntilMap: new Map(),
    get barStartAT(){ return barStartAT; }, set barStartAT(v){ barStartAT = v; },
    get nextSlotAT(){ return nextSlotAT; }, set nextSlotAT(v){ nextSlotAT = v; },
    get nextSlotIx(){ return nextSlotIx; }, set nextSlotIx(v){ nextSlotIx = v; },
    get recording(){ return recording; }, set recording(v){ recording = v; },
    get skipNextBarRing(){ return skipNextBarRing; }, set skipNextBarRing(v){ skipNextBarRing = v; },
    recordOnly, liveBlocks
  };

  const scheduler = createScheduler({
    ac, NUM_STEPS, barSec, stepSeconds,
    pattern, blocks, noteList,
    triggerInstrument, getInstrument: ()=> currentInstrument,
    generator, RING_SPEED, spawnRipple,
    state: __schedState,
    isPlaybackMuted: ()=> playbackMuted,
    getLoopInfo,
    getQuantDiv: ()=>{
      // Use the same robust read order
      try{ const v0 = (__getQuantDiv && __getQuantDiv()); if (Number.isFinite(v0)) return v0; }catch{}
      try{ const sel = panel.querySelector('.bouncer-quant-ctrl select'); if (sel){ const v=parseFloat(sel.value); if (Number.isFinite(v)) return v; } }catch{}
      try{ const ds = parseFloat(panel.dataset.quantDiv || panel.dataset.quant || ''); if (Number.isFinite(ds)) return ds; }catch{}
      return 4;
    }
  });

  function randomizeAll(){
    didLayout = false;
    randomizeAllImpl(panel, {
      toyId,
      blocks, noteList,
      layoutBlocks,
      clearPattern: ()=> pattern.forEach(s=> s.clear()),
      recordOnly,
      isActive: (b)=> !!b.active,
      setRecording: (v)=>{ recording = !!v; },
      setSkipNextBarRing: (v)=>{ skipNextBarRing = !!v; },
      setPlaybackMuted: (v)=>{ playbackMuted = !!v; },
      baseIndex: (list)=> (list.indexOf(baseNoteName)>=0? list.indexOf(baseNoteName): (list.indexOf('C4')>=0? list.indexOf('C4'):48)),
      pentatonicOffsets: PENTATONIC_OFFSETS
    });
    try {
      const nowAT = ac.currentTime;
      spawnRipple(false);
      barStartAT = nowAT;
      nextSlotAT = barStartAT + stepSeconds();
      nextSlotIx = 1;
      pattern.forEach(s=> s.clear());
      recording = true;
    } catch (e) { try { console.warn('[rippler random rearm]', e); } catch {} }
  }
  panel.addEventListener('toy-random', randomizeAll);
  panel.addEventListener('toy-clear', (ev)=>{ try{ ev.stopImmediatePropagation?.(); }catch{}; pattern.forEach(s=> s.clear()); ripples.length=0; generator.placed=false; });
  panel.addEventListener('toy-reset', ()=>{ pattern.forEach(s=> s.clear()); ripples.length=0; generator.placed=false; });

  const getBlockRects = makeGetBlockRects(n2x, n2y, sizing, BASE, blocks);

  const input = makePointerHandlers({ generatorRef: {
      get x(){ return n2x(generator.nx); },
      get y(){ return n2y(generator.ny); },
      place(x,y){ this.set(x,y); },
      set(x,y){ generator.nx = x2n(x); generator.ny = y2n(y); generator.placed = true; },
      get placed(){ return !!generator.placed; },
      set placed(v){ generator.placed = !!v; },
      get r(){ return generator.r || 12; }
    }, canvas, vw:W, vh:H, EDGE, blocks:[], ripples, getBlockRects, isZoomed, clamp, getCanvasPos,
    onBlockTap: (idx, p)=>{
      const size2 = Math.max(20, Math.round(BASE*(sizing.scale||1)*rectScale()));
      const b = blocks[idx];
      const rect = { x:n2x(b.nx)-size2/2, y:n2y(b.ny)-size2/2, w:size2, h:size2 };
      handleBlockTap(blocks, idx, p, rect, { noteList, ac, pattern, trigger: triggerInstrument, instrument: currentInstrument, __schedState });
    },
    onBlockTapStd: (idx, p)=>{
      const b = blocks[idx];
      const was = !!b.active; b.active = !b.active;
      if (!was && b.active){ try{ __schedState?.recordOnly?.add?.(idx); }catch{} }
      try {
        const name = noteList[b.noteIndex] || 'C4';
        // Quantize immediate tap to next beat/div boundary
        const li = getLoopInfo();
        // Prefer getter, then live <select>, then dataset
        let div = NaN; try{ const v0 = (__getQuantDiv && __getQuantDiv()); if (Number.isFinite(v0)) div = v0; }catch{}
        try{ if (!Number.isFinite(div)){ const sel=panel.querySelector('.bouncer-quant-ctrl select'); if (sel){ const v=parseFloat(sel.value); if (Number.isFinite(v)) div=v; } } }catch{}
        if (!Number.isFinite(div)){
          const ds = parseFloat(panel.dataset.quantDiv || panel.dataset.quant || '');
          if (Number.isFinite(ds)) div = ds;
        }
        if (!Number.isFinite(div) || div <= 0){ triggerInstrument(currentInstrument, name, ac.currentTime + 0.0005); }
        else {
          const beatLen = li?.beatLen || (audioBarSeconds()/4);
          const grid = beatLen / div;
          const at = ac.currentTime;
          const rel = li ? Math.max(0, at - li.loopStartTime) : 0;
          const k = Math.ceil((rel + 1e-6) / grid);
          const tSched = (li?.loopStartTime || at) + k * grid + 0.0004;
          triggerInstrument(currentInstrument, name, tSched);
        }
      } catch {}
    },
    onBlockDrag: (idx, newX, newY)=>{
      const size2 = Math.max(20, Math.round(BASE*(sizing.scale||1)*rectScale()));
      const cx = newX + size2/2, cy = newY + size2/2;
      const nx = x2n(cx), ny = y2n(cy);
      const b = blocks[idx]; if (!b) return;
      b.nx = Math.max(0, Math.min(1, nx));
      b.ny = Math.max(0, Math.min(1, ny));
      b.nx0 = b.nx; b.ny0 = b.ny; b.vx = 0; b.vy = 0;
    },
    onBlockGrab: (idx)=>{ liveBlocks.add(idx); try { for (let s=0; s<pattern.length; s++){ pattern[s].delete(idx); } } catch {} },
    onBlockDrop: (idx)=>{ liveBlocks.delete(idx); recordOnly.add(idx); }
  });

  canvas.addEventListener('pointerdown', (e)=>{
    const gp = getCanvasPos(canvas, e);
    const gx0 = n2x(generator.nx), gy0 = n2y(generator.ny);
    const nearGen = generator.placed && !isZoomed() && (Math.hypot(gp.x - gx0, gp.y - gy0) <= Math.max(20, generator.r*(sizing.scale||1)+10));
    dragMuteActive = nearGen; playbackMuted = nearGen; if (nearGen){ ripples.length = 0; lastSpawnPerf = 0; }
    _genDownPos = { x: gx0, y: gy0 };
    if (isZoomed()){ }
    const wasPlaced = generator.placed; _wasPlacedAtDown = wasPlaced;
    input.pointerDown(e);
    if (!wasPlaced && generator.placed){
      pattern.forEach(s=> s.clear());
      spawnRipple(false);
      barStartAT = ac.currentTime; nextSlotAT = barStartAT + stepSeconds(); nextSlotIx = 1; recording = true;
    }
  });

  canvas.addEventListener('pointermove', input.pointerMove);

  canvas.addEventListener('pointerup', (e)=>{
    const prevDrag = dragMuteActive; dragMuteActive=false;
    input.pointerUp(e);
    const nowAT = ac.currentTime;
    if (prevDrag){
      playbackMuted=false;
      spawnRipple(false);
      barStartAT=nowAT; nextSlotAT=barStartAT+stepSeconds(); nextSlotIx=1; pattern.forEach(s=> s.clear()); recording=true;
    } else {
      const gx=n2x(generator.nx), gy=n2y(generator.ny);
      if (_wasPlacedAtDown && _genDownPos && Math.hypot((_genDownPos.x-gx),(_genDownPos.y-gy))>4){
        spawnRipple(false);
        barStartAT=nowAT; nextSlotAT=barStartAT+stepSeconds(); nextSlotIx=1; pattern.forEach(s=> s.clear()); recording=true;
      }
    }
    _genDownPos=null; _wasPlacedAtDown=false;
  });

  function spawnRipple(manual=false){
    if (!generator?.placed) return;
    // Allow programmatic/manual spawns to bypass the first-interaction guard
    if (typeof window !== 'undefined' && !window.__ripplerUserArmed && !manual) return;
    const nowAT = ac.currentTime, nowPerf = ac.currentTime;
    if (nowPerf - lastSpawnPerf < 0.15) return; // debounce double fires
    lastSpawnPerf = nowPerf;
    const gx = n2x(generator.nx), gy = n2y(generator.ny);
    const corners = [[0,0],[W(),0],[0,H()],[W(),H()]];
    const offR = Math.max(...corners.map(([x,y])=> Math.hypot(x-gx, y-gy))) + 64;
    ripples.push({ x: gx, y: gy, startAT: nowAT, startTime: nowPerf, speed: RING_SPEED(), offR, hit: new Set(), r2off: (RING_SPEED() * (barSec()/2)) });
    if (manual) skipNextBarRing = true;
  }

  function ringFront(nowAT){
    if (!ripples.length) return -1;
    return Math.max(0, (nowAT - (ripples[0].startAT||nowAT)) * RING_SPEED());
  }

  function handleRingHits(nowAT){
    if (playbackMuted && !dragMuteActive) return;
    if (!ripples.length || !generator.placed) return;
    const rMain = ripples[ripples.length-1]; rMain.hit = rMain.hit || new Set();
    const R = Math.max(0, (nowAT - (rMain.startAT||nowAT)) * (rMain.speed||RING_SPEED()));
    const band = 9; const gx = n2x(generator.nx), gy = n2y(generator.ny);
    const size2 = Math.max(20, Math.round(BASE*(sizing.scale||1)*rectScale()));
    for (let i=0;i<blocks.length;i++){
      const b = blocks[i]; if (!b.active || rMain.hit.has(i)) continue;
      const cx = n2x(b.nx), cy = n2y(b.ny);
      const dx = Math.max(Math.abs(cx - gx) - size2/2, 0), dy = Math.max(Math.abs(cy - gy) - size2/2, 0);
      const dEdge = Math.hypot(dx,dy);
      if (Math.abs(dEdge - R) <= band){
        rMain.hit.add(i); b.pulse = 1; b.cflash = 1; if (!liveBlocks.has(i)) { b.flashEnd = Math.max(b.flashEnd, ac.currentTime + 0.18); }
        const ang = Math.atan2(cy - gy, cx - gx), push = 64 * (sizing.scale || 1); b.vx += Math.cos(ang)*push; b.vy += Math.sin(ang)*push;
        const whenAT = ac.currentTime, slotLen = stepSeconds(); let k = Math.ceil((whenAT - barStartAT)/slotLen); if (k<0) k=0;
        const slotIx = k % NUM_STEPS; const name = noteList[b.noteIndex] || 'C4';
        __dbg('record-hit', { name, whenAT: +whenAT.toFixed?.(4) || whenAT, barStartAT: barStartAT, slotIx, k, slotLen });
        if (liveBlocks.has(i)) {
          try {
            // Quantize live block hits to next beat/div where applicable
            const li2 = getLoopInfo();
            // Prefer getter, then live <select>, then dataset
            let div2 = NaN; try{ const v0 = (__getQuantDiv && __getQuantDiv()); if (Number.isFinite(v0)) div2 = v0; }catch{}
            try{ if (!Number.isFinite(div2)){ const sel=panel.querySelector('.bouncer-quant-ctrl select'); if (sel){ const v=parseFloat(sel.value); if (Number.isFinite(v)) div2=v; } } }catch{}
            if (!Number.isFinite(div2)){
              const ds = parseFloat(panel.dataset.quantDiv || panel.dataset.quant || '');
              if (Number.isFinite(ds)) div2 = ds;
            }
            if (!Number.isFinite(div2) || div2 <= 0){ triggerInstrument(currentInstrument, name, whenAT + 0.0005); }
            else {
              const beatLen2 = li2?.beatLen || (audioBarSeconds()/4);
              const grid2 = beatLen2 / div2;
              const rel2 = li2 ? Math.max(0, whenAT - li2.loopStartTime) : 0;
              const k2 = Math.ceil((rel2 + 1e-6) / grid2);
              const tSched2 = (li2?.loopStartTime || whenAT) + k2 * grid2 + 0.0004;
              __dbg('record-live-quant', { name, div: div2, grid: +grid2.toFixed?.(4) || grid2, rel: +rel2.toFixed?.(4) || rel2, k: k2, tSched: tSched2 });
              triggerInstrument(currentInstrument, name, tSched2);
            }
          } catch {}
        }
        try { } catch {}
        try { } catch {}
        if (!liveBlocks.has(i) && (recording || recordOnly.has(i))){
          try {
            // Schedule recording preview at quantized beat/div to match bouncer behavior
            const li3 = getLoopInfo();
            // Prefer getter, then live <select>, then dataset
            let div3 = NaN; try{ const v0 = (__getQuantDiv && __getQuantDiv()); if (Number.isFinite(v0)) div3 = v0; }catch{}
            try{ if (!Number.isFinite(div3)){ const sel=panel.querySelector('.bouncer-quant-ctrl select'); if (sel){ const v=parseFloat(sel.value); if (Number.isFinite(v)) div3=v; } } }catch{}
            if (!Number.isFinite(div3)){
              const ds = parseFloat(panel.dataset.quantDiv || panel.dataset.quant || '');
              if (Number.isFinite(ds)) div3 = ds;
            }
            const slotTime = barStartAT + k*slotLen;
            if (!Number.isFinite(div3) || div3 <= 0){ triggerInstrument(currentInstrument, name, slotTime + 0.0005); }
            else {
              const beatLen3 = li3?.beatLen || (audioBarSeconds()/4);
              const grid3 = beatLen3 / div3;
              // Align to the same grid the scheduler will use for this slot time
              const rel3 = li3 ? Math.max(0, slotTime - li3.loopStartTime) : 0;
              const k3 = Math.ceil((rel3 + 1e-6) / grid3);
              const tSched3 = (li3?.loopStartTime || slotTime) + k3 * grid3 + 0.0004;
              __dbg('record-preview-quant', { name, div: div3, grid: +grid3.toFixed?.(4) || grid3, rel: +rel3.toFixed?.(4) || rel3, k: k3, slotTime, tSched: tSched3 });
              triggerInstrument(currentInstrument, name, tSched3);
            }
          } catch {}
          try { } catch {}
          const slot = pattern[slotIx]; let existsSame = false;
          for (const jj of slot){ const nm = noteList[blocks[jj].noteIndex] || 'C4'; if (nm === name){ existsSame = true; break; } }
          if (!existsSame) slot.add(i); if (recordOnly.has(i)) recordOnly.delete(i);
        }
      }
    }
  }

  function springBlocks(dt){
    const K=14.0, D=0.86;
    for (const b of blocks){
      const px = n2x(b.nx), py = n2y(b.ny);
      const tx = n2x(b.nx0), ty = n2y(b.ny0);
      const ax=(tx-px)*K*dt, ay=(ty-py)*K*dt; b.vx=(b.vx+ax)*D; b.vy=(b.vy+ay)*D;
      b.nx = x2n(px + b.vx*dt);
      b.ny = y2n(py + b.vy*dt);
    }
  }

  let __lastDrawAT = 0;
  function draw(){
    try {
      resizeCanvasForDPR(canvas, ctx);
      if (!didLayout) layoutBlocks();
      ctx.clearRect(0,0,W(),H());
      if (!(W() && H())){
        if (!window.__ripplerZeroWarned){ window.__ripplerZeroWarned = true; }
        return;
      }
      ctx.fillStyle = '#0b0f16';
      ctx.fillRect(0,0,W(),H());

      const size = Math.round(BASE*(sizing.scale||1)*boardScale(canvas));
      for (let b of blocks){ if (b.pulse){ b.pulse = Math.max(0, b.pulse*0.90 - 0.03); } if (b.cflash){ b.cflash = Math.max(0, b.cflash*0.94 - 0.02); } }
      const blockRects = getBlockRects();

      if (!particlesInit && canvas.width && canvas.height){ try { initParticles(canvas.width, canvas.height, EDGE, 280); particlesInit = true; } catch {} }
      if (typeof window.__rpW === 'undefined'){ window.__rpW = canvas.width; window.__rpH = canvas.height; }
      if (canvas.width !== window.__rpW || canvas.height !== window.__rpH){
        window.__rpW = canvas.width; window.__rpH = canvas.height;
        try { initParticles(canvas.width, canvas.height, EDGE, 280); } catch {}
      }

      if (generator.placed){
        ctx.save();
        ctx.strokeStyle='rgba(255,255,255,0.65)';
        drawWaves(ctx, n2x(generator.nx), n2y(generator.ny), ac.currentTime, RING_SPEED(), ripples, NUM_STEPS, stepSeconds, (sizing.scale||1));
        ctx.restore();
      }

      drawParticles(ctx, ac.currentTime, ripples, { x:n2x(generator.nx), y:n2y(generator.ny) }, blockRects);

      const __nowAT = ac.currentTime; const __dt = (__lastDrawAT ? (__nowAT-__lastDrawAT) : 0); __lastDrawAT = __nowAT;
      for (let i=0;i<blocks.length;i++){ const b=blocks[i]; if (b.rippleAge != null && b.rippleMax){ b.rippleAge = Math.min(b.rippleMax, Math.max(0, b.rippleAge + __dt)); } }

      // Draw blocks at their own positions; no global offset
      drawBlocksSection(ctx, blockRects, 0, 0, null, 1, noteList, sizing, null, null, ac.currentTime);

      if (generator.placed){
        drawGenerator(ctx, n2x(generator.nx), n2y(generator.ny), Math.max(8, Math.round(generator.r*(sizing.scale||1))), ac.currentTime, ripples, NUM_STEPS, stepSeconds, (sizing.scale||1));
      }

      springBlocks(1/60);
      handleRingHits(ac.currentTime);
      scheduler.tick();
      scheduler.tick();

      if (input && input.state && input.state.generatorDragEnded){
        input.state.generatorDragEnded=false;
        const nowAT = ac.currentTime; spawnRipple(true);
        barStartAT=nowAT; nextSlotAT=barStartAT+stepSeconds(); nextSlotIx=1; pattern.forEach(s=> s.clear()); recording=true;
      }
    } catch (err) { console.error('[rippler draw]', err); } finally { requestAnimationFrame(draw); }
  }

  function reset(){
    ripples.length=0;
    for (const b of blocks){ b.vx=b.vy=0; b.nx=b.nx0; b.ny=b.ny0; b.flashEnd=0; }
    pattern.forEach(s=> s.clear());
    barStartAT = ac.currentTime; nextSlotAT = barStartAT + stepSeconds(); nextSlotIx = 1; recording = true;
  }

  // Advanced-only actions: randomize notes (and actives) and randomize block positions
  function randomizeNotesAndActives(){
    try {
      try { ensureAudioContext(); } catch {}
      // Randomize active set politely using existing helper
      randomizeAllImpl(panel, {
        panel, toyId, blocks,
        clearPattern: ()=> pattern.forEach(s=> s.clear()),
      });
      // Randomize notes within pentatonic offsets around base note
      const baseIx = (noteList.indexOf(baseNoteName)>=0? noteList.indexOf(baseNoteName) : (noteList.indexOf('C4')>=0? noteList.indexOf('C4') : 48));
      for (let i=0;i<blocks.length;i++){
        const off = PENTATONIC_OFFSETS[(Math.random()*PENTATONIC_OFFSETS.length)|0] | 0;
        blocks[i].noteIndex = baseIx + off;
        blocks[i].pulse = 1; blocks[i].cflash = 1; blocks[i].flashEnd = Math.max(blocks[i].flashEnd||0, ac.currentTime + 0.12);
      }
      // Reset loop recording/playback timeline
      const nowAT = ac.currentTime;
      barStartAT = nowAT;
      nextSlotAT = barStartAT + stepSeconds();
      nextSlotIx = 1;
      pattern.forEach(s=> s.clear());
      recording = true;
      // Always seed a fresh ripple: cancel any in-flight waves first
      try { if (Array.isArray(ripples)) ripples.length = 0; spawnRipple(true); } catch {}
    } catch(e) { try { console.warn('[rippler random-notes]', e); } catch {} }
  }
  function randomizeBlockPositions(){
    try {
      try { ensureAudioContext(); } catch {}
      const size = Math.round(BASE*(sizing.scale||1)*boardScale(canvas));
      const bounds = { x: EDGE, y: EDGE, w: Math.max(1, W()-EDGE*2), h: Math.max(1, H()-EDGE*2) };
      const rects = Array.from({length:CUBES}, ()=>({ w:size, h:size }));
      try { randomizeRects(rects, bounds, 6); } catch {}
      for (let i=0;i<CUBES;i++){
        const r = rects[i]; const cx = r.x + r.w/2, cy = r.y + r.h/2;
        const b = blocks[i]; b.nx = b.nx0 = x2n(cx); b.ny = b.ny0 = y2n(cy); b.vx=0; b.vy=0;
        b.pulse = 1; b.cflash = 1; b.flashEnd = Math.max(b.flashEnd||0, ac.currentTime + 0.12);
      }
      // Reset loop recording/playback timeline
      const nowAT = ac.currentTime;
      barStartAT = nowAT;
      nextSlotAT = barStartAT + stepSeconds();
      nextSlotIx = 1;
      pattern.forEach(s=> s.clear());
      recording = true;
      // Always seed a fresh ripple: cancel any in-flight waves first
      try { if (Array.isArray(ripples)) ripples.length = 0; spawnRipple(true); } catch {}
    } catch(e) { try { console.warn('[rippler random-blocks]', e); } catch {} }
  }

  panel.addEventListener('toy-random-notes', randomizeNotesAndActives);
  panel.addEventListener('toy-random-blocks', randomizeBlockPositions);

  randomizeAll();
  requestAnimationFrame(draw);

  return { setInstrument: (name)=> { currentInstrument = name || currentInstrument; try{ ui.setInstrument(name); }catch{} }, reset, element: canvas };
}
