// bouncer-actions.js — shared helpers to keep bouncer.js small
import { randomizeRects } from './toyhelpers.js';
import { randomizeControllers } from './bouncer-edges.js';
import { getPoliteDensityForToy } from './polite-random.js';

export function buildPentatonicPalette(noteList, rootName='C4', mode='minor', octaves=2){
  const baseIx = noteList.indexOf(rootName)>=0 ? noteList.indexOf(rootName) : 48; // C4 fallback
  const minor = [0,3,5,7,10], major = [0,2,4,7,9];
  const offs = (mode==='major') ? major : minor;
  const out = [];
  const span = Math.max(1, Math.min(octaves, 3));
  for (let o=0;o<span;o++){
    for (let k=0;k<offs.length;k++){
      const ix = baseIx + offs[k] + o*12;
      if (ix >= 0 && ix < noteList.length) out.push(ix);
    }
  }
  return out.length ? out : [baseIx];
}

// Keep palette stepping available if needed elsewhere
export function stepIdxInPalette(currIdx, dir, palette){
  if (!Array.isArray(palette) || !palette.length) return currIdx||0;
  let nearest = 0, bestd = Infinity;
  for (let i=0;i<palette.length;i++){
    const d = Math.abs((currIdx||0) - palette[i]);
    if (d < bestd){ bestd = d; nearest = i; }
  }
  const next = (nearest + (dir>0?1:-1) + palette.length) % palette.length;
  return palette[next];
}

export function processVisQ(S, now, blocks, fx, flashEdge){
  if (!S || !Array.isArray(S.visQ) || !S.visQ.length) return;
  const due=[], rest=[];
  for (const e of S.visQ){ if (e.t <= now + 1e-4) due.push(e); else rest.push(e); }
  S.visQ = rest;
  for (const e of due){
    if (e.kind==='block'){
      const bi = e.idx|0;
      if (blocks && blocks[bi]){ blocks[bi].flash = 1.0; blocks[bi].lastHitAT = now; }
      if (fx && fx.onHit) fx.onHit(e.x, e.y);
    } else if (e.kind==='edge'){
      if (typeof flashEdge==='function') flashEdge(e.edge);
    }
  }
}

export function doRandomImpl({ panel, blocks, edgeControllers, noteList, worldW, worldH, EDGE, toyId }){
  const pr = Number(panel?.dataset?.priority || '1') || 1;
  const density = getPoliteDensityForToy(toyId || 'bouncer', 1, pr);

  const N = blocks.length;
  const K = Math.max(1, Math.min(N, Math.round(1 + density * (N - 1))));

  const w = worldW(), h = worldH();
  const baseBW = Math.round(w * 0.6), baseBH = Math.round(h * 0.6);
  const areaScale = 0.5 + 0.5 * density;
  const bw = Math.max(EDGE*4, Math.round(baseBW * areaScale));
  const bh = Math.max(EDGE*4, Math.round(baseBH * areaScale));
  const bx = Math.round((w - bw) / 2);
  const by = Math.round((h - bh) / 2);

  randomizeRects(blocks, { x: bx, y: by, w: bw, h: bh }, EDGE);

  const picks = [];
  if (K >= N) { for (let i=0;i<N;i++) picks.push(i); }
  else {
    const step = N / K; let pos = 0;
    for (let i=0;i<K;i++){ picks.push(Math.round(pos) % N); pos += step; }
    const uniq = Array.from(new Set(picks));
    while (uniq.length < K){
      const r = Math.floor(Math.random() * N);
      if (!uniq.includes(r)) uniq.push(r);
    }
    picks.length = 0; picks.push(...uniq);
  }
  for (let i=0;i<N;i++) blocks[i].active = false;
  for (const i of picks) if (blocks[i]) blocks[i].active = true;

  randomizeControllers(edgeControllers, noteList);
}
