// src/ripplesynth-zoomtap.js
// Encapsulates the "tap to edit note/toggle" behavior used in zoom mode.
// Keeps pattern membership on toggle-off (soft mute). Re-enables by scheduling re-record on next ripple.

export function handleBlockTap(blocks, index, point, rect, deps){
  const { noteList, ac, pattern, trigger, instrument, __schedState } = deps;
  const b = blocks[index];
  const t1 = rect.y + rect.h/3, t2 = rect.y + 2*rect.h/3;
  if (point.y < t1){
    b.noteIndex = Math.max(0, Math.min(noteList.length-1, (b.noteIndex|0) + 1));
    b.userEditedNote = true;
    const name = noteList[b.noteIndex] || 'C4';
    try { trigger(instrument, name, ac.currentTime + 0.0005); } catch {}
  } else if (point.y < t2){
    const wasActive = !!b.active;
    b.active = !b.active; // soft-mute: keep pattern membership so it can rejoin on re-enable
    if (!wasActive && b.active){
      try { __schedState?.recordOnly?.add?.(index); } catch {}
      // Immediate feedback when enabling mid-ripple (does not alter scheduling)
      try { const name = noteList[b.noteIndex] || 'C4'; trigger(instrument, name, ac.currentTime + 0.0005); } catch {}
    }
  } else {
    b.noteIndex = Math.max(0, Math.min(noteList.length-1, (b.noteIndex|0) - 1));
    b.userEditedNote = true;
    const name = noteList[b.noteIndex] || 'C4';
    try { trigger(instrument, name, ac.currentTime + 0.0005); } catch {}
  }
}
