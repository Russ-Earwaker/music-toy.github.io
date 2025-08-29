// src/bouncer-square-fit.js
// Keep BOUNCER toy body square (height = width) and make canvas fill it.
// Also react to Advanced zoom enter/exit so scale is correct on first frame.
(function(){
  function forceCanvasFill(body){
    const c = body?.querySelector('canvas,svg');
    if (!c) return;
    c.style.setProperty('width','100%','important');
    c.style.setProperty('height','100%','important');
    c.style.display = 'block';
  }
  function squareBodyToWidth(body){
    const w = Math.max(1, Math.round(body.clientWidth));
    body.style.height = w + 'px';
  }
  function apply(panel){
    const body = panel.querySelector('.toy-body') || panel;
    squareBodyToWidth(body);
    forceCanvasFill(body);
  }
  function boot(){
    document.querySelectorAll('[data-toy="bouncer"]').forEach(apply);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  let t=0;
  window.addEventListener('resize', ()=>{ cancelAnimationFrame(t); t=requestAnimationFrame(boot); });
  // Recalculate on Advanced enter/exit
  document.addEventListener('toy-zoom', (e)=>{
    const p = e?.target; if (!p || !(p instanceof HTMLElement)) return;
    if (p.getAttribute('data-toy')==='bouncer'){
      // do immediate + next-frame pass for accuracy
      apply(p);
      cancelAnimationFrame(t);
      t = requestAnimationFrame(()=> apply(p));
    }
  }, { passive:true });
})(); 
