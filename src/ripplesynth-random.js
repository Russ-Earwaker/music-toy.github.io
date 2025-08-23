// src/ripplesynth-random.js
// Random seeding for Rippler, now respecting Polite Random *and* mapping degrees to noteList indices.

import { noteList } from './utils.js';
import { getPoliteDensityForToy } from './polite-random.js';

// Map semitone offsets (e.g., [0,3,5,7,10]) to index positions within an octave of noteList.
// Assumes noteList is a minor-pentatonic listing per octave (5 notes), which matches this project.
function makeDegreeIndexMap(pentatonicOffsets){
  const map = new Map();
  for (let i=0;i<pentatonicOffsets.length;i++) map.set(pentatonicOffsets[i], i);
  return map;
}

export function randomizeAllImpl(ctx){
  const toyId = (ctx?.toyId || ctx?.panel?.dataset?.toyid || ctx?.panel?.dataset?.toy || 'rippler').toLowerCase();
  const {
    blocks, layoutBlocks, clearPattern,
    recordOnly, isActive, setRecording,
    setSkipNextBarRing, setPlaybackMuted,
    baseIndex, pentatonicOffsets
  } = ctx;

  if (!Array.isArray(blocks) || !blocks.length) return;

  // Layout reset
  try { layoutBlocks?.(); } catch {}
  for (const b of blocks){ b.vx=0; b.vy=0; b.flashEnd=0; }

  const N = blocks.length;
  const clamp = (v,min,max)=> v<min?min:(v>max?max:v);
  const uniq = (arr)=> Array.from(new Set(arr));
  const randInt = (a,b)=> (Math.floor(Math.random()*(b-a+1))+a);

  // Group size (notes per octave in noteList). Project uses minor pentatonic → 5.
  const GROUP = 5;

  // Build degree→index map from semitone offsets (fallback to canonical minor pent).
  const DEG = (Array.isArray(pentatonicOffsets) && pentatonicOffsets.length) ? pentatonicOffsets : [0,3,5,7,10];
  const DEGIDX = makeDegreeIndexMap(DEG);

  // How many blocks to activate (polite with global intensity)
  const baseK = 2 + (Math.random() < 0.6 ? 1 : 0); // 2 or 3
  const density = getPoliteDensityForToy(toyId, 1, { priority: 0.25, minScale: 0.10 });
  const K = clamp(Math.round(baseK * density), 1, Math.min(4, N));

  // Evenly distributed picks across N
  function evenlyPickK(k, n, rotate=0){
    const step = n / Math.max(1,k);
    const out = []; let pos = 0;
    for (let i=0;i<k;i++){ out.push(Math.round(pos) % n); pos += step; }
    const u = uniq(out); let need = k - u.length;
    for (let i=0;i<n && need>0;i++){ if (!u.includes(i)) { u.push(i); need--; } }
    return u.map(i => (i + rotate) % n);
  }
  const rotation = randInt(0, N-1);
  const picks = evenlyPickK(K, N, rotation);

  // Find the base 'C4' index and align to its octave start within noteList
  const bi = (typeof baseIndex === 'function') ? baseIndex(noteList) : Math.max(0, noteList.indexOf('C4'));
  const baseOct = Math.floor((bi >= 0 ? bi : 0) / GROUP) * GROUP;
  const hiBiasOctaves = 1; // slight high-register bias

  // Reset actives, then set chosen ones
  for (let i=0;i<N;i++) blocks[i].active = false;

  for (let j=0;j<picks.length;j++){
    const idxBlock = picks[j];
    const b = blocks[idxBlock]; if (!b) continue;
    b.active = true;

    if (!b.userEditedNote){
      // First pick: chord tones (0,7,10). Others: any pent degree.
      const firstPool = [0,7,10]; // semitone degrees
      const degSemi = (j === 0) ? firstPool[randInt(0, firstPool.length-1)]
                                : DEG[randInt(0, DEG.length-1)];

      // Convert semitone degree → index within the octave group
      const degIndexInGroup = DEGIDX.has(degSemi) ? DEGIDX.get(degSemi) : 0;

      // Choose an octave around C4 with a slight high bias
      const octOffset = (hiBiasOctaves + (Math.random()<0.5 ? 0 : -1)); // 0 or +1 most of the time, sometimes -1
      let idx = baseOct + degIndexInGroup + (octOffset * GROUP);

      // Keep inside bounds
      idx = clamp(idx, 0, (noteList?.length ?? 1)-1);

      b.noteIndex = idx;
      b.userEditedNote = false;
    }
  }

  // Reset playback state & arm recording for active blocks
  try { clearPattern?.(); } catch {}
  try { recordOnly?.clear?.(); } catch {}
  for (let i=0;i<N;i++){ if (isActive?.(blocks[i])) recordOnly?.add?.(i); }
  setRecording?.(true);
  setSkipNextBarRing?.(false);
  setPlaybackMuted?.(false);
}
