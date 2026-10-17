import { drawGridPlaybackVisuals } from './dg-playback-visuals.js';
import {getCurrentPlaybackOccurrence} from '../playback-context.js';
import {drawgridLoopLengthTicks} from './dg-pattern-length.js';
import { panelTransportBindings } from '../panel-transport.js';
// src/drawgrid-player.js
import { triggerInstrument } from '../audio-samples.js';
import { gateTriggerForToy, bumpToyAudioGen } from '../toy-audio.js';
import { buildPalette, midiToName } from '../note-helpers.js';
import { resumeAudioContextIfNeeded, ensureAudioContext } from '../audio-core.js';
import {
  activatePlaybackInstance,
  deactivatePlaybackInstance,
  ensurePlaybackInstance,
  getPlaybackInstance,
  removePlaybackInstance,
} from '../playback-instances.js';

// IMPORTANT:
// data-toyid may represent chain/group identity and can be shared across panels.
// For audio routing + generation gating we need a UNIQUE id per panel instance.
function getAudioToyId(panel) {
  if (!panel) return '';
  try {
    const existing = panel.dataset?.audiotoyid;
    if (existing) return existing;
  } catch {}

  // Always generate a dedicated id. Do NOT reuse panel.id:
  // during chain-create / cloning, DOM ids can be duplicated briefly or accidentally,
  // which causes cross-toy audio routing and scheduling collisions.
  const base = panel.id ? `${panel.id}_` : '';
  const gen = `audiotoy_${base}${Math.random().toString(36).slice(2, 10)}`;
  try { panel.dataset.audiotoyid = gen; } catch {}
  return gen;
}

function isNoteSchedulerEnabled() {
  try { return !!window.__NOTE_SCHEDULER_ENABLED; } catch { return false; }
}

// Default drawgrid-player debug OFF (enable in DevTools: window.__DRAWGRID_PLAYER_DEBUG = true)
try { if (window.__DRAWGRID_PLAYER_DEBUG === undefined) window.__DRAWGRID_PLAYER_DEBUG = false; } catch {}

