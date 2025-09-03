// src/advanced-overlay.js — modal advanced view with instrument select (+ extra toy actions)
(function(){
  function ensureOverlayRoot(){
    let ov=document.getElementById('adv-overlay');
    if(!ov){ ov=document.createElement('div'); ov.id='adv-overlay'; ov.innerHTML='<div class="adv-backdrop"></div><div class="adv-host"></div>'; document.body.appendChild(ov); }
    return ov;
  }
  document.addEventListener('DOMContentLoaded', ensureOverlayRoot);

  if (window.__advOverlayInit) return; window.__advOverlayInit = true;

  const INSTS = ['djembe_bass','djembe_tone','djembe_slap','hand_clap','xylophone','kalimba','acoustic_guitar','tone'];

  function _computeAdvSize(panel){
    const body = panel.querySelector('.toy-body') || panel;
    const rect = body.getBoundingClientRect();
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth||0);
    const vh = Math.max(document.documentElement.clientHeight, window.innerHeight||0);
    const targetW = Math.max(240, Math.min(vw*0.96, rect.width*2));
    const targetH = Math.max(180, Math.min(vh*0.90, rect.height*2));
    return { targetW, targetH };
  }

  function openAdvanced(panel){
    let ov = ensureOverlayRoot();
    const host = ov.querySelector('.adv-host'); host.innerHTML='';

    const ctr = document.createElement('div'); ctr.className='adv-controls';
    const sel = document.createElement('select'); sel.className='adv-inst';
    INSTS.forEach(n=>{ const o=document.createElement('option'); o.value=n; o.textContent=n.replace(/_/g,' '); sel.appendChild(o); });
    const current = panel.dataset.instrument || '';
    if (current){ for (const o of sel.options){ if (o.value.toLowerCase()===current.toLowerCase()) { o.selected=true; break; } } }
    sel.addEventListener('change', ()=>{
      const raw = String(sel.value||'').trim();
      const canonical = raw.replace(/\s+/g,'_').replace(/([a-z0-9])([A-Z])/g,'$1_$2').toLowerCase();
      panel.dataset.instrument = canonical;
      panel.dispatchEvent(new CustomEvent('toy-instrument', { detail:{ value: canonical }, bubbles:true }));
      panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name: canonical, value: canonical }, bubbles:true }));
    });
    ctr.appendChild(sel);

    host.appendChild(ctr);
    ov.style.display='block';
  }

  window.AdvancedOverlay = { openAdvanced };
})();