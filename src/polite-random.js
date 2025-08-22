// src/polite-random.js — polite density hinting with debug events
import { getIntensity } from './intensity.js';

let enabled = true;

export function isPoliteRandomEnabled(){ return enabled; }
export function setPoliteRandomEnabled(v){ enabled = !!v; }

// Returns a multiplier in (0.4..1.2) to scale toy density/complexity targets
export function getPoliteDensity(base=1, priority=1){
  const density = _computeDensity(base, priority);
  _emitPoliteEvent({ base, priority, density });
  return density;
}

// Variant that tags which toy asked (for HUD)
export function getPoliteDensityForToy(toyId, base=1, priority=1){
  const density = _computeDensity(base, priority);
  _emitPoliteEvent({ toy: String(toyId||'').toLowerCase(), base, priority, density });
  return density;
}

function _computeDensity(base=1, priority=1){
  if (!enabled) return base;
  const g = getIntensity(); // 0..1
  // Invert with a gentle curve so busy mixes strongly discourage extra density
  const budget = Math.max(0, Math.min(1, 1 - Math.pow(g, 0.8)));
  const pr = Math.max(0.2, Math.min(2, Number(priority)||1)); // 1 = normal, >1 claims more space
  const scale = 0.6 + (budget*budget)*0.6; // 0.6..1.2
  const result = base * scale * (1/pr);
  return Math.max(0.4*base, Math.min(1.2*base, result));
}

function _emitPoliteEvent(detail){
  try { window.dispatchEvent(new CustomEvent('polite-random-used', { detail })); } catch {}
}
