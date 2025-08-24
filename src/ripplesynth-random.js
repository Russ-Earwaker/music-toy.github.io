// src/ripplesynth-random.js
// Random seeding for Rippler — single-octave pentatonic by default (fixes 3/4/5 octave drift).

import { getPoliteDensityForToy } from './polite-random.js';

/**
 * ctx:
 *  - panel, toyId
 *  - blocks, noteList
 *  - layoutBlocks(rects, opts)
 *  - clearPattern(), recordOnly(Set-like), isActive(b)
 *  - setRecording(bool), setSkipNextBarRing(bool), setPlaybackMuted(bool)
 *  - baseIndex(list)->number  (index of base note, e.g., 'C4')
 *  - pentatonicOffsets:number[] (e.g., [0,2,4,7,9,12,...])
 *  - vw, vh, EDGE, getBlockRects(), clamp(n,min,max)
 */
export function randomizeAllImpl(ctx){
  const {
    panel, toyId:tid,
    blocks, noteList,
    layoutBlocks, clearPattern, recordOnly, isActive,
    setRecording, setSkipNextBarRing, setPlaybackMuted,
    baseIndex, pentatonicOffsets, vw, vh, EDGE, getBlockRects, clamp
  } = ctx;

  const toyId = (tid || panel?.dataset?.toyid || panel?.dataset?.toy || 'rippler').toLowerCase();
  const N = blocks?.length || 0;
  if (!N || !Array.isArray(noteList) || !noteList.length) return;

  // ---- 1) Placement --------------------------------------------------------
  try {
    const bounds = { x: Math.round(vw*0.18), y: Math.round(vh*0.20),
                     w: Math.round(vw*0.64), h: Math.round(vh*0.62) };
    layoutBlocks(getBlockRects(N, bounds, EDGE), { jitter: 0.65, repel: 0.5 });
  } catch {}

  // ---- 2) Choose active set based on polite density ------------------------
  const density = getPoliteDensityForToy(toyId, 1, Number(panel?.dataset?.priority||'1')||1);
  const targetActive = Math.max(1, Math.min(N, Math.round(1 + density*(N-1))));

  let activeIdxs = new Set();
  // spread picks then fill random until targetActive
  const step = N/targetActive;
  for (let i=0;i<targetActive;i++) activeIdxs.add(Math.floor(i*step) % N);
  while (activeIdxs.size < targetActive) activeIdxs.add(Math.floor(Math.random()*N));

  for (let i=0;i<N;i++) blocks[i].active = activeIdxs.has(i);

  // ---- 3) Notes: map into ONE octave pentatonic around base ----------------
  const base = Math.max(0, baseIndex(noteList)|0);
  // Only keep offsets < 12 (single octave)
  const oneOct = (Array.isArray(pentatonicOffsets)? pentatonicOffsets : [0,2,4,7,9]).filter(o => o>=0 && o<12);
  const palIdx = oneOct.map((o) => {
    const idx = base + o; // map true pentatonic offsets within one octave
    return Math.max(0, Math.min(noteList.length-1, idx));
  });
// gentle upward bias but stay in pal
  const pickFromPal = ()=>{
    const r = Math.random();
    const i = (r<0.2)? 0 : (r<0.45)? 1 : (r<0.7)? 2 : (r<0.88)? 3 : 4;
    return palIdx[Math.min(palIdx.length-1, Math.max(0, i))];
  };

  for (let i=0;i<N;i++){
    const b = blocks[i];
    if (!b) continue;
    b.userEditedNote = false;
    b.noteIndex = pickFromPal();
  }

  // ---- 4) Reset/arm playback ----------------------------------------------
  try { clearPattern?.(); } catch {}
  try { recordOnly?.clear?.(); } catch {}
  for (let i=0;i<N;i++){ try{ if (isActive?.(blocks[i])) recordOnly?.add?.(i); }catch{} }
  try { setRecording?.(true); } catch {}
  try { setSkipNextBarRing?.(false); } catch {}
  try { setPlaybackMuted?.(false); } catch {}
}
