// src/ripplesynth-audio.js — audio-specific helpers for RippleSynth
// Use the ripple's local bar for both its first pass and recorded playback.
export function rippleNoteTime(barStart, offset, beatLength, quantDiv) {
  const grid = Number.isFinite(quantDiv) && quantDiv > 0 && beatLength > 0
    ? beatLength / quantDiv : 0;
  return grid > 0
    ? barStart + Math.ceil((offset + 1e-6) / grid) * grid + 0.0004
    : barStart + offset + 0.0005;
}
