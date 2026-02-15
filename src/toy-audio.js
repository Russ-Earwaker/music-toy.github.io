// src/toy-audio.js — shared per-toy mute/volume policy (<=300 lines)
import { ensureAudioContext, resumeAudioContextIfNeeded, setToyVolume, setToyMuted } from './audio-core.js';
import { cancelScheduledToySources } from './audio-samples.js';
import { syncVolumeUI } from './baseToy/volume-ui.js';

/** In-memory mirror so UI can query without hitting AudioParams */
const __toyState = new Map(); // id -> { muted:boolean, volume:number }

// Audio generation guard: lets us invalidate already-scheduled notes when a toy changes "ownership"
// (e.g. chain switches) without needing to cancel AudioContext events.
const __TOY_AUDIO_GEN = (typeof window !== 'undefined')
  ? (window.__TOY_AUDIO_GEN = window.__TOY_AUDIO_GEN || Object.create(null))
  : Object.create(null);

// Deferred trigger timeouts created by gateTriggerForToy (per-toy).
// These can leak across pause/resume because setTimeout continues while AudioContext is suspended.
const __DEFERRED_GATE_TIMEOUTS = (typeof window !== 'undefined')
  ? (window.__DEFERRED_GATE_TIMEOUTS = window.__DEFERRED_GATE_TIMEOUTS || new Map())
  : new Map();

function __trackGateTimeout(toyKey, timeoutId) {
  if (!toyKey || !timeoutId) return;
  let set = __DEFERRED_GATE_TIMEOUTS.get(toyKey);
  if (!set) { set = new Set(); __DEFERRED_GATE_TIMEOUTS.set(toyKey, set); }
  set.add(timeoutId);
}

function __untrackGateTimeout(toyKey, timeoutId) {
  try {
    const set = __DEFERRED_GATE_TIMEOUTS.get(toyKey);
    if (!set) return;
    set.delete(timeoutId);
    if (set.size === 0) __DEFERRED_GATE_TIMEOUTS.delete(toyKey);
  } catch {}
}

function __clearGateTimeouts(toyKey /* optional */) {
  const clearSet = (set) => {
    if (!set) return;
    for (const tid of Array.from(set)) {
      try { clearTimeout(tid); } catch {}
      try { set.delete(tid); } catch {}
    }
  };

  if (!toyKey) {
    for (const set of __DEFERRED_GATE_TIMEOUTS.values()) clearSet(set);
    __DEFERRED_GATE_TIMEOUTS.clear();
    return;
  }

  const set = __DEFERRED_GATE_TIMEOUTS.get(toyKey);
  clearSet(set);
  if (set && set.size === 0) __DEFERRED_GATE_TIMEOUTS.delete(toyKey);
}

export function bumpToyAudioGen(toyId, reason = '') {
  if (!toyId) return;
  __TOY_AUDIO_GEN[toyId] = (__TOY_AUDIO_GEN[toyId] || 0) + 1;
  // Best-effort: stop any already-scheduled future sample notes for this toy.
  try { cancelScheduledToySources(toyId); } catch {}
  // HARD RESET: cancel any deferred gate timeouts for this toy (setTimeout continues across suspend()).
  try { __clearGateTimeouts(String(toyId)); } catch {}

  try {
    if (window.__SCHED_MISMATCH_DEBUG) {
      const lastResumeAt = Number(window.__NOTE_SCHED_LAST_RESUME_AT);
      const now = ensureAudioContext()?.currentTime ?? 0;
      if (Number.isFinite(lastResumeAt) && (now - lastResumeAt) < 0.5) {
        const payload = { id: String(toyId), reason: reason || 'unknown', now, lastResumeAt };
        console.warn('[audio-gate][resume-bump] ' + JSON.stringify(payload));
      }
    }
  } catch {}
}

export function getToyAudioGen(toyId) {
  return __TOY_AUDIO_GEN[toyId] || 0;
}

export function bumpAllToyAudioGen() {
  try{
    for (const k in __TOY_AUDIO_GEN) __TOY_AUDIO_GEN[k] = (__TOY_AUDIO_GEN[k] || 0) + 1;
  } catch {}
  // Best-effort: stop any already-scheduled future sample notes across all toys.
  try { cancelScheduledToySources(null); } catch {}
  // HARD RESET: cancel any deferred gate timeouts across all toys.
  try { __clearGateTimeouts(null); } catch {}

  if (window.__TRACE_BUMP_ALL_AUDIO_GEN) {
    try { console.warn('[toy-audio] bumpAllToyAudioGen()', new Error('trace bumpAll').stack); } catch {}
  }
}

