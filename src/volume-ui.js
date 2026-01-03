// src/volume-ui.js
import { getToyGain, setToyVolume, setToyMuted, isToyMuted, getToyVolumeRaw } from './audio-core.js';
import { refreshHelpOverlay } from './help-overlay.js';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v)));
const readPersistedMuted = (panel) => {
  const raw = panel?.dataset?.toyMuted;
  if (raw == null) return null;
  const s = String(raw).toLowerCase();
  if (s === '1' || s === 'true') return true;
  if (s === '0' || s === 'false') return false;
  return null;
};
const readPersistedVolume = (panel) => {
  const raw = panel?.dataset?.toyVolume;
  const n = Number(raw);
  return Number.isFinite(n) ? clamp01(n) : null;
};

function updateRangeFill(range) {
  const min = range.min ? parseFloat(range.min) : 0;
  const max = range.max ? parseFloat(range.max) : 100;
  const val = range.value ? parseFloat(range.value) : 0;
  const pct = (max > min) ? ((val - min) / (max - min)) : 0;
  range.style.setProperty('--vol-fill-pct', `${Math.max(0, Math.min(1, pct)) * 100}%`);
}

function setMuteVisualState(muteBtn, muted) {
  muteBtn.setAttribute('aria-pressed', String(muted));
  const title = muted ? 'Unmute' : 'Mute';
  muteBtn.title = title;
  muteBtn.setAttribute('aria-label', title);
  const core = muteBtn.querySelector('.c-btn-core');
  if (core) {
    const iconUrl = muted ? "../assets/UI/T_Mute.png" : "../assets/UI/T_Unmute.png";
    core.style.setProperty('--c-btn-icon-url', `url('${iconUrl}')`);
  }
}

function dispatchToyVolume(toyId, value) {
  try { window.dispatchEvent(new CustomEvent('toy-volume', { detail: { toyId, value } })); } catch {}
}

function dispatchToyMute(toyId, muted) {
  try { window.dispatchEvent(new CustomEvent('toy-mute', { detail: { toyId, muted } })); } catch {}
}

export function syncVolumeUI(panel, { volume, muted } = {}) {
  if (!panel) return;
  const wrap = panel.querySelector('.toy-volwrap');
  if (!wrap) return;
  const range = wrap.querySelector('input[type="range"]');
  const muteBtn = wrap.querySelector('.toy-mute-btn');
  const hasVolume = Number.isFinite(volume);
  const hasMuted = typeof muted === 'boolean';

  if (range) {
    if (hasVolume) {
      const pct = Math.round(clamp01(volume) * 100);
      if (hasMuted && muted) {
        range.dataset.preMute = String(pct);
        range.value = '0';
      } else {
        range.value = String(pct);
        range.dataset.preMute = String(pct);
      }
      updateRangeFill(range);
    } else if (hasMuted && muted) {
      range.value = '0';
      updateRangeFill(range);
    }
  }

  if (muteBtn && hasMuted) {
    setMuteVisualState(muteBtn, muted);
  }
}

/**
 * Creates and wires up a standard volume/mute control block in a toy's footer.
 * @param {HTMLElement} footer The .toy-footer element to append to.
 * @returns {{gain: GainNode}} An object containing the gain node for the toy.
 */
export function installVolumeUI(footer) {
  if (!footer) {
    console.warn('[volume-ui] install failed: no footer element provided.');
    return { gain: getToyGain('master') }; // Fallback
  }

  const panel = footer.closest('.toy-panel');
  const toyId = panel?.dataset?.toyid || panel?.id || 'master';

  // --- 1. Create DOM Elements ---
  let volWrap = footer.querySelector('.toy-volwrap');
  if (!volWrap) {
    volWrap = document.createElement('div');
    volWrap.className = 'toy-volwrap';
    footer.appendChild(volWrap);
  } else {
    volWrap.innerHTML = ''; // Clear existing content to prevent duplicates
  }

  const range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.step = '1';
  range.title = 'Volume';
  range.dataset.helpLabel = 'Adjust volume';
  range.dataset.helpPosition = 'bottom';

  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.className = 'c-btn toy-mute-btn';
  muteBtn.title = 'Mute';
  muteBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>`;
  muteBtn.style.flex = '0 0 auto';
  muteBtn.style.whiteSpace = 'nowrap';
  muteBtn.style.setProperty('--c-btn-size', '42px');

  volWrap.append(range, muteBtn);

  muteBtn.dataset.helpLabel = 'Toggle mute';
  muteBtn.dataset.helpPosition = 'bottom';

  // --- 2. Initialize State ---
  const persistedMuted = readPersistedMuted(panel);
  const persistedVolume = readPersistedVolume(panel);
  const initialMuted = (persistedMuted !== null) ? persistedMuted : isToyMuted(toyId);
  const initialVolume = (persistedVolume !== null) ? persistedVolume : clamp01(getToyVolumeRaw(toyId));

  if (persistedVolume !== null) {
    setToyVolume(toyId, initialVolume);
  }
  if (persistedMuted !== null) {
    setToyMuted(toyId, initialMuted);
  }

  range.value = String(Math.round((initialMuted ? 0 : initialVolume) * 100));
  setMuteVisualState(muteBtn, initialMuted);
  
  // Store a sensible default pre-mute value if the toy starts as muted.
  if (initialMuted) {
    range.dataset.preMute = String(Math.round(initialVolume * 100) || 80);
  }

  // --- 3. Wire Event Listeners ---
  range.addEventListener('input', () => {
    const newVolPercent = parseInt(range.value, 10);
    const newVol = newVolPercent / 100;
    dispatchToyVolume(toyId, newVol);
    setToyVolume(toyId, newVol);
    updateRangeFill(range);
    
    // If user slides volume up, automatically unmute.
    if (newVolPercent > 0 && isToyMuted(toyId)) {
      dispatchToyMute(toyId, false);
      setToyMuted(toyId, false);
      setMuteVisualState(muteBtn, false);
    }
  });

  muteBtn.addEventListener('click', () => {
    const shouldMute = !isToyMuted(toyId);
    dispatchToyMute(toyId, shouldMute);
    setToyMuted(toyId, shouldMute);
    setMuteVisualState(muteBtn, shouldMute);

    if (shouldMute) {
      // Before muting, save the current slider value.
      range.dataset.preMute = range.value;
      range.value = '0';
      updateRangeFill(range);
    } else {
      // On unmute, restore the saved value.
      range.value = range.dataset.preMute || '80';
      const restoreVol = parseInt(range.value, 10) / 100;
      dispatchToyVolume(toyId, restoreVol);
      setToyVolume(toyId, restoreVol);
      updateRangeFill(range);
    }
  });

  // Sync fill once on creation so the bar matches the initial value.
  updateRangeFill(range);

  // --- 4. Return the gain node ---
  refreshHelpOverlay();
  return { gain: getToyGain(toyId) };
}
