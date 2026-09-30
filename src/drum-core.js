// src/drum-core.js — drum grid core + instrument sync (<=300 lines)
import { triggerInstrument } from './audio-samples.js';
import { ensureAudioContext, resumeAudioContextIfNeeded, getTransportState, isRunning, TICKS_PER_BAR } from './audio-core.js';
import { setToyInstrument } from './instrument-map.js';
import { initToyUI } from './toyui.js';
import { attachSimpleRhythmVisual } from './simple-rhythm-visual.js';
import { attachGridSquareAndDrum } from './grid-square-drum.js';
import { midiToName, buildPalette } from './note-helpers.js';
import { gateTriggerForToy, bumpToyAudioGen } from './toy-audio.js';
import {
  activatePlaybackInstance,
  deactivatePlaybackInstance,
  ensurePlaybackInstance,
  getPlaybackInstance,
  removePlaybackInstance,
} from './playback-instances.js';
import { getToyLifecycle } from './baseMusicToy/index.js';
import { createToySurfaceManager } from './toy-surface-manager.js';
import { createDrumPadParticles } from './drum-pad-particles.js';
import { createDrumParticleViewportSpace, DRUM_PARTICLE_LOGICAL_HEIGHT, DRUM_PARTICLE_LOGICAL_WIDTH } from './drum-particle-viewport-space.js';

export function markPlayingColumn(panel, colIndex){
  try{ panel.dispatchEvent(new CustomEvent('loopgrid:playcol', { detail:{ col: colIndex }, bubbles:true })); }catch{}
}

