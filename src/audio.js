// src/audio.js — split orchestration (kept under 300 lines)
// This module wires together the split audio subsystems for back-compat,
// while most implementations live in: audio-core.js, audio-samples.js, audio-tones.js, audio-playback.js.

export {
  DEFAULT_BPM,
  NUM_STEPS,
  BEATS_PER_BAR,
  ac,
  bpm,
  setBpm,
  beatSeconds,
  barSeconds,
  stepSeconds,
  ensureAudioContext,
  getLoopInfo,
  createScheduler
} from './audio-core.js';

import { triggerInstrument as _triggerInstrument, initAudioAssets as _initAudioAssets, getInstrumentNames as _getInstrumentNames } from './audio-samples.js';
import { ensureAudioContext } from './audio-core.js';

export async function initAudioAssets(csvUrl){ return _initAudioAssets(csvUrl); }
export function getInstrumentNames(){ return _getInstrumentNames(); }
export function triggerInstrument(instrument, noteName, when){ ensureAudioContext(); return _triggerInstrument(instrument, noteName, when); }

export { createChannel, setToyVolume, muteToy } from './audio-playback.js';
