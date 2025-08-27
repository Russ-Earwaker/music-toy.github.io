// src/disable-scale-lock.js
// Safety shim: ensure no inverse scale-lock remains if previously injected.
(function(){
  function nuke(){
    try{
      const style = document.getElementById('scale-lock-style');
      if (style) style.remove();
    }catch{}
    try{
      document.querySelectorAll('[data-lock-scale]').forEach(el=>{
        el.removeAttribute('data-lock-scale');
      });
    }catch{}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', nuke);
  else nuke();
})();