// src/polite-random.js — polite random with idle dead‑zone (<=300 lines)
import { getIntensity } from './intensity.js';

let enabled = true;
export function setPoliteRandomEnabled(v){ enabled = !!v; }
export function isPoliteRandomEnabled(){ return enabled; }

// If the room is effectively idle, do not reduce density.
function isEffectivelyIdle(g, t){
  const GATE = 0.05; // ~5% intensity
  return (g < GATE) && (t == null || t < GATE);
}

export function getPoliteDensity(base=1, hint=1){
  if (!enabled) return base*hint;
  const g = Math.max(0, Math.min(1, getIntensity())); // global
  if (isEffectivelyIdle(g)) return base * (hint||1);
  // Quiet -> ~1.0 ; Hot -> ~0.2
  const scale = Math.max(0.08, Math.pow(1 - g, 1.4));
  return base * scale * (hint||1);
}

/**
 * Per-toy variant with priority.
 * opts: { hint=1, priority=0..1, minScale=0.05, maxScale=1 }
 */
export function getPoliteDensityForToy(toyId, base=1, opts={}){
  // Back-compat: numeric opts == priority
  if (opts != null && (typeof opts === 'number' || typeof opts === 'string')){
    const pr = Number(opts); opts = { priority: (isFinite(pr)?pr:0.5) };
  }
  if (!enabled) return base * ((opts && opts.hint) || 1);

  const g = Math.max(0, Math.min(1, getIntensity()));           // global
  let t = g; try { t = Math.max(0, Math.min(1, getIntensity(String(toyId||'').toLowerCase()))); } catch {}

  if (isEffectivelyIdle(g, t)) return base * ((opts && opts.hint) || 1);

  const hint = (opts && opts.hint != null) ? +opts.hint : 1;
  const prio = Math.max(0, Math.min(1, (opts && opts.priority != null) ? +opts.priority : 0.5));
  const minS = (opts && opts.minScale != null) ? +opts.minScale : 0.05;
  const maxS = (opts && opts.maxScale != null) ? +opts.maxScale : 1.0;

  // Base reduction rises non-linearly with global heat; toys that are already hot get cut more.
  const baseScale = Math.pow(1 - g, 1.6);       // 0..1  (at g=1 -> 0)
  const toyFactor = Math.max(0.2, 0.9 - 0.7*t); // hot toy (t≈1) => ~0.2
  const prioFactor = 0.4 + 0.6*prio;            // high-priority resists reduction

  let scale = baseScale * toyFactor * prioFactor;
  scale = Math.max(minS, Math.min(maxS, scale));

  return base * scale * hint;
}