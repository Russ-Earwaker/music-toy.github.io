// src/ripplesynth-rects.js
export function makeGetBlockRects(n2x, n2y, sizing, BASE, blocks){
  return function getBlockRects(){
    const size = Math.max(20, Math.round(BASE * (sizing.scale||1)));
    const rects = [];
    for (let i=0;i<blocks.length;i++){
      const cx = n2x(blocks[i].nx), cy = n2y(blocks[i].ny);
      rects.push({ x: cx - size/2, y: cy - size/2, w: size, h: size, index: i });
    }
    return rects;
  };
}
