// src/toy-surface-manager.js
// Generic per-toy surface manager for canvas-backed toys.
//
// Design contract:
// - All draw code should use logical CSS pixels.
// - The surface manager pre-scales each 2D context so that 1 unit == 1 CSS pixel.
// - The manager owns backing-store sizing (canvas.width/height) for managed surfaces.
//
// IMPORTANT:
// - This is a *per-instance* manager. Do not store sizing state at module scope.

const __DPR = () => (typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1);

function __clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function __roundPx(v) {
  return Math.max(1, Math.round(v));
}

function __safeGetRect(el) {
  try {
    return el?.getBoundingClientRect?.() || null;
  } catch {
    return null;
  }
}

function __measureCssSize(el) {
  try {
    if (!el) return { w: 0, h: 0 };
    // Prefer layout sizes (not affected by CSS transforms like zoom/pan).
    const cw = el.clientWidth || el.offsetWidth || 0;
    const ch = el.clientHeight || el.offsetHeight || 0;
    if (cw > 0 && ch > 0) return { w: cw, h: ch };
    // Fallback to rect if layout sizes are unavailable.
    const rect = __safeGetRect(el);
    return { w: rect ? rect.width : 0, h: rect ? rect.height : 0 };
  } catch {
    return { w: 0, h: 0 };
  }
}

/**
 * Create a per-toy surface manager.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.panel - The toy panel.
 * @param {HTMLElement} opts.body  - The toy body (visual wrap) element.
 * @param {() => number} [opts.getBoardScale] - Optional: board zoom/scale for DPR policy.
 * @param {string} [opts.tag] - Debug tag.
 */
