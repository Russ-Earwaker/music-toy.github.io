// src/note-scheduler.js
// Central scheduler for grid-based toys: schedules audio ahead of time so playback stays correct at low FPS.
// 
// DEBUG FLAG: Set window.__CHAIN_NOTE_SCHEDULER_DEBUG = true to enable detailed logging

import { ensureAudioContext } from './audio-core.js';
import { bumpToyAudioGen } from './toy-audio.js';

// --- GLOBAL scheduler state ---
// If we accidentally create multiple scheduler instances (rebuilds / double-start),
// local state won't de-dupe across them, causing doubled notes.
// We intentionally share state across instances to hard-prevent duplicate scheduling.
const __GLOBAL_SCHED_STATE = new Map(); // toyId -> per-toy state
let __SCHED_INSTANCE_SEQ = 1;

// When the transport pauses, wipe scheduler de-dupe state so a new run starts clean.
// (Prevents leftover scheduled keys from affecting the first couple beats after resume.)
try {
  if (!window.__NOTE_SCHED_PAUSE_CLEAR_INSTALLED) {
    window.__NOTE_SCHED_PAUSE_CLEAR_INSTALLED = true;
    document.addEventListener('transport:pause', () => {
      try { __GLOBAL_SCHED_STATE.clear(); } catch {}
    });
  }
} catch {}

// Default scheduler debug OFF (enable in DevTools: window.__CHAIN_NOTE_SCHEDULER_DEBUG = true)
try {
  if (window.__CHAIN_NOTE_SCHEDULER_DEBUG === undefined) window.__CHAIN_NOTE_SCHEDULER_DEBUG = false;
} catch {}

// Debug helper that can be enabled at runtime
function isDebugEnabled() {
  try {
    return !!(window.__CHAIN_NOTE_SCHEDULER_DEBUG || window.__CHAIN_DEBUG_FIRST_STEP);
  } catch { return false; }
}

