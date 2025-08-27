// src/grid-advanced-ui.js
// Ensures Random/Clear buttons exist for LoopGrid and only show in Advanced (zoomed) mode.
(function(){
  function ensureButtons(panel){
    let header = panel.querySelector('.toy-header');
    if (!header){
      header = document.createElement('div');
      header.className = 'toy-header';
      Object.assign(header.style, {display:'flex',alignItems:'center',gap:'10px',padding:'8px 10px',position:'relative',zIndex:'20'});
      panel.prepend(header);
    }
    // Avoid duplicates
    if (header.querySelector('[data-role="grid-random"]')) return;

    const group = document.createElement('div');
    group.className = 'adv-only';
    Object.assign(group.style, {display:'inline-flex', gap:'8px'});

    const mkBtn = (label, role)=>{
      const b = document.createElement('button');
      b.type='button'; b.textContent = label;
      b.dataset.role = role;
      b.className = 'toy-btn';
      Object.assign(b.style, {padding:'6px 10px', border:'1px solid #252b36', borderRadius:'10px', background:'#0d1117', color:'#e6e8ef', cursor:'pointer'});
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
    document.querySelectorAll('.toy-panel[data-toy="loopgrid"]').forEach(ensureButtons);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();