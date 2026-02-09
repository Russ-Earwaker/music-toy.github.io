// src/baseMusicToy/syncCanvasesCssSize.js
// Batch helper to keep CSS size authoritative for multiple canvases.
// Avoids repeated boilerplate loops in toys.

import { syncCanvasCssSize } from './canvasCss.js';

export function syncCanvasesCssSize(canvases, cssW, cssH, opts = {}) {
  if (!canvases || !canvases.length) return;
  const w = Math.max(1, cssW | 0);
  const h = Math.max(1, cssH | 0);
  for (const c of canvases) {
    if (!c) continue;
    syncCanvasCssSize(c, w, h, opts);
  }
}

