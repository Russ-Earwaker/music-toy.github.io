// src/grid-core.js — grid core + instrument sync (<=300 lines)
import { triggerInstrument } from './audio-samples.js';
import { setToyInstrument } from './instrument-map.js';
import { initToyUI } from './toyui.js';
import { attachDrumVisuals } from './drum-tiles-visual.js';
import { midiToName, buildPalette } from './note-helpers.js';

const NUM_CUBES = 8;



export function markPlayingColumn(panel, colIndex){
  try{ panel.dispatchEvent(new CustomEvent('loopgrid:playcol', { detail:{ col: colIndex }, bubbles:true })); }catch{}
}

export function buildGrid(panel, numSteps = 8){
  if (typeof panel === 'string') panel = document.querySelector(panel);
  if (!panel || !(panel instanceof Element) || panel.__gridBuilt) return null;
  panel.__gridBuilt = true;
  panel.dataset.toy = panel.dataset.toy || 'loopgrid';
  initToyUI(panel, { toyName: 'Loop Grid', defaultInstrument: 'Bass Tone 4' });

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
  if (sequencerWrap && !sequencerWrap.querySelector('.particle-canvas')) {
    const particleCanvas = document.createElement('canvas');
    particleCanvas.className = 'particle-canvas';
    sequencerWrap.appendChild(particleCanvas);
  }
  
  // --- DOM scaffolding ready ---

  // Attach visual renderer for the 8-step grid.
  attachDrumVisuals(panel);

// --- Apply any pending restored state (set by persistence.applyLoopGrid before grid init) ---
try {
  const pending = panel.__pendingLoopGridState;
  if (pending && panel.__gridState) {
    if (Array.isArray(pending.steps)) {
      panel.__gridState.steps = Array.from(pending.steps).map(v => !!v);
    }
    if (Array.isArray(pending.notes)) {
      panel.__gridState.notes = Array.from(pending.notes).map(x => x | 0);
    }
    if (Array.isArray(pending.noteIndices)) {
      panel.__gridState.noteIndices = Array.from(pending.noteIndices).map(x => x | 0);
    }
    if (pending.instrument) {
      // Keep dataset updated; grid-core already wires instrument changes
      panel.dataset.instrument = pending.instrument;
      panel.dataset.instrumentPersisted = '1';
      try { panel.dispatchEvent(new CustomEvent('toy:instrument', { detail: { name: pending.instrument, value: pending.instrument } })); } catch {}
    }
    // Notify listeners/visuals that state changed due to restore
    try {
      panel.dispatchEvent(new CustomEvent('loopgrid:update', {
        detail: {
          reason: 'restore',
          steps: Array.from(panel.__gridState.steps),
          noteIndices: Array.from(panel.__gridState.noteIndices),
        }
      }));
    } catch {}

    delete panel.__pendingLoopGridState;
  }
} catch (e) {
  console.warn('[loopgrid] pending state apply failed', e);
}

  const toyId = panel.dataset.toyid || panel.id || 'loopgrid';

  try {
    if (panel.dataset.instrument) setToyInstrument(toyId, panel.dataset.instrument);
  } catch {}

  function setInstrument(name){
    if (!name) return;
    // The instrument ID is case-sensitive and should not be lowercased.
    panel.dataset.instrument = name;
    panel.dataset.instrumentPersisted = '1';
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

  panel.__beat = () => {};

  panel.__sequencerStep = (col) => {
    markPlayingColumn(panel, col);
    if (panel.__gridState.steps[col]) {
      panel.__playCurrent(col);
      panel.__pulseHighlight = 1.0; // For border pulse animation
      panel.__pulseRearm = true;
      // Trigger visual flashes.
      if (panel.__drumVisualState) {
        // Flash for the individual cube.
        if (panel.__drumVisualState.flash) panel.__drumVisualState.flash[col] = 1.0;
        // Flash for the main background.
        panel.__drumVisualState.bgFlash = 1.0;
      }
    }
  };

  return panel;
}
