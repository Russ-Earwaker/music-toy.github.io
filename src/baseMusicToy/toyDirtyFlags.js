// src/baseMusicToy/toyDirtyFlags.js
// Shared "dirty / redraw intent" helper.
//
// Base owns:
// - flag storage
// - consistent naming
// - snapshot + consume semantics
//
// Toy owns:
// - what each flag means
// - how flags affect rendering

export function createToyDirtyFlags({
  panel,
  prefix = '__bmDirty',
} = {}) {
  // IMPORTANT:
  // The helper itself is often stored on panel[prefix] (e.g. panel.__lgDirty = helper).
  // So the mutable state must live on a different key to avoid clobbering the helper.
  const stateKey = `${prefix}State`;

  function _ensure() {
    if (!panel[stateKey]) {
      panel[stateKey] = {
        layout: false,
        static: false,
        overlay: false,
        composite: false,
        redraw: false,
        reason: null,
      };
    }
    return panel[stateKey];
  }

  function _mark(flag, reason) {
    const st = _ensure();
    st[flag] = true;
    st.redraw = true;
    if (reason != null) st.reason = reason;
  }

  return {
    markLayoutDirty(reason)   { _mark('layout', reason); },
    markStaticDirty(reason)   { _mark('static', reason); },
    markOverlayDirty(reason)  { _mark('overlay', reason); },
    markCompositeDirty(reason){ _mark('composite', reason); },
    requestRedraw(reason)     { _mark('redraw', reason); },

    // Called by scheduler / render loop
    consume() {
      const st = panel[stateKey];
      if (!st) {
        return {
          layout: false,
          static: false,
          overlay: false,
          composite: false,
          redraw: false,
          reason: null,
        };
      }
      panel[stateKey] = {
        layout: false,
        static: false,
        overlay: false,
        composite: false,
        redraw: false,
        reason: null,
      };
      return st;
    },
  };
}
