export function createActiveCanvasHelpers(getState) {
  function getActivePaintCanvas() {
    const state = getState?.() || {};
    // draw into back when using back-buffers, otherwise front (paint)
    if (state.DG_SINGLE_CANVAS) return state.backCanvas;
    return state.usingBackBuffers ? state.backCanvas : state.frontCanvas; // frontCanvas === paint
  }

  function getActivePaintCtx() {
    const state = getState?.() || {};
    // return the already-created 2D contexts; do not create a fresh context
    if (state.DG_SINGLE_CANVAS) return state.backCtx;
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
    const basis = state.layersRoot || state.wrap || front || null;

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
    return {
      x: Number.isFinite(lx) ? lx : 0,
      y: Number.isFinite(ly) ? ly : 0,
    };
  }

  return {
    getActivePaintCanvas,
    getActivePaintCtx,
    resetPaintBlend,
    pointerToPaintLogical,
  };
}
