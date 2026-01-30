export function createActiveCanvasHelpers(getState) {
  function getActivePaintCanvas() {
    const state = getState?.() || {};
    // draw into back when using back-buffers, otherwise front (paint)
    if (state.DG_SINGLE_CANVAS) {
      // Prefer the visible front canvas when not using back buffers.
      if (!state.usingBackBuffers && state.frontCanvas) return state.frontCanvas;
      return state.backCanvas;
    }
    return state.usingBackBuffers ? state.backCanvas : state.frontCanvas; // frontCanvas === paint
  }

  function getActivePaintCtx() {
    const state = getState?.() || {};
    // return the already-created 2D contexts; do not create a fresh context
    if (state.DG_SINGLE_CANVAS) {
      if (!state.usingBackBuffers && state.frontCtx) return state.frontCtx;
      return state.backCtx;
    }
    return state.usingBackBuffers ? state.backCtx : state.frontCtx;
  }

  function resetPaintBlend(ctx) {
    if (!ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // Map pointer coordinates into the paint canvas's logical space.
  //
  // IMPORTANT:
  // - The "active" drawing surface may be an offscreen/back buffer (display:none).
  // - Pointer events should be mapped using a stable on-screen element (layersRoot/wrap/frontCanvas),
  //   otherwise rect.width/height can be 0 and all pointer coords collapse to (0,0) after refresh.
  function pointerToPaintLogical(ev = {}) {
    const state = getState?.() || {};
    const front = state.frontCanvas || null; // the on-screen paint canvas element
    // Prefer the visible canvas (front) or wrap, which reflect board zoom transforms.
    // layersRoot can be untransformed in some layouts and will mis-map pointers when zoomed.
    const basis = front || state.wrap || state.layersRoot || null;

    const rect = basis?.getBoundingClientRect?.();
    const rw = Math.max(1, rect?.width || basis?.clientWidth || state.cssW || front?.clientWidth || 1);
    const rh = Math.max(1, rect?.height || basis?.clientHeight || state.cssH || front?.clientHeight || 1);

    const dpr = (Number.isFinite(state.paintDpr) && state.paintDpr > 0) ? state.paintDpr : 1;
    const lw = state.cssW || ((front?.width ?? 0) / dpr) || rw;
    const lh = state.cssH || ((front?.height ?? 0) / dpr) || rh;

    const clientX = ev?.clientX ?? ev?.x ?? 0;
    const clientY = ev?.clientY ?? ev?.y ?? 0;
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;

    const lx = (clientX - left) * (lw / rw);
    const ly = (clientY - top) * (lh / rh);
    const out = {
      x: Number.isFinite(lx) ? lx : 0,
      y: Number.isFinite(ly) ? ly : 0,
    };
    try {
      if (typeof window !== 'undefined' && window.__DG_POINTER_TRACE) {
        out.__dbg = {
          basisTag: basis?.tagName ? String(basis.tagName).toLowerCase() : null,
          basisRole: basis?.getAttribute?.('data-role') || null,
          basisClass: (basis?.className && typeof basis.className === 'string') ? basis.className : null,
          rect: rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null,
          rw,
          rh,
          lw,
          lh,
          left,
          top,
        };
      }
    } catch {}
    return out;
  }

  return {
    getActivePaintCanvas,
    getActivePaintCtx,
    resetPaintBlend,
    pointerToPaintLogical,
  };
}
