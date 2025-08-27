// src/board-scale-helpers.js
const __baseW = new WeakMap();

export function boardScale(el){
  // Prefer CSS variable from board-viewport
  let css = 1;
  try{
    const v = getComputedStyle(el).getPropertyValue('--bv-scale');
    const n = parseFloat(v);
    if (Number.isFinite(n) && n>0) css = n;
  }catch{ css = 1; }

  // Fallback: visual width ratio vs first seen
  try{
    const w = (el.getBoundingClientRect?.().width || el.clientWidth || 0);
    if (w > 0){
      let base = __baseW.get(el);
      if (!base || base<=0){ __baseW.set(el, w); base = w; }
      const r = w / base;
      return (css && css>0) ? css : (r>0 ? r : 1);
    }
  }catch{}

  return css>0 ? css : 1;
}
