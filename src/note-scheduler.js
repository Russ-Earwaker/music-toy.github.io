// src/note-scheduler.js
// Central scheduler for grid-based toys: schedules audio ahead of time so playback stays correct at low FPS.
// 
// DEBUG FLAG: Set window.__CHAIN_NOTE_SCHEDULER_DEBUG = true to enable detailed logging

import { ensureAudioContext } from './audio-core.js';
import { bumpToyAudioGen } from './toy-audio.js';

// Default scheduler debug ON (can be disabled in DevTools by setting false)
try {
  if (window.__CHAIN_NOTE_SCHEDULER_DEBUG === undefined) window.__CHAIN_NOTE_SCHEDULER_DEBUG = true;
} catch {}

// Debug helper that can be enabled at runtime
function isDebugEnabled() {
  try {
    return !!(window.__CHAIN_NOTE_SCHEDULER_DEBUG || window.__CHAIN_DEBUG_FIRST_STEP);
  } catch { return false; }
}

// Rate-limited event logger
function dbgEvent(key, payload) {
  if (!isDebugEnabled()) return;
  try {
    window.__NOTE_SCHED_DBG = window.__NOTE_SCHED_DBG || { last: new Map() };
    const now = performance?.now?.() ?? Date.now();
    const last = window.__NOTE_SCHED_DBG.last.get(key) || 0;
    // rate limit each key to once per ~250ms
    if ((now - last) < 250) return;
    window.__NOTE_SCHED_DBG.last.set(key, now);
    console.log('[note-scheduler][dbg]', key, payload);
  } catch {}
}

