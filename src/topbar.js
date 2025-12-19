// src/topbar.js - wires page header buttons to board helpers
import * as Core from './audio-core.js';
import { resumeAudioContextIfNeeded } from './audio-core.js';
import {
  applySoundThemeToScene,
  getSoundThemeKey,
  getSoundThemeLabel,
  getSoundThemes,
  pickRandomSoundTheme,
  setSoundThemeKey,
} from './sound-theme.js';

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

  function updateBpmButtonVisual(btn){
    if (!btn) return;
    const raw = Number(Core?.bpm);
    const safe = Number.isFinite(raw) ? raw : (Core?.DEFAULT_BPM ?? 120);
    const bpmNow = Math.round(safe);
    const label = btn.querySelector('.bpm-label');
    if (label) label.textContent = String(bpmNow);
    btn.title = `Tempo: ${bpmNow} BPM`;
  }

  function ensureBpmMetronomeAnimator(bar){
    if (!bar || bar.__bpmMetronomeAnimator) return;

    const state = (bar.__bpmMetronomeAnimator = {
      raf: 0,
      lastBeatNum: null,
      lastBpm: null,
      beatFlashTimeout: 0,
      barFlashTimeout: 0,
      snap: { buffer: null, pending: null, lastAt: 0 },
      interactiveStartMs: 0,
      pausedLastMs: 0,
      pausedBeatPos: 0,
      outlineTimeout: 0,
    });

    const clearTimers = ()=>{
      try{ if (state.beatFlashTimeout) clearTimeout(state.beatFlashTimeout); }catch{}
      try{ if (state.barFlashTimeout) clearTimeout(state.barFlashTimeout); }catch{}
      try{ if (state.outlineTimeout) clearTimeout(state.outlineTimeout); }catch{}
      state.beatFlashTimeout = 0;
      state.barFlashTimeout = 0;
      state.outlineTimeout = 0;
    };

    const ensureFingerSnapBuffer = async ()=>{
      if (state.snap.buffer) return state.snap.buffer;
      if (state.snap.pending) return state.snap.pending;
      state.snap.pending = (async ()=>{
        try{
          const ctx = Core?.ensureAudioContext?.();
          if (!ctx) return null;
          const resp = await fetch('/assets/samples/FingerSnap.wav', { cache: 'force-cache' });
          const arr = await resp.arrayBuffer();
          const buf = await new Promise((resolve, reject)=>{
            try{
              ctx.decodeAudioData(arr, resolve, reject);
            }catch(err){
              reject(err);
            }
          });
          state.snap.buffer = buf;
          return buf;
        }catch{
          return null;
        }finally{
          state.snap.pending = null;
        }
      })();
      return state.snap.pending;
    };

    const playFingerSnap = ()=>{
      try{
        const bpmState = bar.__bpmState || {};
        if (!bpmState.open) return;
        const ctx = Core?.ensureAudioContext?.();
        if (!ctx) return;
        const buf = state.snap.buffer;
        if (!buf) return;
        const now = ctx.currentTime || 0;
        if (!Number.isFinite(now)) return;
        if (now - (state.snap.lastAt || 0) < 0.06) return;
        state.snap.lastAt = now;

        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = 0.45;
        src.connect(g);
        g.connect(ctx.destination);
        try{ src.start(now); }catch{ src.start(); }
      }catch{}
    };

    state.ensureFingerSnapBuffer = ensureFingerSnapBuffer;
    state.playFingerSnap = ()=>{ try{ playFingerSnap(); }catch{} };

    const tick = ()=>{
      try{
        const bpmState = bar.__bpmState || {};
        const btn = bpmState.btn || bar.querySelector('[data-action="bpm"]');
        const arm = btn?.querySelector?.('.metro-arm') || null;
        const weight = btn?.querySelector?.('.metro-weight') || null;

        const bpmRounded = Math.round(Number(Core?.bpm) || (Core?.DEFAULT_BPM ?? 120));
        if (btn && bpmRounded !== state.lastBpm){
          updateBpmButtonVisual(btn);
          if (bpmState.open && typeof bpmState.sync === 'function') bpmState.sync();
          if (arm && weight){
            const min = Number(Core?.MIN_BPM) || 30;
            const max = Number(Core?.MAX_BPM) || 200;
            const t = (bpmRounded - min) / Math.max(1, (max - min));
            const tt = Math.max(0, Math.min(1, t));
            const posPct = 72 + (22 - 72) * tt; // low BPM -> low weight, high BPM -> high weight
            arm.style.setProperty('--metro-weight-pos', `${posPct.toFixed(1)}%`);
          }
          state.lastBpm = bpmRounded;
        }

        const playing = !!Core?.isRunning?.();
        if (!btn || !arm){
          state.raf = requestAnimationFrame(tick);
          return;
        }

        const interactive = !!bpmState.open;
        if (!playing && !interactive){
          clearTimers();
          arm.style.transform = 'translate(-50%, -50%) rotate(-34deg)';
          arm.classList.remove('metro-beat-flash');
          btn.classList.remove('metro-beat-outline');
          btn.classList.remove('metro-bar-outline');
          state.lastBeatNum = null;
          state.raf = requestAnimationFrame(tick);
          return;
        }

        const beatsPerBar = Number(Core?.BEATS_PER_BAR) || 4;
        let beatPos = 0;
        let beatNum = 0;
        let beatInBar = 0;
        if (playing){
          const li = (typeof Core?.getLoopInfo === 'function') ? (Core.getLoopInfo() || {}) : {};
          const phase01 = Number.isFinite(li.phase01) ? li.phase01 : 0;
          beatPos = phase01 * beatsPerBar;
          beatNum = Math.floor(beatPos);
          beatInBar = ((beatNum % beatsPerBar) + beatsPerBar) % beatsPerBar;
        } else {
          const nowMs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now()
            : Date.now();
          const bpmNow = Math.max(1e-6, (Number(Core?.bpm) || (Core?.DEFAULT_BPM ?? 120)));
          const dt = (Number.isFinite(state.pausedLastMs) && state.pausedLastMs > 0)
            ? Math.max(0, (nowMs - state.pausedLastMs)) / 1000
            : 0;
          state.pausedLastMs = nowMs;
          state.pausedBeatPos = (Number.isFinite(state.pausedBeatPos) ? state.pausedBeatPos : 0) + (dt * (bpmNow / 60));
          beatPos = state.pausedBeatPos;
          beatNum = Math.floor(beatPos);
          beatInBar = ((beatNum % beatsPerBar) + beatsPerBar) % beatsPerBar;
        }

        if (!Number.isFinite(beatPos) || !Number.isFinite(beatNum)){
          state.raf = requestAnimationFrame(tick);
          return;
        }

        const swing = Math.cos(beatPos * Math.PI);
        const deg = swing * 34;

        arm.style.transform = `translate(-50%, -50%) rotate(${deg.toFixed(2)}deg)`;

        if (state.lastBeatNum !== null && beatNum !== state.lastBeatNum){
          arm.classList.remove('metro-beat-flash');
          btn.classList.remove('metro-beat-outline');
          btn.classList.remove('metro-bar-outline');
          void arm.offsetWidth;
          void btn.offsetWidth;
          arm.classList.add('metro-beat-flash');
          btn.classList.add('metro-beat-outline');
          clearTimers();
          state.beatFlashTimeout = setTimeout(()=>{ try{ arm.classList.remove('metro-beat-flash'); }catch{} }, 140);
          if (interactive) playFingerSnap();

          if (beatInBar === 0){
            btn.classList.add('metro-bar-outline');
            state.barFlashTimeout = setTimeout(()=>{ try{ btn.classList.remove('metro-bar-outline'); }catch{} }, 420);
          }

          state.outlineTimeout = setTimeout(()=>{
            try{ btn.classList.remove('metro-beat-outline'); }catch{}
          }, 260);
        }

        state.lastBeatNum = beatNum;
      }catch{}

      state.raf = requestAnimationFrame(tick);
    };

    state.raf = requestAnimationFrame(tick);
    try{ ensureFingerSnapBuffer(); }catch{}
  }

  function pauseTransportAndSyncUI(){
    try{ Core?.stop?.(); }catch{}
    try{
      const btn = document.querySelector('#topbar [data-action="toggle-play"]');
      if (btn) updatePlayButtonVisual(btn, false);
    }catch{}
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

  function ensureSoundThemeOverlay() {
    let overlay = document.getElementById('sound-theme-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sound-theme-overlay';
      overlay.className = 'scene-manager-overlay';
      overlay.style.display = 'none';
      overlay.innerHTML = `
        <div class="scene-manager-panel sound-theme-panel">
          <button class="scene-manager-close" type="button" aria-label="Close">&times;</button>
          <div class="scene-manager-body">
            <div class="sound-theme-prompt">Apply this theme to the scene?</div>
            <div class="sound-theme-actions">
              <button class="c-btn inst-ok" type="button" data-action="sound-theme-apply" aria-label="Apply theme">
                <div class="c-btn-outer"></div>
                <div class="c-btn-glow"></div>
                <div class="c-btn-core"></div>
              </button>
              <button class="c-btn inst-cancel" type="button" data-action="sound-theme-skip" aria-label="Keep current instruments">
                <div class="c-btn-outer"></div>
                <div class="c-btn-glow"></div>
                <div class="c-btn-core"></div>
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const closeBtn = overlay.querySelector('.scene-manager-close');
    const applyBtn = overlay.querySelector('[data-action="sound-theme-apply"]');
    const skipBtn = overlay.querySelector('[data-action="sound-theme-skip"]');
    const prompt = overlay.querySelector('.sound-theme-prompt');
    const okCore = applyBtn?.querySelector?.('.c-btn-core');
    const cancelCore = skipBtn?.querySelector?.('.c-btn-core');
    if (okCore) okCore.style.setProperty('--c-btn-icon-url', "url('/assets/UI/T_ButtonTick.png')");
    if (cancelCore) cancelCore.style.setProperty('--c-btn-icon-url', "url('/assets/UI/T_ButtonClose.png')");

    const hide = () => { overlay.style.display = 'none'; };
    const show = (themeLabel) => {
      const label = themeLabel || 'No Theme';
      if (prompt) prompt.textContent = `Apply ${label} theme to the scene`;
      overlay.style.display = 'flex';
    };

    if (!overlay.__wired) {
      overlay.addEventListener('click', (evt) => {
        if (evt.target === overlay) hide();
      });
      closeBtn?.addEventListener('click', hide);
      skipBtn?.addEventListener('click', hide);
      overlay.__wired = true;
    }

    overlay.__show = show;
    overlay.__hide = hide;
    overlay.__applyBtn = applyBtn;
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

    let bpmBtn = bar.querySelector('[data-action="bpm"]');
    if (!bpmBtn){
      bpmBtn = document.createElement('button');
      bpmBtn.type = 'button';
      bpmBtn.className = 'c-btn';
      bpmBtn.dataset.action = 'bpm';
      bpmBtn.dataset.helpLabel = 'Tempo (BPM)';
      bpmBtn.dataset.helpPosition = 'bottom';
      bpmBtn.title = 'Tempo';
      bpmBtn.innerHTML = [
        '<div class="c-btn-outer"></div>',
        '<div class="c-btn-glow"></div>',
        '<div class="c-btn-core">',
          '<div class="metro-arm"><div class="metro-weight"></div></div>',
          '<div class="bpm-label">120</div>',
        '</div>',
      ].join('');
      playBtn?.insertAdjacentElement('afterend', bpmBtn);
    } else {
      bpmBtn.classList.add('c-btn');
      bpmBtn.type = 'button';
      if (!bpmBtn.dataset.helpPosition) bpmBtn.dataset.helpPosition = 'bottom';
    }
    updateBpmButtonVisual(bpmBtn);

    let soundThemeBtn = bar.querySelector('[data-action="sound-theme"]');
    if (!soundThemeBtn) {
      soundThemeBtn = document.createElement('button');
      soundThemeBtn.type = 'button';
      soundThemeBtn.className = 'c-btn sound-theme-btn';
      soundThemeBtn.dataset.action = 'sound-theme';
      soundThemeBtn.dataset.helpLabel = 'Sound theme';
      soundThemeBtn.dataset.helpPosition = 'bottom';
      soundThemeBtn.title = 'Sound theme';
      soundThemeBtn.innerHTML = [
        '<div class="c-btn-outer"></div>',
        '<div class="c-btn-glow"></div>',
        '<div class="c-btn-core"></div>',
      ].join('');
      const themeCore = soundThemeBtn.querySelector('.c-btn-core');
      if (themeCore) themeCore.style.setProperty('--c-btn-icon-url', "url('/assets/UI/T_ButtonTheme.png')");
      bpmBtn?.insertAdjacentElement('afterend', soundThemeBtn);
    } else {
      soundThemeBtn.classList.add('c-btn', 'sound-theme-btn');
      soundThemeBtn.type = 'button';
      if (!soundThemeBtn.dataset.helpPosition) soundThemeBtn.dataset.helpPosition = 'bottom';
      const themeCore = soundThemeBtn.querySelector('.c-btn-core');
      if (themeCore) themeCore.style.setProperty('--c-btn-icon-url', "url('/assets/UI/T_ButtonTheme.png')");
    }

    let soundThemePanel = bar.querySelector('#topbar-sound-theme-panel');
    if (!soundThemePanel) {
      soundThemePanel = document.createElement('div');
      soundThemePanel.id = 'topbar-sound-theme-panel';
      soundThemePanel.className = 'topbar-sound-theme-panel';
      soundThemePanel.setAttribute('hidden', '');
      soundThemePanel.innerHTML = `
        <div class="sound-theme-title">Sound Theme</div>
        <div class="sound-theme-list"></div>
      `;
      bar.appendChild(soundThemePanel);
    } else {
      soundThemePanel.classList.add('topbar-sound-theme-panel');
    }
    soundThemePanel.setAttribute('role', 'dialog');
    soundThemePanel.setAttribute('aria-label', 'Sound theme');

    let soundThemeLabel = bar.querySelector('#topbar-sound-theme-label');
    if (!soundThemeLabel) {
      soundThemeLabel = document.createElement('div');
      soundThemeLabel.id = 'topbar-sound-theme-label';
      soundThemeLabel.className = 'sound-theme-floating-label';
      bar.appendChild(soundThemeLabel);
    }

    let bpmPanel = bar.querySelector('#topbar-bpm-panel');
    if (!bpmPanel){
      bpmPanel = document.createElement('div');
      bpmPanel.id = 'topbar-bpm-panel';
      bpmPanel.className = 'topbar-bpm-panel';
      bpmPanel.setAttribute('hidden','');
      bpmPanel.innerHTML = `
        <div class="topbar-bpm-row">
          <div class="topbar-bpm-title">BPM</div>
          <div class="topbar-bpm-value">120 BPM</div>
        </div>
        <input class="topbar-bpm-slider" type="range" min="30" max="200" step="1" value="120" aria-label="Tempo (BPM)" />
      `;
      bar.appendChild(bpmPanel);
    } else {
      bpmPanel.classList.add('topbar-bpm-panel');
    }
    bpmPanel.setAttribute('role','dialog');
    bpmPanel.setAttribute('aria-label','Tempo');

    const bpmState = bar.__bpmState || (bar.__bpmState = {});
    bpmState.btn = bpmBtn;
    bpmState.panel = bpmPanel;
    bpmState.open = !!bpmState.open;

    if (!bpmState.setOpen){
      bpmState.setOpen = (open)=>{
        bpmState.open = !!open;
        const panel = bpmState.panel || bpmPanel;
        const btnRef = bpmState.btn || bpmBtn;
        if (!panel) return;
        if (bpmState.open){
          panel.removeAttribute('hidden');
          panel.classList.add('is-open');
          btnRef?.setAttribute('aria-expanded','true');
          try{
            if (bar.__bpmMetronomeAnimator){
              bar.__bpmMetronomeAnimator.lastBeatNum = null;
              bar.__bpmMetronomeAnimator.interactiveStartMs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
                ? performance.now()
                : Date.now();
              bar.__bpmMetronomeAnimator.pausedBeatPos = 1;
              bar.__bpmMetronomeAnimator.pausedLastMs = bar.__bpmMetronomeAnimator.interactiveStartMs;
            }
          }catch{}
          try{
            resumeAudioContextIfNeeded().catch(()=>{});
            bar.__bpmMetronomeAnimator?.ensureFingerSnapBuffer?.();
          }catch{}
          try{ bpmState.sync?.(); }catch{}
        } else {
          if (!panel.hasAttribute('hidden')) panel.setAttribute('hidden','');
          panel.classList.remove('is-open');
          btnRef?.setAttribute('aria-expanded','false');
        }
      };
      bpmState.close = ()=> bpmState.setOpen(false);
      bpmState.toggle = ()=> bpmState.setOpen(!bpmState.open);
    }
    bpmState.setOpen(false);

    if (!bpmState.wired && bpmPanel){
      bpmState.slider = bpmPanel.querySelector('input[type="range"]');
      bpmState.valueEl = bpmPanel.querySelector('.topbar-bpm-value');
      bpmState.sync = ()=>{
        const raw = Number(Core?.bpm);
        const safe = Number.isFinite(raw) ? raw : (Core?.DEFAULT_BPM ?? 120);
        const v = Math.round(safe);
        if (bpmState.slider) bpmState.slider.value = String(v);
        if (bpmState.valueEl) bpmState.valueEl.textContent = `${v} BPM`;
        updateBpmButtonVisual(bpmBtn);
      };
      const apply = ()=>{
        const v = Number(bpmState.slider?.value);
        try{ Core?.setBpm?.(v); }catch{}
        bpmState.sync?.();
      };
      bpmState.slider?.addEventListener('input', apply, { passive: true });
      bpmState.slider?.addEventListener('change', apply, { passive: true });
      const blur = ()=>{ try{ bpmState.slider?.blur?.(); }catch{} };
      bpmState.slider?.addEventListener('pointerup', blur, { passive: true });
      bpmState.slider?.addEventListener('touchend', blur, { passive: true });
      bpmState.slider?.addEventListener('mouseup', blur, { passive: true });

      bpmState.wired = true;
      try{ bpmState.sync(); }catch{}
    }

    if (!bpmState.boundOutside && bpmPanel && bpmBtn){
      bpmState.boundOutside = (evt)=>{
        if (!bpmState.open) return;
        const panel = bpmState.panel || bpmPanel;
        const btnRef = bpmState.btn || bpmBtn;
        const target = evt.target;
        if (panel && panel.contains(target)) return;
        if (btnRef && btnRef.contains(target)) return;
        bpmState.close?.();
      };
      document.addEventListener('pointerdown', bpmState.boundOutside);
    }

    if (!bpmState.boundEscape){
      bpmState.boundEscape = (evt)=>{
        if (evt.key === 'Escape'){
          bpmState.close?.();
        }
      };
      document.addEventListener('keydown', bpmState.boundEscape);
    }

    const soundThemeState = bar.__soundThemeState || (bar.__soundThemeState = {});
    soundThemeState.btn = soundThemeBtn;
    soundThemeState.panel = soundThemePanel;
    soundThemeState.label = soundThemeLabel;
    soundThemeState.open = !!soundThemeState.open;

    const updateSoundThemeLabel = () => {
      const label = soundThemeLabel;
      if (!label) return;
      const theme = getSoundThemeKey?.() || '';
      label.textContent = getSoundThemeLabel(theme);
      positionSoundThemePanel();
    };

    const renderSoundThemeOptions = () => {
      if (!soundThemePanel) return;
      const list = soundThemePanel.querySelector('.sound-theme-list');
      if (!list) return;
      const current = getSoundThemeKey?.() || '';
      const themes = getSoundThemes?.() || [];
      const options = [{ key: '', label: 'No Theme' }, ...themes.map(t => ({ key: t, label: t }))];
      list.innerHTML = '';
      options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sound-theme-option';
        btn.dataset.theme = opt.key;
        btn.textContent = opt.label;
        if (opt.key === current) btn.classList.add('is-active');
        btn.addEventListener('click', () => {
          const nextTheme = btn.dataset.theme || '';
          const prevTheme = getSoundThemeKey?.() || '';
          if (nextTheme !== prevTheme) {
            setSoundThemeKey(nextTheme);
            const overlay = ensureSoundThemeOverlay();
            overlay.__show?.(getSoundThemeLabel(nextTheme));
            if (overlay.__applyBtn) {
              overlay.__applyBtn.onclick = () => {
                try { applySoundThemeToScene({ theme: nextTheme }); } catch {}
                overlay.__hide?.();
              };
            }
          }
          soundThemeState.close?.();
        });
        list.appendChild(btn);
      });
    };

    const positionSoundThemePanel = () => {
      if (!soundThemePanel || !soundThemeBtn) return;
      const rect = soundThemeBtn.getBoundingClientRect();
      soundThemePanel.style.left = `${rect.left + rect.width / 2}px`;
      soundThemePanel.style.top = `${rect.bottom + 10}px`;
      if (soundThemeLabel) {
        soundThemeLabel.style.left = `${rect.left + rect.width / 2}px`;
        soundThemeLabel.style.top = `${rect.bottom + 6}px`;
      }
    };

    if (!soundThemeState.setOpen) {
      soundThemeState.setOpen = (open) => {
        soundThemeState.open = !!open;
        const panel = soundThemeState.panel || soundThemePanel;
        const btnRef = soundThemeState.btn || soundThemeBtn;
        if (!panel) return;
        if (soundThemeState.open) {
          renderSoundThemeOptions();
          updateSoundThemeLabel();
          positionSoundThemePanel();
          panel.removeAttribute('hidden');
          panel.classList.add('is-open');
          btnRef?.setAttribute('aria-expanded', 'true');
        } else {
          if (!panel.hasAttribute('hidden')) panel.setAttribute('hidden', '');
          panel.classList.remove('is-open');
          btnRef?.setAttribute('aria-expanded', 'false');
        }
      };
      soundThemeState.close = () => soundThemeState.setOpen(false);
      soundThemeState.toggle = () => soundThemeState.setOpen(!soundThemeState.open);
    }
    soundThemeState.setOpen(false);

    if (!soundThemeState.boundOutside && soundThemePanel && soundThemeBtn) {
      soundThemeState.boundOutside = (evt) => {
        if (!soundThemeState.open) return;
        const panel = soundThemeState.panel || soundThemePanel;
        const btnRef = soundThemeState.btn || soundThemeBtn;
        const target = evt.target;
        if (panel && panel.contains(target)) return;
        if (btnRef && btnRef.contains(target)) return;
        soundThemeState.close?.();
      };
      document.addEventListener('pointerdown', soundThemeState.boundOutside);
    }

    if (!soundThemeState.boundEscape) {
      soundThemeState.boundEscape = (evt) => {
        if (evt.key === 'Escape') {
          soundThemeState.close?.();
        }
      };
      document.addEventListener('keydown', soundThemeState.boundEscape);
    }

    if (!soundThemeState.boundEvents) {
      soundThemeState.boundEvents = true;
      window.addEventListener('sound-theme:change', () => {
        updateSoundThemeLabel();
        renderSoundThemeOptions();
      });
      window.addEventListener('instrument-catalog:loaded', () => {
        renderSoundThemeOptions();
        updateSoundThemeLabel();
      });
      window.addEventListener('resize', () => {
        positionSoundThemePanel();
      });
    }
    updateSoundThemeLabel();


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
      if (!playBtn.__transportSyncBound){
        const sync = () => {
          try{ updatePlayButtonVisual(playBtn, !!Core?.isRunning?.()); }catch{}
        };
        document.addEventListener('transport:resume', sync, { passive: true });
        document.addEventListener('transport:pause', sync, { passive: true });
        playBtn.__transportSyncBound = true;
      }
    }
    try{ ensureBpmMetronomeAnimator(bar); }catch{}

    window.addEventListener('focus:editing-toggle', () => {
      const pref = document.getElementById('preferences-overlay');
      if (pref && typeof pref.__updateFocusToggle === 'function') pref.__updateFocusToggle();
    });

    bar.addEventListener('click', async (e)=>{
      const b = e.target.closest('button[data-action]');
      if (!b) return;

      const action = b.dataset.action;
      const menuState = bar.__menuState;
      const bpmState = bar.__bpmState;

      if (action === 'menu-toggle'){
        e.preventDefault();
        bpmState?.close?.();
        bar.__soundThemeState?.close?.();
        menuState?.toggle?.();
        return;
      }

      if (action !== 'menu-toggle'){
        menuState?.close?.();
      }

      if (action === 'bpm'){
        e.preventDefault();
        try{ await resumeAudioContextIfNeeded(); }catch{}
        bar.__soundThemeState?.close?.();
        bpmState?.toggle?.();
        try{ if (bpmState?.open) bpmState?.slider?.focus?.(); }catch{}
        return;
      }

      if (action === 'sound-theme'){
        e.preventDefault();
        bpmState?.close?.();
        bar.__soundThemeState?.toggle?.();
        return;
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
        pauseTransportAndSyncUI();
        try{ Core?.setBpm?.(Core?.DEFAULT_BPM ?? 120); }catch{}
        try{ bar.__bpmState?.sync?.(); }catch{}
        runSceneClear({ removePanels: true });
        menuState?.close?.();
        try {
          const nextTheme = pickRandomSoundTheme();
          setSoundThemeKey(nextTheme);
        } catch {}
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

      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)){
        try{
          const isBpmRange = (tgt.tagName === 'INPUT'
            && String(tgt.type || '').toLowerCase() === 'range'
            && !!tgt.closest?.('#topbar-bpm-panel'));
          if (!isBpmRange) return;
        }catch{
          return;
        }
      }

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
