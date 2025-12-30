// src/header-buttons-delegate.js
(function(){
  if (window.__mtHeaderDelegate) return; window.__mtHeaderDelegate = true;
  const DEBUG = localStorage.getItem('mt_debug')==='1';
  const log = (...a)=> DEBUG && console.info('[header-delegate]', ...a);

  function nearestPanel(el){ return el && el.closest && el.closest('.toy-panel'); }

  function handle(e){
    const btn = e.target?.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.skipHeaderDelegate === '1') return;

    const action = btn.dataset.action;
    const panel = nearestPanel(btn); if (!panel) return;

    if (action === 'advanced' || action === 'close-advanced') {
      e.preventDefault();
      try{
        // The overlay ID is 'adv-overlay' in the CSS. The selector was mismatched.
        const inOverlay = !!panel.closest('#adv-overlay');
        if (!inOverlay && window.zoomInPanel) window.zoomInPanel(panel);
        else if (inOverlay && window.zoomOutPanel) window.zoomOutPanel();
        else panel.classList.toggle('toy-zoomed');
      }catch(err){ panel.classList.toggle('toy-zoomed'); }
      // log('Advanced/Close clicked', panel.id||panel.dataset.toy);
    } else if (action === 'random') {
      e.preventDefault();
      panel.dispatchEvent(new CustomEvent('toy-random', { bubbles:true }));
      // log('Random dispatched', panel.id||panel.dataset.toy);
    } else if (action === 'clear') {
      e.preventDefault();
      ['toy-clear','toy-reset'].forEach(t=> panel.dispatchEvent(new CustomEvent(t, { bubbles:true })));
      // log('Clear dispatched', panel.id||panel.dataset.toy); return;
    } else if (action === 'random-notes') {
      e.preventDefault();
      panel.dispatchEvent(new CustomEvent('toy-random-notes', { bubbles:true }));
      // log('Random Notes dispatched', panel.id||panel.dataset.toy);
    } else if (action === 'random-blocks') {
      e.preventDefault();
      panel.dispatchEvent(new CustomEvent('toy-random-blocks', { bubbles:true }));
      // log('Random Blocks dispatched', panel.id||panel.dataset.toy);
    } else if (action === 'random-cubes') {
      e.preventDefault();
      panel.dispatchEvent(new CustomEvent('toy-random-cubes', { bubbles:true }));
      // log('Random Cubes dispatched', panel.id||panel.dataset.toy);
    }
  }

  document.addEventListener('click', handle, true);
  // log('booted');
})();
