// src/note-helpers.js — shared helpers for note stepping & naming

// Rippler-style: step through noteList with wrap (no octave math on the object)
export function stepIndexUp(obj, noteList){
  const n = noteList.length || 1;
  obj.noteIndex = ((obj.noteIndex || 0) + 1) % n;
  return true;
}
export function stepIndexDown(obj, noteList){
  const n = noteList.length || 1;
  obj.noteIndex = ((obj.noteIndex || 0) + n - 1) % n;
  return true;
}

// Octave-carry variant: wrap across noteList and carry/borrow obj.oct
export function stepUpOct(obj, noteList){
  const n = noteList.length || 1;
  const prev = obj.noteIndex || 0;
  const next = (prev + 1) % n;
  if (next < prev) obj.oct = Math.min(6, (obj.oct||4) + 1);
  obj.noteIndex = next;
  return true;
}
export function stepDownOct(obj, noteList){
  const n = noteList.length || 1;
  const prev = obj.noteIndex || 0;
  const next = (prev + n - 1) % n;
  if (next > prev) obj.oct = Math.max(2, (obj.oct||4) - 1);
  obj.noteIndex = next;
  return true;
}

// Name helpers
export function noteValue(noteList, idx){
  const n = noteList.length || 1;
  return noteList[((idx||0) % n + n) % n] || 'C4';
}
export function noteWithOct(noteList, idx, oct){
  const raw = noteValue(noteList, idx);
  const base = String(raw).replace(/\d+$/, '');
  const o = (oct==null ? 4 : oct);
  return base + String(o);
}
