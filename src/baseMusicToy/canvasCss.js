// src/baseMusicToy/canvasCss.js
// Shared helpers for keeping canvas CSS size in sync (without resize churn).
//
// Philosophy:
// - CSS size (style.width/height) is the "logical" size used for layout.
// - We cache the CSS size on the element to avoid re-reads and to feed DPR math.
// - Do NOT read layout here; callers provide cssW/cssH from their own sizing truth.

export function syncCanvasCssSize(canvas, cssW, cssH, opts = {}) {
  if (!canvas) return false;
  const w = Math.max(1, Number.isFinite(cssW) ? cssW : 1);
  const h = Math.max(1, Number.isFinite(cssH) ? cssH : 1);
  const cachePrefix = opts.cachePrefix || '__bm';
  const cssWpx = `${w}px`;
  const cssHpx = `${h}px`;

  let changed = false;
  try {
    if (canvas.style) {
      if (canvas.style.width !== cssWpx) { canvas.style.width = cssWpx; changed = true; }
      if (canvas.style.height !== cssHpx) { canvas.style.height = cssHpx; changed = true; }
    }
  } catch {}

  // Always keep cached CSS size authoritative, even if style couldn't be set.
  try { canvas[`${cachePrefix}CssW`] = w; } catch {}
  try { canvas[`${cachePrefix}CssH`] = h; } catch {}

  // Optional: keep legacy caches in sync (useful during gradual migration).
  const also = opts.alsoCachePrefixes;
  if (Array.isArray(also)) {
    for (const p of also) {
      if (!p) continue;
      try { canvas[`${p}CssW`] = w; } catch {}
      try { canvas[`${p}CssH`] = h; } catch {}
    }
  }

  return changed;
}

