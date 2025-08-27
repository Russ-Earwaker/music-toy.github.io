// src/board-scale-helpers.js
export function bvScaleFromCSS(el){
  try{
    const v = getComputedStyle(el).getPropertyValue('--bv-scale');
    const n = parseFloat(v);
    return (Number.isFinite(n) && n>0) ? n : 1;
  }catch{ return 1; }
}
