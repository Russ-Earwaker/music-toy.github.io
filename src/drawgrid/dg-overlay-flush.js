// src/drawgrid/dg-overlay-flush.js
// Flush overlay back buffers to front (size sync + blit).

export function createDgOverlayFlush({ state, deps } = {}) {
  const s = state;
  const d = deps;

  function flushVisualBackBuffersToFront() {
    // IMPORTANT: These visual overlay canvases must match the paint backing-store DPR.
    // If we size them to raw cssW/cssH, they render in a different coordinate space
    // than the paint/particle surfaces, causing post-mount scale/offset glitches.
    const wCss = Math.max(1, Math.round(s.cssW));
    const hCss = Math.max(1, Math.round(s.cssH));
    const w = Math.max(1, Math.round(s.cssW * s.paintDpr));
    const h = Math.max(1, Math.round(s.cssH * s.paintDpr));
    d.FD.layerEvent('flushVisualBackBuffersToFront', {
      panelId: s.panel?.id || null,
      panelRef: s.panel,
      cssW: wCss,
      cssH: hCss,
      pxW: w,
      pxH: h,
      singleCanvas: !!s.DG_SINGLE_CANVAS,
      overlays: !!s.DG_SINGLE_CANVAS_OVERLAYS,
      usingBackBuffers: s.usingBackBuffers,
    });

    // Legacy pin→restore flush (disabled by default; see DG_WRAP_SIZE_FLUSH).
    if (s.DG_WRAP_SIZE_FLUSH && s.pendingWrapSize) {
      try {
        s.wrap.style.width = `${s.pendingWrapSize.width}px`;
        s.wrap.style.height = `${s.pendingWrapSize.height}px`;
      } catch {}
      s.pendingWrapSize = null;
      requestAnimationFrame(() => {
        try {
          s.wrap.style.width = '100%';
          s.wrap.style.height = '100%';
        } catch {}
      });
    }
    // IMPORTANT:
    // Setting canvas.width/height clears its backing store. During gesture settle / commit we
    // may call this even when the size hasn't changed, which would incorrectly wipe overlays
    // like the ghost trail. Only resize when needed.
    //
    // Additionally, if the ghost layer is non-empty and we *must* resize, preserve pixels
    // across the resize so the trail does not "cut out".
    const __ghostNonEmpty = !!(s.panel && s.panel.__dgGhostLayerEmpty === false);
    const __dgResizeCanvasIfNeeded = (c, ww, hh, label, preservePixels = false) => {
      if (!c) return false;
      const curW = c.width || 0;
      const curH = c.height || 0;
      if (curW === ww && curH === hh) return false;

      let snap = null;
      if (preservePixels && curW > 0 && curH > 0) {
        try {
          snap = document.createElement('canvas');
          snap.width = curW;
          snap.height = curH;
          const sctx = snap.getContext('2d');
          if (sctx) sctx.drawImage(c, 0, 0);
        } catch {
          snap = null;
        }
      }

      // Resize (this clears).
      c.width = ww;
      c.height = hh;

      // Restore snapshot scaled into the new backing store.
      if (snap) {
        try {
          const ctx = c.getContext('2d');
          if (ctx) ctx.drawImage(snap, 0, 0, snap.width, snap.height, 0, 0, ww, hh);
        } catch {}
      }

      if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
        try {
          d.dgGhostTrace('canvas:resize', {
            label,
            fromW: curW, fromH: curH,
            toW: ww, toH: hh,
            ghostNonEmpty: __ghostNonEmpty,
            preserved: !!snap,
          });
        } catch {}
      }
      return true;
    };

    __dgResizeCanvasIfNeeded(s.grid,           w, h, 'grid:front',      false);
    __dgResizeCanvasIfNeeded(s.nodesCanvas,    w, h, 'nodes:front',     false);
    __dgResizeCanvasIfNeeded(s.flashCanvas,    w, h, 'flash:front',     false);
    __dgResizeCanvasIfNeeded(s.ghostCanvas,    w, h, 'ghost:front',     __ghostNonEmpty);
    __dgResizeCanvasIfNeeded(s.tutorialCanvas, w, h, 'tutorial:front',  false);

    // Keep back-buffer backing stores in sync too.
    // If back canvases keep stale backing sizes after refresh, overlays can appear
    // to "scale wrong" on subsequent sweeps (e.g. ghost second pass).
    if (s.gridBackCanvas) { __dgResizeCanvasIfNeeded(s.gridBackCanvas, w, h, 'grid:back', false); }
    if (s.nodesBackCanvas) { __dgResizeCanvasIfNeeded(s.nodesBackCanvas, w, h, 'nodes:back', false); }
    if (s.flashBackCanvas) { __dgResizeCanvasIfNeeded(s.flashBackCanvas, w, h, 'flash:back', false); }
    if (s.ghostBackCanvas) { __dgResizeCanvasIfNeeded(s.ghostBackCanvas, w, h, 'ghost:back', __ghostNonEmpty); }
    if (s.tutorialBackCanvas) { __dgResizeCanvasIfNeeded(s.tutorialBackCanvas, w, h, 'tutorial:back', false); }

    if (s.debugCanvas) { __dgResizeCanvasIfNeeded(s.debugCanvas, w, h, 'debug', false); }

    // Only flush back→front when back buffers are active.
    // When usingBackBuffers is false, the front canvases are the source of truth; flushing would
    // clear overlays (like the ghost trail) by copying from an empty/stale back buffer.
    if (!s.usingBackBuffers) return;

    if (s.gridFrontCtx && s.gridBackCanvas) {
      d.R.withDeviceSpace(s.gridFrontCtx, () => {
        const surface = s.gridFrontCtx.canvas;
        const width = surface?.width ?? w;
        const height = surface?.height ?? h;
        s.gridFrontCtx.clearRect(0, 0, width, height);
        s.gridFrontCtx.drawImage(
          s.gridBackCanvas,
          0, 0, s.gridBackCanvas.width, s.gridBackCanvas.height,
          0, 0, width, height
        );
      });
    }

    if (s.nodesFrontCtx && s.nodesBackCanvas) {
      d.R.withDeviceSpace(s.nodesFrontCtx, () => {
        const surface = s.nodesFrontCtx.canvas;
        const width = surface?.width ?? w;
        const height = surface?.height ?? h;
        s.nodesFrontCtx.clearRect(0, 0, width, height);
        s.nodesFrontCtx.drawImage(
          s.nodesBackCanvas,
          0, 0, s.nodesBackCanvas.width, s.nodesBackCanvas.height,
          0, 0, width, height
        );
      });
    }

    if (s.flashFrontCtx && s.flashBackCanvas) {
      d.R.withDeviceSpace(s.flashFrontCtx, () => {
        const surface = s.flashFrontCtx.canvas;
        const width = surface?.width ?? w;
        const height = surface?.height ?? h;
        s.flashFrontCtx.clearRect(0, 0, width, height);
        s.flashFrontCtx.drawImage(
          s.flashBackCanvas,
          0, 0, s.flashBackCanvas.width, s.flashBackCanvas.height,
          0, 0, width, height
        );
      });
    }

    if (s.ghostFrontCtx && s.ghostBackCanvas) {
      d.R.withDeviceSpace(s.ghostFrontCtx, () => {
        const surface = s.ghostFrontCtx.canvas;
        const width = surface?.width ?? w;
        const height = surface?.height ?? h;
        s.ghostFrontCtx.clearRect(0, 0, width, height);
        s.ghostFrontCtx.drawImage(
          s.ghostBackCanvas,
          0, 0, s.ghostBackCanvas.width, s.ghostBackCanvas.height,
          0, 0, width, height
        );
      });
    }

    if (s.tutorialFrontCtx && s.tutorialBackCanvas) {
      d.R.withDeviceSpace(s.tutorialFrontCtx, () => {
        const surface = s.tutorialFrontCtx.canvas;
        const width = surface?.width ?? w;
        const height = surface?.height ?? h;
        s.tutorialFrontCtx.clearRect(0, 0, width, height);
        s.tutorialFrontCtx.drawImage(
          s.tutorialBackCanvas,
          0, 0, s.tutorialBackCanvas.width, s.tutorialBackCanvas.height,
          0, 0, width, height
        );
      });
    }
  }

  return { flushVisualBackBuffersToFront };
}
