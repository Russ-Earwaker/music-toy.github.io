// src/note-helpers.js
// Centralized helpers for MIDI notes, names, and palettes.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PENTATONIC_OFFSETS = [0, 2, 4, 7, 9]; // Major Pentatonic

export function midiToName(midi) {
  if (midi == null) return '';
  const n = ((midi % 12) + 12) % 12;
  const o = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[n] + o;
}

export function buildPalette(baseMidi = 48, offsets = PENTATONIC_OFFSETS, octaves = 3) {
  const palette = [];
  for (let o = 0; o < octaves; o++) {
    for (const offset of offsets) { palette.push(baseMidi + (o * 12) + offset); }
  }
  return palette;
}

/**
 * Increments the noteIndex property of an object, wrapping around the list length.
 * @param {object} obj An object with a `noteIndex` property (e.g., a bouncer block).
 * @param {Array} list The list of available notes or values to cycle through.
 */
export function stepIndexUp(obj, list) {
  if (!obj || !list?.length) return;
  obj.noteIndex = ((obj.noteIndex || 0) + 1) % list.length;
}

/**
 * Decrements the noteIndex property of an object, wrapping around the list length.
 * @param {object} obj An object with a `noteIndex` property (e.g., a bouncer block).
 * @param {Array} list The list of available notes or values to cycle through.
 */
export function stepIndexDown(obj, list) {
  if (!obj || !list?.length) return;
  obj.noteIndex = ((obj.noteIndex || 0) - 1 + list.length) % list.length;
}