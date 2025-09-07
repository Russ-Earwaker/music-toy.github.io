// src/ripplesynth-scheduler.js
// Step scheduler for Rippler. Behavior identical to in-core version.

export function createScheduler(cfg){
  const {
    ac, NUM_STEPS, barSec, stepSeconds,
    pattern, blocks, noteList,
    triggerInstrument, getInstrument,
    generator, RING_SPEED, spawnRipple,
    state, isPlaybackMuted,
    getLoopInfo,
    getQuantDiv
  } = cfg;

  function tick(){
    const nowAT = ac.currentTime;
    if (nowAT >= state.barStartAT + barSec()){
      // state.recordOnly?.clear?.(); // keep queued re-records
      state.barStartAT += barSec();
      state.nextSlotAT = state.barStartAT;
      state.nextSlotIx = 0;
      if (generator.placed && !isPlaybackMuted()){
        if (state.skipNextBarRing) state.skipNextBarRing = false;
        else spawnRipple(false);
      }
      state.recording = false;
    }
    const lookahead = 0.03;
    while (!state.recording && !isPlaybackMuted() && nowAT + lookahead >= state.nextSlotAT){
      // If a bar-aligned preview was already scheduled for this slot, skip once
      {
      const s = pattern[state.nextSlotIx];
      if (s && s.size){
        const scheduled = new Set();
        s.forEach(i=>{ if (!blocks[i] || !blocks[i].active) return;
          const name = noteList[blocks[i].noteIndex] || 'C4';
          if (!scheduled.has(name)){
            // Schedule at quantized grid if enabled; otherwise at slot boundary
            let tFire = state.nextSlotAT + 0.0005;
            try{
              const li = (typeof getLoopInfo === 'function') ? getLoopInfo() : null;
              const div = (typeof getQuantDiv === 'function') ? Number(getQuantDiv()) : NaN;
              const beatLen = li?.beatLen || 0;
              if (Number.isFinite(div) && div > 0 && beatLen > 0){
                const grid = beatLen / div;
                const rel = li ? Math.max(0, (state.nextSlotAT - li.loopStartTime)) : 0;
                const k = Math.ceil((rel + 1e-6) / grid);
                tFire = (li?.loopStartTime || state.nextSlotAT) + k * grid + 0.0004;
              }
            }catch{}
            triggerInstrument(getInstrument(), name, tFire);
            scheduled.add(name);
          }
          blocks[i].flashEnd = Math.max(blocks[i].flashEnd, ac.currentTime + 0.12);
        });
      }
      }
      state.nextSlotIx = (state.nextSlotIx + 1) & (NUM_STEPS - 1);
      state.nextSlotAT += stepSeconds();
    }
  }

  return { tick };
}
