// src/bouncer-scale.js — anchor & rescale helpers (global attach, no ESM exports)

(function(global){
  // Save current positions/sizes into fractional anchors (blocks & handle)
  function syncAnchorsFromBlocks(){
    // Intentionally a no-op placeholder to match legacy call sites.
  }

  // Recompute blocks from normalized anchors
  function syncBlocksFromAnchors({ blocks, physW, physH }){
    try{
      const w = physW(), h = physH();
      for (const b of blocks){
        const fx = (b._fx ?? (w? b.x / w : 0));
        const fy = (b._fy ?? (h? b.y / h : 0));
        const fw = (b._fw ?? (w? b.w / w : 0));
        const fh = (b._fh ?? (h? b.h / h : 0));
        b.x = Math.round(fx * w);
        b.y = Math.round(fy * h);
        b.w = Math.round(fw * w);
        b.h = Math.round(fh * h);
      }
    }catch{}
  }

  // Recompute positions/sizes from stored anchors; keep ball and controllers coherent
  function rescaleBouncer({ blocks, handle, edgeControllers, physW, physH, EDGE, blockSize, ballRef, getBall, ballR, ensureEdgeControllers }){
    try{
      const w = physW(), h = physH();
      for (const b of blocks){
        const fx = (b._fx ?? (w? b.x / w : 0));
        const fy = (b._fy ?? (h? b.y / h : 0));
        const fw = (b._fw ?? (w? b.w / w : 0));
        const fh = (b._fh ?? (h? b.h / h : 0));
        b.x = Math.round(fx * w);
        b.y = Math.round(fy * h);
        b.w = Math.round(fw * w);
        b.h = Math.round(fh * h);
      }
      // Handle
      const hfx = (typeof handle._fx==='number') ? handle._fx : (w? handle.x/w : 0.5);
      const hfy = (typeof handle._fy==='number') ? handle._fy : (h? handle.y/h : 0.5);
      handle.x = Math.round(EDGE + hfx * Math.max(1, w - EDGE*2));
      handle.y = Math.round(EDGE + hfy * Math.max(1, h - EDGE*2));
      // Edge controllers
      ensureEdgeControllers && ensureEdgeControllers(w, h);
      for (const c of edgeControllers){ if (c){ c.w = blockSize(); c.h = blockSize(); } }
    }catch{}
  }

  // Attach to global
  global.syncAnchorsFromBlocks = syncAnchorsFromBlocks;
  global.syncBlocksFromAnchors = syncBlocksFromAnchors;
  global.rescaleBouncer = rescaleBouncer;
})(typeof window !== 'undefined' ? window : globalThis);
