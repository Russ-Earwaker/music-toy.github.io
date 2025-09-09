// src/topbar.js — wires page header buttons to board helpers
(function(){
  function ensureTopbar(){
    let bar = document.getElementById('topbar');
    if (!bar){
      bar = document.createElement('header'); bar.id='topbar';
      bar.style.cssText='position:sticky;top:0;z-index:1000;display:flex;gap:8px;align-items:center;padding:8px 12px;background:rgba(0,0,0,0.3);backdrop-filter:blur(4px)';
      bar.innerHTML = '<button data-action="organize">Organize</button> <button data-action="reset-view">Reset View</button> <button data-action="zoom-out">-</button> <button data-action="zoom-in">+</button>';
      document.body.prepend(bar);
    }else{
      if (!bar.querySelector('[data-action="organize"]')){
        const btn = document.createElement('button'); btn.textContent='Organize'; btn.setAttribute('data-action','organize'); bar.prepend(btn);
      }
    }
    return bar;
  }
  document.addEventListener('DOMContentLoaded', ensureTopbar);
  if (window.__topbarWired) return; window.__topbarWired = true;
  const bar = document.getElementById('topbar');
  if (!bar) return;
  bar.addEventListener('click', (e)=>{
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.action==='organize'){
      // Run the full layout sequence, same as on initial boot.
      try { window.organizeBoard && window.organizeBoard(); } catch(e){}
      try { window.applyStackingOrder && window.applyStackingOrder(); } catch(e){}
      try { window.addGapAfterOrganize && window.addGapAfterOrganize(); } catch(e){}
    }
    if (b.dataset.action==='reset-view'){ window.setBoardScale && window.setBoardScale(1); window.panTo && window.panTo(0,0); }
    if (b.dataset.action==='zoom-in'){ window.setBoardScale && window.setBoardScale((window.__boardScale||1)*1.1); }
    if (b.dataset.action==='zoom-out'){ window.setBoardScale && window.setBoardScale((window.__boardScale||1)/1.1); }
  }, true);
})();

document.addEventListener('change', (e)=>{
  const sel = e.target.closest('#theme-select'); if (!sel) return;
  const val = sel.value||'';
  document.documentElement.setAttribute('data-theme', val);
  document.body.setAttribute('data-theme', val);
  window.ThemeBoot && window.ThemeBoot.setTheme && window.ThemeBoot.setTheme(val);
});
