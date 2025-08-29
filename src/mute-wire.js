// mute-wire.js (drop-in, <150 lines)
// Adds working MUTE toggle to the UI built by toyui.js without changing toyui.js.
// - Stores last non-zero volume per panel
// - Dispatches the same 'toy-volume' event toyui uses so audio stays in sync

(function(){
  function wirePanel(panel){
    try{
      const wrap = panel.querySelector('.toy-volwrap'); if(!wrap) return;
      const btn  = wrap.querySelector('button[title="Mute"]'); if(!btn) return;
      const rng  = wrap.querySelector('input[type="range"]'); if(!rng) return;
      if (btn.__wiredMute) return; btn.__wiredMute = true;

      const idBase = panel.dataset?.toyid || panel.id || '';
      let last = 100; // percent
      function dispatchVol(pct){
        const v = Math.max(0, Math.min(1, (parseInt(pct,10)||0)/100));
        try{ window.dispatchEvent(new CustomEvent('toy-volume', { detail:{ toyId: idBase, value: v } })); }catch{}
      }
      // keep last up-to-date as user drags slider
      rng.addEventListener('input', ()=>{
        const p = parseInt(rng.value,10)||0;
        if (p>0) last = p;
      }, { passive:true });

      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const muted = btn.getAttribute('aria-pressed') === 'true';
        if (!muted){
          // go muted
          btn.setAttribute('aria-pressed','true');
          btn.setAttribute('data-muted','1');
          last = parseInt(rng.value,10)||last||100;
          rng.value = '0';
          rng.dispatchEvent(new Event('input', { bubbles:true }));
          dispatchVol(0);
        }else{
          // unmute to last
          btn.setAttribute('aria-pressed','false');
          btn.removeAttribute('data-muted');
          const restore = String(Math.max(0, Math.min(100, last||100)));
          rng.value = restore;
          rng.dispatchEvent(new Event('input', { bubbles:true }));
          dispatchVol(restore);
        }
      });
    }catch{}
  }

  function scan(){
    document.querySelectorAll('.toy-panel').forEach(wirePanel);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
  // Follow zoom enters/exits and resizes
  window.addEventListener('toy-zoom-changed', scan, { passive:true });
  window.addEventListener('resize', ()=>{ setTimeout(scan,0); }, { passive:true });
  document.addEventListener('toy-zoom', scan, { passive:true });
})();
