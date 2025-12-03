// src/particles/ParticleQuality.js
// Global particle quality tiers + simple FPS-driven LOD.
// All toys and particle systems should use this instead of rolling their own.

export const QUALITY = {
  ULTRA: 'ultra',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

let currentQuality = QUALITY.ULTRA;
let lastFpsSample = 60;
let smoothedFps = 60;

// Low-pass filter for noisy FPS samples so we don't thrash quality tiers.
const FPS_SMOOTH_ALPHA = 0.18;

/**
 * Call this from the global FPS HUD once per frame-ish.
 * It maps a recent FPS sample to a quality tier.
 */
export function updateParticleQualityFromFps(fps) {
  if (!Number.isFinite(fps) || fps <= 0) return;
  lastFpsSample = fps;
  if (!Number.isFinite(smoothedFps)) smoothedFps = fps;
  smoothedFps = smoothedFps + (fps - smoothedFps) * FPS_SMOOTH_ALPHA;

  // Hysteretic mapping to avoid chatter around thresholds.
  const q = currentQuality;
  if (fps >= 57 || (q === QUALITY.ULTRA && fps >= 54)) {
    currentQuality = QUALITY.ULTRA;
  } else if (fps >= 45 || (q === QUALITY.HIGH && fps >= 41)) {
    currentQuality = QUALITY.HIGH;
  } else if (fps >= 32 || (q === QUALITY.MEDIUM && fps >= 29)) {
    currentQuality = QUALITY.MEDIUM;
  } else {
    currentQuality = QUALITY.LOW;
  }

  // Keep fields on; rely on budget scaling rather than full disable for reactivity.
}

/**
 * Returns the current global particle quality tier.
 */
export function getParticleQuality() {
  return currentQuality;
}

/**
 * Returns the current smoothed FPS reading used for LOD decisions.
 */
export function getSmoothedFps() {
  return smoothedFps;
}

/**
 * Returns the last FPS sample we were given.
 */
export function getLastFpsSample() {
  return lastFpsSample;
}

/**
 * Returns a simple "budget" object that particle systems / toys can use
 * to scale their spawn rates, caps, etc.
 */
export function getParticleBudget() {
  switch (currentQuality) {
    case QUALITY.ULTRA:
      return { spawnScale: 1.0, maxCountScale: 1.0 };
    case QUALITY.HIGH:
      return { spawnScale: 0.7, maxCountScale: 0.75 };
    case QUALITY.MEDIUM:
      return { spawnScale: 0.45, maxCountScale: 0.5 };
    case QUALITY.LOW:
    default:
      return { spawnScale: 0.2, maxCountScale: 0.25 };
  }
}

/**
 * Returns a cross-toy adaptive budget derived from FPS.
 * This is meant to be called by visual toys (drawgrid, loopgrid, etc.) to
 * coordinate throttling instead of each toy inventing its own knobs.
 */
export function getAdaptiveFrameBudget() {
  const baseBudget = getParticleBudget();
  const quality = getParticleQuality();

  // Extra attenuation layered on top of the base particle budget.
  const particleCapScale = (() => {
    switch (quality) {
      case QUALITY.ULTRA: return 1.0;
      case QUALITY.HIGH:  return 0.8;
      case QUALITY.MEDIUM:return 0.55;
      case QUALITY.LOW:
      default:            return 0.35;
    }
  })();

  // Keep physics running every frame for responsiveness; rely on smaller caps instead.
  const tickModulo = 1;

  const sizeScale = (() => {
    switch (quality) {
      case QUALITY.LOW:     return 0.85;
      case QUALITY.MEDIUM:  return 0.93;
      default:              return 1.0;
    }
  })();

  const allowField = true;

  return {
    fps: lastFpsSample,
    smoothedFps,
    quality,
    particleBudget: {
      ...baseBudget,
      capScale: particleCapScale,
      tickModulo,
      sizeScale,
      allowField,
    },
    renderBudget: {
      // Let toys skip non-critical redraws on the lowest tier.
      skipNonCriticalEvery: quality === QUALITY.LOW ? 2 : 1,
    },
  };
}
