const STYLE_PROFILES = Object.freeze({
  retro_shooter: Object.freeze({
    id: 'retro_shooter',
    bassEntropyMax: 0.2,
    leadLeapChance: 0.18,
    motifRepeatBias: 0.88,
    accentPitchVariance: 0.28,
    motionParticipationGain: 0.38,
    playerProminence: 0.88,
    sectionMinDuration: 10,
    handoffAggressiveness: 0.72,
    patternPersistenceBars: 18,
    maxVoicesPreferred: 4,
    bassRootBias: 0.74,
    bassFifthBias: 0.58,
    notePoolMaxUnique: 4,
    spawnerDensityMult: 0.32,
    drawsnakeDensityMult: 0.22,
    styleLaneBias: Object.freeze({
      bass: 1,
      lead: 1,
      accent: 0.92,
      motion: 0.42,
    }),
    allowedLaneRolesBySourceType: Object.freeze({
      spawner: Object.freeze(['bass', 'lead']),
      drawsnake: Object.freeze(['lead', 'accent']),
      group: Object.freeze(['lead', 'accent', 'bass']),
      player: Object.freeze(['lead', 'accent']),
      death: Object.freeze(['accent']),
      unknown: Object.freeze(['lead', 'accent']),
    }),
  }),
});

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0, Math.min(1, Number(fallback) || 0));
  return Math.max(0, Math.min(1, n));
}

function clampInt(value, fallback, min = 0) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return Math.max(min, Math.trunc(Number(fallback) || 0));
  return Math.max(min, n);
}

function normalizeProfile(profileLike, fallbackId = 'retro_shooter') {
  const src = profileLike && typeof profileLike === 'object'
    ? profileLike
    : (STYLE_PROFILES[fallbackId] || STYLE_PROFILES.retro_shooter);
  const id = String(src?.id || fallbackId || 'retro_shooter').trim().toLowerCase() || 'retro_shooter';
  return Object.freeze({
    id,
    bassEntropyMax: clamp01(src?.bassEntropyMax, 0.2),
    leadLeapChance: clamp01(src?.leadLeapChance, 0.2),
    motifRepeatBias: clamp01(src?.motifRepeatBias, 0.88),
    accentPitchVariance: clamp01(src?.accentPitchVariance, 0.3),
    motionParticipationGain: clamp01(src?.motionParticipationGain, 0.4),
    playerProminence: clamp01(src?.playerProminence, 0.85),
    sectionMinDuration: clampInt(src?.sectionMinDuration, 10, 1),
    handoffAggressiveness: clamp01(src?.handoffAggressiveness, 0.7),
    patternPersistenceBars: clampInt(src?.patternPersistenceBars, 18, 1),
    maxVoicesPreferred: clampInt(src?.maxVoicesPreferred, 4, 1),
    bassRootBias: clamp01(src?.bassRootBias, 0.7),
    bassFifthBias: clamp01(src?.bassFifthBias, 0.55),
    notePoolMaxUnique: clampInt(src?.notePoolMaxUnique, 4, 1),
    spawnerDensityMult: clamp01(src?.spawnerDensityMult, 0.32),
    drawsnakeDensityMult: clamp01(src?.drawsnakeDensityMult, 0.22),
    styleLaneBias: Object.freeze({
      bass: clamp01(src?.styleLaneBias?.bass, 1),
      lead: clamp01(src?.styleLaneBias?.lead, 1),
      accent: clamp01(src?.styleLaneBias?.accent, 0.92),
      motion: clamp01(src?.styleLaneBias?.motion, 0.4),
    }),
    allowedLaneRolesBySourceType: src?.allowedLaneRolesBySourceType && typeof src.allowedLaneRolesBySourceType === 'object'
      ? src.allowedLaneRolesBySourceType
      : (STYLE_PROFILES.retro_shooter.allowedLaneRolesBySourceType || {}),
  });
}

export function getBeatSwarmStyleProfile(styleId = 'retro_shooter') {
  const id = String(styleId || 'retro_shooter').trim().toLowerCase();
  const base = STYLE_PROFILES[id] || STYLE_PROFILES.retro_shooter;
  return normalizeProfile(base, 'retro_shooter');
}
