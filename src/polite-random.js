// src/polite-random.js — polite density hinting for cross-toy Random actions
import { getActivityBudget } from './intensity.js';

let enabled = true;

export function isPoliteRandomEnabled(){ return enabled; }
export function setPoliteRandomEnabled(v){ enabled = !!v; }

// Returns a multiplier in (0.4..1.2) to scale toy density/complexity targets
export function getPoliteDensity(base=1, priority=1){
  if (!enabled) return base;
  const budget = getActivityBudget(); // 0..1 (1 = chill, 0 = chaos)
  const pr = Math.max(0.2, Math.min(2, Number(priority)||1)); // 1 = normal, >1 claims more space
  // Use budget^2 so busy mixes strongly discourage extra density
  const scale = 0.6 + (budget*budget)*0.6; // 0.6..1.2
  const result = base * scale * (1/pr);
  return Math.max(0.4*base, Math.min(1.2*base, result));
}

// Optional DOM hook: if a button with [data-random] exists in a toy-panel, we can attach and expose the hint
export function attachPoliteHintToButtons(){
  document.querySelectorAll('.toy-panel [data-random]').forEach(btn => {
    btn.dataset.polite = '1';
    btn.title = 'Polite randomisation is ON (respects other toys)';
  });
}
