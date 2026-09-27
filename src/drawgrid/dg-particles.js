// src/drawgrid/dg-particles.js

export function createDgParticles(getState) {
  function initDrawgridParticles() {
    const S = getState();
    const bootLog = (tag, data = null) => {
      try {
        if (typeof window === 'undefined' || !window.__DG_PARTICLE_BOOT_DEBUG) return;
        const payload = data || {};
        console.log(`[DG][particles] ${tag}`, JSON.stringify(payload));
      } catch {}
    };
    bootLog('init:start', { panelId: S.panel?.id || null });
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

      // Read the global particle budget (FPS & device driven).
      const budget = (() => {
        try {
          return S.getParticleBudget();
        } catch {
          return { spawnScale: 1.0, maxCountScale: 1.0 };
        }
      })();

      // DrawGrid quality profile (tier -> particle budget).
      const qProfile = (() => {
        try {
          const isFocused = !!S.panel?.classList?.contains('toy-focused');
          return (typeof S.getQualityProfile === 'function')
            ? S.getQualityProfile({ isFocused, isInteracting: false })
            : null;
        } catch { return null; }
      })();

      // Base config values for a "nice" look on fast machines.
      // Use the new getParticleCap() function for toy-count aware scaling.
      const cap = S.getParticleCap(2200);

      // Nudge size slightly with quality so low tiers feel less dense and noisy.
      const baseSize = 1.4;
      const sizePx = baseSize * (0.8 + 0.4 * (budget.spawnScale ?? 1));

      S.particleState.field = S.createGenericParticleField(
        {
          bounds: S.particleBounds,
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

        }
      );
      window.__dgField = S.particleState.field;
      S.drawgridLog('[DG] field config', S.particleState.field?._config);
      bootLog('init:field-ready', {
        panelId: S.panel?.id || null,
        cap,
        sizePx,
      });
      try {
        const seeded = S.particleState.field?.forceSeed?.();
        bootLog('init:seed', { panelId: S.panel?.id || null, seeded });
      } catch {}
      try {
        const adaptive = S.getAdaptiveFrameBudget?.();
        const pb = adaptive?.particleBudget;
        if (pb && typeof S.particleState.field.applyBudget === 'function') {
          // IMPORTANT: allow budgets to reach 0 so the main drawgrid loop can
          // ramp particles down smoothly and then fully bypass field stepping.
          let maxCountScale = Math.max(0.0, (pb.maxCountScale ?? 1) * (pb.capScale ?? 1));
          let sizeScale = pb.sizeScale ?? 1;
          let spawnScale = pb.spawnScale ?? 1;

          // Apply DrawGrid quality tier adjustments.
          if (qProfile) {
            const qm = Number.isFinite(qProfile.particleMul) ? qProfile.particleMul : 1;
            maxCountScale *= qm;
            spawnScale *= qm;
            sizeScale *= (0.9 + 0.1 * qm);
            if (qProfile.allowParticles === false) {
              maxCountScale = 0;
              spawnScale = 0;
            }
          }

          S.particleState.field.applyBudget({
            maxCountScale,
            capScale: pb.capScale ?? 1,
            tickModulo: 1,
            sizeScale,
            spawnScale,
          });
        }
      } catch {}
      S.__auditZoomSizes('init-field');
      S.panel.__drawParticles = S.particleState.field;
      bootLog('init:done', { panelId: S.panel?.id || null });
    } catch (err) {
      console.warn('[drawgrid] particle field init failed', err);
      S.particleState.field = null;
    }
  }

  function renderDrawgridParticles() {
    const S = getState();
    const field = S.particleState.field;
    if (!field || !S.particleCanvas) return;
    const displayWidth = Math.max(1, S.dgSurfaces?.getCssW?.() || S.particleCanvas.clientWidth || 1);
    const displayHeight = Math.max(1, S.dgSurfaces?.getCssH?.() || S.particleCanvas.clientHeight || 1);
    const dpr = Math.max(0.25, S.dgSurfaces?.getDpr?.() || 1);
    const viewport = S.createParticleViewportSpace({ width: displayWidth, height: displayHeight, backingScale: dpr });
    const ctx = S.particleCanvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    ctx.translate(viewport.contentRect.left, viewport.contentRect.top);
    ctx.scale(viewport.presentationScale, viewport.presentationScale);
    field.render(ctx);
  }

  return { initDrawgridParticles, renderDrawgridParticles };
}
