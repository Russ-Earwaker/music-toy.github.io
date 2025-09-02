// src/adv-safety-reset.js — defensive cleanup to avoid oversized panels in standard mode
(function(){
  if (window.__advSafetyApplied) return; window.__advSafetyApplied = true;
  const run = ()=>{
    try{
      // Remove any lingering advanced class from panels
      document.querySelectorAll('.toy-panel.adv-open').forEach(p=> p.classList.remove('adv-open'));
      // Ensure overlay is not marked open
      const ov = document.getElementById('adv-overlay');
      if (ov) ov.classList.remove('open');
      // Also remove any inline size remnants from zoom overlay on body elements
      document.querySelectorAll('.toy-panel').forEach(p=>{
        const body = p.querySelector('.toy-body');
        if (body){
          body.style.removeProperty('width');
          body.style.removeProperty('height');
        }
      });
    }catch(e){
      console.warn('[adv-safety-reset] failed', e);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();