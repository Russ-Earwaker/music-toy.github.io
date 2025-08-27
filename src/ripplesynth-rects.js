// src/ripplesynth-rects.js
export function makeGetBlockRects(n2x, n2y, sizing, BASE, blocks){
  return function getBlockRects(){
    // CLAMPED_INSIDE: ensure blocks stay fully within visible n2x/n2y range
    const size = Math.max(20, Math.round(BASE * (sizing.scale||1)));
    const rects = [];
    const minX = Math.min(n2x(0), n2x(1));
    const maxX = Math.max(n2x(0), n2x(1));
    const minY = Math.min(n2y(0), n2y(1));
    const maxY = Math.max(n2y(0), n2y(1));
    for (let i=0;i<blocks.length;i++){
      const cx = n2x(blocks[i].nx), cy = n2y(blocks[i].ny);
      let x = cx - size/2, y = cy - size/2;
      x = Math.min(Math.max(x, minX), maxX - size);
      y = Math.min(Math.max(y, minY), maxY - size);
      rects.push({ x, y, w: size, h: size, index: i });
    }
    return rects;
  };
}
