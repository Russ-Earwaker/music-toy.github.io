// utils.js — shared helpers (<= 300 lines)

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

// Device-pixel-ratio canvas sizing.
// Compatible signatures:
//   resizeCanvasForDPR(canvas, ctx)
//   resizeCanvasForDPR(canvas, cssW, cssH)
export function resizeCanvasForDPR(canvas, a, b){
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
  // If second arg looks like a 2D context, treat it as ctx; else treat as cssW/cssH
  const looksLikeCtx = a && typeof a === 'object' && typeof a.canvas === 'object' && typeof a.setTransform === 'function';
  const ctx = looksLikeCtx ? a : (canvas.getContext && canvas.getContext('2d') || null);
  // If numeric sizing provided, apply CSS size
  if (!looksLikeCtx && typeof a === 'number') {
    canvas.style.width = a + 'px';
    if (typeof b === 'number') canvas.style.height = b + 'px';
  }
  // Measure CSS size
  let rect;
  try {
    rect = canvas.getBoundingClientRect();
  } catch {
    rect = { width: canvas.clientWidth || 0, height: canvas.clientHeight || 0 };
  }
  const cssW = Math.max(1, Math.floor(rect.width || 0));
  const cssH = Math.max(1, Math.floor(rect.height || 0));
  const dpW = Math.max(1, Math.floor(cssW * dpr));
  const dpH = Math.max(1, Math.floor(cssH * dpr));

  if (canvas.width !== dpW) canvas.width = dpW;
  if (canvas.height !== dpH) canvas.height = dpH;

  if (ctx && typeof ctx.setTransform === 'function') {
    // Set scale so drawing coordinates are in CSS pixels
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  return { width: cssW, height: cssH, dpr };
}

// Random integer in range [min, max]
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

// ----------------------------
// Note palette
// ----------------------------
// If a global note list is provided by the app, use it; otherwise default to a
// musical, mix-friendly palette (C minor pentatonic across two octaves).
function _defaultNoteList(){
  return ['C3','D#3','F3','G3','A#3','C4','D#4','F4','G4','A#4','C5'];
}

// Allow external override via window.NOTE_LIST or window.APP_NOTE_LIST
let __noteList = null;
try {
  if (typeof window !== 'undefined'){
    const g = window;
    __noteList = (Array.isArray(g.NOTE_LIST) && g.NOTE_LIST.length) ? g.NOTE_LIST.slice()
                : (Array.isArray(g.APP_NOTE_LIST) && g.APP_NOTE_LIST.length) ? g.APP_NOTE_LIST.slice()
                : null;
  }
} catch(e){}

export const noteList = (__noteList && __noteList.length) ? __noteList : _defaultNoteList();
