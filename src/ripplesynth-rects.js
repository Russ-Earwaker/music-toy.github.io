// src/ripplesynth-rects.js
export function makeGetBlockRects(n2x, n2y, sizing, BASE, blocks){
  // Measure baseline span once to derive a stable rect scale
  const __baseSpanW = Math.max(1, Math.abs(n2x(1) - n2x(0)));
  return function getBlockRects(){
    // Scale size with current span (handles zoom/resize without drift)
    const __spanW = Math.max(1, Math.abs(n2x(1) - n2x(0)));
    const __rectScale = __spanW / __baseSpanW;
    const size = Math.max(20, Math.round(BASE * (sizing.scale||1) * __rectScale));

    const minX = Math.min(n2x(0), n2x(1));
    const maxX = Math.max(n2x(0), n2x(1));
    const minY = Math.min(n2y(0), n2y(1));
    const maxY = Math.max(n2y(0), n2y(1));

    const rects = [];
    for (let i=0;i<blocks.length;i++){
      const b = blocks[i] || {};
      const cx = n2x(b.nx || 0.5), cy = n2y(b.ny || 0.5);
      let x = cx - size/2, y = cy - size/2;
      x = Math.min(Math.max(x, minX), maxX - size);
      y = Math.min(Math.max(y, minY), maxY - size);
      rects.push({
        x, y, w: size, h: size,
        index: i,
        id: (b.id != null ? b.id : i),
        active: !!b.active,
        noteIndex: (typeof b.noteIndex === 'number' ? b.noteIndex : 0),
        // Provide multiple flash channels expected by the renderer
        flashEnd: (typeof b.flashEnd === 'number' ? b.flashEnd : 0),
        flashDur: (typeof b.flashDur === 'number' ? b.flashDur : 0),
        flash: (typeof b.cflash === 'number' ? b.cflash : (typeof b.pulse === 'number' ? b.pulse : (typeof b.flash === 'number' ? b.flash : 0))),
        cflash: (typeof b.cflash === 'number' ? b.cflash : 0),
        pulse: (typeof b.pulse === 'number' ? b.pulse : 0),
        labelOverride: (b.labelOverride ?? null)
      });
    }
    return rects;
  };
}
