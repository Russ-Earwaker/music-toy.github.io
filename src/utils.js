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
export function resizeCanvasForDPR(canvas, ctx){
  const dpr = window.devicePixelRatio || 1;
  const rect = (canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : {width:canvas.clientWidth||0,height:canvas.clientHeight||0});
  const W = Math.max(1, Math.floor(rect.width || canvas.clientWidth || 0));
  const H = Math.max(1, Math.floor(rect.height || canvas.clientHeight || 0));
  const needW = Math.floor(W * dpr);
  const needH = Math.floor(H * dpr);
  if (canvas.width !== needW || canvas.height !== needH){
    canvas.width = needW;
    canvas.height = needH;
    ctx.setTransform(1,0,0,1,0,0);
  }
  return {width: canvas.width, height: canvas.height};
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
  return ['C3','C#3','D3','D#3','E3','F3','F#3','G3','G#3','A3','A#3','B3','C4','C#4','D4','D#4','E4','F4','F#4','G4','G#4','A4','A#4','B4','C5','C#5','D5','D#5','E5','F5','F#5','G5','G#5','A5','A#5','B5'];
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
