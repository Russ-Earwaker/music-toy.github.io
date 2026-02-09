// src/baseMusicToy/createToyCanvasRig.js
// Minimal shared "toy canvas rig":
// - waits for stable container size (optional)
// - resizes a canvas via resizeCanvasForDpr (the shared truth-point)
// - keeps the most recent cssW/cssH and dpr info on a small rig state
//
// This is intentionally not a framework. It just centralizes the boring plumbing.

import { waitForStableBox } from './waitForStableBox.js';
import { resizeCanvasForDpr } from './resizeCanvasForDpr.js';

export function createToyCanvasRig({
  canvas,
  ctx,
  getContainerEl,          // () => HTMLElement | null
  getSizeOverride,         // optional: () => ({ w, h } | null)
  computeResizeOpts,       // () => opts for resizeCanvasForDpr (rawDpr/maxDprMul/gate/etc)
  cachePrefix = '__bm',
  alsoCachePrefixes = null,
  stableBoxFrames = 6,
} = {}) {
  const st = {
    cssW: 0,
    cssH: 0,
    dpr: 1,
    deviceDpr: 1,
    lastResize: null,
  };

  function ensureSizedNow(cssW, cssH) {
    let w = Math.max(1, (cssW | 0));
    let h = Math.max(1, (cssH | 0));

    const optsRaw = (typeof computeResizeOpts === 'function') ? computeResizeOpts({ cssW: w, cssH: h }) : {};
    const opts = {
      ...(optsRaw || {}),
      cachePrefix: (optsRaw && optsRaw.cachePrefix) ? optsRaw.cachePrefix : cachePrefix,
      alsoCachePrefixes: (optsRaw && optsRaw.alsoCachePrefixes) ? optsRaw.alsoCachePrefixes : (alsoCachePrefixes || null),
    };

    const rsz = resizeCanvasForDpr(canvas, ctx, w, h, opts);
    st.cssW = w;
    st.cssH = h;
    st.dpr = rsz.dpr;
    st.deviceDpr = rsz.deviceDpr;
    st.lastResize = rsz;
    return rsz;
  }

  async function ensureSized({ waitStable = true } = {}) {
    let w = 0, h = 0;

    const ov = (typeof getSizeOverride === 'function') ? getSizeOverride() : null;
    if (ov && Number.isFinite(ov.w) && Number.isFinite(ov.h)) {
      w = ov.w | 0;
      h = ov.h | 0;
    } else {
      const el = (typeof getContainerEl === 'function') ? getContainerEl() : null;
      if (waitStable && el) {
        const box = await waitForStableBox(el, { maxFrames: stableBoxFrames });
        w = box.width | 0;
        h = box.height | 0;
      } else if (el && el.getBoundingClientRect) {
        const r = el.getBoundingClientRect();
        w = Math.round(r.width) | 0;
        h = Math.round(r.height) | 0;
      }
    }

    return ensureSizedNow(w, h);
  }

  return { st, ensureSized, ensureSizedNow };
}
