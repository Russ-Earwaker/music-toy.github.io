// src/volume-ui.js
import { getToyGain, setToyVolume, setToyMuted, isToyMuted, getToyVolume } from './audio-core.js';
import { refreshHelpOverlay } from './help-overlay.js';

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

  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.className = 'toy-btn';
  muteBtn.title = 'Mute';
  muteBtn.textContent = 'Mute';

  volWrap.append(range, muteBtn);

  range.dataset.helpLabel = 'Adjust volume';
  range.dataset.helpPosition = 'bottom';
  muteBtn.dataset.helpLabel = 'Mute';
  muteBtn.dataset.helpPosition = 'bottom';

  // --- 2. Initialize State ---
  const initialMuted = isToyMuted(toyId);
  // getToyVolume() returns 0 if muted, so we can't get the "real" volume.
  // We'll default to 80% if muted, otherwise use the current value.
  const initialVolume = getToyVolume(toyId);
  range.value = String(initialVolume * 100);
  muteBtn.setAttribute('aria-pressed', String(initialMuted));
  muteBtn.textContent = initialMuted ? 'Unmute' : 'Mute';
  
  // Store a sensible default pre-mute value if the toy starts as muted.
  if (initialMuted) {
    range.dataset.preMute = '80';
  }

  // --- 3. Wire Event Listeners ---
  range.addEventListener('input', () => {
    const newVolPercent = parseInt(range.value, 10);
    setToyVolume(toyId, newVolPercent / 100);
    
    // If user slides volume up, automatically unmute.
    if (newVolPercent > 0 && isToyMuted(toyId)) {
      setToyMuted(toyId, false);
      muteBtn.setAttribute('aria-pressed', 'false');
      muteBtn.textContent = 'Mute';
    }
  });

  muteBtn.addEventListener('click', () => {
    const shouldMute = !isToyMuted(toyId);
    setToyMuted(toyId, shouldMute);
    muteBtn.setAttribute('aria-pressed', String(shouldMute));
    muteBtn.textContent = shouldMute ? 'Unmute' : 'Mute';

    if (shouldMute) {
      // Before muting, save the current slider value.
      range.dataset.preMute = range.value;
      range.value = '0';
    } else {
      // On unmute, restore the saved value.
      range.value = range.dataset.preMute || '80';
      setToyVolume(toyId, parseInt(range.value, 10) / 100);
    }
  });

  // --- 4. Return the gain node ---
  refreshHelpOverlay();
  return { gain: getToyGain(toyId) };
}