export function connectDrawGridToPlayer(panel) {
  if (!panel || panel.__drawGridPlayer) return;
  panel.__drawGridPlayer = true;
  const { isRunning: isTransportRunning, getTransportState } = panelTransportBindings(panel);

  const toyId = getAudioToyId(panel) || 'drawgrid';
  panel.__audioToyId = toyId;
  const initialTransport = getTransportState();
  if (isTransportRunning()) {
    activatePlaybackInstance(panel.id, initialTransport.currentTick, {
      loopLengthTicks: drawgridLoopLengthTicks(panel.dataset.steps),
      quantize: true,
    });
  } else {
    ensurePlaybackInstance(panel.id, { active: true, startTick: initialTransport.currentTick, loopLengthTicks: drawgridLoopLengthTicks(panel.dataset.steps) });
  }
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
  const playNote = gateTriggerForToy(panel.__audioToyId, (inst, note, when, audioId, options) => {
    return triggerInstrument(inst, note, when, audioId, { ...options,
      onPlaybackScheduled(admission) {
        if (options?.source !== 'drawgrid:sequencer') return;
        const occurrence = admission.occurrence;
        const owner = occurrence?.instanceToyId || panel.id;
        const transport = panelTransportBindings(document.getElementById(owner) || panel);
        drawGridPlaybackVisuals.enqueue({
          toyId: owner, transportId: occurrence?.transportId || getPlaybackInstance(owner)?.transportId,
          eventTick: occurrence?.eventTick ?? transport.audioTimeToTick(admission.when),
          dueTick: transport.audioTimeToTick(admission.when),
          occurrence, col: options.col, row: options.row, when: admission.when, note: admission.note,
        });
      },
    });
  }, { scheduleAhead: true });

  const activateAtTransport = ({ retrigger = false } = {}) => {
    const transport = getTransportState();
    const existing = getPlaybackInstance(panel.id);
    const instance = activatePlaybackInstance(panel.id, transport.currentTick, {
      loopLengthTicks: drawgridLoopLengthTicks(panel.dataset.steps),
      quantize: transport.state === 'playing',
      retrigger,
    });
    if (instance !== existing) {
      bumpToyAudioGen(panel.__audioToyId, retrigger ? 'drawgrid-retrigger' : 'drawgrid-activate');
      panel.__forceSchedulerReset = true;
    }
    return instance;
  };
  panel.__drawGridPlayback = {
    get instance(){ return getPlaybackInstance(panel.id); },
    activate: () => activateAtTransport({ retrigger: false }),
    retrigger: () => activateAtTransport({ retrigger: true }),
    deactivate: () => {
      const instance = deactivatePlaybackInstance(panel.id);
      bumpToyAudioGen(panel.__audioToyId, 'drawgrid-deactivate');
      panel.__forceSchedulerReset = true;
      return instance;
    },
  };
  panel.addEventListener('toy:start', () => panel.__drawGridPlayback.activate());
  panel.addEventListener('toy:retrigger', () => panel.__drawGridPlayback.retrigger());
  panel.addEventListener('toy:deactivate', () => panel.__drawGridPlayback.deactivate());
  panel.addEventListener('toy-remove', () => {
    deactivatePlaybackInstance(panel.id);
    removePlaybackInstance(panel.id);
  }, { once: true });

  panel.addEventListener('drawgrid:update', (e) => {
    const map = e?.detail?.map || (e?.detail && e.detail.nodes ? { nodes: e.detail.nodes } : null);
    steps = e?.detail?.steps ?? (map?.nodes?.length ?? 16);
    const loopTicks=drawgridLoopLengthTicks(steps),previousLoop=getPlaybackInstance(panel.id)?.loopLengthTicks;
    ensurePlaybackInstance(panel.id,{loopLengthTicks:loopTicks});
    if(previousLoop!==loopTicks)panel.dispatchEvent(new CustomEvent('toy:pattern-length',{bubbles:true}));
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

  // When a user clicks a node to unmute (re-enable) it, audition that note once.
  panel.addEventListener('drawgrid:node-toggle', (e) => {
    // Do not audition while the scene/transport is playing.
    if (typeof isTransportRunning === 'function' && isTransportRunning()) return;

    const col = e?.detail?.col;
    const row = e?.detail?.row;
    const disabled = e?.detail?.disabled;
    if (!Number.isInteger(col) || !Number.isInteger(row)) return;
    if (disabled !== false) return;
    const midiNote = notePalette[row];
    if (midiNote === undefined) return;
    try { resumeAudioContextIfNeeded?.().catch?.(() => {}); } catch {}
    const when = (ensureAudioContext()?.currentTime ?? 0) + 0.01;
    playNote(instrument, midiToName(midiNote), when, {
      slotIndex: col,
      col,
      step: col,
      index: col,
      source: 'drawgrid:node-toggle',
    });
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
    playNote(instrument, midiToName(midiNote), undefined, {
      slotIndex: col,
      col,
      step: col,
      index: col,
      source: 'drawgrid:preview-drag',
    });
  }

  panel.addEventListener('drawgrid:node-drag-end', (e) => {
    const col = e?.detail?.col;
    const row = e?.detail?.row;
    previewDraggedNote(col, row)?.catch?.(() => {});
  });

  // Seed an initial snapshot (so deterministic works immediately)
  if (!panel.__seqPattern) {
    panel.__seqPattern = cloneDrawgridPattern(gridState, steps, instrument);
    if (window.__DRAWGRID_PLAYER_DEBUG) {
      console.log('[drawgrid-player] seeded initial pattern', { steps, nodesPerCol: gridState.nodes.map(n => n.size) });
    }
  }

  // Debug: log when pattern is updated
  const originalSeqTouch = panel.__seqTouch;
  panel.__seqTouch = (reason = 'user') => {
    if (window.__DRAWGRID_PLAYER_DEBUG) {
      console.log('[drawgrid-player] __seqTouch called', { reason, steps, nodesPerCol: gridState.nodes.map(n => n.size) });
    }
    originalSeqTouch?.(reason);
  };

  panel.__sequencerStep = col => {
    if (!isNoteSchedulerEnabled()) panel.__sequencerSchedule(col, ensureAudioContext().currentTime);
  };

  panel.__sequencerSchedule = (col, when) => {
    // Debug tripwire: if step is also firing audio, you'll still hear doubles even though scheduler calls once.
    // Keep this for now.
    // console.log('[drawgrid schedule]', panel.id, col, when);
    
    // Always use panel's current pattern (set by drawgrid:update events or initial seed).
    // This ensures we pick up the latest state even if scheduler's copy is stale.
    let pat = panel.__seqPatternActive;
    if (!pat) {
      pat = panel.__seqPattern || null;
    }
    
    // If still no pattern, create a fresh snapshot from current gridState
    // This handles the case where the pattern hasn't been initialized yet
    if (!pat) {
      pat = cloneDrawgridPattern(gridState, steps, instrument);
      console.log('[drawgrid-player] created fresh pattern on schedule', { steps, col, when, nodesPerCol: pat.cols.map(c => c.nodes.length) });
    }
    
    try {
      if (window.__SCHED_MISMATCH_DEBUG) {
        const lastResumeAt = Number(window.__NOTE_SCHED_LAST_RESUME_AT);
        const now = ensureAudioContext()?.currentTime ?? 0;
        if (Number.isFinite(lastResumeAt) && (now - lastResumeAt) < 0.5) {
          const payload = {
            panelId: panel?.id,
            col,
            when,
            now,
            hasPat: !!pat,
            patSteps: pat?.steps,
            patCols: Array.isArray(pat?.cols) ? pat.cols.length : 0,
          };
          console.log('[drawgrid-player][resume-schedule] ' + JSON.stringify(payload));
        }
      }
    } catch {}

    if (!pat || !pat.cols || col < 0 || col >= pat.steps) {
      try {
        if (window.__SCHED_MISMATCH_DEBUG) {
          const lastResumeAt = Number(window.__NOTE_SCHED_LAST_RESUME_AT);
          const now = ensureAudioContext()?.currentTime ?? 0;
          if (Number.isFinite(lastResumeAt) && (now - lastResumeAt) < 0.5) {
            const payload = { panelId: panel?.id, col, when, hasPat: !!pat, patSteps: pat?.steps, patCols: pat?.cols?.length };
            console.log('[drawgrid-player][resume-skip][no-pattern] ' + JSON.stringify(payload));
          }
        }
      } catch {}
      console.log('[drawgrid-player] schedule early return', { hasPat: !!pat, patCols: pat?.cols?.length, patSteps: pat?.steps, col, steps });
      return;
    }

    // Schedule drawgrid effects (flash/particles/etc) at the actual play time.


    // Authoritative guard: NEVER schedule audio if this toy isn't in the active set.
    // (Chain DOM flags can be stale during transitions.)
    try {
      const activeList = Array.isArray(window.__mtActiveToyIds) ? window.__mtActiveToyIds : null;
      const panelId = getCurrentPlaybackOccurrence()?.instanceToyId || panel?.id || '';
      if (activeList && panelId && !activeList.includes(panelId)) {
        if (window.__SCHED_MISMATCH_DEBUG) {
          console.warn('[sched][MISMATCH][drawgrid] blocked schedule (not active)', {
            panelId,
            dataToyId: panel?.dataset?.toyid,
            audioToyId: panel?.__audioToyId,
            chainActive: panel?.dataset?.chainActive,
            col,
            when,
            tick: window.__mtSchedTick,
            activeToyIds: activeList,
            chainState: window.__mtChainState,
            nowAt: window.__mtNowAt,
          });
        }
        return;
      }
    } catch {}

    // DEBUG (authoritative): the scheduler should only schedule toys that are in the
    // active set computed inside tickAudioScheduler (window.__mtActiveToyIds).
    // dataset.chainActive is a DOM flag and can be stale / unset during transitions.
    try {
      if (window.__SCHED_MISMATCH_DEBUG) {
        const activeList = Array.isArray(window.__mtActiveToyIds) ? window.__mtActiveToyIds : [];
        const panelId = getCurrentPlaybackOccurrence()?.instanceToyId || panel?.id || '';
        const inActiveSet = !!panelId && activeList.includes(panelId);
        if (!inActiveSet) {
          console.warn('[sched][MISMATCH][drawgrid] scheduled while NOT in active set', {
            panelId,
            dataToyId: panel?.dataset?.toyid,
            audioToyId: panel?.__audioToyId,
            chainActive: panel?.dataset?.chainActive,
            col,
            when,
            tick: window.__mtSchedTick,
            activeToyIds: activeList,
            activeCount: activeList.length,
            chainState: window.__mtChainState,
            nowAt: window.__mtNowAt,
          });
        }
      }
    } catch {}

    const c = pat.cols[col];
    if (!c || !c.active || !c.nodes || c.nodes.length === 0) {
      if (window.__DRAWGRID_PLAYER_DEBUG) console.log('[drawgrid-player] column not active/empty', { col, hasC: !!c, active: c?.active, nodesCount: c?.nodes?.length });
      try {
        if (window.__SCHED_MISMATCH_DEBUG) {
          const lastResumeAt = Number(window.__NOTE_SCHED_LAST_RESUME_AT);
          const now = ensureAudioContext()?.currentTime ?? 0;
          if (Number.isFinite(lastResumeAt) && (now - lastResumeAt) < 0.5) {
            const payload = { panelId: panel?.id, col, when, active: c?.active, nodesCount: c?.nodes?.length };
            console.log('[drawgrid-player][resume-skip][empty-col] ' + JSON.stringify(payload));
          }
        }
      } catch {}
      return;
    }

    try {
      if (window.__SCHED_MISMATCH_DEBUG) {
        const lastResumeAt = Number(window.__NOTE_SCHED_LAST_RESUME_AT);
        const now = ensureAudioContext()?.currentTime ?? 0;
        if (Number.isFinite(lastResumeAt) && (now - lastResumeAt) < 0.5) {
          const payload = {
            panelId: panel?.id,
            col,
            when,
            now,
            nodes: Array.isArray(c.nodes) ? c.nodes.slice(0, 16) : [],
            nodesCount: Array.isArray(c.nodes) ? c.nodes.length : 0,
            disabledCount: Array.isArray(c.disabled) ? c.disabled.length : 0,
          };
          console.log('[drawgrid-player][resume-col] ' + JSON.stringify(payload));
        }
      }
    } catch {}

    // Use snapshot data only (deterministic).

    const disabledSet = new Set(c.disabled || []);

    let loggedResumePlay = false;
    for (const row of c.nodes) {
      if (typeof row !== 'number' || Number.isNaN(row)) continue;
      if (disabledSet.has(row)) continue;

      const midiNote = notePalette[row];
      if (midiNote === undefined) continue;

      try {
        if (!loggedResumePlay && window.__SCHED_MISMATCH_DEBUG) {
          const lastResumeAt = Number(window.__NOTE_SCHED_LAST_RESUME_AT);
          const now = ensureAudioContext()?.currentTime ?? 0;
          if (Number.isFinite(lastResumeAt) && (now - lastResumeAt) < 0.5) {
            const payload = { panelId: panel?.id, col, when, row, midiNote, instrument: pat.instrument || instrument };
            console.log('[drawgrid-player][resume-play] ' + JSON.stringify(payload));
            loggedResumePlay = true;
          }
        }
      } catch {}

      playNote(pat.instrument || instrument, midiToName(midiNote), when, {
        slotIndex: col,
        col,
        step: col,
        index: col,
        row,
        source: 'drawgrid:sequencer',
      });
    }
  };
}
