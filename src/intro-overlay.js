// src/intro-overlay.js - first-run intro overlay with persistence
const INTRO_SEEN_KEY = 'intro:seen';

const state = {
  overlay: null,
  open: false,
  wired: false,
};

function ensureOverlay() {
  if (state.overlay && state.overlay.isConnected) return state.overlay;

  const overlay = document.createElement('div');
  overlay.id = 'intro-overlay';
  overlay.className = 'intro-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Intro message');
  overlay.innerHTML = `
    <div class="intro-panel">
      <p>Music is maths. This app just helps you find the right numbers.</p>
      <p>Make art, make a mess, or both.</p>
      <p>Experiment, have fun, press buttons.</p>
    </div>
  `;
  document.body.appendChild(overlay);
  state.overlay = overlay;
  return overlay;
}

function readSeen() {
  try {
    return !!localStorage.getItem(INTRO_SEEN_KEY);
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {}
}

function clearSeen() {
  try {
    localStorage.removeItem(INTRO_SEEN_KEY);
  } catch {}
}

function setOpen(open) {
  const overlay = ensureOverlay();
  state.open = !!open;
  overlay.classList.toggle('is-open', state.open);
  overlay.setAttribute('aria-hidden', state.open ? 'false' : 'true');
  document.body.classList.toggle('intro-open', state.open);
}

function dismiss() {
  if (!state.open) return;
  setOpen(false);
  markSeen();
}

function show() {
  setOpen(true);
}

function showIfNeeded() {
  if (readSeen()) return;
  show();
}

function wire() {
  if (state.wired) return;
  const overlay = ensureOverlay();
  overlay.addEventListener('pointerdown', () => dismiss());
  state.wired = true;
}

function init() {
  if (typeof document === 'undefined') return;
  wire();
  showIfNeeded();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

window.IntroOverlay = {
  show,
  showIfNeeded,
  dismiss,
  reset: clearSeen,
  hasSeen: readSeen,
};
