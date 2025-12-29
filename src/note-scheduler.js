// src/note-scheduler.js
// Central scheduler for grid-based toys: schedules audio ahead of time so playback stays correct at low FPS.

import { ensureAudioContext } from './audio-core.js';

export function createSequencerScheduler({ lookaheadSec = 0.2, leadSec = 0.01 } = {}) {
  const state = new Map(); // toyId -> { lastBarStart, scheduled:Set }

  function getState(key) {
    if (!state.has(key)) state.set(key, { lastBarStart: -1, scheduled: new Set() });
    return state.get(key);
  }

  function tick({ activeToyIds, getToy, loopInfo, nowAt } = {}) {
    if (!activeToyIds || !activeToyIds.size || !loopInfo) return;
    const barLen = Number(loopInfo.barLen) || 0;
    if (!Number.isFinite(barLen) || barLen <= 0) return;
    const loopStart = Number(loopInfo.loopStartTime) || 0;
    const now = Number.isFinite(nowAt) ? nowAt : (ensureAudioContext()?.currentTime ?? 0);
    if (!Number.isFinite(now)) return;

    const windowStart = now + Math.max(0, leadSec);
    const windowEnd = now + Math.max(0.05, lookaheadSec);
    const barIndex = Math.floor((now - loopStart) / barLen);
    const barStart = loopStart + barIndex * barLen;

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
      }

      for (let b = 0; b < 2; b++) {
        const base = barStart + b * barLen;
        for (let col = 0; col < steps; col++) {
          const when = base + col * stepLen;
          if (when < windowStart || when > windowEnd) continue;
          const key = `${Math.round(base * 1000)}:${col}`;
          if (toyState.scheduled.has(key)) continue;
          toyState.scheduled.add(key);
          try {
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
    });
  }

  return { tick };
}
