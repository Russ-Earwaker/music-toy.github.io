// src/drawgrid-player.js
import { triggerInstrument } from './audio-samples.js';
import { gateTriggerForToy } from './toy-audio.js';
import { buildPalette, midiToName } from './note-helpers.js';
import { resumeAudioContextIfNeeded, isRunning as isTransportRunning } from './audio-core.js';

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
  let steps = initialSteps;

  // The gated trigger respects the toy's volume/mute settings.
  const playNote = gateTriggerForToy(toyId, triggerInstrument);

  panel.addEventListener('drawgrid:update', (e) => {
    const map = e?.detail?.map || (e?.detail && e.detail.nodes ? { nodes: e.detail.nodes } : null);
    steps = e?.detail?.steps ?? (map?.nodes?.length ?? 16);
    if (map) {
      gridState = map;
    } else if (e.detail) {
      gridState = e.detail;
    }
  });

  panel.addEventListener('toy-instrument', (e) => {
    instrument = e.detail?.value || instrument;
  });

  async function previewDraggedNote(col, row) {
    // Avoid double-hitting during transport playback; only audition when stopped.
    if (typeof isTransportRunning === 'function' && isTransportRunning()) return;
    if (!Number.isInteger(col) || col < 0) return;
    if (!Number.isInteger(row) || row < 0 || row >= notePalette.length) return;
    const nodes = gridState?.nodes?.[col];
    if (!(nodes instanceof Set) || !nodes.has(row)) return;
    const disabled = gridState?.disabled?.[col];
    if (disabled instanceof Set && disabled.has(row)) return;
    const midiNote = notePalette[row];
    if (midiNote === undefined) return;
    try { await resumeAudioContextIfNeeded(); } catch {}
    playNote(instrument, midiToName(midiNote));
  }

  panel.addEventListener('drawgrid:node-drag-end', (e) => {
    const col = e?.detail?.col;
    const row = e?.detail?.row;
    previewDraggedNote(col, row)?.catch?.(() => {});
  });

  function step(col) {
    // Visual playhead pulse for the toy
    markPlayingColumn(panel, col);

    const map = gridState;
    const nodesArr = (map && Array.isArray(map.nodes)) ? map.nodes : [];
    const currentSteps = Number.isFinite(steps) ? steps : nodesArr.length;

    if (!currentSteps || !nodesArr.length) {
      //console.log('[PLAYER] skip: empty map', { currentSteps, nodesLen: nodesArr.length });
      return;
    }
    if (col < 0 || col >= currentSteps) {
      //console.log('[PLAYER] skip: out of range col', { col, currentSteps });
      return;
    }

    const activeCol = !!(map.active && map.active[col]);
    const colSet = nodesArr[col] instanceof Set ? nodesArr[col] : new Set();
    const disabledInCol = map.disabled?.[col] || new Set();

    /*console.log('[PLAYER] step', {
      col,
      activeCol,
      steps: currentSteps,
      nodesInCol: colSet.size,
      disabledCount: disabledInCol.size
    });*/

    if (!activeCol || colSet.size === 0) return;

    let columnTriggered = false;
    for (const row of colSet) {
      if (typeof row !== 'number' || Number.isNaN(row)) continue;
      if (disabledInCol.has(row)) continue;

      if (!columnTriggered) {
        panel.__pulseHighlight = 1.0;
        panel.__pulseRearm = true;
        columnTriggered = true;
      }

      const midiNote = notePalette[row];
      if (midiNote === undefined) {
        console.warn('[PLAYER] row -> midi undefined', { row });
        continue;
      }

      // Log the exact note we’re about to play.
      //console.log('[PLAYER] trigger', { instrument, row, midiNote });

      playNote(instrument, midiToName(midiNote));
    }
  }

  panel.__sequencerStep = step;
}

