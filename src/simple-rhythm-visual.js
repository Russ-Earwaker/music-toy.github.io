// src/simple-rhythm-visual.js
// Renders and handles interaction for the 8-step sequencer cubes.
import { drawBlock, whichThirdRect } from './toyhelpers.js';
import { boardScale } from './board-scale-helpers.js';
import { midiToName } from './note-helpers.js';
import { isRunning, getLoopInfo } from './audio-core.js';
import { createField } from './particles/field-generic.js';
import { createParticleViewport } from './particles/particle-viewport.js';
import { getParticleBudget, getAdaptiveFrameBudget } from './particles/ParticleQuality.js';
import { resizeCanvasForDPR } from './utils.js';
import { overviewMode } from './overview-mode.js';
import { onZoomChange } from './zoom/ZoomCoordinator.js';

// --- sizing helpers ---------------------------------------------------------
function raf() {
  return new Promise(r => requestAnimationFrame(r));
}

/**
 * Wait until the element has a stable, non-zero size.
 * Tries up to maxFrames; bails early when width/height stop changing.
 */
async function waitForStableBox(el, { maxFrames = 6 } = {}) {
  let lastW = -1, lastH = -1;
  for (let i = 0; i < maxFrames; i++) {
    await raf(); // let layout/zoom settle this frame
    const rect = el.getBoundingClientRect();
    const w = Math.round(rect.width), h = Math.round(rect.height);
    if (w > 0 && h > 0 && w === lastW && h === lastH) {
      return { width: w, height: h };
    }
    lastW = w; lastH = h;
  }
  // final read (whatever it is)
  const rect = el.getBoundingClientRect();
  return { width: Math.round(rect.width), height: Math.round(rect.height) };
}

const NUM_CUBES = 8;
const NUM_CUBES_GLOBAL = NUM_CUBES;

// Simple Rhythm cubes: size purely from the local canvas, not boardScale.
// This keeps them stable across zoom levels and lets the global board zoom
// handle visual scaling (just like Bouncer).

const GAP = 4; // A few pixels of space between each cube
const BORDER_MARGIN = 4;

// Simple Rhythm visual tuning: bump cube size slightly so it matches
// Bouncer / Rippler visually. You can tweak this if needed.


// The canvas covers the whole field; CSS defines the geometry via custom properties.
// We read those so JS and CSS share a single source of truth.
function getLoopgridLayout(cssW, cssH, isZoomed, hostEl) {
  const NUM_CUBES = NUM_CUBES_GLOBAL || 8;

  const styles = hostEl ? getComputedStyle(hostEl) : null;
  const cubeSizeCss      = styles ? parseFloat(styles.getPropertyValue('--loopgrid-cube-size'))      : NaN;
  const gapCss           = styles ? parseFloat(styles.getPropertyValue('--loopgrid-gap'))            : NaN;
  const borderUnitsCss   = styles ? parseFloat(styles.getPropertyValue('--loopgrid-border-units'))   : NaN;
  const verticalFactorCss= styles ? parseFloat(styles.getPropertyValue('--loopgrid-vertical-factor')): NaN;

  const baseCubeSize   = Number.isFinite(cubeSizeCss)      ? cubeSizeCss      : 44;
  const baseGap        = Number.isFinite(gapCss)           ? gapCss           : 4;
  const borderUnits    = Number.isFinite(borderUnitsCss)   ? borderUnitsCss   : 1;
  const verticalFactor = Number.isFinite(verticalFactorCss)? verticalFactorCss: 3;

  // Let CSS fully control cube size so borders line up exactly.
  const cubeSize = baseCubeSize;

  // Slightly tighter gaps when zoomed to avoid visual crowding.
  const localGap       = isZoomed ? Math.max(1, baseGap * 0.5) : baseGap;
  const totalGapWidth  = localGap * (NUM_CUBES - 1);
  const blockWidthWithGap = cubeSize + localGap;

  // horizontal border in “cube units”
  const xOffset = borderUnits * cubeSize;

  // top + row + bottom = verticalFactor cubes
  const totalHeight = verticalFactor * cubeSize;
  const yOffset     = (totalHeight - cubeSize) / 2;

  return {
    cubeSize,
    localGap,
    totalGapWidth,
    blockWidthWithGap,
    xOffset,
    yOffset,
  };
}

