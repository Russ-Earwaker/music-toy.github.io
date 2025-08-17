// src/ripplesynth-zoomtap.js
// Encapsulates the "tap to edit note/toggle" behavior used in zoom mode.

export function handleBlockTap(blocks, index, point, rect, deps){
  const { noteList, ac, pattern, trigger, instrument } = deps;
  const b = blocks[index];
  const t1 = rect.y + rect.h/3, t2 = rect.y + 2*rect.h/3;
  if (point.y < t1){
    b.noteIndex = Math.max(0, Math.min(noteList.length-1, (b.noteIndex|0) + 1));
    const name = noteList[b.noteIndex] || 'C4';
    try { trigger(instrument, name, ac.currentTime + 0.0005); } catch {}
  } else if (point.y < t2){
    b.active = !b.active;
    if (!b.active){ for (const s of pattern) s.delete(index); }
  } else {
    b.noteIndex = Math.max(0, Math.min(noteList.length-1, (b.noteIndex|0) - 1));
    const name = noteList[b.noteIndex] || 'C4';
    try { trigger(instrument, name, ac.currentTime + 0.0005); } catch {}
  }
}
