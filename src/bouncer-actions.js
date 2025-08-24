// bouncer-actions.js — shared helpers to keep bouncer.js slim
import { randomizeRects } from './toyhelpers.js';
import { randomizeControllers } from './bouncer-edges.js';
import { getPoliteDensityForToy } from './polite-random.js';

export function buildPentatonicPalette(noteList, root='C4', mode='minor', octaves=2){
  const base = Math.max(0, noteList.indexOf(root));
  const offs = (mode==='major') ? [0,2,4,7,9] : [0,3,5,7,10];
  const span = Math.max(1, Math.min(3, octaves));
  const out = [];
  for (let o=0;o<span;o++){
    for (let k=0;k<offs.length;k++){
      const ix = base + offs[k] + o*12;
      if (ix>=0 && ix<noteList.length) out.push(ix);
    }
  }
  return out.length ? out : [Math.floor(noteList.length/2)];
}

export function processVisQ(S, now, blocks, fx, flashEdge){
  if (!S || !Array.isArray(S.visQ) || !S.visQ.length) return;
  const due=[], rest=[];
  for (const e of S.visQ){ ((e.t||0) <= now) ? due.push(e) : rest.push(e); }
  S.visQ = rest;
  for (const e of due){
    if (e.kind === 'block'){
      const b = blocks[e.idx|0];
      if (b){ b.flash = 1.0; b.lastHitAT = now; }
      if (fx && fx.onHit) fx.onHit(e.x, e.y);
    } else if (e.kind === 'edge'){
      if (typeof flashEdge === 'function') flashEdge(e.edge);
    }
  }
}

export function doRandomImpl({ panel, blocks, edgeControllers, noteList, worldW, worldH, EDGE, toyId }){
  const pr = Number(panel?.dataset?.priority || '1') || 1;
  const density = getPoliteDensityForToy(toyId || 'bouncer', 1, pr);

  const N = blocks.length;
  const w = worldW(), h = worldH();
  const baseBW = Math.round(w * 0.6), baseBH = Math.round(h * 0.6);
  const areaScale = 0.5 + 0.5 * density;
  const bw = Math.max(EDGE*4, Math.round(baseBW * areaScale));
  const bh = Math.max(EDGE*4, Math.round(baseBH * areaScale));
  const bx = Math.round((w - bw) / 2);
  const by = Math.round((h - bh) / 2);

  randomizeRects(blocks, { x: bx, y: by, w: bw, h: bh }, EDGE);
  randomizeControllers(edgeControllers, noteList);

  // Toggle a density-proportional number of active blocks
  const K = Math.max(1, Math.min(N, Math.round(1 + density * (N - 1))));
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
}


export function drawEdgeFlash(ctx, edgeFlash, EDGE, w, h){
  if (!(edgeFlash && ctx)) return;
  if (edgeFlash.top>0 || edgeFlash.bot>0 || edgeFlash.left>0 || edgeFlash.right>0){
    ctx.lineWidth = 4;
    if (edgeFlash.top > 0){ ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.moveTo(EDGE, EDGE); ctx.lineTo(w-EDGE, EDGE); ctx.stroke(); }
    if (edgeFlash.bot > 0){ ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.moveTo(EDGE, h-EDGE); ctx.lineTo(w-EDGE, h-EDGE); ctx.stroke(); }
    if (edgeFlash.left > 0){ ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.moveTo(EDGE, EDGE); ctx.lineTo(EDGE, h-EDGE); ctx.stroke(); }
    if (edgeFlash.right > 0){ ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.moveTo(w-EDGE, EDGE); ctx.lineTo(w-EDGE, h-EDGE); ctx.stroke(); }
    edgeFlash.top *= 0.85; edgeFlash.bot *= 0.85; edgeFlash.left *= 0.85; edgeFlash.right *= 0.85;
    if (edgeFlash.top < 0.03) edgeFlash.top = 0;
    if (edgeFlash.bot < 0.03) edgeFlash.bot = 0;
    if (edgeFlash.left < 0.03) edgeFlash.left = 0;
    if (edgeFlash.right < 0.03) edgeFlash.right = 0;
  }
}
