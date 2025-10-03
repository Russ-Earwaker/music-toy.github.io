// src/drawgrid-player.js
import { triggerInstrument } from './audio-samples.js';
import { gateTriggerForToy } from './toy-audio.js';
import { buildPalette, midiToName } from './note-helpers.js';

function markPlayingColumn(panel, colIndex){
  try{ panel.dispatchEvent(new CustomEvent('drawgrid:playcol', { detail:{ col: colIndex }, bubbles:true })); }catch{}
}

export function connectDrawGridToPlayer(panel) {
  if (!panel || panel.__drawGridPlayer) return;
  panel.__drawGridPlayer = true;

  const toyId = panel.id || 'drawgrid';
  let instrument = panel.dataset.instrument || 'acoustic_guitar';

  const initialSteps = parseInt(panel.dataset.steps, 10) || 8;

  // The grid has 12 rows. Use a chromatic palette matching drawgrid snapping (highest row at top).
  const chromaticOffsets = Array.from({length: 12}, (_, i) => i);
  const notePalette = buildPalette(48, chromaticOffsets, 1).reverse(); // C3..B3 reversed

  let gridState = {
    active: Array(initialSteps).fill(false),
    nodes: Array.from({ length: initialSteps }, () => new Set()),
    disabled: Array.from({ length: initialSteps }, () => new Set()),
  };

  // The gated trigger respects the toy's volume/mute settings.
  const playNote = gateTriggerForToy(toyId, triggerInstrument);

  panel.addEventListener('drawgrid:update', (e) => {
    if (e.detail) { gridState = e.detail; }
  });

  panel.addEventListener('toy-instrument', (e) => {
    instrument = e.detail?.value || instrument;
  });

  function step(col) {
    markPlayingColumn(panel, col);
    if (gridState.active[col] && gridState.nodes[col]?.size > 0) {
      const disabledInCol = gridState.disabled?.[col] || new Set();
      let columnTriggered = false;
      for (const row of gridState.nodes[col]) {
        if (!disabledInCol.has(row)) {
          if (!columnTriggered) {
            panel.__pulseHighlight = 1.0;
            panel.__pulseRearm = true;
            columnTriggered = true;
          }
          const midiNote = notePalette[row];
          playNote(instrument, midiToName(midiNote));
        }
      }
    }
  }

  panel.__sequencerStep = step;
}

