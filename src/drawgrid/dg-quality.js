// src/drawgrid/dg-quality.js
// Per-panel DrawGrid quality profile (tier -> flags + multipliers).
//
// This is intentionally small and explicit:
// - It does NOT implement the global budget manager yet.
// - It provides the plumbing DrawGrid needs: tier storage, derived flags,
//   and a single resScale multiplier that can be applied to backing-store DPR.
//
// Tiers (spec):
//   3 = full
//   2 = light degrade
//   1 = medium degrade (specials + particles off)
//   0 = low but alive (specials + particles off; lower resScale)
//  -1 = emergency
//
// Note: cadence control (drawHz) is part of the spec but is NOT enforced here yet.
// We expose desired drawHz so the render loop can adopt it in a later patch.

export function createDgQuality({ panel, nowMs }) {
  const state = {
    tier: 3,
    // Stable per-panel hysteresis: last set time to avoid accidental rapid changes.
    lastSetMs: 0,
  };

  function clampTier(t) {
    const n = Number(t);
    if (!Number.isFinite(n)) return 3;
    if (n <= -1) return -1;
    if (n >= 3) return 3;
    return (n | 0);
  }

  function setTier(tier, reason = 'external') {
    const t = clampTier(tier);
    if (t === state.tier) return false;
    state.tier = t;
    state.lastSetMs = (typeof nowMs === 'function') ? nowMs() : (performance?.now?.() ?? Date.now());
    try {
      // Expose for debug/readout tooling.
      panel.__dgQualityTier = t;
      panel.__dgQualityTierReason = reason;
      panel.__dgQualityTierSetMs = state.lastSetMs;
    } catch {}
    return true;
  }

  function getTier() {
    try {
      const pTier = panel?.__dgQualityTier;
      if (Number.isFinite(pTier)) return clampTier(pTier);
    } catch {}
    return state.tier;
  }

  function getProfile({ isFocused = false, isInteracting = false } = {}) {
    let tier = getTier();

    // Interaction override: don't let an actively edited panel feel "dead".
    // We still allow reduced resScale, but we keep core overlays alive via tier>=1.
    if (isInteracting && tier < 1) tier = 1;

    // Focus override: focused panels should always try for tier 3 unless explicitly forced lower.
    // (Budget manager can still force lower tiers by setting panel.__dgQualityTier explicitly.)
    if (isFocused && tier < 2 && panel?.__dgQualityTier == null) tier = 3;

    const map = {
      // maxDprMul = hard cap on final DPR relative to device DPR (after adaptiveCap).
      // This is the main “reduce pixel cost” lever for nonScript time.
      3:  { resScale: 1.0, allowParticles: true,  allowOverlaySpecials: true,  allowPlayheadExtras: true,  desiredDrawHz: 60, maxDprMul: 1.00 },
      2:  { resScale: 0.9, allowParticles: true,  allowOverlaySpecials: true,  allowPlayheadExtras: true,  desiredDrawHz: 60, particleMul: 0.7, overlaySpecialMul: 0.7, maxDprMul: 0.92 },
      1:  { resScale: 0.8, allowParticles: true,  allowOverlaySpecials: false, allowPlayheadExtras: false, desiredDrawHz: 30, particleMul: 0.22, maxDprMul: 0.75 },
      0:  { resScale: 0.7, allowParticles: false, allowOverlaySpecials: false, allowPlayheadExtras: false, desiredDrawHz: 15, maxDprMul: 0.62 },
      '-1': { resScale: 0.6, allowParticles: false, allowOverlaySpecials: false, allowPlayheadExtras: false, desiredDrawHz: 10, maxDprMul: 0.55 },
    };

    const key = String(tier);
    const p = map[key] || map['3'];
    return {
      tier,
      resScale: p.resScale,
      allowParticles: !!p.allowParticles,
      allowOverlaySpecials: !!p.allowOverlaySpecials,
      allowPlayheadExtras: !!p.allowPlayheadExtras,
      desiredDrawHz: p.desiredDrawHz || 60,
      maxDprMul: Number.isFinite(p.maxDprMul) ? p.maxDprMul : 1.0,
      particleMul: Number.isFinite(p.particleMul) ? p.particleMul : 1.0,
      overlaySpecialMul: Number.isFinite(p.overlaySpecialMul) ? p.overlaySpecialMul : 1.0,
    };
  }

  return { setTier, getTier, getProfile };
}