function keyOf(id){ return String(id || 'master').toLowerCase(); }
function getState(id){
  const k = keyOf(id);
  if (!__toyState.has(k)) __toyState.set(k, { muted:false, volume:1.0 });
  return __toyState.get(k);
}

function clamp01(v){ return Math.max(0, Math.min(1, Number(v))); }

function getPanelToyId(panel){
  return panel?.dataset?.toyid || panel?.id || panel?.dataset?.toy || '';
}

function getPanelAudioId(panel){
  // Many toys use a unique per-instance audio id (data-audiotoyid / __audioToyId).
  // This is the id that must be used for setToyVolume / setToyMuted.
  return panel?.__audioToyId || panel?.dataset?.audiotoyid || getPanelToyId(panel);
}

function findToyPanel(id){
  if (!id || typeof document === 'undefined') return null;
  const byId = document.getElementById(id);
  if (byId) return byId;
  return document.querySelector(`.toy-panel[data-toyid="${id}"], .toy-panel[data-toy="${id}"], .art-toy-panel#${CSS.escape(String(id))}`);
}

function isChainHead(panel){
  if (!panel) return false;
  const hasParent = !!(panel.dataset?.chainParent || panel.dataset?.prevToyId);
  return !hasParent;
}

function collectChainDescendants(rootId){
  const descendants = [];
  if (!rootId || typeof document === 'undefined') return descendants;
  const panels = Array.from(document.querySelectorAll('.toy-panel'));
  const visited = new Set();
  const queue = [String(rootId)];
  visited.add(String(rootId));

  while (queue.length) {
    const currentId = queue.shift();
    for (const panel of panels) {
      const parentId = panel?.dataset?.chainParent || panel?.dataset?.prevToyId;
      if (!parentId || String(parentId) !== String(currentId)) continue;
      const childId = getPanelToyId(panel);
      if (!childId) continue;
      if (visited.has(String(childId))) continue;
      visited.add(String(childId));
      descendants.push({ id: String(childId), panel });
      queue.push(String(childId));
    }
  }

  return descendants;
}

function applyChainVolumeMute(rootId, { volume, muted } = {}){
  const hasVolume = Number.isFinite(volume);
  const hasMuted = typeof muted === 'boolean';
  if (!hasVolume && !hasMuted) return;
  const targets = collectChainDescendants(rootId);
  for (const { id, panel } of targets) {
    const audioId = getPanelAudioId(panel) || id;
    const st = getState(audioId);
    if (hasVolume) {
      st.volume = clamp01(volume);
      try { setToyVolume(audioId, st.volume); } catch {}
      try { panel.dataset.toyVolume = String(st.volume); } catch {}
    }
    if (hasMuted) {
      st.muted = !!muted;
      try { setToyMuted(audioId, st.muted); } catch {}
      try { panel.dataset.toyMuted = st.muted ? '1' : '0'; } catch {}
    }
    try { syncVolumeUI(panel, { volume: hasVolume ? st.volume : undefined, muted: hasMuted ? st.muted : undefined }); } catch {}
  }
}

function applyArtOwnedVolumeMute(artToyId, { volume, muted } = {}) {
  const hasVolume = Number.isFinite(volume);
  const hasMuted = typeof muted === 'boolean';
  if (!artToyId || (!hasVolume && !hasMuted) || typeof document === 'undefined') return;
  const sel = `.toy-panel[data-art-owner-id="${CSS.escape(String(artToyId))}"]`;
  const panels = Array.from(document.querySelectorAll(sel));
  for (const panel of panels) {
    const audioId = getPanelAudioId(panel) || getPanelToyId(panel);
    if (!audioId) continue;
    const st = getState(audioId);
    if (hasVolume) {
      st.volume = clamp01(volume);
      try { setToyVolume(audioId, st.volume); } catch {}
      try { panel.dataset.toyVolume = String(st.volume); } catch {}
    }
    if (hasMuted) {
      st.muted = !!muted;
      try { setToyMuted(audioId, st.muted); } catch {}
      try { panel.dataset.toyMuted = st.muted ? '1' : '0'; } catch {}
    }
    try { syncVolumeUI(panel, { volume: hasVolume ? st.volume : undefined, muted: hasMuted ? st.muted : undefined }); } catch {}
  }
}

