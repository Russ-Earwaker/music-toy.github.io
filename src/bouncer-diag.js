// bouncer-diag.js — quieter diagnostics (pointerdown/up only by default)
// Toggle pointermove logging by setting: window.BDIAG_LOG_MOVES = true
(function(){
  const TAG='[bouncer-diag]';
  const log = (...a)=>{  };


  window.BDIAG_LOG_MOVES = window.BDIAG_LOG_MOVES || false; // user-toggle

  function panels(){
    try{
      return Array.from(document.querySelectorAll('.toy-panel'))
        .filter(p => ((p.getAttribute('data-toy')||'').toLowerCase() === 'bouncer'));
    }catch(e){ return []; }
  }

  function infoForCanvas(canvas){
    const r = canvas.getBoundingClientRect();
    const dpr = (window.devicePixelRatio||1);
    const wCSS = Math.round(r.width||0), hCSS = Math.round(r.height||0);
    const wDev = canvas.width|0, hDev = canvas.height|0;
    const sx = wCSS>0 ? +(wDev/wCSS).toFixed(4) : 0;
    const sy = hCSS>0 ? +(hDev/hCSS).toFixed(4) : 0;
    return { dpr, wCSS, hCSS, wDev, hDev, sx, sy };
  }

  function attach(panel){
    if (!panel || panel.__bDiag) return;
    const body = panel.querySelector('.toy-body') || panel;
    const canvas = body && body.querySelector && body.querySelector('canvas');
    if (!canvas) return;

    panel.__bDiag = true;

    let lastMoveT = 0;
    const onPtr = (e)=>{
      if (e.type === 'pointermove' && !window.BDIAG_LOG_MOVES) return;
      if (e.type === 'pointermove' && window.BDIAG_LOG_MOVES){
        const now = performance.now();
        if (now - lastMoveT < 120) return; // throttle
        lastMoveT = now;
      }
      try{
        const r = canvas.getBoundingClientRect();
        const cssX = e.clientX - r.left;
        const cssY = e.clientY - r.top;
        const inf = infoForCanvas(canvas);
        const zoomed = panel.classList.contains('toy-zoomed');
        
      }catch{}
    };

    canvas.addEventListener('pointerdown', onPtr, true);
    canvas.addEventListener('pointermove', onPtr, true);
    canvas.addEventListener('pointerup', onPtr, true);

    const onZoom = ()=> log({ evt:'toy-zoom', zoomed: panel.classList.contains('toy-zoomed'), canvas: infoForCanvas(canvas) });
    panel.addEventListener('toy-zoom', onZoom);

    const onResize = ()=> log({ evt:'resize', zoomed: panel.classList.contains('toy-zoomed'), canvas: infoForCanvas(canvas) });
    window.addEventListener('resize', onResize, { passive:true });
  }

  function scan(){ panels().forEach(attach); }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', scan, { once:true });
  }
  scan();

  try{
    const mo = new MutationObserver(()=> scan());
    mo.observe(document.documentElement || document.body, { subtree:true, childList:true, attributes:true });
  }catch{}

  let n=0; const id = setInterval(()=>{ scan(); if (++n>40) clearInterval(id); }, 500);

  window.addEventListener('bouncer-diag-scan', scan);
})();
