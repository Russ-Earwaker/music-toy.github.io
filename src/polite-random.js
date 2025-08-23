// src/polite-random.js — polite randomisation helpers (<300 lines)
import { getIntensity } from './intensity.js';

let enabled = true;

export function setPoliteRandomEnabled(v){ enabled = !!v; }
export function isPoliteRandomEnabled(){ return enabled; }

/**
 * Generic density helper.
 * @param {number} base - target density (0..1-ish)
 * @param {number} hint - additional multiplier
 */
export function getPoliteDensity(base=1, hint=1){
  if (!enabled) return base*hint;
  const g = getIntensity();                // global 0..1
  // Scale down gently as global intensity rises (0.7..1.0)
  const scale = 1 - 0.3 * g;
  return base * scale * hint;
}

/**
 * Per-toy aware density helper.
 * Signature matches existing toys: (toyId, base=1, opts?)
 * opts: { hint=1, priority=0..1, minScale=0.6, maxScale=1.0 }
 */
export function getPoliteDensityForToy(toyId, base=1, opts={}){
  if (!enabled) return base * (opts.hint ?? 1);
  const g = getIntensity();            // global
  const t = toyId ? getIntensity(toyId) : g; // this toy
  const hint = (opts.hint == null) ? 1 : +opts.hint;
  const prio = Math.max(0, Math.min(1, opts.priority == null ? 0.5 : +opts.priority));
  const minS = (opts.minScale == null) ? 0.6 : +opts.minScale;
  const maxS = (opts.maxScale == null) ? 1.0 : +opts.maxScale;

  // Base scale: reduce more when the room is hot and this toy is already hot,
  // but protect higher-priority toys.
  let scale = 1 - 0.5 * g * (0.5 + 0.5*t) * (1 - prio);
  // Clamp to sane range
  scale = Math.max(minS, Math.min(maxS, scale));

  return base * scale * hint;
}
