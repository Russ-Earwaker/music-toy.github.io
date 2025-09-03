// mute-wire.js — standalone mute wiring (use if overlay wiring isn't present)
(function(){
  function wirePanel(panel){
    try{
      const wrap = panel.querySelector('.toy-volwrap'); if(!wrap) return;
      const btn  = wrap.querySelector('button[title="Mute"]'); if(!btn || btn.__wiredMute) return;
      const rng  = wrap.querySelector('input[type="range"]'); if(!rng) return;
      btn.__wiredMute = true;
      let last = Math.max(0, Math.min(100, parseInt(rng.value,10)||100));
      const toyId = panel.dataset?.toyid || panel.id || '';

      function dispatchVolume(pct) {
        const v = Math.max(0, Math.min(1, (parseInt(pct, 10) || 0) / 100));
        try { window.dispatchEvent(new CustomEvent('toy-volume', { detail: { toyId, value: v } })); } catch {}
      }

      // Sync slider value with mute state
      rng.addEventListener('input', () => {
        const p = parseInt(rng.value, 10) || 0;
        if (p > 0) last = p;
        dispatchVolume(p);
      }, { passive: true });

      // On click, toggle mute state and dispatch the correct event
      btn.addEventListener('click', (e)=>{
        const isMuted = btn.getAttribute('aria-pressed') === 'true';
        const nextMuted = !isMuted;

        btn.setAttribute('aria-pressed', String(nextMuted));
        if (nextMuted) {
          rng.dataset._preMute = String(last); // Save current volume
          rng.value = '0';
        } else {
          rng.value = String(rng.dataset._preMute || last || 100);
        }
        // Notify the audio system
        // Dispatch both mute and volume events to keep audio-core and UI in sync.
        // The mute event handles the immediate gain change, while the volume event
        // updates the stored volume level for when it's unmuted.
        try { window.dispatchEvent(new CustomEvent('toy-mute', { detail: { toyId, muted: nextMuted } })); } catch {}
        dispatchVolume(rng.value);
      });
    }catch{}
  }
  function scan(){ document.querySelectorAll('.toy-panel').forEach(wirePanel); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  document.addEventListener('toy-zoom', scan, { passive:true });
  window.addEventListener('resize', ()=> setTimeout(scan,0), { passive:true });
  console.log('[mute-wire] loaded');
})(); 
