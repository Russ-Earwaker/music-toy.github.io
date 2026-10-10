import { normalizeChords, normalizeChordStep } from './chord-progression.js';
// Musical policy is independent of Structure timing and editable toy content.
const copyValue = value => value == null ? null : typeof value === 'object'
  ? Object.freeze(Array.isArray(value) ? value.map(copyValue) : Object.fromEntries(Object.entries(value).map(([k,v]) => [k,copyValue(v)]))) : value;
const finite = (value, fallback) => value != null && Number.isFinite(Number(value)) ? Number(value) : fallback;
export function normalizeContext(context = {}) {
  return Object.freeze({ transposeSemitones: finite(context?.transposeSemitones, 0),
    harmony: context?.harmony ? Object.freeze({progressionId:context.harmony.progressionId ?? null,originTick:finite(context.harmony.originTick,0),stepTicks:normalizeChordStep(context.harmony.stepTicks),chords:normalizeChords(context.harmony.chords)}) : null, scale: copyValue(context?.scale),
    velocityScale: finite(context?.velocityScale, 1) });
}
export function composeContext(parent, local) {
  const a = normalizeContext(parent), b = normalizeContext(local);
  return normalizeContext({ transposeSemitones: a.transposeSemitones + b.transposeSemitones,
    velocityScale: a.velocityScale * b.velocityScale, harmony: b.harmony ?? a.harmony, scale: b.scale ?? a.scale });
}
// Legacy toy callbacks have varied signatures. This synchronous scope carries
// occurrence metadata through them; deferred gates capture and restore it.
let currentOccurrence = null;
export const getCurrentPlaybackOccurrence = () => currentOccurrence;
export function withPlaybackOccurrence(occurrence, callback) {
  const previous = currentOccurrence;
  currentOccurrence = occurrence;
  try { return callback(); } finally { currentOccurrence = previous; }
}
