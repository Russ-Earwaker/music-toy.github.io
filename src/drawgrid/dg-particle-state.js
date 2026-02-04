// src/drawgrid/dg-particle-state.js
// Particle LOD budgeting for DrawGrid.

export function createDgParticleState({ state, deps } = {}) {
  const s = state || {};
  const d = deps || {};

  function updatePanelParticleState(boardScaleValue, panelVisible) {
    const nowTs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    // Boot grace: on fresh load / restore, allow the particle field to spin up even
    // before any interaction (prevents "no particles until poke").
    try {
      if (!Number.isFinite(s.panel.__dgParticlesWarmBootUntil)) {
        s.panel.__dgParticlesWarmBootUntil = nowTs + 1200;
        // Count as a "poke" too so offscreen culling doesn't block the warm start.
        s.__dgParticlePokeTs = nowTs;
      }
    } catch {}
    const warmBoot = (Number.isFinite(s.panel.__dgParticlesWarmBootUntil) && nowTs < s.panel.__dgParticlesWarmBootUntil);
    const recentPoke = warmBoot || (Number.isFinite(s.__dgParticlePokeTs) && (nowTs - s.__dgParticlePokeTs) <= s.DG_PARTICLE_POKE_GRACE_MS);
    if (!panelVisible && !recentPoke) {
      d.dgParticleBootLog('visibility:skip-offscreen', {
        panelId: s.panel?.id || null,
        panelVisible,
        warmBoot,
        recentPoke,
      });
      s.particleFieldEnabled = false;
      return s.__dgParticleStateCache?.value || null;
    }
    const overviewState = (typeof window !== 'undefined' && window.__overviewMode) ? window.__overviewMode : { isActive: () => false, state: { zoomThreshold: 0.36 } };
    const inOverview = !!overviewState?.isActive?.();
    const visiblePanels = Math.max(0, Number(d.globalDrawgridState?.visibleCount) || 0);
    const hasField = !!s.dgField;
    const cacheKey = `${visiblePanels}|${inOverview ? 1 : 0}|${hasField ? 1 : 0}`;
    if (
      s.__dgParticleStateCache &&
      s.__dgParticleStateCache.key === cacheKey &&
      s.__dgParticleStateCache.hadField === hasField &&
      (nowTs - s.__dgParticleStateCache.ts) < 350
    ) {
      return s.__dgParticleStateCache.value;
    }
    let adaptive = d.getGlobalAdaptiveState();
    if (!adaptive) adaptive = d.updateAdaptiveShared(true);
    const particleBudget = adaptive?.particleBudget;
    const threshold = Number.isFinite(overviewState?.state?.zoomThreshold) ? overviewState.state.zoomThreshold : 0.36;
    const zoomTooWide = Number.isFinite(boardScaleValue) && boardScaleValue < threshold;
    const allowField = !inOverview && !zoomTooWide;
    // Warm boot: ensure particles come up at full density on refresh/creation,
    // even if global adaptive signals are temporarily pessimistic.
    const allowFieldWarm = warmBoot ? true : allowField;
    const fpsSample = Number.isFinite(adaptive?.smoothedFps)
      ? adaptive.smoothedFps
      : (Number.isFinite(adaptive?.fps) ? adaptive.fps : null);
    const emergencyMode = !!adaptive?.emergencyMode;
    // Keep fields on, but thin them out when many panels are visible.
    // Do not vary by focus state so particles feel consistent across panels.
    s.particleFieldEnabled = !!allowFieldWarm;
    d.dgParticleBootLog('state:allow', {
      panelId: s.panel?.id || null,
      inOverview,
      zoomTooWide,
      allowField,
      warmBoot,
      allowFieldWarm,
      particleFieldEnabled: s.particleFieldEnabled,
      visiblePanels,
    });
    s.panel.__dgParticleStateFlags = { inOverview, zoomTooWide };

    if (s.dgField && typeof s.dgField.applyBudget === 'function' && particleBudget) {
      const round = (v) => Math.round((Number.isFinite(v) ? v : 0) * 10000) / 10000;
      const maxCountScaleBase = (particleBudget.maxCountScale ?? 1) * (particleBudget.capScale ?? 1);
      const zoomGesturing = (typeof window !== 'undefined' && window.__mtZoomGesturing === true);
      const zoomGestureMoving = !!(zoomGesturing && s.__lastZoomMotionTs && (nowTs - s.__lastZoomMotionTs) < s.ZOOM_STALL_MS);
      const fpsDamp = (() => {
        if (!Number.isFinite(fpsSample)) return 1;
        if (fpsSample >= 55) return 1;
        if (fpsSample <= 35) return 0.45;
        return 0.45 + ((fpsSample - 35) / 20) * 0.55;
      })();
      const gestureDamp = zoomGestureMoving
        ? (visiblePanels >= 12 ? 0.5 : (visiblePanels >= 6 ? 0.62 : 0.72))
        : 1;
      // Crowd-based attenuation: more visible panels -> fewer particles per panel.
      const crowdScale = (() => {
        const base = 1 / Math.max(1, visiblePanels);
        if (visiblePanels <= 6) return Math.max(0.14, base);
        const minScale =
          visiblePanels >= 36 ? 0.03 :
          visiblePanels >= 24 ? 0.04 :
          visiblePanels >= 16 ? 0.055 :
          0.075;
        return Math.max(minScale, base);
      })();
      // If we're cruising near 60fps with few panels, allow a modest boost above nominal.
      const fpsBoost = (Number.isFinite(fpsSample) && fpsSample >= 58 && visiblePanels <= 2)
        ? Math.min(1.3, 1 + 0.02 * (fpsSample - 58))
        : 1;

      const emergencyScale = emergencyMode ? 0.45 : 1;
      const emergencySize = emergencyMode ? 1.1 : 1;
      const perfDamp = Math.min(fpsDamp, gestureDamp);
      s.panel.__dgParticleKnockbackMul = Math.min(8, 1 / Math.max(0.2, perfDamp));
      if (s.dgField?._config) {
        if (!Number.isFinite(s.panel.__dgFieldBaseReturnSeconds)) {
          s.panel.__dgFieldBaseReturnSeconds = Number(s.dgField._config.returnSeconds) || 2.4;
        }
        if (!Number.isFinite(s.panel.__dgFieldBaseForceMul)) {
          s.panel.__dgFieldBaseForceMul = Number(s.dgField._config.forceMul) || 2.5;
        }
        const baseReturn = s.panel.__dgFieldBaseReturnSeconds;
        const returnMul = Math.min(3, s.panel.__dgParticleKnockbackMul || 1);
        s.dgField._config.returnSeconds = Math.max(0.35, baseReturn / returnMul);
        const baseForce = s.panel.__dgFieldBaseForceMul;
        s.dgField._config.forceMul = Math.min(10, baseForce * (s.panel.__dgParticleKnockbackMul || 1));
      }
      // "Perf panic" = we're overloaded but not necessarily at catastrophic FPS.
      // We respond by shedding particle count quickly (not throttling cadence).
      const __dgCurFpsSample =
        Number.isFinite(fpsSample) ? fpsSample :
        ((typeof window !== 'undefined' && Number.isFinite(window.__MT_SM_FPS)) ? window.__MT_SM_FPS :
        ((typeof window !== 'undefined' && Number.isFinite(window.__MT_FPS)) ? window.__MT_FPS : 60));

      // Perf Lab test harness: drive particle LOD using the forced FPS override
      // (otherwise rAF-based FPS sampling can stay ~60 even when Target FPS is set).
      const __dgFpsOverride =
        (typeof window !== 'undefined' && Number.isFinite(window.__DG_FPS_TEST_OVERRIDE) && window.__DG_FPS_TEST_OVERRIDE > 0)
          ? window.__DG_FPS_TEST_OVERRIDE
          : 0;
      const __dgFpsDriveSample = (__dgFpsOverride > 0) ? __dgFpsOverride : __dgCurFpsSample;

      // Auto quality scale (used by the DPR hook) should also influence particles.
      const __dgAutoQ = (() => { try { return d.getAutoQualityScale?.(); } catch { return 1; } })();
      const __dgAutoQClamped = (Number.isFinite(__dgAutoQ) && __dgAutoQ > 0) ? Math.max(0.05, Math.min(1.0, __dgAutoQ)) : 1;
      // Quality multiplier
      // We want particles to respond like they would in real perf pressure:
      // take the *strongest* reduction signal (i.e. the minimum).
      // - FPS: 30fps => 1, 5fps => ~0.166
      // - AutoQ: global quality scaler (0..1)
      const __dgFpsMul = Math.max(0.05, Math.min(1.0, (__dgFpsDriveSample || 60) / 30));
      const __dgParticleQualityMul = Math.min(__dgAutoQClamped, __dgFpsMul);
      // Persist for renderLoop readout + debug (avoid scope issues).
      try { s.panel.__dgParticleQualityMul = __dgParticleQualityMul; } catch {}
      const perfPanicBase =
        (visiblePanels >= 12 && __dgFpsDriveSample < 45) ||
        (visiblePanels >= 18 && __dgFpsDriveSample < 50) ||
        (__dgFpsDriveSample < 35);
      // When the Quality Lab is forcing a low FPS *for testing*, do NOT treat that as a "panic".
      // We still want to shed particle density, but we should keep the field alive so we can observe behaviour.
      const perfPanic = (!(__dgFpsOverride > 0)) && perfPanicBase;

      const panicScale = perfPanic ? 0.22 : 1;
      let maxCountScale = Math.max(0.0, maxCountScaleBase * crowdScale * fpsBoost * emergencyScale * perfDamp * panicScale * __dgParticleQualityMul);
      let capScale = Math.max(0.0, (particleBudget.capScale ?? 1) * crowdScale * fpsBoost * emergencyScale * perfDamp * panicScale * __dgParticleQualityMul);
      const sizeScale = (particleBudget.sizeScale ?? 1) * emergencySize * (perfDamp < 0.8 ? 1.05 : 1);
      let spawnScale = Math.max(0.0, (particleBudget.spawnScale ?? 1) * crowdScale * fpsBoost * emergencyScale * perfDamp * (perfPanic ? 0.0 : 1) * __dgParticleQualityMul);

      // ---------------------------------------------------------------------
      // Perf Lab test harness behaviour:
      // When Target FPS is forced (e.g. 5fps), we want the field to shed
      // particles rapidly but NOT "freeze" immediately. So keep a small,
      // non-zero minCount and avoid letting cap/max collapse to ~0.
      // ---------------------------------------------------------------------
      const __dgTestFps = (typeof window !== 'undefined' && Number.isFinite(window.__DG_FPS_TEST_OVERRIDE) && window.__DG_FPS_TEST_OVERRIDE > 0)
        ? window.__DG_FPS_TEST_OVERRIDE
        : 0;
      const __dgTestMode = (__dgTestFps > 0) || (__dgFpsOverride > 0);
      if (__dgTestMode) {
        // Keep simulation alive while it fades down.
        maxCountScale = Math.max(maxCountScale, 0.08);
        capScale = Math.max(capScale, 0.08);
        // If we are forcing *very* low FPS for testing, shed density aggressively.
        // (This is about visual verification, not performance rescue.)
        if (__dgFpsDriveSample <= 10) {
          maxCountScale = Math.min(maxCountScale, 0.10);
          capScale = Math.min(capScale, 0.10);
          spawnScale = 0.0;
        }
        // Spawn can still be zero in test mode; we just want existing particles to animate while fading.
        spawnScale = Math.max(0.0, spawnScale);
      }

      // Persist resolved scalars for the tick gate (avoids expensive tick when effectively off).
      s.panel.__dgParticleBudgetMaxCountScale = maxCountScale;
      s.panel.__dgParticleBudgetCapScale = capScale;
      s.panel.__dgParticleBudgetSpawnScale = spawnScale;
      // Keep tick cadence steady for smooth lerps; rely on lower counts for performance.
      const tickModulo = 1;
      // If budgets drop to ~0, fully disable particle SIM for this panel (draw stays smooth).
      // We allow counts to ramp down to zero, then stop ticking the field to avoid per-frame cost.
      //
      // IMPORTANT: In worst-case scenes, the adaptive scalars may not naturally reach ~0,
      // so add a "hard emergency" off-ramp that triggers only when we are clearly overwhelmed
      // (very low FPS + many visible drawgrids). This preserves smoothness (no cadence stepping)
      // while eliminating the expensive dgField.tick() work.
      const __dgCurFps =
        // If the perf lab is forcing a low FPS for testing, don't trip "hard emergency" based on that.
        (__dgFpsOverride > 0 && Number.isFinite(fpsSample)) ? fpsSample :
        ((typeof window !== 'undefined' && Number.isFinite(window.__MT_SM_FPS)) ? window.__MT_SM_FPS :
        ((typeof window !== 'undefined' && Number.isFinite(window.__MT_FPS)) ? window.__MT_FPS : 60));
      const __dgCurFpsDrive = (__dgFpsOverride > 0) ? __dgFpsOverride : __dgCurFps;
      const __dgVisible = Number.isFinite(d.globalDrawgridState?.visibleCount) ? d.globalDrawgridState.visibleCount : 0;
      // "Hard emergency" off-ramp: only used when we are clearly overwhelmed.
      // This should trigger in the perf-lab worst-case scenes so we can fully skip dgField.tick().
      const __dgHardEmergencyOff =
        (__dgCurFpsDrive < 14) || // catastrophic FPS, regardless of count
        (__dgVisible >= 12 && __dgCurFpsDrive < 22) ||
        (__dgVisible >= 20 && __dgCurFpsDrive < 28);

      // -----------------------------------------------------------------------
      // Debug: color the toy by quality (red=low, green=high), throttled
      // Toggle with: window.__DG_STATE_COLOR = true/false
      // -----------------------------------------------------------------------
      try {
        const on = (typeof window !== 'undefined') ? !!window.__DG_STATE_COLOR : false;
        if (!on) {
          if (s.panel.__dgQualColorApplied) {
            s.panel.__dgQualColorApplied = false;
            s.panel.style.outline = '';
            s.panel.style.outlineOffset = '';
          }
        } else {
          const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          const lastTs = Number.isFinite(s.panel.__dgQualColorTs) ? s.panel.__dgQualColorTs : 0;
          if (!lastTs || (now - lastTs) > 250) {
            s.panel.__dgQualColorTs = now;
            const q = __dgParticleQualityMul; // same "testable" quality signal particles now use
            const tier = (q <= 0.40) ? 'low' : (q >= 0.85 ? 'high' : 'med');
            if (tier !== s.panel.__dgQualColorTier) {
              s.panel.__dgQualColorTier = tier;
              s.panel.__dgQualColorApplied = true;
              const col =
                (tier === 'low') ? 'rgba(255, 70, 70, 0.95)' :
                (tier === 'high') ? 'rgba(70, 255, 110, 0.95)' :
                'rgba(255, 190, 70, 0.95)';
              s.panel.style.outline = `3px solid ${col}`;
              s.panel.style.outlineOffset = '-3px';
            }
          }
        }
      } catch {}

      // In test mode, we want "shed density" rather than "freeze/off".
      // Only allow a full off-ramp in true hard emergency (real catastrophic).
      const particlesOffWanted =
        // Never fully turn the field off in Quality Lab test mode; we want to observe behaviour.
        (!__dgTestMode && __dgHardEmergencyOff) ||
        (!__dgTestMode && (maxCountScale < 0.02 && capScale < 0.02 && spawnScale < 0.02)) ||
        !s.particleFieldEnabled;

      if (particlesOffWanted && !s.panel.__dgParticlesOff) {
        s.panel.__dgParticlesOff = true;
        // Ensure the tick gate sees "effectively off" immediately, even before the next adaptive pass.
        s.panel.__dgParticleBudgetMaxCountScale = 0;
        s.panel.__dgParticleBudgetCapScale = 0;
        s.panel.__dgParticleBudgetSpawnScale = 0;
        // Force a final budget apply so any existing particles can fade out quickly.
        s.panel.__dgParticleBudgetKey = '';
        s.dgField.applyBudget({
          maxCountScale: 0,
          capScale: 0,
          sizeScale,
          spawnScale: 0,
          tickModulo,
          minCount: 0,
          emergencyFade: true,
          emergencyFadeSeconds: 1.0,
        });
      } else if (!particlesOffWanted && s.panel.__dgParticlesOff) {
        // Re-enable; normal budget application below will regen naturally.
        s.panel.__dgParticlesOff = false;
        // Clear persisted scalars; they will be repopulated by the normal adaptive budget path.
        s.panel.__dgParticleBudgetMaxCountScale = null;
        s.panel.__dgParticleBudgetCapScale = null;
        s.panel.__dgParticleBudgetSpawnScale = null;
        s.panel.__dgParticleBudgetKey = '';
      }
      // Warm-start: ensure restored and newly created toys start at full density,
      // then quickly converge to the correct density for current FPS.
      try {
        if (!Number.isFinite(s.panel.__dgParticlesWarmStartUntil)) {
          s.panel.__dgParticlesWarmStartUntil = nowTs + 1200;
        }
      } catch {}
      const __dgWarm = (Number.isFinite(s.panel.__dgParticlesWarmStartUntil) && nowTs < s.panel.__dgParticlesWarmStartUntil);
      if (s.panel.__dgParticlesWarmStartActive !== __dgWarm) {
        s.panel.__dgParticlesWarmStartActive = __dgWarm;
        d.dgParticleBootLog('warm-start:state', {
          panelId: s.panel?.id || null,
          warmStart: __dgWarm,
          nowTs,
          until: s.panel.__dgParticlesWarmStartUntil,
        });
      }
      if (__dgWarm) {
        // Force full density during warm start (refresh/create) so particles
        // never boot at "empty" even if adaptive signals are pessimistic.
        maxCountScale = Math.max(1.0, maxCountScale);
        capScale = Math.max(1.0, capScale);
        spawnScale = Math.max(1.0, spawnScale);
      }
      d.dgParticleBootLog('budget:pre-apply', {
        panelId: s.panel?.id || null,
        warmStart: __dgWarm,
        maxCountScale,
        capScale,
        sizeScale,
        spawnScale,
        tickModulo,
        emergencyMode,
        particleFieldEnabled: s.particleFieldEnabled,
      });
      const budgetKey = [
        round(maxCountScale),
        round(capScale),
        round(sizeScale),
        round(spawnScale),
        tickModulo,
        s.__dgLowFpsMode ? 1 : 0,
        emergencyMode ? 1 : 0,
        s.particleFieldEnabled ? 1 : 0,
      ].join('|');
      if (!s.panel.__dgParticlesOff && s.panel.__dgParticleBudgetKey !== budgetKey) {
        s.panel.__dgParticleBudgetKey = budgetKey;
        s.dgField.applyBudget({
          maxCountScale,
          capScale,
          tickModulo,
          sizeScale,
          spawnScale: __dgWarm ? Math.max(spawnScale, 1.0) : spawnScale,
          // When overloaded, shed particle count quickly (still ticking every frame).
          emergencyFade: !!perfPanic || __dgTestMode,
          // In test mode, fade down faster so you see it respond immediately.
          emergencyFadeSeconds: __dgTestMode ? 0.85 : (perfPanic ? 1.1 : 2.2),
          // In test mode, keep a visible floor so the field continues to animate.
          minCount: __dgWarm ? 600 : (__dgTestMode ? 120 : (perfPanic ? 0 : 50)),
        });
        try {
          const st = s.dgField?._state || null;
          d.dgParticleBootLog('budget:state', {
            panelId: s.panel?.id || null,
            particles: Array.isArray(st?.particles) ? st.particles.length : null,
            targetDesired: Number.isFinite(st?.targetDesired) ? st.targetDesired : null,
            minParticles: Number.isFinite(st?.minParticles) ? st.minParticles : null,
            lodScale: Number.isFinite(st?.lodScale) ? st.lodScale : null,
          });
        } catch {}
        try {
          if (__dgWarm) {
            const st = s.dgField?._state || null;
            const needsSeed = !st || !Array.isArray(st.particles) || st.particles.length === 0;
            if (needsSeed && typeof s.dgField?.forceSeed === 'function') {
              const seeded = s.dgField.forceSeed();
              d.dgParticleBootLog('budget:seed', {
                panelId: s.panel?.id || null,
                seeded,
              });
            }
          }
        } catch {}
        d.dgParticleBootLog('budget:applied', {
          panelId: s.panel?.id || null,
          budgetKey,
          warmStart: __dgWarm,
        });

        // -------------------------------------------------------------------
        // IMPORTANT: Some particle-field builds may ignore applyBudget() fields
        // like maxCountScale/tickModulo. To keep the Quality Lab reliable,
        // clamp the internal desired count/config directly as a backstop.
        // (This should preserve the same "fade toward target" behaviour as
        // natural FPS pressure, but ensures the target actually changes.)
        // -------------------------------------------------------------------
        try {
          const st = s.dgField?._state || null;
          const cfg = s.dgField?._config || null;
          // Capture a stable "base" count once, so scaling is consistent.
          if (!Number.isFinite(s.panel.__dgParticlesBaseCount) || s.panel.__dgParticlesBaseCount <= 0) {
            const curCount = Array.isArray(st?.particles) ? st.particles.length : 0;
            const cfgMax =
              Number.isFinite(cfg?.maxCount) ? cfg.maxCount :
              (Number.isFinite(cfg?.maxParticles) ? cfg.maxParticles : 0);
            s.panel.__dgParticlesBaseCount = Math.max(600, cfgMax || curCount || 1200);
          }
          const base = Number(s.panel.__dgParticlesBaseCount) || 1200;
          const minCount = __dgWarm ? 600 : (__dgTestMode ? 120 : (perfPanic ? 0 : 50));
          const desired = Math.max(0, Math.round(Math.max(minCount, base * Math.max(0, maxCountScale))));
          if (st && Number.isFinite(desired)) st.targetDesired = desired;
          if (cfg && Number.isFinite(tickModulo)) cfg.tickModulo = tickModulo;
        } catch {}
      }
    }

    s.__dgParticleStateCache = { key: cacheKey, ts: nowTs, value: adaptive, hadField: hasField };
    return adaptive;
  }

  return {
    updatePanelParticleState,
  };
}
