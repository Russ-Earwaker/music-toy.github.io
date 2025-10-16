// src/ui-highlights.js
// Manages persistent UI highlight prompts for guide/help controls.

const STORAGE_PREFIX = 'uiHighlight:';
const CLASS_ACTIVE = 'ui-highlighted';
const CLASS_PULSE = 'ui-highlight-pulse';

/**
 * @typedef {Object} HighlightEntry
 * @property {string} storageKey
 * @property {string} activeKey
 * @property {string} selector
 * @property {boolean} seen
 * @property {boolean} active
 * @property {HTMLElement|null} el
 * @property {(ev: Event) => void} handler
 */

const entries = {
  guide: {
    storageKey: STORAGE_PREFIX + 'guide',
    selector: '.guide-launcher .guide-toggle, .guide-toggle',
    activeKey: STORAGE_PREFIX + 'guide-active',
    seen: false,
    active: false,
    el: null,
    handler: () => markSeen('guide'),
  },
  help: {
    storageKey: STORAGE_PREFIX + 'help',
    selector: '.toy-spawner-help',
    activeKey: STORAGE_PREFIX + 'help-active',
    seen: false,
    active: false,
    el: null,
    handler: () => markSeen('help'),
  },
};

function loadSeenFlags() {
  Object.values(entries).forEach((entry) => {
    try {
      entry.seen = window.localStorage.getItem(entry.storageKey) === '1';
    } catch {
      entry.seen = false;
    }
  });
}

function loadActiveFlags() {
  Object.values(entries).forEach((entry) => {
    let isActive = false;
    try {
      isActive = window.localStorage.getItem(entry.activeKey) === '1';
    } catch {
      isActive = false;
    }
    entry.active = isActive && !entry.seen;
  });
}

function saveSeen(entry, seen) {
  entry.seen = !!seen;
  try {
    if (entry.seen) {
      window.localStorage.setItem(entry.storageKey, '1');
    } else {
      window.localStorage.removeItem(entry.storageKey);
    }
  } catch {
    // ignore storage errors
  }
}

function saveActive(entry, active) {
  const shouldStore = active && !entry.seen;
  try {
    if (shouldStore) {
      window.localStorage.setItem(entry.activeKey, '1');
    } else {
      window.localStorage.removeItem(entry.activeKey);
    }
  } catch {
    // ignore storage errors
  }
  entry.active = shouldStore;
}

function applyHighlightClass(entry) {
  const el = entry.el;
  if (!el) return;

  const shouldHighlight = entry.active && !entry.seen;
  el.classList.toggle(CLASS_ACTIVE, shouldHighlight);
  el.classList.toggle(CLASS_PULSE, shouldHighlight);
}

function detachEntry(entry) {
  if (entry.el && entry.handler) {
    entry.el.removeEventListener('click', entry.handler);
  }
  entry.el = null;
}

function attachEntry(entry, el) {
  if (!el) {
    detachEntry(entry);
    return;
  }
  if (entry.el === el) {
    applyHighlightClass(entry);
    return;
  }
  detachEntry(entry);
  entry.el = el;
  if (entry.handler) {
    el.addEventListener('click', entry.handler, { passive: true });
  }
  applyHighlightClass(entry);
}

function queryTargets() {
  Object.values(entries).forEach((entry) => {
    const el = document.querySelector(entry.selector);
    attachEntry(entry, /** @type {HTMLElement|null} */ (el));
  });
}

let refreshScheduled = false;
function scheduleRefresh() {
  if (refreshScheduled) return;
  refreshScheduled = true;
  const refresh = () => {
    refreshScheduled = false;
    queryTargets();
  };
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(refresh);
  } else {
    setTimeout(refresh, 32);
  }
}

function ensureObserver() {
  try {
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
    });
  } catch {
    // fallback: poll occasionally if MutationObserver unavailable
    setInterval(scheduleRefresh, 800);
  }
}

function setActive(key, active) {
  const entry = entries[key];
  if (!entry) return;
  const nextActive = !!active && !entry.seen;
  saveActive(entry, nextActive);
  applyHighlightClass(entry);
}

function markSeen(key) {
  const entry = entries[key];
  if (!entry || entry.seen) return;
  saveSeen(entry, true);
  saveActive(entry, false);
  applyHighlightClass(entry);
}

function highlightForNewScene() {
  setActive('guide', true);
  setActive('help', true);
}

function handleAppBoot({ restored, hasSavedPositions } = {}) {
  if (!restored && !hasSavedPositions) {
    highlightForNewScene();
  } else {
    scheduleRefresh();
  }
}

loadSeenFlags();
loadActiveFlags();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    queryTargets();
    ensureObserver();
  }, { once: true });
} else {
  queryTargets();
  ensureObserver();
}

scheduleRefresh();

const API = {
  onNewScene() {
    highlightForNewScene();
    scheduleRefresh();
  },
  onAppBoot(details) {
    handleAppBoot(details || {});
  },
  markSeen,
  refresh: scheduleRefresh,
};

try {
  window.UIHighlights = Object.assign(window.UIHighlights || {}, API);
} catch {
  // ignore if window is not writable
}
