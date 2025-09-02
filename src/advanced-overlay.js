// src/advanced-overlay.js — modal advanced view with instrument select (+ extra toy actions)
(function(){
  function ensureOverlayRoot(){
    let ov=document.getElementById('adv-overlay');
    if(!ov){ ov=document.createElement('div'); ov.id='adv-overlay'; ov.innerHTML='<div class="adv-backdrop"></div><div class="adv-host"></div>'; document.body.appendChild(ov); }
    return ov;
  }
  document.addEventListener('DOMContentLoaded', ensureOverlayRoot);

  if (window.__advOverlayInit) return; window.__advOverlayInit = true;

  const INSTS = ['Djimbe','Punch','Tone','AcousticGuitar','Piano','Bass'];

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
    // create overlay root
    let ov = ensureOverlayRoot();
    const host = ov.querySelector('.adv-host'); host.innerHTML='';

    // move panel into overlay (portal)
    const placeholder = document.createElement('div'); placeholder.className='adv-placeholder';
    panel.parentNode.insertBefore(placeholder, panel);
    host.appendChild(panel);
    panel.classList.add('adv-open');
    try{
      const s=_computeAdvSize(panel);
      panel.style.setProperty('--adv-w', Math.round(s.targetW)+'px');
      panel.style.setProperty('--adv-h', Math.round(s.targetH)+'px');
    }catch{}

    // controls row
    const ctr = document.createElement('div'); ctr.className='adv-controls';
    const sel = document.createElement('select'); sel.className='adv-inst';
    INSTS.forEach(n=>{ const o=document.createElement('option'); o.value=n; o.textContent=n; sel.appendChild(o); });
    const current = panel.dataset.instrument || '';
    if (current){ for (const o of sel.options){ if (o.value.toLowerCase()===current.toLowerCase()) { o.selected=true; break; } } }
    sel.addEventListener('change', ()=>{
      panel.dataset.instrument = sel.value;
      panel.dispatchEvent(new CustomEvent('toy:instrument', { detail: { name: sel.value, value: sel.value }}));
    });
    ctr.appendChild(sel);

    if ((panel.dataset.toy||'').toLowerCase()==='loopgrid'){
      const rn = document.createElement('button'); rn.className='toy-btn'; rn.textContent='Random Notes';
      rn.addEventListener('click', ()=> panel.dispatchEvent(new CustomEvent('loopgrid:random-notes')));
      ctr.appendChild(rn);
    }

    const close = document.createElement('button'); close.className='toy-btn'; close.textContent='Close';
    close.addEventListener('click', ()=> closeAdvanced(panel, placeholder, ov));
    ctr.appendChild(close);

    host.prepend(ctr);
    ov.classList.add('open');
  }

  function closeAdvanced(panel, placeholder, ov){
    panel.classList.remove('adv-open');
    placeholder.parentNode.insertBefore(panel, placeholder);
    placeholder.remove();
    ov.classList.remove('open');
  }

  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-adv]'); if (!btn) return;
    const panel = btn.closest('.toy-panel'); if (!panel) return;
    e.preventDefault(); openAdvanced(panel);
  });
})();