// Listen for UI events from toyui.js and drive audio-core
try {
  window.addEventListener('toy-mute', (e)=>{
    const d = (e && e.detail) || {};
    const rawId = String(d.toyId || '');
    const panel = findToyPanel(rawId) || findToyPanel(keyOf(rawId));
    const audioIdRaw = getPanelAudioId(panel) || rawId;
    const id = keyOf(audioIdRaw);
    const st = getState(id);
    st.muted = !!d.muted;
    try { setToyMuted(id, st.muted); } catch {}
    if (panel?.classList?.contains?.('art-toy-panel')) {
      applyArtOwnedVolumeMute(getPanelToyId(panel), { muted: st.muted });
    }
    if (panel && isChainHead(panel) && id !== 'master') {
      applyChainVolumeMute(getPanelToyId(panel), { muted: st.muted });
    }
  });
} catch {}

try {
  window.addEventListener('toy-volume', (e)=>{
    const d = (e && e.detail) || {};
    const rawId = String(d.toyId || '');
    const panel = findToyPanel(rawId) || findToyPanel(keyOf(rawId));
    const audioIdRaw = getPanelAudioId(panel) || rawId;
    const id = keyOf(audioIdRaw);
    const v = Number(d.value);
    if (!Number.isNaN(v)){
      const st = getState(id);
      st.volume = clamp01(v);
      try { setToyVolume(id, st.volume); } catch {}
      if (panel?.classList?.contains?.('art-toy-panel')) {
        applyArtOwnedVolumeMute(getPanelToyId(panel), { volume: st.volume });
      }
      if (panel && isChainHead(panel) && id !== 'master') {
        applyChainVolumeMute(getPanelToyId(panel), { volume: st.volume });
      }
    }
  });
} catch {}

// On transport pause, invalidate any already-scheduled future notes.
// Otherwise they remain pending while AudioContext is suspended and will double-play after resume.
try {
  document.addEventListener('transport:pause', () => {
    bumpAllToyAudioGen();
    if (window.__AUDIO_GATE_DEBUG) {
      console.log('[audio-gate] transport:pause -> bumpAllToyAudioGen');
    }
  });
} catch {}

export function isToyMuted(id){ return getState(id).muted === true; }
export function toyVolume(id){ return getState(id).volume; }

/**
 * Gate a trigger function so it respects mute policy and publishes toy-hit,
 * while preserving the original trigger signature. Crucially, it forwards
 * the captured toyId to the trigger function as the 4th argument so routing
 * uses the correct per-toy bus (not 'master').
 */
