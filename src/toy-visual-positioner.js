// src/toy-visual-positioner.js
// Absolute-position each toy's visual (canvas/SVG) to fill the *remaining* space
// below header/controls — without changing your layout (no flex wrappers, no reparenting).
// Keeps canvas backing store crisp via a throttled ResizeObserver. (<300 lines)
(function(){
  const DPR = ()=> window.devicePixelRatio || 1;

  function getTopOffset(panel){
    let top = 0;
    const header = panel.querySelector('.toy-header');
    if (header){
      const hs = getComputedStyle(header);
      if (hs.display !== 'none' && hs.visibility !== 'hidden' && hs.position !== 'absolute'){
        top += header.offsetHeight;
      }
    }
    panel.querySelectorAll('.toy-controls').forEach(ctrl=>{
      const cs = getComputedStyle(ctrl);
      if (cs.display !== 'none' && cs.visibility !== 'hidden' && cs.position !== 'absolute'){
        top += ctrl.offsetHeight;
      }
    });
    return top;
  }

  function pickVisual(panel){
    // Prefer toy-specific classes if present, else first canvas/svg
    return panel.querySelector('.wheel-canvas, .grid-canvas, .rippler-canvas, .bouncer-canvas, canvas, svg');
  }

  function wirePanel(panel){
    // The loopgrid toy has its own complex grid layout defined in CSS.
    // This generic positioner would break it, so we skip it.
    if (panel.dataset.toy === 'loopgrid') return;

    const visual = pickVisual(panel);
    if (!visual) return;

    // Ensure the panel is the positioning context (no layout change)
    const ps = getComputedStyle(panel);
    if (ps.position === 'static') panel.style.position = 'relative';

    // Visual should fill remaining space: top = header+controls, bottom=0, left/right=0
    const applyBox = ()=>{
      const top = getTopOffset(panel);
      visual.style.setProperty('position', 'absolute');
      visual.style.setProperty('left', '0');
      visual.style.setProperty('right', '0');
      visual.style.setProperty('bottom', '0');
      visual.style.setProperty('top', top + 'px');
      visual.style.setProperty('width', 'auto', 'important');
      visual.style.setProperty('height', 'auto', 'important');
      visual.style.display = 'block'; // avoid baseline gap
    };

    // Keep canvas/SVG pixel buffer matched to its on-screen size (crisp)
    let raf = 0;
    const resizeBacking = ()=>{
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

    // Initial pass
    applyBox();
    resizeBacking();

    // Observe the panel for layout changes that affect the top offset or size
    const ro = new ResizeObserver(()=>{ applyBox(); resizeBacking(); });
    ro.observe(panel);

    // If header/controls are added/removed later
    const mo = new MutationObserver(()=>{ applyBox(); resizeBacking(); });
    mo.observe(panel, { childList: true, subtree: true });
  }

  function boot(){
    document.querySelectorAll('.toy-panel').forEach(wirePanel);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Handle panels added later
  const root = document.getElementById('board') || document.body;
  const addObs = new MutationObserver((muts)=>{
    for (const m of muts){
      (m.addedNodes||[]).forEach(n=>{
        if (n.nodeType===1 && n.classList?.contains('toy-panel')) wirePanel(n);
      });
    }
  });
  addObs.observe(root, { childList:true, subtree:true });
})();