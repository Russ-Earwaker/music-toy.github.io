// src/header-buttons-delegate.js
(function(){
  if (window.__mtHeaderDelegate) return; window.__mtHeaderDelegate = true;
  const DEBUG = localStorage.getItem('mt_debug')==='1';
  const DBG_HDR = localStorage.getItem('mt_dbg_header') === '1';
  const DBG_HDR_INTERNAL_ONLY = localStorage.getItem('mt_dbg_header_internal_only') === '1';
  const log = (...a)=> DEBUG && console.info('[header-delegate]', ...a);

  function isInternalBoardActive(){
    try{
      const b = document.body;
      if (!b) return false;
      // We don’t want to depend on one exact class name, so we check a few likely signals.
      if (b.classList.contains('internal-board-active')) return true;
      if (b.classList.contains('internal-board-mode')) return true;
      if (b.dataset && (b.dataset.internalBoardActive === '1' || b.dataset.internalBoard === '1')) return true;

      // Common overlay/frame ids/classes we’ve used during implementation.
      const overlay =
        document.getElementById('internal-board-overlay') ||
        document.querySelector('.internal-board-overlay') ||
        document.querySelector('[data-internal-board-overlay]');
      if (!overlay) return false;
      const cs = getComputedStyle(overlay);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      // If it exists and is visible, treat as active.
      return true;
    }catch{
      return false;
    }
  }

  function dbgEnabled(){
    if (!DBG_HDR) return false;
    if (!DBG_HDR_INTERNAL_ONLY) return true;
    return isInternalBoardActive();
  }

  const lastPointerDownAt = new WeakMap(); // btn -> { t, x, y }

  function dbgPrint(tag, obj){
    if (!dbgEnabled()) return;
    try{
      console.info(`[header-delegate][DBG] ${tag}`, obj);
    }catch{}
  }

  function nearestPanel(el){ return el && el.closest && el.closest('.toy-panel'); }

  // Capture pointerdown so we can detect cases where click never fires (e.g. preventDefault on pointerdown).
  document.addEventListener('pointerdown', (e) => {
    if (!dbgEnabled()) return;
    const btn = e.target?.closest?.('button[data-action], .toy-inst-btn');
    if (!btn) return;
    const panel = nearestPanel(btn);
    // Only log header-ish controls (avoid noisy inner toy buttons).
    const action = btn.dataset?.action || (btn.classList?.contains('toy-inst-btn') ? 'instrument' : '');
    if (!action) return;
    if (!panel) return;

    lastPointerDownAt.set(btn, { t: performance.now(), x: e.clientX, y: e.clientY });
    dbgPrint('pointerdown', {
      internal: isInternalBoardActive(),
      action,
      panelId: panel.id || null,
      toyId: panel.dataset?.toyid || panel.dataset?.toy || null,
      target: e.target?.tagName,
      targetClass: e.target?.className,
      defaultPrevented: !!e.defaultPrevented,
      cancelBubble: !!e.cancelBubble,
      pointerType: e.pointerType,
    });
  }, true);

  function handle(e){
    const btn = e.target?.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.skipHeaderDelegate === '1') return;

    const action = btn.dataset.action;
    const panel = nearestPanel(btn); if (!panel) return;

    if (dbgEnabled()) {
      const down = lastPointerDownAt.get(btn) || null;
      dbgPrint('click', {
        internal: isInternalBoardActive(),
        action,
        panelId: panel.id || null,
        toyId: panel.dataset?.toyid || panel.dataset?.toy || null,
        defaultPrevented_before: !!e.defaultPrevented,
        cancelBubble_before: !!e.cancelBubble,
        dtSincePointerDownMs: down ? (performance.now() - down.t) : null,
        downPos: down ? { x: down.x, y: down.y } : null,
        clickPos: { x: e.clientX, y: e.clientY },
      });
    }

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
      dbgPrint('dispatch', { type: 'toy-random', bubbles: true, panelId: panel.id || null });
      // log('Random dispatched', panel.id||panel.dataset.toy);
    } else if (action === 'clear') {
      e.preventDefault();
      ['toy-clear','toy-reset'].forEach(t=> panel.dispatchEvent(new CustomEvent(t, { bubbles:true })));
      dbgPrint('dispatch', { type: 'toy-clear/toy-reset', bubbles: true, panelId: panel.id || null });
      // log('Clear dispatched', panel.id||panel.dataset.toy); return;
    } else if (action === 'random-notes') {
      e.preventDefault();
      panel.dispatchEvent(new CustomEvent('toy-random-notes', { bubbles:true }));
      dbgPrint('dispatch', { type: 'toy-random-notes', bubbles: true, panelId: panel.id || null });
      // log('Random Notes dispatched', panel.id||panel.dataset.toy);
    } else if (action === 'random-blocks') {
      e.preventDefault();
      panel.dispatchEvent(new CustomEvent('toy-random-blocks', { bubbles:true }));
      dbgPrint('dispatch', { type: 'toy-random-blocks', bubbles: true, panelId: panel.id || null });
      // log('Random Blocks dispatched', panel.id||panel.dataset.toy);
    } else if (action === 'random-cubes') {
      e.preventDefault();
      panel.dispatchEvent(new CustomEvent('toy-random-cubes', { bubbles:true }));
      dbgPrint('dispatch', { type: 'toy-random-cubes', bubbles: true, panelId: panel.id || null });
      // log('Random Cubes dispatched', panel.id||panel.dataset.toy);
    }
  }

  document.addEventListener('click', handle, true);
  // log('booted');
})();
