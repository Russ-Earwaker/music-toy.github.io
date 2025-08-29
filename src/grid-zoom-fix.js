// grid-zoom-fix.js — keep Grid short & wide on first frame of Advanced
(function(){
  function stepsOf(panel){
    const n = parseInt(panel?.dataset?.steps||'16',10);
    return (isFinite(n) && n>1) ? Math.min(64, Math.max(2, n|0)) : 16;
  }
  function calcGridH(w, steps){
    const pad=10, top=6, bot=6;
    const cell = Math.max(20, Math.floor((w - pad*2)/steps));
    return top + Math.max(24, cell) + bot;
  }
  function settle(panel){
    try{
      const body = panel.querySelector('.toy-body') || panel;
      const w = Math.max(1, Math.round(body.clientWidth));
      const h = calcGridH(w, stepsOf(panel));
      body.style.height = h + 'px';
    }catch{}
  }
  function onZoom(e){
    const p = e?.target; if (!p || !(p instanceof HTMLElement)) return;
    const isGrid = p.getAttribute('data-toy')==='grid' || !!p.querySelector('.grid-canvas');
    if (!isGrid) return;
    settle(p);
    requestAnimationFrame(()=> settle(p));
    setTimeout(()=> settle(p), 50);
  }
  document.addEventListener('toy-zoom', onZoom, { passive:true });
})(); 
