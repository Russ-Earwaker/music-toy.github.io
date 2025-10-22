// src/drum-tiles-visual.js
// Renders and handles interaction for the 8-step sequencer cubes.
import { drawBlock, whichThirdRect } from './toyhelpers.js';
import { midiToName } from './note-helpers.js';
import { isRunning, getLoopInfo } from './audio-core.js';
import { initLoopgridParticles, drawGridParticles, LOOPGRID_BASE_PARTICLE_COUNT } from './grid-particles.js';

const NUM_CUBES = 8;


const GAP = 4; // A few pixels of space between each cube

function retargetLoopgridParticleCount(st, pw, ph) {
  // Baseline: tuned so a standard Simple Rhythm canvas (roughly Rippler sized)
  // lands near the Rippler particle budget. Scale with field width/height so
  // zooming keeps density roughly consistent.
  const cube = Math.max(1, ph / 3); // 3*cube = field height
  const gap = 4;                     // loopgrid gap
  const baselineCube = 72;
  const innerW = (NUM_CUBES * cube) + ((NUM_CUBES - 1) * gap);
  const fieldW = innerW + cube;                    // you extend half a cube on both sides => +1 cube total
  const baselineInnerW = (NUM_CUBES * baselineCube) + ((NUM_CUBES - 1) * gap);
  const baselineFieldW = baselineInnerW + baselineCube;
  const heightScale = (ph / (2 * baselineCube));   // 3× vs 2× baseline => 1.5x
  const widthScale  = (pw / baselineFieldW);       // proportional width scale
  const target = Math.max(96, Math.round(LOOPGRID_BASE_PARTICLE_COUNT * heightScale * widthScale));
  const current = st.particles.length;
  if (current === target) return;
  if (current < target) {
    // add more
    st.particles.push(...st.particles.slice(0, Math.min(current, target - current)).map(p => ({...p})));
    while (st.particles.length < target) st.particles.push({ nx: Math.random(), ny: Math.random(), sx:null, sy:null, vx:0, vy:0, flash:0 });
  } else {
    // trim
    st.particles.length = target;
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
export function attachDrumVisuals(panel) {
  if (!panel || panel.__drumVisualAttached) return;
  panel.__drumVisualAttached = true;

  const sequencerWrap = panel.querySelector('.sequencer-wrap');
  const canvas = sequencerWrap ? sequencerWrap.querySelector('canvas') : null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  /* NEW: particle canvas/context */
  const particleCanvas = panel.querySelector('.particle-canvas');
  const pctx = particleCanvas ? particleCanvas.getContext('2d') : null;

  let tapLabel = sequencerWrap ? sequencerWrap.querySelector('.loopgrid-tap-label') : null;
  if (!tapLabel && sequencerWrap) {
    tapLabel = document.createElement('div');
    tapLabel.className = 'toy-action-label loopgrid-tap-label';
    tapLabel.textContent = 'TAP';
    sequencerWrap.appendChild(tapLabel);
  }

  const st = {
    panel,
    canvas,
    ctx,
    particleCanvas,
    pctx,
    flash: new Float32Array(NUM_CUBES),
    bgFlash: 0,
    localLastPhase: 0,
    particles: initLoopgridParticles(LOOPGRID_BASE_PARTICLE_COUNT),
    tapLabel,
    tapLabelFlash: 0,
    tapLastPulseCol: -1,
  };
  panel.__drumVisualState = st;

  // Listen for clicks on the canvas to toggle steps or change notes
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasP = { x: p.x * scaleX, y: p.y * scaleY };

    const localGap = panel.classList.contains('toy-zoomed') ? 2 : GAP;
    const totalGapWidth = localGap * (NUM_CUBES - 1);
    const cubeSize = (canvas.width - totalGapWidth) / NUM_CUBES;
    const blockWidthWithGap = cubeSize + localGap;

    const clickedIndex = Math.floor(canvasP.x / blockWidthWithGap);
    const xInBlock = canvasP.x % blockWidthWithGap;

    if (xInBlock < cubeSize) { // Ensure the click is on the cube, not the gap
      if (clickedIndex >= 0 && clickedIndex < NUM_CUBES) {
        const state = panel.__gridState;
        if (!state?.noteIndices || !state?.steps) return;

        const yOffset = (canvas.height - cubeSize) / 2;
        const cubeRect = { x: clickedIndex * blockWidthWithGap, y: yOffset, w: cubeSize, h: cubeSize };
        const third = whichThirdRect(cubeRect, canvasP.y);
        const isZoomed = panel.classList.contains('toy-zoomed');

        let mutated = false;

        if (isZoomed && third === 'up') {
          // Increment the selected step's note index in the palette
          const curIx = (state.noteIndices[clickedIndex] | 0);
          const max = state.notePalette.length | 0;
          state.noteIndices[clickedIndex] = max ? ((curIx + 1) % max) : curIx;
          // Preview the new note without triggering the cube flash animation
          panel.dispatchEvent(new CustomEvent('grid:notechange', { detail: { col: clickedIndex } }));
          mutated = true;
        } else if (isZoomed && third === 'down') {
          // Decrement the selected step's note index in the palette
          const curIx = (state.noteIndices[clickedIndex] | 0);
          const max = state.notePalette.length | 0;
          state.noteIndices[clickedIndex] = max ? ((curIx - 1 + max) % max) : curIx;
          // Preview the new note without triggering the cube flash animation
          panel.dispatchEvent(new CustomEvent('grid:notechange', { detail: { col: clickedIndex } }));
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
                noteIndices: Array.isArray(state.noteIndices) ? Array.from(state.noteIndices) : undefined
              }
            }));
          } catch {}
        }
      }
    }
  });

  // Start the render loop
  if (!panel.__drumRenderLoop) {
    const renderLoop = () => {
      if (!panel.isConnected) return; // Stop rendering if panel is removed
      render(panel);
      panel.__drumRenderLoop = requestAnimationFrame(renderLoop);
    };
    renderLoop();
  }
}

