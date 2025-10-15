// src/grid-advanced-ui.js
// Ensures Random/Clear buttons exist for LoopGrid and only show in Advanced (zoomed) mode.
(function(){
  function ensureButtons(panel){
    let header = panel.querySelector('.toy-header');
    // The generic `toyui.js` is responsible for creating the header. This
    // script should not create a duplicate. If no header exists, we simply
    // exit and let the main UI builder do its job.
    if (!header) return;
    // Also, if toyui.js has already added the buttons, we should exit.
    if (header.querySelector('[data-action="random"]')) return;

    const group = document.createElement('div');
    group.className = 'adv-only';
    Object.assign(group.style, {display:'inline-flex', gap:'8px'});

    const mkBtn = (label, role)=>{
      const b = document.createElement('button');
      b.type='button'; b.textContent = label;
      b.dataset.role = role;
      b.className = 'toy-btn';
      return b;
    };
    const btnRand = mkBtn('Random','grid-random');
    const btnClear= mkBtn('Clear','grid-clear');
    btnRand.addEventListener('click', ()=> panel.dispatchEvent(new CustomEvent('toy-random',{bubbles:true})));
    btnClear.addEventListener('click', ()=> panel.dispatchEvent(new CustomEvent('toy-clear',{bubbles:true})));

    group.append(btnRand, btnClear);
    header.appendChild(group);
  }

  function boot(){
    document.querySelectorAll('.toy-panel[data-toy="loopgrid"], .toy-panel[data-toy="loopgrid-drum"]').forEach(ensureButtons);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
