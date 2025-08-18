// src/ripplesynth-scheduler.js
// Step scheduler for Rippler. Behavior identical to in-core version.

export function createScheduler(cfg){
  const {
    ac, NUM_STEPS, barSec, stepSeconds,
    pattern, blocks, noteList,
    triggerInstrument, getInstrument,
    generator, RING_SPEED, spawnRipple,
    state, isPlaybackMuted
  } = cfg;

  function tick(){
    const nowAT = ac.currentTime;
    if (nowAT >= state.barStartAT + barSec()){
      state.recordOnly?.clear?.();
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
      const s = pattern[state.nextSlotIx];
      if (s && s.size){
        const scheduled = new Set();
        s.forEach(i=>{ if (!blocks[i] || !blocks[i].active) return;
          const name = noteList[blocks[i].noteIndex] || 'C4';
          if (!scheduled.has(name)){
            triggerInstrument(getInstrument(), name, state.nextSlotAT + 0.0005);
            scheduled.add(name);
          }
          blocks[i].flashEnd = Math.max(blocks[i].flashEnd, ac.currentTime + 0.12);
        });
      }
      state.nextSlotIx = (state.nextSlotIx + 1) & (NUM_STEPS - 1);
      state.nextSlotAT += stepSeconds();
    }
  }

  return { tick };
}
