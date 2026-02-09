// src/baseMusicToy/dprPolicy.js
// Shared DPR policy helpers.
//
// IMPORTANT:
// - This file does NOT decide what the raw DPR should be. Toys still own that policy.
// - This file only applies the standard clamp pattern used across toys:
//     clamp = min(paintScale, capFn(cssW, cssH, rawDpr, adaptivePaintDpr))
//
// This keeps "pixels first" behaviour consistent across toys while allowing each toy
// to have its own raw DPR inputs (pressure, tiers, visual muls, gesture muls, etc).

export function clampDprForBackingStore({
  logicalW,
  logicalH,
  paintScale,
  rawDpr,
  capFn,
  adaptivePaintDpr,
}) {
  const w = Math.max(1, Number.isFinite(logicalW) ? logicalW : 1);
  const h = Math.max(1, Number.isFinite(logicalH) ? logicalH : 1);
  const ps = (Number.isFinite(paintScale) && paintScale > 0) ? paintScale : 1;
  const rd = (Number.isFinite(rawDpr) && rawDpr > 0) ? rawDpr : 1;

  let capped = rd;
  try {
    if (typeof capFn === 'function') {
      capped = capFn(w, h, rd, adaptivePaintDpr);
    }
  } catch {
    capped = rd;
  }

  // Never exceed paintScale (paint is the reference "truth" for CSS/backing alignment).
  const out = Math.min(ps, (Number.isFinite(capped) && capped > 0) ? capped : ps);
  return out;
}

