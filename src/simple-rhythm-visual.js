import { panelTransportBindings } from './panel-transport.js';
// src/simple-rhythm-visual.js
// Renders and handles interaction for the 8-step sequencer cubes.
import { drawBlock, whichThirdRect } from './toyhelpers.js';
import { boardScale } from './board-scale-helpers.js';
import { midiToName } from './note-helpers.js';
import { isRunning, getLoopInfo, getTransportState } from './audio-core.js';
import { getPlaybackInstance } from './playback-instances.js';
import { resolveSimpleRhythmPlayheadColumn } from './simple-rhythm-timing.js';
import { createGenericParticleField, getParticleBudget, getAdaptiveFrameBudget } from './baseMusicToy/index.js';
import {
  waitForStableBox,
  createToyCanvasRig,
  createToyRelayoutController,
  createGlobalPanelScheduler,
  createToyDirtyFlags,
} from './baseMusicToy/index.js';
import { createToySurfaceManager } from './toy-surface-manager.js';
import {
  SIMPLE_RHYTHM_PARTICLE_BOUNDS,
  SIMPLE_RHYTHM_PARTICLE_LOGICAL_HEIGHT,
  SIMPLE_RHYTHM_PARTICLE_LOGICAL_WIDTH,
  createSimpleRhythmParticleViewportSpace,
} from './simple-rhythm-particle-viewport-space.js';
import {
  SIMPLE_RHYTHM_GRID_GEOMETRY,
  createSimpleRhythmGridViewportSpace,
  getSimpleRhythmCubeRect,
  hitSimpleRhythmCube,
  simpleRhythmGridClientToLogical,
} from './simple-rhythm-grid-viewport-space.js';
import { getLoopgridTierParams } from './loopgrid/loopgrid-quality.js';
import { overviewMode } from './overview-mode.js';
import { requestPanelPulse } from './pulse-border.js';
import { queueClassToggle, markPanelForDomCommit } from './dom-commit.js';

function isPanelTransportRunning(panel) {
  const {isRunning} = panelTransportBindings(panel);
  const mainTransport = (typeof isRunning === 'function') && isRunning();
  if (mainTransport) return true;
  try {
    return panel?.dataset?.beatSwarmSubboard === '1' && !!window.BeatSwarmMode?.isSubBoardPlaying?.();
  } catch {
    return false;
  }
}

// --- sizing helpers ---------------------------------------------------------
function raf() {
  return new Promise(r => requestAnimationFrame(r));
}

// LoopGrid quality tiers live in src/loopgrid/loopgrid-quality.js

function getBurstSprite(st, radiusPx, color) {
  if (!st || !Number.isFinite(radiusPx) || radiusPx <= 0) return null;
  const key = `${Math.round(radiusPx * 10) / 10}|${color || ''}`;
  const cache = st._burstSpriteCache || (st._burstSpriteCache = new Map());
  const cached = cache.get(key);
  if (cached) return cached;

  const r = Math.max(1, Math.ceil(radiusPx));
  const size = r * 2 + 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = color || 'rgba(255, 180, 220, 0.9)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const sprite = { canvas, size, half: size / 2 };
  cache.set(key, sprite);
  return sprite;
}

function getPlayheadSprite(st, blockSizePx, borderSize, color) {
  if (!st || !Number.isFinite(blockSizePx) || blockSizePx <= 0) return null;
  const key = `${blockSizePx}|${borderSize}|${color || ''}`;
  const cache = st._playheadSpriteCache || (st._playheadSpriteCache = new Map());
  const cached = cache.get(key);
  if (cached) return cached;

  const size = Math.max(1, blockSizePx + borderSize * 2);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = color || 'rgba(255, 255, 255, 0.4)';
    ctx.fillRect(0, 0, size, size);
  }
  const sprite = { canvas, size };
  cache.set(key, sprite);
  return sprite;
}

const NUM_CUBES = 8;
const NUM_CUBES_GLOBAL = NUM_CUBES;

const TAP_LETTER_PHYS = Object.freeze({
  k: 0.02,
  damping: 0.82,
  impulse: 0.05,
  max: 42,
  epsilon: 0.02,
});
const TAP_LETTER_VIS = Object.freeze({
  flashUpMs: 0,
  flashDownMs: 260,
  flashBoost: 1.75,
  flashColor: 'rgba(51, 97, 234, 1)',
  opacityBase: 0.35,
  opacityBoost: 0.9,
  ghostCoreHitMul: 0.55,
  flashShadow: '',
});
const TAP_LABEL_OPACITY_BASE = 1;
const CHAIN_NOTES_CACHE_MS = 200;
const chainNotesCache = new Map();

// Debug toggle (off by default)
const __LG_DEBUG_DIRTY = () => {
  try { return !!window.__LG_DEBUG_DIRTY; } catch { return false; }
};
const __lgDbg = (label, data) => {
  if (!__LG_DEBUG_DIRTY()) return;
  try { console.log(`[LG][DIRTY] ${label}`, data || ''); } catch {}
};

// Simple Rhythm cubes: size purely from the local canvas, not boardScale.
// This keeps them stable across zoom levels and lets the global board zoom
// handle visual scaling (just like Bouncer).

// --- Global render scheduler (single RAF for all loopgrids) -----------------
// Implementation lives in baseMusicToy; LoopGrid supplies the per-panel logic.
const __LG = createGlobalPanelScheduler({
  globalKey: '__LOOPGRID_RENDER_SCHED',
  globalStateKey: '__LOOPGRID_GLOBAL',
  onPanel: (panel, frameCtx) => {
    try {
      if (window.__PERF_DISABLE_LOOPGRID_RENDER) return false;

      const st = panel.__simpleRhythmVisualState;
      const visible = !!(st && isPanelVisible(panel, st));
      // DEBUG: show scheduler activity + visibility quickly
      if (__LG_DEBUG_DIRTY()) {
        try {
          panel.__lgDbgLastFrame = frameCtx.frame | 0;
          panel.__lgDbgVisible = !!visible;
        } catch {}
      }
      const dirty = panel.__lgDirty;

      // IMPORTANT: transport-driven redraw must be requested BEFORE consume(),
      // so the current frame's dirtySnap.redraw is true and render() gets a
      // "forceNudge" consistently while playing.
      const transportRunning = (typeof isRunning === 'function') && isRunning();
      if (transportRunning && dirty && typeof dirty.requestRedraw === 'function') {
        try { dirty.requestRedraw('loopgrid:transport'); } catch {}
        if (__LG_DEBUG_DIRTY()) __lgDbg('sched.request(transport)', { frame: frameCtx.frame | 0, visible: !!visible });
      }

      const dirtySnap = (dirty && typeof dirty.consume === 'function')
        ? dirty.consume()
        : { redraw: false };
      if (__LG_DEBUG_DIRTY()) {
        try {
          // Note: dirtySnap is the PRE-consume snapshot.
          panel.__lgDbgLastConsume = {
            frame: frameCtx.frame | 0,
            visible: !!visible,
            redraw: !!dirtySnap.redraw,
            layout: !!dirtySnap.layout,
            static: !!dirtySnap.static,
            overlay: !!dirtySnap.overlay,
            composite: !!dirtySnap.composite,
            reason: dirtySnap.reason || null,
            pulse: (panel.__pulseHighlight || 0),
          };
        } catch {}
      }

      // --- Toy performance contract (scene-level gating) ------------
      // Loopgrid already uses a shared scheduler; we only need to
      // adjust cadence / early-out.
      const __arb = (typeof window !== 'undefined') ? window.__ToyUpdateArbiter : null;
      const __dec = (__arb && typeof __arb.getDecision === 'function')
        ? __arb.getDecision(panel, 'loopgrid')
        : null;
      if (__dec && Number.isFinite(__dec.frameModulo) && (__dec.frameModulo | 0) > 1) {
        panel.__loopgridFrameModulo = __dec.frameModulo | 0;
      } else {
        panel.__loopgridFrameModulo = 1;
      }
      if (__dec && __dec.mode === 'frozen' && !__dec.focused && !visible) {
        // Frozen + offscreen: only render if there's explicit pending work.
        if (!dirtySnap.redraw && !(panel.__pulseHighlight > 0)) return visible;
      }

      if (!visible && !dirtySnap.redraw && !(panel.__pulseHighlight > 0)) {
        if (__LG_DEBUG_DIRTY()) __lgDbg('skip(offscreen, clean)', { frame: frameCtx.frame | 0, pulse: panel.__pulseHighlight || 0 });
        return visible;
      }

      const mod = panel.__loopgridFrameModulo | 0;
      if (mod > 1 && (frameCtx.frame % mod) !== 0) return visible;

      render(panel, {
        // IMPORTANT: if the dirty system says "redraw", treat it as a force-nudge
        // for THIS frame, otherwise render() can early-out and appear frozen.
        forceNudge: !!dirtySnap.redraw,
        isGesture: !!frameCtx.isGesture,
        chainNotesCache: frameCtx.chainNotesCache || null,
        visible,
        dirty: dirtySnap,
        __frame: frameCtx.frame | 0,
      });

      return visible;
    } catch (e) {
      if (__LG_DEBUG_DIRTY()) {
        try { console.warn('[LG][DIRTY] onPanel exception', e); } catch {}
      }
      return false;
    }
  },
});

function ensureTapLetters(label) {
  if (!label) return [];
  let spans = Array.from(label.querySelectorAll('.loopgrid-tap-letter-char'));
  if (spans.length !== 3) {
    label.textContent = '';
    for (const ch of 'TAP') {
      const span = document.createElement('span');
      span.className = 'loopgrid-tap-letter-char';
      span.textContent = ch;
      span.style.display = 'inline-block';
      span.style.willChange = 'transform';
      span.style.transform = 'translate3d(0,0,0)';
      span.style.opacity = `${TAP_LETTER_VIS.opacityBase}`;
      span.style.filter = 'none';
      label.appendChild(span);
    }
    spans = Array.from(label.querySelectorAll('.loopgrid-tap-letter-char'));
  }
  return spans;
}

