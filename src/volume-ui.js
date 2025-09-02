// src/volume-ui.js — wires volume slider + mute button (<=300 lines)
(function(){
  const RANGE = 'input[type="range"]';
  const VSEL = [
    '[data-master-volume]', '#master-volume', '.master-volume', '.volume-slider',
    RANGE + '[name="volume"]', RANGE + '#volume', RANGE + '.volume', RANGE + '[data-role*="volume"]', RANGE + '[data-volume]'
  ];
  const MSEL = [
    '[data-master-mute]', '#master-mute', '.master-mute', '.mute-btn', 'button.mute', '[aria-label="Mute"]'
  ];
  function qAll(arr){ const out=[]; for (const q of arr){ try{ document.querySelectorAll(q).forEach(el=> out.push(el)); }catch{} } return out; }catch{} } return null; }

  function setMasterVolume(v){
    try{ if (window.AudioMaster && AudioMaster.setVolume) return AudioMaster.setVolume(v); }catch{}
    try{ if (window.audio && audio.setMasterVolume) return audio.setMasterVolume(v); }catch{}
    try{ if (window.Audio && Audio.setMasterVolume) return Audio.setMasterVolume(v); }catch{}
    document.dispatchEvent(new CustomEvent('audio:master-volume', { detail:{ value:v } }));
  }
  function setMasterMute(m){
    try{ if (window.AudioMaster && AudioMaster.setMute) return AudioMaster.setMute(m); }catch{}
    try{ if (window.audio && audio.setMasterMute) return audio.setMasterMute(m); }catch{}
    try{ if (window.Audio && Audio.setMasterMute) return Audio.setMasterMute(m); }catch{}
    document.dispatchEvent(new CustomEvent('audio:master-mute', { detail:{ value:m } }));
  }

  
  function norm01(el){
    const min = isFinite(parseFloat(el.min)) ? parseFloat(el.min) : 0;
    const max = isFinite(parseFloat(el.max)) ? parseFloat(el.max) : 1;
    const raw = parseFloat(el.value);
    if (!isFinite(raw)) return 1;
    if (max === min) return Math.max(0, Math.min(1, raw));
    const v = (raw - min) / (max - min);
    return Math.max(0, Math.min(1, v));
  }

  function bindVol(el){
    if (!el || el.__volBound) return; el.__volBound = true;
    const onInput = ()=>{ setMasterVolume(norm01(el)); };
    el.addEventListener('input', onInput, { passive:true });
    el.addEventListener('change', onInput, { passive:true });
  }
  function bindMute(btn){
    if (!btn || btn.__muteBound) return; btn.__muteBound = true;
    btn.addEventListener('click', (e)=>{
      e.preventDefault(); e.stopPropagation();
      const on = !!btn.getAttribute('data-muted');
      const next = !on;
      if (next) btn.setAttribute('data-muted','1'); else btn.removeAttribute('data-muted');
      setMasterMute(next);
    }, { capture:true });
  }

  function boot(){
    const volEls = qAll(VSEL);
    if (volEls.length===0){
      // fallback: any range in a header-like area
      document.querySelectorAll('input[type="range"]').forEach(el=>{
        const hit = /vol/i.test(el.id) || /vol/i.test(el.name||'') || /vol/i.test(el.className||'') || /volume/i.test(el.getAttribute('aria-label')||'') || el.matches('[data-role*="volume"],[data-volume]');
        if (hit) volEls.push(el);
      });
    }
    const muteEls = qAll(MSEL);
    volEls.forEach(bindVol);
    muteEls.forEach(bindMute);
  }
    const mute = qAny(MSEL);
    bindVol(vol);
    bindMute(mute);
  }
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState!=='loading') boot();
  try{ const mo = new MutationObserver(()=> boot()); mo.observe(document.body, { childList:true, subtree:true }); }catch{}
})();
