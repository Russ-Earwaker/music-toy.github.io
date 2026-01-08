// src/note-scheduler.js
// Central scheduler for grid-based toys: schedules audio ahead of time so playback stays correct at low FPS.

import { ensureAudioContext } from './audio-core.js';

export function createSequencerScheduler({ lookaheadSec = 0.2, leadSec = 0.01, lateGraceSec = 0.04 } = {}) {
  const state = new Map(); // toyId -> { lastBarStart, scheduled:Set, preScheduledCol0At, lastProbeBarIndex, lastScheduledByCol:Map }
  const col0GraceSec = Math.min(0.06, Math.max(0.01, leadSec));
  let probeLastTs = 0;
  const effectiveLateGraceSec = Number.isFinite(lateGraceSec) ? lateGraceSec : 0.04;

  function getState(key) {
    if (!state.has(key)) {
      state.set(key, {
        lastBarStart: -1,
        scheduled: new Set(),
        preScheduledCol0At: null,
        lastProbeBarIndex: null,
        lastScheduledByCol: new Map(),
        scheduledCol0InCurrentBar: false,
      });
    }
    return state.get(key);
  }

  function tick({ activeToyIds, getToy, loopInfo, nowAt } = {}) {
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
    const barStartDebug = loopStart + Math.floor((now - loopStart) / barLen) * barLen;
    const barIndex = Math.floor((now - loopStart) / barLen);
    const barStart = loopStart + barIndex * barLen;

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
      if (toyState.lastBarStart !== barStart) {
        toyState.lastBarStart = barStart;
        toyState.scheduledCol0InCurrentBar = false; // Reset at bar boundary
        if (toyState.preScheduledCol0At === barStart) {
          const key = Math.round(barStart * 1000);
          toyState.scheduled.add(key);
          toyState.lastScheduledByCol.set(0, barStart);
          toyState.preScheduledCol0At = null;
        }
      }

      const pruneBeforeMs = Math.round((now - 0.25) * 1000);
      if (Number.isFinite(pruneBeforeMs)) {
        for (const key of toyState.scheduled) {
          if (key < pruneBeforeMs) toyState.scheduled.delete(key);
        }
      }
      if (Number.isFinite(toyState.preScheduledCol0At) && toyState.preScheduledCol0At < (now - 0.25)) {
        toyState.preScheduledCol0At = null;
      }
      let scheduledAny = false;
      const isChained = !!(toy.dataset?.prevToyId || toy.dataset?.nextToyId || toy.dataset?.chainParent);
      const justActivated = !!toy.__chainJustActivated;
      const windowStartToy = windowStart;
      const windowEndToy = (justActivated && isChained)
        ? Math.max(windowEnd, barStart + barLen)
        : windowEnd;

      const barsToSchedule = isChained ? 1 : 2;
      const minColGapSec = Math.max(0.05, stepLen * 0.5);
      for (let b = 0; b < barsToSchedule; b++) {
        const base = barStart + b * barLen;
        for (let col = 0; col < steps; col++) {
          const when = base + col * stepLen;
          const windowStart = windowStartToy;
          const allowLateCol0 = (col === 0 && when < windowStart && when >= (now - col0GraceSec));
          // Skip column 0 if already scheduled in this bar (prevents double-scheduling on first activation)
          if (col === 0 && toyState.scheduledCol0InCurrentBar) {
            continue;
          }
          if (!allowLateCol0 && (when < windowStart || when > windowEndToy)) {
            if (window.__AUDIO_TIMING_PROBE && window.__AUDIO_TIMING_VERBOSE && col === 0) {
              console.log('[note-scheduler][probe] skip', {
                toyId,
                when,
                windowStart,
                windowEnd: windowEndToy,
                allowLateCol0,
              });
            }
            continue;
          }
          const key = Math.round(when * 1000);
          if (toyState.scheduled.has(key)) continue;
          const lastColTime = toyState.lastScheduledByCol.get(col);
          if (Number.isFinite(lastColTime) && Math.abs(when - lastColTime) < minColGapSec) {
            continue;
          }
          toyState.scheduled.add(key);
          toyState.lastScheduledByCol.set(col, when);
          scheduledAny = true;
          // Mark that column 0 was scheduled in this bar
          if (col === 0) {
            toyState.scheduledCol0InCurrentBar = true;
          }
          try {
            if (window.__AUDIO_TIMING_PROBE && col === 0) {
              const probeBarIndex = Math.floor((when - loopStart) / barLen);
              const shouldLog = window.__AUDIO_TIMING_VERBOSE || toyState.lastProbeBarIndex !== probeBarIndex;
              if (shouldLog) {
                toyState.lastProbeBarIndex = probeBarIndex;
                console.log('[note-scheduler][probe] scheduled', {
                  toyId,
                  when,
                  now,
                  windowStart,
                  windowEnd,
                  allowLateCol0,
                });
              }
            }
            if (window.__CHAIN_DEBUG_FIRST_STEP && col === 0) {
              const stepsArr = toy.__gridState?.steps;
              const hasStep = Array.isArray(stepsArr) ? !!stepsArr[col] : null;
              const hasAny = Array.isArray(stepsArr) ? stepsArr.some(Boolean) : null;
              console.log('[note-scheduler][debug]', {
                toyId,
                col,
                inMs: Math.round((when - now) * 1000),
                hasStep,
                hasAny,
                justActivated,
              });
            }
          toy.__sequencerSchedule(col, when);
            if (window.__NOTE_SCHEDULER_DEBUG) {
              console.log('[note-scheduler] scheduled', {
                toyId,
                col,
                inMs: Math.round((when - now) * 1000),
              });
            }
          } catch {}
        }
      }
      // Only pre-schedule if still marked as just activated (hasn't been reset yet)
      const scheduleNextBarCol0 = justActivated && isChained && Number.isFinite(phase) && phase > 0.9 && toy.__chainJustActivated;
      if (scheduleNextBarCol0) {
        const when = barStart + barLen;
        if (when >= windowStartToy && when <= windowEndToy) {
          const key = Math.round(when * 1000);
          if (!toyState.scheduled.has(key)) {
            toyState.scheduled.add(key);
            toyState.preScheduledCol0At = barStart + barLen;
            toyState.lastScheduledByCol.set(0, when);
            scheduledAny = true;
            try {
              if (window.__AUDIO_TIMING_PROBE) {
                const probeBarIndex = Math.floor((when - loopStart) / barLen);
                const shouldLog = window.__AUDIO_TIMING_VERBOSE || toyState.lastProbeBarIndex !== probeBarIndex;
                if (shouldLog) {
                  toyState.lastProbeBarIndex = probeBarIndex;
                  console.log('[note-scheduler][probe] scheduled', {
                    toyId,
                    when,
                    now,
                    windowStart: windowStartToy,
                    windowEnd: windowEndToy,
                    allowLateCol0: false,
                  });
                }
              }
              toy.__sequencerSchedule(0, when);
            } catch {}
          }
        }
      }
      if (justActivated && scheduledAny) {
        try { toy.__chainJustActivated = false; } catch {}
      }
    });
  }

  function clearToy(toyId) {
    if (!toyId) return;
    state.delete(toyId);
  }

  return { tick, clearToy };
}
