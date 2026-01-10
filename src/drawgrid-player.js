// src/drawgrid-player.js
import { triggerInstrument } from './audio-samples.js';
import { gateTriggerForToy } from './toy-audio.js';
import { buildPalette, midiToName } from './note-helpers.js';
import { resumeAudioContextIfNeeded, isRunning as isTransportRunning } from './audio-core.js';

function getCanonicalToyId(panel) {
  return panel?.dataset?.toyid || panel?.id || panel?.dataset?.toy || '';
}

function isNoteSchedulerEnabled() {
  try { return !!window.__NOTE_SCHEDULER_ENABLED; } catch { return false; }
}

function markPlayingColumn(panel, colIndex){
  try{ panel.dispatchEvent(new CustomEvent('drawgrid:playcol', { detail:{ col: colIndex }, bubbles:true }));}catch{}
}

export function connectDrawGridToPlayer(panel) {
  if (!panel || panel.__drawGridPlayer) return;
  panel.__drawGridPlayer = true;

  const toyId = getCanonicalToyId(panel) || 'drawgrid';
  panel.__audioToyId = toyId;
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

  // Deterministic sequencing: notes only change when user edits the toy.
  panel.__seqRev = panel.__seqRev || 0;
  panel.__seqPattern = panel.__seqPattern || null;

  function cloneDrawgridPattern(map, stepsSnap, instrumentSnap) {
    const nodesArr = (map && Array.isArray(map.nodes)) ? map.nodes : [];
    const disabledArr = (map && Array.isArray(map.disabled)) ? map.disabled : [];
    const activeArr = (map && Array.isArray(map.active)) ? map.active : [];

    const cols = new Array(stepsSnap);
    for (let col = 0; col < stepsSnap; col++) {
      const nodes = nodesArr[col] instanceof Set ? nodesArr[col] : new Set();
      const disabled = disabledArr[col] instanceof Set ? disabledArr[col] : new Set();

      // Snapshot as plain arrays so later mutations can't affect playback.
      cols[col] = {
        active: !!activeArr[col],
        nodes: Array.from(nodes),
        disabled: Array.from(disabled),
      };
    }

    return { steps: stepsSnap, instrument: instrumentSnap, cols };
  }

  panel.__seqTouch = (reason = 'user') => {
    // Call ONLY from user edits (random/mute/draw changes/instrument change etc)
    panel.__seqRev++;
    panel.__seqPattern = cloneDrawgridPattern(gridState, steps, instrument);
  };

  // The gated trigger respects the toy's volume/mute settings.
  const playNote = gateTriggerForToy(panel.__audioToyId, triggerInstrument);

  // Helper to trigger visual effects when scheduler fires a note.
  // Calls playColumn with audio:false to avoid double-playing.
  function triggerEffectsForScheduledColumn(col, when, snapshot) {
    try {
      if (typeof playColumn === 'function') {
        playColumn(col, when, { visual: true, audio: false, fromScheduler: true, snapshot });
        console.log('[drawgrid effects]', { col, when });
        return true;
      }
    } catch {}
    return false;
  }

  panel.addEventListener('drawgrid:update', (e) => {
    const map = e?.detail?.map || (e?.detail && e.detail.nodes ? { nodes: e.detail.nodes } : null);
    steps = e?.detail?.steps ?? (map?.nodes?.length ?? 16);
    if (map) {
      gridState = map;
    } else if (e.detail) {
      gridState = e.detail;
    }

    // Only rebuild deterministic playback snapshot when this update represents a real edit.
    // drawgrid sends activityOnly updates frequently; we must ignore those.
    const activityOnly = !!e?.detail?.activityOnly;
    if (!activityOnly) {
      panel.__seqPattern = cloneDrawgridPattern(gridState, steps, instrument);
      panel.__seqRev++;
    }
  });

  panel.addEventListener('toy-instrument', (e) => {
    instrument = e.detail?.value || instrument;
    // Instrument change is a user edit -> deterministic snapshot must update.
    panel.__seqPattern = cloneDrawgridPattern(gridState, steps, instrument);
    panel.__seqRev++;
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

  // Seed an initial snapshot (so deterministic works immediately)
  if (!panel.__seqPattern) {
    panel.__seqPattern = cloneDrawgridPattern(gridState, steps, instrument);
  }

  panel.__sequencerStep = (col) => {
    // Visual-only. Audio is handled exclusively by __sequencerSchedule when scheduler is enabled.
    if (isNoteSchedulerEnabled()) {
      // Keep whatever visuals you have for the step (border pulse etc).
      // If playColumn exists and is safe for visuals, call it with audio=false.
      try { playColumn(col, undefined, { visual: true, audio: false }); } catch {}
      return;
    }
    // Legacy path: no scheduler -> step drives audio
    playColumn(col, undefined, { visual: true, audio: true });
  };

  panel.__sequencerSchedule = (col, when) => {
    // Debug tripwire: if step is also firing audio, you'll still hear doubles even though scheduler calls once.
    // Keep this for now.
    // console.log('[drawgrid schedule]', panel.id, col, when);
    const pat = panel.__seqPatternActive || panel.__seqPattern;
    if (!pat || !pat.cols || col < 0 || col >= pat.steps) return;

    // Trigger visual effects (column pulse, particles, etc.) through the legacy pipeline.
    // IMPORTANT: audio must stay off here; we only want effects.
    triggerEffectsForScheduledColumn(col, when, pat);

    const c = pat.cols[col];
    if (!c || !c.active || !c.nodes || c.nodes.length === 0) return;

    // Use snapshot data only (deterministic).
    let columnTriggered = false;
    const disabledSet = new Set(c.disabled || []);

    for (const row of c.nodes) {
      if (typeof row !== 'number' || Number.isNaN(row)) continue;
      if (disabledSet.has(row)) continue;

      // Emit a custom event for systems that listen for note-fired events.
      try {
        panel.dispatchEvent(new CustomEvent('drawgrid:note-fired', {
          detail: { col, row, when, toyId: panel.__audioToyId || panel.id }
        }));
      } catch {}

      if (!columnTriggered) {
        panel.__pulseHighlight = 1.0;
        panel.__pulseRearm = true;
        columnTriggered = true;
      }

      const midiNote = notePalette[row];
      if (midiNote === undefined) continue;

      playNote(pat.instrument || instrument, midiToName(midiNote), when);
    }
  };
}
