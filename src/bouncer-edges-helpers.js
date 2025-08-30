// Extracted edge controller helpers from bouncer.main.js (behavior-preserving)
import { makeEdgeControllers, mapControllersByEdge } from './bouncer-edges.js';

export function createEdgeHelpers(blockSize, EDGE, noteList){

  let edgeControllers = []; const edgeFlash = { left:0, right:0, top:0, bot:0 };


  function flashEdge(which){ const m = mapControllersByEdge(edgeControllers), c = m && m[which]; if (!c || !c.active) return; if (edgeFlash[which]!==undefined) edgeFlash[which]=1.0; }

  // blocks
  const N_BLOCKS = 4;
  let blocks = Array.from({length:N_BLOCKS}, ()=>({ x:EDGE, y:EDGE, w:blockSize(), h:blockSize(), noteIndex:0, active:true, flash:0, lastHitAT:0 }));

// --- anchor-based sizing for blocks & handle (fractions of world size) ---
function syncAnchorsFromBlocks(){
  const w = worldW(), h = worldH();
  for (const b of blocks){
    b._fx = (w>0) ? (b.x / w) : 0;
    b._fy = (h>0) ? (b.y / h) : 0;
    b._fw = (w>0) ? (b.w / w) : 0;
    b._fh = (h>0) ? (b.h / h) : 0;
  }



  function ensureEdgeControllers(w,h){
    if (!edgeControllers.length){
      edgeControllers = makeEdgeControllers(w, h, blockSize(), EDGE, noteList);
    }

  return { edgeControllers, edgeFlash, flashEdge, ensureEdgeControllers };
}
