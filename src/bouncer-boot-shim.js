// bouncer-boot-shim.js
// Creates window.Bouncer.boot() from whatever bouncer.main.js exports.
// No side effects besides defining window.Bouncer.

const bm = await import('./bouncer.main.js').catch(e=>{
  console.error('[boot-shim] failed to import bouncer.main.js', e);
  return {};
});

const create = bm?.createBouncer || bm?.default?.createBouncer;
if (typeof create !== 'function') {
  console.warn('[boot-shim] no createBouncer() export found in bouncer.main.js');
}

function resolveNode(toyIdOrEl){
  if (toyIdOrEl instanceof HTMLElement) return toyIdOrEl;
  const id = String(toyIdOrEl || '').trim();
  return document.getElementById(id) || document.querySelector(`[data-toy-id="${id}"]`);
}

window.Bouncer = {
  boot(toyIdOrEl, maybeEl){
    const root = resolveNode(maybeEl || toyIdOrEl);
    if (!root) throw new Error('[boot-shim] no DOM node for '+toyIdOrEl);
    // try a few common signatures
    const attempts = [
      ()=>create(root, { toyId: root.id || root.dataset.toyId }),
      ()=>create({ toyId: root.id || root.dataset.toyId, root }),
      ()=>create(root),
      ()=>create({ root }),
      ()=>create()
    ];
    let lastErr;
    for (const run of attempts){
      try { return run(); } catch(e){ lastErr = e; }
    }
    throw lastErr || new Error('[boot-shim] createBouncer() signatures exhausted');
  }
};
export default window.Bouncer;
