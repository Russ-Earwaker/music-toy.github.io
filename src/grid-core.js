// src/grid-core.js — grid core + instrument sync (<=300 lines)
import { triggerInstrument } from './audio-samples.js';
import { ensureAudioContext, resumeAudioContextIfNeeded } from './audio-core.js';
import { setToyInstrument } from './instrument-map.js';
import { initToyUI } from './toyui.js';
import { attachSimpleRhythmVisual } from './simple-rhythm-visual.js';
import { midiToName, buildPalette } from './note-helpers.js';
import { gateTriggerForToy } from './toy-audio.js';

const NUM_CUBES = 8;

// LoopGrid debug controls:
//   window.__LOOPGRID_DEBUG = 0 (off), 1 (important), 2 (verbose)
//   window.__LOOPGRID_DUP_DEBUG = true/false (duplicate play detector)
try {
  if (window.__LOOPGRID_DEBUG === undefined) window.__LOOPGRID_DEBUG = 0;
  if (window.__LOOPGRID_DUP_DEBUG === undefined) window.__LOOPGRID_DUP_DEBUG = true;
} catch {}

function lgDbg(level, msg, payload) {
  try {
    if ((window.__LOOPGRID_DEBUG | 0) >= (level | 0)) {
      if (payload !== undefined) console.log('[loopgrid]', msg, payload);
      else console.log('[loopgrid]', msg);
    }
  } catch {}
}

// Detect duplicate plays (same column + same scheduled time)
const __lgPlaySeen = new Map();

