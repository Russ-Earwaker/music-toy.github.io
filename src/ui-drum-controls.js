// src/ui-drum-controls.js — Random / Clear buttons for drum toy (single IIFE, <300 lines)
(function(){
  const SEL = '.toy-panel[data-toy="loopgrid"]';

  function ensureButtons(panel){
    if (!panel || panel.__drumBtns) return;
    let header = panel.querySelector('.toy-header');
    if (!header){
      header = document.createElement('div'); header.className='toy-header';
      const left = document.createElement('div'); left.className='toy-title'; left.textContent = panel.id || 'Drum';
      const right = document.createElement('div'); right.className='toy-controls-right';
      header.append(left, right); panel.prepend(header);
    }
    let right = header.querySelector('.toy-controls-right');
    if (!right){ right = document.createElement('div'); right.className='toy-controls-right'; header.appendChild(right); }

    // Clear
    let clear = right.querySelector('[data-drum-clear]');
    if (!clear){
      clear = document.createElement('button');
      clear.type='button'; clear.className='toy-btn toy-btn-clear'; clear.textContent='Clear';
      clear.setAttribute('data-drum-clear','1');
      right.appendChild(clear);
    }
    // Random
    let rand = right.querySelector('[data-drum-random]');
    if (!rand){
      rand = document.createElement('button');
      rand.type='button'; rand.className='toy-btn toy-btn-random'; rand.textContent='Random';
      rand.setAttribute('data-drum-random','1');
      right.appendChild(rand);
    }
    panel.__drumBtns = true;
  }

  function bootExisting(){
    document.querySelectorAll(SEL).forEach(ensureButtons);
  }

  // Global delegate so clicks work in standard or advanced
  if (!window.__drumControlDelegates){
    window.__drumControlDelegates = true;
    document.addEventListener('pointerdown', (e)=>{
      const btn = e.target.closest && e.target.closest('[data-drum-clear],[data-drum-random]');
      if (!btn) return;
      const panel = btn.closest && btn.closest(SEL);
      if (!panel) return;
      e.preventDefault(); e.stopPropagation();
      if (btn.hasAttribute('data-drum-clear')){
        panel.dispatchEvent(new CustomEvent('drumtiles:clear', { bubbles:true }));
      }else{
        panel.dispatchEvent(new CustomEvent('drumtiles:randomize', { bubbles:true }));
      }
    }, true);

    document.addEventListener('click', (e)=>{
      const btn = e.target.closest && e.target.closest('[data-drum-clear],[data-drum-random]');
      if (!btn) return;
      const panel = btn.closest && btn.closest(SEL);
      if (!panel) return;
      e.preventDefault(); e.stopPropagation();
      if (btn.hasAttribute('data-drum-clear')){
        panel.dispatchEvent(new CustomEvent('drumtiles:clear', { bubbles:true }));
      }else{
        panel.dispatchEvent(new CustomEvent('drumtiles:randomize', { bubbles:true }));
      }
    }, true);
  }

  // Observe added panels/headers
  try{
    const obs = new MutationObserver((ml)=>{
      for (const m of ml){
        if (m.type === 'childList'){
          m.addedNodes && m.addedNodes.forEach(n=>{
            if (n.nodeType!==1) return;
            if (n.matches && n.matches(SEL)) ensureButtons(n);
            n.querySelectorAll && n.querySelectorAll(SEL).forEach(ensureButtons);
          });
        }
      }
    });
    obs.observe(document.body, { childList:true, subtree:true });
  }catch{}

  document.addEventListener('DOMContentLoaded', bootExisting);
  if (document.readyState!=='loading') bootExisting();
})();