export function gateTriggerForToy(toyId, triggerFn){
  const id = keyOf(toyId);

  // Debug defaults OFF (enable in DevTools: window.__AUDIO_GATE_DEBUG = true)
  try {
    if (window.__AUDIO_GATE_DEBUG === undefined) window.__AUDIO_GATE_DEBUG = false;
    if (window.__AUDIO_GATE_DROP_DEBUG === undefined) window.__AUDIO_GATE_DROP_DEBUG = false;
  } catch {}

  function gateDbg(ev, payload) {
    try {
      if (!window.__AUDIO_GATE_DEBUG) return;
      window.__AUDIO_GATE_DBG = window.__AUDIO_GATE_DBG || { last: new Map() };
      const nowMs = performance?.now?.() ?? Date.now();
      const key = `${ev}:${payload?.id || ''}`;
      const last = window.__AUDIO_GATE_DBG.last.get(key) || 0;
      if ((nowMs - last) < 250) return; // rate limit per toy+event
      window.__AUDIO_GATE_DBG.last.set(key, nowMs);
      console.log('[audio-gate]', ev, payload);
    } catch {}
  }

  return function(inst, noteName, when, ...rest){
    // If the transport paused, AudioContext may be suspended.
    // UI clicks should still audition notes, so resume before any timing/gate logic.
    const ctx = ensureAudioContext();
    const wasSuspended = (ctx && ctx.state === 'suspended');

    // Capture generation at schedule time for future-play checks
    const genAtSchedule = getToyAudioGen(id);

    const run = ()=>{
      // If we just resumed, scheduling “at a past time” can be dropped or be effectively silent.
      // Nudge any provided 'when' to a safe time in the near future.
      if (wasSuspended && Number.isFinite(when)) {
        const now = ensureAudioContext()?.currentTime ?? 0;
        when = Math.max(when, now + 0.001);
      }

      const muted = isToyMuted(id);
      try {
        if (window.__AUDIO_GATE_DEBUG) {
          const now = (() => { try { return ensureAudioContext()?.currentTime; } catch {} return undefined; })();
          console.log('[audio-gate][call]', { id, inst, noteName, when, now, muted, genAtSchedule });
        }
      } catch {}

      if (muted) {
        let shouldAllow = false;
        if (Number.isFinite(when)) {
          try {
            const ctx = ensureAudioContext();
            const now = ctx?.currentTime ?? 0;
            if (Number.isFinite(now) && when > (now + 0.001)) shouldAllow = true;
          } catch {}
        }
        if (!shouldAllow) return; // swallow immediate hits when muted
      } else {
        try { window.dispatchEvent(new CustomEvent('toy-hit', { detail: { id, note: noteName, when } })); } catch {}
      }

      // If scheduled for the future, ALWAYS defer the actual trigger until near play time,
      // then re-check generation. This is what prevents "old chain toy col0" from firing.
      if (Number.isFinite(when) && when > 0) {
        let now = null;
        try {
          const ctx = ensureAudioContext();
          now = ctx?.currentTime;
        } catch {}

        if (Number.isFinite(now) && when > now + 0.001) {
          const delayMs = Math.max(0, (when - now) * 1000 - 2);

          gateDbg('defer', { id, noteName, when, now, delayMs, genAtSchedule });

          const tid = setTimeout(() => {
            // Untrack immediately
            try { __untrackGateTimeout(id, tid); } catch {}

            const genNow = getToyAudioGen(id);
            if (genNow !== genAtSchedule) {
              gateDbg('drop-gen-mismatch', { id, noteName, when, genAtSchedule, genNow });

              // Extra debug (only when enabled)
              try {
                if (window.__AUDIO_GATE_DROP_DEBUG) {
                  console.warn('[audio-gate][drop-gen-mismatch]', { id, inst, noteName, when, genAtSchedule, genNow });
                }
                if (window.__SCHED_MISMATCH_DEBUG) {
                  const lastResumeAt = Number(window.__NOTE_SCHED_LAST_RESUME_AT);
                  const now = ensureAudioContext()?.currentTime ?? 0;
                  if (Number.isFinite(lastResumeAt) && (now - lastResumeAt) < 0.5) {
                    const payload = { id, inst, noteName, when, genAtSchedule, genNow, now };
                    console.warn('[audio-gate][resume-drop] ' + JSON.stringify(payload));
                  }
                }
              } catch {}

              return;
            }
            try { return triggerFn(inst, noteName, when, id, ...rest); } catch (err) { /* noop */ }
          }, delayMs);

          try { __trackGateTimeout(id, tid); } catch {}

          return;
        }
      }

      // Immediate path: check gen right now (still useful for safety)
      const genNow = getToyAudioGen(id);
      if (genNow !== genAtSchedule) {
        gateDbg('drop-immediate-gen-mismatch', { id, noteName, when, genAtSchedule, genNow });
        try {
          if (window.__AUDIO_GATE_DROP_DEBUG) {
            console.warn('[audio-gate][drop-immediate-gen-mismatch]', { id, inst, noteName, when, genAtSchedule, genNow });
          }
          if (window.__SCHED_MISMATCH_DEBUG) {
            const lastResumeAt = Number(window.__NOTE_SCHED_LAST_RESUME_AT);
            const now = ensureAudioContext()?.currentTime ?? 0;
            if (Number.isFinite(lastResumeAt) && (now - lastResumeAt) < 0.5) {
              const payload = { id, inst, noteName, when, genAtSchedule, genNow, now };
              console.warn('[audio-gate][resume-drop-immediate] ' + JSON.stringify(payload));
            }
          }
        } catch {}
        return;
      }

      try {
        const r = triggerFn(inst, noteName, when, id, ...rest);
        try {
          if (window.__AUDIO_GATE_DEBUG) console.log('[audio-gate][pass]', { id, inst, noteName, when, genNow });
        } catch {}
        return r;
      } catch (err) {
        try {
          if (window.__AUDIO_GATE_DROP_DEBUG) console.warn('[audio-gate][trigger-error]', { id, inst, noteName, when, err });
        } catch {}
      }
    };

    // Resume first if needed, then run gate logic.
    if (wasSuspended) {
      try { return resumeAudioContextIfNeeded().then(run).catch(run); } catch { return run(); }
    }
    return run();
  };
}
