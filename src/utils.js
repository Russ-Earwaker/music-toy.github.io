// src/utils.js
export const OCTAVES = [3, 4, 5];
export const PITCHES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export const noteList = OCTAVES.flatMap(o => PITCHES.map(p => `${p}${o}`)); // C3..B5

export function noteToMidi(note) {
  const m = /^([A-G]#?)(\d)$/.exec(note);
  if (!m) throw new Error(`Bad note: ${note}`);
  const pitchIndex = PITCHES.indexOf(m[1]);
  const octave = parseInt(m[2], 10);
  return (octave + 1) * 12 + pitchIndex; // MIDI standard
}
export function noteToFreq(note) {
  return 440 * Math.pow(2, (noteToMidi(note) - 69) / 12); // A4=440
}
export function freqRatio(fromNote, toNote) {
  return noteToFreq(toNote) / noteToFreq(fromNote);
}

export function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

// 🔧 Canvas helpers (restored)
export function resizeCanvasForDPR(canvas, ctx) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas._vw = rect.width;
  canvas._vh = rect.height;
  canvas.width  = Math.round(rect.width  * dpr);
  canvas.height = Math.round(rect.height * dpr);
  // draw in CSS pixels
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function getCanvasPos(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  const cs = getComputedStyle(canvas);
  const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
  const borderTop  = parseFloat(cs.borderTopWidth)  || 0;
  const cx = (e.touches?.[0]?.clientX ?? e.clientX);
  const cy = (e.touches?.[0]?.clientY ?? e.clientY);
  return { x: cx - rect.left - borderLeft, y: cy - rect.top - borderTop };
}
