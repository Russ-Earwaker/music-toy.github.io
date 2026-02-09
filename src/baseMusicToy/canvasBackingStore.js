// src/baseMusicToy/canvasBackingStore.js
// Shared helpers for canvas backing-store sizing.
//
// Philosophy:
// - Backing store size is expensive to change (realloc + clears).
// - Callers decide *when* to resize; this helper only applies the resize and caches metadata.

export function applyCanvasBackingSize(canvas, pxW, pxH, dpr, opts = {}) {
  if (!canvas) return { resized: false };
  const w = Math.max(1, (Number.isFinite(pxW) ? Math.round(pxW) : 1));
  const h = Math.max(1, (Number.isFinite(pxH) ? Math.round(pxH) : 1));
  const cachePrefix = opts.cachePrefix || '__bm';

  let resized = false;
  try {
    if ((canvas.width|0) !== w) { canvas.width = w; resized = true; }
    if ((canvas.height|0) !== h) { canvas.height = h; resized = true; }
  } catch {
    // If we can't resize (rare), treat as not resized.
    resized = false;
  }

  // Cache backing DPR used for this canvas (debug + downstream math).
  try { canvas[`${cachePrefix}BackingDpr`] = Number.isFinite(dpr) ? dpr : 1; } catch {}

  // Optional: keep legacy caches in sync during migration.
  const also = opts.alsoCachePrefixes;
  if (Array.isArray(also)) {
    for (const p of also) {
      if (!p) continue;
      try { canvas[`${p}BackingDpr`] = Number.isFinite(dpr) ? dpr : 1; } catch {}
    }
  }

  return { resized };
}

