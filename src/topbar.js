// src/topbar.js — wires page header buttons to board helpers
(function(){
  // Transport (dynamic import; avoid top-level await inside IIFE)
  let Core = null;
  import('./audio-core.js').then(m=>{ Core = m; tryInitToggle(); }).catch(()=>{});
  function tryInitToggle(){
    try{
      const btn = document.querySelector('#topbar [data-action="toggle-play"]');
      if (btn){ btn.textContent = (Core?.isRunning?.() ? 'Pause' : 'Play'); }
    }catch{}
  }
  // Import presets in module scope (dynamic import to keep file order loose)
  let Presets = null;
  try { import('./presets.js').then(m=>{ Presets = m; try{ populatePresets(); }catch{} }); } catch {}
  function populatePresets(){
    const bar = document.getElementById('topbar'); if (!bar) return;
    try{
      const sel = bar.querySelector('#preset-select'); if (!sel || !Presets?.listPresets) return;
      const items = Presets.listPresets();
      sel.innerHTML = '';
      const none = document.createElement('option'); none.value=''; none.textContent='(choose)'; sel.appendChild(none);
      items.forEach(it=>{ const o=document.createElement('option'); o.value=it.key; o.textContent=it.name; sel.appendChild(o); });
    }catch{}
  }
  function ensureTopbar(){
    let bar = document.getElementById('topbar');
    if (!bar){
      bar = document.createElement('header'); bar.id='topbar';
      bar.style.cssText='position:sticky;top:0;z-index:1000;display:flex;gap:8px;align-items:center;padding:8px 12px;background:rgba(0,0,0,0.3);backdrop-filter:blur(4px)';
      bar.innerHTML = '<button data-action="organize">Organize</button> <button data-action="toggle-play">Play</button> <label style="margin-left:8px;color:#cbd5e1;">Presets <select id="preset-select"></select></label> <button data-action="apply-preset">Apply</button> <button data-action="save-scene">Save</button> <button data-action="load-scene">Load</button> <button data-action="export-scene">Export</button> <button data-action="import-scene">Import</button> <button data-action="clear-all">Clear All</button> <button data-action="reset-scene">Reset to Default</button>';
      document.body.prepend(bar);
    }else{
      // Remove obsolete controls (Stop, Reset View, Zoom +/- and the demo circular Play/Stop)
      try{
        bar.querySelectorAll('button[title="Stop"], button[title="Play"], [data-action="reset-view"], [data-action="zoom-out"], [data-action="zoom-in"]').forEach(el=> el.remove());
      }catch{}
      if (!bar.querySelector('[data-action="organize"]')){
        const btn = document.createElement('button'); btn.textContent='Organize'; btn.setAttribute('data-action','organize'); bar.prepend(btn);
      }
      // Ensure Save/Load/Export/Import exist if bar is already present
      const want = [
        ['toggle-play','Play'],
        ['save-scene','Save'],
        ['load-scene','Load'],
        ['export-scene','Export'],
        ['import-scene','Import'],
        ['clear-all','Clear All'],
        ['reset-scene','Reset to Default'],
        ['apply-preset','Apply']
      ];
      for (const [act, label] of want){
        if (!bar.querySelector(`[data-action="${act}"]`)){
          const btn = document.createElement('button'); btn.textContent = label; btn.setAttribute('data-action', act); bar.appendChild(btn);
        }
      }
      // Ensure Presets select exists
      if (!bar.querySelector('#preset-select')){
        const label = document.createElement('label');
        label.style.marginLeft = '8px'; label.style.color = '#cbd5e1';
        label.textContent = 'Presets ';
        const sel = document.createElement('select'); sel.id = 'preset-select';
        label.appendChild(sel);
        // Insert before Apply button if present, else append at end
        const applyBtn = bar.querySelector('[data-action="apply-preset"]');
        if (applyBtn && applyBtn.parentNode){ applyBtn.parentNode.insertBefore(label, applyBtn); }
        else { bar.appendChild(label); }
      }
    }
    // Populate Presets dropdown if available
    try{
      const sel = bar.querySelector('#preset-select') || (function(){ const s=document.createElement('select'); s.id='preset-select'; const applyBtn = bar.querySelector('[data-action="apply-preset"]'); if (applyBtn && applyBtn.parentNode) applyBtn.parentNode.insertBefore(s, applyBtn); else bar.appendChild(s); return s; })();
      populatePresets();
    }catch{}
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
    // Play/Pause toggle
    if (b.dataset.action==='toggle-play'){
      const doToggle = ()=>{
        try{
          Core?.ensureAudioContext?.();
          if (Core?.isRunning?.()){
            Core?.stop?.();
            b.textContent = 'Play';
          } else {
            Core?.start?.();
            b.textContent = 'Pause';
          }
        }catch{}
      };
      if (!Core){ import('./audio-core.js').then(m=>{ Core=m; doToggle(); }).catch(()=>{}); }
      else { doToggle(); }
    }
    if (b.dataset.action==='clear-all'){
      try{
        document.querySelectorAll('.toy-panel').forEach(panel=>{
          ['toy-clear','toy-reset'].forEach(t=> panel.dispatchEvent(new CustomEvent(t, { bubbles:true })));
        });
        // mark dirty for autosave
        try{ window.Persistence && window.Persistence.markDirty && window.Persistence.markDirty(); }catch{}
      }catch{}
    }
    if (b.dataset.action==='reset-scene'){
      try{
        // Clear persistence-related keys
        try{ localStorage.removeItem('scene:autosave'); }catch{}
        try{ localStorage.removeItem('prefs:lastScene'); }catch{}
        // Optional: remove all named scenes? keep them; just reset boot behavior
        try{ localStorage.removeItem('toyPositions'); }catch{}
        // Reload with ?reset to skip restore and get default layout
        const url = new URL(window.location.href);
        url.searchParams.set('reset','1');
        window.location.href = url.toString();
      }catch{}
    }
    if (b.dataset.action==='save-scene'){
      try{
        const name = prompt('Save scene as:', (localStorage.getItem('prefs:lastScene')||'default')) || 'default';
        const P = window.Persistence; if (P && typeof P.saveScene==='function'){ P.saveScene(name); alert('Saved.'); }
      }catch{}
    }
    if (b.dataset.action==='load-scene'){
      try{
        const P = window.Persistence; if (!P) return;
        const scenes = (typeof P.listScenes==='function') ? P.listScenes() : [];
        const name = prompt('Load scene name:', (scenes && scenes[0]) || (localStorage.getItem('prefs:lastScene')||'default')) || 'default';
        if (P.loadScene(name)){ alert('Loaded.'); try{ window.organizeBoard && window.organizeBoard(); }catch{} }
        else alert('No such scene.');
      }catch{}
    }
    if (b.dataset.action==='export-scene'){
      try{
        const P = window.Persistence; if (!P) return;
        const name = localStorage.getItem('prefs:lastScene') || 'default';
        const json = P.exportScene(name);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${name||'scene'}.json`; a.click();
        setTimeout(()=>URL.revokeObjectURL(url), 1500);
      }catch{}
    }
    if (b.dataset.action==='import-scene'){
      try{
        const input = document.createElement('input'); input.type='file'; input.accept='.json,application/json';
        input.onchange = async ()=>{
          const f = input.files && input.files[0]; if (!f) return;
          const txt = await f.text();
          const P = window.Persistence; if (P && P.importScene(txt)){ alert('Imported.'); try{ window.organizeBoard && window.organizeBoard(); }catch{} }
        };
        input.click();
      }catch{}
    }
    if (b.dataset.action==='apply-preset'){
      try{
        const sel = document.getElementById('preset-select');
        const key = sel?.value || '';
        if (!key) return;
        if (Presets?.applyPreset){
          const ok = Presets.applyPreset(key);
          if (!ok) alert('Preset failed.');
        }
      }catch{}
    }
  }, true);
  // Initialize toggle button label based on current state
  tryInitToggle();
})();

document.addEventListener('change', (e)=>{
  const sel = e.target.closest('#theme-select'); if (!sel) return;
  const val = sel.value||'';
  document.documentElement.setAttribute('data-theme', val);
  document.body.setAttribute('data-theme', val);
  window.ThemeBoot && window.ThemeBoot.setTheme && window.ThemeBoot.setTheme(val);
});
