// src/loopgrid-square-drum.js
// Adds a centered circular DRUM pad inside LoopGrid panels (Standard only), anchored to the loopgrid canvas.
// Guarded so it won't initialize twice per panel.

(function(){
  const SEL = '.toy-panel[data-toy="loopgrid"]';

  function isAdvanced(panel){
    return panel.classList.contains('toy-zoomed') || !!panel.closest('#zoom-overlay');
  }

  function ensureBody(panel){
    const body = panel.querySelector('.toy-body') || panel;
    const cs = getComputedStyle(body);
    if (cs.position === 'static') body.style.position = 'relative';
    return body;
  }

  function sizePad(panel, pad){
    const body = ensureBody(panel);
    const canvas = body.querySelector('canvas');
    const bcr = body.getBoundingClientRect();
    const cr = canvas ? canvas.getBoundingClientRect() : bcr;
    const W = Math.max(0, cr.width || bcr.width || 0);
    const px = Math.max(84, Math.min(Math.round(W * 0.16), 136));
    pad.style.setProperty('width', px + 'px', 'important');
    pad.style.setProperty('height', px + 'px', 'important');
    // center x, 80% y inside the canvas square
    const cx = (cr.left - bcr.left) + (cr.width/2);
    const cy = (cr.top - bcr.top) + (cr.height*0.80);
    pad.style.left = Math.round(cx) + 'px';
    pad.style.top  = Math.round(cy) + 'px';
    pad.style.transform = 'translate(-50%, -50%)';
    pad.style.display = isAdvanced(panel) ? 'none' : 'flex';
  }

  function addPad(panel){
    if (panel.__drumPadInit) { // already initialized; still ensure single pad & size
      const body = ensureBody(panel);
      const pads = body.querySelectorAll('.loopgrid-drum-pad');
      if (pads.length > 1){ for(let i=1;i<pads.length;i++) pads[i].remove(); }
      if (pads[0]) sizePad(panel, pads[0]);
      return;
    }
    panel.__drumPadInit = true;

    const body = ensureBody(panel);
    // Remove any stale pads first
    body.querySelectorAll('.loopgrid-drum-pad').forEach(n => n.remove());

    const pad = document.createElement('div');
    pad.className = 'loopgrid-drum-pad';
    Object.assign(pad.style, {
      position:'absolute',
      display:'flex',
      alignItems:'center',
      justifyContent:'center',
      border:'2px solid rgba(255,255,255,0.25)',
      borderRadius:'50%',
      background:'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.18), rgba(255,255,255,0.08))',
      boxShadow:'0 6px 18px rgba(0,0,0,0.45), inset 0 2px 8px rgba(255,255,255,0.15)',
      cursor:'pointer',
      userSelect:'none',
      outline:'none',
      zIndex:'5'
    });
    const label = document.createElement('div');
    label.textContent = 'DRUM';
    Object.assign(label.style, { fontSize:'1.05rem', fontWeight:'700', letterSpacing:'0.18em', opacity:0.85 });
    pad.appendChild(label);
    body.appendChild(pad);

    pad.addEventListener('pointerdown', ()=>{
      const toyId = panel.dataset.toyId || panel.id || 'loopgrid';
      panel.dispatchEvent(new CustomEvent('loopgrid:drum-tap', { bubbles:true, detail:{ toyId } }));
      pad.animate(
        [{ transform:'translate(-50%, -50%) scale(1)' }, { transform:'translate(-50%, -50%) scale(0.94)' }, { transform:'translate(-50%, -50%) scale(1)' }],
        { duration: 150, easing:'ease-out' }
      );
    });

    sizePad(panel, pad);

    // Observers (store so they don't multiply)
    if (!panel.__drumPadRO){
      try{
        panel.__drumPadRO = new ResizeObserver(()=> sizePad(panel, pad));
        panel.__drumPadRO.observe(body);
      }catch{}
    }
    if (!panel.__drumPadMO){
      panel.__drumPadMO = new MutationObserver(()=> sizePad(panel, pad));
      panel.__drumPadMO.observe(panel, { attributes:true, attributeFilter:['class'] });
    }
  }

  function boot(){
    document.querySelectorAll(SEL).forEach(addPad);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  // one light retry if DOM late-loads
  setTimeout(boot, 150);
})();