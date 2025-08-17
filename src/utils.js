
// src/utils.js -- shared helpers (under 400 lines)

// Clamp a number between min and max
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Returns the duration in seconds of a single beat at given BPM (default 120)
export function beatSeconds(bpm = 120) {
  return 60 / bpm;
}

// Returns the duration in seconds of a bar (4 beats) at given BPM
export function barSeconds(bpm = 120) {
  return beatSeconds(bpm) * 4;
}

// Resize canvas to match device pixel ratio; keep CSS size set by layout.
// We accept (canvas, ctx) to match existing callers.
export function resizeCanvasForDPR(canvas, ctx){
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(1, canvas.clientWidth || 0);
  const cssH = Math.max(1, canvas.clientHeight || 0);
  const needW = Math.round(cssW * dpr);
  const needH = Math.round(cssH * dpr);
  if (canvas.width !== needW || canvas.height !== needH){
    canvas.width = needW;
    canvas.height = needH;
  }
  if (ctx && ctx.setTransform){
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  return { dpr, width: cssW, height: cssH };
}

// Get the position inside the canvas for a pointer event (accounts for CSS scale)
export function getCanvasPos(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  const x = (evt.clientX - rect.left);
  const y = (evt.clientY - rect.top);
  return { x, y };
}

// Pentatonic note list (C4–A5)
export const noteList = [
  'C2', 'C#2', 'D2', 'D#2', 'E2', 'F2', 'F#2', 'G2', 'G#2', 'A2', 'A#2', 'B2', 'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3', 'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4', 'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5', 'F#5', 'G5', 'G#5', 'A5', 'A#5', 'B5', 'C6', 'C#6', 'D6', 'D#6', 'E6', 'F6', 'F#6', 'G6', 'G#6', 'A6', 'A#6', 'B6', 'C7'
];

// Simple random integer in range [min, max]
export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Shuffle array in place
export function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
