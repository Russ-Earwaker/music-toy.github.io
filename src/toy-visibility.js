// src/toy-visibility.js
// Generic visibility / culling observer for all toy panels.
// Dispatches `toy:visibility` on panels and logs when panels become visible/hidden.

const VISIBILITY_THRESHOLD = 0.02;
const TOY_CULL_DEBUG = false;
const observed = new WeakSet();

function toRatio(entry) {
  if (!entry) return null;
  const r = entry.intersectionRatio;
  return Number.isFinite(r) ? Number(r.toFixed(3)) : null;
}

function handleEntry(entry) {
  const panel = entry?.target;
  if (!panel) return;
  const visible = !!(entry.isIntersecting && entry.intersectionRatio > VISIBILITY_THRESHOLD);
  const prev = panel.__mtVisible;
  panel.__mtVisible = visible;
  panel.dataset.visible = visible ? '1' : '0';
  try {
    panel.dispatchEvent(new CustomEvent('toy:visibility', {
      bubbles: false,
      detail: { visible, ratio: toRatio(entry) },
    }));
  } catch {}
  if (TOY_CULL_DEBUG && prev !== visible) {
    try {
      console.log('[toy][cull]', {
        id: panel.id || null,
        toy: panel.dataset?.toy || null,
        visible,
        ratio: toRatio(entry),
      });
    } catch {}
  }
}

function attachPanel(panel, observer) {
  if (!panel || observed.has(panel)) return;
  observed.add(panel);
  observer.observe(panel);
  panel.addEventListener('toy:remove', () => {
    try { observer.unobserve(panel); } catch {}
  }, { once: true });
}

function initObserver() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(
    (entries) => entries.forEach(handleEntry),
    { root: null, threshold: [0, VISIBILITY_THRESHOLD, 0.5, 1] }
  );

  const bootstrap = () => {
    document.querySelectorAll('.toy-panel').forEach((panel) => attachPanel(panel, observer));
  };
  bootstrap();

  // Watch for dynamically added toy panels
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes || []) {
        if (node?.classList?.contains?.('toy-panel')) {
          attachPanel(node, observer);
        } else if (node?.querySelectorAll) {
          node.querySelectorAll('.toy-panel').forEach((p) => attachPanel(p, observer));
        }
      }
    }
  });
  mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
}

initObserver();
