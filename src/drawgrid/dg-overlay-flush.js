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

    // Sizing is deliberately absent here. Visible canvases are managed by the
    // toy surface manager and offscreen canvases mirror its snapshot during the
    // resize transaction. Flush only copies already-sized presentation data.

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
