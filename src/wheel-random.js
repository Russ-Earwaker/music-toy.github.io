// src/wheel-random.js — polite-aware randomiser for the Wheel
// Plays fewer notes when the mix is hot (global intensity high), but keeps a floor so it always has presence.

import { getPoliteDensityForToy } from './polite-random.js';

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

export function randomizeWheel(handles, opts = {}){
  const STEPS = handles.length|0;
  const SEMIS = 12;
  const SCALE_FULL = [0,3,5,7,10];   // minor pentatonic
  const ANCH = [0,7,10];             // chord-ish
  const toyId = String(opts.toyId || 'wheel').toLowerCase();
  const priority = Number(opts.priority || 1) || 1;

  // Density ~ 0.6 when busy .. ~1.2 when quiet (from polite-random)
  const density = getPoliteDensityForToy(toyId, 1, priority);

  // Map density -> fraction of active spokes:
  // busy (≈0.6) ⇒ near minFrac; quiet (≈1.2) ⇒ near maxFrac
  
  // Absolute minimum presence (user-asked): at least 6 spokes if possible
  const MIN_SPOKES = Math.min(STEPS, 6);

  // Map density -> fraction of active spokes:
  // busy (≈0.6) ⇒ near minFrac; quiet (≈1.2) ⇒ near maxFrac
  const minFrac = clamp(2 / Math.max(4, STEPS), 0.10, 0.20);  // legacy floor by fraction
  const maxFrac = 0.85;                                       // never all on
  const q = clamp((density - 0.6) / 0.6, 0, 1);               // 0..1  (0=busy, 1=quiet)
  const frac = minFrac + q * (maxFrac - minFrac);

  // Rhythmic constraint at low density to reduce “machinegun” feel.
  // Busy ⇒ prefer 8ths (stride 2), very busy ⇒ quarters (stride 4),
  // but automatically relax stride to ensure we can still hit MIN_SPOKES.
  const prefStride = density < 0.70 ? 4 : (density < 0.82 ? 2 : 1);

  const makeAllowed = (stride)=>{
    const a = [];
    for (let i=0;i<STEPS;i++){ if (i % stride === 0) a.push(i); }
    return a;
  };

  let stride = prefStride;
  let allowed = makeAllowed(stride);
  if (allowed.length < MIN_SPOKES && stride > 1){
    stride = (stride === 4) ? 2 : 1;
    allowed = makeAllowed(stride);
    if (allowed.length < MIN_SPOKES && stride > 1){
      stride = 1;
      allowed = makeAllowed(stride);
    }
  }

  const poolN = allowed.length;
  const KbyFrac = Math.round(STEPS * frac);
  const Kmin = Math.min(poolN, Math.max(MIN_SPOKES, Math.round(minFrac*STEPS)));
  const Kmax = Math.min(poolN, Math.round(maxFrac * STEPS));
  const K = clamp(KbyFrac, Kmin, Math.max(Kmin, Kmax));

  function euclideanFromPool(pool, k){
    const active = new Set();
    const n = pool.length;
    if (k >= n){ pool.forEach(i=>active.add(i)); return active; }
    const step = n / k;
    let pos = 0;
    for (let i=0;i<k;i++){ active.add(pool[Math.round(pos) % n]); pos += step; }
    if (active.size < k){ // repair rounding
      for (let i=0;i<n && active.size<k;i++){ active.add(pool[i]); }
    }
    return active;
  }

  const activeIdx = euclideanFromPool(allowed, K);

  // Simpler scale when busy; fuller when quiet
  const SCALE = (density < 0.9) ? [0,3,7,10] : SCALE_FULL;

  // Motif shorter & more stepwise when busy
  const motifLen = (density < 0.85) ? 3 : 4 + Math.floor(Math.random()*2); // 3..5
  const motif = [];
  let si = Math.floor(Math.random()*SCALE.length);
  motif.push(si);
  for (let i=1;i<motifLen;i++){
    const delta = (-1 + Math.floor(Math.random()*3)); // -1,0,+1
    si = clamp(si + delta, 0, SCALE.length-1);
    motif.push(si);
  }

  // Apply handles
  handles.fill(null);
  let prevSemi = null;
  let motifPos = 0;
  for (let stepIdx=0; stepIdx<STEPS; stepIdx++){
    if (!activeIdx.has(stepIdx)) continue;
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
      const isRise = (q > 0.5) ? (stepIdx < (STEPS/2)) : (stepIdx < (STEPS*0.35)); // slightly shorter rise when busy
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

  // Light second-half variation (less when busy)
  const vary = (q > 0.5) ? 0.7 : 0.35;
  if (Math.random() < vary){
    for (let i=Math.floor(STEPS/2); i<STEPS; i++){
      if (handles[i] != null && (i%4)!==0){
        const trans = (q > 0.5 && Math.random()<0.5) ? 2 : 0;
        handles[i] = (handles[i] + trans) % SEMIS;
      }
    }
  }
}
