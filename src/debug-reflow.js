// src/debug-reflow.js
// Global instrumentation to spot expensive layout reads that trigger forced reflow warnings.
// Enable/disable via:
//   localStorage.MT_REFLOW_DEBUG = '0'   // off
//   localStorage.MT_REFLOW_DEBUG = '1'   // on
//   window.__MT_REFLOW_DEBUG = false     // off for this session
(() => {
  if (typeof window === 'undefined') return;
  if (window.__MT_REFLOW_PATCHED) return;

  const ENABLED = (() => {
    try {
      if (window.__MT_REFLOW_DEBUG === true) return true;
      const stored = localStorage.getItem('MT_REFLOW_DEBUG');
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch {}
    return false; // default OFF unless explicitly enabled
  })();
  if (!ENABLED) return;

  const THRESH_MS = 4; // log if a layout read takes longer than this

  function logSlow(tag, dt, ctx) {
    if (dt <= THRESH_MS) return;
    try {
      const id = ctx?.id ? `#${ctx.id}` : (ctx?.className ? `.${String(ctx.className).split(' ').join('.')}` : '');
      console.warn('[REFLOW]', tag, `${dt.toFixed(2)}ms`, id || '');
    } catch {}
  }

  function wrapMethod(proto, name, tag) {
    if (!proto || !proto[name]) return;
    const orig = proto[name];
    if (typeof orig !== 'function') return;
    proto[name] = function (...args) {
      const t0 = (performance?.now?.() || Date.now());
      const res = orig.apply(this, args);
      const dt = (performance?.now?.() || Date.now()) - t0;
      logSlow(tag || name, dt, this);
      return res;
    };
  }

  function wrapGetter(proto, prop, tag) {
    if (!proto) return;
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc || typeof desc.get !== 'function') return;
    const origGet = desc.get;
    Object.defineProperty(proto, prop, {
      configurable: true,
      get() {
        const t0 = (performance?.now?.() || Date.now());
        const res = origGet.call(this);
        const dt = (performance?.now?.() || Date.now()) - t0;
        logSlow(tag || prop, dt, this);
        return res;
      },
    });
  }

  wrapMethod(Element.prototype, 'getBoundingClientRect', 'getBoundingClientRect');
  wrapGetter(Element.prototype, 'offsetWidth', 'offsetWidth');
  wrapGetter(Element.prototype, 'offsetHeight', 'offsetHeight');
  wrapGetter(Element.prototype, 'clientWidth', 'clientWidth');
  wrapGetter(Element.prototype, 'clientHeight', 'clientHeight');
  wrapGetter(HTMLElement.prototype, 'offsetLeft', 'offsetLeft');
  wrapGetter(HTMLElement.prototype, 'offsetTop', 'offsetTop');

  window.__MT_REFLOW_PATCHED = true;
})();
