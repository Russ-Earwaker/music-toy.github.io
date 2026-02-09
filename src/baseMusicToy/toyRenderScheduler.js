// src/baseMusicToy/toyRenderScheduler.js
// Shared "one RAF for many panels" scheduler.
//
// Base philosophy:
// - base owns WHEN we tick (single RAF, pruning, basic frame context)
// - the toy owns WHAT happens per panel (render logic, visibility, gating)

export function createGlobalPanelScheduler({
  globalKey = '__BM_PANEL_SCHED',
  globalStateKey = '__BM_PANEL_SCHED_STATE',
  onPanel, // (panel, frameCtx) => { visible?: boolean } | boolean | void
} = {}) {
  const g = (typeof window !== 'undefined') ? window : null;
  if (!g) return { panels: new Set(), running: false, start() {}, stop() {} };

  if (g[globalKey]) return g[globalKey];

  const globalState = g[globalStateKey] || (g[globalStateKey] = {
    visibleCount: 0,
    lastVisTs: 0,
  });

  const sched = {
    panels: new Set(),
    running: false,
    frame: 0,
    rafId: 0,
    _chainNotesCache: null,

    start() {
      if (this.running) return;
      this.running = true;

      const tick = () => {
        if (!this.running) return;
        this.frame++;

        // Optional shared cache the toy can use in onPanel (same behavior as LoopGrid had).
        let chainNotesCache = null;
        if (g.__PERF_LOOPGRID_CHAIN_CACHE) {
          this._chainNotesCache ||= new Map();
          this._chainNotesCache.clear();
          chainNotesCache = this._chainNotesCache;
        }

        let toDelete = null;
        let visibleCount = 0;

        const isGesture = !!(g.__ZoomCoordinator?.isGesturing?.() || document.body?.classList?.contains?.('is-gesturing'));

        const frameCtx = {
          frame: this.frame,
          isGesture,
          chainNotesCache,
          globalState,
        };

        for (const panel of this.panels) {
          try {
            if (!panel || !panel.isConnected) {
              (toDelete ||= []).push(panel);
              continue;
            }
            const res = (typeof onPanel === 'function') ? onPanel(panel, frameCtx) : null;

            // Allow a few return shapes:
            // - boolean: visible?
            // - { visible: boolean }
            // - void/other: not counted
            if (res === true) visibleCount++;
            else if (res && typeof res === 'object' && res.visible === true) visibleCount++;
          } catch {}
        }

        if (toDelete) {
          for (const panel of toDelete) this.panels.delete(panel);
        }

        globalState.visibleCount = visibleCount;
        globalState.lastVisTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

        this.rafId = requestAnimationFrame(tick);
      };

      tick.__perfRafTag = 'perf.raf.baseToyScheduler';
      this.rafId = requestAnimationFrame(tick);
    },

    stop() {
      this.running = false;
      try { cancelAnimationFrame(this.rafId); } catch {}
      this.rafId = 0;
    },
  };

  g[globalKey] = sched;
  return sched;
}

