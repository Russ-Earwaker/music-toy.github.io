// src/baseMusicToy/toyRelayoutController.js
// Shared relayout plumbing:
// - observe a container element for size changes (ResizeObserver)
// - coalesce changes into at most ONE relayout per animation frame
// - call the toy-provided relayout function (truth-point)
//
// Base philosophy: the toy decides WHAT relayout does; base decides WHEN it runs.

export function createToyRelayoutController({
  panel,
  getContainerEl,
  relayout,
} = {}) {
  const st = {
    _ro: null,
    _pending: false,
    _rafId: 0,
    _lastReason: null,
  };

  function _flush() {
    st._pending = false;
    st._rafId = 0;
    try {
      if (typeof relayout === 'function') relayout({ reason: st._lastReason || 'relayout' });
    } catch {}
  }

  function request(reason = 'relayout') {
    st._lastReason = reason;
    if (st._pending) return;
    st._pending = true;
    try {
      st._rafId = requestAnimationFrame(_flush);
    } catch {
      // Very old / weird environments: just run immediately.
      _flush();
    }
  }

  function start() {
    if (st._ro) return;
    const el = (typeof getContainerEl === 'function') ? getContainerEl() : null;
    if (!el || typeof ResizeObserver !== 'function') return;

    const ro = new ResizeObserver(() => {
      // Important: do NOT call relayout inline (can thrash).
      // Coalesce into RAF.
      request('resize');
    });
    try { ro.observe(el); } catch {}
    st._ro = ro;
  }

  function stop() {
    try { st._ro?.disconnect?.(); } catch {}
    st._ro = null;
    if (st._rafId) {
      try { cancelAnimationFrame(st._rafId); } catch {}
    }
    st._rafId = 0;
    st._pending = false;
  }

  // Safety: stop if panel is detached (avoid holding RO refs).
  function stopIfDetached() {
    try {
      if (panel && !panel.isConnected) stop();
    } catch {}
  }

  return {
    st,
    start,
    stop,
    request,
    stopIfDetached,
  };
}

