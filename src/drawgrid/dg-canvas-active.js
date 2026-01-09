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

  // Map pointer coordinates into the active paint canvas's logical space.
  function pointerToPaintLogical(ev = {}) {
    const state = getState?.() || {};
    const canvas = state.DG_SINGLE_CANVAS
      ? state.frontCanvas
      : ((typeof getActivePaintCanvas === 'function' ? getActivePaintCanvas() : null) || state.frontCanvas);
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect?.();
    const rw = Math.max(1, rect?.width || canvas.clientWidth || state.cssW || canvas.width || 1);
    const rh = Math.max(1, rect?.height || canvas.clientHeight || state.cssH || canvas.height || 1);
    const dpr = (Number.isFinite(state.paintDpr) && state.paintDpr > 0) ? state.paintDpr : 1;
    const lw = state.cssW || (canvas.width / dpr) || rw;
    const lh = state.cssH || (canvas.height / dpr) || rh;
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
