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

const NEW_SCENE_ZOOM = 0.6; // adjust this to change the starting zoom when creating a new scene
try { window.__MT_NEW_SCENE_ZOOM = NEW_SCENE_ZOOM; } catch {}
const LEAD_IN_ENABLED_KEY = 'prefs:leadInEnabled';
const LEAD_IN_BARS_KEY = 'prefs:leadInBars';
const LEAD_IN_DEFAULT_BARS = 4;
const LEAD_IN_RANDOMIZE_ENABLED_KEY = 'prefs:leadInRandomizeEnabled';
const LEAD_IN_RANDOMIZE_BARS_KEY = 'prefs:leadInRandomizeBars';
const LEAD_IN_TOGGLE_ENABLED_KEY = 'prefs:leadInToggleEnabled';
const LEAD_IN_TOGGLE_BARS_KEY = 'prefs:leadInToggleBars';
const LEAD_IN_RANDOMIZE_DEFAULT_BARS = 4;
const LEAD_IN_TOGGLE_DEFAULT_BARS = 4;

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
        const master = typeof Core?.getToyGain === 'function' ? Core.getToyGain('master') : null;
        g.connect(master || ctx.destination);
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

  function getLeadInState(bar) {
    const host = bar || document.getElementById('topbar');
    const state = host
      ? (host.__leadInState = host.__leadInState || {
          enabled: false,
          bars: LEAD_IN_DEFAULT_BARS,
          timers: [],
          token: 0,
          prevMuted: new Map(),
          toggleOffChains: new Set(),
          togglePrevMuted: new Map(),
          toggleBuildUp: false,
          chainToggleAt: new Map(),
          leadInOffChains: new Set(),
          randomizeEnabled: false,
          randomizeBars: LEAD_IN_RANDOMIZE_DEFAULT_BARS,
          toggleEnabled: false,
          toggleBars: LEAD_IN_TOGGLE_DEFAULT_BARS,
          randomTimers: [],
          randomToken: 0,
          randomizeQueue: [],
        })
      : {
          enabled: false,
          bars: LEAD_IN_DEFAULT_BARS,
          timers: [],
          token: 0,
          prevMuted: new Map(),
          toggleOffChains: new Set(),
          togglePrevMuted: new Map(),
          toggleBuildUp: false,
          chainToggleAt: new Map(),
          leadInOffChains: new Set(),
          randomizeEnabled: false,
          randomizeBars: LEAD_IN_RANDOMIZE_DEFAULT_BARS,
          toggleEnabled: false,
          toggleBars: LEAD_IN_TOGGLE_DEFAULT_BARS,
          randomTimers: [],
          randomToken: 0,
          randomizeQueue: [],
        };

    if (!state.__initialized) {
      state.__initialized = true;
      try {
        const savedEnabled = localStorage.getItem(LEAD_IN_ENABLED_KEY);
        if (savedEnabled != null) state.enabled = savedEnabled === '1';
      } catch {}
      try {
        const savedBars = Number(localStorage.getItem(LEAD_IN_BARS_KEY));
        if (Number.isFinite(savedBars) && savedBars > 0) state.bars = savedBars;
      } catch {}
      try {
        const savedRandEnabled = localStorage.getItem(LEAD_IN_RANDOMIZE_ENABLED_KEY);
        if (savedRandEnabled != null) state.randomizeEnabled = savedRandEnabled === '1';
      } catch {}
      try {
        const savedRandBars = Number(localStorage.getItem(LEAD_IN_RANDOMIZE_BARS_KEY));
        if (Number.isFinite(savedRandBars) && savedRandBars > 0) state.randomizeBars = savedRandBars;
      } catch {}
      try {
        const savedToggleEnabled = localStorage.getItem(LEAD_IN_TOGGLE_ENABLED_KEY);
        if (savedToggleEnabled != null) state.toggleEnabled = savedToggleEnabled === '1';
      } catch {}
      try {
        const savedToggleBars = Number(localStorage.getItem(LEAD_IN_TOGGLE_BARS_KEY));
        if (Number.isFinite(savedToggleBars) && savedToggleBars > 0) state.toggleBars = savedToggleBars;
      } catch {}
    }

    return state;
  }

  function getLeadInToyPanels() {
    return Array.from(document.querySelectorAll('#board > .toy-panel'));
  }

  function getChainHead(panel) {
    let current = panel;
    const seen = new Set();
    while (current && current.dataset && current.dataset.chainParent) {
      if (seen.has(current)) break;
      seen.add(current);
      const parentId = current.dataset.chainParent;
      const parent = parentId ? document.getElementById(parentId) : null;
      if (!parent) break;
      current = parent;
    }
    return current || panel;
  }

  function buildChainGroup(head, panelsById) {
    const ordered = [];
    const seen = new Set();
    let current = head;
    while (current && !seen.has(current)) {
      seen.add(current);
      ordered.push(current);
      const nextId = current.dataset?.nextToyId;
      if (!nextId) break;
      const next = panelsById.get(nextId) || document.getElementById(nextId);
      if (!next) break;
      current = next;
    }
    if (ordered.length > 1) return ordered;

    const fallback = [];
    panelsById.forEach((panel) => {
      if (getChainHead(panel) === head) fallback.push(panel);
    });
    return fallback.length ? fallback : ordered;
  }

  function getLeadInChains() {
    const panels = getLeadInToyPanels();
    const panelsById = new Map();
    panels.forEach((panel) => {
      if (panel?.id) panelsById.set(panel.id, panel);
    });

    const chains = [];
    const seenHeads = new Set();
    panels.forEach((panel) => {
      const head = getChainHead(panel);
      const headId = head?.id || panel?.id;
      if (!headId || seenHeads.has(headId)) return;
      seenHeads.add(headId);
      const group = buildChainGroup(head, panelsById);
      chains.push({ id: headId, panels: group });
    });
    return chains.filter(chain => chain && chain.panels && chain.panels.length);
  }

  function cancelLeadInSequence(bar, { restore = true } = {}) {
    const state = getLeadInState(bar);
    state.token++;
    state.timers.forEach((t) => { try { clearTimeout(t); } catch {} });
    state.timers = [];
    if (restore && state.prevMuted && typeof Core?.setToyMuted === 'function') {
      state.prevMuted.forEach((wasMuted, toyId) => {
        try { Core.setToyMuted(toyId, !!wasMuted); } catch {}
      });
    }
    state.prevMuted = new Map();
    if (state.leadInOffChains && state.leadInOffChains.size) {
      const chains = getLeadInChains();
      chains.forEach((chain) => {
        if (state.leadInOffChains.has(chain.id)) {
          setChainMutedVisual(chain, false);
        }
      });
      state.leadInOffChains.clear();
    }
  }

  function cancelRandomization(bar) {
    const state = getLeadInState(bar);
    state.randomToken++;
    state.randomTimers.forEach((t) => { try { clearTimeout(t); } catch {} });
    state.randomTimers = [];
  }

  function setChainAutoMuted(chain, muted, state) {
    if (!chain || !chain.panels) return;
    chain.panels.forEach((panel) => {
      const toyId = panel?.dataset?.toyid || panel?.id;
      if (!toyId) return;
      if (muted) {
        if (!state.togglePrevMuted.has(toyId)) {
          let wasMuted = false;
          try { wasMuted = !!Core?.isToyMuted?.(toyId); } catch {}
          state.togglePrevMuted.set(toyId, wasMuted);
        }
        try { Core?.setToyMuted?.(toyId, true); } catch {}
        try { panel.classList.add('toy-muted-auto'); } catch {}
      } else {
        const wasMuted = state.togglePrevMuted.get(toyId);
        if (wasMuted != null) {
          try { Core?.setToyMuted?.(toyId, !!wasMuted); } catch {}
        } else {
          try { Core?.setToyMuted?.(toyId, false); } catch {}
        }
        state.togglePrevMuted.delete(toyId);
        try { panel.classList.remove('toy-muted-auto'); } catch {}
      }
    });
  }

  function getNowMs() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
    return Date.now();
  }

  function ensureChainToggleTimes(state, chains) {
    if (!state.chainToggleAt) state.chainToggleAt = new Map();
    const now = getNowMs();
    chains.forEach((chain) => {
      if (!state.chainToggleAt.has(chain.id)) state.chainToggleAt.set(chain.id, now);
    });
  }

  function markChainToggleTime(chain, state) {
    if (!state.chainToggleAt) state.chainToggleAt = new Map();
    state.chainToggleAt.set(chain.id, getNowMs());
  }

  function getChainToggleAge(chain, state) {
    const now = getNowMs();
    const last = state.chainToggleAt?.get(chain.id);
    if (!Number.isFinite(last)) return 0;
    return Math.max(0, now - last);
  }

  function pickWeighted(items, weightFn) {
    if (!items.length) return null;
    const weights = items.map((item) => Math.max(0.001, Number(weightFn(item)) || 0.001));
    const total = weights.reduce((acc, w) => acc + w, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < items.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function flashToyRandom(panel) {
    if (!panel) return;
    const host = panel.querySelector('.toy-body') || panel;
    if (!host) return;
    const existing = host.querySelector('.toy-random-flash');
    if (existing) {
      try { existing.remove(); } catch {}
    }
    const flash = document.createElement('div');
    flash.className = 'toy-random-flash';
    host.appendChild(flash);
    const remove = () => { try { flash.remove(); } catch {} };
    flash.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, 900);
  }

  function setChainMutedVisual(chain, muted) {
    if (!chain || !chain.panels) return;
    chain.panels.forEach((panel) => {
      try { panel.classList.toggle('toy-muted-auto', !!muted); } catch {}
    });
  }

  function restoreToggleOffChains(bar) {
    const state = getLeadInState(bar);
    if (!state.toggleOffChains || !state.toggleOffChains.size) return;
    const chains = getLeadInChains();
    chains.forEach((chain) => {
      if (state.toggleOffChains.has(chain.id)) {
        setChainAutoMuted(chain, false, state);
      }
    });
    state.toggleOffChains.clear();
    state.togglePrevMuted.clear();
  }

  function randomizeOneChain(bar) {
    const state = getLeadInState(bar);
    const chains = getLeadInChains();
    if (!chains.length) return;
    const ids = chains.map(chain => chain.id);
    if (!state.randomizeQueue || !state.randomizeQueue.length) {
      const shuffled = ids.slice();
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
      }
      state.randomizeQueue = shuffled;
    }
    let nextId = state.randomizeQueue.shift();
    if (!nextId || !ids.includes(nextId)) {
      state.randomizeQueue = [];
      nextId = ids[Math.floor(Math.random() * ids.length)];
    }
    const chain = chains.find(c => c.id === nextId) || chains[Math.floor(Math.random() * chains.length)];
    if (!chain) return;
    chain.panels.forEach((panel) => {
      flashToyRandom(panel);
      try { panel.dispatchEvent(new CustomEvent('toy-random', { bubbles: true })); } catch {}
    });
  }

  function toggleRandomChainMute(bar) {
    if (typeof Core?.isToyMuted !== 'function' || typeof Core?.setToyMuted !== 'function') return;
    const state = getLeadInState(bar);
    const chains = getLeadInChains();
    if (!chains.length) return;
    ensureChainToggleTimes(state, chains);

    const muted = chains.filter(chain => state.toggleOffChains?.has(chain.id));
    const unmuted = chains.filter(chain => !state.toggleOffChains?.has(chain.id));

    const minActive = 2;
    if (unmuted.length <= minActive) state.toggleBuildUp = true;
    if (unmuted.length >= chains.length) state.toggleBuildUp = false;

    let target = null;
    let shouldMute = false;

    if (unmuted.length <= minActive) {
      if (!muted.length) return;
      target = pickWeighted(muted, (chain) => {
        const ageSec = Math.min(60, getChainToggleAge(chain, state) / 1000);
        return 1 + ageSec;
      });
      shouldMute = false;
    } else if (!muted.length) {
      target = pickWeighted(unmuted, (chain) => {
        const ageSec = Math.min(60, getChainToggleAge(chain, state) / 1000);
        return 1 + ageSec;
      });
      shouldMute = true;
    } else {
      const bias = state.toggleBuildUp ? 0.7 : 0.3;
      if (Math.random() < bias) {
        target = pickWeighted(muted, (chain) => {
          const ageSec = Math.min(60, getChainToggleAge(chain, state) / 1000);
          return 1 + ageSec;
        });
        shouldMute = false;
      } else {
        target = pickWeighted(unmuted, (chain) => {
          const ageSec = Math.min(60, getChainToggleAge(chain, state) / 1000);
          return 1 + ageSec;
        });
        shouldMute = true;
      }
    }

    if (!target) return;
    if (shouldMute) {
      state.toggleOffChains.add(target.id);
      setChainAutoMuted(target, true, state);
      markChainToggleTime(target, state);
    } else {
      state.toggleOffChains.delete(target.id);
      setChainAutoMuted(target, false, state);
      markChainToggleTime(target, state);
    }
  }

  function scheduleRandomization(bar, delayMs = 0) {
    const state = getLeadInState(bar);
    cancelRandomization(bar);
    if (!state.randomizeEnabled && !state.toggleEnabled) return;
    const li = (typeof Core?.getLoopInfo === 'function') ? (Core.getLoopInfo() || {}) : {};
    const barLen = Number(li.barLen) || (60 / (Core?.bpm || 120)) * (Core?.BEATS_PER_BAR || 4);
    const token = ++state.randomToken;

    const schedule = (fn, bars) => {
      const intervalMs = Math.max(0.05, barLen) * Math.max(1, bars) * 1000;
      const start = setTimeout(() => {
        if (state.randomToken !== token) return;
        fn();
        const interval = setInterval(() => {
          if (state.randomToken !== token) {
            clearInterval(interval);
            return;
          }
          fn();
        }, intervalMs);
        state.randomTimers.push(interval);
      }, Math.max(0, delayMs));
      state.randomTimers.push(start);
    };

    if (state.randomizeEnabled) {
      schedule(() => randomizeOneChain(bar), state.randomizeBars || 1);
    }
    if (state.toggleEnabled) {
      schedule(() => toggleRandomChainMute(bar), state.toggleBars || 1);
    }
  }

  function getLeadInDelayMs(bar) {
    const state = getLeadInState(bar);
    if (!state.enabled) return 0;
    const chains = getLeadInChains();
    if (!chains.length) return 0;
    const li = (typeof Core?.getLoopInfo === 'function') ? (Core.getLoopInfo() || {}) : {};
    const barLen = Number(li.barLen) || (60 / (Core?.bpm || 120)) * (Core?.BEATS_PER_BAR || 4);
    const intervalSec = Math.max(0.05, barLen) * Math.max(1, state.bars || 1);
    return Math.max(0, Math.round(chains.length * intervalSec * 1000));
  }

  function startLeadInSequence(bar) {
    const state = getLeadInState(bar);
    cancelLeadInSequence(bar, { restore: false });
    const chains = getLeadInChains();
    if (!chains.length) return { totalDelayMs: 0 };

    const order = chains.slice();
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }

    state.leadInOffChains = new Set();
    order.forEach((chain) => {
      state.leadInOffChains.add(chain.id);
      setChainMutedVisual(chain, true);
    });

    if (typeof Core?.isToyMuted === 'function' && typeof Core?.setToyMuted === 'function') {
      order.forEach((chain) => {
        chain.panels.forEach((panel) => {
          const toyId = panel?.dataset?.toyid || panel?.id;
          if (!toyId) return;
          const wasMuted = !!Core.isToyMuted(toyId);
          state.prevMuted.set(toyId, wasMuted);
          try { Core.setToyMuted(toyId, true); } catch {}
        });
      });
    }

    const li = (typeof Core?.getLoopInfo === 'function') ? (Core.getLoopInfo() || {}) : {};
    const barLen = Number(li.barLen) || (60 / (Core?.bpm || 120)) * (Core?.BEATS_PER_BAR || 4);
    const intervalSec = Math.max(0.05, barLen) * Math.max(1, state.bars || 1);
    const token = ++state.token;

    order.forEach((chain, idx) => {
      const delayMs = Math.max(0, Math.round(idx * intervalSec * 1000));
      const t = setTimeout(() => {
        if (state.token !== token) return;
        state.leadInOffChains.delete(chain.id);
        setChainMutedVisual(chain, false);
        chain.panels.forEach((panel) => {
          const toyId = panel?.dataset?.toyid || panel?.id;
          if (!toyId) return;
          const wasMuted = state.prevMuted.get(toyId);
          if (wasMuted) return;
          try { Core?.setToyMuted?.(toyId, false); } catch {}
        });
      }, delayMs);
      state.timers.push(t);
    });
    return { totalDelayMs: Math.max(0, Math.round(chains.length * intervalSec * 1000)) };
  }

  function centerBoardOnAnchorForNewScene(){
    const anchor = (typeof window !== 'undefined') ? window.__MT_ANCHOR_WORLD : null;
    const x = Number.isFinite(anchor?.x) ? anchor.x : 0;
    const y = Number.isFinite(anchor?.y) ? anchor.y : 0;
    if (typeof window.centerBoardOnWorldPoint === 'function') {
      window.centerBoardOnWorldPoint(x, y, NEW_SCENE_ZOOM, { duration: 180, centerFracX: 0.5, centerFracY: 0.5 });
      return;
    }
    window.resetBoardView?.();
  }

  function updateFocusToggleButton(btn){
    if (!btn) return;
    const enabled = (typeof window !== 'undefined' && typeof window.isFocusEditingEnabled === 'function')
      ? window.isFocusEditingEnabled()
      : true;
    const unlocked = (typeof window !== 'undefined' && window.__enableSmallScreenEditingToggle === true);
    btn.textContent = enabled ? 'On' : 'Off';
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    btn.classList.toggle('is-on', enabled);
    btn.classList.toggle('is-off', !enabled);
    btn.disabled = !unlocked;
    btn.setAttribute('aria-disabled', unlocked ? 'false' : 'true');
    btn.classList.toggle('is-locked', !unlocked);
    if (!unlocked) {
      btn.title = 'Experimental: unlock via debug console to toggle.';
    } else {
      btn.removeAttribute('title');
    }
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
                  <div class="pref-title">Small Screen Editing mode <span class="pref-badge pref-badge-experimental">Experimental</span></div>
                  <div class="pref-subtitle">Focus on editing one toy at a time.</div>
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
        if (toggleBtn?.disabled) return;
        const current = (typeof window !== 'undefined' && typeof window.isFocusEditingEnabled === 'function')
          ? window.isFocusEditingEnabled()
          : true;
        try { window.setFocusEditingEnabled?.(!current); } catch {}
        updateFocusToggleButton(toggleBtn);
      });
      window.addEventListener('prefs:small-screen-editing-toggle-unlock', () => {
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
    const show = (themeLabel, promptOverride) => {
      const label = themeLabel || 'No Theme';
      if (prompt) {
        prompt.textContent = promptOverride || `Apply ${label} theme to the scene`;
      }
      overlay.style.display = 'flex';
    };

    if (!overlay.__wired) {
      overlay.addEventListener('click', (evt) => {
        if (evt.target === overlay) hide();
      });
      applyBtn?.addEventListener('click', () => {
        const theme = overlay.__pendingTheme ?? (typeof getSoundThemeKey === 'function' ? getSoundThemeKey() : '');
        try { setSoundThemeKey(theme); } catch {}
        try { applySoundThemeToScene({ theme }); } catch {}
        overlay.__pendingTheme = null;
        hide();
      });
      closeBtn?.addEventListener('click', hide);
      skipBtn?.addEventListener('click', hide);
      overlay.__wired = true;
    }

    overlay.__show = show;
    overlay.__hide = hide;
    overlay.__applyBtn = applyBtn;
    overlay.__pendingTheme = null;
    overlay.__setPrompt = (text) => {
      if (prompt) prompt.textContent = text || '';
    };
    return overlay;
  }

  function ensureDiscardSceneOverlay() {
    let overlay = document.getElementById('discard-scene-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'discard-scene-overlay';
      overlay.className = 'scene-manager-overlay';
      overlay.style.display = 'none';
      overlay.innerHTML = `
        <div class="scene-manager-panel sound-theme-panel discard-scene-panel">
          <button class="scene-manager-close" type="button" aria-label="Close">&times;</button>
          <div class="scene-manager-body">
            <div class="sound-theme-prompt">Discard current scene?</div>
            <div class="sound-theme-actions">
              <button class="c-btn inst-ok" type="button" data-action="discard-scene-confirm" aria-label="Discard current scene">
                <div class="c-btn-outer"></div>
                <div class="c-btn-glow"></div>
                <div class="c-btn-core"></div>
              </button>
              <button class="c-btn inst-cancel" type="button" data-action="discard-scene-cancel" aria-label="Keep current scene">
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
    const okBtn = overlay.querySelector('[data-action="discard-scene-confirm"]');
    const cancelBtn = overlay.querySelector('[data-action="discard-scene-cancel"]');
    const prompt = overlay.querySelector('.sound-theme-prompt');
    const okCore = okBtn?.querySelector?.('.c-btn-core');
    const cancelCore = cancelBtn?.querySelector?.('.c-btn-core');
    if (okCore) okCore.style.setProperty('--c-btn-icon-url', "url('/assets/UI/T_ButtonTick.png')");
    if (cancelCore) cancelCore.style.setProperty('--c-btn-icon-url', "url('/assets/UI/T_ButtonClose.png')");

    const hide = () => { overlay.style.display = 'none'; };
    const resolve = (value) => {
      const resolver = overlay.__resolve;
      overlay.__resolve = null;
      if (typeof resolver === 'function') resolver(value);
      hide();
    };

    if (!overlay.__wired) {
      overlay.addEventListener('click', (evt) => {
        if (evt.target === overlay) resolve(false);
      });
      closeBtn?.addEventListener('click', () => resolve(false));
      cancelBtn?.addEventListener('click', () => resolve(false));
      okBtn?.addEventListener('click', () => resolve(true));
      overlay.__wired = true;
    }

    overlay.__confirm = (message) => {
      if (overlay.__resolve) resolve(false);
      if (prompt) prompt.textContent = message || 'Discard current scene?';
      overlay.style.display = 'flex';
      return new Promise((resolver) => {
        overlay.__resolve = resolver;
      });
    };

    return overlay;
  }

  function hasSceneToys() {
    try {
      const snap = window.Persistence?.getSnapshot?.();
      if (snap && Array.isArray(snap.toys)) return snap.toys.length > 0;
    } catch {}
    return document.querySelectorAll('#board > .toy-panel').length > 0;
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
      playBtn?.insertAdjacentElement('beforebegin', bpmBtn);
    } else {
      bpmBtn.classList.add('c-btn');
      bpmBtn.type = 'button';
      if (!bpmBtn.dataset.helpPosition) bpmBtn.dataset.helpPosition = 'bottom';
      playBtn?.insertAdjacentElement('beforebegin', bpmBtn);
    }
    updateBpmButtonVisual(bpmBtn);

    let soundThemeBtn = bar.querySelector('[data-action="sound-theme"]');
    if (!soundThemeBtn) {
      soundThemeBtn = document.createElement('button');
      soundThemeBtn.type = 'button';
      soundThemeBtn.className = 'c-btn sound-theme-btn';
      soundThemeBtn.dataset.action = 'sound-theme';
      soundThemeBtn.dataset.helpLabel = 'Play options';
      soundThemeBtn.dataset.helpPosition = 'bottom';
      soundThemeBtn.title = 'Play options';
      soundThemeBtn.innerHTML = [
        '<div class="c-btn-outer"></div>',
        '<div class="c-btn-glow"></div>',
        '<div class="c-btn-core"></div>',
      ].join('');
      const themeCore = soundThemeBtn.querySelector('.c-btn-core');
      if (themeCore) themeCore.style.setProperty('--c-btn-icon-url', "url('/assets/UI/T_ButtonPlayOptions.png')");
      playBtn?.insertAdjacentElement('afterend', soundThemeBtn);
    } else {
      soundThemeBtn.classList.add('c-btn', 'sound-theme-btn');
      soundThemeBtn.type = 'button';
      if (!soundThemeBtn.dataset.helpPosition) soundThemeBtn.dataset.helpPosition = 'bottom';
      if (!soundThemeBtn.dataset.helpLabel) soundThemeBtn.dataset.helpLabel = 'Play options';
      if (!soundThemeBtn.title) soundThemeBtn.title = 'Play options';
      const themeCore = soundThemeBtn.querySelector('.c-btn-core');
      if (themeCore) themeCore.style.setProperty('--c-btn-icon-url', "url('/assets/UI/T_ButtonPlayOptions.png')");
      playBtn?.insertAdjacentElement('afterend', soundThemeBtn);
    }

    let soundThemePanel = bar.querySelector('#topbar-sound-theme-panel');
    if (!soundThemePanel) {
      soundThemePanel = document.createElement('div');
      soundThemePanel.id = 'topbar-sound-theme-panel';
      soundThemePanel.className = 'topbar-sound-theme-panel options-panel';
      soundThemePanel.setAttribute('hidden', '');
      soundThemePanel.innerHTML = `
        <div class="options-section">
          <div class="options-section-title">Master Volume</div>
          <div class="options-volume-row">
            <div class="toy-volwrap options-volwrap">
              <input class="options-volume-slider" type="range" min="0" max="100" step="1" value="100" aria-label="Master volume" />
              <button class="c-btn toy-mute-btn options-mute-btn" type="button" aria-label="Mute">
                <div class="c-btn-outer"></div>
                <div class="c-btn-glow"></div>
                <div class="c-btn-core"></div>
              </button>
            </div>
            <div class="options-volume-value">100%</div>
          </div>
        </div>
        <div class="options-divider"></div>
        <div class="options-section">
          <div class="sound-theme-title">Sound Theme</div>
          <div class="options-theme-row">
            <select id="sound-theme-select" class="toy-btn options-theme-select"></select>
            <button class="menu-inline-btn options-apply-btn" type="button" data-action="apply-sound-theme">Apply</button>
          </div>
        </div>
        <div class="options-divider"></div>
        <div class="options-section options-leadin-section">
          <div class="options-section-title">Play With Lead In</div>
          <div class="options-leadin-row">
            <div class="options-leadin-count">
              <button class="options-step-btn" type="button" data-action="lead-in-minus" aria-label="Decrease bars">-</button>
              <div class="options-leadin-value">4 bars</div>
              <button class="options-step-btn" type="button" data-action="lead-in-plus" aria-label="Increase bars">+</button>
            </div>
            <button class="menu-inline-btn options-toggle-btn" type="button" data-action="lead-in-toggle" aria-pressed="false">Off</button>
          </div>
          <div class="options-subsection-title">Randomisation After Lead In</div>
          <div class="options-leadin-row">
            <div class="options-leadin-count">
              <button class="options-step-btn" type="button" data-action="lead-in-random-minus" aria-label="Decrease randomise bars">-</button>
              <div class="options-leadin-value options-randomize-value">Randomise every 4 bars</div>
              <button class="options-step-btn" type="button" data-action="lead-in-random-plus" aria-label="Increase randomise bars">+</button>
            </div>
            <button class="menu-inline-btn options-toggle-btn" type="button" data-action="lead-in-random-toggle" aria-pressed="false">Off</button>
          </div>
          <div class="options-leadin-row">
            <div class="options-leadin-count">
              <button class="options-step-btn" type="button" data-action="lead-in-toggle-minus" aria-label="Decrease toggle bars">-</button>
              <div class="options-leadin-value options-toggle-value">Toggle every 4 bars</div>
              <button class="options-step-btn" type="button" data-action="lead-in-toggle-plus" aria-label="Increase toggle bars">+</button>
            </div>
            <button class="menu-inline-btn options-toggle-btn" type="button" data-action="lead-in-toggle-toggle" aria-pressed="false">Off</button>
          </div>
        </div>
      `;
      bar.appendChild(soundThemePanel);
    } else {
      soundThemePanel.classList.add('topbar-sound-theme-panel', 'options-panel');
    }
    soundThemePanel.setAttribute('role', 'dialog');
    soundThemePanel.setAttribute('aria-label', 'Play options');

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

    const optionsState = bar.__optionsState || (bar.__optionsState = {});
    optionsState.panel = soundThemePanel;
    optionsState.masterSlider = soundThemePanel?.querySelector?.('.options-volume-slider') || null;
    optionsState.masterValue = soundThemePanel?.querySelector?.('.options-volume-value') || null;
    optionsState.masterMuteBtn = soundThemePanel?.querySelector?.('.options-mute-btn') || null;
    optionsState.soundThemeSelect = soundThemePanel?.querySelector?.('#sound-theme-select') || null;
    optionsState.leadInToggleBtn = soundThemePanel?.querySelector?.('[data-action="lead-in-toggle"]') || null;
    optionsState.leadInValue = soundThemePanel?.querySelector?.('.options-leadin-value') || null;
    optionsState.leadInMinus = soundThemePanel?.querySelector?.('[data-action="lead-in-minus"]') || null;
    optionsState.leadInPlus = soundThemePanel?.querySelector?.('[data-action="lead-in-plus"]') || null;
    optionsState.randomizeToggleBtn = soundThemePanel?.querySelector?.('[data-action="lead-in-random-toggle"]') || null;
    optionsState.randomizeValue = soundThemePanel?.querySelector?.('.options-randomize-value') || null;
    optionsState.randomizeMinus = soundThemePanel?.querySelector?.('[data-action="lead-in-random-minus"]') || null;
    optionsState.randomizePlus = soundThemePanel?.querySelector?.('[data-action="lead-in-random-plus"]') || null;
    optionsState.toggleToggleBtn = soundThemePanel?.querySelector?.('[data-action="lead-in-toggle-toggle"]') || null;
    optionsState.toggleValue = soundThemePanel?.querySelector?.('.options-toggle-value') || null;
    optionsState.toggleMinus = soundThemePanel?.querySelector?.('[data-action="lead-in-toggle-minus"]') || null;
    optionsState.togglePlus = soundThemePanel?.querySelector?.('[data-action="lead-in-toggle-plus"]') || null;

    const updateVolumeFill = (slider) => {
      if (!slider) return;
      const min = slider.min ? parseFloat(slider.min) : 0;
      const max = slider.max ? parseFloat(slider.max) : 100;
      const val = slider.value ? parseFloat(slider.value) : 0;
      const pct = (max > min) ? ((val - min) / (max - min)) : 0;
      slider.style.setProperty('--vol-fill-pct', `${Math.max(0, Math.min(1, pct)) * 100}%`);
    };

    const syncMasterVolume = () => {
      const slider = optionsState.masterSlider;
      const valueEl = optionsState.masterValue;
      if (!slider) return;
      const current = typeof Core?.getToyVolume === 'function' ? Core.getToyVolume('master') : 1;
      const safe = Number.isFinite(current) ? current : 1;
      const pct = Math.round(Math.max(0, Math.min(1, safe)) * 100);
      slider.value = String(pct);
      if (valueEl) valueEl.textContent = `${pct}%`;
      updateVolumeFill(slider);
    };

    const setMasterMuteVisual = (muted) => {
      const btn = optionsState.masterMuteBtn;
      if (!btn) return;
      btn.setAttribute('aria-pressed', String(!!muted));
      const title = muted ? 'Unmute' : 'Mute';
      btn.title = title;
      btn.setAttribute('aria-label', title);
      const core = btn.querySelector('.c-btn-core');
      if (core) {
        const iconUrl = muted ? "/assets/UI/T_Mute.png" : "/assets/UI/T_Unmute.png";
        core.style.setProperty('--c-btn-icon-url', `url('${iconUrl}')`);
      }
    };

    const syncSoundThemeSelect = () => {
      const select = optionsState.soundThemeSelect;
      if (!select) return;
      const current = getSoundThemeKey?.() || '';
      const themes = getSoundThemes?.() || [];
      const options = [{ key: '', label: 'No Theme' }, ...themes.map(t => ({ key: t, label: t }))];
      select.innerHTML = '';
      options.forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt.key;
        option.textContent = opt.label;
        select.appendChild(option);
      });
      try { select.value = current; } catch {}
    };

    const updateSoundThemeLabel = () => {
      const label = soundThemeLabel;
      if (!label) return;
      const theme = getSoundThemeKey?.() || '';
      label.textContent = getSoundThemeLabel(theme);
      positionSoundThemePanel();
    };

    const updateLeadInUI = () => {
      const state = getLeadInState(bar);
      const btn = optionsState.leadInToggleBtn;
      if (btn) {
        btn.textContent = state.enabled ? 'On' : 'Off';
        btn.setAttribute('aria-pressed', state.enabled ? 'true' : 'false');
        btn.classList.toggle('is-on', state.enabled);
        btn.classList.toggle('is-off', !state.enabled);
      }
      const valueEl = optionsState.leadInValue;
      if (valueEl) {
        const bars = Math.max(1, Number(state.bars) || 1);
        valueEl.textContent = `${bars} ${bars === 1 ? 'bar' : 'bars'}`;
      }
    };

    const updateRandomUI = () => {
      const state = getLeadInState(bar);
      const randBtn = optionsState.randomizeToggleBtn;
      if (randBtn) {
        randBtn.textContent = state.randomizeEnabled ? 'On' : 'Off';
        randBtn.setAttribute('aria-pressed', state.randomizeEnabled ? 'true' : 'false');
        randBtn.classList.toggle('is-on', state.randomizeEnabled);
        randBtn.classList.toggle('is-off', !state.randomizeEnabled);
      }
      const randVal = optionsState.randomizeValue;
      if (randVal) {
        const bars = Math.max(1, Number(state.randomizeBars) || 1);
        randVal.textContent = `Randomise every ${bars} ${bars === 1 ? 'bar' : 'bars'}`;
      }

      const toggleBtn = optionsState.toggleToggleBtn;
      if (toggleBtn) {
        toggleBtn.textContent = state.toggleEnabled ? 'On' : 'Off';
        toggleBtn.setAttribute('aria-pressed', state.toggleEnabled ? 'true' : 'false');
        toggleBtn.classList.toggle('is-on', state.toggleEnabled);
        toggleBtn.classList.toggle('is-off', !state.toggleEnabled);
      }
      const toggleVal = optionsState.toggleValue;
      if (toggleVal) {
        const bars = Math.max(1, Number(state.toggleBars) || 1);
        toggleVal.textContent = `Toggle every ${bars} ${bars === 1 ? 'bar' : 'bars'}`;
      }
    };

    const renderSoundThemeOptions = () => {
      syncSoundThemeSelect();
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
          syncMasterVolume();
          const isMuted = typeof Core?.isToyMuted === 'function' ? Core.isToyMuted('master') : false;
          setMasterMuteVisual(!!isMuted);
          updateLeadInUI();
          updateRandomUI();
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
        renderSoundThemeOptions();
        updateSoundThemeLabel();
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

    if (!optionsState.wired && optionsState.masterSlider) {
      optionsState.wired = true;
      optionsState.masterSlider.addEventListener('input', () => {
        const pct = Number(optionsState.masterSlider.value);
        const next = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0)) / 100;
        try { Core?.setToyVolume?.('master', next); } catch {}
        if (optionsState.masterValue) optionsState.masterValue.textContent = `${Math.round(next * 100)}%`;
        updateVolumeFill(optionsState.masterSlider);
        if (next > 0 && typeof Core?.isToyMuted === 'function' && Core.isToyMuted('master')) {
          try { Core?.setToyMuted?.('master', false); } catch {}
          setMasterMuteVisual(false);
        }
      }, { passive: true });
      optionsState.masterMuteBtn?.addEventListener('click', () => {
        const muted = typeof Core?.isToyMuted === 'function' ? Core.isToyMuted('master') : false;
        const shouldMute = !muted;
        try { Core?.setToyMuted?.('master', shouldMute); } catch {}
        setMasterMuteVisual(shouldMute);
        const slider = optionsState.masterSlider;
        if (!slider) return;
        if (shouldMute) {
          slider.dataset.preMute = slider.value;
          slider.value = '0';
          updateVolumeFill(slider);
          if (optionsState.masterValue) optionsState.masterValue.textContent = '0%';
        } else {
          slider.value = slider.dataset.preMute || '80';
          const pct = Number(slider.value);
          const next = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0)) / 100;
          try { Core?.setToyVolume?.('master', next); } catch {}
          if (optionsState.masterValue) optionsState.masterValue.textContent = `${Math.round(next * 100)}%`;
          updateVolumeFill(slider);
        }
      });
      optionsState.leadInToggleBtn?.addEventListener('click', () => {
        const state = getLeadInState(bar);
        state.enabled = !state.enabled;
        try { localStorage.setItem(LEAD_IN_ENABLED_KEY, state.enabled ? '1' : '0'); } catch {}
        updateLeadInUI();
        if (!state.enabled) {
          cancelLeadInSequence(bar, { restore: true });
          cancelRandomization(bar);
        } else if (Core?.isRunning?.()) {
          scheduleRandomization(bar, getLeadInDelayMs(bar));
        }
      });
      optionsState.leadInMinus?.addEventListener('click', () => {
        const state = getLeadInState(bar);
        state.bars = Math.max(1, (Number(state.bars) || 1) - 1);
        try { localStorage.setItem(LEAD_IN_BARS_KEY, String(state.bars)); } catch {}
        updateLeadInUI();
        if (Core?.isRunning?.()) scheduleRandomization(bar, getLeadInDelayMs(bar));
      });
      optionsState.leadInPlus?.addEventListener('click', () => {
        const state = getLeadInState(bar);
        state.bars = Math.min(16, (Number(state.bars) || 1) + 1);
        try { localStorage.setItem(LEAD_IN_BARS_KEY, String(state.bars)); } catch {}
        updateLeadInUI();
        if (Core?.isRunning?.()) scheduleRandomization(bar, getLeadInDelayMs(bar));
      });
      optionsState.randomizeToggleBtn?.addEventListener('click', () => {
        const state = getLeadInState(bar);
        state.randomizeEnabled = !state.randomizeEnabled;
        try { localStorage.setItem(LEAD_IN_RANDOMIZE_ENABLED_KEY, state.randomizeEnabled ? '1' : '0'); } catch {}
        updateRandomUI();
        if (!state.randomizeEnabled && !state.toggleEnabled) {
          cancelRandomization(bar);
        } else if (Core?.isRunning?.()) {
          scheduleRandomization(bar, getLeadInDelayMs(bar));
        }
      });
      optionsState.randomizeMinus?.addEventListener('click', () => {
        const state = getLeadInState(bar);
        state.randomizeBars = Math.max(1, (Number(state.randomizeBars) || 1) - 1);
        try { localStorage.setItem(LEAD_IN_RANDOMIZE_BARS_KEY, String(state.randomizeBars)); } catch {}
        updateRandomUI();
        if (Core?.isRunning?.()) scheduleRandomization(bar, getLeadInDelayMs(bar));
      });
      optionsState.randomizePlus?.addEventListener('click', () => {
        const state = getLeadInState(bar);
        state.randomizeBars = Math.min(16, (Number(state.randomizeBars) || 1) + 1);
        try { localStorage.setItem(LEAD_IN_RANDOMIZE_BARS_KEY, String(state.randomizeBars)); } catch {}
        updateRandomUI();
        if (Core?.isRunning?.()) scheduleRandomization(bar, getLeadInDelayMs(bar));
      });
      optionsState.toggleToggleBtn?.addEventListener('click', () => {
        const state = getLeadInState(bar);
        state.toggleEnabled = !state.toggleEnabled;
        try { localStorage.setItem(LEAD_IN_TOGGLE_ENABLED_KEY, state.toggleEnabled ? '1' : '0'); } catch {}
        updateRandomUI();
        if (!state.toggleEnabled) {
          restoreToggleOffChains(bar);
        }
        if (!state.randomizeEnabled && !state.toggleEnabled) {
          cancelRandomization(bar);
        } else if (Core?.isRunning?.()) {
          scheduleRandomization(bar, getLeadInDelayMs(bar));
        }
      });
      optionsState.toggleMinus?.addEventListener('click', () => {
        const state = getLeadInState(bar);
        state.toggleBars = Math.max(1, (Number(state.toggleBars) || 1) - 1);
        try { localStorage.setItem(LEAD_IN_TOGGLE_BARS_KEY, String(state.toggleBars)); } catch {}
        updateRandomUI();
        if (Core?.isRunning?.()) scheduleRandomization(bar, getLeadInDelayMs(bar));
      });
      optionsState.togglePlus?.addEventListener('click', () => {
        const state = getLeadInState(bar);
        state.toggleBars = Math.min(16, (Number(state.toggleBars) || 1) + 1);
        try { localStorage.setItem(LEAD_IN_TOGGLE_BARS_KEY, String(state.toggleBars)); } catch {}
        updateRandomUI();
        if (Core?.isRunning?.()) scheduleRandomization(bar, getLeadInDelayMs(bar));
      });
      syncMasterVolume();
      updateLeadInUI();
      updateRandomUI();
    }


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
    try {
      window.SceneDiscardPrompt = {
        confirm: (message) => ensureDiscardSceneOverlay().__confirm?.(message),
        hasSceneToys
      };
    } catch {}

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

      if (action === 'apply-sound-theme'){
        e.preventDefault();
        const sel = document.getElementById('sound-theme-select');
        const nextTheme = sel?.value || '';
        const overlay = ensureSoundThemeOverlay();
        overlay.__pendingTheme = nextTheme;
        overlay.__show?.(getSoundThemeLabel(nextTheme), 'Change all instruments to fit this theme?');
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
              cancelLeadInSequence(bar, { restore: true });
              cancelRandomization(bar);
              restoreToggleOffChains(bar);
            } else {
              Core?.start?.();
              updatePlayButtonVisual(b, true);
              const leadState = getLeadInState(bar);
              let leadInfo = null;
              if (leadState.enabled) {
                leadInfo = startLeadInSequence(bar);
              } else {
                cancelLeadInSequence(bar, { restore: false });
              }
              const delayMs = leadInfo?.totalDelayMs || 0;
              scheduleRandomization(bar, delayMs);
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
        const needsConfirm = typeof window.SceneDiscardPrompt?.hasSceneToys === 'function'
          ? window.SceneDiscardPrompt.hasSceneToys()
          : hasSceneToys();
        if (needsConfirm) {
          const ok = typeof window.SceneDiscardPrompt?.confirm === 'function'
            ? await window.SceneDiscardPrompt.confirm('Discard current scene?')
            : window.confirm('Discard current scene?');
          if (!ok) return;
        }
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
        centerBoardOnAnchorForNewScene();
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
            const needsConfirm = typeof window.SceneDiscardPrompt?.hasSceneToys === 'function'
              ? window.SceneDiscardPrompt.hasSceneToys()
              : hasSceneToys();
            if (needsConfirm) {
              const ok = typeof window.SceneDiscardPrompt?.confirm === 'function'
                ? await window.SceneDiscardPrompt.confirm('Discard current scene?')
                : window.confirm('Discard current scene?');
              if (!ok) return;
            }
            const P = window.Persistence;
            if (P && P.importScene(txt)){
              alert('Imported.');
              try{ window.organizeBoard && window.organizeBoard(); }catch{}
            }
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
