// src/ripplesynth-random.js
// Drop-in polite randomizer with explicit rippler handling + debug.
// - For rippler: intensity 0 => 5 actives, ~0.15 => 2 actives
// - Others: fallback to polite density proportional mapping

import { getPoliteDensityForToy } from './polite-random.js';
import { getIntensity } from './intensity.js';

/** Map density in 0..0.15 to active count in [2..5] (5@0 -> 2@0.15). */
export function chooseActiveCount(density=0.0, N=8){
  const d = Math.max(0, Math.min(0.15, +density || 0));
  const t = d / 0.15;            // 0..1
  const c = Math.round(5 - 3*t); // 5 -> 2
  return Math.max(2, Math.min(5, Math.min(N|0, c|0)));
}

/** Fisher–Yates shuffle of indices [0..N). */
function shuffledIndices(N){
  const a = Array.from({length:N}, (_,i)=>i);
  for (let i=N-1;i>0;i--){ const j=(Math.random()*(i+1))|0; const t=a[i]; a[i]=a[j]; a[j]=t; }
  return a;
}

/** Apply active indices to common host shapes. */
export function applyActiveSet(host, indices){
  if (!host || !Array.isArray(indices)) return false;
  const blocks = host.blocks || host.__rippler?.blocks;
  if (Array.isArray(blocks)){
    for (let i=0;i<blocks.length;i++) blocks[i].active = false;
    for (const ix of indices) if (blocks[ix]) blocks[ix].active = true;
    return true;
  }
  const steps = host.steps || host.__rippler?.steps;
  if (Array.isArray(steps)){
    for (let i=0;i<steps.length;i++) steps[i].active = false;
    for (const ix of indices) if (steps[ix]) steps[ix].active = true;
    return true;
  }
  return false;
}

/** Main entry: randomizeAllImpl(host, ctx) */
export function randomizeAllImpl(host, ctx){
  try{
    const panel  = ctx?.panel || host?.panel || host;
    const rawA   = (ctx?.toyId||'');                  // preferred
    const rawB   = (panel?.dataset?.toyid||'');       // fallback
    const rawC   = (panel?.dataset?.toy||'');         // fallback
    const toyId  = String((rawA||rawB||rawC)||'').toLowerCase();
    const blocks = ctx?.blocks || host?.blocks || host?.__rippler?.blocks;
    const N      = Math.max(1, ctx?.N || (Array.isArray(blocks)? blocks.length : 8));
    console.log('[randomizeAllImpl]', { toyId, N, from: 'ripplesynth-random.js' });

    let density = 0.0;
    let targetActive = Math.max(1, Math.min(N, Math.round(N/2)));

    // RIPPLER: use raw intensity in 0..0.15 band (with idle clamp),
    // and force the 5->2 mapping via chooseActiveCount.
    if (toyId === 'rippler' || /ripple/.test(toyId)) {
  const g    = Math.max(0, Math.min(1, getIntensity()));
  const tRaw = getIntensity('rippler');
  const t    = Number.isFinite(tRaw) ? Math.max(0, Math.min(1, tRaw)) : -1;
  const s    = (t >= 0 ? Math.max(t, g) : g);           // prefer per-toy; if zero, fall back to global
  const sEff = (s < 0.002 ? 0 : s);                     // idle clamp
  density    = Math.min(sEff, 0.15);                    // 0..0.15 band
  targetActive = chooseActiveCount(density, N);
  console.log('[rippler random]', { g, t, s, sEff, density, targetActive, N });
} else {
      // Others: proportional to polite density (0..1)
      density = getPoliteDensityForToy(toyId || 'toy', 1.0, { priority: 0.5 });
      targetActive = Math.max(1, Math.min(N, Math.round(1 + density*(N-1))));
      console.log('[randomizer fallback]', { toyId, density, targetActive, N });
    }

    // Spread picks, then fill to target
    const spread = new Set();
    const step   = Math.max(1, Math.floor(N/targetActive));
    for (let i=0;i<targetActive;i++) spread.add((i*step)%N);
    const order  = shuffledIndices(N);
    for (let i=0; spread.size<targetActive && i<order.length; i++) spread.add(order[i]);
    const chosen = Array.from(spread);

    // Optional: clear host pattern buffer if provided
    try{ ctx?.clearPattern && ctx.clearPattern(); }catch{}

    // Apply
    if (!applyActiveSet({blocks, __rippler:{blocks}}, chosen)){
      if (Array.isArray(ctx?.blocks)){
        for (let i=0;i<ctx.blocks.length;i++) ctx.blocks[i].active = false;
        for (const ix of chosen) if (ctx.blocks[ix]) ctx.blocks[ix].active = true;
      }
    }

    console.log('[randomize chosen]', { toyId, density, targetActive, chosen });
    return { chosen, density, targetActive, N };
  }catch(e){
    console.warn('[rippler random] failed:', e);
    return { chosen:[], density:0, targetActive:0, N:0 };
  }
}
