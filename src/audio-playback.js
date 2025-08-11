// src/audio-playback.js (compat version)
// - Exports createChannel(initialGain = 1, id) returning a GainNode (back-compat with old toyui.js)
// - triggerInstrument(..., destOrId) accepts either a GainNode (dest) OR a string toyId
// - setToyVolume/muteToy accept either a GainNode or a string toyId

import { ensureAudioContext } from './audio-core.js';
import { getSample } from './audio-samples.js';

const channels = new Map(); // id -> GainNode

export function createChannel(initialGain = 1, id = null){
  const ctx = ensureAudioContext();
  const g = ctx.createGain();
  g.gain.value = Number.isFinite(initialGain) ? initialGain : 1;
  g.connect(ctx.destination);
  if (id) channels.set(id, g);
  return g; // Back-compat: toyui expects .gain.value on this
}

function resolveDest(destOrId){
  const ctx = ensureAudioContext();
  if (!destOrId) return ctx.destination;
  if (typeof destOrId === 'string'){
    if (!channels.has(destOrId)) channels.set(destOrId, createChannel(1, destOrId));
    return channels.get(destOrId);
  }
  // assume it's a GainNode-like destination
  return destOrId;
}

export function triggerInstrument(name, noteName, time, destOrId){
  const ctx = ensureAudioContext();
  const sample = getSample(name);
  if (!sample) return;
  const src = ctx.createBufferSource();
  src.buffer = sample;
  const dest = resolveDest(destOrId);
  src.connect(dest);
  try { src.start(time || ctx.currentTime); } catch { /* ignore */ }
}

export function setToyVolume(toyIdOrNode, vol){
  const dest = resolveDest(toyIdOrNode);
  if ('gain' in dest && dest.gain) {
    dest.gain.value = vol;
  }
}

export function muteToy(toyIdOrNode, mute = true){
  const dest = resolveDest(toyIdOrNode);
  if ('gain' in dest && dest.gain) {
    dest.gain.value = mute ? 0 : dest.gain.value || 1;
  }
}