export function createSequencerScheduler({ lookaheadSec = 0.2, leadSec = 0.01, lateGraceSec = 0.04 } = {}) {
  const __schedId = __SCHED_INSTANCE_SEQ++;
  const state = __GLOBAL_SCHED_STATE; // shared across instances on purpose
  const col0GraceSec = Math.min(0.06, Math.max(0.01, leadSec));
  let probeLastTs = 0;
  const effectiveLateGraceSec = Number.isFinite(lateGraceSec) ? lateGraceSec : 0.04;
  let lastPhase = null;
  let lastWrapAt = 0;

  function getState(key) {
    if (!state.has(key)) {
      state.set(key, {
        lastBarStart: -1,
        scheduled: new Set(),
        preScheduledCol0At: null,
        lastProbeBarIndex: null,
        lastScheduledByCol: new Map(),
        scheduledCol0InCurrentBar: false,
        scheduledCol7InCurrentBar: false,

        // Deterministic pattern cache (only changes when user edits toy)
        seqRevSeen: -1,
        seqPattern: null,
      });
    }
    return state.get(key);
  }

  // --- Deterministic pattern helpers ---
  function getToySeqRev(toy) {
    try {
      const v = toy?.__seqRev;
      return Number.isFinite(v) ? v : 0;
    } catch { return 0; }
  }

  function getToySeqPattern(toy) {
    try {
      // Deterministic contract: scheduler never builds. Toys build snapshots on user edits.
      return toy.__seqPattern || null;
    } catch { return null; }
  }

  function tick({ activeToyIds, getToy, loopInfo, nowAt } = {}) {
    try {
      if (!activeToyIds || !activeToyIds.size || !loopInfo) return;
      const barLen = Number(loopInfo.barLen) || 0;
      if (!Number.isFinite(barLen) || barLen <= 0) return;
      const loopStart = Number(loopInfo.loopStartTime) || 0;
      const now = Number.isFinite(nowAt) ? nowAt : (ensureAudioContext()?.currentTime ?? 0);
      if (!Number.isFinite(now)) return;
      const lastResumeAt = Number(window.__NOTE_SCHED_LAST_RESUME_AT);
      const justResumed = Number.isFinite(lastResumeAt) && (now - lastResumeAt) < 0.25;

      const baseWindowStart = (now + Math.max(0, leadSec)) - Math.max(0, effectiveLateGraceSec);
      const windowStart = Math.max(now - 0.1, baseWindowStart);
      const windowEnd = now + Math.max(0.05, lookaheadSec);
      const phase = Number(loopInfo.phase01);
      if (Number.isFinite(phase)) {
        if (Number.isFinite(lastPhase) && phase < lastPhase) {
          lastWrapAt = now;
        }
        lastPhase = phase;
      }
      // NOTE: barStart is computed per-toy below (to support per-toy restarts).
      const barStartDebug = loopStart + Math.floor((now - loopStart) / barLen) * barLen;
      const barIndex = Math.floor((now - loopStart) / barLen);
      const barStart = loopStart + barIndex * barLen;

      // Detect if a chained toy just activated (for suppress logic)
      let chainActivatedToyId = null;
      let chainActivatedParent = null;
      for (const id of activeToyIds) {
        const t = getToy ? getToy(id) : document.getElementById(id);
        if (!t || !t.__chainJustActivated) continue;
        const isCh = !!(t.dataset?.prevToyId || t.dataset?.nextToyId || t.dataset?.chainParent);
        if (!isCh) continue;
        chainActivatedToyId = id;
        chainActivatedParent = t.dataset?.chainParent || null;
        break;
      }

      if (window.__AUDIO_TIMING_PROBE) {
        const ts = performance?.now?.() ?? Date.now();
        if (!probeLastTs || (ts - probeLastTs) > 1000) {
          probeLastTs = ts;
          console.log('[note-scheduler][probe]', {
            schedId: __schedId,
            active: activeToyIds.size,
            now,
            windowStart,
            windowEnd,
            barStart: barStartDebug,
            phase,
          });
        }
      }

      activeToyIds.forEach((toyId) => {
        const toy = getToy ? getToy(toyId) : document.getElementById(toyId);
        if (!toy || typeof toy.__sequencerSchedule !== 'function') return;

        const steps = parseInt(toy.dataset.steps, 10) || 8;
        if (!Number.isFinite(steps) || steps <= 0) return;
        const stepLen = barLen / steps;
        if (!Number.isFinite(stepLen) || stepLen <= 0) return;

        const toyState = getState(toyId);

        // If the host code requested a hard reset, clear any pending scheduled state.
        if (toy.__forceSchedulerReset) {
          try {
            toyState.lastBarStart = -1;
            toyState.scheduled?.clear?.();
            toyState.preScheduledCol0At = null;
            toyState.lastScheduledByCol?.clear?.();
          } catch {}
          try { toy.__forceSchedulerReset = false; } catch {}
        }

        // Support per-toy restarts: override the loopStart for this toy only.
        let toyLoopStart = loopStart;
        try {
          const ovr = Number(toy.__loopStartOverrideSec);
          if (Number.isFinite(ovr)) toyLoopStart = ovr;
        } catch {}

        const toyBarIndex = Math.floor((now - toyLoopStart) / barLen);
        const toyBarStart = toyLoopStart + toyBarIndex * barLen;
        // Check if this toy is part of a chain
        const isChained = !!(toy.dataset?.prevToyId || toy.dataset?.nextToyId || toy.dataset?.chainParent);
        const thisChainParent = toy.dataset?.chainParent || null;

        // --- Deterministic pattern snapshot (locks notes until user edits toy) ---
        const seqRev = getToySeqRev(toy);
        if (toyState.seqRevSeen !== seqRev || !toyState.seqPattern) {
          toyState.seqRevSeen = seqRev;
          toyState.seqPattern = getToySeqPattern(toy);
        }

        // If some chained toy just activated, do not allow adjacent toys
        // in the same chain to schedule during this tick.
        if (chainActivatedToyId && toyId !== chainActivatedToyId && isChained) {
          const sameParent = chainActivatedParent && thisChainParent === chainActivatedParent;
          const directlyAdjacent =
            toy.dataset?.nextToyId === chainActivatedToyId ||
            toy.dataset?.prevToyId === chainActivatedToyId;

          if (sameParent || directlyAdjacent) {
            toyState.scheduledCol0InCurrentBar = false;
            return;
          }
        }

        // Use per-toy bar start from override (if any)
        const barStart = toyBarStart;
        if (toyState.lastBarStart !== barStart) {
          toyState.lastBarStart = barStart;
          toyState.scheduledCol7InCurrentBar = false;
          toyState.scheduledCol0InCurrentBar = false;
          toyState.preScheduledCol0At = null;
        }

        // Prune old scheduled entries
        let scheduledAny = false;

        // IMPORTANT:
        // We must not early-return for chained toys immediately after wrap.
        // That creates a silent gap at bar start, then col0 gets scheduled late,
        // bunching it closer to col1 ("fast first 2 notes").
        // We rely on per-column guards (justWrappedByScheduler + minColGapSec) instead.
        const justWrapped = Number.isFinite(lastWrapAt) && (now - lastWrapAt) < 0.08;
        if (isChained && justWrapped && isDebugEnabled()) {
          console.log('[note-scheduler] wrap tick (chained) — no skip', { toyId, now, barStart });
        }
        const justActivated = !!toy.__chainJustActivated;
        if (justActivated && isChained) {
          const audioId = toy.__audioToyId || toy.dataset?.toyid || toyId;
          try { bumpToyAudioGen(audioId); } catch {}
          if (isDebugEnabled()) {
            console.log('[note-scheduler] chain activate -> bumped new toy only', { toyId, audioId });
          }

          // IMPORTANT: do NOT bump prev toy here.
          // The previous toy may already have valid notes scheduled for this bar.
          // Bumping its gen causes the audio gate to drop those scheduled notes (gen mismatch),
          // which looks like "notes skipping" immediately after adding a chained toy.
        }
        const windowStartToy = windowStart;
        const isFirstScheduleForChainedToy = justActivated && isChained;
        // For the first schedule cycle of a newly activated chained toy, extend the window
        // to include columns 0 and 1 (which are closer together), ensuring they get scheduled
        const scheduleNextBarCol0 = justActivated && isChained && Number.isFinite(phase) && phase > 0.9;
        const windowEndToy = isFirstScheduleForChainedToy || scheduleNextBarCol0
          ? Math.max(windowEnd, barStart + barLen, barStart + stepLen)
          : windowEnd;

        const barsToSchedule = isChained ? 1 : 2;
        const minColGapSec = Math.max(0.05, stepLen * 0.5);
        // Prune old scheduled keys so the per-toy set stays bounded.
        // Keys are numeric: key = whenMs*32 + col. Drop anything older than ~2 bars.
        try {
          const pruneBeforeMs = Math.round((now - Math.max(0.001, barLen * 2)) * 1000);
          if (Number.isFinite(pruneBeforeMs) && toyState.scheduled && toyState.scheduled.size) {
            for (const k of Array.from(toyState.scheduled)) {
              const tMs = Math.floor(Number(k) / 32);
              if (Number.isFinite(tMs) && tMs < pruneBeforeMs) toyState.scheduled.delete(k);
            }
          }
        } catch {}
        for (let b = 0; b < barsToSchedule; b++) {
          const base = barStart + b * barLen;
          for (let col = 0; col < steps; col++) {
            const when = base + col * stepLen;
            // Late scheduling grace: chain activation can cause a small hitch at bar start.
            // Allow late scheduling for the first few columns *only* on the first schedule cycle
            // after a chained toy activation.
            const lateBaseWindow = Math.max(col0GraceSec, 0.2);
            const lateWindow = isFirstScheduleForChainedToy ? Math.max(lateBaseWindow, stepLen * 1.25) : lateBaseWindow;

            // Allow late schedule for col0 always (existing behavior), and for col1/col2 only
            // right after chain activation (prevents "skipped" early notes due to DOM hitch).
            const allowLateEarlyCols =
              (col === 0) ||
              (isFirstScheduleForChainedToy && (col === 1 || col === 2));

            const isAllowedLateRaw = allowLateEarlyCols && (when < windowStartToy) && (when >= (now - lateWindow));

            // After a pause/resume, do NOT "backfill" early-bar notes.
            // Only allow late scheduling for chain activation hitch, not for transport resume.
            // After a pause/resume, do NOT backfill early-bar notes.
            // BUT: always allow col0 to be late-scheduled within the grace window,
            // otherwise the very first downbeat can be lost on the first playthrough.
            const isAllowedLate = isAllowedLateRaw && (!justResumed || isFirstScheduleForChainedToy || col === 0);
            // Skip column 0 if already scheduled in this bar
            if (col === 0 && toyState.scheduledCol0InCurrentBar) {
              continue;
            }
            const whenMs = Math.round(when * 1000);
            const key = (whenMs * 32) + col; // numeric key: time+col
            const lastColTime = toyState.lastScheduledByCol.get(col);
            // Calculate bar indices first
            const currentColBarIndex = Math.floor((when - loopStart) / barLen);
            const lastColBarIndex = Number.isFinite(lastColTime) ? Math.floor((lastColTime - loopStart) / barLen) : currentColBarIndex;
            const inSameBar = lastColBarIndex === currentColBarIndex;
            // Gap check: ensure minimum time between notes (prevents notes bunching up)
            if (Number.isFinite(lastColTime) && (when - lastColTime) < minColGapSec) {
              continue;
            }
            // Check if this column is within the scheduling window
            const isInWindow = when >= windowStartToy && when <= windowEndToy;
            if (!isInWindow && !isAllowedLate) {
              continue;
            }
            if (isDebugEnabled() && isAllowedLate) {
              console.log('[note-scheduler] late-allowed', { toyId, col, now, when });
            }
            // De-dupe: tick() runs repeatedly inside lookahead; without this we double-schedule.
            if (toyState.scheduled.has(key)) {
              if (isDebugEnabled()) {
                try { console.log('[note-scheduler][skip dup]', { schedId: __schedId, toyId, col, whenMs, key }); } catch {}
              }
              continue;
            }
            // Schedule the note
            toyState.scheduled.add(key);
            toyState.lastScheduledByCol.set(col, when);
            scheduledAny = true;
            // Mark that column 0 was scheduled in this bar
            if (col === 0) {
              toyState.scheduledCol0InCurrentBar = true;
            }
            // Mark that column 7 was scheduled in this bar (for chaining pre-schedule)
            if (col === steps - 1) {
              toyState.scheduledCol7InCurrentBar = true;
            }
            try {
              // Provide deterministic snapshot to toy implementation
              try { toy.__seqPatternActive = toyState.seqPattern; } catch {}
              try { toy.__seqRevActive = toyState.seqRevSeen; } catch {}
              if (isDebugEnabled()) {
                try {
                  console.log('[note-scheduler][schedule]', { schedId: __schedId, toyId, col, whenMs, key });
                } catch {}
              }
              toy.__sequencerSchedule(col, when);
            } catch {}
          }
        }
        // NOTE: We no longer pre-schedule next-bar col0. It caused doubled notes at chain handoff.
        if (justActivated && scheduledAny) {
          try { toy.__chainJustActivated = false; } catch {}
        }
      });
    } catch (e) {
      try {
        console.warn('[note-scheduler][tick error]', e);
      } catch {}
    }
  }

  function clearToy(toyId) {
    if (!toyId) return;
    state.delete(toyId);
  }

  return { tick, clearToy };
}