function sizeTapLabel(tapLabel, panel, fieldRect, fallbackRect) {
  if (!tapLabel) return;
  const rect = fieldRect || fallbackRect;
  if (!rect || !(rect.width > 0)) return;
  const s = Math.max(0.001, Number(boardScale(panel)) || 1);
  const rawH = (rect.height || rect.width) / s;
  const rawW = (rect.width) / s;
  const heightBased = rawH / 3.0;
  const widthBased = rawW / 2.4;
  const labelSize = Math.max(24, Math.min(heightBased, widthBased) * 2.5);
  tapLabel.style.fontSize = `${Math.round(labelSize)}px`;
}

function scheduleTapLabelSize(tapLabel, panel, targetEl) {
  if (!tapLabel || !targetEl) return;
  (async () => {
    try {
      const stable = await waitForStableBox(targetEl, { maxFrames: 10 });
      if (!tapLabel.isConnected) return;
      sizeTapLabel(tapLabel, panel, { width: stable.width, height: stable.height }, null);
    } catch {}
  })();
}

function triggerTapLettersForColumn(state, columnIndex, centerNorm, cubeCenterX, cubeCenterY) {
  const bounds = state.tapLetterBounds;
  const lastLoop = state.tapLetterLastLoop;
  const velX = state.tapLetterVelocityX;
  const velY = state.tapLetterVelocityY;
  const hitTs = state.tapLetterHitTs;
  const loopIndex = typeof state.tapLoopIndex === 'number' ? state.tapLoopIndex : 0;
  if (!Array.isArray(bounds) || !Array.isArray(lastLoop)) return;
  for (let i = 0; i < bounds.length; i++) {
    const bound = bounds[i];
    if (!bound) continue;
    if (centerNorm < bound.start || centerNorm > bound.end) continue;
    if (lastLoop[i] === loopIndex) continue;
    lastLoop[i] = loopIndex;
    if (Array.isArray(hitTs)) {
      hitTs[i] = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
    }
    state.tapPromptAnimating = true;
    if (Array.isArray(velX) && Array.isArray(velY)) {
      const centerX = bound.centerX ?? cubeCenterX;
      const centerY = bound.centerY ?? cubeCenterY;
      const dx = centerX - cubeCenterX;
      const dy = centerY - cubeCenterY;
      const impulseScale = 0.08;
      velX[i] = (velX[i] || 0) + dx * impulseScale;
      velY[i] = (velY[i] || 0) + dy * impulseScale * 0.6;
    }
  }
}

function findChainHead(toy) {
    if (!toy) return null;
    let current = toy;
    let sanity = 100;
    while (current && current.dataset.prevToyId && sanity-- > 0) {
        const prev = document.getElementById(current.dataset.prevToyId);
        if (!prev || prev === current) break;
        current = prev;
    }
    return current;
}

function markChainNotesDirty(panel) {
  const head = findChainHead(panel);
  if (!head) return;
  const key = head.dataset?.toyid || head.id || head;
  const cached = chainNotesCache.get(key);
  if (cached) {
    cached.dirty = true;
  } else {
    chainNotesCache.set(key, { value: false, ts: 0, dirty: true });
  }
}

function readChainNotesCached(head) {
  if (!head) return false;
  const key = head.dataset?.toyid || head.id || head;
  const now = (typeof performance !== 'undefined' && performance.now)
    ? performance.now()
    : Date.now();
  const cached = chainNotesCache.get(key);
  if (cached && !cached.dirty && (now - cached.ts) < CHAIN_NOTES_CACHE_MS) {
    return cached.value;
  }
  const value = chainHasSequencedNotes(head);
  chainNotesCache.set(key, { value, ts: now, dirty: false });
  return value;
}

function chainHasSequencedNotes(head) {
  let current = head;
  let sanity = 100;
  while (current && sanity-- > 0) {
    const toyType = current.dataset?.toy;
    if (toyType === 'loopgrid' || toyType === 'loopgrid-drum') {
      const state = current.__gridState;
      if (typeof current.__loopgridHasNotes === 'boolean') {
        if (current.__loopgridHasNotes) return true;
      } else if (state?.steps) {
        const hasNotes = state.steps.some(Boolean);
        current.__loopgridHasNotes = hasNotes;
        if (hasNotes) return true;
      }
    } else if (toyType === 'drawgrid') {
      const toy = current.__drawToy;
      if (toy) {
        if (typeof toy.hasActiveNotes === 'function') {
          if (toy.hasActiveNotes()) return true;
        } else if (typeof toy.getState === 'function') {
          try {
            const drawState = toy.getState();
            const activeCols = drawState?.nodes?.active;
            if (Array.isArray(activeCols) && activeCols.some(Boolean)) return true;
          } catch {}
        }
      }
    } else if (toyType === 'chordwheel') {
      if (current.__chordwheelHasActive) return true;
      const steps = current.__chordwheelStepStates;
      if (Array.isArray(steps) && steps.some(s => s !== -1)) return true;
    }
    const nextId = current.dataset?.nextToyId;
    if (!nextId) break;
    current = document.getElementById(nextId);
    if (!current || current === head) break;
  }
  return false;
}

function isPanelVisible(panel, st) {
  if (!panel || !panel.getBoundingClientRect) return true;
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const cache = st._visCache || (st._visCache = { ts: 0, visible: true });
  if (cache.ts && (now - cache.ts) < 220) return cache.visible;
  cache.ts = now;
  const rect = panel.getBoundingClientRect();
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  const visible = rect.width > 0 && rect.height > 0 &&
    rect.right >= 0 && rect.bottom >= 0 && rect.left <= vw && rect.top <= vh;
  if (!cache.visible && visible) {
    try { dirty.requestRedraw('loopgrid:update'); } catch {}
  }
  cache.visible = visible;
  return visible;
}

