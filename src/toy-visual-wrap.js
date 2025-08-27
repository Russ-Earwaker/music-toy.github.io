// src/toy-visual-wrap.js
// v2 (instrumented): Create an absolutely-positioned .toy-body per panel (below header+controls),
// move the canvas/SVG into it, make it fill, and keep the canvas backing store crisp (DPR-aware).
// Logs per panel; exposes window.__wrapProbe()
(function(){
  const DPR = ()=> window.devicePixelRatio || 1;

  function isShown(el){
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.display!=='none' && s.visibility!=='hidden';
  }
  function headerControlsHeight(panel){
    let h = 0;
    const header = panel.querySelector('.toy-header');
    if (header && isShown(header) && getComputedStyle(header).position!=='absolute'){
      h += header.offsetHeight;
    }
    panel.querySelectorAll('.toy-controls').forEach(ctrl=>{
      const cs = getComputedStyle(ctrl);
      if (isShown(ctrl) && cs.position!=='absolute'){
        h += ctrl.offsetHeight;
      }
    });
    return h;
  }
  function pickVisual(panel){
    return panel.querySelector('.wheel-canvas, .grid-canvas, .rippler-canvas, .bouncer-canvas, canvas, svg');
  }
  function ensureBody(panel){
    let body = panel.querySelector('.toy-body');
    if (!body){
      body = document.createElement('div');
      body.className = 'toy-body';
      panel.appendChild(body);
    }
    const ps = getComputedStyle(panel);
    if (ps.position === 'static') panel.style.position = 'relative';
    Object.assign(body.style, {
      position: 'absolute',
      left: '0', right: '0', bottom: '0',
      padding: '0', margin: '0', border: '0', overflow: 'hidden'
    });
    return body;
  }
  function layout(panel){
    const kind = (panel.getAttribute('data-toy')||'').toLowerCase();
    const body = ensureBody(panel);
    const top = headerControlsHeight(panel);
    body.style.top = top + 'px';
    const vis = pickVisual(panel);
    if (vis && vis.parentElement !== body) body.appendChild(vis);
    if (vis){
      vis.style.setProperty('position','absolute');
      vis.style.setProperty('inset','0');
      vis.style.setProperty('width','100%','important');
      vis.style.setProperty('height','100%','important');
      vis.style.display = 'block';
    }
    // DPR backing store
    if (vis && vis.tagName === 'CANVAS'){
      const canvas = vis;
      let raf = 0;
      const resize = ()=>{
        if (raf) return;
        raf = requestAnimationFrame(()=>{
          raf = 0;
          const r = body.getBoundingClientRect();
          const w = Math.max(1, Math.round(r.width));
          const h = Math.max(1, Math.round(r.height));
          const pxW = Math.max(1, Math.round(w * DPR()));
          const pxH = Math.max(1, Math.round(h * DPR()));
          if (canvas.width !== pxW) canvas.width = pxW;
          if (canvas.height !== pxH) canvas.height = pxH;
        });
      };
      const ro = new ResizeObserver(resize);
      ro.observe(body);
      resize();
    }
    // log
    const pr = panel.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    const vr = vis ? vis.getBoundingClientRect() : null;
    console.log('[wrap]', { id: panel.id, toy: kind, headerControlsTop: top, panel: {w:pr.width,h:pr.height}, body: {w:br.width,h:br.height}, visual: vr ? {w:vr.width,h:vr.height} : null });
  }
  function wire(panel){
    layout(panel);
    const mo = new MutationObserver(()=> layout(panel));
    mo.observe(panel, { childList:true, subtree:true });
    let t=0;
    window.addEventListener('resize', ()=>{ cancelAnimationFrame(t); t=requestAnimationFrame(()=> layout(panel)); });
  }
  function boot(){
    document.querySelectorAll('.toy-panel').forEach(wire);
  }
  window.__wrapProbe = boot;
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();