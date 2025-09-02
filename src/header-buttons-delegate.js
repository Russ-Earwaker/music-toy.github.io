// src/header-buttons-delegate.js
(function(){
  if (window.__mtHeaderDelegate) return; window.__mtHeaderDelegate = true;
  const DEBUG = localStorage.getItem('mt_debug')==='1';
  const log = (...a)=> DEBUG && console.info('[header-delegate]', ...a);

  function nearestPanel(el){ return el && el.closest && el.closest('.toy-panel'); }

  function handle(e){
    const btn = e.target && e.target.closest && e.target.closest('button'); if (!btn) return;
    const txt = (btn.textContent||'').trim().toLowerCase();
    const isAdv = /advanced/.test(txt) || btn.hasAttribute('data-adv');
    const isRnd = /random/.test(txt)   || btn.hasAttribute('data-random');
    const isClr = /clear/.test(txt)    || btn.hasAttribute('data-clear');
    if (!isAdv && !isRnd && !isClr) return;
    const panel = nearestPanel(btn); if (!panel) return;

    if (isAdv){
      e.preventDefault();
      try{
        const inOverlay = !!panel.closest('#zoom-overlay');
        if (!inOverlay && window.zoomInPanel) window.zoomInPanel(panel);
        else if (inOverlay && window.zoomOutPanel) window.zoomOutPanel();
        else panel.classList.toggle('toy-zoomed');
      }catch(err){ panel.classList.toggle('toy-zoomed'); }
      log('Advanced clicked', panel.id||panel.dataset.toy); return;
    }
    if (isRnd){
      e.preventDefault();
      panel.dispatchEvent(new CustomEvent('toy-random', { bubbles:true }));
      log('Random dispatched', panel.id||panel.dataset.toy); return;
    }
    if (isClr){
      e.preventDefault();
      ['toy-clear','toy-reset'].forEach(t=> panel.dispatchEvent(new CustomEvent(t, { bubbles:true })));
      log('Clear dispatched', panel.id||panel.dataset.toy); return;
    }
  }

  document.addEventListener('click', handle, true);
  log('booted');
})();