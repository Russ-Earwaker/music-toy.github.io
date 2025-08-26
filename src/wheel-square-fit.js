// src/wheel-square-fit.js
// Keep WHEEL toy window square (height = width) and make canvas fill it.
// Uses only width measurement (no loops) and ignores board zoom (transform). <120 lines>
(function(){
  
function forceCanvasFill(body){
  const c = body.querySelector('canvas') || body.querySelector('svg');
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
    document.querySelectorAll('[data-toy="wheel"]').forEach(apply);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  // Re-square on real layout changes
  let t=0;
  window.addEventListener('resize', ()=>{ cancelAnimationFrame(t); t=requestAnimationFrame(boot); });
})();