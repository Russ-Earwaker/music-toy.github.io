// src/bouncer-stable-boot.js
// Boots bouncers only after the page is ready, without touching your DOM/CSS.

const log = (...a) => console.log('[stable-boot]', ...a);
const warn = (...a) => console.warn('[stable-boot]', ...a);

/**
 * Find a node by id or data-toy-id.
 */
function findNode(id) {
  return document.getElementById(id) || document.querySelector(`[data-toy-id="${id}"]`);
}

/**
 * Ensure the node exists and has non-zero size so canvas boots cleanly.
 */
async function waitForVisibleNode(id, timeoutMs = 1200) {
  const start = performance.now();
  for (;;) {
    const el = findNode(id);
    const ready = el && el.isConnected && el.offsetWidth > 0 && el.offsetHeight > 0;
    if (ready) return el;
    if (performance.now() - start > timeoutMs) throw new Error('[stable-boot] node not stable: ' + id);
    await new Promise(r => requestAnimationFrame(r));
  }
}

/**
 * Boot a single bouncer using whatever signature createBouncer expects.
 */
function bootOne(createBouncer, el, id) {
  // Try common shapes; stop at first success.
  const attempts = [
    () => createBouncer(el, { toyId: id }),
    () => createBouncer({ toyId: id, root: el }),
    () => createBouncer(el),
    () => createBouncer({ root: el }),
    () => createBouncer()
  ];
  for (const tryIt of attempts) {
    try {
      const result = tryIt();
      if (result && (result.element || result.canvas || result.ctx)) {
        log('booted', id, 'variant 1', result);
        return result;
      }
    } catch (e) { /* try next */ }
  }
  // Last resort: just call it and hope for best
  try {
    const r = createBouncer(el);
    log('booted', id, 'variant fallback', r);
    return r;
  } catch (e) {
    warn('failed', id, e);
    return null;
  }
}

/**
 * Boot all bouncers safely.
 */
export async function bootBouncersSafe(ids = (window.BOUNCER_IDS || [])) {
  if (!ids.length) return;
  let mod;
  try {
    mod = await import('./bouncer.main.js');
  } catch (e) {
    // Accept ./src/ when included from a different base
    try { mod = await import('./src/bouncer.main.js'); }
    catch (e2) {
      warn('cannot import bouncer.main.js', e2?.message || e2);
      return;
    }
  }
  const createBouncer = mod?.createBouncer || mod?.default?.createBouncer;
  if (typeof createBouncer !== 'function') {
    warn('createBouncer not found in bouncer.main.js');
    return;
  }

  window.__bouncers = window.__bouncers || {};
  for (const id of ids) {
    try {
      const el = await waitForVisibleNode(id);
      const inst = bootOne(createBouncer, el, id);
      if (inst) window.__bouncers[id] = inst;
    } catch (e) {
      warn('failed', id, e);
    }
  }
}

// Run after load, or immediately if already loaded.
function run() {
  bootBouncersSafe().catch(e => warn('boot error', e));
}
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  queueMicrotask(run);
} else {
  window.addEventListener('load', run, { once: true });
}