export function buildDrumGrid(panel, numSteps = 8){
  if (typeof panel === 'string') panel = document.querySelector(panel);
  if (!panel || !(panel instanceof Element) || panel.__gridBuilt) return null;
  panel.__gridBuilt = true;
  panel.dataset.toy = panel.dataset.toy || 'loopgrid-drum';
  const initialTransport = getTransportState();
  if (isRunning()) {
    activatePlaybackInstance(panel.id, initialTransport.currentTick, {
      loopLengthTicks: TICKS_PER_BAR,
      quantize: true,
    });
  } else {
    ensurePlaybackInstance(panel.id, { active: true, startTick: 0, loopLengthTicks: TICKS_PER_BAR });
  }
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

  // Deterministic sequencing state
  panel.__seqRev = panel.__seqRev || 0;
  panel.__seqPattern = panel.__seqPattern || null;

  function rebuildSeqPattern() {
    const st = panel.__gridState || {};
    panel.__seqPattern = {
      steps: Array.isArray(st.steps) ? Array.from(st.steps) : [],
      instrument: panel.dataset.instrument || 'Djimbe',
    };
  }

  rebuildSeqPattern();

  const emitLoopgridUpdate = (extraDetail = {}) => {
    const state = panel.__gridState || {};
    const detail = Object.assign({}, extraDetail);
    if (Array.isArray(state.steps)) detail.steps = Array.from(state.steps);
    if (Array.isArray(state.noteIndices)) detail.noteIndices = Array.from(state.noteIndices);
    if (Array.isArray(state.notePalette)) detail.notePalette = Array.from(state.notePalette);
    try { panel.dispatchEvent(new CustomEvent('loopgrid:update', { detail })); } catch {}
  };

  panel.addEventListener('loopgrid:update', (e) => {
    const detail = e?.detail || {};
    if (Array.isArray(detail.steps)) panel.__gridState.steps = Array.from(detail.steps).map(Boolean);
    if (Array.isArray(detail.noteIndices)) panel.__gridState.noteIndices = Array.from(detail.noteIndices).map(x => x | 0);
    if (detail.reason && detail.reason !== 'noop') {
      panel.__seqRev++;
      rebuildSeqPattern();
    }
  });

  // If persistence provided a pending state before this toy initialized, apply it now.
  try{
    const pending = panel.__pendingLoopGridState;
    if (pending){
      if (Array.isArray(pending.steps)) panel.__gridState.steps = Array.from(pending.steps).map(v=>!!v);
      if (Array.isArray(pending.notes)) panel.__gridState.notes = Array.from(pending.notes).map(x=>x|0);
      if (Array.isArray(pending.noteIndices)) panel.__gridState.noteIndices = Array.from(pending.noteIndices).map(x=>x|0);
      if (pending.instrument){
        panel.dataset.instrument = pending.instrument;
        panel.dataset.instrumentPersisted = '1';
        try{ panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name: pending.instrument, value: pending.instrument }, bubbles:true })); }catch{}
      }
      delete panel.__pendingLoopGridState;
      panel.__seqRev++;
      rebuildSeqPattern();
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
   
  const sequencerWrap = body.querySelector('.sequencer-wrap');

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
  attachSimpleRhythmVisual(panel);
  attachGridSquareAndDrum(panel);
  const toyId = panel.dataset.toyid || panel.id || 'loopgrid-drum';
  panel.__audioToyId = toyId;

  // Create gated trigger for audio generation guard
  const playNote = gateTriggerForToy(panel.__audioToyId, triggerInstrument);

  const activateAtTransport = ({ retrigger = false } = {}) => {
    const transport = getTransportState();
    const existing = getPlaybackInstance(panel.id);
    const instance = activatePlaybackInstance(panel.id, transport.currentTick, {
      loopLengthTicks: TICKS_PER_BAR,
      quantize: transport.state === 'playing',
      retrigger,
    });
    if (instance !== existing) {
      bumpToyAudioGen(panel.__audioToyId, retrigger ? 'drumgrid-retrigger' : 'drumgrid-activate');
      panel.__forceSchedulerReset = true;
    }
    return instance;
  };
  panel.__drumGridPlayback = {
    get instance(){ return getPlaybackInstance(panel.id); },
    activate: () => activateAtTransport({ retrigger: false }),
    retrigger: () => activateAtTransport({ retrigger: true }),
    deactivate: () => {
      const instance = deactivatePlaybackInstance(panel.id);
      bumpToyAudioGen(panel.__audioToyId, 'drumgrid-deactivate');
      panel.__forceSchedulerReset = true;
      return instance;
    },
  };
  panel.addEventListener('toy:start', () => panel.__drumGridPlayback.activate());
  panel.addEventListener('toy:retrigger', () => panel.__drumGridPlayback.retrigger());
  panel.addEventListener('toy:deactivate', () => panel.__drumGridPlayback.deactivate());
  panel.addEventListener('toy-remove', () => {
    deactivatePlaybackInstance(panel.id);
    removePlaybackInstance(panel.id);
  }, { once: true });

  try {
    if (panel.dataset.instrument) setToyInstrument(panel.__audioToyId, panel.dataset.instrument);
  } catch {}

  function setInstrument(name){
    if (!name) return;
    // The instrument ID is now case-sensitive and should not be lowercased.
    panel.dataset.instrument = name;
    panel.dataset.instrumentPersisted = '1';
    try{ setToyInstrument(panel.__audioToyId, name); }catch{}
    panel.__seqRev++;
    rebuildSeqPattern();
  }
  panel.addEventListener('toy-instrument', (e)=> setInstrument(e && e.detail && e.detail.value));
  panel.addEventListener('toy:instrument', (e)=> setInstrument((e && e.detail && (e.detail.name || e.detail.value))));

  const getNoteForStep = (step) => {
    const noteIndex = panel.__gridState.noteIndices[step];
    const midi = panel.__gridState.notePalette[noteIndex];
    return midiToName(midi);
  };

  panel.__playCurrent = (step = -1, when) => {
    // Manual clicks need to wake audio on some browsers/devices.
    try { resumeAudioContextIfNeeded(); } catch {}

    const instrument = panel.dataset.instrument || 'tone';
    const note = step >= 0 ? getNoteForStep(step) : 'C4';

    // Manual audition calls often omit `when`. Normalise to "now" so audio always fires.
    let w = when;
    if (!Number.isFinite(w)) {
      try {
        const ctx = ensureAudioContext();
        w = (ctx?.currentTime ?? 0) + 0.002;
      } catch {}
    }

    playNote(instrument, note, w);
  };
 
  // Listen for note changes from the visual module to provide audio feedback.
  panel.addEventListener('grid:notechange', (e) => {
    const col = e?.detail?.col;
    if (col >= 0 && panel.__playCurrent) {
      panel.__playCurrent(col);
      panel.__seqRev++;
      rebuildSeqPattern();
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
    const lifecycle = getToyLifecycle(panel);
    const particleSurface = createToySurfaceManager({
      panel,
      body: padWrap,
      getBoardScale: () => window.__boardScale || 1,
      tag: 'drum-pad-particles',
    });
    particleSurface.registerCanvas('drum-pad-particles', particleCanvas, { policy: 'managed' });
    particleSurface.syncNow('drum-particles-init');
    lifecycle.addCleanup(() => particleSurface.destroy());
    const particleCtx = particleCanvas.getContext('2d');
    const particles = createDrumPadParticles();
    panel.__particles = particles;
    let lastParticleFrame = performance.now();
    function renderParticles(now) {
      const dt = Math.min(0.05, Math.max(0, (now - lastParticleFrame) / 1000)) || (1 / 60);
      lastParticleFrame = now;
      particles.step(dt);
      const cssWidth = Math.max(1, particleSurface.getCssW() || particleCanvas.clientWidth || DRUM_PARTICLE_LOGICAL_WIDTH);
      const cssHeight = Math.max(1, particleSurface.getCssH() || particleCanvas.clientHeight || DRUM_PARTICLE_LOGICAL_HEIGHT);
      const dpr = Math.max(0.25, particleSurface.getDpr() || 1);
      const viewport = createDrumParticleViewportSpace({ width: cssWidth, height: cssHeight, backingScale: dpr });
      particleCtx.setTransform(1, 0, 0, 1, 0, 0);
      particleCtx.fillStyle = '#06080b';
      particleCtx.fillRect(0, 0, particleCanvas.width, particleCanvas.height);
      particleCtx.setTransform(
        dpr * viewport.presentationScale, 0,
        0, dpr * viewport.presentationScale,
        dpr * viewport.contentRect.left,
        dpr * viewport.contentRect.top,
      );

      const st = panel.__drumVisualState;
      if (st && st.bgFlash > 0) {
        particleCtx.save();
        particleCtx.fillStyle = '#6030c0';
        particleCtx.globalAlpha = st.bgFlash * 0.4;
        particleCtx.fillRect(0, 0, DRUM_PARTICLE_LOGICAL_WIDTH, DRUM_PARTICLE_LOGICAL_HEIGHT);
        particleCtx.restore();
        st.bgFlash = Math.max(0, st.bgFlash - 3 * dt);
      }

      particles.draw(particleCtx);
      lifecycle.requestFrame(renderParticles);
    }
    lifecycle.requestFrame(renderParticles);
  }
  // ---

  panel.__beat = () => {
    if (panel.__particles) panel.__particles.disturb();
  };

  panel.__sequencerStep = (col) => {
    markPlayingColumn(panel, col);
    if (panel.__gridState.steps[col]) {
      if (!window.__NOTE_SCHEDULER_ENABLED) {
        panel.__playCurrent(col);
      } else {
        // Scheduler owns audio; step is visual-only.
      }
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

  panel.__sequencerSchedule = (col, when) => {
    const pat = panel.__seqPatternActive || panel.__seqPattern;
    if (!pat || !pat.steps) return;
    if (!pat.steps[col]) return;
    panel.__playCurrent(col, when);
  };
  panel.dataset.steps = numSteps;
 
  return panel;
}
