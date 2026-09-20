export const BEAT_SWARM_HERO_LANE_MIX_LANE_IDS = Object.freeze([
  'foundation_lane',
  'primary_loop_lane',
  'secondary_loop_lane',
]);

export const BEAT_SWARM_HERO_LANE_MIX_MULTIPLIERS = Object.freeze({
  hero: 1,
  support: 0.82,
  background: 0.65,
});

const VALID_LANE_IDS = new Set(BEAT_SWARM_HERO_LANE_MIX_LANE_IDS);
const VALID_ROLES = new Set(Object.keys(BEAT_SWARM_HERO_LANE_MIX_MULTIPLIERS));

function normalizeLaneId(value = '') {
  const laneId = String(value || '').trim().toLowerCase();
  return VALID_LANE_IDS.has(laneId) ? laneId : '';
}

function normalizeRole(value = '', fallback = 'support') {
  const role = String(value || '').trim().toLowerCase();
  return VALID_ROLES.has(role) ? role : fallback;
}

export function resolveBeatSwarmHeroLaneMix(configLike = null) {
  const config = configLike && typeof configLike === 'object' ? configLike : {};
  const heroValue = String(config.heroLane || config.hero || 'none').trim().toLowerCase();
  const heroLaneId = heroValue === 'none' ? '' : normalizeLaneId(heroValue);
  if (!heroLaneId) return { enabled: false, heroLaneId: '', rolesByLane: {} };

  const configuredRoles = config.roles && typeof config.roles === 'object' ? config.roles : config;
  const rolesByLane = {};
  for (const laneId of BEAT_SWARM_HERO_LANE_MIX_LANE_IDS) {
    rolesByLane[laneId] = laneId === heroLaneId
      ? 'hero'
      : normalizeRole(configuredRoles[laneId], 'support');
  }
  return { enabled: true, heroLaneId, rolesByLane };
}

export function resolveBeatSwarmHeroLaneMixConfig(debugConfigLike = null, productionConfigLike = null) {
  if (debugConfigLike && typeof debugConfigLike === 'object') return debugConfigLike;
  return productionConfigLike && typeof productionConfigLike === 'object'
    ? productionConfigLike
    : { heroLane: 'none' };
}

export function getBeatSwarmHeroLaneMixForLane(laneIdLike = '', configLike = null) {
  const laneId = normalizeLaneId(laneIdLike);
  const mix = resolveBeatSwarmHeroLaneMix(configLike);
  if (!laneId || !mix.enabled) return { applied: false, laneId, role: '', multiplier: 1 };
  const role = mix.rolesByLane[laneId] || 'support';
  return {
    applied: true,
    laneId,
    role,
    multiplier: BEAT_SWARM_HERO_LANE_MIX_MULTIPLIERS[role] || 1,
  };
}

export function getBeatSwarmHeroRoleMultiplier(roleLike = '') {
  const role = normalizeRole(roleLike, 'background');
  return BEAT_SWARM_HERO_LANE_MIX_MULTIPLIERS[role];
}

export function applyBeatSwarmHeroLaneMixGain(gainLike = 0, laneIdLike = '', configLike = null) {
  const baseGain = Math.max(0, Math.min(1, Number(gainLike) || 0));
  const laneMix = getBeatSwarmHeroLaneMixForLane(laneIdLike, configLike);
  return {
    ...laneMix,
    gain: laneMix.applied
      ? Math.max(0, Math.min(1, baseGain * laneMix.multiplier))
      : baseGain,
  };
}

export function getBeatSwarmPeakRoleAllowedSteps(laneLike = '', roleLike = '', barIndexLike = 0) {
  const lane = String(laneLike || '').trim().toLowerCase();
  const role = normalizeRole(roleLike, 'background');
  const barInPhrase = ((Math.max(0, Math.trunc(Number(barIndexLike) || 0)) % 4) + 4) % 4;
  if (role === 'background') {
    if (lane === 'foundation') return [0];
    if (lane === 'secondary') return [4];
    if (lane === 'lead') return [0];
    return [];
  }
  if (role === 'support') {
    if (lane === 'foundation') return [0, 4];
    if (lane === 'secondary') return barInPhrase < 2 ? [4] : (barInPhrase === 2 ? [2, 6] : [1, 5]);
    if (lane === 'lead') return barInPhrase === 3 ? [0, 4, 6] : [0, 2, 4, 6];
    return [];
  }
  if (lane === 'ornament') return [7];
  if (lane === 'secondary') return [6];
  if (lane === 'lead') return [0, 1, 2, 4, 6, 7];
  return [0, 4];
}
