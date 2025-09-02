// src/audio-trigger.js — consolidated trigger (master-aware)
import { getToyInstrument } from './instrument-map.js';
import { triggerInstrument } from './audio-samples.js';
import { AudioMaster } from './audio-master.js';

export function triggerNoteForToy(toyId, midi=60, velocity=0.9){
  const inst = getToyInstrument && getToyInstrument(toyId);
  const v = Math.max(0.0001, Math.min(1, (velocity==null?0.9:velocity) * (AudioMaster && AudioMaster.getVolume ? AudioMaster.getVolume() : 1)));
  return triggerInstrument(inst || 'tone', midi, v, toyId);
}