export async function attachSimpleRhythmVisual(panel) {
  const {isRunning, getLoopInfo, getTransportState} = panelTransportBindings(panel); // Made async
  if (!panel || panel.__simpleRhythmVisualAttached) return;
  panel.__simpleRhythmVisualAttached = true;

  const sequencerWrap = panel.querySelector('.sequencer-wrap');
  let canvas = sequencerWrap
    ? (sequencerWrap.querySelector('.grid-canvas')
       || sequencerWrap.querySelector('canvas:not(.toy-particles)'))
    : null;
  if (!canvas) return;
  if (!canvas.classList.contains('grid-canvas')) canvas.classList.add('grid-canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.imageSmoothingEnabled = false;

  // --- Sizing and Layout Setup ---
  const targetEl = sequencerWrap; // Element to observe for size changes
    const st = { // Define st here so it's available for computeLayout
      panel,
      canvas,
      ctx,
      sequencerWrap,
    particleCanvas: null, // Will be set later
    particleField: null,
    lastParticleTick: performance.now(),
    fieldWidth: 0,
    fieldHeight: 0,
    flash: new Float32Array(NUM_CUBES),
    bgFlash: 0,
    localLastPhase: 0,
    tapLabel: null, // Will be set later
    tapLetters: [],
      tapLetterHitTs: [],
      tapLetterLastLoop: [],
      tapLetterBounds: null,
      tapLetterOffsetX: [],
      tapLetterOffsetY: [],
      tapLetterVelocityX: [],
    tapLetterVelocityY: [],
    tapFieldRect: null,
    tapPromptVisible: false,
    tapLoopIndex: 0,
    _lastOverviewParticlesHidden: null,
    _resizer: null,
    _debugBurstSettings: null,
    _debugBurstLine: null,
    burstParticles: [],
    _burstSpriteCache: null,
    _playheadSpriteCache: null,
    _particleFieldBox: null,
    _rig: null,
    _particleSurface: null,
    _gridViewport: null,
    _relayoutFromRig: null,
    burstConfig: {
      particleCount: 16,
      lifeSeconds: 0.35,
      ampScalar: 30.0,              // overall height of the “bars”
      pixelSize: 6,                // base radius in CSS units (≈2–3px on screen)
      color: 'rgba(242, 170, 36, 1)',
    },
    _burstLastTime: performance.now(),
    computeLayout: (w, h) => {
      // IMPORTANT: sizing is owned by the rig(s). computeLayout is layout-only.
      st._cssW = w;
      st._cssH = h;
      const cssW = w;
      const cssH = h;

      // Fixed authored geometry; resizing changes projection only.
      st._gridViewport = createSimpleRhythmGridViewportSpace({ width: cssW, height: cssH });
      st._cubeSize = SIMPLE_RHYTHM_GRID_GEOMETRY.cubeSize;
      st._xOffset = SIMPLE_RHYTHM_GRID_GEOMETRY.originX;
      st._yOffset = SIMPLE_RHYTHM_GRID_GEOMETRY.originY;
      st._blockWidthWithGap = SIMPLE_RHYTHM_GRID_GEOMETRY.stride;
      st._localGap = SIMPLE_RHYTHM_GRID_GEOMETRY.gap;
      try { st._burstSpriteCache?.clear?.(); } catch {}
      try { st._playheadSpriteCache?.clear?.(); } catch {}
      const fieldWidth = Math.max(1, Math.round(cssW));
      const fieldHeight = Math.max(1, Math.round(cssH));
      const fieldLeft = 0;
      const fieldTop = 0;
      const clampedHeight = fieldHeight;
      st._particleFieldBox = {
        left: fieldLeft,
        top: fieldTop,
        width: fieldWidth,
        height: clampedHeight,
      };
      if (st.particleCanvas) {
        st.particleCanvas.style.right = 'auto';
        st.particleCanvas.style.bottom = 'auto';
        st.particleCanvas.style.left = `${fieldLeft}px`;
        st.particleCanvas.style.top = `${fieldTop}px`;
        // Particle backing and DPR are owned by the shared surface manager.
        try { st._particleSurface?.requestSync?.('loopgrid-layout'); } catch {}
      }

    },
  };
  const globalObj = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  const burstDebugEnv = globalObj?.__simpleRhythmBurstDebug;
  st._debugBurstSettings = {
    showIndicator: !!burstDebugEnv?.showIndicator,
    logPush: !!burstDebugEnv?.logPush,
    lineDuration: Number.isFinite(burstDebugEnv?.lineDuration) ? burstDebugEnv.lineDuration : 300,
    lineColor: typeof burstDebugEnv?.lineColor === 'string' ? burstDebugEnv.lineColor : 'rgba(255, 128, 0, 0.85)',
    lineWidth: Number.isFinite(burstDebugEnv?.lineWidth) ? burstDebugEnv.lineWidth : 2,
    lineDash: Array.isArray(burstDebugEnv?.lineDash) ? burstDebugEnv.lineDash : [],
  };
  // Shared dirty / redraw intent (base system)
  const dirty = createToyDirtyFlags({
    panel,
    prefix: '__lgDirty',
  });
  try { panel.__lgDirty = dirty; } catch {}
  // Keep legacy redraw flag in sync until we fully migrate off it.
  try {
    const __dirtyRequestRedraw = dirty.requestRedraw;
    dirty.requestRedraw = (reason) => {
      try { __dirtyRequestRedraw?.(reason); } catch {}
      try { panel.__loopgridNeedsRedraw = true; } catch {}
    };
  } catch {}
  // Main canvas rig: use content-box sizing to match the clipped frame (avoids right/bottom cut-off).
  st._rig = createToyCanvasRig({
    canvas: st.canvas,
    ctx: st.ctx,
    getContainerEl: () => targetEl || st.sequencerWrap || panel || null,
    getSizeOverride: () => {
      const el = targetEl || st.sequencerWrap || panel;
      const w = Math.round(el?.clientWidth || 0);
      const h = Math.round(el?.clientHeight || 0);
      if (w > 0 && h > 0) return { w, h };
      return null;
    },
    computeResizeOpts: () => {
      const tier = getLoopgridTierParams(panel, st) || null;
      const maxDprMul = (tier && Number.isFinite(tier.maxDprMul) && tier.maxDprMul > 0) ? tier.maxDprMul : null;
      const resScale = (tier && Number.isFinite(tier.resScale) && tier.resScale > 0) ? tier.resScale : 1;
      const deviceDpr = (Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0) ? window.devicePixelRatio : 1;
      return {
        rawDpr: deviceDpr * resScale,
        maxDprMul,
        cachePrefix: '__bm',
      };
    },
  });

  // Central relayout entrypoint: size via rig, then layout once.
  st._relayoutFromRig = async ({ waitStable = false } = {}) => {
    try {
      if (!st._rig) return;
      await st._rig.ensureSized({ waitStable });
      const w = (st._rig.st.cssW | 0);
      const h = (st._rig.st.cssH | 0);
      if (w > 0 && h > 0) {
        st.computeLayout(w, h);
        st._lastLayoutW = w;
        st._lastLayoutH = h;
        try { dirty.requestRedraw('loopgrid:update'); } catch {}
      }
    } catch {}
  };

  // Base relayout plumbing (ResizeObserver -> coalesced RAF -> relayout truth-point)
  st._relayoutCtl = createToyRelayoutController({
    panel,
    getContainerEl: () => targetEl || st.sequencerWrap || panel || null,
    relayout: () => { try { st._relayoutFromRig?.({ waitStable: false }); } catch {} },
  });
  try { st._relayoutCtl.start(); } catch {}

  // Expose state/hooks for PerfLab + Quality Lab forcing.
  // (Safe: purely optional; no callers = no behaviour change.)
  try { panel.__simpleRhythmVisualState = st; } catch {}
  try {
    panel.__lgSetQualityTier = (tierId, reason = 'external') => {
      try { window.__LG_FORCE_TIER = (tierId == null) ? null : (tierId | 0); } catch {}
      // Re-apply sizing immediately via rig (truth-point).
      try { st._relayoutFromRig?.({ waitStable: false }); } catch {}
      try { dirty.requestRedraw('loopgrid:update'); } catch {}
      try { panel.__lgQualityTierReason = reason; } catch {}
      try { panel.__lgQualityTierSetMs = performance.now(); } catch {}
    };
  } catch {}

  st._relayoutCtl?.stop?.(); // in case of re-init

  // 1) Initial layout: do NOT block visuals behind a "stable box" await.
  // In practice, the element can report 0x0 during init (CSS/class toggles, lazy DOM),
  // which would prevent any drawing. We do a best-effort layout immediately, then
  // re-layout on the next RAF and via observers.
  {
    st._lastLayoutW = 0;
    st._lastLayoutH = 0;
    st._relayoutFromRig({ waitStable: false });

    // Next-frame retry (covers the common "first frame is 0x0" case).
    raf().then(() => {
      if (!panel || !panel.isConnected) return;
      st._relayoutFromRig({ waitStable: false });
    }).catch(() => {});
  }

  // 2) Re-layout on container size changes
  // (was inline ResizeObserver) now handled by st._relayoutCtl

  // 3) Re-layout on zoom settle (hook whatever you already have)
  panel.zoom?.on?.('end', () => {
    // Wait a frame so layout settles, then re-measure + re-layout via rig.
    raf().then(() => {
      if (!panel || !panel.isConnected) return;
      st._relayoutFromRig({ waitStable: false });
    }).catch(() => {});
  });

  // --- Particle Canvas Setup (moved after st definition) ---
  let particleCanvas = panel.querySelector('.toy-particles');
  if (!particleCanvas && sequencerWrap) {
    particleCanvas = document.createElement('canvas');
    particleCanvas.className = 'toy-particles';
    sequencerWrap.insertBefore(particleCanvas, sequencerWrap.firstChild || null);
    Object.assign(particleCanvas.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      right: 'auto',
      bottom: 'auto',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '1',
    });
  }
  st.particleCanvas = particleCanvas; // Assign to st
  if (particleCanvas) {
    st._particleSurface = createToySurfaceManager({
      panel,
      body: sequencerWrap,
      getBoardScale: () => boardScale(sequencerWrap || panel),
      tag: 'simple-rhythm-particles',
    });
    st._particleSurface.setDprPolicy(({ boardScale: scale }) => {
      const tier = getLoopgridTierParams(panel, st) || null;
      const deviceDpr = Math.max(1, Number(window.devicePixelRatio) || 1);
      const resolutionScale = Number.isFinite(tier?.resScale) ? tier.resScale : 1;
      const maximumScale = Number.isFinite(tier?.maxDprMul) ? tier.maxDprMul : 1;
      const zoomScale = Number.isFinite(scale) && scale < 0.6 ? Math.max(0.6, scale / 0.6) : 1;
      return Math.max(0.5, Math.min(deviceDpr, deviceDpr * resolutionScale * maximumScale * zoomScale));
    });
    st._particleSurface.registerCanvas('field', particleCanvas, { policy: 'managed' });
    st._particleSurface.syncNow('init');
  }
  if (particleCanvas && st._particleFieldBox) {
    const box = st._particleFieldBox;
    particleCanvas.style.right = 'auto';
    particleCanvas.style.bottom = 'auto';
    particleCanvas.style.left = `${box.left}px`;
    particleCanvas.style.top = `${box.top}px`;
    particleCanvas.style.width = `${box.width}px`;
    particleCanvas.style.height = `${box.height}px`;
  }

  let particleField = null;
  if (particleCanvas) {
    try {
      const panelSeed = panel?.dataset?.toyid || panel?.id || 'loopgrid';

      // Ask the shared particle quality system how aggressive we can be.
      const budgetState = (() => {
        try { return getAdaptiveFrameBudget(); } catch { return null; }
      })();
      const budget = budgetState?.particleBudget ?? (() => {
        try {
          return getParticleBudget();
        } catch {
          return { spawnScale: 1.0, maxCountScale: 1.0 };
        }
      })();

      // Match DrawGrid's particle density, but scale by the local field area.
      const baseDensity = 2200 / (420 * 420);
      const area = SIMPLE_RHYTHM_PARTICLE_LOGICAL_WIDTH * SIMPLE_RHYTHM_PARTICLE_LOGICAL_HEIGHT;
      const baseCap = Math.round(baseDensity * area);
      const capScale = Math.max(0.15, (budget.maxCountScale ?? 1) * (budget.capScale ?? 1));
      const cap = Math.max(140, Math.min(2200, Math.floor(baseCap * capScale)));

      // Match DrawGrid's sizing so fidelity is comparable at the same density.
      const baseSize = 1.4;
      const sizePx = baseSize * (0.8 + 0.4 * (budget.spawnScale ?? 1));

      // Keep trails a touch longer, but let cap handle the real cost.
      const returnSeconds = 2.4;

      particleField = createGenericParticleField(
        {
          bounds: SIMPLE_RHYTHM_PARTICLE_BOUNDS,
        },
        {
          seed: panelSeed,
          cap,
          returnSeconds,
          forceMul: 1.0,
          noise: 0,
          kick: 0,
          kickDecay: 8.0,
          drawMode: 'dots',
          sizePx,
          minAlpha: 0.25,
          maxAlpha: 0.85,
          // IMPORTANT: let particles actually respond to pushes
          staticMode: false,

        }
      );
      try {
        if (budget && typeof particleField.applyBudget === 'function') {
          particleField.applyBudget({
            maxCountScale: capScale,
            capScale: budget.capScale ?? 1,
            tickModulo: budget.tickModulo ?? 1,
            sizeScale: budget.sizeScale ?? 1,
          });
        }
      } catch {}
    } catch (err) {
      console.warn('[loopgrid] particle field init failed', err);
      particleField = null;
    }
  }
  st.particleField = particleField; // Assign to st

  // Expose a helper so grid-core can trigger a vertical-scale burst
  // when a cube plays.
  st.triggerNoteParticleBurst = (colIndex) => {
    const globalObj = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    const burstDebugEnv = globalObj?.__simpleRhythmBurstDebug || {};
    const debug = st._debugBurstSettings = {
      showIndicator: !!burstDebugEnv.showIndicator,
      logPush: !!burstDebugEnv.logPush,
      lineDuration: Number.isFinite(burstDebugEnv.lineDuration) ? burstDebugEnv.lineDuration : 300,
      lineColor: typeof burstDebugEnv.lineColor === 'string' ? burstDebugEnv.lineColor : 'rgba(255, 128, 0, 0.85)',
      lineWidth: Number.isFinite(burstDebugEnv.lineWidth) ? burstDebugEnv.lineWidth : 2,
      lineDash: Array.isArray(burstDebugEnv.lineDash) ? burstDebugEnv.lineDash : [],
    };

    const cubeSize = st._cubeSize;
    const xOffset = st._xOffset;
    const yOffset = st._yOffset;
    const blockWidthWithGap = st._blockWidthWithGap;
    if (!Number.isFinite(cubeSize) || cubeSize <= 0) return;

    const numCubes = NUM_CUBES_GLOBAL || NUM_CUBES || 8;
    const col = Math.max(0, Math.min(numCubes - 1, (colIndex | 0)));

    const cubeX = xOffset + col * blockWidthWithGap;
    const cubeY = yOffset;
    const cubeCenterX = cubeX + cubeSize * 0.5;
    const cubeCenterY = cubeY + cubeSize * 0.5;

    const cfg = st.burstConfig || {};
    const count       = cfg.particleCount || 20;
    const lifeSeconds = cfg.lifeSeconds || 0.35;
    const ampScalar   = (cfg.ampScalar ?? 1.0);
    const pixelSize   = (cfg.pixelSize ?? 6);
    const color       = cfg.color || 'rgba(255, 180, 220, 1)';

    const now = performance.now();
    const midIndex = (count - 1) / 2;

    for (let i = 0; i < count; i++) {
      const t = count <= 1 ? 0.5 : i / (count - 1);

      // Centered along a horizontal line across the cube
      const x = cubeCenterX + (t - 0.5) * cubeSize;
      const y = cubeCenterY;

      // Arrow shape: middle "bar" scales most, edges least (purely deterministic)
      const centerDist = Math.abs(i - midIndex) / (midIndex || 1); // 0 at center, 1 at ends
      const centerBias = 1 - centerDist;                            // 1 at center, 0 at ends
      const amp = (0.4 + 0.8 * centerBias) * ampScalar;            // keep edges from being completely flat

      st.burstParticles.push({
        x,
        y,
        life: 1,
        lifeSeconds,
        size: pixelSize, // base diameter in logical units
        color,
        amp,             // vertical scale amplitude
        born: now,
      });
    }

    if (debug?.logPush) {
      console.debug('[loopgrid] particle burst', {
        col,
        cubeCenterX,
        cubeCenterY,
        count,
        lifeSeconds,
        ampScalar,
      });
    }

    if (debug?.showIndicator) {
      const duration = Number.isFinite(debug.lineDuration) ? debug.lineDuration : 300;
      st._debugBurstLine = {
        x: cubeX,
        y: cubeY,
        size: cubeSize,
        expire: now + duration,
      };
    }
  };

  let tapLabel = sequencerWrap ? sequencerWrap.querySelector('.loopgrid-tap-label') : null;
  if (!tapLabel && sequencerWrap) {
    tapLabel = document.createElement('div');
    tapLabel.className = 'toy-action-label loopgrid-tap-label';
    Object.assign(tapLabel.style, {
      lineHeight: '1',
      whiteSpace: 'nowrap',
      transition: 'none',
      fontFamily: 'system-ui, sans-serif',
      fontWeight: '700',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: 'var(--tap-label-color, rgba(160,188,255,0.72))',
      textShadow: 'var(--tap-label-shadow, 0 2px 10px rgba(40,60,120,0.55))',
    });
    sequencerWrap.appendChild(tapLabel);
    scheduleTapLabelSize(tapLabel, panel, sequencerWrap);
  }
  st.tapLabel = tapLabel; // Assign to st
  st.tapLetters = ensureTapLetters(tapLabel); // Assign to st

  const teardownParticles = () => {
    try { st.particleField?.destroy?.(); } catch {} // Use st.particleField
    try { st._particleSurface?.destroy?.(); } catch {}
    st._resizer?.disconnect?.(); // Disconnect the main resizer
    try { __LG.panels.delete(panel); } catch {}
  };
  panel.addEventListener('toy:remove', teardownParticles, { once: true });

  // Listen for clicks on the canvas to toggle steps or change notes
  canvas.addEventListener('pointerdown', (e) => {
    const st = panel.__simpleRhythmVisualState;
    if (!st) return;

    const pointer = simpleRhythmGridClientToLogical(canvas, { x: e.clientX, y: e.clientY });
    if (!pointer) return; // reject letterbox/contain-fit margins
    const clickedIndex = hitSimpleRhythmCube(pointer);
    if (clickedIndex < 0) return;

    const state = panel.__gridState;
    if (!state?.noteIndices || !state?.steps) return;

    const cube = getSimpleRhythmCubeRect(clickedIndex);
    const third = whichThirdRect(
      {
        x: cube.x,
        y: cube.y,
        w: cube.width,
        h: cube.height,
      },
      pointer.y
    );

    const isZoomed = panel.classList.contains('toy-zoomed');
    let mutated = false;
    let updateReason = null;

    if (isZoomed && third === 'up') {
      const curIx = (state.noteIndices[clickedIndex] | 0);
      const max = state.notePalette.length | 0;
      state.noteIndices[clickedIndex] = max ? ((curIx + 1) % max) : curIx;
      panel.dispatchEvent(new CustomEvent('grid:notechange', {
        detail: { col: clickedIndex },
      }));
      updateReason = 'note-change';
      mutated = true;
    } else if (isZoomed && third === 'down') {
      const curIx = (state.noteIndices[clickedIndex] | 0);
      const max = state.notePalette.length | 0;
      state.noteIndices[clickedIndex] = max ? ((curIx - 1 + max) % max) : curIx;
      panel.dispatchEvent(new CustomEvent('grid:notechange', {
        detail: { col: clickedIndex },
      }));
      updateReason = 'note-change';
      mutated = true;
    } else {
      const next = !state.steps[clickedIndex];
      state.steps[clickedIndex] = next;
      updateReason = next ? 'step-activate' : 'step-deactivate';
      mutated = true;
    }

    if (mutated) {
      try {
        try {
          if (window.__LOOPGRID_CLICK_DEBUG) {
            console.log('[loopgrid][ui-click]', {
              panelId: panel?.id,
              toyId: panel?.dataset?.toyid,
              toyType: panel?.dataset?.toy,
              clickedIndex,
              reason: updateReason || (isZoomed ? 'note-change' : 'step-toggle')
            });
          }
        } catch {}
        panel.dispatchEvent(new CustomEvent('loopgrid:update', {
          detail: {
            reason: updateReason || (isZoomed ? 'note-change' : 'step-toggle'),
            col: clickedIndex,
            steps: Array.isArray(state.steps) ? Array.from(state.steps) : undefined,
            noteIndices: Array.isArray(state.noteIndices) ? Array.from(state.noteIndices) : undefined,
          },
        }));
      } catch {}
    }
  });

  let needsRedraw = false;
  // Overview mode hooks (match drawgrid style)
  try {
    panel?.addEventListener?.('overview:precommit', () => {
      try { if (window.__PERF_LAB_VERBOSE) console.debug('[loopgrid][overview] precommit'); } catch {}
      needsRedraw = true;
      dirty.requestRedraw('loopgrid:update');
    });
    panel?.addEventListener?.('overview:commit', () => {
      try { if (window.__PERF_LAB_VERBOSE) console.debug('[loopgrid][overview] commit', { active: !!overviewMode?.isActive?.() }); } catch {}
      // Force the next frame to apply visibility/pause logic immediately.
      try { needsRedraw = true; dirty.requestRedraw('loopgrid:update'); } catch {}
    });
  } catch {}

  // Register with global scheduler (one RAF for all loopgrids)
  if (!panel.__simpleRhythmScheduled) {
    panel.__simpleRhythmScheduled = true;
    __LG.panels.add(panel);
    __LG.start();
  }

  panel.addEventListener('loopgrid:update', () => {
    try { st._gridDirty = true; } catch {}
    try { dirty.requestRedraw('loopgrid:update'); } catch {}
    try { markChainNotesDirty(panel); } catch {}
    try {
      const state = panel.__gridState;
      if (state?.steps) panel.__loopgridHasNotes = state.steps.some(Boolean);
    } catch {}
  });
}