function ensureTapLetters(label) {
  if (!label) return [];
  let spans = Array.from(label.querySelectorAll('.loopgrid-tap-letter-char'));
  if (spans.length !== 3) {
    label.textContent = '';
    for (const ch of 'TAP') {
      const span = document.createElement('span');
      span.className = 'loopgrid-tap-letter-char';
      span.textContent = ch;
      label.appendChild(span);
    }
    spans = Array.from(label.querySelectorAll('.loopgrid-tap-letter-char'));
  }
  return spans;
}

function triggerTapLettersForColumn(state, columnIndex, centerNorm, cubeCenterX, cubeCenterY) {
  const bounds = state.tapLetterBounds;
  const flashes = state.tapLetterFlash;
  const lastLoop = state.tapLetterLastLoop;
  const velX = state.tapLetterVelocityX;
  const velY = state.tapLetterVelocityY;
  const loopIndex = typeof state.tapLoopIndex === 'number' ? state.tapLoopIndex : 0;
  if (!Array.isArray(bounds) || !Array.isArray(flashes) || !Array.isArray(lastLoop)) return;
  for (let i = 0; i < bounds.length; i++) {
    const bound = bounds[i];
    if (!bound) continue;
    if (centerNorm < bound.start || centerNorm > bound.end) continue;
    if (lastLoop[i] === loopIndex) continue;
    flashes[i] = 1;
    lastLoop[i] = loopIndex;
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

function chainHasSequencedNotes(head) {
  let current = head;
  let sanity = 100;
  while (current && sanity-- > 0) {
    const toyType = current.dataset?.toy;
    if (toyType === 'loopgrid' || toyType === 'loopgrid-drum') {
      const state = current.__gridState;
      if (state?.steps && state.steps.some(Boolean)) return true;
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

/**
 * Attaches the visual renderer to a grid toy panel.
 * This is called by grid-core.js after the panel's DOM is created.
 */
function cssRect(el) {
  if (!el) return { width: 0, height: 0 };
  const r = el.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(r.width)),
    height: Math.max(1, Math.round(r.height)),
  };
}

export async function attachSimpleRhythmVisual(panel) { // Made async
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
    particleObserver: null,
    lastParticleTick: performance.now(),
    fieldWidth: 0,
    fieldHeight: 0,
    flash: new Float32Array(NUM_CUBES),
    bgFlash: 0,
    localLastPhase: 0,
    tapLabel: null, // Will be set later
    tapLetters: [],
    tapLetterFlash: [],
    tapLetterLastLoop: [],
    tapLetterBounds: null,
    tapLetterOffsetX: [],
    tapLetterOffsetY: [],
    tapLetterVelocityX: [],
    tapLetterVelocityY: [],
    tapFieldRect: null,
    tapPromptVisible: false,
    tapLoopIndex: 0,
    _resizer: null,
    _debugBurstSettings: null,
    _debugBurstLine: null,
    burstParticles: [],
    burstConfig: {
      particleCount: 16,
      lifeSeconds: 0.35,
      ampScalar: 30.0,              // overall height of the “bars”
      pixelSize: 6,                // base radius in CSS units (≈2–3px on screen)
      color: 'rgba(242, 170, 36, 1)',
    },
    _burstLastTime: performance.now(),
    computeLayout: (w, h) => {
      resizeCanvasForDPR(st.canvas, w, h);
      st._cssW = w;
      st._cssH = h;
      const cssW = w;
      const cssH = h;

      const isZoomed = panel.classList.contains('toy-zoomed');

      // Cube size is derived purely from the local canvas size.
      // Zoom is applied globally via board-viewport, not here.
      const layout = getLoopgridLayout(cssW, cssH, isZoomed, sequencerWrap || panel);
      const { cubeSize, xOffset, yOffset, blockWidthWithGap, localGap } = layout;

      st._cubeSize = cubeSize;
      st._xOffset = xOffset;
      st._yOffset = yOffset;
      st._blockWidthWithGap = blockWidthWithGap;
      st._localGap = localGap;

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
  panel.__simpleRhythmVisualState = st; // Assign st to panel here

  st._resizer?.disconnect?.(); // in case of re-init

  // 1) Defer the first layout until the box is real & stable
  const box = await waitForStableBox(targetEl);
  st.computeLayout(box.width, box.height);

  // 2) Re-layout on container size changes
  st._resizer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const cr = entry.contentRect;
      const w = Math.round(cr.width), h = Math.round(cr.height);
      if (w > 0 && h > 0) {
        st.computeLayout(w, h);
      }
    }
  });
  st._resizer.observe(targetEl);

  // 3) Re-layout on zoom settle (hook whatever you already have)
  panel.zoom?.on?.('end', () => {
    const rect = targetEl.getBoundingClientRect();
    st.computeLayout(Math.round(rect.width), Math.round(rect.height));
  });

  panel.zoom?.on?.('tick', () => {
    const rect = targetEl.getBoundingClientRect();
    st.computeLayout(Math.round(rect.width), Math.round(rect.height));
  });

  // --- Particle Canvas Setup (moved after st definition) ---
  let particleCanvas = panel.querySelector('.toy-particles');
  if (!particleCanvas && sequencerWrap) {
    particleCanvas = document.createElement('canvas');
    particleCanvas.className = 'toy-particles';
    sequencerWrap.insertBefore(particleCanvas, sequencerWrap.firstChild || null);
    Object.assign(particleCanvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '1',
    });
  }
  st.particleCanvas = particleCanvas; // Assign to st

  let particleField = null;
  let particleObserver = null;
  let overviewHandler = null;
  let zoomUnsubscribe = null;
  const pv = createParticleViewport(() => {
    const host = sequencerWrap || panel;
    const r = host?.getBoundingClientRect?.();
    return {
      w: Math.max(1, Math.round(r?.width || 1)),
      h: Math.max(1, Math.round(r?.height || 1)),
    };
  });
  // Make the Simple Rhythm particle viewport zoom-aware, like DrawGrid's.
  Object.assign(pv, {
    getZoom: () => {
      try {
        const host = sequencerWrap || panel;
        const raw = boardScale(host);
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : 1;
      } catch {
        return 1;
      }
    },
    isOverview: () => {
      try {
        return !!overviewMode?.isActive?.();
      } catch {
        return false;
      }
    },
  });
  if (particleCanvas) {
    try {
      const pausedRef = () => !isRunning();
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

      // Base cap chosen for a "nice" look on fast machines, but scaled down on lower tiers.
      const BASE_CAP = 2200;
      const capScale = Math.max(0.15, (budget.maxCountScale ?? 1) * (budget.capScale ?? 1));
      const cap = Math.max(140, Math.floor(BASE_CAP * capScale));

      // On lower quality tiers, shorten the "trail" slightly so motion feels lighter.
      const baseReturnSeconds = 1.0;
      const extraReturnSeconds = 0.7 * (budget.spawnScale ?? 1);
      const returnSeconds = baseReturnSeconds + extraReturnSeconds;

      particleField = createField(
        { canvas: particleCanvas, viewport: pv, pausedRef, debugLabel: 'simple-rhythm-particles' },
        {
          seed: panelSeed,
          cap,
          returnSeconds,
          forceMul: 1.0,
          noise: 0,
          kick: 0,
          kickDecay: 8.0,
          drawMode: 'dots',
          minAlpha: 0.25,
          maxAlpha: 0.85,
          // IMPORTANT: let particles actually respond to pushes
          staticMode: false,
        }
      );
      particleField.resize();
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
      // Keep fields visible; rely on budget scaling instead of hiding.
      // ... ResizeObserver / overview handler follows as before
      if (typeof ResizeObserver !== 'undefined') {
        particleObserver = new ResizeObserver(() => {
          pv.refreshSize({ snap: true });
          particleField.resize();
        });
        particleObserver.observe(sequencerWrap || panel);
      }
      overviewHandler = () => {
        pv.setNonReactive?.(true);
        pv.refreshSize({ snap: true });
        particleField.resize();
        pv.setNonReactive?.(false);
      };
      window.addEventListener('overview:transition', overviewHandler);

      // NEW: keep the particle viewport in sync with board zoom commits
      if (typeof onZoomChange === 'function') {
        const zoomHandler = (z = {}) => {
          const phase = z.phase;
          const mode = z.mode;
          const gesturing = mode === 'gesturing';

          // Don't thrash during the live gesture; just react when it settles.
          if (!gesturing && (phase === 'commit' || phase === 'idle' || phase === 'done')) {
            try {
              pv.refreshSize?.({ snap: true });
              particleField.resize?.();
            } catch {
              // ignore
            }
          }
        };
        zoomHandler.__zcName = 'simple-rhythm-visual';
        zoomUnsubscribe = onZoomChange(zoomHandler);
      }
    } catch (err) {
      console.warn('[loopgrid] particle field init failed', err);
      particleField = null;
      particleObserver = null;
    }
  }
  st.particleField = particleField; // Assign to st
  st.particleObserver = particleObserver; // Assign to st

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

    const cssW = st._cssW || (sequencerWrap?.clientWidth || canvas.clientWidth || 0);
    const cssH = st._cssH || (sequencerWrap?.clientHeight || canvas.clientHeight || 0);
    if (!cssW || !cssH) return;

    const cubeSize = st._cubeSize;
    const xOffset = st._xOffset;
    const yOffset = st._yOffset;
    const blockWidthWithGap = st._blockWidthWithGap;
    if (!Number.isFinite(cubeSize) || cubeSize <= 0) return;

    const numCubes = NUM_CUBES_GLOBAL || NUM_CUBES || 8;
    const col = Math.max(0, Math.min(numCubes - 1, (colIndex | 0)));

    const cubeXCss = xOffset + col * blockWidthWithGap;
    const cubeYCss = yOffset;
    const cubeCenterCssX = cubeXCss + cubeSize * 0.5;
    const cubeCenterCssY = cubeYCss + cubeSize * 0.5;

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
      const x = cubeCenterCssX + (t - 0.5) * cubeSize;
      const y = cubeCenterCssY;

      // Arrow shape: middle "bar" scales most, edges least (purely deterministic)
      const centerDist = Math.abs(i - midIndex) / (midIndex || 1); // 0 at center, 1 at ends
      const centerBias = 1 - centerDist;                            // 1 at center, 0 at ends
      const amp = (0.4 + 0.8 * centerBias) * ampScalar;            // keep edges from being completely flat

      st.burstParticles.push({
        x,
        y,
        life: 1,
        lifeSeconds,
        size: pixelSize, // base radius in CSS units
        color,
        amp,             // vertical scale amplitude
        born: now,
      });
    }

    if (debug?.logPush) {
      console.debug('[loopgrid] particle burst', {
        col,
        cubeCenterCssX,
        cubeCenterCssY,
        count,
        lifeSeconds,
        ampScalar,
      });
    }

    if (debug?.showIndicator) {
      const duration = Number.isFinite(debug.lineDuration) ? debug.lineDuration : 300;
      st._debugBurstLine = {
        x: cubeXCss,
        y: cubeYCss,
        size: cubeSize,
        expire: now + duration,
      };
    }
  };

  let tapLabel = sequencerWrap ? sequencerWrap.querySelector('.loopgrid-tap-label') : null;
  if (!tapLabel && sequencerWrap) {
    tapLabel = document.createElement('div');
    tapLabel.className = 'toy-action-label loopgrid-tap-label';
    tapLabel.style.lineHeight = '1';
    tapLabel.style.whiteSpace = 'nowrap';
    tapLabel.style.transition = 'none';
    sequencerWrap.appendChild(tapLabel);
  }
  st.tapLabel = tapLabel; // Assign to st
  st.tapLetters = ensureTapLetters(tapLabel); // Assign to st

  const teardownParticles = () => {
    try { window.removeEventListener('overview:transition', overviewHandler); } catch {}
    try { zoomUnsubscribe?.(); } catch {}       // NEW: stop listening to zoom events
    try { st.particleObserver?.disconnect?.(); } catch {} // Use st.particleObserver
    try { st.particleField?.destroy?.(); } catch {} // Use st.particleField
    st._resizer?.disconnect?.(); // Disconnect the main resizer
  };
  panel.addEventListener('toy:remove', teardownParticles, { once: true });

  // Listen for clicks on the canvas to toggle steps or change notes
  canvas.addEventListener('pointerdown', (e) => {
    const st = panel.__simpleRhythmVisualState;
    if (!st) return;

    const rawRect = canvas.getBoundingClientRect();
    const rawW = Math.max(1, rawRect.width);
    const rawH = Math.max(1, rawRect.height);

    // Use the same CSS-space dimensions that render/computeLayout use
    const cssW = Math.max(1, st._cssW || Math.round(rawW));
    const cssH = Math.max(1, st._cssH || Math.round(rawH));
    if (!cssW || !cssH) return;

    const pointer = {
      x: e.clientX - rawRect.left,
      y: e.clientY - rawRect.top,
    };

    // Layout values as computed by computeLayout / getLoopgridLayout
    const cubeSize        = st._cubeSize;
    const xOffset         = st._xOffset;
    const yOffset         = st._yOffset;
    const blockWidthWithGap = st._blockWidthWithGap;

    if (!Number.isFinite(cubeSize) || !Number.isFinite(blockWidthWithGap) || !Number.isFinite(xOffset)) {
      return;
    }
    if (blockWidthWithGap <= 0 || cubeSize <= 0) return;

    // Convert pointer.x from canvas pixel space into the same CSS-space
    // used for layout (they should usually match, but guard against drift).
    const scaleX = cssW / rawW;
    const gridX = pointer.x * scaleX;

    // Remove the left border (1 cube of safe-zone)
    const relX = gridX - xOffset;
    if (relX < 0) return;

    const clickedIndex = Math.floor(relX / blockWidthWithGap);
    if (clickedIndex < 0 || clickedIndex >= NUM_CUBES) return;

    const xInBlock = relX - clickedIndex * blockWidthWithGap;

    // Ignore clicks that land in the gap rather than inside the cube.
    if (xInBlock < 0 || xInBlock >= cubeSize) return;

    const state = panel.__gridState;
    if (!state?.noteIndices || !state?.steps) return;

    // Build cube rect in CSS-space (not pixels), to match layout.
    const cubeRectCss = {
      x: xOffset + clickedIndex * blockWidthWithGap,
      y: yOffset,
      w: cubeSize,
      h: cubeSize,
    };

    // For whichThirdRect we still feed pointer.y in canvas space, but that
    // only cares about vertical thirds and we kept the same yOffset logic.
    const third = whichThirdRect(
      {
        x: cubeRectCss.x,
        y: cubeRectCss.y,
        w: cubeRectCss.w,
        h: cubeRectCss.h,
      },
      pointer.y
    );

    const isZoomed = panel.classList.contains('toy-zoomed');
    let mutated = false;

    if (isZoomed && third === 'up') {
      const curIx = (state.noteIndices[clickedIndex] | 0);
      const max = state.notePalette.length | 0;
      state.noteIndices[clickedIndex] = max ? ((curIx + 1) % max) : curIx;
      panel.dispatchEvent(new CustomEvent('grid:notechange', {
        detail: { col: clickedIndex },
      }));
      mutated = true;
    } else if (isZoomed && third === 'down') {
      const curIx = (state.noteIndices[clickedIndex] | 0);
      const max = state.notePalette.length | 0;
      state.noteIndices[clickedIndex] = max ? ((curIx - 1 + max) % max) : curIx;
      panel.dispatchEvent(new CustomEvent('grid:notechange', {
        detail: { col: clickedIndex },
      }));
      mutated = true;
    } else {
      state.steps[clickedIndex] = !state.steps[clickedIndex];
      mutated = true;
    }

    if (mutated) {
      try {
        panel.dispatchEvent(new CustomEvent('loopgrid:update', {
          detail: {
            reason: isZoomed ? 'note-change' : 'step-toggle',
            col: clickedIndex,
            steps: Array.isArray(state.steps) ? Array.from(state.steps) : undefined,
            noteIndices: Array.isArray(state.noteIndices) ? Array.from(state.noteIndices) : undefined,
          },
        }));
      } catch {}
    }
  });

  // Start the render loop
  if (!panel.__simpleRhythmRenderLoop) {
    const renderLoop = () => {
      if (!panel.isConnected) return; // Stop rendering if panel is removed
      render(panel);
      panel.__simpleRhythmRenderLoop = requestAnimationFrame(renderLoop);
    };
    renderLoop();
  }
}

