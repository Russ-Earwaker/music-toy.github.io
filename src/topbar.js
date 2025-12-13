// src/topbar.js - wires page header buttons to board helpers
import * as Core from './audio-core.js';
import { resumeAudioContextIfNeeded } from './audio-core.js';

(function(){

  function tryInitToggle(){

    try{

      const btn = document.querySelector('#topbar [data-action="toggle-play"]');

      if (btn){ updatePlayButtonVisual(btn, !!Core?.isRunning?.()); }

    }catch{}

  }



  function updatePlayButtonVisual(btn, playing){

    // Support both circular c-btn and plain text fallback

    const core = btn.querySelector('.c-btn-core');

    const url = playing ? "url('/assets/UI/T_ButtonPause.png')" : "url('/assets/UI/T_ButtonPlay.png')";

    if (core){ core.style.setProperty('--c-btn-icon-url', url); }

    btn.title = playing ? 'Pause' : 'Play';

    if (!core){ btn.textContent = playing ? 'Pause' : 'Play'; }

  }

  function updateFocusToggleButton(btn){
    if (!btn) return;
    const enabled = (typeof window !== 'undefined' && typeof window.isFocusEditingEnabled === 'function')
      ? window.isFocusEditingEnabled()
      : true;
    btn.textContent = enabled ? 'On' : 'Off';
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    btn.classList.toggle('is-on', enabled);
    btn.classList.toggle('is-off', !enabled);
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

  
  function ensurePreferencesOverlay(){
    let overlay = document.getElementById('preferences-overlay');
    if (!overlay){
      overlay = document.createElement('div');
      overlay.id = 'preferences-overlay';
      overlay.className = 'scene-manager-overlay';
      overlay.style.display = 'none';
      overlay.innerHTML = `
        <div class="scene-manager-panel preferences-panel">
          <div class="scene-manager-header">
            <div class="scene-manager-title">
              <span class="scene-manager-title-main">Preferences</span>
              <span class="scene-manager-mode-label"></span>
            </div>
            <button class="scene-manager-close" type="button" aria-label="Close">&times;</button>
          </div>
          <div class="scene-manager-body">
            <div class="preferences-list">
              <div class="pref-row pref-row-focus">
                <div class="pref-label">
                  <div class="pref-title">Focus editing</div>
                  <div class="pref-subtitle">Dim other toys until one is focused</div>
                </div>
                <button class="menu-inline-btn focus-toggle-btn" type="button" data-pref-action="toggle-focus-editing">Off</button>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const closeBtn = overlay.querySelector('.scene-manager-close');
    const toggleBtn = overlay.querySelector('[data-pref-action="toggle-focus-editing"]');

    const hide = () => { overlay.style.display = 'none'; };
    const show = () => {
      updateFocusToggleButton(toggleBtn);
      overlay.style.display = 'flex';
    };

    if (!overlay.__wired){
      overlay.addEventListener('click', (evt) => {
        if (evt.target === overlay) hide();
      });
      closeBtn?.addEventListener('click', hide);
      toggleBtn?.addEventListener('click', () => {
        const current = (typeof window !== 'undefined' && typeof window.isFocusEditingEnabled === 'function')
          ? window.isFocusEditingEnabled()
          : true;
        try { window.setFocusEditingEnabled?.(!current); } catch {}
        updateFocusToggleButton(toggleBtn);
      });
      overlay.__wired = true;
    }

    overlay.__show = show;
    overlay.__updateFocusToggle = () => updateFocusToggleButton(toggleBtn);
    return overlay;
  }

function ensureTopbar(){
    let bar = document.getElementById('topbar');
    if (!bar){
      bar = document.createElement('header');
      bar.id = 'topbar';
      bar.className = 'app-topbar';
      bar.innerHTML = `
        <div class="topbar-menu-wrap"></div>
        <div class="topbar-controls"></div>
      `;
      document.body.prepend(bar);
    }

    if (!bar.classList.contains('app-topbar')){
      bar.classList.add('app-topbar');
    }

    let menuWrap = bar.querySelector('.topbar-menu-wrap');
    if (!menuWrap){
      menuWrap = document.createElement('div');
      menuWrap.className = 'topbar-menu-wrap';
      bar.insertBefore(menuWrap, bar.firstElementChild || null);
    }

    let menuBtn = bar.querySelector('#topbar-menu-btn');
    if (!menuBtn){
      menuBtn = document.createElement('button');
      menuBtn.type = 'button';
      menuBtn.id = 'topbar-menu-btn';
      menuBtn.className = 'c-btn menu-btn';
      menuBtn.dataset.action = 'menu-toggle';
      menuBtn.dataset.helpLabel = 'Main menu';
      menuBtn.dataset.helpPosition = 'bottom';
      menuBtn.title = 'Menu';
      menuBtn.innerHTML = '<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>';
      menuWrap.prepend(menuBtn);
    } else {
      menuBtn.type = 'button';
      menuBtn.dataset.action = 'menu-toggle';
      if (!menuBtn.dataset.helpLabel) menuBtn.dataset.helpLabel = 'Main menu';
      if (!menuBtn.dataset.helpPosition) menuBtn.dataset.helpPosition = 'bottom';
      menuBtn.classList.add('c-btn','menu-btn');
      if (!menuBtn.title) menuBtn.title = 'Menu';
    }
    const menuBtnCore = menuBtn.querySelector('.c-btn-core');
    if (menuBtnCore){
      menuBtnCore.style.setProperty('--c-btn-icon-url', "url('/assets/UI/T_MainMenu.png')");
    }

    let menuPanel = bar.querySelector('#topbar-menu');
    if (!menuPanel){
      menuPanel = document.createElement('div');
      menuPanel.id = 'topbar-menu';
      menuPanel.className = 'topbar-menu';
      menuPanel.setAttribute('hidden','');
      menuWrap.appendChild(menuPanel);
    } else {
      menuPanel.classList.add('topbar-menu');
    }
    menuPanel.setAttribute('role','menu');
    menuPanel.setAttribute('aria-label','Main menu');

    menuBtn.setAttribute('aria-haspopup', 'menu');

    const ensureMenuButton = (action, label) => {
      if (!menuPanel) return null;
      let btn = menuPanel.querySelector(`button[data-action="${action}"]`);
      if (!btn){
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'menu-item';
        btn.dataset.action = action;
        btn.textContent = label;
        menuPanel.appendChild(btn);
      } else {
        btn.classList.add('menu-item');
        btn.type = 'button';
      }
      btn.setAttribute('role','menuitem');
      return btn;
    };

    const ensureThemeRow = () => {
      if (!menuPanel) return;
      let select = menuPanel.querySelector('#theme-select');
      if (select){
        const row = select.closest('.menu-row') || select.parentElement;
        if (row){
          row.classList.add('menu-item','menu-row','menu-row-theme');
        }
        select.classList.add('toy-btn');
        if (!select.dataset.action) select.dataset.action = 'theme';
        return;
      }
      const row = document.createElement('div');
      row.className = 'menu-item menu-row menu-row-theme';
      const label = document.createElement('label');
      label.setAttribute('for','theme-select');
      label.textContent = 'Theme';
      const sel = document.createElement('select');
      sel.id = 'theme-select';
      sel.className = 'toy-btn';
      sel.dataset.action = 'theme';
      row.append(label, sel);
      menuPanel.appendChild(row);
    };

    const ensurePresetRow = () => {
      if (!menuPanel) return;
      let select = menuPanel.querySelector('#preset-select');
      let row = select ? (select.closest('.menu-row') || select.parentElement) : null;
      if (!select){
        row = document.createElement('div');
        row.className = 'menu-item menu-row menu-row-preset';
        const label = document.createElement('label');
        label.setAttribute('for','preset-select');
        label.textContent = 'Preset';
        select = document.createElement('select');
        select.id = 'preset-select';
        select.className = 'toy-btn';
        row.append(label, select);
        menuPanel.appendChild(row);
      } else {
        select.classList.add('toy-btn');
        if (row){
          row.classList.add('menu-item','menu-row','menu-row-preset');
        }
      }
      let apply = menuPanel.querySelector('[data-action="apply-preset"]');
      if (!apply){
        apply = document.createElement('button');
        apply.type = 'button';
        apply.className = 'menu-inline-btn';
        apply.dataset.action = 'apply-preset';
        apply.textContent = 'Apply';
        row?.appendChild(apply);
      } else {
        apply.classList.add('menu-inline-btn');
        apply.type = 'button';
      }
    };

    ensureMenuButton('new-scene', 'New Creation');
    ensureMenuButton('open-creations', 'Your Creations');
    ensureMenuButton('open-preferences', 'Preferences');

    let controls = bar.querySelector('.topbar-controls');
    if (!controls){
      controls = document.createElement('div');
      controls.className = 'topbar-controls';
      bar.appendChild(controls);
    }

    let playBtn = bar.querySelector('[data-action="toggle-play"]');
    if (!playBtn){
      playBtn = document.createElement('button');
      playBtn.className = 'c-btn';
      playBtn.dataset.action = 'toggle-play';
      playBtn.dataset.helpLabel = 'Toggle Play/Pause';
      playBtn.dataset.helpPosition = 'bottom';
      playBtn.title = 'Play';
      playBtn.innerHTML = '<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>';
      controls.prepend(playBtn);
    } else {
      playBtn.classList.add('c-btn');
      if (!playBtn.dataset.helpPosition) playBtn.dataset.helpPosition = 'bottom';
    }
    updatePlayButtonVisual(playBtn, !!Core?.isRunning?.());

    const menuState = bar.__menuState || (bar.__menuState = {});
    menuState.btn = menuBtn;
    menuState.panel = menuPanel;
    menuState.open = !!menuState.open;

    if (!menuState.setOpen){
      menuState.setOpen = (open)=>{
        menuState.open = !!open;
        const panel = menuState.panel || menuPanel;
        const btnRef = menuState.btn || menuBtn;
        if (!panel) return;
        if (menuState.open){
          panel.removeAttribute('hidden');
          panel.classList.add('is-open');
          btnRef?.setAttribute('aria-expanded','true');
        } else {
          if (!panel.hasAttribute('hidden')) panel.setAttribute('hidden','');
          panel.classList.remove('is-open');
          btnRef?.setAttribute('aria-expanded','false');
        }
      };
      menuState.close = ()=> menuState.setOpen(false);
      menuState.toggle = ()=> menuState.setOpen(!menuState.open);
    }
    menuState.setOpen(false);

    if (!menuState.boundOutside && menuPanel && menuBtn){
      menuState.boundOutside = (evt)=>{
        if (!menuState.open) return;
        const panel = menuState.panel || menuPanel;
        const btnRef = menuState.btn || menuBtn;
        const target = evt.target;
        if (panel && panel.contains(target)) return;
        if (btnRef && btnRef.contains(target)) return;
        menuState.close?.();
      };
      document.addEventListener('pointerdown', menuState.boundOutside);
    }

    if (!menuState.boundEscape){
      menuState.boundEscape = (evt)=>{
        if (evt.key === 'Escape'){
          menuState.close?.();
        }
      };
      document.addEventListener('keydown', menuState.boundEscape);
    }

    try{ populatePresets(); }catch{}

    return bar;
  }


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    ensureTopbar();
    wireTopbar();
  });
} else {
  ensureTopbar();
  wireTopbar();
}

  function wireTopbar(){
    const bar = ensureTopbar();
    if (!bar) return;
    if (window.__topbarWired) return;
    window.__topbarWired = true;

    const playBtn = bar.querySelector('[data-action="toggle-play"]');
    if (playBtn) {
      const resume = () => { resumeAudioContextIfNeeded().catch(()=>{}); };
      ['pointerup', 'touchend', 'mouseup'].forEach(evt => {
        playBtn.addEventListener(evt, resume, { passive: true });
      });
      playBtn.addEventListener('click', resume, { passive: true });
    }

    window.addEventListener('focus:editing-toggle', () => {
      const pref = document.getElementById('preferences-overlay');
      if (pref && typeof pref.__updateFocusToggle === 'function') pref.__updateFocusToggle();
    });

    bar.addEventListener('click', async (e)=>{
      const b = e.target.closest('button[data-action]');
      if (!b) return;

      const action = b.dataset.action;
      const menuState = bar.__menuState;

      if (action === 'menu-toggle'){
        e.preventDefault();
        menuState?.toggle?.();
        return;
      }

      if (action !== 'menu-toggle'){
        menuState?.close?.();
      }

      if (action === 'organize'){
        try { window.organizeBoard && window.organizeBoard(); } catch(e){}
        try { window.applyStackingOrder && window.applyStackingOrder(); } catch(e){}
        try { window.addGapAfterOrganize && window.addGapAfterOrganize(); } catch(e){}
        return;
      }

      if (action === 'toggle-play'){
        const doToggle = async ()=>{
          try{
            await resumeAudioContextIfNeeded();
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
        await doToggle();
        return;
      }

      const runSceneClear = ({ removePanels = false } = {})=>{
        try{
          const panels = Array.from(document.querySelectorAll('.toy-panel'));
          panels.forEach(panel=>{
            try{
              ['toy-clear','toy-reset'].forEach(evt=>{
                panel.dispatchEvent(new CustomEvent(evt, { bubbles:true }));
              });
            }catch{}
          });

          if (removePanels){
            const destroy = window.MusicToyFactory?.destroy;
            panels.forEach(panel=>{
              try{
                if (typeof destroy === 'function'){
                  destroy(panel);
                } else {
                  panel.remove();
                }
              }catch(err){
                console.warn('[topbar] destroy panel failed', err);
              }
            });
            try{ localStorage.removeItem('toyPositions'); }catch{}
          }

          try{
            const snap = window.Persistence?.getSnapshot ? window.Persistence.getSnapshot() : null;
            if (snap){
              snap.updatedAt = new Date().toISOString();
              localStorage.setItem('scene:autosave', JSON.stringify(snap));
            } else {
              localStorage.removeItem('scene:autosave');
            }
          }catch(err){
            console.warn('[topbar] snapshot save failed', err);
          }

          try{ window.Persistence?.markDirty?.(); }catch{}
        }catch(err){
          console.warn('[topbar] scene clear failed', err);
        }
      };

      if (action === 'new-scene'){
        runSceneClear({ removePanels: true });
        menuState?.close?.();
        try{ localStorage.removeItem('prefs:lastScene'); }catch{}
        try{ window.UIHighlights?.onNewScene?.(); }catch{}
        try { window.dispatchEvent(new CustomEvent('guide:close')); } catch {}
        try { window.dispatchEvent(new CustomEvent('scene:new')); } catch {}
        window.clearToyFocus?.();
        window.resetBoardView();
        return;
      }

      if (action === 'open-creations'){
        try {
          if (window.SceneManager && typeof window.SceneManager.open === 'function') {
            window.SceneManager.open({ mode: 'manage' });
          }
        } catch {}
        return;
      }

      if (action === 'open-preferences'){
        const overlay = ensurePreferencesOverlay();
        overlay?.__show?.();
        return;
      }

      if (action === 'clear-all'){
        runSceneClear({ removePanels: false });
        return;
      }

      if (action === 'save-scene'){
        try {
          if (window.SceneManager && typeof window.SceneManager.open === 'function') {
            window.SceneManager.open({ mode: 'save' });
          }
        } catch {}
        return;
      }

      if (action === 'load-scene'){
        try {
          if (window.SceneManager && typeof window.SceneManager.open === 'function') {
            window.SceneManager.open({ mode: 'load' });
          }
        } catch {}
        return;
      }

      if (action === 'export-scene'){
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

      if (action === 'import-scene'){
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

      if (action === 'apply-preset'){
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
