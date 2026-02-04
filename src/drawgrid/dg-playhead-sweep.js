// src/drawgrid/dg-playhead-sweep.js
// Frame-start playhead sweep handling for header disturbances.

export function createDgPlayheadSweep({ state, deps } = {}) {
  const s = state;
  const d = deps;

  function headerProgress() {
    try {
      const li = (typeof d.getLoopInfo === 'function') ? (d.getLoopInfo() || {}) : {};
      if (Number.isFinite(li.progress)) return li.progress;
      if (Number.isFinite(li.phase01)) return li.phase01;
      if (Number.isFinite(li.step) && Number.isFinite(li.steps) && li.steps > 0) {
        const steps = Math.max(1, li.steps);
        return ((li.step || 0) % steps) / steps;
      }
      const bpmSafe = Math.max(30, Math.min(200, Number.isFinite(s.bpm) ? s.bpm : 120));
      const stepCount = Math.max(1, s.currentCols || s.initialCols || 8);
      const loopSeconds = (60 / bpmSafe) * stepCount;
      if (!Number.isFinite(loopSeconds) || loopSeconds <= 0) return null;
      const nowMs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      const t = nowMs / 1000;
      return (t % loopSeconds) / loopSeconds;
    } catch {
      return null;
    }
  }

  function install() {
    if (typeof d.onFrameStart !== 'function') return null;
    s.unsubscribeFrameStart?.();
    const unsubscribe = d.onFrameStart((camState) => {
      d.setOverlayCamState?.(camState);
      try {
        if (!d.isRunning?.()) return;
        if (!s.isActiveInChain) return;
        const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        if (s.panel.__dgPlayheadLastRenderTs && (now - s.panel.__dgPlayheadLastRenderTs) < 24) {
          return;
        }
        const prog = headerProgress();
        if (!Number.isFinite(prog)) return;
        const clampedProgress = Math.max(0, Math.min(1, prog));
        const area = (s.gridArea && s.gridArea.w > 0 && s.gridArea.h > 0)
          ? s.gridArea
          : { x: 0, y: 0, w: s.cssW || 0, h: s.cssH || 0 };
        const usableWidth = area?.w || 0;
        if (!Number.isFinite(usableWidth) || usableWidth <= 0) return;
        const startX = area?.x || 0;
        const xToy = startX + clampedProgress * usableWidth;
        d.pushHeaderSweepAt(xToy);
      } catch {}
    });
    return unsubscribe;
  }

  return { headerProgress, install };
}
