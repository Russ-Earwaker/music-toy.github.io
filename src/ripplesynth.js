// src/ripplesynth.js — facade that re-exports the split modules
// Keep imports the same for consumers: main.js imports { createRippleSynth } from './ripplesynth.js'
export { createRippleSynth } from './ripplesynth-core.js';
export * from './ripplesynth-ui.js';
export * from './ripplesynth-audio.js';
