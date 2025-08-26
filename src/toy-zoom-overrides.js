// src/toy-zoom-overrides.js
// Minimal per-toy override so canvas fills its toy window and stays crisp under board zoom.
// Non-destructive: sets only width/height/display on canvas, and DPR backing store.
(function(){
  const DPR = () => window.devicePixelRatio || 1;
  const seen = new WeakSet();

  function fixPanel(panel){
    const body = panel.querySelector('.toy-body') || panel;
    const cvs = body && body.querySelector('canvas');
    if (!cvs || seen.has(cvs)) return;
    seen.add(cvs);

    // Make the canvas fill the toy body visually.
    try{
      cvs.style.setProperty('width','100%','important');
      cvs.style.setProperty('height','100%','important');
      cvs.style.display = 'block';
    }catch{}

    // Keep backing store in sync with visual size.
    const ro = new ResizeObserver(()=>{
      const w = Math.max(1, Math.round(body.clientWidth));
      const h = Math.max(1, Math.round(body.clientHeight));
      const pxW = Math.max(1, Math.round(w * DPR()));
      const pxH = Math.max(1, Math.round(h * DPR()));
      if (cvs.width !== pxW) cvs.width = pxW;
      if (cvs.height !== pxH) cvs.height = pxH;
    });
    ro.observe(body);
  }

  function scan(){
    document.querySelectorAll('.toy-panel').forEach(fixPanel);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  // Watch for newly added/converted panels
  const root = document.getElementById('board') || document.body;
  const mo = new MutationObserver((muts)=>{
    for (const m of muts){
      (m.addedNodes||[]).forEach(n=>{
        if (n.nodeType===1){
          if (n.classList?.contains('toy-panel')) fixPanel(n);
          n.querySelectorAll?.('.toy-panel').forEach(fixPanel);
        }
      });
    }
  });
  mo.observe(root, { childList:true, subtree:true });
})();