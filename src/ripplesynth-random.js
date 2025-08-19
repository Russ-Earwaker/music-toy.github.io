// src/ripplesynth-random.js
// Random seeding for Rippler that aligns musically with Wheel
// Constraints: DO NOT change notes/timing once set; this only prepares the initial state.
// Choices:
//  - Minor pentatonic scale (0,3,5,7,10) relative to base
//  - High register bias (one octave above C4 baseline)
//  - 2–3 active cubes, evenly spread across 8 using a simple Euclidean-ish spacing
//  - First pick biased to chord tones (root/5th/b7 -> for minor pent: 0,7,10)
//  - No adjacent semitone clumping across picks
//  - Respects userEditedNote: only overwrites noteIndex for blocks the user hasn't edited

export function randomizeAllImpl(ctx){
  const {
    blocks, noteList, layoutBlocks, clearPattern,
    recordOnly, isActive, setRecording,
    setSkipNextBarRing, setPlaybackMuted,
    baseIndex, pentatonicOffsets
  } = ctx;

  // Layout & visual reset
  layoutBlocks?.();
  for (const b of blocks){ b.vx=0; b.vy=0; b.flashEnd=0; }

  // --- Helpers ---
  const N_BLOCKS = blocks.length || 8;
  const clamp = (v,min,max)=> v<min?min:(v>max?max:v);
  const uniq = (arr)=> Array.from(new Set(arr));
  const randInt = (a,b)=> (Math.floor(Math.random()*(b-a+1))+a);
  const shuffle = (arr)=> { for (let i=arr.length-1;i>0;i--){ const j=randInt(0,i); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; };

  // Scale: minor pentatonic (Wheel's default)
  const SCALE = [0,3,5,7,10];

  // Euclidean-ish picks across N indices
  function evenlyPickK(k, n, rotate=0){
    const step = n / k;
    const out = [];
    let pos = 0;
    for (let i=0;i<k;i++){ out.push(Math.round(pos) % n); pos += step; }
    // resolve duplicates (rare when n/k is not integer)
    let u = uniq(out);
    let need = k - u.length;
    if (need>0){
      for (let i=0;i<n && need>0;i++){
        if (!u.includes(i)) { u.push(i); need--; }
      }
    }
    // rotate
    return u.map(i => (i + rotate) % n);
  }

  // --- Choose which blocks are active ---
  const K = 2 + (Math.random() < 0.6 ? 1 : 0); // 2 or 3
  const rotation = 1 + randInt(0,2); // small rotation so it changes feel
  const picks = evenlyPickK(K, N_BLOCKS, rotation);

  // --- Assign notes (only for blocks user hasn't edited) ---
  // Push register up so Rippler sparkles above Wheel
  const baseIx = baseIndex?.(noteList) ?? 48; // index of C4 fallback
  const baseHi = baseIx + 12; // one octave above

  // First degree bias: chord tones (minor: 0, 7, 10)
  const ANCH = [0,7,10];
  const degrees = [];
  // pick anchor closest to current block's note if present, else random from ANCH
  const firstDeg = ANCH[randInt(0,ANCH.length-1)];
  degrees.push(firstDeg);
  // remaining degrees from SCALE but avoid exact repeats
  while (degrees.length < picks.length){
    const d = SCALE[randInt(0, SCALE.length-1)];
    if (d !== degrees[degrees.length-1]) degrees.push(d);
  }

  // Apply: deactivate all; activate picks; set noteIndex for unedited
  for (let i=0;i<N_BLOCKS;i++){ blocks[i].active = false; }
  for (let j=0;j<picks.length;j++){
    const bi = picks[j];
    const b = blocks[bi];
    b.active = true;
    if (!b.userEditedNote){
      const deg = degrees[j % degrees.length];
      const idx = clamp(baseHi + deg, 0, (noteList?.length ?? 1)-1);
      b.noteIndex = idx;
      b.userEditedNote = false;
    }  // Also assign harmonically aligned notes to INACTIVE blocks (if not user-edited)
  // so if the user later enables them, they already sit well with Wheel.
  for (let i=0;i<N_BLOCKS;i++){
    const b = blocks[i];
    if (b.active) continue;
    if (!b.userEditedNote){
      // Choose a scale degree (minor pent). De-emphasize anchors slightly so actives stand out.
      const pool = SCALE.slice();
      let deg = pool[randInt(0, pool.length-1)];
      // Avoid exact duplicate degree of immediate left neighbor when possible
      const left = blocks[(i-1+N_BLOCKS)%N_BLOCKS];
      if (left && typeof left.noteIndex === 'number'){
        const ldeg = ((left.noteIndex - baseHi) % 12 + 12) % 12;
        let tries=0; while (tries<3 && ldeg === deg){ deg = pool[randInt(0, pool.length-1)]; tries++; }
      }
      const idx = clamp(baseHi + deg, 0, (noteList?.length ?? 1)-1);
      b.noteIndex = idx;
      b.userEditedNote = false;
    }
  }


  }

  // --- Reset playback state & arm recording for active blocks ---
  try { clearPattern?.(); } catch {}
  try { recordOnly?.clear?.(); } catch {}
  for (let i=0;i<N_BLOCKS;i++){ if (isActive?.(blocks[i])) recordOnly?.add?.(i); }
  setRecording?.(true);
  setSkipNextBarRing?.(false);
  setPlaybackMuted?.(false);
}
