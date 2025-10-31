// src/ui-highlights.js
// Manages persistent UI highlight prompts for guide/help controls.

const STORAGE_PREFIX = 'uiHighlight:';
const CLASS_ACTIVE = 'tutorial-pulse-target';
const CLASS_PULSE = 'tutorial-active-pulse';
const CLASS_BORDER = 'tutorial-addtoy-pulse';
const CLASS_FLASH = 'tutorial-flash';

/**
 * @typedef {Object} HighlightEntry
 * @property {string} storageKey
 * @property {string} activeKey
 * @property {string} selector
 * @property {boolean} seen
 * @property {boolean} active
 * @property {HTMLElement|null} el
 * @property {(ev: Event) => void} handler
 * @property {number|null} flashTimer
 */

const entries = {
  guide: {
    storageKey: STORAGE_PREFIX + 'guide',
    selector: '.guide-launcher .guide-toggle, .guide-toggle',
    activeKey: STORAGE_PREFIX + 'guide-active',
    seen: false,
    active: false,
    el: null,
    handler: () => {
      markSeen('guide');
      try {
        window.dispatchEvent(new CustomEvent('guide:highlight-next-task'));
      } catch (e) {
        console.warn('guide:highlight-next-task failed', e);
      }
    },
    flashTimer: null,
  },
  help: {
    storageKey: STORAGE_PREFIX + 'help',
    selector: '.toy-spawner-help',
    activeKey: STORAGE_PREFIX + 'help-active',
    seen: false,
    active: false,
    el: null,
    handler: () => markSeen('help'),
    flashTimer: null,
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

  const lp = window.__LAST_POINTERUP_DIAG__;
  const now = performance?.now?.() ?? Date.now();
  if (lp?.t0 && (now - lp.t0) < 150) {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => applyHighlightClass(entry));
    } else {
      setTimeout(() => applyHighlightClass(entry), 16);
    }
    return;
  }

  const shouldHighlight = entry.active && !entry.seen;
  console.debug('[DIAG] ui-highlight refresh', {
    entry: entry?.storageKey,
    shouldHighlight,
    wasHighlighted: !!entry._highlightVisible,
    lastPointerup: window.__LAST_POINTERUP_DIAG__,
  });
  const wasHighlighted = !!entry._highlightVisible;
  entry._highlightVisible = shouldHighlight;
  if (entry.flashTimer) {
    clearTimeout(entry.flashTimer);
    entry.flashTimer = null;
  }

  if (shouldHighlight) {
    const alreadyActive = el.classList.contains(CLASS_ACTIVE);
    el.classList.add(CLASS_ACTIVE, CLASS_PULSE, CLASS_BORDER);
    if (!alreadyActive && !entry._hasFlashedOnce) {
      el.classList.add(CLASS_FLASH);
      entry._hasFlashedOnce = true;
      entry.flashTimer = setTimeout(() => {
        entry.el?.classList.remove(CLASS_FLASH);
        entry.flashTimer = null;
      }, 360);
    }
    if (!wasHighlighted && entry === entries.guide) {
      try {
        window.dispatchEvent(new CustomEvent('guide:highlight-next-task'));
      } catch (err) {
        console.warn('guide:highlight-next-task dispatch failed', err);
      }
    }
  } else {
    el.classList.remove(CLASS_ACTIVE, CLASS_PULSE, CLASS_BORDER, CLASS_FLASH);
    if (wasHighlighted && entry === entries.guide) {
      try {
        window.dispatchEvent(new CustomEvent('guide:highlight-hide'));
      } catch (err) {
        console.warn('guide:highlight-hide dispatch failed', err);
      }
    }
  }
}

function detachEntry(entry) {
  if (entry.el && entry.handler) {
    entry.el.removeEventListener('click', entry.handler);
  }
  if (entry.flashTimer) {
    clearTimeout(entry.flashTimer);
    entry.flashTimer = null;
  }
  if (entry.el) {
    entry.el.classList.remove(CLASS_ACTIVE, CLASS_PULSE, CLASS_BORDER, CLASS_FLASH);
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
  const guideEntry = entries.guide;
  if (guideEntry) {
    saveSeen(guideEntry, false);
    saveActive(guideEntry, true);
  }
  const helpEntry = entries.help;
  if (helpEntry) {
    saveSeen(helpEntry, true);
    saveActive(helpEntry, false);
    if (helpEntry.el) {
      helpEntry.el.classList.remove(CLASS_ACTIVE, CLASS_PULSE, CLASS_BORDER, CLASS_FLASH);
    }
  }
  scheduleRefresh();
}

function handleAppBoot({ restored, hasSavedPositions } = {}) {
  if (!restored && !hasSavedPositions) {
    highlightForNewScene();
  }
  scheduleRefresh();
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
