// src/toy-layout-manager.js
// A simple, robust, and modern canvas manager.

(function() {
  if (window.__toyLayoutManager) return;
  window.__toyLayoutManager = true;

  const DPR = () => window.devicePixelRatio || 1;

  function manageCanvas(canvas) {
    // Toys with their own surface managers (e.g. DrawGrid) must opt out.
    // Otherwise this global manager will fight their custom DPR policy.
    try {
      if (canvas?.dataset?.skipAutoDpr === '1') return;
      const panel = canvas?.closest?.('.toy-panel');
      if (panel?.dataset?.toySurfaceManaged === '1') return;
      const role = canvas?.dataset?.role;
      if (role && String(role).startsWith('drawgrid-')) return;
    } catch {}
    if (!canvas || canvas.__layoutManaged) return;
    canvas.__layoutManaged = true;
    let retryRaf = 0;
    let resizeDeferred = false;
    const shouldSkipResize = ()=>{
      try { return !!window.__ZOOM_COMMIT_PHASE; } catch {}
      return false;
    };
    const maybeRetry = ()=>{
      if (retryRaf) return;
      retryRaf = requestAnimationFrame(()=>{
        retryRaf = 0;
        if (!resizeDeferred) return;
        if (shouldSkipResize()) {
          maybeRetry();
          return;
        }
        resizeDeferred = false;
        const rect = canvas.getBoundingClientRect();
        const newWidth = Math.round(rect.width * DPR());
        const newHeight = Math.round(rect.height * DPR());
        if (canvas.width !== newWidth || canvas.height !== newHeight) {
          canvas.width = newWidth;
          canvas.height = newHeight;
        }
      });
    };

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (shouldSkipResize()) {
          resizeDeferred = true;
          maybeRetry();
          continue;
        }
        const rect = entry.target.getBoundingClientRect();
        const newWidth = Math.round(rect.width * DPR());
        const newHeight = Math.round(rect.height * DPR());

        if (canvas.width !== newWidth || canvas.height !== newHeight) {
          canvas.width = newWidth;
          canvas.height = newHeight;
        }
      }
    });
    observer.observe(canvas);
  }

  function managePanel(panel) {
    panel.querySelectorAll('canvas').forEach(manageCanvas);
  }

  function boot() {
    document.querySelectorAll('.toy-panel').forEach(managePanel);
    new MutationObserver(mutations => {
      mutations.forEach(m => m.addedNodes.forEach(n => {
        if (n.nodeType === 1) {
          if (n.matches?.('.toy-panel')) managePanel(n);
          n.querySelectorAll('.toy-panel').forEach(managePanel);
        }
      }));
    }).observe(document.getElementById('board') || document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot, { once: true });

})();

