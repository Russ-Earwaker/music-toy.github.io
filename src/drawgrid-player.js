// src/drawgrid-player.js
import { triggerInstrument } from './audio-samples.js';
import { gateTriggerForToy, getToyAudioGen } from './toy-audio.js';
import { buildPalette, midiToName } from './note-helpers.js';
import { resumeAudioContextIfNeeded, isRunning as isTransportRunning, ensureAudioContext } from './audio-core.js';

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

function markPlayingColumn(panel, colIndex){
  try{ panel.dispatchEvent(new CustomEvent('drawgrid:playcol', { detail:{ col: colIndex }, bubbles:true }));}catch{}
}

// Default drawgrid-player debug OFF (enable in DevTools: window.__DRAWGRID_PLAYER_DEBUG = true)
try { if (window.__DRAWGRID_PLAYER_DEBUG === undefined) window.__DRAWGRID_PLAYER_DEBUG = false; } catch {}

export function connectDrawGridToPlayer(panel) {
  if (!panel || panel.__drawGridPlayer) return;
  panel.__drawGridPlayer = true;

  const toyId = getAudioToyId(panel) || 'drawgrid';
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
        if (window.__DRAWGRID_PLAYER_DEBUG) console.log('[drawgrid effects]', { col, when });
        return true;
      }
    } catch {}
    return false;
  }

  // Schedule drawgrid effects (flash/particles/etc) at the actual play time.
  function scheduleDrawgridEffects(panel, col, when) {
    try {
      const ctx = ensureAudioContext?.() || null;
      const now = ctx?.currentTime;
      if (!Number.isFinite(now) || !Number.isFinite(when)) {
        // Fallback: fire immediately
        markPlayingColumn(panel, col);
        panel.__pulseHighlight = 1.0;
        panel.__pulseRearm = true;
        return;
      }

      // Avoid duplicate effect triggers for the same (col, when)
      panel.__dgFxKeys = panel.__dgFxKeys || new Set();
      panel.__dgFxTimeouts = panel.__dgFxTimeouts || new Set();
      const k = `${col}@${Math.round(when * 1000)}`;
      if (panel.__dgFxKeys.has(k)) return;
      panel.__dgFxKeys.add(k);

      const delayMs = Math.max(0, (when - now) * 1000 - 2);

      // Capture generation at schedule time. Pause/delete bumps gen, invalidating these.
      const genAtSchedule = getToyAudioGen(panel.__audioToyId);

      const tid = setTimeout(() => {
        try {
          // If paused/stopped OR the toy has been invalidated (pause/delete/chain switch), do nothing.
          if (!isTransportRunning()) {
            try {
              if (window.__SCHED_MISMATCH_DEBUG) {
                const lastResumeAt = Number(window.__NOTE_SCHED_LAST_RESUME_AT);
                const nowDbg = ensureAudioContext()?.currentTime ?? 0;
                if (Number.isFinite(lastResumeAt) && (nowDbg - lastResumeAt) < 0.5) {
                  console.log('[drawgrid-player][resume-fx-skip] ' + JSON.stringify({ panelId: panel?.id, col, when, reason: 'transport', now: nowDbg }));
                }
              }
            } catch {}
            return;
          }
          if (getToyAudioGen(panel.__audioToyId) !== genAtSchedule) {
            try {
              if (window.__SCHED_MISMATCH_DEBUG) {
                const lastResumeAt = Number(window.__NOTE_SCHED_LAST_RESUME_AT);
                const nowDbg = ensureAudioContext()?.currentTime ?? 0;
                if (Number.isFinite(lastResumeAt) && (nowDbg - lastResumeAt) < 0.5) {
                  console.log('[drawgrid-player][resume-fx-skip] ' + JSON.stringify({ panelId: panel?.id, col, when, reason: 'gen-mismatch', now: nowDbg }));
                }
              }
            } catch {}
            return;
          }
          if (!document.body.contains(panel)) {
            try {
              if (window.__SCHED_MISMATCH_DEBUG) {
                const lastResumeAt = Number(window.__NOTE_SCHED_LAST_RESUME_AT);
                const nowDbg = ensureAudioContext()?.currentTime ?? 0;
                if (Number.isFinite(lastResumeAt) && (nowDbg - lastResumeAt) < 0.5) {
                  console.log('[drawgrid-player][resume-fx-skip] ' + JSON.stringify({ panelId: panel?.id, col, when, reason: 'disconnected', now: nowDbg }));
                }
              }
            } catch {}
            return;
          }

          markPlayingColumn(panel, col);
          panel.__pulseHighlight = 1.0;
          panel.__pulseRearm = true;
        } catch {}
        // let keys expire
        try { setTimeout(() => panel.__dgFxKeys?.delete?.(k), 1000); } catch {}
        try { panel.__dgFxTimeouts?.delete?.(tid); } catch {}
      }, delayMs);
      try { panel.__dgFxTimeouts.add(tid); } catch {}
    } catch {
      // fallback immediate
      try {
        markPlayingColumn(panel, col);
        panel.__pulseHighlight = 1.0;
        panel.__pulseRearm = true;
      } catch {}
    }
  }

  // Best-effort cleanup: if transport pauses, clear pending fx timeouts so nothing "ticks" visually.
  // (Even without this, the gen gate above prevents post-pause triggers.)
  try {
    panel.__dgOnTransportPause = panel.__dgOnTransportPause || (() => {
      try {
        if (panel.__dgFxTimeouts) {
          for (const tid of Array.from(panel.__dgFxTimeouts)) {
            try { clearTimeout(tid); } catch {}
          }
          panel.__dgFxTimeouts.clear();
        }
        if (panel.__dgFxKeys) panel.__dgFxKeys.clear();
      } catch {}
    });
    document.addEventListener('transport:pause', panel.__dgOnTransportPause);
  } catch {}

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
    console.log('[drawgrid-player] seeded initial pattern', { steps, nodesPerCol: gridState.nodes.map(n => n.size) });
  }

  // Debug: log when pattern is updated
  const originalSeqTouch = panel.__seqTouch;
  panel.__seqTouch = (reason = 'user') => {
    console.log('[drawgrid-player] __seqTouch called', { reason, steps, nodesPerCol: gridState.nodes.map(n => n.size) });
    originalSeqTouch?.(reason);
  };

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
    scheduleDrawgridEffects(panel, col, when);

    // Authoritative guard: NEVER schedule audio if this toy isn't in the active set.
    // (Chain DOM flags can be stale during transitions.)
    try {
      const activeList = Array.isArray(window.__mtActiveToyIds) ? window.__mtActiveToyIds : null;
      const panelId = panel?.id || '';
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
        const panelId = panel?.id || '';
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
    let columnTriggered = false;
    const disabledSet = new Set(c.disabled || []);

    let loggedResumePlay = false;
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

      playNote(pat.instrument || instrument, midiToName(midiNote), when);
    }
  };
}