function render(panel) {
  const st = panel.__simpleRhythmVisualState;
  if (!st) return;

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

  // Set playing class for border highlight
  const state = panel.__gridState || {};
  // A toy is only active in a chain if the scheduler has explicitly set this to 'true'.
  // Checking for `!== 'false'` incorrectly defaults to true when the attribute is missing.
  const isActiveInChain = panel.dataset.chainActive === 'true';
  const isChained = !!(panel.dataset.nextToyId || panel.dataset.prevToyId);
  const hasActiveNotes = state.steps && state.steps.some(s => s);

  const head = isChained ? findChainHead(panel) : panel;
  const chainHasNotes = head ? chainHasSequencedNotes(head) : hasActiveNotes;

  const transportRunning = isRunning();
  let showPlaying;
  if (transportRunning) {
    // A chained toy only shows its highlight if the chain itself currently has notes.
    // For standalone toys, only show highlight if there are notes to play.
    showPlaying = isChained ? (isActiveInChain && chainHasNotes) : hasActiveNotes;
  } else {
    // When paused, highlight chained toys only if the chain retains any active notes.
    showPlaying = isChained ? chainHasNotes : hasActiveNotes;
  }
  panel.classList.toggle('toy-playing', showPlaying);

  const { ctx, canvas, tapLabel, particleCanvas, sequencerWrap, particleField } = st;
  const w = canvas.width;
  const h = canvas.height;
  const cssW = st._cssW || canvas.clientWidth;
  const cssH = st._cssH || canvas.clientHeight;
  const renderTime = performance.now();

  const adaptiveBudget = (() => {
    try { return getAdaptiveFrameBudget(); } catch { return null; }
  })();
  const particleBudget = adaptiveBudget?.particleBudget;
  const isUnfocused = panel.classList?.contains('toy-unfocused');
  const allowField = particleBudget?.allowField !== false && !isUnfocused;
  if (particleField) {
    try {
      if (particleBudget && typeof particleField.applyBudget === 'function') {
        const maxCountScale = Math.max(0.15, (particleBudget.maxCountScale ?? 1) * (particleBudget.capScale ?? 1));
        particleField.applyBudget({
          maxCountScale,
          capScale: particleBudget.capScale ?? 1,
          tickModulo: particleBudget.tickModulo ?? 1,
          sizeScale: particleBudget.sizeScale ?? 1,
        });
      }
    } catch {}
    if (allowField) {
      if (!Number.isFinite(st.lastParticleTick)) st.lastParticleTick = renderTime;
      const dt = Math.min(0.05, Math.max(0, (renderTime - st.lastParticleTick) / 1000));
      st.lastParticleTick = renderTime;
      try { particleField.tick(dt || (1 / 60)); } catch {}
    } else {
      st.lastParticleTick = renderTime;
    }
  }

  if (!Number.isFinite(st._burstLastTime)) st._burstLastTime = renderTime;
  const burstDt = Math.min(0.05, Math.max(0, (renderTime - st._burstLastTime) / 1000));
  st._burstLastTime = renderTime;

  if (!cssW || !cssH || !w || !h) return;

  const scaleX = cssW ? (w / cssW) : 1;
  const scaleY = cssH ? (h / cssH) : 1;
  const pxX = (value) => value * scaleX;
  const pxY = (value) => value * scaleY;

  if (!st._loggedScaleOnce) {
    st._loggedScaleOnce = true;
  }

  // Use a uniform pixel size for cubes so they stay visually square,
  // even if scaleX and scaleY differ slightly.
  const cubePixelSize = Math.round(st._cubeSize * scaleX);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const debugSettings = st._debugBurstSettings;
  const debugLine = st._debugBurstLine;
  if (debugSettings?.showIndicator && debugLine) {
    if (renderTime >= debugLine.expire) {
      st._debugBurstLine = null;
    } else if (ctx) {
      const rectX = debugLine.x * scaleX;
      const rectY = debugLine.y * scaleY;
      const rectW = debugLine.size * scaleX;
      const rectH = debugLine.size * scaleY;
      ctx.save();
      ctx.strokeStyle = debugSettings.lineColor;
      ctx.lineWidth = Math.max(1, debugSettings.lineWidth);
      if (ctx.setLineDash) ctx.setLineDash(debugSettings.lineDash || []);
      ctx.strokeRect(rectX, rectY, rectW, rectH);
      ctx.restore();
    }
  }

  // --- Note burst particles: vertical scale from cube center (no movement) ---
  if (Array.isArray(st.burstParticles) && st.burstParticles.length && ctx) {
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
        const cx = p.x * scaleX;
        const cy = p.y * scaleY;

        // Base radius in pixels from CSS-space size
        const baseR = (p.size * 0.5) * ((scaleX + scaleY) * 0.5 || 1);

        // Time progress 0..1 (0 at spawn, 1 at end)
        const tNorm = 1 - p.life;
        // Up-and-down pulse over lifetime
        const pulse = Math.sin(tNorm * Math.PI); // 0 -> 1 -> 0

        const amp = p.amp || 1;
        const stretchY = 1 + amp * pulse; // middle particles have bigger amp

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, stretchY); // vertical scale only
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(0, 0, baseR, 0, Math.PI * 2);
        ctx.fillStyle = p.color || 'rgba(255, 180, 220, 0.9)';
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  const loopInfo = getLoopInfo();
  const playheadCol = loopInfo ? Math.floor(loopInfo.phase01 * NUM_CUBES) : -1;

  const fieldHost = sequencerWrap || particleCanvas || canvas;
  if (fieldHost) {
    const rect = cssRect(fieldHost);
    st.fieldWidth = rect.width || cssW;
    st.fieldHeight = rect.height || cssH;
  } else {
    st.fieldWidth = cssW;
    st.fieldHeight = cssH;
  }

  /* Map for cubes uses the grid canvas size */
  const map = {
    n2x: (n) => n * w,
    n2y: (n) => n * h,
    scale: () => Math.min(w, h) / 420,
  };

  const steps = state.steps || [];
  const noteIndices = state.noteIndices || [];
  const notePalette = state.notePalette || [];
  const isZoomed = panel.classList.contains('toy-zoomed');

  const particleFieldW = st.fieldWidth || cssW;
  const particleFieldH = st.fieldHeight || cssH;

  const showTapPrompt = !hasActiveNotes;
  if (tapLabel && st.tapLetters?.length) {
    const tapLetters = st.tapLetters;
    const letterCount = tapLetters.length;
    if (!Array.isArray(st.tapLetterFlash) || st.tapLetterFlash.length !== letterCount) {
      st.tapLetterFlash = Array.from({ length: letterCount }, () => 0);
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
      tapLabel.style.opacity = '0';
      st.tapLetterBounds = null;
      st.tapFieldRect = null;
      st.tapPromptVisible = false;
      st.tapLoopIndex = 0;
      if (Array.isArray(st.tapLetterLastLoop)) st.tapLetterLastLoop.fill(-1);
      for (let i = 0; i < letterCount; i++) {
        st.tapLetterFlash[i] = 0;
        if (st.tapLetterOffsetX) st.tapLetterOffsetX[i] = 0;
        if (st.tapLetterOffsetY) st.tapLetterOffsetY[i] = 0;
        if (st.tapLetterVelocityX) st.tapLetterVelocityX[i] = 0;
        if (st.tapLetterVelocityY) st.tapLetterVelocityY[i] = 0;
        tapLetters[i].style.color = 'rgba(80, 120, 180, 0)';
        tapLetters[i].style.textShadow = 'none';
        tapLetters[i].style.transform = 'none';
      }
    } else {
      st.tapPromptVisible = true;
      tapLabel.style.opacity = '1';
      const fieldElement = particleCanvas || tapLabel;
      let fieldRect = null;
      try { fieldRect = fieldElement.getBoundingClientRect(); } catch {}
      if (fieldRect && fieldRect.width > 0) {
        const s = Math.max(0.001, Number(boardScale(panel)) || 1);
        // Use the unscaled field size so the label stays a constant
        // fraction of its frame regardless of zoom.
        const rawH = (fieldRect.height || fieldRect.width) / s;
        const rawW = (fieldRect.width) / s;
        const heightBased = rawH / 3.0;
        const widthBased  = rawW / 2.4;
        const labelSize = Math.max(24, Math.min(heightBased, widthBased) * 2.5);
        tapLabel.style.fontSize = `${Math.round(labelSize)}px`;
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
        const heightBased = particleFieldH / 3.0;
        const widthBased  = particleFieldW / 2.4;
        const fallbackSize = Math.max(24, Math.min(heightBased, widthBased));
        tapLabel.style.fontSize = `${Math.round(fallbackSize)}px`;
      }

      const offsetsX = st.tapLetterOffsetX;
      const offsetsY = st.tapLetterOffsetY;
      const velX = st.tapLetterVelocityX;
      const velY = st.tapLetterVelocityY;
      const spring = 0.14;
      const damping = 0.82;
      const maxOffset = 26;
      for (let i = 0; i < letterCount; i++) {
        let activeFlash = st.tapLetterFlash[i] || 0;
        activeFlash = Math.max(0, activeFlash * 0.86 - 0.02);
        st.tapLetterFlash[i] = activeFlash;

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

        const baseAlpha = 0.3;
        const finalAlpha = Math.max(baseAlpha, Math.min(1, baseAlpha + activeFlash * 0.75));
        tapLetters[i].style.color = `rgba(80, 120, 180, ${finalAlpha})`;

        if (activeFlash > 0) {
          const glowRadius = 100 + activeFlash * 24;
          const glowAlpha = 0.25 + activeFlash * 0.45;
          tapLetters[i].style.textShadow = `0 0 ${glowRadius.toFixed(0)}px rgba(150, 190, 255, ${glowAlpha.toFixed(2)})`;
        } else {
          tapLetters[i].style.textShadow = 'none';
        }

        if (Math.abs(offX) < 0.02 && Math.abs(offY) < 0.02) {
          tapLetters[i].style.transform = 'none';
        } else {
          tapLetters[i].style.transform = `translate(${offX.toFixed(2)}px, ${offY.toFixed(2)}px)`;
        }
      }
    }
  }

  const gridRect = st.canvas.getBoundingClientRect();
  const fieldRectData = st.tapFieldRect;

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

  // --- Cube pixel sizing (make them square on screen) ----------------------
  // Convert 1 "cubeSize" CSS unit into pixels along X and Y.
  // Using the smaller of the two guarantees a square in screen space even
  // if the canvas has non-uniform scaling.
  const sizePxX = pxX(cubeSize);
  const sizePxY = pxY(cubeSize);

  // Base square size in pixels from layout: use the smaller axis so cubes stay square
  // and always fit inside their logical CSS cell.
  const rawBlockPx = Math.max(1, Math.min(sizePxX, sizePxY));
  const blockSizePx = Math.round(rawBlockPx);

  // Vertical position: use the CSS-space yOffset (1 cube of buffer) in pixels.
  const rowY = Math.round(pxY(yOffset));

  if (phaseJustWrapped) {
    st.tapLoopIndex = (typeof st.tapLoopIndex === 'number' ? st.tapLoopIndex : 0) + 1;
    if (Array.isArray(st.tapLetterLastLoop)) st.tapLetterLastLoop.fill(-1);
  }

  for (let i = 0; i < NUM_CUBES; i++) {
    const flash = st.flash[i] || 0;
    const isEnabled = !!steps[i];

    // CSS-space position using our layout (1-cube buffers and gap)
    const cubeRectCss = {
      x: xOffset + i * blockWidthWithGap,
      y: yOffset,
      w: cubeSize,
      h: cubeSize,
    };

    // Final on-screen rectangle in pixel space:
    // - position derived from CSS-space layout
    // - size forced square using blockSizePx
    const cubeRect = {
      x: Math.round(pxX(cubeRectCss.x)),
      y: rowY,
      w: blockSizePx,
      h: blockSizePx,
    };

    if (!st._loggedCubeOnce && i === 0) {
      st._loggedCubeOnce = true;
    }

    // Draw playhead highlight first, so it's underneath the cube
    // The playhead should scroll if the toy is standalone, or if it's the active toy in a chain.
    if ((isActiveInChain || !isChained) && transportRunning && i === playheadCol && !probablyStale) {
      const borderSize = 4;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(
        cubeRect.x - borderSize,
        cubeRect.y - borderSize,
        cubeRect.w + borderSize * 2,
        cubeRect.h + borderSize * 2
      );
      if (showTapPrompt && fieldRectData && Number.isFinite(fieldRectData.left) && fieldRectData.width > 0 && gridRect.width > 0 && Array.isArray(st.tapLetterBounds)) {
        // Map the CSS-space center of this cube into the field for TAP letters.
        const cubeCenterCssX = cubeRectCss.x + cubeRectCss.w / 2;
        const cubeCenterCssY = cubeRectCss.y + cubeRectCss.h / 2;
        const columnCenterPx = gridRect.left + (cubeCenterCssX / cssW) * gridRect.width;
        const columnCenterPy = gridRect.top + (cubeCenterCssY / cssH) * gridRect.height;
        const centerNorm = (columnCenterPx - fieldRectData.left) / fieldRectData.width;
        if (Number.isFinite(centerNorm)) {
          const clamped = Math.max(0, Math.min(1, centerNorm));
          triggerTapLettersForColumn(st, i, clamped, columnCenterPx, columnCenterPy);
        }
      }
    }

    ctx.save();
    if (flash > 0) {
      const scale = 1 + 0.15 * Math.sin(flash * Math.PI);
      ctx.translate(cubeRect.x + cubeRect.w / 2, cubeRect.y + cubeRect.h / 2);
      ctx.scale(scale, scale);
      ctx.translate(-(cubeRect.x + cubeRect.w / 2), -(cubeRect.y + cubeRect.h / 2));
      st.flash[i] = Math.max(0, flash - 0.08);
    }

    const noteMidi = notePalette[noteIndices[i]];
    drawBlock(ctx, cubeRect, {
      baseColor: flash > 0.01 ? '#FFFFFF' : (isEnabled ? '#ff8c00' : '#333'),
      active: flash > 0.01 || isEnabled,
      variant: 'button',
      noteLabel: isZoomed ? midiToName(noteMidi) : null,
      showArrows: isZoomed,
    });
    ctx.restore();
  }
}
