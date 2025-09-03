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

export function stepIndexUp(indices, list, i){ if (!indices || !list?.length) return; indices[i] = (indices[i] + 1) % list.length; }
export function stepIndexDown(indices, list, i){ if (!indices || !list?.length) return; indices[i] = (indices[i] - 1 + list.length) % list.length; }