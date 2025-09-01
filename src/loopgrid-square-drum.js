// src/loopgrid-square-drum.js
// Adds a centered circular DRUM pad inside LoopGrid panels (Standard only).

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
    const W = Math.max(0, body.getBoundingClientRect().width || body.clientWidth || 0);
    const px = Math.max(84, Math.min(Math.round(W * 0.16), 136));
    pad.style.setProperty('width', px + 'px', 'important');
    pad.style.setProperty('height', px + 'px', 'important');
    pad.style.left = '50%';
    pad.style.transform = 'translateX(-50%)';
    pad.style.bottom = '28px';
    pad.style.display = isAdvanced(panel) ? 'none' : 'flex';
  }

  function addPad(panel){
    const body = ensureBody(panel);
    let pad = body.querySelector('.loopgrid-drum-pad');
    if (!pad){
      pad = document.createElement('div');
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
          [{ transform:'translateX(-50%) scale(1)' }, { transform:'translateX(-50%) scale(0.94)' }, { transform:'translateX(-50%) scale(1)' }],
          { duration: 150, easing:'ease-out' }
        );
      });
    }
    sizePad(panel, pad);

    // Keep correct on mode/resize
    const mo = new MutationObserver(()=> sizePad(panel, pad));
    mo.observe(panel, { attributes:true, attributeFilter:['class'] });
    try{ new ResizeObserver(()=> sizePad(panel, pad)).observe(body); }catch{}
  }

  function boot(){
    document.querySelectorAll(SEL).forEach(addPad);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 60);
  setTimeout(boot, 180);
})();