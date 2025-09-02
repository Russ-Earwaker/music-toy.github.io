// src/ui-drum-controls.js — Random / Clear buttons (single-fire; standard + advanced)
(function(){
  const SEL = '.toy-panel[data-toy="loopgrid"]';

  function bindOnce(btn, type, fn){
    if (!btn) return;
    const key = '__bound_' + type;
    if (btn[key]) return;
    btn[key] = true;
    btn.addEventListener(type, fn, { capture:true });
  }

  function ensureButtons(panel){
    if (!panel) return;
    let header = panel.querySelector('.toy-header');
    if (!header){
      header = document.createElement('div'); header.className='toy-header';
      const left = document.createElement('div'); left.className='toy-title';
      left.textContent = panel.id || 'Drum';
      const right = document.createElement('div'); right.className='toy-controls-right';
      header.append(left, right); panel.prepend(header);
    }
    let right = header.querySelector('.toy-controls-right');
    if (!right){ right = document.createElement('div'); right.className='toy-controls-right'; header.appendChild(right); }

    let clear = right.querySelector('[data-drum-clear]');
    if (!clear){
      clear = document.createElement('button');
      clear.type='button'; clear.className='toy-btn toy-btn-clear'; clear.textContent='Clear';
      clear.setAttribute('data-drum-clear','1');
      right.appendChild(clear);
    }
    let rand = right.querySelector('[data-drum-random]');
    if (!rand){
      rand = document.createElement('button');
      rand.type='button'; rand.className='toy-btn toy-btn-random'; rand.textContent='Random';
      rand.setAttribute('data-drum-random','1');
      right.appendChild(rand);
    }

    const onAct = (e)=>{
      const btn = e.currentTarget;
      const p = btn.closest(SEL); if (!p) return;
      // single-fire lock
      if (btn.__fireLock) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation(); return; }
      btn.__fireLock = true; setTimeout(()=>{ btn.__fireLock = false; }, 250);
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation();
      p.dispatchEvent(new CustomEvent(btn.hasAttribute('data-drum-clear') ? 'drumtiles:clear' : 'drumtiles:randomize', { bubbles:true }));
    };
    bindOnce(clear, 'pointerdown', onAct);
    bindOnce(rand , 'pointerdown', onAct);
    bindOnce(clear, 'click', onAct);
    bindOnce(rand , 'click', onAct);
  }

  function boot(){ document.querySelectorAll(SEL).forEach(ensureButtons); }
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState!=='loading') boot();

  try{
    const obs = new MutationObserver((ml)=>{
      for (const m of ml){
        m.addedNodes && m.addedNodes.forEach(n=>{
          if (n.nodeType!==1) return;
          if (n.matches && n.matches(SEL)) ensureButtons(n);
          n.querySelectorAll && n.querySelectorAll(SEL).forEach(ensureButtons);
        });
      }
    });
    obs.observe(document.body, { childList:true, subtree:true });
  }catch{}

  if (!window.__drumGlobalPU){
    window.__drumGlobalPU = true;
    const delegate = (e)=>{
      if (window.__overlayOpen) return;
      const btn = e.target.closest && e.target.closest('[data-drum-clear],[data-drum-random]');
      if (!btn) return;
      const p = btn.closest && btn.closest(SEL); if (!p) return;
      if (btn.__fireLock) { e.preventDefault(); e.stopPropagation(); return; }
      btn.__fireLock = true; setTimeout(()=>{ btn.__fireLock = false; }, 250);
      e.preventDefault(); e.stopPropagation();
      p.dispatchEvent(new CustomEvent(btn.hasAttribute('data-drum-clear') ? 'drumtiles:clear' : 'drumtiles:randomize', { bubbles:true }));
    };
    document.addEventListener('pointerdown', delegate, true);
    document.addEventListener('click', delegate, true);
  }
})();
