// src/note-scheduler.js
// Central scheduler for grid-based toys: schedules audio ahead of time so playback stays correct at low FPS.

import { ensureAudioContext } from './audio-core.js';

export function createSequencerScheduler({ lookaheadSec = 0.2, leadSec = 0.01 } = {}) {
  const state = new Map(); // toyId -> { lastBarStart, scheduled:Set, preScheduledCol0At, lastProbeBarIndex }
  const col0GraceSec = Math.min(0.06, Math.max(0.01, leadSec));
  let probeLastTs = 0;

  function getState(key) {
    if (!state.has(key)) state.set(key, { lastBarStart: -1, scheduled: new Set(), preScheduledCol0At: null, lastProbeBarIndex: null });
    return state.get(key);
  }

  function tick({ activeToyIds, getToy, loopInfo, nowAt } = {}) {
    if (!activeToyIds || !activeToyIds.size || !loopInfo) return;
    const barLen = Number(loopInfo.barLen) || 0;
    if (!Number.isFinite(barLen) || barLen <= 0) return;
    const loopStart = Number(loopInfo.loopStartTime) || 0;
    const now = Number.isFinite(nowAt) ? nowAt : (ensureAudioContext()?.currentTime ?? 0);
    if (!Number.isFinite(now)) return;

    const baseWindowStart = now + Math.max(0, leadSec);
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
          windowStart: baseWindowStart,
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
        toyState.scheduled.clear();
        if (toyState.preScheduledCol0At === barStart) {
          const key = `${Math.round(barStart * 1000)}:0`;
          toyState.scheduled.add(key);
          toyState.preScheduledCol0At = null;
        }
      }
      let scheduledAny = false;
      const isChained = !!(toy.dataset?.prevToyId || toy.dataset?.nextToyId || toy.dataset?.chainParent);
      const justActivated = !!toy.__chainJustActivated;
      const windowStartToy = baseWindowStart;
      const windowEndToy = (justActivated && isChained)
        ? Math.max(windowEnd, barStart + barLen)
        : windowEnd;

      const barsToSchedule = isChained ? 1 : 2;
      for (let b = 0; b < barsToSchedule; b++) {
        const base = barStart + b * barLen;
        for (let col = 0; col < steps; col++) {
          const when = base + col * stepLen;
          const windowStart = windowStartToy;
          const allowLateCol0 = (col === 0 && when < windowStart && when >= (now - col0GraceSec));
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
          const key = `${Math.round(base * 1000)}:${col}`;
          if (toyState.scheduled.has(key)) continue;
          toyState.scheduled.add(key);
          scheduledAny = true;
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
      const scheduleNextBarCol0 = justActivated && isChained && Number.isFinite(phase) && phase > 0.9;
      if (scheduleNextBarCol0) {
        const when = barStart + barLen;
        if (when >= windowStartToy && when <= windowEndToy) {
          const key = `${Math.round((barStart + barLen) * 1000)}:0`;
          if (!toyState.scheduled.has(key)) {
            toyState.scheduled.add(key);
            toyState.preScheduledCol0At = barStart + barLen;
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
