// src/drawgrid/dg-particles.js

export function createDgParticles(getState) {
  function initDrawgridParticles() {
    const S = getState();
    // Hard guard: if a previous field exists, nuke it & clear the surface
    if (S.panel.__drawParticles && typeof S.panel.__drawParticles.destroy === 'function') {
      try { S.panel.__drawParticles.destroy(); } catch {}
      S.panel.__drawParticles = null;
    }
    try {
      const ctx = S.particleCanvas.getContext('2d', { alpha: true });
      ctx && ctx.clearRect(0, 0, S.particleCanvas.width, S.particleCanvas.height);
    } catch {}
    try {
      S.particleState.field?.destroy?.();
      S.dgViewport?.refreshSize?.({ snap: true });

      // Read the global particle budget (FPS & device driven).
      const budget = (() => {
        try {
          return S.getParticleBudget();
        } catch {
          return { spawnScale: 1.0, maxCountScale: 1.0 };
        }
      })();

      // Base config values for a "nice" look on fast machines.
      // Use the new getParticleCap() function for toy-count aware scaling.
      const cap = S.getParticleCap(2200);

      // Nudge size slightly with quality so low tiers feel less dense and noisy.
      const baseSize = 1.4;
      const sizePx = baseSize * (0.8 + 0.4 * (budget.spawnScale ?? 1));

      S.particleState.field = S.createField(
        {
          canvas: S.particleCanvas,
          viewport: S.dgViewport,
          pausedRef: S.pausedRef,
        },
        {
          debugLabel: 'drawgrid-particles',
          seed: S.panelSeed,
          cap,
          returnSeconds: 2.4,   // slower settle time so brightness/offsets linger
            // Give pokes some visible impact
            forceMul: 2.5,
            vmaxMul: 6.0,
            noise: 0,
            kick: 0.25,
          kickDecay: 800.0,

          // Restore normal idle particle look (same as Simple Rhythm)
          drawMode: 'dots',
          sizePx,
          minAlpha: 0.25,
          maxAlpha: 0.85,

          // Avoid "stuck" feeling when only a couple DrawGrid panels exist.
          // We only freeze unfocused panels during gestures when the scene is busy.
          isFocusedRef: () => !!S.panel?.classList?.contains('toy-focused'),
          freezeUnfocusedDuringGestureRef: () => {
            return false;
          },
          gestureThrottleRef: () => {
            const visiblePanels = Math.max(0, Number(S.globalDrawgridState?.visibleCount) || 0);
            const now = performance?.now?.() ?? Date.now();
            const moving = !!(S.__lastZoomMotionTs && (now - S.__lastZoomMotionTs) < S.ZOOM_STALL_MS);
            return moving && visiblePanels >= 4;
          },
        }
      );
      window.__dgField = S.particleState.field;
      S.drawgridLog('[DG] field config', S.particleState.field?._config);
      S.dgViewport?.refreshSize?.({ snap: true });
      S.particleState.field?.resize?.();
      try {
        const adaptive = S.getAdaptiveFrameBudget?.();
        const pb = adaptive?.particleBudget;
        if (pb && typeof S.particleState.field.applyBudget === 'function') {
          // IMPORTANT: allow budgets to reach 0 so the main drawgrid loop can
          // ramp particles down smoothly and then fully bypass dgField.tick().
          const maxCountScale = Math.max(0.0, (pb.maxCountScale ?? 1) * (pb.capScale ?? 1));
          S.particleState.field.applyBudget({
            maxCountScale,
            capScale: pb.capScale ?? 1,
            tickModulo: 1,
            sizeScale: pb.sizeScale ?? 1,
            spawnScale: pb.spawnScale ?? 1,
          });
        }
      } catch {}
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try {
          S.dgViewport?.refreshSize?.({ snap: true });
          S.particleState.field?.resize?.();
        } catch {}
      }));
      const logicalSize = S.getToyLogicalSize();
      S.gridAreaLogical.w = logicalSize.w;
      S.gridAreaLogical.h = logicalSize.h;
      S.__auditZoomSizes('init-field');
      S.panel.__drawParticles = S.particleState.field;
    } catch (err) {
      console.warn('[drawgrid] particle field init failed', err);
      S.particleState.field = null;
    }
  }

  function installParticleResizeObserver() {
    const S = getState();
    if (typeof ResizeObserver !== 'undefined') {
      const particleResizeObserver = new ResizeObserver(() => {
        try { S.dgViewport?.refreshSize?.({ snap: true }); } catch {}
        try { S.particleState.field?.resize?.(); } catch {}
      });
      particleResizeObserver.observe(S.wrap);
      S.panel.addEventListener('toy:remove', () => particleResizeObserver.disconnect(), { once: true });
    }
  }

  return { initDrawgridParticles, installParticleResizeObserver };
}
