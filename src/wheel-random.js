// src/wheel-random.js — movement-free musical randomization for the Wheel toy
// Polite-aware: scales activity with global intensity (via getPoliteDensityForToy)
import { getPoliteDensityForToy } from './polite-random.js';

export function randomizeWheel(handles, opts = {}){
  const STEPS = handles.length;
  const SEMIS = 12;
  const SCALE_FULL = [0,3,5,7,10]; // minor pentatonic
  const ANCH = [0, 7, 10];
  const toyId = String(opts.toyId || 'wheel').toLowerCase();
  const priority = Number(opts.priority || 1) || 1;
  const density = getPoliteDensityForToy(toyId, 1, priority); // also emits HUD event

  // Helper: evenly spread k actives around N
  function euclideanMask(N, k){
    const active = Array(N).fill(false);
    let pos = 0;
    const stepSize = N / Math.max(1,k);
    for (let i=0;i<k;i++){ active[Math.round(pos) % N] = true; pos += stepSize; }
    // repair any rounding collisions
    let need = k - active.filter(Boolean).length;
    if (need > 0){
      for (let i=0;i<N && need>0;i++){ if (!active[i]){ active[i] = true; need--; } }
    }
    return active;
  }

  // Base activity ~ 60% of steps; lower when mix is busy, higher when it's quiet
  const baseFrac = 0.60;
  const frac = Math.max(0.25, Math.min(0.90, baseFrac * density * 1.2)); // 0.25..0.90
  const k = Math.max(1, Math.min(STEPS, Math.round(STEPS * frac)));

  // When density is low, restrict scale to simpler subset (anchors + neighbors)
  const SCALE = (density < 0.9) ? [0,3,7,10] : SCALE_FULL;

  // Motif (shorter when density is low), stepwise contour
  const motifLen = (density < 0.85) ? 3 : 4 + Math.floor(Math.random()*2); // 3..5
  const motif = [];
  let si = Math.floor(Math.random()*SCALE.length);
  motif.push(si);
  for (let i=1;i<motifLen;i++){
    const delta = (-1 + Math.floor(Math.random()*3)); // -1, 0, +1
    si = Math.max(0, Math.min(SCALE.length-1, si + delta));
    motif.push(si);
  }

  const active = euclideanMask(STEPS, k);

  // Apply
  handles.fill(null);
  let prevSemi = null;
  let motifPos = 0;
  for (let stepIdx=0; stepIdx<STEPS; stepIdx++){
    if (!active[stepIdx]) continue;
    let semi = null;

    if (stepIdx % 4 === 0){
      // choose anchor near previous if exists
      const choices = ANCH.map(a => a % 12);
      if (prevSemi != null){
        choices.sort((a,b)=> Math.abs(a-prevSemi)-Math.abs(b-prevSemi));
        semi = choices[0];
      } else {
        semi = choices[Math.floor(Math.random() * choices.length)];
      }
    } else {
      // motif-driven in-scale, stepwise contour (up then down)
      const scaleIdx = motif[motifPos % motif.length];
      motifPos++;
      semi = SCALE[scaleIdx];
      const isRise = stepIdx < (STEPS/2);
      if (prevSemi != null){
        const dir = isRise ? 1 : -1;
        const currIdx = SCALE.indexOf(semi);
        let nextIdx = currIdx + dir;
        if (nextIdx < 0 || nextIdx >= SCALE.length) nextIdx = currIdx;
        semi = SCALE[nextIdx];
      }
    }

    semi = ((semi % SEMIS)+SEMIS)%SEMIS;
    handles[stepIdx] = semi;
    prevSemi = semi;
  }

  // Small variation in second half (less when density is low)
  const vary = (density > 0.8) ? 0.7 : 0.35;
  if (Math.random() < vary){
    for (let i=Math.floor(STEPS/2); i<STEPS; i++){
      if (handles[i] != null && (i%4)!==0){
        const trans = Math.random()<0.5 ? 2 : 0;
        handles[i] = (handles[i] + trans) % SEMIS;
      }
    }
  }
}
