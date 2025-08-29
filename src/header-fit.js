// src/header-fit.js
// Sync header/footer WIDTH to match the interactive canvas (toy body) AND
// adjust the panel's HEIGHT so the frame fits the body vertically.
// Non-destructive, drop-in. Include once after your other scripts.
//
// What it does per .toy-panel:
// 1) Measures .toy-body clientWidth and sets that px width on .toy-header and .toy-volume/.toy-footer.
// 2) Measures .toy-header/.toy-body/.toy-volume heights + panel paddings, and sets panel.style.height
//    so the frame exactly contains them (fixes vertical misfit).
// 3) Re-runs on ResizeObserver(body), window resize, zoom enter/exit, and after fonts settle.

(function(){
  const PANELS = new Set();
  const RO = new ResizeObserver(entries => {
    for (const entry of entries){
      const body = entry.target;
      const panel = body.closest('.toy-panel');
      if (panel) syncPanel(panel);
    }
  });

  function px(n){ return (Math.round(n)||0) + 'px'; }
  function num(v){ return isNaN(v) ? 0 : Number(v); }
  function paddings(el){
    const cs = getComputedStyle(el);
    return {
      top:    num(parseFloat(cs.paddingTop)),
      bottom: num(parseFloat(cs.paddingBottom)),
    };
  }

  function syncPanel(panel){
    try{
      const body   = panel.querySelector('.toy-body');
      const header = panel.querySelector('.toy-header');
      const volume = panel.querySelector('.toy-volume, .toy-footer');
      if (!body) return;

      // 1) WIDTH sync (header/footer to body width)
      const bw = Math.round(body.getBoundingClientRect().width);
      if (bw && isFinite(bw)){
        if (header){
          header.style.width = px(bw);
          header.style.maxWidth = px(bw);
          header.style.marginLeft = 'auto';
          header.style.marginRight = 'auto';
          header.style.boxSizing = 'border-box';
          header.style.flex = '0 0 auto';
        }
        if (volume){
          volume.style.width = px(bw);
          volume.style.maxWidth = px(bw);
          volume.style.marginLeft = 'auto';
          volume.style.marginRight = 'auto';
          volume.style.boxSizing = 'border-box';
          volume.style.flex = '0 0 auto';
        }
      }

      // 2) HEIGHT sync (panel frame to fit children + panel vertical paddings)
      const hH = header ? header.getBoundingClientRect().height : 0;
      const hB = body.getBoundingClientRect().height;
      const hV = volume ? volume.getBoundingClientRect().height : 0;
      const pad = paddings(panel);
      const total = Math.round(hH + hB + hV + pad.top + pad.bottom);

      if (isFinite(total) && total > 0){
        panel.style.height = px(total);
        panel.style.maxHeight = px(total);
        panel.style.minHeight = px(total);
        // Ensure children don't stretch unpredictably
        if (header) header.style.flex = '0 0 auto';
        body.style.flex = '0 0 auto';
        if (volume) volume.style.flex = '0 0 auto';
      }

      // Start observing the body for size changes if not already
      if (!PANELS.has(panel)){
        PANELS.add(panel);
        RO.observe(body);
      }
    }catch(e){
      console.warn('[header-fit] syncPanel failed', e);
    }
  }

  function syncAll(){
    document.querySelectorAll('.toy-panel').forEach(syncPanel);
  }

  function boot(){
    syncAll();
    window.addEventListener('resize', syncAll, { passive: true });
    window.addEventListener('toy-zoom-changed', syncAll, { passive: true });
    if (document.fonts && document.fonts.ready){
      document.fonts.ready.then(syncAll).catch(()=>{});
    }
    // Nudges for late layout / asset loads
    setTimeout(syncAll, 50);
    setTimeout(syncAll, 250);
    setTimeout(syncAll, 750);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