export function createToySurfaceManager({ panel, body, getBoardScale = null, tag = 'toy' } = {}) {
  if (!panel || !body) {
    throw new Error('createToySurfaceManager requires {panel, body}');
  }

  // Mark the panel so any global auto-DPR systems can opt out.
  try {
    panel.dataset.toySurfaceManaged = '1';
  } catch {}

  const surfaces = new Map(); // name -> { canvas, policy }

  // Current applied sizing
  let cssW = 0;
  let cssH = 0;
  let dpr = 1;
  let targetW = 0;
  let targetH = 0;

  // Resize scheduling
  let raf = 0;
  let lastReason = '';

  // Simple default DPR policy:
  // - clamp to [0.5..devicePixelRatio]
  // - allow callers to override by calling setDprPolicy
  let dprPolicy = ({ cssW, cssH, boardScale }) => {
    void cssW; void cssH;
    const base = __DPR();
    // When zoomed far out, allow lowering DPR a bit by default.
    const bs = (Number.isFinite(boardScale) && boardScale > 0) ? boardScale : 1;
    const mul = (bs < 0.6) ? __clamp(bs / 0.6, 0.6, 1) : 1;
    return __clamp(base * mul, 0.5, base);
  };

  function setDprPolicy(fn) {
    if (typeof fn === 'function') dprPolicy = fn;
  }

  // policy:
  // - 'managed' => manager owns backing-store (width/height) + ctx transform
  // - 'css'     => manager only applies CSS size, caller owns backing-store
  function registerCanvas(name, canvas, { policy = 'managed' } = {}) {
    if (!name || !canvas) return;
    surfaces.set(String(name), { canvas, policy });
    // Mark canvas so any global auto-DPR systems can opt out.
    try {
      canvas.dataset.skipAutoDpr = '1';
      canvas.dataset.toySurface = tag;
    } catch {}
  }

  function __applyCanvasCss(canvas, cssW, cssH) {
    try {
      if (!canvas || !canvas.style) return;
      // Avoid repeated style churn.
      if (canvas.__tsmCssW === cssW && canvas.__tsmCssH === cssH) return;
      canvas.__tsmCssW = cssW;
      canvas.__tsmCssH = cssH;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    } catch {}
  }

  function __applyCanvas2D(canvas, cssW, cssH, dpr) {
    __applyCanvasCss(canvas, cssW, cssH);
    const pxW = __roundPx(cssW * dpr);
    const pxH = __roundPx(cssH * dpr);
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Logical px contract: 1 unit == 1 CSS pixel.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  // Apply a caller-chosen sizing + DPR to all registered surfaces.
  // This is the bridge for complex toys that already compute DPR (like DrawGrid),
  // but want a single consistent sizing/transform applier.
  function applyExplicit(nextCssW, nextCssH, nextDpr) {
    const w = __roundPx(nextCssW);
    const h = __roundPx(nextCssH);
    if (w <= 0 || h <= 0) return false;
    const nd = Number.isFinite(nextDpr) ? nextDpr : __DPR();
    const dd = __clamp(nd, 0.25, Math.max(0.25, __DPR()));

    lastReason = 'explicit';
    const changed = (w !== cssW) || (h !== cssH) || (Math.abs(dd - dpr) > 1e-6);

    cssW = w;
    cssH = h;
    dpr = dd;
    targetW = __roundPx(cssW * dpr);
    targetH = __roundPx(cssH * dpr);

    surfaces.forEach(({ canvas, policy }) => {
      if (!canvas) return;
      if (policy === 'managed') {
        __applyCanvas2D(canvas, cssW, cssH, dpr);
      } else if (policy === 'css') {
        __applyCanvasCss(canvas, cssW, cssH);
      }
    });
    return changed;
  }

  function syncNow(reason = 'sync') {
    lastReason = String(reason || 'sync');
    const size = __measureCssSize(body);
    const nextCssW = size ? __roundPx(size.w) : 0;
    const nextCssH = size ? __roundPx(size.h) : 0;
    if (nextCssW <= 0 || nextCssH <= 0) return false;

    const bs = (typeof getBoardScale === 'function') ? getBoardScale() : 1;
    const nextDpr = dprPolicy({ cssW: nextCssW, cssH: nextCssH, boardScale: bs });
    const nextTargetW = __roundPx(nextCssW * nextDpr);
    const nextTargetH = __roundPx(nextCssH * nextDpr);

    const changed = (nextCssW !== cssW) || (nextCssH !== cssH) || (nextTargetW !== targetW) || (nextTargetH !== targetH);

    cssW = nextCssW;
    cssH = nextCssH;
    dpr = nextDpr;
    targetW = nextTargetW;
    targetH = nextTargetH;

    // Apply to managed canvases
    surfaces.forEach(({ canvas, policy }) => {
      if (!canvas) return;
      if (policy === 'managed') {
        __applyCanvas2D(canvas, cssW, cssH, dpr);
      }
    });
    return changed;
  }

  function requestSync(reason = 'sync') {
    lastReason = String(reason || 'sync');
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      syncNow(lastReason);
    });
  }

  function debugDump() {
    const rows = [];
    surfaces.forEach(({ canvas, policy }, name) => {
      const rect = __safeGetRect(canvas);
      rows.push({
        name,
        policy,
        cssW: rect ? Math.round(rect.width) : null,
        cssH: rect ? Math.round(rect.height) : null,
        w: canvas?.width,
        h: canvas?.height,
        effectiveDpr: rect && rect.width ? (canvas.width / rect.width) : null,
        role: canvas?.dataset?.role || null,
      });
    });
    return {
      tag,
      reason: lastReason,
      cssW,
      cssH,
      dpr,
      targetW,
      targetH,
      surfaces: rows,
    };
  }

  // Install a ResizeObserver on the body. We coalesce work to rAF.
  let ro = null;
  try {
    ro = new ResizeObserver(() => {
      // Avoid resizing during zoom-commit if your app uses that flag.
      try {
        if (window.__ZOOM_COMMIT_PHASE) {
          requestSync('ro-defer-zoom');
          return;
        }
      } catch {}
      requestSync('ro');
    });
    ro.observe(body);
  } catch {}

  function destroy() {
    try { if (ro) ro.disconnect(); } catch {}
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    surfaces.clear();
  }

  return {
    registerCanvas,
    setDprPolicy,
    requestSync,
    syncNow,
    applyExplicit,
    debugDump,
    destroy,
    // Expose current sizing for callers that still compute geometry elsewhere
    getCssW: () => cssW,
    getCssH: () => cssH,
    getDpr: () => dpr,
  };
}
