// mute-wire.js — standalone mute wiring (use if overlay wiring isn't present)
(function(){
  function wirePanel(panel){
    try{
      const wrap = panel.querySelector('.toy-volwrap'); if(!wrap) return;
      const btn  = wrap.querySelector('button[title="Mute"]'); if(!btn || btn.__wiredMute) return;
      const rng  = wrap.querySelector('input[type="range"]'); if(!rng) return;
      btn.__wiredMute = true;
      let last = Math.max(0, Math.min(100, parseInt(rng.value,10)||100));
      const idBase = panel.dataset?.toyid || panel.id || '';
      function dispatchVol(pct){
        const v = Math.max(0, Math.min(1, (parseInt(pct,10)||0)/100));
        try{ window.dispatchEvent(new CustomEvent('toy-volume', { detail:{ toyId: idBase, value: v } })); }catch{}
      }
      rng.addEventListener('input', ()=>{ const p=parseInt(rng.value,10)||0; if(p>0) last=p; }, { passive:true });
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const muted = btn.getAttribute('aria-pressed') === 'true';
        if (!muted){
          btn.setAttribute('aria-pressed','true');
          rng.dataset._preMute = String(last);
          rng.value = '0';
          rng.dispatchEvent(new Event('input', { bubbles:true }));
          dispatchVol(0);
        } else {
          btn.setAttribute('aria-pressed','false');
          const restore = parseInt(rng.dataset._preMute||last,10)||last||100;
          rng.value = String(restore);
          rng.dispatchEvent(new Event('input', { bubbles:true }));
          dispatchVol(restore);
        }
      });
    }catch{}
  }
  function scan(){ document.querySelectorAll('.toy-panel').forEach(wirePanel); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  document.addEventListener('toy-zoom', scan, { passive:true });
  window.addEventListener('resize', ()=> setTimeout(scan,0), { passive:true });
  console.log('[mute-wire] loaded');
})(); 