function render(panel) {
  const st = panel.__drumVisualState;
  if (!st) return;

  // --- Ensure canvases' bitmap sizes track CSS boxes exactly (prevents drift) ---
  const DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));

  // Sync grid (cubes) canvas to its CSS size
  {
    const rect = st.canvas.getBoundingClientRect();
    const targetW = Math.max(1, Math.round(rect.width * DPR));
    const targetH = Math.max(1, Math.round(rect.height * DPR));
    if (st.canvas.width !== targetW || st.canvas.height !== targetH) {
      st.canvas.width = targetW;
      st.canvas.height = targetH;
    }
  }

  // Sync particle canvas to its CSS size
  if (st.particleCanvas) {
    const prect = st.particleCanvas.getBoundingClientRect();
    const pW = Math.max(1, Math.round(prect.width * DPR));
    const pH = Math.max(1, Math.round(prect.height * DPR));
    if (st.particleCanvas.width !== pW || st.particleCanvas.height !== pH) {
      st.particleCanvas.width = pW;
      st.particleCanvas.height = pH;
    }
  }

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

  let showPlaying;
  if (isRunning()) {
    // A chained toy only shows its highlight if the chain itself currently has notes.
    // For standalone toys, only show highlight if there are notes to play.
    showPlaying = isChained ? (isActiveInChain && chainHasNotes) : hasActiveNotes;
  } else {
    // When paused, highlight chained toys only if the chain retains any active notes.
    showPlaying = isChained ? chainHasNotes : hasActiveNotes;
  }
  panel.classList.toggle('toy-playing', showPlaying);

  const { ctx, canvas, particles, tapLabel } = st;
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return;

  ctx.clearRect(0, 0, w, h);

  const loopInfo = getLoopInfo();
  const playheadCol = loopInfo ? Math.floor(loopInfo.phase01 * NUM_CUBES) : -1;

  /* Draw particles on the particle layer (double-height) */
  let particleFieldW = 0;
  let particleFieldH = 0;
  if (st.pctx && st.particleCanvas) {
    const pw = st.particleCanvas.width;
    const ph = st.particleCanvas.height;
    particleFieldW = pw;
    particleFieldH = ph;
    st.pctx.clearRect(0, 0, pw, ph);
    retargetLoopgridParticleCount(st, pw, ph);
    // Base particle scale on cube size so it matches Rippler's visual definition.
    // Our field height = 3 * cubeSizePx  => cubeSizePx = ph / 3
    const cubeSizePx = Math.max(1, st.particleCanvas.height / 3);
    const baselineCube = 72; // Rippler baseline cube size
    const pmap = {
      n2x: (n) => n * pw,
      n2y: (n) => n * ph,
      scale: () => (cubeSizePx / baselineCube), // 1.0 when cube is 72px
    };
    drawGridParticles(st.pctx, particles, pmap, { col: playheadCol });
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

  if (!particleFieldW || !particleFieldH) {
    particleFieldW = w;
    particleFieldH = h;
  }

  if (tapLabel) {
    const showTapPrompt = !hasActiveNotes;
    let flash = st.tapLabelFlash || 0;
    if (showTapPrompt && playheadCol >= 0 && playheadCol !== st.tapLastPulseCol) {
      flash = 1;
      st.tapLastPulseCol = playheadCol;
    } else if (!showTapPrompt) {
      st.tapLastPulseCol = -1;
      flash = 0;
    }
    flash = Math.max(0, flash * 0.9 - 0.015);
    st.tapLabelFlash = flash;

    const baseOpacity = showTapPrompt ? 0.32 : 0;
    const finalOpacity = showTapPrompt ? Math.min(0.75, baseOpacity + flash * 0.4) : 0;
    tapLabel.style.opacity = finalOpacity.toFixed(3);

    const labelSize = Math.max(28, Math.min(particleFieldW, particleFieldH) * 0.18);
    tapLabel.style.fontSize = `${Math.round(labelSize)}px`;
  }

  // To prevent highlight clipping and ensure cubes fit in zoomed view,
  // we calculate cubeSize based on both width and height constraints.
  const BORDER_MARGIN = 4;
  const localGap = isZoomed ? 2 : GAP;
  const totalGapWidth = localGap * (NUM_CUBES - 1);

  // Calculate max possible cube size from both dimensions.
  const heightBasedSize = h - BORDER_MARGIN * 2;
  const widthBasedSize = (w - totalGapWidth) / NUM_CUBES;
  let cubeSize = Math.min(heightBasedSize, widthBasedSize);

  // IMPORTANT: do NOT inflate cube size (removes edge cut-offs).
  // Keep integer pixels to avoid blurry borders.
  cubeSize = Math.max(1, Math.floor(cubeSize));

  // Center the entire block of cubes.
  const actualTotalCubesWidth = (cubeSize * NUM_CUBES) + totalGapWidth;

  // Safety clamp in case of rounding: never exceed canvas width.
  if (actualTotalCubesWidth > w) {
    cubeSize = Math.floor((w - totalGapWidth) / NUM_CUBES);
  }

  const xOffset = (w - ((cubeSize * NUM_CUBES) + totalGapWidth)) / 2;
  const yOffset = (h - cubeSize) / 2;

  // Check for phase wrap to prevent flicker on chain advance
  const phaseJustWrapped = loopInfo && loopInfo.phase01 < st.localLastPhase && st.localLastPhase > 0.9;
  st.localLastPhase = loopInfo ? loopInfo.phase01 : 0;
  const probablyStale = isActiveInChain && phaseJustWrapped;

  for (let i = 0; i < NUM_CUBES; i++) {
    const flash = st.flash[i] || 0;
    const isEnabled = !!steps[i];
    const cubeX = xOffset + i * (cubeSize + localGap);
    const cubeRect = { x: cubeX, y: yOffset, w: cubeSize, h: cubeSize };

    // Draw playhead highlight first, so it's underneath the cube
    // The playhead should scroll if the toy is standalone, or if it's the active toy in a chain.
    if ((isActiveInChain || !isChained) && isRunning() && i === playheadCol && !probablyStale) {
      // A bigger, centered border highlight drawn by filling a slightly
      // larger rectangle behind the cube. This is more robust than stroking.
      // We use Math.floor to ensure integer coordinates and avoid sub-pixel
      // rendering artifacts that can make borders appear uneven.
      const borderSize = 4;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      // To ensure perfect centering, we base the highlight's geometry on the
      // final, integer-based position and size of the cube itself.
      ctx.fillRect(
        Math.trunc(cubeRect.x) - borderSize,
        Math.trunc(cubeRect.y) - borderSize,
        Math.trunc(cubeRect.w) + borderSize * 2,
        Math.trunc(cubeRect.h) + borderSize * 2
      );
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
