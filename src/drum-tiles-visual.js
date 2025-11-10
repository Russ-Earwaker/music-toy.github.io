// src/drum-tiles-visual.js
// Renders and handles interaction for the 8-step sequencer cubes.
import { drawBlock, whichThirdRect } from './toyhelpers.js';
import { boardScale } from './board-scale-helpers.js';
import { midiToName } from './note-helpers.js';
import { isRunning, getLoopInfo } from './audio-core.js';
import { createField } from './particles/field-generic.js';
import { createParticleViewport } from './particles/particle-viewport.js';

const NUM_CUBES = 8;


const GAP = 4; // A few pixels of space between each cube
const BORDER_MARGIN = 4;

// The canvas covers only the inner GRID area; side gutters (1 cube width)
// are provided by CSS on .sequencer-wrap. Keep the math in here aligned
// with the inner canvas dimensions (no extra offsets) so pointer hits stay accurate.
function getLoopgridLayout(cssW, cssH, isZoomed) {
  const localGap = isZoomed ? 2 : GAP;
  const totalGapWidth = localGap * (NUM_CUBES - 1);
  let cubeSize = Math.floor((cssW - totalGapWidth) / NUM_CUBES);
  const heightBasedMax = Math.floor(cssH - BORDER_MARGIN * 2);
  if (heightBasedMax > 0) cubeSize = Math.min(cubeSize, heightBasedMax);
  cubeSize = Math.max(1, cubeSize);
  const blockWidthWithGap = cubeSize + localGap;
  const xOffset = 0;
  const yOffset = Math.max(0, Math.floor((cssH - cubeSize) / 2));
  return { cubeSize, localGap, totalGapWidth, blockWidthWithGap, xOffset, yOffset };
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

export function attachDrumVisuals(panel) {
  if (!panel || panel.__drumVisualAttached) return;
  panel.__drumVisualAttached = true;

  const sequencerWrap = panel.querySelector('.sequencer-wrap');
  let canvas = sequencerWrap
    ? (sequencerWrap.querySelector('.grid-canvas')
       || sequencerWrap.querySelector('canvas:not(.toy-particles)'))
    : null;
  if (!canvas) return;
  if (!canvas.classList.contains('grid-canvas')) canvas.classList.add('grid-canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.imageSmoothingEnabled = false;

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
  let particleField = null;
  let particleObserver = null;
  let overviewHandler = null;
  const pv = createParticleViewport(() => {
    const host = sequencerWrap || panel;
    const r = host?.getBoundingClientRect?.();
    return {
      w: Math.max(1, Math.round(r?.width || 1)),
      h: Math.max(1, Math.round(r?.height || 1)),
    };
  });
  if (particleCanvas) {
    try {
      const pausedRef = () => !isRunning();
      particleField = createField(
        { canvas: particleCanvas, viewport: pv, pausedRef },
        {
          density: 0.05,
          cap: 300,
          stiffness: 16,
          damping: 0.18,
          noise: 0.10,
          kick: 18,
          kickDecay: 7.5,
          sizePx: 1.0,
          drawMode: 'dots',
        },
      );
      particleField.resize();
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
    } catch (err) {
      console.warn('[loopgrid] particle field init failed', err);
      particleField = null;
      particleObserver = null;
    }
  }

  let tapLabel = sequencerWrap ? sequencerWrap.querySelector('.loopgrid-tap-label') : null;
  if (!tapLabel && sequencerWrap) {
    tapLabel = document.createElement('div');
    tapLabel.className = 'toy-action-label loopgrid-tap-label';
    tapLabel.style.lineHeight = '1';
    tapLabel.style.whiteSpace = 'nowrap';
    tapLabel.style.transition = 'none';
    sequencerWrap.appendChild(tapLabel);
  }
  const tapLetters = ensureTapLetters(tapLabel);

  const st = {
    panel,
    canvas,
    ctx,
    sequencerWrap,
    particleCanvas,
    particleField,
    particleObserver,
    lastParticleTick: performance.now(),
    fieldWidth: 0,
    fieldHeight: 0,
    flash: new Float32Array(NUM_CUBES),
    bgFlash: 0,
    localLastPhase: 0,
    tapLabel,
    tapLetters,
    tapLetterFlash: tapLetters.map(() => 0),
    tapLetterLastLoop: tapLetters.map(() => -1),
    tapLetterBounds: null,
    tapLetterOffsetX: tapLetters.map(() => 0),
    tapLetterOffsetY: tapLetters.map(() => 0),
    tapLetterVelocityX: tapLetters.map(() => 0),
    tapLetterVelocityY: tapLetters.map(() => 0),
    tapFieldRect: null,
    tapPromptVisible: false,
    tapLoopIndex: 0,
  };
  panel.__drumVisualState = st;
  panel.__drumVisualState.particleField = particleField || null;
  const teardownParticles = () => {
    try { window.removeEventListener('overview:transition', overviewHandler); } catch {}
    try { particleObserver?.disconnect?.(); } catch {}
    try { particleField?.destroy?.(); } catch {}
  };
  panel.addEventListener('toy:remove', teardownParticles, { once: true });

  // Listen for clicks on the canvas to toggle steps or change notes
  canvas.addEventListener('pointerdown', (e) => {
    const rawRect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rawRect.width));
    const cssH = Math.max(1, Math.round(rawRect.height));
    if (!cssW || !cssH) return;

    const pointer = { x: e.clientX - rawRect.left, y: e.clientY - rawRect.top };

    const layout = getLoopgridLayout(cssW, cssH, panel.classList.contains('toy-zoomed'));
    const { cubeSize, yOffset, blockWidthWithGap } = layout;
    if (blockWidthWithGap <= 0 || cubeSize <= 0) return;

    const clickedIndex = Math.floor(pointer.x / blockWidthWithGap);
    if (clickedIndex < 0 || clickedIndex >= NUM_CUBES) return;
    const xInBlock = pointer.x - clickedIndex * blockWidthWithGap;

    if (xInBlock < cubeSize) { // Ensure the click is on the cube, not the gap
      if (clickedIndex >= 0 && clickedIndex < NUM_CUBES) {
        const state = panel.__gridState;
        if (!state?.noteIndices || !state?.steps) return;

        const cubeRect = {
          x: clickedIndex * blockWidthWithGap,
          y: yOffset,
          w: cubeSize,
          h: cubeSize,
        };
        const third = whichThirdRect(cubeRect, pointer.y);
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
  const dpr = (window.devicePixelRatio && window.devicePixelRatio > 0) ? window.devicePixelRatio : 1;
  const w = canvas.width;
  const h = canvas.height;
  const cssW = Math.max(1, Math.round(w / dpr));
  const cssH = Math.max(1, Math.round(h / dpr));
  if (particleField) {
    const now = performance.now();
    if (!Number.isFinite(st.lastParticleTick)) st.lastParticleTick = now;
    const dt = Math.min(0.05, Math.max(0, (now - st.lastParticleTick) / 1000));
    st.lastParticleTick = now;
    try { particleField.tick(dt || (1 / 60)); } catch {}
  }
  if (!cssW || !cssH || !w || !h) return;

  const scaleX = cssW ? (w / cssW) : 1;
  const scaleY = cssH ? (h / cssH) : 1;
  const pxX = (value) => value * scaleX;
  const pxY = (value) => value * scaleY;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

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
          const glowRadius = 10 + activeFlash * 24;
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

  // To prevent highlight clipping and ensure cubes fit in zoomed view,
  // we calculate cubeSize based on both width and height constraints.
  const layout = getLoopgridLayout(cssW, cssH, isZoomed);
  const { cubeSize, xOffset, yOffset, blockWidthWithGap, localGap } = layout;

  // Check for phase wrap to prevent flicker on chain advance
  const phaseJustWrapped = loopInfo && loopInfo.phase01 < st.localLastPhase && st.localLastPhase > 0.9;
  st.localLastPhase = loopInfo ? loopInfo.phase01 : 0;
  const probablyStale = isActiveInChain && phaseJustWrapped;

  if (phaseJustWrapped) {
    st.tapLoopIndex = (typeof st.tapLoopIndex === 'number' ? st.tapLoopIndex : 0) + 1;
    if (Array.isArray(st.tapLetterLastLoop)) st.tapLetterLastLoop.fill(-1);
  }

  for (let i = 0; i < NUM_CUBES; i++) {
    const flash = st.flash[i] || 0;
    const isEnabled = !!steps[i];
    const cubeX = xOffset + i * (cubeSize + localGap);
    const cubeRectCss = { x: cubeX, y: yOffset, w: cubeSize, h: cubeSize };
    const cubeRect = {
      x: Math.round(pxX(cubeRectCss.x)),
      y: Math.round(pxY(cubeRectCss.y)),
      w: Math.round(pxX(cubeRectCss.w)),
      h: Math.round(pxY(cubeRectCss.h)),
    };

    // Draw playhead highlight first, so it's underneath the cube
    // The playhead should scroll if the toy is standalone, or if it's the active toy in a chain.
    if ((isActiveInChain || !isChained) && transportRunning && i === playheadCol && !probablyStale) {
      // A bigger, centered border highlight drawn by filling a slightly
      // larger rectangle behind the cube. This is more robust than stroking.
      // We rely on integer-aligned cube geometry to avoid sub-pixel
      // rendering artifacts that can make borders appear uneven.
      const borderSize = 4;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      // To ensure perfect centering, we base the highlight's geometry on the
      // final, integer-based position and size of the cube itself.
      ctx.fillRect(
        cubeRect.x - borderSize,
        cubeRect.y - borderSize,
        cubeRect.w + borderSize * 2,
        cubeRect.h + borderSize * 2
      );
      if (showTapPrompt && fieldRectData && Number.isFinite(fieldRectData.left) && fieldRectData.width > 0 && gridRect.width > 0 && Array.isArray(st.tapLetterBounds)) {
        const columnCenterPx = gridRect.left + ((cubeRectCss.x + cubeRectCss.w / 2) / cssW) * gridRect.width;
        const columnCenterPy = gridRect.top + ((cubeRectCss.y + cubeRectCss.h / 2) / cssH) * gridRect.height;
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
