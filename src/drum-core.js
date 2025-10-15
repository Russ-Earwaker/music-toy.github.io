// src/drum-core.js — drum grid core + instrument sync (<=300 lines)
import { triggerInstrument } from './audio-samples.js';
import { setToyInstrument } from './instrument-map.js';
import { initToyUI } from './toyui.js';
import { attachDrumVisuals } from './drum-tiles-visual.js';
import { attachGridSquareAndDrum } from './grid-square-drum.js';
import { midiToName, buildPalette } from './note-helpers.js';

/**
 * A self-contained particle system for the drum pad.
 * - Particles are distributed across the entire container.
 * - They bounce off the walls, lighting up as they do.
 * - On bounce, they get a velocity nudge back towards their home position, with some randomness.
 * - The "gravity" that pulls them home is removed for a more floaty, chaotic feel.
 */
function createDrumParticles({ getW, getH, count = 150 } = {}) {
  const P = [];
  const W = () => Math.max(1, Math.floor(getW() || 0));
  const H = () => Math.max(1, Math.floor(getH() || 0));
  let lastW = 0, lastH = 0; // Track size to detect resizes

  function init() {
    const w = W();
    const h = H();
    // Only initialize if we have a valid size and the size has changed, or if it's the first run.
    if (w > 1 && h > 1 && (P.length === 0 || w !== lastW || h !== lastH)) {
      P.length = 0; // Clear to re-create
      for (let i = 0; i < count; i++) {
        const homeX = Math.random() * w;
        const homeY = Math.random() * h;
        P.push({ x: homeX, y: homeY, vx: 0, vy: 0, homeX, homeY, flash: 0 });
      }
      lastW = w;
      lastH = h;
    }
  }

  function step() {
    init(); // This will now handle initial creation and re-distribution on resize.
    const w = W();
    const h = H();
    for (const p of P) {
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.97; p.vy *= 0.97; // Damping
      p.flash = Math.max(0, p.flash - 0.05); // Flash decay

      let bounced = false;
      if (p.x < 0) { p.x = 0; p.vx *= -0.8; bounced = true; }
      if (p.x > w) { p.x = w; p.vx *= -0.8; bounced = true; }
      if (p.y < 0) { p.y = 0; p.vy *= -0.8; bounced = true; }
      if (p.y > h) { p.y = h; p.vy *= -0.8; bounced = true; }

      if (bounced) {
        p.flash = 1.0; // Light up on bounce.
        const dx = p.homeX - p.x;
        const dy = p.homeY - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        p.vx += (dx / dist) * 0.1 + (Math.random() - 0.5) * 0.2;
        p.vy += (dy / dist) * 0.1 + (Math.random() - 0.5) * 0.2;
      }
    }
  }

  function draw(ctx) {
    if (!ctx) return;
    ctx.save();
    for (const p of P) {
      // 1. Brightness: Use a brighter color and a stronger alpha pop.
      const alpha = 0.4 + 1.5 * p.flash; // Increased base and multiplier
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.fillStyle = '#c8d8ff'; // Brighter, whiter-blue

      // 2. Scaling: Use the flash property to scale the particle size.
      // It will be largest when flash is 1.0 and smallest when flash is 0.
      const baseSize = 1.5;
      const scale = 1.0 + p.flash * 2.0; // Scale up to 3x when fully flashed
      const size = baseSize * scale;
      const x = (p.x | 0) - size / 2; // Center the scaled particle
      const y = (p.y | 0) - size / 2;

      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();
  }

  function disturb() {
    // General disturbance
    for (const p of P) {
      p.vx += (Math.random() - 0.5) * 2.5;
      p.vy += (Math.random() - 0.5) * 2.5;
      p.flash = Math.max(p.flash, 0.8);
    }

    // Repulsion from the drum pad center
    const w = W();
    const h = H();
    const centerX = w / 2;
    const centerY = h / 2;
    // The drum pad is 55% width and 65% max-height of its container.
    // Its aspect-ratio is 1/1, so its diameter is the smaller of the two.
    // Extend the radius to make the repulsion effect more obvious.
    const radius = (Math.min(w * 0.55, h * 0.65) / 2) * 1.5;
    const radiusSq = radius * radius;

    for (const p of P) {
      const dx = p.x - centerX;
      const dy = p.y - centerY;
      const distSq = dx * dx + dy * dy;

      if (distSq < radiusSq) {
        const dist = Math.sqrt(distSq) || 1;
        // Push particle away from the center, stronger when closer.
        const kick = 4.0 * (1 - dist / radius); // Tuned kick strength
        p.vx += (dx / dist) * kick;
        p.vy += (dy / dist) * kick;
      }
    }
  }

  return { step, draw, disturb };
}

export function markPlayingColumn(panel, colIndex){
  try{ panel.dispatchEvent(new CustomEvent('loopgrid:playcol', { detail:{ col: colIndex }, bubbles:true })); }catch{}
}

export function buildDrumGrid(panel, numSteps = 8){
  if (typeof panel === 'string') panel = document.querySelector(panel);
  if (!panel || !(panel instanceof Element) || panel.__gridBuilt) return null;
  panel.__gridBuilt = true;
  panel.dataset.toy = panel.dataset.toy || 'loopgrid-drum';
  initToyUI(panel, { toyName: 'Drum Kit', defaultInstrument: 'Djimbe' });

  // Use a full chromatic scale instead of the default pentatonic scale.
  // This makes all semitones (sharps/flats) available.
  const chromaticOffsets = Array.from({length: 12}, (_, i) => i);
  panel.__gridState = {
    steps: Array(numSteps).fill(false),
    notes: Array(numSteps).fill(60),
    notePalette: buildPalette(48, chromaticOffsets, 3), // C3 Chromatic, 3 octaves
    noteIndices: Array(numSteps).fill(12), // Default to C4 (MIDI 60)
  };

  const emitLoopgridUpdate = (extraDetail = {}) => {
    const state = panel.__gridState || {};
    const detail = Object.assign({}, extraDetail);
    if (Array.isArray(state.steps)) detail.steps = Array.from(state.steps);
    if (Array.isArray(state.noteIndices)) detail.noteIndices = Array.from(state.noteIndices);
    if (Array.isArray(state.notePalette)) detail.notePalette = Array.from(state.notePalette);
    try { panel.dispatchEvent(new CustomEvent('loopgrid:update', { detail })); } catch {}
  };

  // If persistence provided a pending state before this toy initialized, apply it now.
  try{
    const pending = panel.__pendingLoopGridState;
    if (pending){
      if (Array.isArray(pending.steps)) panel.__gridState.steps = Array.from(pending.steps).map(v=>!!v);
      if (Array.isArray(pending.notes)) panel.__gridState.notes = Array.from(pending.notes).map(x=>x|0);
      if (Array.isArray(pending.noteIndices)) panel.__gridState.noteIndices = Array.from(pending.noteIndices).map(x=>x|0);
      if (pending.instrument){
        panel.dataset.instrument = pending.instrument;
        try{ panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name: pending.instrument, value: pending.instrument }, bubbles:true })); }catch{}
      }
      delete panel.__pendingLoopGridState;
    }
  }catch{}

  const body = panel.querySelector('.toy-body');
  
  // --- Create all DOM elements first, in a predictable order ---
  if (body && !body.querySelector('.sequencer-wrap')) {
    const sequencerWrap = document.createElement('div');
    sequencerWrap.className = 'sequencer-wrap';
    const canvas = document.createElement('canvas');
    canvas.className = 'grid-canvas';
    sequencerWrap.appendChild(canvas);
    body.appendChild(sequencerWrap);
  }
  
  // This is the critical fix for the squished cubes. The clues indicate a
  // mismatch between the canvas's CSS size and its internal bitmap size,
  // causing non-uniform stretching. A ResizeObserver is the most robust
  // way to keep them in sync.
  const sequencerWrap = body.querySelector('.sequencer-wrap');
  const canvas = sequencerWrap.querySelector('.grid-canvas');
  const observer = new ResizeObserver(entries => {
    const rect = entries[0]?.contentRect;
    if (rect) {
      // Synchronize the canvas's drawing buffer size with its on-screen size.
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
  });
  observer.observe(sequencerWrap);

  let padWrap = body.querySelector('.drum-pad-wrap');
  if (!padWrap) {
    padWrap = document.createElement('div');
    padWrap.className = 'drum-pad-wrap';
    body.appendChild(padWrap);
  }

  // Create particle canvas and attach to the drum pad wrapper.
  let particleCanvas = padWrap.querySelector('.particle-canvas');
  if (!particleCanvas) {
    particleCanvas = document.createElement('canvas');
    particleCanvas.className = 'particle-canvas';
    // This canvas will fill the drum pad wrap, behind the drum pad itself.
    Object.assign(particleCanvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '0' });
    padWrap.prepend(particleCanvas);
  }
  // --- All DOM elements are now created ---

  // Now, attach logic to the stable DOM
  attachDrumVisuals(panel);
  attachGridSquareAndDrum(panel);
  const toyId = panel.dataset.toyid || panel.id || 'loopgrid-drum';

  try {
    if (panel.dataset.instrument) setToyInstrument(toyId, panel.dataset.instrument);
  } catch {}

  function setInstrument(name){
    if (!name) return;
    // The instrument ID is now case-sensitive and should not be lowercased.
    panel.dataset.instrument = name;
    try{ setToyInstrument(toyId, name); }catch{}
  }
  panel.addEventListener('toy-instrument', (e)=> setInstrument(e && e.detail && e.detail.value));
  panel.addEventListener('toy:instrument', (e)=> setInstrument((e && e.detail && (e.detail.name || e.detail.value))));

  const getNoteForStep = (step) => {
    const noteIndex = panel.__gridState.noteIndices[step];
    const midi = panel.__gridState.notePalette[noteIndex];
    return midiToName(midi);
  };

  panel.__playCurrent = (step = -1) => {
    const instrument = panel.dataset.instrument || 'tone';
    const note = step >= 0 ? getNoteForStep(step) : 'C4';
    triggerInstrument(instrument, note, undefined, toyId);
  };

  // Listen for note changes from the visual module to provide audio feedback.
  panel.addEventListener('grid:notechange', (e) => {
    const col = e?.detail?.col;
    if (col >= 0 && panel.__playCurrent) {
      panel.__playCurrent(col);
    }
  });

  panel.addEventListener('toy-random', () => {
    if (!panel.__gridState?.steps) return;
    for (let i = 0; i < panel.__gridState.steps.length; i++) {
      panel.__gridState.steps[i] = Math.random() < 0.5;
    }
    emitLoopgridUpdate({ reason: 'random' });
  });
  panel.addEventListener('toy-clear', () => {
    if (!panel.__gridState?.steps) return;
    panel.__gridState.steps.fill(false);
    // Also reset the notes for each step back to the default (C4).
    if (panel.__gridState.noteIndices) panel.__gridState.noteIndices.fill(12);
    emitLoopgridUpdate({ reason: 'clear' });
  });
  panel.addEventListener('toy-random-notes', () => {
    if (!panel.__gridState?.noteIndices || !panel.__gridState?.notePalette) return;

    const { noteIndices, notePalette } = panel.__gridState;

    // Define a C-minor pentatonic scale within the 4th octave.
    const C_MINOR_PENTATONIC_C4 = [60, 63, 65, 67, 70]; // C4, D#4, F4, G4, A#4

    for (let i = 0; i < noteIndices.length; i++) {
      // Pick a random note directly from our scale.
      const targetMidi = C_MINOR_PENTATONIC_C4[Math.floor(Math.random() * C_MINOR_PENTATONIC_C4.length)];

      // Find the index in our main palette that corresponds to this MIDI value.
      const newIndex = notePalette.indexOf(targetMidi);
      
      // If found, assign it.
      if (newIndex !== -1) {
        noteIndices[i] = newIndex;
      }
    }
    emitLoopgridUpdate({ reason: 'random-notes' });
  });

  // --- Particle System ---
  if (particleCanvas) {
    // Keep the particle canvas bitmap size in sync with its element size.
    const particleObserver = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        particleCanvas.width = rect.width;
        particleCanvas.height = rect.height;
      }
    });
    particleObserver.observe(padWrap);

    const particleCtx = particleCanvas.getContext('2d');
    const particles = createDrumParticles({
      getW: () => particleCanvas.width,
      getH: () => particleCanvas.height,
    });
    panel.__particles = particles;
    function renderParticles() {
      if (!panel.isConnected) return; // Stop rendering if panel is removed
      particles.step();
      // Clear with a much darker background color.
      particleCtx.fillStyle = '#06080b';
      particleCtx.fillRect(0, 0, particleCanvas.width, particleCanvas.height);

      // Background flash on drum hit, rendered on the particle canvas.
      const st = panel.__drumVisualState;
      if (st && st.bgFlash > 0) {
        particleCtx.save();
        // A darker shade of the purple from the drum pad tap animation
        particleCtx.fillStyle = '#6030c0';
        particleCtx.globalAlpha = st.bgFlash * 0.4; // Make it more impactful
        particleCtx.fillRect(0, 0, particleCanvas.width, particleCanvas.height);
        particleCtx.restore();
        st.bgFlash = Math.max(0, st.bgFlash - 0.05); // Decay
      }

      particles.draw(particleCtx);
      requestAnimationFrame(renderParticles);
    }
    renderParticles();
  }
  // ---

  panel.__beat = () => {
    if (panel.__particles) panel.__particles.disturb();
  };

  panel.__sequencerStep = (col) => {
    markPlayingColumn(panel, col);
    if (panel.__gridState.steps[col]) {
      panel.__playCurrent(col);
      if (panel.__particles) panel.__particles.disturb();
      // Trigger visual flashes.
      if (panel.__drumVisualState) {
        // Flash for the individual cube.
        if (panel.__drumVisualState.flash) panel.__drumVisualState.flash[col] = 1.0;
        // Flash for the main background.
        panel.__drumVisualState.bgFlash = 1.0;
      }
    }
  };
  panel.dataset.steps = numSteps;

  return panel;
}
