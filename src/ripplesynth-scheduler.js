// src/ripplesynth-scheduler.js
// Step scheduler for Rippler. Behavior identical to in-core version.
import { rippleNoteTime } from './ripplesynth-audio.js';
export function createScheduler(cfg){
  const {
    panel, ac, NUM_STEPS, barSec, stepSeconds,
    pattern, patternOffsets, blocks, noteList,
    triggerInstrument, getInstrument, applyPreviewState,
    generator, RING_SPEED, spawnRipple,
    state, isPlaybackMuted,
    getLoopInfo, getPositionAtAudioTime,
    getQuantDiv, sharedReplay = false, getTransportState, tickToAudioTime
  } = cfg;

  // One-shot summary for the first replay after a recording bar
  let __summaryMode = false;            // active during the first bar after recording turns false
  let __printedSummaries = new Set();   // keys: `${slotIx}@${blockIndex}`
  let __wasRecording = !!state.recording;

  // Bar-level pre-scheduling to avoid late slot-edge clamping
  let __scheduledThisBar = new Set();   // keys: `${slotIx}@${blockIndex}`
  const __keyFor = (slotIx, idx)=> `${slotIx|0}@${idx|0}`;
  // Avoid duplicate preschedules; compare against last barStart anchor
  let __lastPrescheduledAt = -1;
  function prescheduleBar(){
    if (sharedReplay) {
      __scheduledThisBar.clear();
      __lastPrescheduledAt = state.barStartAT;
      return;
    }
    try {
      __scheduledThisBar.clear();
      const li = typeof getLoopInfo === 'function' ? getLoopInfo() : null;
      const div = typeof getQuantDiv === 'function' ? Number(getQuantDiv()) : NaN;
      const beatLen = li?.beatLen || (barSec() / 4);
      if (__lastPrescheduledAt === state.barStartAT) return;
      __lastPrescheduledAt = state.barStartAT;
      for (let s = 0; s < NUM_STEPS; s += 1) {
        for (const i of pattern[s] || []) {
          const block = blocks[i];
          if (!block?.active) continue;
          const raw = patternOffsets?.[s]?.get?.(i);
          const relative = Number.isFinite(raw) ? raw : s * stepSeconds();
          const fireAt = rippleNoteTime(state.barStartAT, relative, beatLen, div);
          const key = __keyFor(s, i);
          if (sharedReplay || __scheduledThisBar.has(key)) continue;
          __scheduledThisBar.add(key);
          try { triggerInstrument(getInstrument(), noteList[block.noteIndex] || 'C4', fireAt); } catch {}
          block._visFlashAt = Math.max(block._visFlashAt || 0, fireAt);
        }
      }
    } catch {}
  }

  function tick(){
    const nowAT = ac.currentTime;
    const nowTick = getTransportState?.().currentTick;
    const tickClock = Number.isFinite(nowTick) && Number.isFinite(state.barStartTick) && typeof tickToAudioTime === 'function';
    // Keep a recording's musical anchor fixed while pause/tempo rebases its
    // AudioContext mapping. Seconds are only the projection of that anchor.
    const anchorTick = state.barStartTick;
    if (tickClock) state.barStartAT = tickToAudioTime(anchorTick);
    if (tickClock ? nowTick >= anchorTick + 384 : nowAT >= state.barStartAT + barSec()){
      // state.recordOnly?.clear?.(); // keep queued re-records
      // Determine if we just finished a recording bar
      const justRecorded = !!state.recording;
      // A stalled frame may span many bars. Jump once to the current bar,
      // never spawn/learn one historical ripple per subsequent frame.
      state.barStartAT = tickClock
        ? tickToAudioTime(anchorTick + Math.floor((nowTick - anchorTick) / 384) * 384)
        : state.barStartAT + Math.floor((nowAT - state.barStartAT) / barSec()) * barSec();
      // On new bar, apply any pending preview state from clicks or randomizing.
      const appliedPreview = typeof applyPreviewState === 'function' && applyPreviewState() === true;
      state.nextSlotAT = state.barStartAT;
      state.nextSlotIx = 0;
      try{ if (window && window.RIPPLER_TIMING_DBG) console.log('[rippler]', 'bar-start', { barStartAT: state.barStartAT }); }catch{}
      // For standalone (unchained) toys, spawn a ripple on every bar.
      // Chained toys are handled by the chain activation logic.
      const isChained = !!(panel.dataset.nextToyId || panel.dataset.prevToyId);
      if (!isChained && generator.placed && !isPlaybackMuted() && (!sharedReplay || state.recording)) {
        spawnRipple(true);
      }
      state.recording = appliedPreview;
      if (justRecorded) {
        // The shared scheduler must include the first replay boundary; recording
        // windows deliberately did not advance its cursor.
        panel.__sequencerWindowStartTick = Math.max(0, Math.round(getPositionAtAudioTime?.(state.barStartAT) || 0));
        panel.__forceSchedulerReset = true;
      }
      // Arm summary mode only for the very next bar after recording
      if (justRecorded){ __summaryMode = true; __printedSummaries.clear(); }


      else { __summaryMode = false; }
      __wasRecording = false;
      // Pre-schedule the entire bar so Off playback keeps original spacing
      prescheduleBar();
    }
  }

  return { tick, prescheduleNow: prescheduleBar };
}
