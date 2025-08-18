// src/ripplesynth-random.js
// Extracted Random handler to keep ripplesynth-core.js under 300 lines.
export function randomizeAllImpl(ctx){
  const {
    blocks, noteList, layoutBlocks, clearPattern,
    recordOnly, isActive, setRecording,
    setSkipNextBarRing, setPlaybackMuted,
    baseIndex, pentatonicOffsets
  } = ctx;

  // Re-layout visuals (caller may have set a flag to force fresh layout)
  layoutBlocks();
  for (const b of blocks){ b.vx=0; b.vy=0; b.flashEnd=0; }

  // Re-seed to pentatonic baseline
  try {
    const baseIx = baseIndex(noteList);
    for (let i=0;i<blocks.length;i++){
      blocks[i].noteIndex = baseIx + pentatonicOffsets[i % 8];
      blocks[i].userEditedNote = false;
    }
  } catch {}

  // Stop playing old loop and queue re-record for all active blocks on next ripple
  try { clearPattern(); } catch {}
  try { recordOnly.clear(); } catch {}
  for (let i=0;i<blocks.length;i++){ if (isActive(blocks[i])) recordOnly.add(i); }
  setRecording(true);

  // Ensure next bar spawns a ripple as usual
  setSkipNextBarRing(false);
  setPlaybackMuted(false);
}
