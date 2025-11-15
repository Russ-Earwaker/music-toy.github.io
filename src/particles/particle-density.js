// Shared particle density helpers

// Tunables (match current Simple Rhythm look)
export const BASE_AREA = 10000;          // px^2 bucket (100 x 100)
export const BASE_COUNT = 22;            // particles per 10k px^2 (tweak to match Simple Rhythm)
export const MIN_COUNT = 60;             // absolute floor to keep life in tiny fields
export const MAX_COUNT = 1200;           // cap for huge panels

export const BASE_RADIUS_PX = 1.0;       // screen-space radius in px (match Simple Rhythm)
export const RADIUS_JITTER = 0.35;       // random ± in px
export const GRID_RELAX = 0.85;          // grid tightening factor [0..1]

// Optional: keep stronger scene coherence
export const RNG_SEED_PER_TOY = true;

export function computeParticleLayout({
  widthPx,
  heightPx,
  // allow overrides per toy if needed later
  baseArea = BASE_AREA,
  baseCount = BASE_COUNT,
  minCount = MIN_COUNT,
  maxCount = MAX_COUNT,
} = {}) {
  const area = Math.max(1, widthPx * heightPx);
  const ideal = (area / baseArea) * baseCount;
  const count = Math.max(minCount, Math.min(maxCount, Math.round(ideal)));

  // Rough grid spacing from area & count, relaxed to avoid rigid lattice
  const spacing = Math.sqrt(area / count) * GRID_RELAX;

  return { count, spacing };
}

// Always return screen-space radius; caller must convert if drawing in world units
export function particleRadiusPx(randomFn = Math.random) {
  const jitter = (randomFn() * 2 - 1) * RADIUS_JITTER;
  return Math.max(0.5, BASE_RADIUS_PX + jitter);
}

export function screenRadiusToWorld(rPx, currentZoom) {
  // Particles for Draw/Simple Rhythm are drawn in a canvas whose size is already
  // in CSS/screen space (via getBoundingClientRect), so we *don't* want to scale
  // the radius by board zoom. Keep them roughly constant in pixel size.
  const base = Number.isFinite(rPx) ? rPx : BASE_RADIUS_PX;
  return Math.max(0.25, base);
}

export function seededRandomFactory(seedStr) {
  const base = String(seedStr ?? 'particles');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < base.length; i++) {
    h ^= base.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += h << 13;
    h ^= h >>> 7;
    h += h << 3;
    h ^= h >>> 17;
    h += h << 5;
    return ((h >>> 0) % 1e9) / 1e9;
  };
}
