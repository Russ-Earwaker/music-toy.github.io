// src/bouncer-anchors.js
export function syncAnchorsFromBlocks(blocks, worldW, worldH){
  const w = worldW(), h = worldH();
  for (const b of blocks){
    b._fx = (w>0) ? (b.x / w) : 0;
    b._fy = (h>0) ? (b.y / h) : 0;
    b._fw = (w>0) ? (b.w / w) : 0;
    b._fh = (h>0) ? (b.h / h) : 0;
  }
}
export function syncBlocksFromAnchors(blocks, worldW, worldH, ballR, EDGE){
  const w = worldW(), h = worldH();
  const br = (typeof ballR==='function'? ballR(): (ballR||0));
  for (const b of blocks){
    const fx = (b._fx ?? (w? b.x / w : 0));
    const fy = (b._fy ?? (h? b.y / h : 0));
    const fw = (b._fw ?? (w? b.w / w : 0));
    const fh = (b._fh ?? (h? b.h / h : 0));
    b.w = Math.round(fw * w);
    b.h = Math.round(fh * h);
    b.x = Math.round(fx * w);
    b.y = Math.round(fy * h);
    const eL = EDGE + br, eT = EDGE + br, eR = w - EDGE - br, eB = h - EDGE - br;
    if (b.x < eL) b.x = eL;
    if (b.y < eT) b.y = eT;
    if (b.x + b.w > eR) b.x = eR - b.w;
    if (b.y + b.h > eB) b.y = eB - b.h;
  }
}
export function syncHandleAnchor(handle, worldW, worldH){
  try{ const w=worldW(), h=worldH(); if (w>0) handle._fx = handle.x / w; if (h>0) handle._fy = handle.y / h; }catch{}
}