export function createSequencerScheduler({ lookaheadSec = 0.2, leadSec = 0.01, lateGraceSec = 0.04 } = {}) {
  const state = new Map(); // toyId -> { lastBarStart, scheduled:Set, preScheduledCol0At, lastProbeBarIndex, lastScheduledByCol:Map }
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

      if (isDebugEnabled()) {
        dbgEvent('tick', {
          now,
          barIndex,
          barStart,
          phase,
          activeCount: activeToyIds.size,
          chainActivatedToyId,
          chainActivatedParent,
        });
      }

      if (window.__AUDIO_TIMING_PROBE) {
        const ts = performance?.now?.() ?? Date.now();
        if (!probeLastTs || (ts - probeLastTs) > 1000) {
          probeLastTs = ts;
          console.log('[note-scheduler][probe]', {
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
        // Check if this toy is part of a chain
        const isChained = !!(toy.dataset?.prevToyId || toy.dataset?.nextToyId || toy.dataset?.chainParent);
        const thisChainParent = toy.dataset?.chainParent || null;

        // --- Deterministic pattern snapshot (locks notes until user edits toy) ---
        const seqRev = getToySeqRev(toy);
        if (toyState.seqRevSeen !== seqRev || !toyState.seqPattern) {
          toyState.seqRevSeen = seqRev;
          toyState.seqPattern = getToySeqPattern(toy);

          if (isDebugEnabled()) {
            dbgEvent('deterministic-pattern-refresh', {
              toyId,
              seqRev,
              hasPattern: !!toyState.seqPattern,
            });
          }
        }

        // If some chained toy just activated, do not allow adjacent toys
        // in the same chain to schedule during this tick.
        if (chainActivatedToyId && toyId !== chainActivatedToyId && isChained) {
          const sameParent = chainActivatedParent && thisChainParent === chainActivatedParent;
          const directlyAdjacent =
            toy.dataset?.nextToyId === chainActivatedToyId ||
            toy.dataset?.prevToyId === chainActivatedToyId;

          if (sameParent || directlyAdjacent) {
            if (isDebugEnabled()) {
              dbgEvent('suppress-other-toy', {
                suppressedToyId: toyId,
                activatedToyId: chainActivatedToyId,
                sameParent,
                directlyAdjacent,
                chainActivatedParent,
                thisChainParent,
                prevToyId: toy.dataset?.prevToyId,
                nextToyId: toy.dataset?.nextToyId,
              });
            }
            toyState.scheduledCol0InCurrentBar = false;
            return;
          }
        }

        if (toyState.lastBarStart !== barStart) {
          toyState.lastBarStart = barStart;
          toyState.scheduledCol7InCurrentBar = false;
          toyState.scheduledCol0InCurrentBar = false;
          toyState.preScheduledCol0At = null;
        }

        // Prune old scheduled entries
        let scheduledAny = false;
        const justWrapped = Number.isFinite(lastWrapAt) && (now - lastWrapAt) < 0.08;
        if (isChained && justWrapped) {
          return;
        }
        const justActivated = !!toy.__chainJustActivated;
        if (justActivated && isChained) {
          const audioId = toy.__audioToyId || toy.dataset?.toyid || toyId;
          try { bumpToyAudioGen(audioId); } catch {}

          const prevId = toy.dataset?.prevToyId;
          if (prevId) {
            const prevToy = getToy ? getToy(prevId) : document.getElementById(prevId);
            const prevAudioId = prevToy?.__audioToyId || prevId;
            try { bumpToyAudioGen(prevAudioId); } catch {}
          }
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
        // Detect if we just wrapped to a new bar. This prevents the last column
        // (column 7) from being double-scheduled: once by the audio scheduler just
        // before wrap, and again by RAF just after wrap (when phase 0.99 → 0.01).
        const lastColTime = toyState.lastScheduledByCol.get(steps - 1);
        const justWrappedByScheduler = Number.isFinite(lastColTime) && lastColTime < barStart;
        for (let b = 0; b < barsToSchedule; b++) {
          const base = barStart + b * barLen;
          for (let col = 0; col < steps; col++) {
            // Skip the last column if we just wrapped (prev lastColTime was in previous bar)
            // This prevents double-scheduling at bar boundaries
            if (justWrappedByScheduler && col === steps - 1) {
              continue;
            }
            const when = base + col * stepLen;
            const windowStart = windowStartToy;
            const lateCol0Window = Math.max(col0GraceSec, 0.2);
            const allowLateCol0 = (col === 0 && when < windowStart && when >= (now - lateCol0Window));
            // Skip column 0 if already scheduled in this bar
            if (col === 0 && toyState.scheduledCol0InCurrentBar) {
              continue;
            }
            const key = Math.round(when * 1000);
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
            const isAllowedLateCol0 = col === 0 && allowLateCol0;
            if (!isInWindow && !isAllowedLateCol0) {
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
            if (isDebugEnabled() && col === 0) {
              dbgEvent('schedule-col0-main', {
                toyId,
                when,
                barStart,
                windowStartToy,
                windowEndToy,
                justActivated,
                isChained,
                scheduledCol0InCurrentBar: toyState.scheduledCol0InCurrentBar,
                audioId: (toy.__audioToyId || toy.dataset?.toyid || toyId),
              });
            }
            // Mark that column 7 was scheduled in this bar (for chaining pre-schedule)
            if (col === steps - 1) {
              toyState.scheduledCol7InCurrentBar = true;
            }
            try {
              // Provide deterministic snapshot to toy implementation
              try { toy.__seqPatternActive = toyState.seqPattern; } catch {}
              try { toy.__seqRevActive = toyState.seqRevSeen; } catch {}

              if (isDebugEnabled() && col === 0) {
                window.__SEQ_SCHED_COUNTS = window.__SEQ_SCHED_COUNTS || {};
                const k = `${toyId}@${Math.round(when * 1000)}`;
                window.__SEQ_SCHED_COUNTS[k] = (window.__SEQ_SCHED_COUNTS[k] || 0) + 1;
                console.log('[seqSchedule call]', { toyId, col, when, count: window.__SEQ_SCHED_COUNTS[k] });
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