function lgTrackPlay({ kind, toyId, col, whenSec, instrument, note, reason }) {
  try {
    if (!window.__LOOPGRID_DUP_DEBUG) return;

    const w = Number.isFinite(whenSec) ? whenSec : -1;
    // Quantise to milliseconds so tiny float differences don't hide dupes.
    const wMs = (w >= 0) ? Math.round(w * 1000) : -1;

    const key = `${toyId}|${kind}|c${col}|t${wMs}`;
    const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    const prev = __lgPlaySeen.get(key);
    if (prev && (nowMs - prev.nowMs) < 2000) {
      // Same key seen recently -> likely double schedule / double trigger
      console.warn('[loopgrid][DUP-PLAY]', {
        toyId, kind, col, whenMs: wMs, instrument, note,
        reasonNow: reason,
        reasonPrev: prev.reason,
        deltaMs: Math.round(nowMs - prev.nowMs),
        prevStack: prev.stack,
      });
      return;
    }

    __lgPlaySeen.set(key, {
      nowMs,
      reason,
      stack: (new Error('dup-play trace')).stack,
    });
  } catch {}
}


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

  // Deterministic sequencing state
  panel.__seqRev = panel.__seqRev || 0;
  panel.__seqPattern = panel.__seqPattern || null;

  function rebuildSeqPattern() {
    const st = panel.__gridState || {};
    panel.__seqPattern = {
      steps: Array.isArray(st.steps) ? Array.from(st.steps) : [],
      noteIndices: Array.isArray(st.noteIndices) ? Array.from(st.noteIndices) : [],
      instrument: panel.dataset.instrument || 'Bass Tone 4',
    };
  }

  // Initial snapshot
  rebuildSeqPattern();

  const emitLoopgridUpdate = (extraDetail = {}) => {
    const state = panel.__gridState || {};
    const detail = Object.assign({}, extraDetail);
    if (Array.isArray(state.steps)) detail.steps = Array.from(state.steps);
    if (Array.isArray(state.noteIndices)) detail.noteIndices = Array.from(state.noteIndices);
    if (Array.isArray(state.notePalette)) detail.notePalette = Array.from(state.notePalette);
    try { panel.dispatchEvent(new CustomEvent('loopgrid:update', { detail })); } catch {}
  };

  // Treat loopgrid:update as the authoritative "model changed" signal.
  // This makes deterministic snapshots update even if the visual layer doesn't emit grid:notechange.
  panel.addEventListener('loopgrid:update', (e) => {
    const d = e?.detail || {};
    lgDbg(1, 'loopgrid:update', { reason: d.reason, col: d.col, hasSteps: !!d.steps, hasNoteIndices: !!d.noteIndices });

    // If visuals supply steps/noteIndices, sync them into our model.
    if (Array.isArray(d.steps) && panel.__gridState?.steps) {
      panel.__gridState.steps = Array.from(d.steps).map(v => !!v);
    }
    if (Array.isArray(d.noteIndices) && panel.__gridState?.noteIndices) {
      panel.__gridState.noteIndices = Array.from(d.noteIndices).map(x => x | 0);
    }

    // Always bump snapshot revision when a real update comes in.
    if (d.reason && d.reason !== 'noop') {
      panel.__seqRev++;
      rebuildSeqPattern();
    }

    // Optional: if update tells us which column was interacted with, audition it.
    // (Only for user-ish reasons; adjust list if needed once we see logs.)
    const col = (d.col ?? d.step ?? d.index);
    if (Number.isFinite(col) && col >= 0 && d.reason && /tap|click|toggle|edit|user/i.test(String(d.reason))) {
      lgDbg(2, 'audition-from-update', { col });
      panel.__playCurrent?.(col, undefined, 'audition:loopgrid:update');
    }
  });

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
  if (sequencerWrap && !sequencerWrap.querySelector('.toy-particles')) {
    const particleCanvas = document.createElement('canvas');
    particleCanvas.className = 'toy-particles';
    sequencerWrap.insertBefore(particleCanvas, sequencerWrap.firstChild || null);
  }
   
  // --- DOM scaffolding ready ---

  // Attach visual renderer for the 8-step grid.
  attachSimpleRhythmVisual(panel);

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
      panel.__seqRev++;
      rebuildSeqPattern();
    }
  } catch (e) {
    console.warn('[loopgrid] pending state apply failed', e);
  }

  const toyId = panel.dataset.toyid || panel.id || 'loopgrid';
  panel.__audioToyId = toyId;

  // Create gated trigger for audio generation guard
  const playNote = gateTriggerForToy(panel.__audioToyId, triggerInstrument);

  try {
    if (panel.dataset.instrument) setToyInstrument(panel.__audioToyId, panel.dataset.instrument);
  } catch {}

  function setInstrument(name){
    if (!name) return;
    // The instrument ID is case-sensitive and should not be lowercased.
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

  panel.__playCurrent = (step = -1, when, reason = 'unknown') => {
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

    lgDbg(2, '__playCurrent', { step, instrument, note, whenIn: when, whenUse: w, reason, audioId: panel.__audioToyId });

    lgTrackPlay({
      kind: 'manual',
      toyId: panel.__audioToyId,
      col: step,
      whenSec: w,
      instrument,
      note,
      reason
    });
    playNote(instrument, note, w);
  };

  // Listen for note changes from the visual module to provide audio feedback.
  panel.addEventListener('grid:notechange', (e) => {
    const col = e?.detail?.col;
    lgDbg(2, 'grid:notechange', { col, detail: e?.detail });
    if (col >= 0 && panel.__playCurrent) {
      panel.__playCurrent(col, undefined, 'audition:grid:notechange');
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
    panel.__seqRev++;
    rebuildSeqPattern();
  });
  panel.addEventListener('toy-clear', () => {
    if (!panel.__gridState?.steps) return;
    panel.__gridState.steps.fill(false);
    // Also reset the notes for each step back to the default (C4).
    if (panel.__gridState.noteIndices) panel.__gridState.noteIndices.fill(12);
    emitLoopgridUpdate({ reason: 'clear' });
    panel.__seqRev++;
    rebuildSeqPattern();
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
    panel.__seqRev++;
    rebuildSeqPattern();
  });

  panel.__beat = () => {};

  panel.__sequencerStep = (col) => {
    markPlayingColumn(panel, col);
    if (panel.__gridState.steps[col]) {
      if (!window.__NOTE_SCHEDULER_ENABLED) {
        panel.__playCurrent(col, undefined, 'play:sequencerStep');
      } else {
        // Scheduler owns audio; step is visual-only.
      }
      panel.__pulseHighlight = 1.0; // For border pulse animation
      panel.__pulseRearm = true;
      // Trigger visual flashes and particle burst.
      const vis = panel.__simpleRhythmVisualState;
      if (vis) {
        // Flash for the individual cube.
        if (vis.flash) vis.flash[col] = 1.0;
        // Flash for the main background.
        vis.bgFlash = 1.0;
        try {
          vis.particleField?.pulse?.(0.85);
          vis.triggerNoteParticleBurst?.(col);
        } catch {}
      }
    }
  };

  panel.__sequencerSchedule = (col, when) => {
    const pat = panel.__seqPatternActive || panel.__seqPattern;
    if (!pat || !pat.steps || !pat.noteIndices) return;
    if (!pat.steps[col]) return;

    const instrument = pat.instrument || (panel.dataset.instrument || 'tone');
    const noteIndex = pat.noteIndices[col];
    const midi = panel.__gridState.notePalette[noteIndex];
    const note = midiToName(midi);
    try {
      if (window.__LOOPGRID_AUDIO_DEBUG) {
        console.log('[loopgrid][schedule->play]', {
          panelId: panel?.id,
          dataToyId: panel?.dataset?.toyid,
          audioToyId: panel.__audioToyId,
          col,
          when,
          instrument,
          note
        });
      }
    } catch {}
    lgTrackPlay({
      kind: 'scheduled',
      toyId: panel.__audioToyId,
      col,
      whenSec: when,
      instrument,
      note,
      reason: 'play:sequencerSchedule'
    });
    lgDbg(2, '__sequencerSchedule', { col, when, instrument, note });
    playNote(instrument, note, when);
  };
 
  return panel;
}
