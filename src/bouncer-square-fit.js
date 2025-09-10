// src/bouncer-square-fit.js
// Make the Bouncer play area square in Advanced view, centered within the panel body.

(function(){
  const MAKE_BODY_SQUARE = false; // keep outer panel square via CSS; square just the body/canvas here

  function getBody(panel){ return panel.querySelector('.toy-body') || panel; }
  function getCanvas(panel){
    const b = getBody(panel);
    return b.querySelector('canvas') || b.querySelector('svg');
  }
  function getWrap(body){
    let wrap = body.querySelector('.bouncer-square-wrap');
    if (!wrap){
      wrap = document.createElement('div');
      wrap.className = 'bouncer-square-wrap';
      body.appendChild(wrap);
    }
    return wrap;
  }
  function sizeFromClient(body){
    const bw = body.clientWidth|0;
    const bh = body.clientHeight|0;
    return { bw, bh };
  }
  function layout(panel){
    if (!panel || !panel.classList.contains('toy-zoomed')) return; // Advanced only
    const body = getBody(panel);
    const canvas = getCanvas(panel);
    if (!body || !canvas) return;

    const cs = getComputedStyle(body);
    if (cs.position === 'static') body.style.position = 'relative';
    body.style.minHeight = '0';

    let { bw, bh } = sizeFromClient(body);
    if (bw <= 1 || bh <= 1){ requestAnimationFrame(()=>layout(panel)); return; }

    if (MAKE_BODY_SQUARE){
      if (Math.abs(bh - bw) > 1){
        body.style.height = bw + 'px';
        const m = sizeFromClient(body); bw = m.bw; bh = m.bh;
      }
    }

    const wrap = getWrap(body);
    if (canvas.parentElement !== wrap) wrap.appendChild(canvas);

    // Use the available body height primarily; clamp to width to avoid overflow.
    const s = Math.max(1, Math.min(bh, bw));

    Object.assign(wrap.style, {
      position: 'absolute', left: '50%', top: '50%',
      width: s + 'px', height: s + 'px', transform: 'translate(-50%, -50%)',
      display: 'block', overflow: 'hidden'
    });
    Object.assign(canvas.style, {
      position: 'static', width: '100%', height: '100%',
      maxWidth: '100%', maxHeight: '100%', display: 'block', transform: 'none', left: '', top: ''
    });
  }

  function applyAll(){
    document.querySelectorAll('.toy-panel[data-toy="bouncer"]').forEach(layout);
  }

  let raf = 0;
  const schedule = ()=>{ cancelAnimationFrame(raf); raf = requestAnimationFrame(applyAll); };

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', applyAll, { once: true });
  } else {
    applyAll();
  }

  try{
    const ro = new ResizeObserver(schedule);
    document.querySelectorAll('.toy-panel[data-toy="bouncer"] .toy-body').forEach(el=> ro.observe(el));
  }catch{}
})();
