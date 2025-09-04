// bouncer-boot-shim.lazy.js
// Lazy version: only imports bouncer.main.js when you actually call boot().
// Adds clear logging and never auto-runs anything.

function resolveNode(toyIdOrEl){
  if (toyIdOrEl instanceof HTMLElement) return toyIdOrEl;
  const id = String(toyIdOrEl || '').trim();
  return document.getElementById(id) || document.querySelector(`[data-toy-id="${id}"]`);
}

async function getCreate(){
  const bm = await import('./bouncer.main.js');
  const create = bm?.createBouncer || bm?.default?.createBouncer;
  if (typeof create !== 'function') {
    throw new Error('[boot-shim] no createBouncer() export found in bouncer.main.js');
  }
  return create;
}

window.Bouncer = {
  async boot(toyIdOrEl, maybeEl){
    const root = resolveNode(maybeEl || toyIdOrEl);
    if (!root) throw new Error('[boot-shim] no DOM node for '+toyIdOrEl);

    const create = await getCreate();

    const attempts = [
      ()=>create(root, { toyId: root.id || root.dataset.toyId }),
      ()=>create({ toyId: root.id || root.dataset.toyId, root }),
      ()=>create(root),
      ()=>create({ root }),
      ()=>create()
    ];

    let lastErr;
    for (const run of attempts){
      try {
        const res = run();
        console.debug('[boot-shim] createBouncer ok');
        return res;
      } catch(e){
        lastErr = e;
        console.debug('[boot-shim] variant failed:', e?.message || e);
      }
    }
    throw lastErr || new Error('[boot-shim] createBouncer() signatures exhausted');
  }
};

export default window.Bouncer;
