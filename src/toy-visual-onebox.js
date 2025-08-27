// src/toy-visual-onebox.js
// Single, final approach: ONE visual box per toy.
// - Ensures exactly one .toy-body that fills below header+controls (absolute positioned)
// - Moves the toy visual (canvas/SVG) into .toy-body
// - Visual fills box (width/height:100%) and stays crisp via DPR-aware backing store
// - Removes any leftover .toy-vbody wrappers to prevent stacking/zero-height bugs
// - No aspect-ratio hacks, no style mutation loops, no flex rewrites. (<300 lines)
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

  function ensureBody(panel){
    // Remove any leftover .toy-vbody wrappers (we standardize on .toy-body)
    panel.querySelectorAll('.toy-vbody').forEach(vb=>{
      // Move any children up to panel before removing
      while (vb.firstChild) panel.appendChild(vb.firstChild);
      vb.remove();
    });

    let body = panel.querySelector('.toy-body');
    if (!body){
      body = document.createElement('div');
      body.className = 'toy-body';
      panel.appendChild(body);
    }

    // Panel as positioning context
    if (getComputedStyle(panel).position === 'static') panel.style.position = 'relative';

    // .toy-body fills the remaining space
    Object.assign(body.style, {
      position: 'absolute',
      left: '0px', right: '0px', bottom: '0px',
      padding: '0px', margin: '0px', border: '0px',
      overflow: 'hidden'
    });
    return body;
  }

  function styleVisual(el){
    if (!el) return;
    el.style.position = 'absolute';
    el.style.left = '0'; el.style.right = '0'; el.style.top = '0'; el.style.bottom = '0';
    el.style.width = '100%';  // CSS size only (do not set canvas .width/.height attributes here)
    el.style.height = '100%';
    el.style.display = 'block';
    el.style.maxWidth = 'none';
    el.style.maxHeight = 'none';
  }

  function wire(panel){
    const body = ensureBody(panel);
    body.style.top = chromeTop(panel) + 'px';

    // Move visual into body
    const vis = pickVisual(panel);
    if (vis && vis.parentElement !== body) body.appendChild(vis);
    styleVisual(vis);
    /* recompute body top on Advanced */
    try{ panel.addEventListener('toy-zoom', ()=>{ body.style.top = chromeTop(panel) + 'px'; }); }catch{}
    try{ const header = panel.querySelector('.toy-header'); if (header){ header.style.zIndex='7'; } body.style.zIndex='0'; }catch{}
    // Recompute body top when Advanced toggles (header/controls may change height)
    try{ panel.addEventListener('toy-zoom', ()=>{ body.style.top = chromeTop(panel) + 'px'; }); }catch{}
    // Ensure header sits above body
    try{ const header = panel.querySelector('.toy-header'); if (header){ header.style.zIndex = '5'; } body.style.zIndex = '0'; }catch{}

    // DPR backing store sync (layout-neutral)
    if (vis && vis.tagName === 'CANVAS'){
      const canvas = vis;
      let lastW = -1, lastH = -1, raf = 0;
      const sync = ()=>{
        if (raf) return;
        raf = requestAnimationFrame(()=>{
          raf = 0;
          const r = body.getBoundingClientRect();
          const w = Math.max(1, Math.round(r.width));
          const h = Math.max(1, Math.round(r.height));
          const pxW = Math.max(1, Math.round(w * DPR()));
          const pxH = Math.max(1, Math.round(h * DPR()));
          if (pxW !== lastW || pxH !== lastH){
            lastW = pxW; lastH = pxH;
            canvas.width = pxW;
            canvas.height = pxH;
          }
        });
      };
      sync();
      const ro = new ResizeObserver(sync);
      ro.observe(body);
    }
  }

  function boot(){
    document.querySelectorAll('.toy-panel').forEach(wire);
  }

  // Run after load to avoid racing builders
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);

  // New panels
  const root = document.getElementById('board') || document.body;
  const addObs = new MutationObserver((muts)=>{
    for (const m of muts){
      (m.addedNodes||[]).forEach(n=>{
        if (n.nodeType===1 && n.classList?.contains('toy-panel')) wire(n);
      });
    }
  });
  addObs.observe(root, { childList:true, subtree:true });
})();