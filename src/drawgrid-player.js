// src/drawgrid-player.js
import { triggerInstrument } from './audio-samples.js';
import { gateTriggerForToy } from './toy-audio.js';
import { buildPalette, midiToName } from './note-helpers.js';

export function connectDrawGridToPlayer(panel) {
  if (!panel || panel.__drawGridPlayer) return;
  panel.__drawGridPlayer = true;

  const toyId = panel.id || 'drawgrid';
  let instrument = panel.dataset.instrument || 'acoustic_guitar';

  const initialSteps = parseInt(panel.dataset.steps, 10) || 8;

  // The grid has 12 rows. We'll use a chromatic scale.
  // The drawgrid component handles auto-tuning visuals and row indices.
  const chromaticOffsets = Array.from({length: 12}, (_, i) => i);
  const notePalette = buildPalette(60, chromaticOffsets, 1).reverse(); // C4-B4, reversed

  let gridState = {
    active: Array(initialSteps).fill(false),
    nodes: Array.from({ length: initialSteps }, () => new Set()),
  };

  // The gated trigger respects the toy's volume/mute settings.
  const playNote = gateTriggerForToy(toyId, triggerInstrument);

  panel.addEventListener('drawgrid:update', (e) => {
    if (e.detail) gridState = e.detail;
  });

  panel.addEventListener('toy-instrument', (e) => {
    instrument = e.detail?.value || instrument;
  });

  function step(col) {
    if (gridState.active[col] && gridState.nodes[col]?.size > 0) {
      for (const row of gridState.nodes[col]) {
        const midiNote = notePalette[row];
        playNote(instrument, midiToName(midiNote));
      }
    }
  }

  panel.__sequencerStep = step;
}