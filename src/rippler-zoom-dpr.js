// src/rippler-zoom-dpr.js
// Keep Rippler canvas backing store in sync with its visual size for crisp rendering.
(function(){
  function setup(panel){
    const body = panel.querySelector('.toy-body') || panel;
    const cvs = body.querySelector('canvas');
    if (!cvs) return;
    const ctx = cvs.getContext && cvs.getContext('2d');
    const DPR = () => window.devicePixelRatio || 1;
    let rafId = 0;

    function resize(){
      const w = Math.max(1, Math.round(body.clientWidth));
      const h = Math.max(1, Math.round(body.clientHeight));
      const pxW = Math.max(1, Math.round(w * DPR()));
      const pxH = Math.max(1, Math.round(h * DPR()));
      if (cvs.width !== pxW) cvs.width = pxW;
      if (cvs.height !== pxH) cvs.height = pxH;
      // Optional: notify toy code that logical size changed
      try { panel.dispatchEvent(new CustomEvent('toy:resize', { detail: { w, h } })); } catch {}
      if (ctx && ctx.reset) try{ ctx.reset(); }catch{}
    }

    const ro = new ResizeObserver(()=>{
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(resize);
    });
    ro.observe(body);
    // Initial
    resize();
  }

  function boot(){
    document.querySelectorAll('[data-toy="rippler"]').forEach(setup);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Also watch for future rippler panels being added
  const root = document.getElementById('board') || document.body;
  const mo = new MutationObserver((muts)=>{
    for (const m of muts){
      (m.addedNodes||[]).forEach(n=>{
        if (n.nodeType===1 && n.matches?.('[data-toy="rippler"]')) setup(n);
        if (n.nodeType===1) n.querySelectorAll?.('[data-toy="rippler"]').forEach(setup);
      });
    }
  });
  mo.observe(root, { childList:true, subtree:true });
})();