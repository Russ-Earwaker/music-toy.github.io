// src/wheel-random.js — movement-free musical randomization for the Wheel toy
// Keeps the musical behavior in a separate module to keep wheel.js lean (<300 lines).

export function randomizeWheel(handles){
  const STEPS = handles.length;
  const SEMIS = 12;
  const SCALE = [0,3,5,7,10]; // minor pentatonic
  const ANCH = [0, 7, 10];

  // Helper: fill Euclidean-ish positions
  function euclideanMask(N, k){
    const active = Array(N).fill(false);
    let pos = 0;
    const stepSize = N / k;
    for (let i=0;i<k;i++){
      active[Math.round(pos) % N] = true;
      pos += stepSize;
    }
    // fill any collisions if needed
    let need = k - active.filter(v=>v).length;
    if (need > 0){
      for (let i=0;i<N && need>0;i++){
        if (!active[i]){ active[i] = true; need--; }
      }
    }
    return active;
  }

  const N = STEPS;

  // choose count between 1/2 and 3/4 of steps
  const minC = Math.ceil(N*0.5), maxC = Math.floor(N*0.75);
  const k = Math.floor(minC + Math.random()*(maxC-minC+1));

  const active = euclideanMask(N, k);

  // Motif (3..5 notes) as scale indices with small steps
  const motifLen = 3 + Math.floor(Math.random()*3);
  const motif = [];
  let si = Math.floor(Math.random()*SCALE.length);
  motif.push(si);
  for (let i=1;i<motifLen;i++){
    const delta = (-1 + Math.floor(Math.random()*3)); // -1, 0, +1
    si = Math.max(0, Math.min(SCALE.length-1, si + delta));
    motif.push(si);
  }

  // Apply
  handles.fill(null);
  let prevSemi = null;
  let motifPos = 0;
  for (let stepIdx=0; stepIdx<N; stepIdx++){
    if (!active[stepIdx]) continue;
    let semi = null;

    if (stepIdx % 4 === 0){
      // choose anchor near previous if exists
      const choices = ANCH.map(a => a % 12);
      if (prevSemi != null){
        choices.sort((a,b)=> Math.abs(a-prevSemi)-Math.abs(b-prevSemi));
        semi = choices[0];
      } else {
        // First strong beat: vary the top note by choosing a random anchor
        semi = choices[Math.floor(Math.random() * choices.length)];
      }
    } else {
      // motif-driven in-scale, stepwise contour (up then down)
      const scaleIdx = motif[motifPos % motif.length];
      motifPos++;
      semi = SCALE[scaleIdx];
      const isRise = stepIdx < 8;
      if (prevSemi != null){
        const dir = isRise ? 1 : -1;
        const currIdx = SCALE.indexOf(semi);
        let nextIdx = currIdx + dir;
        if (nextIdx < 0 || nextIdx >= SCALE.length) nextIdx = currIdx;
        semi = SCALE[nextIdx];
      }
    }

    semi = ((semi % 12)+12)%12;
    handles[stepIdx] = semi;
    prevSemi = semi;
  }

  // Small variation in second half
  if (Math.random() < 0.7){
    for (let i=8;i<16;i++){
      if (handles[i] != null && (i%4)!==0){
        const trans = Math.random()<0.5 ? 2 : 0;
        handles[i] = (handles[i] + trans) % 12;
      }
    }
  }
}
