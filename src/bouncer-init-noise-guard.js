// bouncer-init-noise-guard.js
// Exposes window.bootBouncersSafe(ids) — no autorun, no MutationObserver.
// Minimal logging; debounced; prevents double-booting the same toy.

const BOOTED = (window.__BOOTED_BOUNCERS ||= new Set());
const BUSY = (window.__BOOTING_BOUNCERS ||= new Set());

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
function yieldFrame(){ return new Promise(r=>requestAnimationFrame(()=>r())); }

export async function bootBouncersSafe(ids = []){
  if (!Array.isArray(ids)) ids = [ids].filter(Boolean);
  if (!ids.length) return; // nothing to do
  // ensure shim is present
  if (typeof window.Bouncer?.boot !== 'function') {
    console.warn('[bouncer-init] Bouncer.boot missing — include ./src/bouncer-boot-shim.js before calling bootBouncersSafe');
    return;
  }

  for (const id of ids) {
    if (!id) continue;
    if (BOOTED.has(id)) { /* already up */ continue; }
    if (BUSY.has(id))  { /* currently booting */ continue; }

    const el = document.getElementById(id) || document.querySelector(`[data-toy-id="${id}"]`);
    if (!el) { console.warn('[bouncer-init] missing DOM for', id); continue; }

    BUSY.add(id);
    try {
      // small yield so we don't block first paint
      await yieldFrame();
      const t0 = performance.now();
      const res = await window.Bouncer.boot(id, el);
      const dt = (performance.now() - t0).toFixed(1);
      // Mark as booted if it didn't throw
      BOOTED.add(id);
      console.debug('[bouncer-init] booted', id, `(${dt}ms)`, res || '');
    } catch (e) {
      console.error('[bouncer-init] failed', id, e);
    } finally {
      BUSY.delete(id);
      // give the UI a breather between toys
      await sleep(16);
    }
  }
}

// expose global
window.bootBouncersSafe = bootBouncersSafe;

export default { bootBouncersSafe };
