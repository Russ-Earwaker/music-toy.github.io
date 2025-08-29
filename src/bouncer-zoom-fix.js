// bouncer-zoom-fix.js — normalize canvas backing store on Advanced so pointer math matches render.
(function(){
  function normalize(panel){
    if (!panel || (panel.getAttribute('data-toy')!=='bouncer' && !panel.matches('[data-toy="bouncer"], .toy-panel[data-toy="bouncer"]'))) return;
    const body = panel.querySelector('.toy-body') || panel;
    const canvas = body.querySelector('canvas'); if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(r.width));
    const cssH = Math.max(1, Math.round(r.height));
    if (canvas.width !== cssW) canvas.width = cssW;
    if (canvas.height !== cssH) canvas.height = cssH;
    canvas.style.width = cssW+'px'; canvas.style.height = cssH+'px';
  }
  function onZoom(e){
    const p = e?.target; if (!(p instanceof HTMLElement)) return;
    if (p.getAttribute('data-toy')==='bouncer'){
      normalize(p);
      requestAnimationFrame(()=> normalize(p));
      setTimeout(()=> normalize(p), 60);
    }
  }
  document.addEventListener('toy-zoom', onZoom, { passive:true });
  // one-time normalize existing bouncers
  if (document.readyState === 'complete') document.querySelectorAll('[data-toy="bouncer"]').forEach(normalize);
  else window.addEventListener('load', ()=> document.querySelectorAll('[data-toy="bouncer"]').forEach(normalize), { once:true });
})();
