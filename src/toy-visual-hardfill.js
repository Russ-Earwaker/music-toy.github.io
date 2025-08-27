// src/toy-visual-hardfill.js
// Deterministic, no-wrappers, no-flex, no style loops.
// Places each toy's canvas/SVG to fill the space below header+controls, keeps DPR crisp.
// Safe to run alongside anything else (but best used with toy-panel-heights.js). <200 lines>
(function(){
  const DPR = ()=> window.devicePixelRatio || 1;

  function shown(el){
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }

  function chromeTop(panel){
    let top = 0;
    const header = panel.querySelector('.toy-header');
    if (header && shown(header) && getComputedStyle(header).position !== 'absolute'){
      top += header.offsetHeight;
    }
    panel.querySelectorAll('.toy-controls').forEach(ctrl=>{
      const cs = getComputedStyle(ctrl);
      if (shown(ctrl) && cs.position !== 'absolute'){
        top += ctrl.offsetHeight;
      }
    });
    return top;
  }

  function pickVisual(panel){
    return panel.querySelector('.wheel-canvas, .grid-canvas, .rippler-canvas, .bouncer-canvas, canvas, svg');
  }

  function place(panel){
    const visual = pickVisual(panel);
    if (!visual) return;
    // Make panel the positioning context
    if (getComputedStyle(panel).position === 'static') panel.style.position = 'relative';

    const apply = ()=>{
      const top = chromeTop(panel);
      visual.style.position = 'absolute';
      visual.style.left = '0';
      visual.style.right = '0';
      visual.style.bottom = '0';
      visual.style.top = top + 'px';
      visual.style.display = 'block';
      // Don't touch CSS width/height beyond placement; let AbsPos define size
      visual.style.removeProperty('width');
      visual.style.removeProperty('height');
    };

    // Keep canvas backing store matched to on-screen size
    let raf = 0;
    const syncDPR = ()=>{
      if (raf) return;
      raf = requestAnimationFrame(()=>{
        raf = 0;
        const r = visual.getBoundingClientRect();
        const w = Math.max(1, Math.round(r.width));
        const h = Math.max(1, Math.round(r.height));
        if (visual.tagName === 'CANVAS'){
          const pxW = Math.max(1, Math.round(w * DPR()));
          const pxH = Math.max(1, Math.round(h * DPR()));
          if (visual.width !== pxW) visual.width = pxW;
          if (visual.height !== pxH) visual.height = pxH;
        } else if (visual.tagName === 'SVG'){
          visual.setAttribute('viewBox', `0 0 ${w} ${h}`);
          visual.setAttribute('preserveAspectRatio', 'none');
        }
      });
    };

    apply(); syncDPR();

    const ro = new ResizeObserver(()=>{ apply(); syncDPR(); });
    ro.observe(panel);

    const mo = new MutationObserver(()=>{ apply(); syncDPR(); });
    mo.observe(panel, { childList:true, subtree:true });
  }

  function boot(){
    document.querySelectorAll('.toy-panel').forEach(place);
  }

  // Run late to beat builders
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);

  // New panels
  const root = document.getElementById('board') || document.body;
  const addObs = new MutationObserver((muts)=>{
    for (const m of muts){
      (m.addedNodes||[]).forEach(n=>{
        if (n.nodeType===1 && n.classList?.contains('toy-panel')) place(n);
      });
    }
  });
  addObs.observe(root, { childList:true, subtree:true });
})();