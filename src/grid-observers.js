// src/grid-observers.js — shared redraw observers for toys
export function attachGridRedrawObservers(panel, body, draw, getPainted){
  try {
    const mo = new MutationObserver(()=> draw());
    mo.observe(panel, { attributes: true, attributeFilter: ['class'] });
  } catch {}
  try {
    const ro = new ResizeObserver(()=> draw());
    ro.observe(panel);
    ro.observe(body);
  } catch {}
  try {
    let tries = 0;
    const id = setInterval(()=>{
      const painted = typeof getPainted==='function' ? !!getPainted() : false;
      if (painted || ++tries > 20) { clearInterval(id); return; }
      draw();
    }, 50);
  } catch {}
}
