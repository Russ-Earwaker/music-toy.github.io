// src/fullscreen.js
import { resumeAudioContextIfNeeded } from './audio-core.js';

const root = document.documentElement;
const body = document.body;
let   btn  = null;
const appEl = document.getElementById('app') || document.querySelector('.app') || document.body;

function onReady(fn) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    queueMicrotask(fn);
  } else {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
}

// When true, we simulate fullscreen via CSS (iOS Safari fallback)
let pseudo = false;
// Track whether we think we're fullscreen (real or pseudo)
let isFs = false;

const ua = navigator.userAgent || '';
const plat = navigator.platform || '';
const touchCapable = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
const isIpadOSMacUA = ua.includes('Mac OS X') && touchCapable;
const isIOS = /iPad|iPhone|iPod/.test(plat) || /iPad|iPhone|iPod/.test(ua) || isIpadOSMacUA;
const canRealFullscreen = !isIOS && (
  document.fullscreenEnabled || document.webkitFullscreenEnabled || document.msFullscreenEnabled
);

const FS_DEBUG = false;
if (FS_DEBUG) {
  console.log('[FS Detect]', { isIOS, canRealFullscreen, touchCapable });
}

function enterPseudoFullscreen() {
  pseudo = true;
  isFs = true;
  root.classList.add('pseudo-fullscreen');
  appEl.classList.add('fs-active');
  document.documentElement.classList.add('noscroll');
  document.body.classList.add('noscroll');
  window.scrollTo(0, 0);
  setTimeout(() => {
    window.scrollTo(0, 1);
    setTimeout(() => window.scrollTo(0, 0), 30);
  }, 80);
  body.style.transform = 'translateZ(0)'; void body.offsetHeight; body.style.transform = '';
  reflectButtonState(true);
  // ensure canvases relayout
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
  setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
  // If your app exposes a layout hook, call it (no-op if undefined)
  window.BoardLayout?.requestRelayout?.();
}

function exitPseudoFullscreen() {
  isFs = false;
  root.classList.remove('pseudo-fullscreen');
  appEl.classList.remove('fs-active');
  document.documentElement.classList.remove('noscroll');
  document.body.classList.remove('noscroll');
  reflectButtonState(false);
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
  // If your app exposes a layout hook, call it (no-op if undefined)
  window.BoardLayout?.requestRelayout?.();
}

async function enterRealFullscreen() {
  const el = document.documentElement; // or a specific app root container
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else if (el.msRequestFullscreen) await el.msRequestFullscreen();
    isFs = true;
    reflectButtonState(true);
  } catch (e) {
    // If real fullscreen fails, fallback to pseudo
    enterPseudoFullscreen();
  }
}

async function exitRealFullscreen() {
  try {
    if (document.exitFullscreen)      await document.exitFullscreen();
    else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
    else if (document.msExitFullscreen)     await document.msExitFullscreen();
  } finally {
    isFs = false;
    reflectButtonState(false);
  }
}

function reflectButtonState(on) {
  if (!btn) return;
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.title = on ? 'Exit fullscreen' : 'Enter fullscreen';
}

function inRealFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
}

function enterFullscreen() {
  if (canRealFullscreen) {
    enterRealFullscreen();
  } else {
    enterPseudoFullscreen();
  }
  sessionStorage.setItem('app_fs', '1');

  // Fallback if neither real nor pseudo applied within 300ms (iOS quirks)
  setTimeout(() => {
    const inReal = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
    const inPseudo = root.classList.contains('pseudo-fullscreen');
    if (!inReal && !inPseudo) {
      enterPseudoFullscreen();
    }
  }, 300);
}

function exitFullscreen() {
  if (inRealFullscreen()) {
    exitRealFullscreen();
  } else if (pseudo) {
    exitPseudoFullscreen();
  } else {
    isFs = false;
    reflectButtonState(false);
  }
  sessionStorage.removeItem('app_fs');
}

function wireButton() {
  btn = document.getElementById('fullscreenBtn');
  if (!btn) return false;
  if (isIOS) {
    btn.style.display = 'none';
    return true;
  }
  const handler = () => {
    if (isFs || inRealFullscreen()) exitFullscreen();
    else enterFullscreen();
  };
  // replace node to clear any stale listeners
  const clone = btn.cloneNode(true);
  btn.parentNode.replaceChild(clone, btn);
  btn = clone;
  btn.addEventListener('pointerup', handler, { passive: true });
  btn.addEventListener('click', handler, { passive: true });
  return true;
}

onReady(() => {
  if (!wireButton()) {
    const mo = new MutationObserver(() => { if (wireButton()) mo.disconnect(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
});


// Keyboard shortcut on desktop
window.addEventListener('keydown', (e) => {
  if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (isFs || inRealFullscreen()) exitFullscreen();
    else enterFullscreen();
  }
});

// Watch for real fullscreen changes
['fullscreenchange', 'webkitfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
  document.addEventListener(evt, () => {
    const now = inRealFullscreen();
    isFs = now || pseudo;
    reflectButtonState(isFs);
  });
});

// Restore preference (same tab) if user had FS on
window.addEventListener('pageshow', () => {
  const want = sessionStorage.getItem('app_fs') === '1';
  if (!want) return;
  if (canRealFullscreen) {
    if (!inRealFullscreen()) enterRealFullscreen();
  } else {
    if (!pseudo) enterPseudoFullscreen();
  }
});

// Public helpers (optional)
window.__Fullscreen = {
  enter: enterFullscreen,
  exit: exitFullscreen,
  toggle: () => ((isFs || inRealFullscreen()) ? exitFullscreen() : enterFullscreen()),
  isOn: () => isFs || inRealFullscreen(),
};