function render(panel, opts = {}) {
  const {isRunning, getLoopInfo, getTransportState} = panelTransportBindings(panel);
  const __perfOn = !!window.__PERF_ZOOM_PROFILE;
  const p = __perfOn ? {
    _start: performance.now(),
    _timings: {},
    mark(name) {
      this._timings[name] = performance.now();
    },
    measure(name, startMark, endMark) {
        const duration = (this._timings[endMark] || 0) - (this._timings[startMark] || 0);
        if (duration > 0) window.__PerfFrameProf?.mark?.(name, duration);
    }
  } : null;

  if (__perfOn) p.mark('start');

  const st = panel.__simpleRhythmVisualState;
  if (!st) return;
  // Live dirty-flags controller for this panel (not the consumed snapshot).
  // Needed so render() can request redraws safely (e.g. during pulses).
  const dirty = panel.__lgDirty || null;
  // Dirty system is the new source of truth; legacy flag stays as a fallback for now.
  const forceNudge = !!(opts.forceNudge || opts?.dirty?.redraw || panel.__loopgridNeedsRedraw);
  panel.__loopgridNeedsRedraw = false;

  // PerfLab: freeze all unfocused toys during stress tests
  if (window.__PERF_FREEZE_ALL_UNFOCUSED) {
    try {
      const isFocused = !!(panel?.classList?.contains('focused') || panel?.parentElement?.classList?.contains('focused'));
      if (!isFocused) return;
    } catch {}
  }

  // Do not change quality based on gesturing; treat all visible toys equally (unless in focus-edit mode).
  const isFocused = panel.classList?.contains('toy-focused') || panel.classList?.contains('focused');
  const isUnfocused = panel.classList?.contains('toy-unfocused');
  const __srFps =
    (typeof window !== 'undefined' && Number.isFinite(window.__MT_SM_FPS)) ? window.__MT_SM_FPS :
    ((typeof window !== 'undefined' && Number.isFinite(window.__MT_FPS)) ? window.__MT_FPS : 60);
  const __srVisiblePanels = Number.isFinite(window.__MT_VISIBLE_PANELS)
    ? window.__MT_VISIBLE_PANELS
    : (Number.isFinite(window.__LOOPGRID_GLOBAL?.visibleCount) ? window.__LOOPGRID_GLOBAL.visibleCount : 0);
  const __srGlobalLowQuality = (__srVisiblePanels >= 18 && __srFps < 50) || (__srFps < 40);

  // Keep cadence; later switch to lower-detail visuals when __srGlobalLowQuality is true.
  let skipHeavy = false;

  // Handle the highlight pulse animation on note hits.
  if (panel.__pulseRearm) {
    requestPanelPulse(panel, { rearm: true });
    panel.__pulseRearm = false;
    panel.__pulseHighlightFired = true;
  }

  if (panel.__pulseHighlight && panel.__pulseHighlight > 0) {
    if (!panel.__pulseHighlightFired) {
      requestPanelPulse(panel);
      panel.__pulseHighlightFired = true;
    }
    dirty?.requestRedraw?.('loopgrid:update');
    panel.__pulseHighlight = Math.max(0, panel.__pulseHighlight - 0.05); // Decay over ~20 frames
  } else if (panel.__pulseHighlightFired) {
    panel.__pulseHighlightFired = false;
  }

  // While the transport is running we should keep visuals alive (playhead/decays).
  // Scheduler already requests, but this makes render() robust if called directly.
  if (isPanelTransportRunning(panel)) {
    dirty?.requestRedraw?.('loopgrid:transport');
  }

  const transportRunning = isPanelTransportRunning(panel);

  // Compute playhead early for step-driven gating
  const loopInfo = getLoopInfo();
  const localSubBoardStep = Number(panel.__beatSwarmSubBoardLocalStep);
  const useLocalSubBoardStep = panel?.dataset?.beatSwarmSubboard === '1'
    && !!window.BeatSwarmMode?.isSubBoardPlaying?.()
    && Number.isFinite(localSubBoardStep)
    && localSubBoardStep >= 0;
  const playheadCol = useLocalSubBoardStep
    ? (Math.trunc(localSubBoardStep) % NUM_CUBES)
    : (() => {
        return resolveSimpleRhythmPlayheadColumn({
          running: transportRunning,
          instance: getPlaybackInstance(panel.id),
          transportTick: getTransportState().currentTick,
          steps: NUM_CUBES,
        });
      })();
  // Chain state can force a clear when this toy hands off to another.
  const isActiveInChain = panel.dataset.chainActive === 'true';
  const isChained = !!(panel.dataset.nextToyId || panel.dataset.prevToyId);
  const lastChainActive = panel.__loopgridLastChainActive;
  const chainActiveChanged = (typeof lastChainActive === 'boolean') && (lastChainActive !== isActiveInChain);
  panel.__loopgridLastChainActive = isActiveInChain;
  const lastDrawColForClear = (panel.__loopgridLastDrawPlayheadCol ?? -999);
  const needsClear = (!transportRunning || (isChained && !isActiveInChain)) && lastDrawColForClear !== -999;

  // PerfLab: redraw unfocused only when playhead step changes (or forced/pulsing).
  const mode = window.__PERF_LOOPGRID_UNFOCUSED_MODE;
  const stepOnly = (mode === 'stepOnly');
  const autoGate = (mode == null || mode === 'auto');
  const hasFlash = (() => {
    const flashes = st.flash;
    if (!flashes || typeof flashes.length !== 'number') return false;
    for (let i = 0; i < flashes.length; i++) {
      if (flashes[i] > 0) return true;
    }
    return false;
  })();
  if (autoGate && isUnfocused && !isFocused) {
    const hasPulse = !!(panel.__pulseHighlight && panel.__pulseHighlight > 0);
    const wantsRedraw = !!forceNudge || needsClear || chainActiveChanged;
    const last = (panel.__loopgridLastPlayheadCol ?? -999);
    const changed = (playheadCol !== last);
    panel.__loopgridLastPlayheadCol = playheadCol;
    if (!wantsRedraw && !hasPulse && !hasFlash && !(transportRunning && changed)) {
      if (__LG_DEBUG_DIRTY()) {
        // Throttle: only log occasionally
        const now = performance.now();
        if (!panel.__lgDbgLastSkipTs || (now - panel.__lgDbgLastSkipTs) > 500) {
          panel.__lgDbgLastSkipTs = now;
          __lgDbg('render.skip(autoGate)', {
            frame: opts.__frame ?? null,
            forceNudge,
            dirtyRedraw: !!opts?.dirty?.redraw,
            wantsRedraw,
            hasPulse,
            hasFlash,
            transportRunning,
            changed,
            playheadCol,
          });
        }
      }
      return;
    }
  }
    if (stepOnly && isUnfocused && !isFocused) {
      const hasPulse = !!(panel.__pulseHighlight && panel.__pulseHighlight > 0);
      // NOTE: loopgrid body uses time-decaying flash/bgFlash; even if playhead
      // doesn't advance this frame, we still need redraws while flashes decay.
      let hasFlash = false;
      if (st) {
        if ((st.bgFlash || 0) > 0.001) {
          hasFlash = true;
        } else if (st.flash && st.flash.length) {
          // Small array (NUM_CUBES), scan is cheap.
          for (let i = 0; i < st.flash.length; i++) {
            if ((st.flash[i] || 0) > 0.001) { hasFlash = true; break; }
          }
        }
      }
      const wantsRedraw = !!forceNudge || needsClear || chainActiveChanged; // includes __loopgridNeedsRedraw path

      const last = (panel.__loopgridLastPlayheadCol ?? -999);
      const changed = (playheadCol !== last);
      panel.__loopgridLastPlayheadCol = playheadCol;

      if (!changed && !hasPulse && !hasFlash && !wantsRedraw) return;
    } else {
      panel.__loopgridLastPlayheadCol = playheadCol;
    }

  // PerfLab: event-driven redraw for unfocused loopgrids
    const pulseOnly = (window.__PERF_LOOPGRID_UNFOCUSED_MODE === 'pulseOnly');
    if (pulseOnly && isUnfocused && !isFocused) {
      const hasPulse = !!(panel.__pulseHighlight && panel.__pulseHighlight > 0);
      let hasFlash = false;
      if (st) {
        if ((st.bgFlash || 0) > 0.001) {
          hasFlash = true;
        } else if (st.flash && st.flash.length) {
          for (let i = 0; i < st.flash.length; i++) {
            if ((st.flash[i] || 0) > 0.001) { hasFlash = true; break; }
          }
        }
      }
      const wantsRedraw = !!forceNudge || needsClear || chainActiveChanged; // includes __loopgridNeedsRedraw path
      if (!hasPulse && !hasFlash && !wantsRedraw) {
        return;
      }
    }
  if (opts.visible === false) {
    if (__LG_DEBUG_DIRTY()) __lgDbg('render.skip(visible=false)', { frame: opts.__frame ?? null });
    return;
  }
  if (opts.visible == null && !isPanelVisible(panel, st)) {
    if (__LG_DEBUG_DIRTY()) __lgDbg('render.skip(notVisible)', { frame: opts.__frame ?? null });
    return;
  }

  if (__LG_DEBUG_DIRTY()) {
    // Throttle: once per ~500ms
    const now = performance.now();
    if (!panel.__lgDbgLastDrawTs || (now - panel.__lgDbgLastDrawTs) > 500) {
      panel.__lgDbgLastDrawTs = now;
      __lgDbg('render.draw', {
        frame: opts.__frame ?? null,
        forceNudge,
        transportRunning,
        playheadCol,
        bgFlash: +(st.bgFlash || 0).toFixed(3),
      });
    }
  }

  if (__perfOn) p._mark('loopgrid.visibility+classes');

  // Set playing class for border highlight
  const state = panel.__gridState || {};
  let hasActiveNotes = (typeof panel.__loopgridHasNotes === 'boolean')
    ? panel.__loopgridHasNotes
    : (state.steps && state.steps.some(s => s));
  if (typeof panel.__loopgridHasNotes !== 'boolean' && typeof hasActiveNotes === 'boolean') {
    panel.__loopgridHasNotes = hasActiveNotes;
  }

  let chainHasNotes = false;
  if (transportRunning && isChained && isActiveInChain) {
    const head = findChainHead(panel);
    const cache = window.__PERF_LOOPGRID_CHAIN_CACHE ? opts.chainNotesCache : null;
    if (cache && head) {
      if (cache.has(head)) {
        chainHasNotes = cache.get(head);
      } else {
        chainHasNotes = chainHasSequencedNotes(head);
        cache.set(head, chainHasNotes);
      }
    } else {
      chainHasNotes = head ? readChainNotesCached(head) : hasActiveNotes;
    }
  }

  // Only show the steady outline while transport is running.
  // Chained toys require both an active link and notes somewhere in the chain.
  const showPlaying = transportRunning
    ? (isChained ? (isActiveInChain && chainHasNotes) : hasActiveNotes)
    : false;
  if (st._lastShowPlaying !== showPlaying) {
    // Avoid DOM writes in rAF: queue for deferred commit.
    markPanelForDomCommit(panel);
    queueClassToggle(panel, 'toy-playing', showPlaying);
    st._lastShowPlaying = showPlaying;
  }

  if (skipHeavy) {
    if (window.__PERF_LAB_VERBOSE) {
      window.__PERF_LOOPGRID_GESTURE_SKIP = (window.__PERF_LOOPGRID_GESTURE_SKIP || 0) + 1;
      if ((window.__PERF_LOOPGRID_GESTURE_SKIP % 120) === 0) {
        console.debug('[loopgrid][perf] gesture skipHeavy', { skips: window.__PERF_LOOPGRID_GESTURE_SKIP, mod: gestureRenderMod });
      }
    }
    return;
  }
  if (window.__PERF_LOOPGRID_UNFOCUSED_MOD) {
    panel.__loopgridFrameModulo = isFocused ? 1 : (window.__PERF_LOOPGRID_UNFOCUSED_MOD | 0);
  } else {
    panel.__loopgridFrameModulo = isFocused ? 1 : 2;
  }

  if (__perfOn) p.mark('vis_end');

  const { ctx, canvas, tapLabel, particleCanvas, sequencerWrap, particleField } = st;
  if (__perfOn) p.mark('layout_start');

  const w = canvas.width;
  const h = canvas.height;
  const cssW = st._cssW || canvas.clientWidth;
  const cssH = st._cssH || canvas.clientHeight;
  const renderTime = performance.now();
  if (forceNudge) {
    st.lastParticleTick = renderTime;
  }
  if (__perfOn) p.mark('layout_end');
  if (__perfOn) p._mark('loopgrid.layout+rects');
  
  if (__perfOn) p._mark('loopgrid.domStyleWrites');
  const adaptiveBudget = (() => {
    try { return getAdaptiveFrameBudget(); } catch { return null; }
  })();
  const emergencyMode = !!adaptiveBudget?.emergencyMode;
  const particleBudget = adaptiveBudget?.particleBudget;
  const isOverview = (() => {
    try { return !!overviewMode?.isActive?.(); } catch { return false; }
  })();
  const allowField = particleBudget?.allowField !== false && !isOverview;
  if (__perfOn) p.mark('dom_start');
  if (particleCanvas) {
    try {
      const shouldHide = isOverview;
      if (st._lastOverviewParticlesHidden !== shouldHide) {
        particleCanvas.style.opacity = shouldHide ? '0' : '';
        particleCanvas.style.visibility = shouldHide ? 'hidden' : '';
        st._lastOverviewParticlesHidden = shouldHide;
      }
    } catch {}
  }
    if (__perfOn) p.mark('dom_end');
      if (__perfOn) p.mark('particles_start');
        if (particleField) {
          if (window.__PERF_DISABLE_LOOPGRID_PARTICLES) {
            if (st._lastOverviewParticlesHidden !== true) {
              particleCanvas.style.opacity = '0';
              particleCanvas.style.visibility = 'hidden';
              st._lastOverviewParticlesHidden = true;
            }
          } else {
            try {
              if (particleBudget && typeof particleField.applyBudget === 'function') {
                const crowdScale = (() => {
                  const base = 1 / Math.max(1, visibleCount);
                  if (visibleCount <= 6) return Math.max(0.18, base);
                  const minScale =
                    visibleCount >= 36 ? 0.08 :
                    visibleCount >= 24 ? 0.1 :
                    visibleCount >= 16 ? 0.12 :
                    0.16;
                  return Math.max(minScale, base);
                })();
                const emergencyScale = emergencyMode ? 0.45 : 1;
                const maxCountScaleBase = (particleBudget.maxCountScale ?? 1) * (particleBudget.capScale ?? 1);
                const maxCountScale = Math.max(0.08, maxCountScaleBase * crowdScale * emergencyScale);
                const capScale = Math.max(0.08, (particleBudget.capScale ?? 1) * crowdScale * emergencyScale);
                particleField.applyBudget({
                  maxCountScale,
                  capScale,
                  tickModulo: particleBudget.tickModulo ?? 1,
                  sizeScale: (particleBudget.sizeScale ?? 1) * (emergencyMode ? 1.1 : 1),
                  minCount: emergencyMode ? 0 : undefined,
                  emergencyFade: emergencyMode,
                  emergencyFadeSeconds: 5,
                });
              }
            } catch {}
          if (allowField) {
            if (!Number.isFinite(st.lastParticleTick)) st.lastParticleTick = renderTime;
            const dt = Math.min(0.05, Math.max(0, (renderTime - st.lastParticleTick) / 1000));
            st.lastParticleTick = renderTime;
            try {
              particleField.step(dt || (1 / 60));
              const surface = st._particleSurface;
              surface?.syncNow?.('loopgrid-render');
              const displayWidth = Math.max(1, surface?.getCssW?.() || particleCanvas.clientWidth || 1);
              const displayHeight = Math.max(1, surface?.getCssH?.() || particleCanvas.clientHeight || 1);
              const dpr = Math.max(0.25, surface?.getDpr?.() || 1);
              const particleCtx = particleCanvas.getContext('2d', { alpha: true });
              const viewport = createSimpleRhythmParticleViewportSpace({
                width: displayWidth,
                height: displayHeight,
                backingScale: dpr,
              });
              particleCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
              particleCtx.clearRect(0, 0, displayWidth, displayHeight);
              particleCtx.translate(viewport.contentRect.left, viewport.contentRect.top);
              particleCtx.scale(viewport.presentationScale, viewport.presentationScale);
              particleField.render(particleCtx);
            } catch {}
          } else {
            st.lastParticleTick = renderTime;
          }
        }
      }
  if (!Number.isFinite(st._burstLastTime)) st._burstLastTime = renderTime;
  const burstDt = Math.min(0.05, Math.max(0, (renderTime - st._burstLastTime) / 1000));
  st._burstLastTime = renderTime;
  if (__perfOn) p.mark('particles_end');

  if (!cssW || !cssH || !w || !h) {
    if (__perfOn) {
        p.measure('loopgrid.visibility+classes', 'start', 'vis_end');
        p.measure('loopgrid.render', 'start', 'vis_end');
    }
    return;
  }
  
  if (__perfOn) p.mark('layout_update_start');
  const backingScaleX = cssW ? (w / cssW) : 1;
  const backingScaleY = cssH ? (h / cssH) : 1;
  const gridViewport = st._gridViewport = createSimpleRhythmGridViewportSpace({
    width: cssW,
    height: cssH,
    backingScale: Math.min(backingScaleX, backingScaleY),
  });
  const pxX = (logicalX) => (
    gridViewport.contentRect.left + logicalX * gridViewport.presentationScale
  ) * backingScaleX;
  const pxY = (logicalY) => (
    gridViewport.contentRect.top + logicalY * gridViewport.presentationScale
  ) * backingScaleY;
  const pxLength = (logicalLength) => logicalLength
    * gridViewport.presentationScale
    * Math.min(backingScaleX, backingScaleY);

  if (!st._loggedScaleOnce) {
    st._loggedScaleOnce = true;
  }

  const fieldHost = sequencerWrap || particleCanvas || canvas;
  if (st._particleFieldBox) {
    st.fieldWidth = st._particleFieldBox.width || cssW;
    st.fieldHeight = st._particleFieldBox.height || cssH;
  } else if (fieldHost) {
    st.fieldWidth = fieldHost.clientWidth || cssW;
    st.fieldHeight = fieldHost.clientHeight || cssH;
  } else {
    st.fieldWidth = cssW;
    st.fieldHeight = cssH;
  }

  const steps = state.steps || [];
  const noteIndices = state.noteIndices || [];
  const notePalette = state.notePalette || [];
  const isZoomed = panel.classList.contains('toy-zoomed');

  if (__perfOn) p.mark('layout_update_end');

  if (__perfOn) p.mark('dom_update_start');
  if (__perfOn) p._mark('loopgrid.layout+rects');

  if (__perfOn) p._mark('loopgrid.domStyleWrites');
  if (__perfOn) p.mark('dom_update_start');
  const showTapPrompt = !hasActiveNotes;
  if (tapLabel && st.tapLetters?.length) {
    const tapLetters = st.tapLetters;
    const letterCount = tapLetters.length;
    const promptWasVisible = !!st.tapPromptVisible;
    const promptJustEnabled = showTapPrompt && !promptWasVisible;
    if (!Array.isArray(st.tapLetterHitTs) || st.tapLetterHitTs.length !== letterCount) {
      st.tapLetterHitTs = Array.from({ length: letterCount }, () => 0);
    }
    if (!Array.isArray(st.tapLetterLastLoop) || st.tapLetterLastLoop.length !== letterCount) {
      st.tapLetterLastLoop = Array.from({ length: letterCount }, () => -1);
    }
    if (!Array.isArray(st.tapLetterOffsetX) || st.tapLetterOffsetX.length !== letterCount) {
      st.tapLetterOffsetX = Array.from({ length: letterCount }, () => 0);
    }
    if (!Array.isArray(st.tapLetterOffsetY) || st.tapLetterOffsetY.length !== letterCount) {
      st.tapLetterOffsetY = Array.from({ length: letterCount }, () => 0);
    }
    if (!Array.isArray(st.tapLetterVelocityX) || st.tapLetterVelocityX.length !== letterCount) {
      st.tapLetterVelocityX = Array.from({ length: letterCount }, () => 0);
    }
    if (!Array.isArray(st.tapLetterVelocityY) || st.tapLetterVelocityY.length !== letterCount) {
      st.tapLetterVelocityY = Array.from({ length: letterCount }, () => 0);
    }

    if (!showTapPrompt) {
      if (promptWasVisible) {
        tapLabel.style.opacity = '0';
        st.tapLetterBounds = null;
        st.tapFieldRect = null;
        st.tapPromptVisible = false;
        st.tapLoopIndex = 0;
        st.tapPromptAnimating = false;
        if (Array.isArray(st.tapLetterLastLoop)) st.tapLetterLastLoop.fill(-1);
        for (let i = 0; i < letterCount; i++) {
          if (st.tapLetterHitTs) st.tapLetterHitTs[i] = 0;
          if (st.tapLetterOffsetX) st.tapLetterOffsetX[i] = 0;
          if (st.tapLetterOffsetY) st.tapLetterOffsetY[i] = 0;
          if (st.tapLetterVelocityX) st.tapLetterVelocityX[i] = 0;
          if (st.tapLetterVelocityY) st.tapLetterVelocityY[i] = 0;
          tapLetters[i].style.opacity = '0';
          tapLetters[i].style.color = '';
          tapLetters[i].style.textShadow = '';
          tapLetters[i].style.filter = 'none';
          tapLetters[i].style.transform = 'none';
        }
      }
    } else {
      st.tapPromptVisible = true;
      tapLabel.style.opacity = `${TAP_LABEL_OPACITY_BASE}`;
      const needsTapLayout = promptJustEnabled || forceNudge || !st.tapFieldRect || !st.tapLetterBounds;
      const fieldElement = particleCanvas || sequencerWrap || tapLabel;
      if (needsTapLayout) {
        let fieldRect = null;
        try { fieldRect = fieldElement.getBoundingClientRect(); } catch {}
        if (fieldRect && fieldRect.width > 0) {
          const rectTooSmall = fieldRect.width < 80 || fieldRect.height < 40;
          if (rectTooSmall) fieldRect = null;
        }
        if (fieldRect && fieldRect.width > 0) {
          // Use the unscaled field size so the label stays a constant
          // fraction of its frame regardless of zoom.
          sizeTapLabel(tapLabel, panel, fieldRect, null);
          st.tapFieldRect = { left: fieldRect.left, width: fieldRect.width, top: fieldRect.top, height: fieldRect.height };
          st.tapLetterBounds = tapLetters.map(letter => {
              const rect = letter.getBoundingClientRect();
            const start = (rect.left - fieldRect.left) / fieldRect.width;
            const end = (rect.right - fieldRect.left) / fieldRect.width;
            return {
              start: Math.max(0, Math.min(1, start)),
              end: Math.max(0, Math.min(1, end)),
              centerX: rect.left + rect.width / 2,
              centerY: rect.top + rect.height / 2,
            };
          });
        } else {
          // Fallback if fieldRect missing
          const s = Math.max(0.001, Number(boardScale(panel)) || 1);
          const particleFieldW = (st.fieldWidth  || 320) / s;
          const particleFieldH = (st.fieldHeight || 180) / s;
          sizeTapLabel(tapLabel, panel, null, { width: particleFieldW, height: particleFieldH });
          st.tapFieldRect = null;
          st.tapLetterBounds = null;
        }
      }

      const shouldUpdateTapDom = promptJustEnabled || needsTapLayout || !!st.tapPromptAnimating;
      if (shouldUpdateTapDom) {
        const offsetsX = st.tapLetterOffsetX;
        const offsetsY = st.tapLetterOffsetY;
        const velX = st.tapLetterVelocityX;
        const velY = st.tapLetterVelocityY;
        const spring = TAP_LETTER_PHYS.k;
        const damping = TAP_LETTER_PHYS.damping;
        const maxOffset = TAP_LETTER_PHYS.max;
        const now = (typeof performance !== 'undefined' && performance.now)
          ? performance.now()
          : Date.now();
        let tapAnimating = false;
        for (let i = 0; i < letterCount; i++) {
          const lastHit = st.tapLetterHitTs ? st.tapLetterHitTs[i] : 0;
          let flashAmt = 0;
          if (lastHit > 0) {
            const t = now - lastHit;
            if (t <= TAP_LETTER_VIS.flashUpMs) {
              flashAmt = TAP_LETTER_VIS.flashUpMs > 0
                ? t / Math.max(1, TAP_LETTER_VIS.flashUpMs)
                : 1;
            } else if (t <= TAP_LETTER_VIS.flashUpMs + TAP_LETTER_VIS.flashDownMs) {
              const d = (t - TAP_LETTER_VIS.flashUpMs) / Math.max(1, TAP_LETTER_VIS.flashDownMs);
              flashAmt = 1 - d;
            } else {
              flashAmt = 0;
            }
          }

          let offX = offsetsX ? offsetsX[i] || 0 : 0;
          let offY = offsetsY ? offsetsY[i] || 0 : 0;
          let vx = velX ? velX[i] || 0 : 0;
          let vy = velY ? velY[i] || 0 : 0;

          vx += (-offX) * spring;
          vy += (-offY) * spring;
          vx *= damping;
          vy *= damping;
          offX += vx;
          offY += vy;

          const mag = Math.hypot(offX, offY);
          if (mag > maxOffset && mag > 0) {
            const scale = maxOffset / mag;
            offX *= scale;
            offY *= scale;
          }

          if (offsetsX) offsetsX[i] = offX;
          if (offsetsY) offsetsY[i] = offY;
          if (velX) velX[i] = vx;
          if (velY) velY[i] = vy;

          if (Math.abs(offX) < TAP_LETTER_PHYS.epsilon) offX = 0;
          if (Math.abs(offY) < TAP_LETTER_PHYS.epsilon) offY = 0;

          const opacity = Math.min(1, TAP_LETTER_VIS.opacityBase + TAP_LETTER_VIS.opacityBoost * flashAmt);
          tapLetters[i].style.opacity = `${Math.max(0, opacity)}`;

          if (flashAmt > 0) {
            const boost = 1 + (TAP_LETTER_VIS.flashBoost - 1) * flashAmt;
            tapLetters[i].style.filter = `brightness(${boost.toFixed(3)})`;
            tapLetters[i].style.color = TAP_LETTER_VIS.flashColor;
            tapLetters[i].style.textShadow = TAP_LETTER_VIS.flashShadow;
          } else {
            tapLetters[i].style.filter = 'none';
            tapLetters[i].style.color = '';
            tapLetters[i].style.textShadow = '';
          }

          if (Math.abs(offX) < TAP_LETTER_PHYS.epsilon && Math.abs(offY) < TAP_LETTER_PHYS.epsilon) {
            tapLetters[i].style.transform = 'none';
          } else {
            tapLetters[i].style.transform = `translate3d(${offX.toFixed(2)}px, ${offY.toFixed(2)}px, 0)`;
          }
          if (flashAmt > 0 || Math.abs(offX) >= TAP_LETTER_PHYS.epsilon || Math.abs(offY) >= TAP_LETTER_PHYS.epsilon) {
            tapAnimating = true;
          }
        }
        if (!tapAnimating) {
          const anyHit = Array.isArray(st.tapLetterHitTs) && st.tapLetterHitTs.some(ts => ts > 0);
          tapAnimating = anyHit;
        }
        st.tapPromptAnimating = tapAnimating;
      }
    }
  }
  if (__perfOn) p._mark('loopgrid.domStyleWrites');
  if (__perfOn) p.mark('dom_update_end');

  const fieldRectData = st.tapFieldRect;

  if (__perfOn) p._mark('loopgrid.layout+rects');
  if (__perfOn) p.mark('dom_update_end');

  if (__perfOn) p.mark('layout_update_start_2');
  // Use pre-computed layout values from st
  const cubeSize = st._cubeSize;
  const xOffset = st._xOffset;
  const yOffset = st._yOffset;
  const blockWidthWithGap = st._blockWidthWithGap;
  const localGap = st._localGap;

  // Check for phase wrap to prevent flicker on chain advance
  const phaseJustWrapped = loopInfo && loopInfo.phase01 < st.localLastPhase && st.localLastPhase > 0.9;
  st.localLastPhase = loopInfo ? loopInfo.phase01 : 0;
  const probablyStale = isActiveInChain && phaseJustWrapped;

  // Logical geometry is uniformly projected, so cube bodies remain square.
  const blockSizePx = Math.max(1, Math.round(pxLength(cubeSize)));
  const rowY = Math.round(pxY(yOffset));
  if (__perfOn) p.mark('layout_update_end_2');
  if (__perfOn) p._mark('loopgrid.layout+rects');

  if (phaseJustWrapped) {
    st.tapLoopIndex = (typeof st.tapLoopIndex === 'number' ? st.tapLoopIndex : 0) + 1;
    if (Array.isArray(st.tapLetterLastLoop)) st.tapLetterLastLoop.fill(-1);
  }

  if (__perfOn) p.mark('draw_base_start');
  const gridCache = (st._gridCache ||= { canvas: null, ctx: null, key: '' });
  const layoutKey = [
    w, h, blockSizePx, rowY, xOffset, yOffset, blockWidthWithGap, localGap, isZoomed,
  ].join('|');
  let stepsKey = st._stepsKey || '';
  let noteKey = st._noteKey || '';
  const stepsDirty = !!(
    st._gridDirty ||
    st._lastStepsRef !== steps ||
    st._lastNoteIndicesRef !== noteIndices ||
    st._lastNotePaletteRef !== notePalette ||
    st._lastZoomed !== isZoomed
  );
  if (stepsDirty) {
    stepsKey = Array.isArray(steps) ? steps.map(v => v ? '1' : '0').join('') : '';
    noteKey = isZoomed
      ? `${(noteIndices || []).join(',')}|${(notePalette || []).join(',')}`
      : '';
    st._stepsKey = stepsKey;
    st._noteKey = noteKey;
    st._lastStepsRef = steps;
    st._lastNoteIndicesRef = noteIndices;
    st._lastNotePaletteRef = notePalette;
    st._lastZoomed = isZoomed;
    st._gridDirty = false;
  }
  const cacheKey = `${layoutKey}|${stepsKey}|${noteKey}`;
  const gridCacheDirty = (!gridCache.canvas || gridCache.key !== cacheKey);
  if (gridCacheDirty) {
    const cacheCanvas = gridCache.canvas || document.createElement('canvas');
    cacheCanvas.width = w;
    cacheCanvas.height = h;
    const cacheCtx = cacheCanvas.getContext('2d');
    if (cacheCtx) {
      cacheCtx.setTransform(1, 0, 0, 1, 0, 0);
      cacheCtx.clearRect(0, 0, w, h);
      for (let i = 0; i < NUM_CUBES; i++) {
        const isEnabled = !!steps[i];
        const cubeRectLogical = {
          x: xOffset + i * blockWidthWithGap,
          y: yOffset,
          w: cubeSize,
          h: cubeSize,
        };
        const cubeRect = {
          x: Math.round(pxX(cubeRectLogical.x)),
          y: rowY,
          w: blockSizePx,
          h: blockSizePx,
        };
        const noteMidi = notePalette[noteIndices[i]];
        drawBlock(cacheCtx, cubeRect, {
          baseColor: isEnabled ? '#ff8c00' : '#333',
          active: isEnabled,
          variant: 'button',
          noteLabel: isZoomed ? midiToName(noteMidi) : null,
          showArrows: isZoomed,
        });
      }
    }
    gridCache.canvas = cacheCanvas;
    gridCache.ctx = cacheCtx;
    gridCache.key = cacheKey;
  }

  const debugSettings = st._debugBurstSettings;
  const debugLine = st._debugBurstLine;
  let debugActive = false;
  if (debugSettings?.showIndicator && debugLine) {
    if (renderTime >= debugLine.expire) {
      st._debugBurstLine = null;
    } else {
      debugActive = true;
    }
  }

  const hasBurst = Array.isArray(st.burstParticles) && st.burstParticles.length > 0;
  const playheadActive = (isActiveInChain || !isChained)
    && transportRunning
    && Number.isFinite(playheadCol)
    && !probablyStale;
  const lastDrawCol = (panel.__loopgridLastDrawPlayheadCol ?? -999);
  const playheadChanged = playheadActive && playheadCol !== lastDrawCol;
  const playheadNeedsClear = !playheadActive && lastDrawCol !== -999;
  const hasDrawn = !!panel.__loopgridHasDrawn;
  const needsCanvasUpdate = forceNudge
    || gridCacheDirty
    || hasFlash
    || hasBurst
    || debugActive
    || playheadChanged
    || playheadNeedsClear
    || needsClear
    || chainActiveChanged
    || !hasDrawn;
  if (!needsCanvasUpdate) {
    if (__perfOn) {
      try { window.__PerfFrameProf?.mark?.('loopgrid.render', performance.now() - p._start); } catch {}
    }
    return;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Fast path: overwrite the whole canvas with the cached grid in one blit.
  // This avoids a large clearRect + normal draw, which can be expensive.
  if (gridCache.canvas) {
    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(gridCache.canvas, 0, 0);
    ctx.globalCompositeOperation = prevComp;
  } else {
    // No cache yet: fall back to clearing
    ctx.clearRect(0, 0, w, h);
  }
  if (__perfOn) p.mark('draw_base_end');

  if (__perfOn) p.mark('draw_overlays_start');
  // Draw playhead highlight
  if (playheadActive) {
    const i = playheadCol;
    const cubeRectLogical = {
      x: xOffset + i * blockWidthWithGap,
      y: yOffset,
      w: cubeSize,
      h: cubeSize,
    };
    const cubeRect = {
      x: Math.round(pxX(cubeRectLogical.x)),
      y: rowY,
      w: blockSizePx,
      h: blockSizePx,
    };
    const borderSize = Math.max(1, Math.round(pxLength(4)));
    const playheadSprite = getPlayheadSprite(st, blockSizePx, borderSize, 'rgba(255, 255, 255, 0.4)');
    if (playheadSprite?.canvas) {
      ctx.drawImage(
        playheadSprite.canvas,
        cubeRect.x - borderSize,
        cubeRect.y - borderSize
      );
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(
        cubeRect.x - borderSize,
        cubeRect.y - borderSize,
        cubeRect.w + borderSize * 2,
        cubeRect.h + borderSize * 2
      );
    }

    if (showTapPrompt && fieldRectData && Number.isFinite(fieldRectData.left) && fieldRectData.width > 0 && Array.isArray(st.tapLetterBounds)) {
      const gridRect = st.canvas.getBoundingClientRect();
      if (gridRect.width > 0) {
      const cubeCenterX = cubeRectLogical.x + cubeRectLogical.w / 2;
      const cubeCenterY = cubeRectLogical.y + cubeRectLogical.h / 2;
      const clientViewport = createSimpleRhythmGridViewportSpace({
        left: gridRect.left,
        top: gridRect.top,
        width: gridRect.width,
        height: gridRect.height,
      });
      const columnCenterPx = clientViewport.contentRect.left + cubeCenterX * clientViewport.presentationScale;
      const columnCenterPy = clientViewport.contentRect.top + cubeCenterY * clientViewport.presentationScale;
      const centerNorm = (columnCenterPx - fieldRectData.left) / fieldRectData.width;
      if (Number.isFinite(centerNorm)) {
        const clamped = Math.max(0, Math.min(1, centerNorm));
        triggerTapLettersForColumn(st, i, clamped, columnCenterPx, columnCenterPy);
      }
      }
    }
  }

  // --- Note burst particles: vertical scale from cube center (no movement) ---
  if (Array.isArray(st.burstParticles) && st.burstParticles.length > 0 && ctx) {
    const particles = st.burstParticles;
    const remaining = [];
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const lifeSeconds = p.lifeSeconds || 0.35;
      const decay = lifeSeconds > 0 ? (burstDt / lifeSeconds) : burstDt * 3;
      p.life -= decay;
      if (p.life <= 0) continue; // drop fully faded particles

      remaining.push(p);
    }
    st.burstParticles = remaining;

    if (remaining.length) {
      ctx.save();
      for (const p of remaining) {
        const alpha = Math.max(0, Math.min(1, p.life));
        const cx = pxX(p.x);
        const cy = pxY(p.y);

        const baseR = pxLength(p.size * 0.5);

        // Time progress 0..1 (0 at spawn, 1 at end)
        const tNorm = 1 - p.life;
        // Up-and-down pulse over lifetime
        const pulse = Math.sin(tNorm * Math.PI); // 0 -> 1 -> 0

        const amp = p.amp || 1;
        const stretchY = 1 + amp * pulse; // middle particles have bigger amp

        const sprite = getBurstSprite(st, baseR, p.color);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, stretchY); // vertical scale only
        ctx.globalAlpha = alpha;
        if (sprite?.canvas) {
          ctx.drawImage(sprite.canvas, -sprite.half, -sprite.half, sprite.size, sprite.size);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, baseR, 0, Math.PI * 2);
          ctx.fillStyle = p.color || 'rgba(255, 180, 220, 0.9)';
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // Flash overlays (only for active flashes)
  for (let i = 0; i < NUM_CUBES; i++) {
    const flash = st.flash[i] || 0;
    if (flash <= 0) continue;
    const cubeRectLogical = {
      x: xOffset + i * blockWidthWithGap,
      y: yOffset,
      w: cubeSize,
      h: cubeSize,
    };
    const cubeRect = {
      x: Math.round(pxX(cubeRectLogical.x)),
      y: rowY,
      w: blockSizePx,
      h: blockSizePx,
    };
    ctx.save();
    const scale = 1 + 0.15 * Math.sin(flash * Math.PI);
    ctx.translate(cubeRect.x + cubeRect.w / 2, cubeRect.y + cubeRect.h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-(cubeRect.x + cubeRect.w / 2), -(cubeRect.y + cubeRect.h / 2));
    st.flash[i] = Math.max(0, flash - 0.08);
    drawBlock(ctx, cubeRect, {
      baseColor: '#FFFFFF',
      active: true,
      variant: 'button',
      noteLabel: isZoomed ? midiToName(notePalette[noteIndices[i]]) : null,
      showArrows: isZoomed,
    });
    ctx.restore();
  }

  if (debugActive && debugLine && ctx) {
    const rectX = pxX(debugLine.x);
    const rectY = pxY(debugLine.y);
    const rectW = pxLength(debugLine.size);
    const rectH = pxLength(debugLine.size);
    ctx.save();
    ctx.strokeStyle = debugSettings.lineColor;
    ctx.lineWidth = Math.max(1, debugSettings.lineWidth);
    if (ctx.setLineDash) ctx.setLineDash(debugSettings.lineDash || []);
    ctx.strokeRect(rectX, rectY, rectW, rectH);
    ctx.restore();
  }
  if (__perfOn) p._mark('loopgrid.draw.overlays');

  panel.__loopgridHasDrawn = true;
  panel.__loopgridLastDrawPlayheadCol = playheadActive ? playheadCol : -999;
  
  if (__perfOn) {
    p.mark('end');
    p.measure('loopgrid.visibility+classes', 'start', 'vis_end');
    p.measure('loopgrid.layout+rects', 'layout_start', 'layout_end');
    p.measure('loopgrid.layout+rects', 'layout_update_start', 'layout_update_end');
    p.measure('loopgrid.domStyleWrites', 'dom_start', 'dom_end');
    p.measure('loopgrid.domStyleWrites', 'dom_update_start', 'dom_update_end');
    p.measure('loopgrid.particles', 'particles_start', 'particles_end');
    p.measure('loopgrid.draw.base', 'draw_base_start', 'draw_base_end');
    p.measure('loopgrid.draw.overlays', 'draw_overlays_start', 'draw_overlays_end');
    p.measure('loopgrid.render', 'start', 'end');
  }
}
