// src/topbar.js — wires page header buttons to board helpers

(function(){

  // Transport (dynamic import; avoid top-level await inside IIFE)

  let Core = null;

  import('./audio-core.js').then(m=>{ Core = m; tryInitToggle(); }).catch(()=>{});

  function tryInitToggle(){

    try{

      const btn = document.querySelector('#topbar [data-action="toggle-play"]');

      if (btn){ updatePlayButtonVisual(btn, !!Core?.isRunning?.()); }

    }catch{}

  }



  function updatePlayButtonVisual(btn, playing){

    // Support both circular c-btn and plain text fallback

    const core = btn.querySelector('.c-btn-core');

    const url = playing ? "url('../assets/UI/T_ButtonPause.png')" : "url('../assets/UI/T_ButtonPlay.png')";

    if (core){ core.style.setProperty('--c-btn-icon-url', url); }

    btn.title = playing ? 'Pause' : 'Play';

    if (!core){ btn.textContent = playing ? 'Pause' : 'Play'; }

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
      bar = document.createElement('header');
      bar.id = 'topbar';
      bar.style.cssText = 'position:sticky;top:0;z-index:1000;display:flex;gap:8px;align-items:center;padding:8px 12px;background:rgba(0,0,0,0.3);backdrop-filter:blur(4px)';
      bar.innerHTML = '<button data-action="organize">Organize</button> <label style="margin-left:8px;color:#cbd5e1;">Presets <select id="preset-select"></select></label> <button data-action="apply-preset">Apply</button> <button data-action="save-scene">Save</button> <button data-action="load-scene">Load</button> <button data-action="export-scene">Export</button> <button data-action="import-scene">Import</button> <button data-action="clear-all">Clear All</button> <button data-action="reset-scene">Reset to Default</button>';
      document.body.prepend(bar);
    } else {
      try{ bar.querySelectorAll('button[title="Stop"], button[title="Play"], [data-action="reset-view"], [data-action="zoom-out"], [data-action="zoom-in"]').forEach(el=> el.remove()); }catch{}
      if (!bar.querySelector('[data-action="organize"]')){
        const organizeBtn = document.createElement('button');
        organizeBtn.textContent = 'Organize';
        organizeBtn.setAttribute('data-action','organize');
        bar.prepend(organizeBtn);
      }
      const want = [
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
          const btn = document.createElement('button');
          btn.textContent = label;
          btn.setAttribute('data-action', act);
          bar.appendChild(btn);
        }
      }
      if (!bar.querySelector('#preset-select')){
        const label = document.createElement('label');
        label.style.marginLeft = '8px';
        label.style.color = '#cbd5e1';
        label.textContent = 'Presets ';
        const sel = document.createElement('select');
        sel.id = 'preset-select';
        label.appendChild(sel);
        const applyBtn = bar.querySelector('[data-action="apply-preset"]');
        if (applyBtn && applyBtn.parentNode){
          applyBtn.parentNode.insertBefore(label, applyBtn);
        } else {
          bar.appendChild(label);
        }
      }
    }
    let playBtn = bar.querySelector('[data-action="toggle-play"]');
    if (!playBtn){
      playBtn = document.createElement('button');
      playBtn.className = 'c-btn';
      playBtn.dataset.action = 'toggle-play';
      playBtn.style.setProperty('--c-btn-size','65px');
      playBtn.title = 'Play';
      playBtn.innerHTML = '<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>';
      const org = bar.querySelector('[data-action="organize"]');
      if (org && org.parentNode){
        org.parentNode.insertBefore(playBtn, org.nextSibling);
      } else {
        bar.prepend(playBtn);
      }
    }
    updatePlayButtonVisual(playBtn, !!Core?.isRunning?.());
    try{ populatePresets(); }catch{}
    return bar;
  }


  if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { ensureTopbar(); wireTopbar(); });
} else {
  wireTopbar();
}


    function wireTopbar(){
    if (window.__topbarWired) return;
    window.__topbarWired = true;
    const bar = ensureTopbar();
    if (!bar) return;
    bar.addEventListener('click', (e)=>{
      const b = e.target.closest('button');
      if (!b) return;

      if (b.dataset.action==='organize'){
        // Run the full layout sequence, same as on initial boot.
        try { window.organizeBoard && window.organizeBoard(); } catch(e){}
        try { window.applyStackingOrder && window.applyStackingOrder(); } catch(e){}
        try { window.addGapAfterOrganize && window.addGapAfterOrganize(); } catch(e){}
        return;
      }

      if (b.dataset.action==='toggle-play'){
        // Play/Pause toggle
        const doToggle = ()=>{
          try{
            Core?.ensureAudioContext?.();
            if (Core?.isRunning?.()){
              Core?.stop?.();
              updatePlayButtonVisual(b, false);
            } else {
              Core?.start?.();
              updatePlayButtonVisual(b, true);
            }
          }catch{}
        };
        if (!Core){ import('./audio-core.js').then(m=>{ Core=m; doToggle(); }).catch(()=>{}); }
        else { doToggle(); }
        return;
      }

      if (b.dataset.action==='clear-all'){
        try{
          document.querySelectorAll('.toy-panel').forEach(panel=>{
            ['toy-clear','toy-reset'].forEach(t=> panel.dispatchEvent(new CustomEvent(t, { bubbles:true })));
          });
          try{ window.Persistence && window.Persistence.markDirty && window.Persistence.markDirty(); }catch{}
        }catch{}
        return;
      }

      if (b.dataset.action==='reset-scene'){
        try{
          try{ localStorage.removeItem('scene:autosave'); }catch{}
          try{ localStorage.removeItem('prefs:lastScene'); }catch{}
          try{ localStorage.removeItem('toyPositions'); }catch{}
          const url = new URL(window.location.href);
          url.searchParams.set('reset','1');
          window.location.href = url.toString();
        }catch{}
        return;
      }

      if (b.dataset.action==='save-scene'){
        try{
          const name = prompt('Save scene as:', (localStorage.getItem('prefs:lastScene')||'default')) || 'default';
          const P = window.Persistence; if (P && typeof P.saveScene==='function'){ P.saveScene(name); alert('Saved.'); }
        }catch{}
        return;
      }

      if (b.dataset.action==='load-scene'){
        try{
          const P = window.Persistence; if (!P) return;
          const scenes = (typeof P.listScenes==='function') ? P.listScenes() : [];
          const name = prompt('Load scene name:', (scenes && scenes[0]) || (localStorage.getItem('prefs:lastScene')||'default')) || 'default';
          if (P.loadScene(name)){ alert('Loaded.'); try{ window.organizeBoard && window.organizeBoard(); }catch{} }
          else alert('No such scene.');
        }catch{}
        return;
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
        return;
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
        return;
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
  }



  // Space bar toggles Play/Pause (ignore when typing in inputs/textareas)

  try{

    document.addEventListener('keydown', (e)=>{

      if (window.tutorialSpacebarDisabled) return;

      if (e.code !== 'Space' && e.key !== ' ') return;

      const tgt = e.target;

      if (tgt && ((tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable))) return;

      e.preventDefault();

      const btn = document.querySelector('#topbar [data-action="toggle-play"]');

      if (btn) btn.click();

    }, true);

  }catch{}

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

