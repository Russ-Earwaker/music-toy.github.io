// src/ripplesynth-scheduler.js
// Step scheduler for Rippler. Behavior identical to in-core version.

export function createScheduler(cfg){
  const {
    ac, NUM_STEPS, barSec, stepSeconds,
    pattern, patternOffsets, blocks, noteList,
    triggerInstrument, getInstrument,
    generator, RING_SPEED, spawnRipple,
    state, isPlaybackMuted,
    getLoopInfo,
    getQuantDiv
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
    try{
      __scheduledThisBar.clear();
      const li = (typeof getLoopInfo === 'function') ? getLoopInfo() : null;
      const div = (typeof getQuantDiv === 'function') ? Number(getQuantDiv()) : NaN;
      const beatLen = li?.beatLen || 0;
      const grid = (Number.isFinite(div) && div>0 && beatLen>0) ? (beatLen/div) : 0;
      // If we've already prescheduled for this barStartAT, skip
      if (__lastPrescheduledAt === state.barStartAT) return;
      __lastPrescheduledAt = state.barStartAT;

      for (let s=0; s<NUM_STEPS; s++){
        const set = pattern[s]; if (!set || !set.size) continue;
        for (const i of set){
          const b = blocks[i]; if (!b || !b.active) continue;
          const name = noteList[b.noteIndex] || 'C4';
          const offRaw = (patternOffsets && patternOffsets[s] && patternOffsets[s].get(i));
          const hasOff = typeof offRaw === 'number' && isFinite(offRaw);
          const baseRel = hasOff ? offRaw : (s * stepSeconds());
          let tFire;
          // Apply quantization whenever enabled; otherwise preserve exact relative timing
          if (grid > 0) {
            const k = Math.ceil((baseRel + 1e-6) / grid);
            tFire = state.barStartAT + k * grid + 0.0004;
          } else {
            tFire = state.barStartAT + baseRel + 0.0005;
          }
          const k = __keyFor(s,i);
          if (!__scheduledThisBar.has(k)){
            __scheduledThisBar.add(k);
            try{ triggerInstrument(getInstrument(), name, tFire); }catch{}
            // Defer visual flash to the actual scheduled time
            try{ if (b) b._visFlashAt = Math.max((b._visFlashAt||0), tFire); }catch{}
          }
        }
      }
    }catch{}
  }

  function tick(){
    const nowAT = ac.currentTime;
    if (nowAT >= state.barStartAT + barSec()){
      // state.recordOnly?.clear?.(); // keep queued re-records
      // Determine if we just finished a recording bar
      const justRecorded = !!state.recording;
      state.barStartAT += barSec();

      state.nextSlotAT = state.barStartAT;
      state.nextSlotIx = 0;
      try{ if (window && window.RIPPLER_TIMING_DBG) console.log('[rippler]', 'bar-start', { barStartAT: state.barStartAT }); }catch{}
      // Ensure ripple spawn always occurs on bar boundaries when placed.
      // Use manual=true to bypass first-interaction guard; AudioContext
      // should already be resumed by the user via Play.
      if (generator.placed && !isPlaybackMuted()) spawnRipple(true);
      state.recording = false;
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
