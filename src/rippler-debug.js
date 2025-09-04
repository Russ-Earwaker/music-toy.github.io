// src/rippler-debug.js
(function(){
  const TAG = '[rippler-debug]';
  function log(...args){ try{ console.log(TAG, ...args); }catch{} }

  function findRipplerPanel(){
    const panels = Array.from(document.querySelectorAll('.toy-panel'));
    for (const p of panels){
      const toy = (p.dataset.toy||'').toLowerCase();
      if (toy === 'rippler') return p;
      // fallback: look for a canvas with class rippler-canvas inside
      if (p.querySelector('canvas.rippler-canvas')) return p;
    }
    return null;
  }

  function once(){
    const panel = findRipplerPanel();
    if (!panel){ log('no panel yet'); return; }
    const bodies = panel.querySelectorAll('.toy-body');
    log('panel found, toy=', panel.dataset.toy, 'toy-bodies=', bodies.length);

    // mark canvases
    const cvs = panel.querySelectorAll('canvas,svg');
    cvs.forEach((cv,i)=>{
      cv.style.outline = '1px solid rgba(255,0,0,0.6)';
      cv.dataset.rd = 'cv'+i;
    });

    // ensure wrapper exists
    let wrap = panel.querySelector('.rippler-square-wrap');
    let body = panel.querySelector('.toy-body');
    if (body && !wrap){
      wrap = document.createElement('div');
      wrap.className = 'rippler-square-wrap';
      wrap.style.outline = '1px dashed rgba(255,180,0,0.9)';
      body.appendChild(wrap);
      log('created wrapper');
    }

    // move any rippler canvas into wrapper for debug visual (non-destructive position only)
    const rcv = panel.querySelector('canvas.rippler-canvas') || panel.querySelector('.toy-body canvas');
    if (wrap && rcv && rcv.parentElement !== wrap){
      wrap.appendChild(rcv);
      log('moved canvas into wrapper for debug');
    }

    measure(panel);
  }

  function measure(panel){
    const body = panel.querySelector('.toy-body');
    const wrap = panel.querySelector('.rippler-square-wrap');
    const cv   = panel.querySelector('canvas.rippler-canvas') || (body && (body.querySelector('canvas')||body.querySelector('svg')));
    const pr = panel.getBoundingClientRect();
    const br = body ? body.getBoundingClientRect() : null;
    const wr = wrap ? wrap.getBoundingClientRect() : null;
    const cr = cv ? cv.getBoundingClientRect() : null;
    log('rects', { panel: pick(pr), body: pick(br), wrap: pick(wr), canvas: pick(cr) });
  }

  function pick(r){
    if (!r) return null;
    return {x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height)};
  }

  function tick(){
    const p = findRipplerPanel();
    if (p) measure(p);
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ()=>{ once(); tick(); }, { once: true });
  } else {
    once(); tick();
  }
})();