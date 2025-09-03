// src/drum-tiles-visual.js
// Renders and handles interaction for the 8-step sequencer cubes.
import { drawBlock, whichThirdRect } from './toyhelpers.js';
import { midiToName, stepIndexUp, stepIndexDown } from './note-helpers.js';

const NUM_CUBES = 8;
const GAP = 4; // A few pixels of space between each cube

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

  const st = {
    panel,
    canvas,
    ctx,
    playheadCol: -1,
    flash: new Float32Array(NUM_CUBES),
  };
  panel.__drumVisualState = st;

  // Listen for playhead movement from grid-core
  panel.addEventListener('loopgrid:playcol', (e) => {
    const col = e?.detail?.col;
    st.playheadCol = col;
    if (col >= 0 && col < NUM_CUBES) {
      if (panel.__gridState?.steps[col]) {
        st.flash[col] = 1.0; // Trigger flash animation only for active steps
      }
    }
  });

  // Listen for clicks on the canvas to toggle steps or change notes
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasP = { x: p.x * scaleX, y: p.y * scaleY };

    const totalGapWidth = GAP * (NUM_CUBES - 1);
    const cubeSize = (canvas.width - totalGapWidth) / NUM_CUBES;
    const blockWidthWithGap = cubeSize + GAP;

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

        if (isZoomed && third === 'up') {
          stepIndexUp(state.noteIndices, state.notePalette, clickedIndex);
          // Dispatch an event to notify the core logic to play the new note.
          // This is more robust than a direct call, avoiding initialization order issues.
          panel.dispatchEvent(new CustomEvent('grid:notechange', { detail: { col: clickedIndex } }));
        } else if (isZoomed && third === 'down') {
          stepIndexDown(state.noteIndices, state.notePalette, clickedIndex);
          // Dispatch an event to notify the core logic to play the new note.
          panel.dispatchEvent(new CustomEvent('grid:notechange', { detail: { col: clickedIndex } }));
        } else {
          state.steps[clickedIndex] = !state.steps[clickedIndex];
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

  const { ctx, canvas } = st;
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return;

  ctx.clearRect(0, 0, w, h);

  const state = panel.__gridState || {};
  const steps = state.steps || [];
  const noteIndices = state.noteIndices || [];
  const notePalette = state.notePalette || [];
  const isZoomed = panel.classList.contains('toy-zoomed');

  // To prevent highlight clipping and ensure cubes fit in zoomed view,
  // we calculate cubeSize based on both width and height constraints.
  const BORDER_MARGIN = 4;
  const totalGapWidth = GAP * (NUM_CUBES - 1);

  // Calculate max possible cube size from both dimensions.
  const heightBasedSize = h - BORDER_MARGIN * 2;
  const widthBasedSize = (w - totalGapWidth) / NUM_CUBES;
  let cubeSize = Math.min(heightBasedSize, widthBasedSize);
  cubeSize = Math.max(1, Math.floor(cubeSize));

  // Center the entire block of cubes.
  const actualTotalCubesWidth = (cubeSize * NUM_CUBES) + totalGapWidth;
  const xOffset = (w - actualTotalCubesWidth) / 2;
  const yOffset = (h - cubeSize) / 2;

  for (let i = 0; i < NUM_CUBES; i++) {
    const flash = st.flash[i] || 0;
    const isEnabled = !!steps[i];
    const cubeX = xOffset + i * (cubeSize + GAP);
    const cubeRect = { x: cubeX, y: yOffset, w: cubeSize, h: cubeSize };

    // Draw playhead highlight first, so it's underneath the cube
    if (i === st.playheadCol) {
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
