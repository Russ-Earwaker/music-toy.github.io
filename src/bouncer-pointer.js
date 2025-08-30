/* Extracted from bouncer.main.js (behavior-preserving) */
export function localPoint(canvas, evt){
  const r = canvas.getBoundingClientRect();
  const cssW = canvas.clientWidth || r.width || 1;
  const cssH = canvas.clientHeight || r.height || 1;
  const scaleX = (r.width||cssW) / cssW;
  const scaleY = (r.height||cssH) / cssH;
  return { x: (evt.clientX - r.left) / (scaleX||1), y: (evt.clientY - r.top) / (scaleY||1) };
}
