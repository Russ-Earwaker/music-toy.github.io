import { initToyUI } from './toyui.js';
console.log('[Rippler] Core module loaded (v-preview-gen)');
import { randomizeAllImpl } from './ripplesynth-random.js';
import { randomizeRects } from './toyhelpers.js';
import { resizeCanvasForDPR, noteList } from './utils.js';
import { PENTATONIC_OFFSETS } from './ripplesynth-scale.js';
import { boardScale } from './board-scale-helpers.js';
import { ensureAudioContext, barSeconds as audioBarSeconds, getLoopInfo, isRunning, getToyGain, getToyVolume } from './audio-core.js';
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
import { circleRectHit } from './bouncer-helpers.js';
import { drawBlock } from './toyhelpers.js';

export function createRippleSynth(selector){
  const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector;
  const panel  = shell?.closest?.('.toy-panel') || shell;
  const toyId = (panel?.dataset?.toyid || panel?.dataset?.toy || 'rippler').toLowerCase();
  // Ensure the toyId is set on the panel's dataset before any UI is initialized.
  // This is critical for volume/mute controls, which read this dataset attribute
  // to correctly target the toy's audio bus.
  try { panel.dataset.toyid = toyId; } catch {}

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
  // Install quantization UI (shared with Bouncer), default to 1/2
  try{ if (!panel.dataset.quantDiv && !panel.dataset.quant) panel.dataset.quantDiv = '2'; }catch{}
  // Keep a getter to read current quant divisor reliably (like Bouncer)
  let __getQuantDiv = null;
  try{ __getQuantDiv = installQuantUI(panel, parseFloat(panel?.dataset?.quantDiv||panel?.dataset?.quant||'2')); }catch{}
  // If quantization changes mid-loop, re-arm recording so first and subsequent loops match

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
  const __baseSpanW = Math.max(1, Math.abs(n2x(1) - n2x(0)));
  const blocks = Array.from({length:CUBES}, (_,i)=>({
    nx:0.5, ny:0.5, nx0:0.5, ny0:0.5,
    vx:0, vy:0,
    flashEnd:0, flashDur:0.18,
    // By default, disable 3 of the 8 cubes for a less dense initial sound.
    // The specific indices (1, 4, 6) are chosen for a balanced visual layout.
    active: ![1, 4, 6].includes(i),
    noteIndex: ((noteList.indexOf('C4')>=0?noteList.indexOf('C4'):48) + PENTATONIC_OFFSETS[i % PENTATONIC_OFFSETS.length])
  }));
  let previewGenerator = { nx: null, ny: null, placed: false };
  let previewBlocks = [];
  let hasPreviewState = false;

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

  function spawnRipple(manual=false){
    // Any action that spawns a ripple should "wake up" the toy's audio.
    // This restores volume if it was faded out at the end of a previous chain turn.
    try {
      const gainNode = getToyGain(toyId);
      const userVolume = getToyVolume(toyId);
      if (gainNode.gain.value < userVolume) {
        gainNode.gain.setTargetAtTime(userVolume, ac.currentTime, 0.015);
      }
    } catch {}
    // A new ripple should clear any pending preview.
    previewGenerator.placed = false;

    if (!generator?.placed) return;
    // If transport is paused, defer spawning until play resumes
    try{ if (typeof isRunning==='function' && !isRunning()){ __deferredSpawn = true; return; } }catch{}
    // Allow programmatic/manual spawns to bypass the first-interaction guard
    if (typeof window !== 'undefined' && !window.__ripplerUserArmed && !manual) return;
    const nowAT = ac.currentTime, nowPerf = ac.currentTime;
    if (nowPerf - lastSpawnPerf < 0.15){
      try{ if (localStorage.getItem('mt_rippler_dbg')==='1') console.log('[rippler] spawnRipple:skip-debounce',{ manual, ripples:(ripples?ripples.length:0) }); }catch{}
      return; // debounce double fires
    }
    lastSpawnPerf = nowPerf;
    const gx = n2x(generator.nx), gy = n2y(generator.ny);
    const corners = [[0,0],[W(),0],[0,H()],[W(),H()]];
    const offR = Math.max(...corners.map(([x,y])=> Math.hypot(x-gx, y-gy))) + 64;
    // Calculate the ripple's lifetime and set the time to advance the chain.
    const lifeTime = offR / RING_SPEED();
    __schedState.chainAdvanceAt = nowAT + lifeTime;

    ripples.push({ x: gx, y: gy, startAT: nowAT, startTime: nowPerf, speed: RING_SPEED(), offR, hit: new Set(), r2off: (RING_SPEED() * (barSec()/2)) });
    try{ if (localStorage.getItem('mt_rippler_dbg')==='1') console.log('[rippler] spawnRipple:ok',{ manual, ripples:(ripples?ripples.length:0) }); }catch{}
  }

  let particlesInit = false;
  const ac = ensureAudioContext();
  const NUM_STEPS = 8;
  const barSec = ()=> audioBarSeconds() || 2.0;
  const stepSeconds = ()=> barSec()/NUM_STEPS;
  let barStartAT = ac.currentTime, nextSlotAT = barStartAT + stepSeconds(), nextSlotIx = 1;

  const pattern = Array.from({length:NUM_STEPS}, ()=> new Set());
  const patternOffsets = Array.from({length:NUM_STEPS}, ()=> new Map()); // blockIndex -> offsetSeconds from barStart
  const liveBlocks = new Set();      // blocks that play from ripple while dragging
  const recordOnly = new Set();      // blocks to (re)record on next ripple hit
  let recording = false;
  let dragMuteActive = false;
  let playbackMuted = false;
  let _genDownPos = null;
  let lastSpawnPerf = 0;
  let _wasPlacedAtDown = false;
  let __deferredSpawn = false;
  let __lastRunning = null;
  let __armRecordingOnResume = false;
  let __relAtPause = 0; // seconds into local bar when paused
  let __forceResume = false;
  let __pausedNow = 0; // absolute AudioContext time at pause for freezing visuals

  const __schedState = { suppressSlots: new Set(), suppressUntilMap: new Map(),
    wasActiveInChain: false, // for chain activation
    turnOver: false,         // flag to immediately stop scheduler on turn end
    chainAdvanceAt: 0,       // for chain advancement
    ghostSpawnTime: null,    // for life line bar
    ghostEndTime: null,      // for life line bar
    lastGhostProgress: 0,    // for freezing life line on pause
    get barStartAT(){ return barStartAT; }, set barStartAT(v){ barStartAT = v; },
    get nextSlotAT(){ return nextSlotAT; }, set nextSlotAT(v){ nextSlotAT = v; },
    get nextSlotIx(){ return nextSlotIx; }, set nextSlotIx(v){ nextSlotIx = v; },
    get recording(){ return recording; }, set recording(v){ recording = v; },
    recordOnly, liveBlocks
  };

  const scheduler = createScheduler({
    panel,
    ac, NUM_STEPS, barSec, stepSeconds,
    pattern, patternOffsets, blocks, noteList,
    triggerInstrument, getInstrument: ()=> currentInstrument, applyPreviewState,
    generator, RING_SPEED, spawnRipple,
    state: __schedState,
    isPlaybackMuted: ()=> playbackMuted,
    getLoopInfo,
    getQuantDiv: ()=>{
      // Use the same robust read order
      try{ const v0 = (__getQuantDiv && __getQuantDiv()); if (Number.isFinite(v0)) return v0; }catch{}
      // Pass the panel to the scheduler so it can trigger the pulse animation.
      try{ const sel = panel.querySelector('.bouncer-quant-ctrl select'); if (sel){ const v=parseFloat(sel.value); if (Number.isFinite(v)) return v; } }catch{}
      try{ const ds = parseFloat(panel.dataset.quantDiv || panel.dataset.quant || ''); if (Number.isFinite(ds)) return ds; }catch{}
      return 4;
    }
  });

  function applyPreviewState() {
    if (!hasPreviewState && !previewGenerator.placed) return;

    // Apply preview blocks from 'random'
    if (hasPreviewState && previewBlocks.length === blocks.length) {
        for (let i = 0; i < blocks.length; i++) {
            blocks[i].nx = previewBlocks[i].nx;
            blocks[i].ny = previewBlocks[i].ny;
            blocks[i].nx0 = previewBlocks[i].nx; // for spring physics
            blocks[i].ny0 = previewBlocks[i].ny;
            blocks[i].vx = 0;
            blocks[i].vy = 0;
            blocks[i].active = previewBlocks[i].active;
            blocks[i].noteIndex = previewBlocks[i].noteIndex;
        }
    }

    // Apply preview generator (from 'random' or click)
    if (previewGenerator.placed) {
        generator.nx = previewGenerator.nx;
        generator.ny = previewGenerator.ny;
        generator.placed = true;
    }

    // Clear all preview state
    hasPreviewState = false;
    previewBlocks = [];
    previewGenerator.placed = false;
  }

  function randomizeAll(opts = {}){
    const shouldSpawn = opts.spawn !== false;

    // This is a user interaction, so we should arm the toy to allow automatic ripples.
    try { window.__ripplerUserArmed = true; } catch {}

    if (shouldDeferChanges()) {
        // --- PREVIEW LOGIC ---
        // On a running, chained toy, create a preview state instead of applying immediately.
        hasPreviewState = true;
        if (previewBlocks.length !== CUBES) {
            previewBlocks = Array.from({length:CUBES}, ()=>({ nx:0.5, ny:0.5, active: true, noteIndex: 0 }));
        }

        // Randomize active state and notes for the preview blocks
        randomizeAllImpl(panel, {
            toyId,
            blocks: previewBlocks, // Pass previewBlocks to be modified
            noteList,
            clearPattern: ()=> { /* don't clear live pattern */ },
            baseIndex: (list)=> (list.indexOf(baseNoteName)>=0? list.indexOf(baseNoteName): (list.indexOf('C4')>=0? list.indexOf('C4'):48)),
            pentatonicOffsets: PENTATONIC_OFFSETS
        });

        // Manually randomize note indices for the preview blocks, as randomizeAllImpl only handles active state.
        // This fixes the "super low pitch" bug.
        const baseIx = (noteList.indexOf(baseNoteName)>=0? noteList.indexOf(baseNoteName) : (noteList.indexOf('C4')>=0? noteList.indexOf('C4') : 48));
        for (let i = 0; i < previewBlocks.length; i++) {
            const off = PENTATONIC_OFFSETS[Math.floor(Math.random() * PENTATONIC_OFFSETS.length)];
            previewBlocks[i].noteIndex = baseIx + off;
        }
        // Randomize positions for the preview blocks
        const size = Math.round(BASE*(sizing.scale||1)*boardScale(canvas));
        const bounds = { x: EDGE, y: EDGE, w: Math.max(1, W()-EDGE*2), h: Math.max(1, H()-EDGE*2) };
        const rects = Array.from({length:CUBES}, ()=>({ w: size, h: size }));
        try { randomizeRects(rects, bounds, 6); } catch {}
        for (let i=0;i<CUBES;i++){
          const r = rects[i];
          const cx = r.x + r.w/2, cy = r.y + r.h/2;
          previewBlocks[i].nx = x2n(cx);
          previewBlocks[i].ny = y2n(cy);
        }

        // Randomize generator position into `previewGenerator`
        const blockRectsForPreview = previewBlocks.map(pb => {
            const cx = n2x(pb.nx);
            const cy = n2y(pb.ny);
            return { x: cx - size/2, y: cy - size/2, w: size, h: size };
        });
        const w = W(), h = H();
        const genRadius = generator.r || 12;
        let gx, gy, attempts = 0;
        const MAX_ATTEMPTS = 100;
        do {
          gx = EDGE + genRadius + Math.random() * (w - 2 * (EDGE + genRadius));
          gy = EDGE + genRadius + Math.random() * (h - 2 * (EDGE + genRadius));
          attempts++;
          if (attempts > MAX_ATTEMPTS) { gx = w / 2; gy = h / 2; break; }
        } while (blockRectsForPreview.some(b => circleRectHit(gx, gy, genRadius, b)));
        previewGenerator.nx = x2n(gx);
        previewGenerator.ny = y2n(gy);
        previewGenerator.placed = true;

        // Don't spawn a ripple, don't modify live state.
        return;
    }

    // --- IMMEDIATE LOGIC (existing code) ---
    didLayout = false;
    randomizeAllImpl(panel, {
      toyId,
      blocks, noteList,
      layoutBlocks,
      clearPattern: ()=> { pattern.forEach(s=> s.clear()); patternOffsets.forEach(m=> m.clear()); },
      recordOnly,
      isActive: (b)=> !!b.active,
      setRecording: (v)=>{ recording = !!v; },
      setPlaybackMuted: (v)=>{ playbackMuted = !!v; },
      baseIndex: (list)=> (list.indexOf(baseNoteName)>=0? list.indexOf(baseNoteName): (list.indexOf('C4')>=0? list.indexOf('C4'):48)),
      pentatonicOffsets: PENTATONIC_OFFSETS
    });

    // Find a clear spot for the generator, avoiding the blocks.
    const blockRects = getBlockRects();
    const w = W(), h = H();
    const genRadius = generator.r || 12;

    let gx, gy, attempts = 0;
    const MAX_ATTEMPTS = 100;

    do {
      // Pick a random point within the canvas bounds, respecting EDGE padding
      gx = EDGE + genRadius + Math.random() * (w - 2 * (EDGE + genRadius));
      gy = EDGE + genRadius + Math.random() * (h - 2 * (EDGE + genRadius));
      attempts++;
      if (attempts > MAX_ATTEMPTS) {
        console.warn('[rippler] Could not find a clear spot for the generator.');
        gx = w / 2; gy = h / 2; // Fallback to center
        break;
      }
    } while (blockRects.some(b => circleRectHit(gx, gy, genRadius, b)));

    // Set the generator's new position
    generator.nx = x2n(gx);
    generator.ny = y2n(gy);
    generator.placed = true;

    if (shouldSpawn) {
      const isInactiveFollower = !!panel.dataset.prevToyId && panel.dataset.chainActive !== 'true';
      try {
        const nowAT = ac.currentTime;
        if ((typeof isRunning !== 'function' || isRunning()) && !isInactiveFollower){
          spawnRipple(true); // manual=true to bypass first-interaction guard
          barStartAT = nowAT;
          nextSlotAT = barStartAT + stepSeconds();
          nextSlotIx = 1;
          pattern.forEach(s=> s.clear()); patternOffsets.forEach(m=> m.clear());
          recording = true;
        } else {
          __deferredSpawn = true;
          __armRecordingOnResume = true;
        }
      } catch (e) { try { console.warn('[rippler random rearm]', e); } catch {} }
    }
  }
  function shouldDeferChanges() {
    const isChainedFollower = !!panel.dataset.prevToyId;
    if (!isChainedFollower) {
      return false;
    }
    if (typeof isRunning === 'function' && !isRunning()) {
      return false;
    }
    return panel.dataset.chainActive === 'true';
  }

  function doReset(ev){
    try{ ev?.stopImmediatePropagation?.(); }catch{};
    pattern.forEach(s=> s.clear());
    patternOffsets.forEach(m=> m.clear());
    ripples.length=0;
    generator.placed=false;

    // If this is the head of a chain, reset all downstream toys.
    const isHeadOfChain = !panel.dataset.prevToyId && panel.dataset.nextToyId;
    if (isHeadOfChain) {
      let nextId = panel.dataset.nextToyId;
      let currentPanel = panel;
      while (nextId) {
        const nextPanel = document.getElementById(nextId);
        if (!nextPanel) break;
        nextPanel.dispatchEvent(new CustomEvent('toy-reset', { bubbles: true }));
        currentPanel = nextPanel;
        nextId = currentPanel.dataset.nextToyId;
      }
      // After resetting all followers, make the head active again.
      panel.dispatchEvent(new CustomEvent('chain:set-active', { bubbles: true }));
    }
  }
  panel.addEventListener('toy-random', randomizeAll);
  panel.addEventListener('toy-clear', doReset);
  panel.addEventListener('toy-reset', doReset);

  function doSoftReset() {
    // This is called when a preceding toy in the chain is reset (e.g., a new ball is launched).
    // We should randomize the rippler's state, but not spawn a ripple immediately.
    // The ripple will be spawned when this toy becomes active in the chain.
    randomizeAll({ spawn: false });
  }
  panel.addEventListener('chain:stop', doSoftReset);

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
      // When toggling a block on, it should be re-recorded on the next ripple pass.
      // This ensures it gets added to the pattern correctly.
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
    onBlockGrab: (idx)=>{ liveBlocks.add(idx); try { for (let s=0; s<pattern.length; s++){ pattern[s].delete(idx); try{ patternOffsets[s].delete(idx); }catch{} } } catch {} },
    onBlockDrop: (idx)=>{ liveBlocks.delete(idx); recordOnly.add(idx); },
    // Add new properties for state checking in input handler
    shouldDeferChanges: shouldDeferChanges,
    isActiveInChain: () => panel.dataset.chainActive === 'true',
    isChained: () => !!(panel.dataset.nextToyId || panel.dataset.prevToyId),
    isRunning: isRunning, // pass the function
    setPreviewGenerator: (pos) => {
      if (pos) {
        previewGenerator.nx = x2n(pos.x);
        previewGenerator.ny = y2n(pos.y);
        previewGenerator.placed = true;
      } else {
        previewGenerator.placed = false;
      }
    }
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
      pattern.forEach(s=> s.clear()); patternOffsets.forEach(m=> m.clear());

      // A rippler is "running" if it's standalone or active in a chain, AND the transport is playing.
      const isActiveInChain = panel.dataset.chainActive === 'true';
      const isChained = !!(panel.dataset.nextToyId || panel.dataset.prevToyId);
      const shouldRun = (isActiveInChain || !isChained);
      const transportIsRunning = (typeof isRunning === 'function') ? isRunning() : true;

      const isInactiveFollower = !!panel.dataset.prevToyId && panel.dataset.chainActive !== 'true';
      if (shouldRun && transportIsRunning && !isInactiveFollower) {
          spawnRipple(false);
          barStartAT = ac.currentTime; nextSlotAT = barStartAT + stepSeconds(); nextSlotIx = 1; recording = true;
      } // Otherwise, do nothing. The chain activation logic will spawn the ripple when it becomes active.
    }
  });

  canvas.addEventListener('pointermove', input.pointerMove);

  canvas.addEventListener('pointerup', (e)=>{
    const isInactiveFollower = !!panel.dataset.prevToyId && panel.dataset.chainActive !== 'true';
    const prevDrag = dragMuteActive; dragMuteActive=false;
    input.pointerUp(e);
    const nowAT = ac.currentTime;
    if (prevDrag){
      playbackMuted=false;
      try{ if ((typeof isRunning!=='function' || isRunning()) && !isInactiveFollower) spawnRipple(false); else __deferredSpawn = true; }catch{ spawnRipple(false); }
      if (typeof isRunning!=='function' || isRunning()){
        barStartAT=nowAT; nextSlotAT=barStartAT+stepSeconds(); nextSlotIx=1; pattern.forEach(s=> s.clear()); patternOffsets.forEach(m=> m.clear()); recording=true;
      } else {
        __armRecordingOnResume = true;
      }
    } else {
      const gx=n2x(generator.nx), gy=n2y(generator.ny);
      if (_wasPlacedAtDown && _genDownPos && Math.hypot((_genDownPos.x-gx),(_genDownPos.y-gy))>4){
        try{ if ((typeof isRunning!=='function' || isRunning()) && !isInactiveFollower) spawnRipple(false); else __deferredSpawn = true; }catch{ spawnRipple(false); }
        if (typeof isRunning!=='function' || isRunning()){
          barStartAT=nowAT; nextSlotAT=barStartAT+stepSeconds(); nextSlotIx=1; pattern.forEach(s=> s.clear()); patternOffsets.forEach(m=> m.clear()); recording=true;
        } else {
          __armRecordingOnResume = true;
        }
      }
    }
    _genDownPos=null; _wasPlacedAtDown=false;
  });

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
        rMain.hit.add(i);
        const ang = Math.atan2(cy - gy, cx - gx), push = 64 * (sizing.scale || 1); b.vx += Math.cos(ang)*push; b.vy += Math.sin(ang)*push;
        const whenAT = ac.currentTime, slotLen = stepSeconds();
        // Assign hits to the slot whose base time is <= hit < base+slotLen
        let k = Math.floor(((whenAT - barStartAT) + 1e-6) / slotLen);
        if (k < 0) k = 0;
        const slotIx = k % NUM_STEPS; const name = noteList[b.noteIndex] || 'C4';
        
        // During playback (not recording), the scheduler handles audio.
        // The live hit should be silent.
        if (!recording && !liveBlocks.has(i)) {
            panel.__pulseHighlight = 1.0;
            panel.__pulseRearm = true;
            continue; // Let the scheduler handle it.
        }
        // Quant setting now
        let __divNow = NaN; try{ const v0 = (__getQuantDiv && __getQuantDiv()); if (Number.isFinite(v0)) __divNow = v0; }catch{}
        if (!Number.isFinite(__divNow)){
          const ds = parseFloat(panel.dataset.quantDiv || panel.dataset.quant || '');
          if (Number.isFinite(ds)) __divNow = ds;
        }
        const doImmediateFlash = (!Number.isFinite(__divNow) || __divNow <= 0 || liveBlocks.has(i));
        if (doImmediateFlash){ b.pulse = 1; b.cflash = 1; if (!liveBlocks.has(i)) { b.flashEnd = Math.max(b.flashEnd, ac.currentTime + 0.18); } }
        if (liveBlocks.has(i)) {
          try {
            panel.__pulseHighlight = 1.0;
            panel.__pulseRearm = true;
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
            let tSched = whenAT + 0.0005; // Default to immediate if no quantization
            panel.__pulseHighlight = 1.0;
            panel.__pulseRearm = true;
            // Schedule recording preview at quantized beat/div to match bouncer behavior
            const li3 = getLoopInfo();
            // Prefer getter, then live <select>, then dataset
            let div3 = NaN; try{ const v0 = (__getQuantDiv && __getQuantDiv()); if (Number.isFinite(v0)) div3 = v0; }catch{}
            try{ if (!Number.isFinite(div3)){ const sel=panel.querySelector('.bouncer-quant-ctrl select'); if (sel){ const v=parseFloat(sel.value); if (Number.isFinite(v)) div3=v; } } }catch{}
            if (!Number.isFinite(div3)){ const ds = parseFloat(panel.dataset.quantDiv || panel.dataset.quant || ''); if (Number.isFinite(ds)) div3 = ds; }

            if (Number.isFinite(div3) && div3 > 0 && li3 && li3.beatLen > 0) {
              const beatLen3 = li3?.beatLen || (audioBarSeconds()/4);
              const grid3 = beatLen3 / div3;
              // Align to next grid after actual hit time
              const rel3 = li3 ? Math.max(0, whenAT - li3.loopStartTime) : 0;
              const k3 = Math.ceil((rel3 + 1e-6) / grid3);
              tSched = (li3?.loopStartTime || whenAT) + k3 * grid3 + 0.0004;
            }
            if (!doImmediateFlash){ try{ b._visFlashAt = tSched; }catch{} }
            triggerInstrument(currentInstrument, name, tSched);
            // Store the RAW offset of the hit relative to the local bar start,
            // but clamp it to the bar's duration to prevent runaway timing issues.
            patternOffsets[slotIx].set(i, Math.min(barSec() - 0.001, Math.max(0, whenAT - barStartAT)));
          } catch(e) { __dbg('quant-record-fail', e); }
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
      // A toy is "playing" if it has active ripples, or if it's an empty
      // toy in a chain running its "ghost" timer (lifeline).
      const isPlaying = (ripples.length > 0 && generator.placed) || !!__schedState.ghostSpawnTime;
      panel.classList.toggle('toy-playing', isPlaying);
      try { panel.dataset.ripplerIsPlaying = String(isPlaying); } catch(e){}

      // Handle the highlight pulse animation on note hits.
      if (panel.__pulseRearm) {
        panel.classList.remove('toy-playing-pulse');
        try { panel.offsetWidth; } catch {}
        panel.__pulseRearm = false;
      }

      if (panel.__pulseHighlight && panel.__pulseHighlight > 0) {
        panel.classList.add('toy-playing-pulse');
        panel.__pulseHighlight = Math.max(0, panel.__pulseHighlight - 0.05); // Decay over ~20 frames
      } else if (panel.classList.contains('toy-playing-pulse')) {
        panel.classList.remove('toy-playing-pulse');
      }
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
        const tViewWaves = (typeof isRunning==='function' && !isRunning()) ? __pausedNow : ac.currentTime;
        drawWaves(ctx, n2x(generator.nx), n2y(generator.ny), tViewWaves, RING_SPEED(), ripples, NUM_STEPS, stepSeconds, (sizing.scale||1));
        ctx.restore();
      }

      const tView = (typeof isRunning==='function' && !isRunning()) ? __pausedNow : ac.currentTime;
      drawParticles(ctx, tView, ripples, { x:n2x(generator.nx), y:n2y(generator.ny) }, blockRects);

      const __nowAT = ac.currentTime; const __dt = (__lastDrawAT ? (__nowAT-__lastDrawAT) : 0); __lastDrawAT = __nowAT;
      for (let i=0;i<blocks.length;i++){
        const b=blocks[i];
        if (b.rippleAge != null && b.rippleMax){ b.rippleAge = Math.min(b.rippleMax, Math.max(0, b.rippleAge + __dt)); }
        // Deferred visual pulse aligned to scheduled audio (when quantizing)
        try{
          if (typeof b._visFlashAt === 'number' && ac.currentTime >= b._visFlashAt - 1e-4){
            b._visFlashAt = undefined; b.pulse = 1; b.cflash = 1; b.flashEnd = Math.max(b.flashEnd||0, ac.currentTime + 0.18);
          }
        }catch{}
      }

      // Draw blocks at their own positions; no global offset
      drawBlocksSection(ctx, blockRects, 0, 0, null, 1, noteList, sizing, null, null, ac.currentTime);

      // Draw preview blocks if they exist
      if (hasPreviewState && previewBlocks.length > 0) {
          const previewBlockRects = previewBlocks.map(pb => {
              const __spanW = Math.max(1, Math.abs(n2x(1) - n2x(0)));
              const __rectScale = __spanW / __baseSpanW;
              const size = Math.max(20, Math.round(BASE * (sizing.scale||1) * __rectScale));
              const cx = n2x(pb.nx);
              const cy = n2y(pb.ny);
              return { x: cx - size/2, y: cy - size/2, w: size, h: size, active: pb.active };
          });

          ctx.save();
          ctx.globalAlpha = 0.45; // Bouncer's alpha
          ctx.setLineDash([6, 4]); // Bouncer's line dash
          for (const rect of previewBlockRects) {
              drawBlock(ctx, rect, {
                variant: 'button',
                active: rect.active,
                flash: 0,
                noteLabel: isZoomed() ? (noteList[rect.noteIndex] || '') : null,
                showArrows: isZoomed(),
              });
          }
          ctx.restore();
      }

      if (generator.placed){
        drawGenerator(ctx, n2x(generator.nx), n2y(generator.ny), Math.max(8, Math.round(generator.r*(sizing.scale||1))), tView, ripples, NUM_STEPS, stepSeconds, (sizing.scale||1));
      }

      // Draw preview generator
      if (previewGenerator.placed) {
        const pgy = n2y(previewGenerator.ny);
        const pgx = n2x(previewGenerator.nx);
        const r = Math.max(8, Math.round(generator.r * (sizing.scale || 1)));
        ctx.save();
        ctx.setLineDash([6, 4]); // Bouncer's line dash
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; // Bouncer's color
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pgx, pgy, r, 0, Math.PI * 2);
        ctx.stroke();
        // Add directional line
        const angle = Math.random() * Math.PI * 2; // Random direction for preview
        const indicatorLength = 20; // Bouncer's indicator length
        ctx.beginPath();
        ctx.moveTo(pgx, pgy);
        ctx.lineTo(pgx + Math.cos(angle) * indicatorLength, pgy + Math.sin(angle) * indicatorLength);
        ctx.stroke();
        ctx.restore();
      }

      // --- Life Line Bar for Chained Ghost Ripples ---
      const running = (typeof isRunning === 'function') ? isRunning() : true;
      let ghostProgress = 0;
      if (__schedState.ghostEndTime && __schedState.ghostSpawnTime) {
          const lifeDuration = __schedState.ghostEndTime - __schedState.ghostSpawnTime;
          if (lifeDuration > 0) {
              const now = ac.currentTime;
              const lifeElapsed = now - __schedState.ghostSpawnTime;
              ghostProgress = Math.max(0, Math.min(1, lifeElapsed / lifeDuration));
          }
      }

      // When paused, use the last known progress to freeze the bar.
      if (running) {
          __schedState.lastGhostProgress = ghostProgress;
      } else {
          ghostProgress = __schedState.lastGhostProgress || 0;
      }

      if (ghostProgress > 0) {
          const barY = EDGE + 4;
          const barStartX = EDGE;
          const fullBarWidth = W() - (EDGE * 2);
          const currentBarWidth = fullBarWidth * ghostProgress;

          ctx.beginPath();
          ctx.moveTo(barStartX, barY);
          ctx.lineTo(barStartX + currentBarWidth, barY);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
      }

      // Only advance physics/scheduling while transport is running
      if (typeof isRunning !== 'function' || isRunning()){
      const isActiveInChain = panel.dataset.chainActive === 'true';
      const isChained = !!(panel.dataset.nextToyId || panel.dataset.prevToyId);
      // Detect transport state change and realign timing
      try{
        // --- Chain Activation Logic ---
        if (isActiveInChain && !__schedState.wasActiveInChain) {
            // Restore volume when this toy's turn starts.
            const gainNode = getToyGain(toyId);
            const userVolume = getToyVolume(toyId);
            gainNode.gain.cancelScheduledValues(ac.currentTime);
            gainNode.gain.setTargetAtTime(userVolume, ac.currentTime, 0.015);

            __schedState.turnOver = false; // Reset the flag when our turn starts
            // This toy just became active in the chain.
            if (generator.placed) {
                // Spawn a ripple and reset the scheduler to start recording a new pattern.
                // This handles both initial activation and re-activation in a loop.
                spawnRipple(true); // manual=true to bypass first-interaction guard
                const nowAT = ac.currentTime;
                barStartAT = nowAT;
                nextSlotAT = barStartAT + stepSeconds();
                nextSlotIx = 1;
                pattern.forEach(s=> s.clear()); patternOffsets.forEach(m=> m.clear());
                recording = true;
                __deferredSpawn = false; // Consume any deferred spawn from other actions
            } else {
                // No generator, start a "ghost" timer to advance the chain, but
                // only for toys that are followers in a chain. A standalone toy
                // or the head of a chain should wait for user interaction.
                const isChainedFollower = !!panel.dataset.prevToyId;
                if (isChainedFollower) {
                    const nowAT = ac.currentTime;
                    const lifeTime = Math.hypot(W(), H()) / RING_SPEED(); // Default lifetime based on diagonal
                    __schedState.chainAdvanceAt = nowAT + lifeTime;
                    __schedState.ghostSpawnTime = nowAT;
                    __schedState.ghostEndTime = nowAT + lifeTime;
                }
            }
        }
        __schedState.wasActiveInChain = isActiveInChain;

        if (__schedState.chainAdvanceAt > 0 && ac.currentTime >= __schedState.chainAdvanceAt) {
            // Only advance if this toy is the currently active one.
            if (isChained && isActiveInChain) {
                // A toy's turn is over. If it has a pending preview state, apply it now
                // so it's ready for the next time it becomes active.
                if (hasPreviewState || previewGenerator.placed) {
                    applyPreviewState();
                }
                panel.dispatchEvent(new CustomEvent('chain:next', { bubbles: true }));
                __schedState.turnOver = true; // Immediately stop this toy's scheduler
                ripples.length = 0; // Clear active ripples to remove highlight

                // Fade out gain to cancel any remaining scheduled notes for this turn.
                const gainNode = getToyGain(toyId);
                gainNode.gain.cancelScheduledValues(ac.currentTime);
                gainNode.gain.setTargetAtTime(0, ac.currentTime, 0.02); // fast fade out
            }
            __schedState.chainAdvanceAt = 0; // Consume the timer to prevent re-firing.
        }

        // Clear the ghost timer when it's done (only when running)
        if (running && __schedState.ghostEndTime && ac.currentTime >= __schedState.ghostEndTime) {
            __schedState.ghostSpawnTime = null;
            __schedState.ghostEndTime = null;
            __schedState.lastGhostProgress = 0;
        }

        if (__lastRunning === null) __lastRunning = running;
        if (__lastRunning !== running || __forceResume){
          __lastRunning = running;
          __forceResume = false;
          if (running){
          // Preserve local bar phase across pause: set anchor so we resume at same offset
          try{
            const li = getLoopInfo();
            const nowAT = ac.currentTime;
            const rel = Math.max(0, (__relAtPause||0));
            barStartAT = Math.max(0, (li ? li.now : nowAT) - rel);
            nextSlotAT = barStartAT + stepSeconds();
            nextSlotIx = 1;
            __relAtPause = 0;
          }catch{}
          try{ playbackMuted = false; dragMuteActive = false; }catch{}
          // Only clear ripples if we're about to spawn a new one; otherwise
          // preserve visuals so resume looks seamless.
          // Only spawn on resume if we explicitly deferred a spawn while paused (e.g., Random while paused)
          let willSpawn = !!__deferredSpawn;
          if (willSpawn){ try{ ripples.length = 0; }catch{} }
          if (__armRecordingOnResume){ pattern.forEach(s=> s.clear()); patternOffsets.forEach(m=> m.clear()); recording=true; __armRecordingOnResume = false; }
          if (__deferredSpawn){ __deferredSpawn = false; spawnRipple(true); }
          }
        }
      }catch(e){ console.warn('[rippler draw] chain/resume logic failed', e); }

      // A rippler is considered "running" if it's the active toy in a chain,
      // OR if it's a standalone toy (not part of any chain).
      // FIX: Also keep running if a ripple is still active, to prevent stuck highlights.
      const hasActiveRipples = ripples.length > 0;
      // FIX: Add turnOver flag to immediately stop scheduler when turn ends.
      const shouldRun = !__schedState.turnOver && (isActiveInChain || !isChained || hasActiveRipples) && isRunning();

      // Only advance physics/scheduling if this toy is supposed to be running.
      if (shouldRun) {
          springBlocks(1/60);
          handleRingHits(ac.currentTime);
          scheduler.tick();
        }
      
      }

      if (input && input.state && input.state.generatorDragEnded){
        input.state.generatorDragEnded=false;
        const nowAT = ac.currentTime; spawnRipple(true);
        barStartAT=nowAT; nextSlotAT=barStartAT+stepSeconds(); nextSlotIx=1; pattern.forEach(s=> s.clear()); patternOffsets.forEach(m=> m.clear()); recording=true;
      }
    } catch (err) { console.error('[rippler draw]', err); } finally { requestAnimationFrame(draw); }
  }

  function reset(){
    ripples.length=0;
    for (const b of blocks){ b.vx=b.vy=0; b.nx=b.nx0; b.ny=b.ny0; b.flashEnd=0; }
    pattern.forEach(s=> s.clear()); patternOffsets.forEach(m=> m.clear());
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
      pattern.forEach(s=> s.clear()); patternOffsets.forEach(m=> m.clear());
      recording = true;
      // Seed a ripple only if running; otherwise defer
      if (typeof isRunning !== 'function' || isRunning()){
        try { if (Array.isArray(ripples)) ripples.length = 0; spawnRipple(true); } catch {}
      } else {
        __deferredSpawn = true;
        __armRecordingOnResume = true;
      }
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
      pattern.forEach(s=> s.clear()); patternOffsets.forEach(m=> m.clear());
      recording = true;
      if (typeof isRunning !== 'function' || isRunning()){
        try { if (Array.isArray(ripples)) ripples.length = 0; spawnRipple(true); } catch {}
      } else {
        __deferredSpawn = true;
        __armRecordingOnResume = true;
      }
    } catch(e) { try { console.warn('[rippler random-blocks]', e); } catch {} }
  }

  panel.addEventListener('toy-random-notes', randomizeNotesAndActives);
  panel.addEventListener('toy-random-blocks', randomizeBlockPositions);

  // --- Persistence hooks ---
  try{
    panel.__getRipplerSnapshot = () => {
      try{
        const quantDiv = (__getQuantDiv && Number.isFinite(__getQuantDiv())) ? __getQuantDiv() : (parseFloat(panel.dataset.quantDiv||panel.dataset.quant||'')||undefined);
        const blocksSnap = Array.isArray(blocks) ? blocks.map(b=> b ? ({ nx: Number(b.nx||0), ny: Number(b.ny||0), active: !!b.active, noteIndex: (b.noteIndex|0) }) : null) : [];
        const gen = { nx: Number(generator.nx||0.5), ny: Number(generator.ny||0.5), placed: !!generator.placed };
        // Ripple visual position (seconds into current ring or local bar)
        let rippleRelSec = 0;
        try{
          const nowAT = ac.currentTime;
          if (Array.isArray(ripples) && ripples.length){
            const r = ripples[ripples.length-1];
            rippleRelSec = Math.max(0, nowAT - (r.startAT||nowAT));
          } else {
            rippleRelSec = Math.max(0, (nowAT - barStartAT) % Math.max(0.0001, barSec()));
          }
        }catch{}
        const steps = Array.isArray(pattern) ? pattern.map((set, sIx)=>{
          try{
            const lst = [];
            set?.forEach?.((idx)=>{
              const off = patternOffsets?.[sIx]?.get?.(idx);
              lst.push({ idx, off: (typeof off==='number'?off:undefined) });
            });
            return lst;
          }catch{ return []; }
        }) : [];
        return { instrument: currentInstrument, quantDiv, blocks: blocksSnap, generator: gen, steps, rippleRelSec };
      }catch(e){ return { instrument: currentInstrument }; }
    };
    panel.__applyRipplerSnapshot = (st={}) => {
      try{
        if (st.instrument){ try{ ui.setInstrument(st.instrument); }catch{} try{ panel.dataset.instrument = st.instrument; }catch{} }
        if (typeof st.quantDiv !== 'undefined'){
          try{ panel.dataset.quantDiv = String(st.quantDiv); const sel = panel.querySelector('.bouncer-quant-ctrl select'); if (sel){ sel.value = String(st.quantDiv); sel.dispatchEvent(new Event('change', { bubbles:true })); } }catch{}
        }
        if (st.generator && typeof st.generator==='object'){
          try{ generator.nx = Math.max(0, Math.min(1, Number(st.generator.nx))); generator.ny = Math.max(0, Math.min(1, Number(st.generator.ny))); generator.placed = !!st.generator.placed; }catch{}
        }
        if (Array.isArray(st.blocks) && Array.isArray(blocks)){
          for (let i=0;i<Math.min(blocks.length, st.blocks.length); i++){
            const src = st.blocks[i]; const dst = blocks[i]; if (!src || !dst) continue;
            dst.nx = Math.max(0, Math.min(1, Number(src.nx||dst.nx)));
            dst.ny = Math.max(0, Math.min(1, Number(src.ny||dst.ny)));
            dst.active = !!src.active;
            if (typeof src.noteIndex === 'number') dst.noteIndex = (src.noteIndex|0);
            dst.vx = 0; dst.vy = 0; dst.nx0 = dst.nx; dst.ny0 = dst.ny;
          }
        }
        if (Array.isArray(st.steps) && Array.isArray(pattern)){
          try{ pattern.forEach(s=> s.clear()); patternOffsets.forEach(m=> m.clear()); }catch{}
          for (let s=0; s<Math.min(pattern.length, st.steps.length); s++){
            const lst = st.steps[s]||[];
            for (const ev of lst){
              try{
                const idx = (ev?.idx|0);
                pattern[s].add(idx);
                if (typeof ev?.off === 'number'){ patternOffsets[s].set(idx, ev.off); }
              }catch{}
            }
          }
        }
        // Align loop timing: if snapshot has a local ripple phase, anchor to it;
        // otherwise align to the current global bar start.
        try{
          const li = getLoopInfo();
          const relSnapRaw = (st && Object.prototype.hasOwnProperty.call(st, 'rippleRelSec')) ? Number(st.rippleRelSec) : NaN;
          if (Number.isFinite(relSnapRaw) && relSnapRaw >= 0){
            const relSnap = Math.max(0, relSnapRaw);
            const now2 = ac.currentTime;
            const refNow = li ? li.now : now2;
            barStartAT = Math.max(0, refNow - relSnap);
            nextSlotAT = barStartAT + stepSeconds();
            nextSlotIx = 1;
            // Seed resume anchor so first Play after reload preserves local phase
            try{ __relAtPause = relSnap; if (localStorage.getItem('mt_rippler_dbg')==='1') console.log('[rippler restore anchor]', { relSnap, barStartAT }); }catch{}
          } else if (li){
            barStartAT = li.loopStartTime;
            nextSlotAT = barStartAT + stepSeconds();
            nextSlotIx = 1;
          }
          // If paused, defer visuals until resume; else seed a single ripple
          try{
            if (generator.placed){
              if (typeof isRunning==='function' && !isRunning()){
                try{ panel.__ripplerDeferredSpawn = true; }catch{}
              } else {
                if (Array.isArray(ripples)) ripples.length = 0;
                spawnRipple(true);
              }
            }
          }catch{}
        }catch{}
        // Restore ripple visual phase
        try{
          if (generator.placed){
            const rel = Math.max(0, Number(st.rippleRelSec||0));
            const nowAT = ac.currentTime;
            const startAT = (ac.state === 'suspended') ? -rel : (nowAT - rel);
            const gx = n2x(generator.nx), gy = n2y(generator.ny);
            const corners = [[0,0],[W(),0],[0,H()],[W(),H()]];
            const offR = Math.max(...corners.map(([x,y])=> Math.hypot(x-gx, y-gy))) + 64;
            if (!Array.isArray(ripples)) ripples = [];
            ripples.length = 0;
            ripples.push({ x: gx, y: gy, startAT, startTime: startAT, speed: RING_SPEED(), offR, hit: new Set(), r2off: (RING_SPEED() * (barSec()/2)) });
          }
        }catch{}
      }catch(e){ try{ console.warn('[rippler] apply snapshot failed', e); }catch{} }
    };
  }catch{}

  // Pick up any deferred spawn request from snapshot apply during pause
  try{ if (panel.__ripplerDeferredSpawn){ __deferredSpawn = true; panel.__ripplerDeferredSpawn = false; } }catch{}

  // Apply pending snapshot if early restore stashed it
  try{ if (panel.__pendingRipplerState && typeof panel.__applyRipplerSnapshot==='function'){ panel.__applyRipplerSnapshot(panel.__pendingRipplerState||{}); delete panel.__pendingRipplerState; } }catch{}

  // Transport event listeners for deterministic resume/pause handling
  try{
    document.addEventListener('transport:resume', ()=>{ try{ __forceResume = true; if (localStorage.getItem('mt_rippler_dbg')==='1') console.log('[rippler] transport:resume'); }catch{} });
    document.addEventListener('transport:pause',  ()=>{
      try{
        const nowAT = ac.currentTime;
        // How far into our local bar are we? Keep this to preserve phase on resume
        __relAtPause = Math.max(0, (nowAT - barStartAT) % Math.max(0.0001, barSec()));
        __pausedNow = nowAT;
        if (localStorage.getItem('mt_rippler_dbg')==='1') console.log('[rippler] transport:pause',{ relAtPause: __relAtPause.toFixed?.(3)||__relAtPause });
      }catch{}
    });
  }catch{}

  requestAnimationFrame(draw);

  // The main scheduler's step is only for grid-based toys.
  // This toy manages its own lifecycle via its draw loop, but we need to
  // provide a dummy step function to be included in the scheduler's update loop,
  // which is responsible for setting the `data-chain-active` attribute.
  panel.__sequencerStep = () => {};

  return { setInstrument: (name)=> { currentInstrument = name || currentInstrument; try{ ui.setInstrument(name); }catch{} }, reset, element: canvas };
}
