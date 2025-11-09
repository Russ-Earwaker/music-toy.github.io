// src/advanced-controls-toggle.js — feature toggle for Advanced controls button
const STORAGE_KEY = 'mt_adv_controls_enabled';
const EVENT_NAME = 'advanced-controls:changed';
const listeners = new Set();

function readInitialState() {
  let queryValue = null;
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.has('adv')) {
      queryValue = params.get('adv');
    } else if (params.has('advanced')) {
      queryValue = params.get('advanced');
    }
    if (queryValue != null) {
      return queryValue !== '0' && queryValue !== 'false';
    }
  } catch {}

  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {}

  return false;
}

let enabled = readInitialState();

function applyBodyClass() {
  const body = document.body;
  if (!body) return;
  body.classList.toggle('advanced-controls-disabled', !enabled);
  body.classList.toggle('advanced-controls-enabled', !!enabled);
}

function ensureBodyClassSync() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBodyClass, { once: true });
  } else {
    applyBodyClass();
  }
}

ensureBodyClassSync();

function emitChange() {
  try {
    applyBodyClass();
    if (!enabled) {
      try {
        if (typeof window.zoomOutPanel === 'function') {
          window.zoomOutPanel();
        }
      } catch {}
      try {
        const panels = typeof document.querySelectorAll === 'function'
          ? document.querySelectorAll('.toy-panel.toy-zoomed')
          : null;
        if (panels && typeof panels.forEach === 'function') {
          panels.forEach((panel) => panel.classList.remove('toy-zoomed'));
        }
      } catch {}
    }
    const detail = { enabled };
    document.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
  } catch {}

  listeners.forEach((fn) => {
    try {
      fn(enabled);
    } catch (err) {
      console.warn('[AdvancedToggle] listener failed', err);
    }
  });
}

export function areAdvancedControlsEnabled() {
  return !!enabled;
}

export function setAdvancedControlsEnabled(next) {
  const nextValue = !!next;
  if (nextValue === enabled) return enabled;
  enabled = nextValue;
  try {
    window.localStorage?.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {}
  emitChange();
  return enabled;
}

export function toggleAdvancedControls() {
  return setAdvancedControlsEnabled(!enabled);
}

export function onAdvancedControlsChange(fn, { immediate = false } = {}) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  if (immediate) {
    try { fn(enabled); } catch {}
  }
  return () => listeners.delete(fn);
}

try {
  window.AdvancedControlsToggle = {
    areAdvancedControlsEnabled,
    setAdvancedControlsEnabled,
    toggleAdvancedControls,
  };
} catch {}
