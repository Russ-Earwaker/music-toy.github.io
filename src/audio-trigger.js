// src/audio-trigger.js — route notes to per‑toy instruments (<=200 lines)
import { triggerInstrument } from './audio-samples.js';
import { getToyInstrument } from './instrument-map.js';

/**
 * Trigger a note for a specific toy, using its mapped/default instrument.
 * @param {string} toyId
 * @param {number} midi - MIDI note number
 * @param {number} velocity - 0..1
 * @param {number} when - AudioContext time (optional)
 */
export function triggerNoteForToy(toyId, midi, velocity=0.8, when){
  const inst = getToyInstrument(toyId);
  if (!inst) return;
  try{
    triggerInstrument(inst, midi, velocity, when);
  }catch(e){
    // fail-safe: try immediate time
    try{ triggerInstrument(inst, midi, velocity); }catch{}
  }
}
