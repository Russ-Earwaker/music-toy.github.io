// src/rippler-square-fit.js
// Robust centering for Rippler that ignores CSS transforms (board zoom).
// Uses clientWidth/Height (layout pixels) so sizes don't collapse with transforms.
// Also makes the *body* itself square (optional toggle below) so the visible frame is square.

(function(){
  const MAKE_FRAME_SQUARE = false; // CSS aspect-ratio now handles this.

  function getBody(panel){ return panel.querySelector('.toy-body') || panel; }
  function getCanvas(panel){
    const b = getBody(panel);
    return b.querySelector('canvas') || b.querySelector('svg');
  }
  function getWrap(body){
    let wrap = body.querySelector('.rippler-square-wrap');
    if (!wrap){
      wrap = document.createElement('div');
      wrap.className = 'rippler-square-wrap';
      body.appendChild(wrap);
    }
    return wrap;
  }

  function sizeFromClient(body){
    // clientWidth/Height are not affected by CSS transforms (zoom), unlike getBoundingClientRect.
    const bw = body.clientWidth|0;
    const bh = body.clientHeight|0;
    return { bw, bh };
  }

  function layout(panel){
    const body = getBody(panel);
    const canvas = getCanvas(panel);
    if (!body || !canvas) return;

    // Ensure body is a positioning context
    const cs = getComputedStyle(body);
    if (cs.position === 'static') body.style.position = 'relative';
    body.style.minHeight = '0';

    // If height is currently zero (e.g., not laid out yet), try again next frame
    let { bw, bh } = sizeFromClient(body);
    if (bw <= 1 || bh <= 1){ requestAnimationFrame(()=>layout(panel)); return; }

    // Optionally make the *body* itself square so the visible frame is square
    if (MAKE_FRAME_SQUARE){
      // Only change body height if it differs meaningfully from width
      if (Math.abs(bh - bw) > 1){
        body.style.height = bw + 'px';
        // After forcing height, refresh measurements
        const m = sizeFromClient(body);
        bw = m.bw; bh = m.bh;
      }
    }

    const wrap = getWrap(body);
    if (canvas.parentElement !== wrap) wrap.appendChild(canvas);

    // Compute square size from current (transform-immune) client box
    const s = Math.max(1, Math.min(bw, bh));
    let prompt = wrap.querySelector('.rippler-tap-label');
    if (!prompt) {
      prompt = document.createElement('div');
      prompt.className = 'toy-action-label rippler-tap-label';
      prompt.textContent = 'TAP';
      wrap.appendChild(prompt);
    }

    const promptSize = Math.max(24, Math.floor(s * 0.22));
    prompt.style.fontSize = promptSize + 'px';
    prompt.style.opacity = wrap.dataset.ripplerPromptDismissed === '1' ? '0' : '0.6';


    // Center wrapper
    Object.assign(wrap.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: s + 'px',
      height: s + 'px',
      transform: 'translate(-50%, -50%)',
      display: 'block',
      overflow: 'hidden'
    });

    // Canvas fills wrapper
    Object.assign(canvas.style, {
      position: 'static',
      width: '100%',
      height: '100%',
      maxWidth: '100%',
      maxHeight: '100%',
      display: 'block',
      transform: 'none',
      left: '', top: ''
    });

    if (!canvas.__ripplerPromptHooked) {
      canvas.__ripplerPromptHooked = true;
      canvas.addEventListener('pointerdown', () => {
        const parent = canvas.parentElement;
        if (!parent) return;
        parent.dataset.ripplerPromptDismissed = '1';
        const lbl = parent.querySelector('.rippler-tap-label');
        if (lbl) lbl.style.opacity = '0';
      });
    }
  }

  function applyAll(){
    document.querySelectorAll('.toy-panel[data-toy="rippler"]').forEach(layout);
  }

  let raf = 0;
  const schedule = ()=>{ cancelAnimationFrame(raf); raf = requestAnimationFrame(applyAll); };

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', applyAll, { once: true });
  } else {
    applyAll();
  }

  // Observe size changes of each rippler body directly (transform-immune)
  try{
    const ro = new ResizeObserver(schedule);
    document.querySelectorAll('.toy-panel[data-toy="rippler"] .toy-body').forEach(el=> ro.observe(el));
  }catch{}
})();












