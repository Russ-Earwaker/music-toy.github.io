// src/audio-trigger.js — consolidated trigger (master-aware)
import { getToyInstrument } from './instrument-map.js';
import { triggerInstrument } from './audio-samples.js';
import { AudioMaster } from './audio-master.js';

export function triggerNoteForToy(toyId, midi=60, velocity=0.9, options = {}){
  // Allow the instrument to be overridden by the options object. This is useful
  // for toys like the Chord Wheel that need to play specific, one-off samples
  // (like a pre-recorded chord) instead of a note on their main instrument.
  const inst = options?.instrument || (getToyInstrument && getToyInstrument(toyId));
  const v = Math.max(0.0001, Math.min(1, (velocity==null?0.9:velocity) * (AudioMaster && AudioMaster.getVolume ? AudioMaster.getVolume() : 1)));
  return triggerInstrument(inst || 'tone', midi, v, toyId, options);
}