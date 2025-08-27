// src/toy-visual-final.js
// Final, minimal, non-invasive fix:
// - Creates a dedicated .toy-vbody per panel that fills below header+controls
// - Moves the toy's canvas/SVG into .toy-vbody
// - Sets CSS on the visual so it fills the box (no canvas width/height resets -> no blanking on clicks)
// - No flex/layout rewrites, no observers that mutate styles in loops.
// Works with or without toy-panel-heights.js.
(function(){
  function shown(el){
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }
  function headerControlsTop(panel){
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
  function ensureVBody(panel){
    let vbody = panel.querySelector('.toy-vbody');
    if (!vbody){
      vbody = document.createElement('div');
      vbody.className = 'toy-vbody';
      panel.appendChild(vbody);
    }
    // Make panel a positioning context if needed
    if (getComputedStyle(panel).position === 'static') panel.style.position = 'relative';
    // Fill remaining space
    vbody.style.position = 'absolute';
    vbody.style.left = '0'; vbody.style.right = '0'; vbody.style.bottom = '0';
    vbody.style.padding = '0'; vbody.style.margin = '0'; vbody.style.border = '0';
    vbody.style.overflow = 'hidden';
    return vbody;
  }
  function styleVisual(kind, el){
    // Do NOT change canvas width/height attributes here (prevents blanking on clicks)
    if (!el) return;
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.display = 'block';
    if (kind === 'grid' || kind.startsWith('loopgrid')){
      // Fill both axes
      el.style.width = '100%';
      el.style.height = '100%';
    } else {
      // Square-ish toys: fill width, keep square using aspect ratio (CSS-only)
      el.style.width = '100%';
      el.style.height = 'auto';
      el.style.aspectRatio = '1 / 1';
    }
  }
  function apply(panel){
    const kind = (panel.getAttribute('data-toy')||'').toLowerCase();
    const vbody = ensureVBody(panel);
    vbody.style.top = headerControlsTop(panel) + 'px';
    const vis = pickVisual(panel);
    if (vis && vis.parentElement !== vbody) vbody.appendChild(vis);
    styleVisual(kind, vis);
  }
  function boot(){
    document.querySelectorAll('.toy-panel').forEach(apply);
  }
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
  // Panels added later
  const root = document.getElementById('board') || document.body;
  const addObs = new MutationObserver((muts)=>{
    for (const m of muts){
      (m.addedNodes||[]).forEach(n=>{
        if (n.nodeType===1 && n.classList?.contains('toy-panel')) apply(n);
      });
    }
  });
  addObs.observe(root, { childList:true, subtree:true });
})();