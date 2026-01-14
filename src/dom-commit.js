// src/dom-commit.js
// Coalesce DOM writes so render loops can remain "read-only" in rAF.
// Flush runs on a macrotask (setTimeout 0) so class/attr writes happen
// outside the animation frame callback.

const _panelOps = new WeakMap(); // panel -> Map(key -> value)
let _flushScheduled = false;

function _scheduleFlush() {
  if (_flushScheduled) return;
  _flushScheduled = true;
  setTimeout(() => {
    _flushScheduled = false;
    flushDomCommits();
  }, 0);
}

export function queueClassToggle(panel, className, enabled) {
  if (!panel) return;
  let m = _panelOps.get(panel);
  if (!m) {
    m = new Map();
    _panelOps.set(panel, m);
  }
  m.set(`class:${className}`, !!enabled);
  _scheduleFlush();
}

export function queueDatasetSet(panel, key, value) {
  if (!panel) return;
  let m = _panelOps.get(panel);
  if (!m) {
    m = new Map();
    _panelOps.set(panel, m);
  }
  // Stringify like dataset does.
  m.set(`data:${key}`, value == null ? null : String(value));
  _scheduleFlush();
}

export function flushDomCommits() {
  // WeakMap is not iterable. We rely on panels being re-queued frequently.
  // So: for each flush, we snapshot panels via a side-list stored on window.
  const g = (typeof window !== "undefined") ? window : null;
  const list = g?.__MT_DOM_COMMIT_PANELS;
  if (!Array.isArray(list) || list.length === 0) return;

  // Clear list up-front; panels may re-queue during flush.
  g.__MT_DOM_COMMIT_PANELS = [];

  for (const panel of list) {
    try {
      if (!panel || !panel.isConnected) continue;
      const m = _panelOps.get(panel);
      if (!m) continue;

      for (const [k, v] of m.entries()) {
        if (k.startsWith("class:")) {
          const cls = k.slice("class:".length);
          panel.classList.toggle(cls, !!v);
        } else if (k.startsWith("data:")) {
          const dk = k.slice("data:".length);
          if (v == null) {
            try { delete panel.dataset[dk]; } catch {}
          } else {
            try { panel.dataset[dk] = v; } catch {}
          }
        }
      }
      m.clear();
    } catch {}
  }
}

export function markPanelForDomCommit(panel) {
  const g = (typeof window !== "undefined") ? window : null;
  if (!g || !panel) return;
  const list = g.__MT_DOM_COMMIT_PANELS || (g.__MT_DOM_COMMIT_PANELS = []);
  // Avoid duplicates (small list; linear scan is fine)
  for (let i = 0; i < list.length; i++) {
    if (list[i] === panel) return;
  }
  list.push(panel);
}

