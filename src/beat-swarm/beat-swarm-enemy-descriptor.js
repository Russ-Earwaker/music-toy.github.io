export const BEAT_SWARM_ENEMY_TIERS = Object.freeze({
  BASIC: 'basic',
  ELITE: 'elite',
  BOSS: 'boss',
});

export const BEAT_SWARM_ENEMY_SCALES = Object.freeze({
  SMALL: 'small',
  LARGE: 'large',
});

export const BEAT_SWARM_ENEMY_MUSICAL_OWNERSHIP = Object.freeze({
  CORE_LANE: 'core_lane',
  ADDITIVE_MOTIF: 'additive_motif',
  FULL_STRUCTURE: 'full_structure',
});

export const BEAT_SWARM_ENEMY_LANE_EVENT_MODES = Object.freeze({
  ROUND_ROBIN: 'round_robin',
  FULL_LANE: 'full_lane',
  ADDITIVE_MOTIF: 'additive_motif',
  FULL_STRUCTURE: 'full_structure',
});

export const BEAT_SWARM_ENEMY_ABILITY_FAMILIES = Object.freeze({
  PROJECTILE: 'projectile',
  LASER: 'laser',
  LOCAL_EXPLOSION: 'local_explosion',
  WIND_PUSH: 'wind_push',
  CHARGE: 'charge',
  ARENA_SHAPE: 'arena_shape',
  SUMMONING: 'summoning',
  SUPPORT: 'support',
});

const KNOWN_ABILITY_FAMILIES = new Set(Object.values(BEAT_SWARM_ENEMY_ABILITY_FAMILIES));
const ABILITY_SILHOUETTE_BY_FAMILY = Object.freeze({
  projectile: 'forward_cannon',
  laser: 'beam_prism',
  local_explosion: 'blast_core',
  wind_push: 'wind_vanes',
  charge: 'impact_wedge',
  arena_shape: 'shape_frame',
  summoning: 'spawn_core',
  support: 'support_ring',
});

export const BEAT_SWARM_ELITE_ENEMY_TYPES = Object.freeze([
  'charger',
  'conductor',
  'drawsnake',
  'gunner',
  'laser-spinner',
  'seeker',
  'shape-caster',
  'spawner',
]);

const ELITE_ENEMY_TYPES = new Set(BEAT_SWARM_ELITE_ENEMY_TYPES);

const LARGE_ENEMY_TYPES = new Set([
  'conductor',
  'drawsnake',
  'shape-caster',
  'spawner',
]);

const ABILITY_FAMILY_BY_TYPE = Object.freeze({
  charger: 'charge',
  conductor: 'support',
  drawsnake: 'projectile',
  dumb: 'projectile',
  gunner: 'projectile',
  'laser-spinner': 'laser',
  seeker: 'projectile',
  'shape-caster': 'arena_shape',
  spawner: 'summoning',
});

function normalizeToken(value, fallback = '') {
  const token = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  return token || String(fallback || '').trim().toLowerCase();
}

export function isBeatSwarmEliteEnemyType(enemyTypeLike = '') {
  return ELITE_ENEMY_TYPES.has(normalizeToken(enemyTypeLike));
}

function normalizeChoice(value, allowed, fallback) {
  const token = normalizeToken(value);
  return allowed.has(token) ? token : fallback;
}

function inferTier(enemy, enemyType, explicitTier = '') {
  const normalizedExplicit = normalizeChoice(
    explicitTier,
    new Set(Object.values(BEAT_SWARM_ENEMY_TIERS)),
    '',
  );
  if (normalizedExplicit) return normalizedExplicit;
  if (enemyType === 'boss' || enemyType.startsWith('boss-') || enemy?.isBoss === true) {
    return BEAT_SWARM_ENEMY_TIERS.BOSS;
  }
  if (
    ELITE_ENEMY_TYPES.has(enemyType)
    || enemy?.combatMusicalPartEndsOnDeath === true
    || Math.max(0, Math.trunc(Number(enemy?.combatSyncGroupId) || 0)) > 0
  ) {
    return BEAT_SWARM_ENEMY_TIERS.ELITE;
  }
  return BEAT_SWARM_ENEMY_TIERS.BASIC;
}

function inferScale(enemy, enemyType, tier, explicitScale = '') {
  const normalizedExplicit = normalizeChoice(
    explicitScale,
    new Set(Object.values(BEAT_SWARM_ENEMY_SCALES)),
    '',
  );
  if (normalizedExplicit) return normalizedExplicit;
  if (
    tier === BEAT_SWARM_ENEMY_TIERS.BOSS
    || LARGE_ENEMY_TYPES.has(enemyType)
    || normalizeToken(enemy?.soloCarrierType) === 'rhythm'
    || normalizeToken(enemy?.introCarrierBodyType) === 'solo'
    || enemy?.isLargeEnemy === true
  ) {
    return BEAT_SWARM_ENEMY_SCALES.LARGE;
  }
  return BEAT_SWARM_ENEMY_SCALES.SMALL;
}

function inferMusicalOwnership(tier, explicitOwnership = '') {
  const normalizedExplicit = normalizeChoice(
    explicitOwnership,
    new Set(Object.values(BEAT_SWARM_ENEMY_MUSICAL_OWNERSHIP)),
    '',
  );
  if (normalizedExplicit) return normalizedExplicit;
  if (tier === BEAT_SWARM_ENEMY_TIERS.BOSS) return BEAT_SWARM_ENEMY_MUSICAL_OWNERSHIP.FULL_STRUCTURE;
  if (tier === BEAT_SWARM_ENEMY_TIERS.ELITE) return BEAT_SWARM_ENEMY_MUSICAL_OWNERSHIP.ADDITIVE_MOTIF;
  return BEAT_SWARM_ENEMY_MUSICAL_OWNERSHIP.CORE_LANE;
}

function inferLaneEventMode(tier, scale, explicitMode = '') {
  const normalizedExplicit = normalizeChoice(
    explicitMode,
    new Set(Object.values(BEAT_SWARM_ENEMY_LANE_EVENT_MODES)),
    '',
  );
  if (normalizedExplicit) return normalizedExplicit;
  if (tier === BEAT_SWARM_ENEMY_TIERS.BOSS) return BEAT_SWARM_ENEMY_LANE_EVENT_MODES.FULL_STRUCTURE;
  if (tier === BEAT_SWARM_ENEMY_TIERS.ELITE) return BEAT_SWARM_ENEMY_LANE_EVENT_MODES.ADDITIVE_MOTIF;
  return scale === BEAT_SWARM_ENEMY_SCALES.LARGE
    ? BEAT_SWARM_ENEMY_LANE_EVENT_MODES.FULL_LANE
    : BEAT_SWARM_ENEMY_LANE_EVENT_MODES.ROUND_ROBIN;
}

function inferAbilityFamily(enemy, enemyType, explicitAbility = '') {
  const explicit = normalizeToken(explicitAbility);
  if (KNOWN_ABILITY_FAMILIES.has(explicit)) return explicit;
  const actionType = normalizeToken(enemy?.composerActionType || enemy?.combatLabPatternId);
  if (actionType.includes('explosion')) return 'local_explosion';
  if (actionType.includes('laser') || actionType.includes('beam')) return 'laser';
  if (actionType.includes('charge')) return 'charge';
  return ABILITY_FAMILY_BY_TYPE[enemyType] || 'projectile';
}

export function normalizeBeatSwarmEnemyAbilityPalette(familiesLike = null) {
  const values = Array.isArray(familiesLike) ? familiesLike : [];
  const unique = [];
  for (const value of values) {
    const family = normalizeToken(value);
    if (!KNOWN_ABILITY_FAMILIES.has(family) || unique.includes(family)) continue;
    unique.push(family);
  }
  return unique.length ? unique : [BEAT_SWARM_ENEMY_ABILITY_FAMILIES.PROJECTILE];
}

export function constrainBeatSwarmEnemyAbilityFamily(abilityFamilyLike = '', paletteLike = null) {
  const palette = normalizeBeatSwarmEnemyAbilityPalette(paletteLike);
  const requested = normalizeToken(abilityFamilyLike);
  return palette.includes(requested) ? requested : palette[0];
}

function inferMovementFamily(enemy, enemyType, explicitMovement = '') {
  const explicit = normalizeToken(explicitMovement);
  if (explicit) return explicit;
  const behavior = normalizeToken(
    enemy?.behavioralFormationArchetype
    || enemy?.combatLabMovementBehaviorId
    || enemy?.singleBehaviorId,
  );
  if (behavior) return behavior;
  if (enemyType === 'drawsnake') return 'winding_path';
  if (enemyType === 'spawner' || enemyType === 'conductor') return 'anchored';
  return 'drift';
}

function inferFormationMembership(enemy, tier, explicitMembership = '') {
  const explicit = normalizeToken(explicitMembership);
  if (explicit) return explicit;
  if (tier === BEAT_SWARM_ENEMY_TIERS.BOSS) return 'boss_structure';
  if (
    Math.max(0, Math.trunc(Number(enemy?.combatSyncGroupId) || 0)) > 0
    || enemy?.combatMusicalPartEndsOnDeath === true
  ) {
    return 'elite_formation';
  }
  if (
    Math.max(0, Math.trunc(Number(enemy?.composerGroupId || enemy?.musicGroupId) || 0)) > 0
    || normalizeToken(enemy?.enemyType) === 'composer-group-member'
  ) {
    return 'lane_group';
  }
  return 'individual';
}

export function createBeatSwarmEnemyGameplayDescriptor(enemyLike = null, overrides = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : {};
  const opts = overrides && typeof overrides === 'object' ? overrides : {};
  const enemyType = normalizeToken(opts.enemyType || enemy.enemyType, 'unknown');
  const tier = inferTier(enemy, enemyType, opts.tier);
  const scale = inferScale(enemy, enemyType, tier, opts.scale);
  const musicalOwnership = inferMusicalOwnership(
    tier,
    opts.musicalOwnership,
  );
  const laneEventMode = inferLaneEventMode(
    tier,
    scale,
    opts.laneEventMode,
  );
  const laneId = normalizeToken(opts.laneId || enemy.musicLaneId || enemy.foundationLaneId);
  const laneRole = normalizeToken(
    opts.laneRole
    || enemy.musicalRole
    || enemy.composerRole
    || enemy.musicGroupRole,
    'accent',
  );
  const inferredAbilityFamily = inferAbilityFamily(enemy, enemyType, opts.abilityFamily);
  const abilityFamily = Array.isArray(opts.abilityPalette)
    ? constrainBeatSwarmEnemyAbilityFamily(inferredAbilityFamily, opts.abilityPalette)
    : inferredAbilityFamily;
  return {
    version: 1,
    enemyType,
    tier,
    scale,
    musicalOwnership,
    laneId,
    laneRole,
    laneEventMode,
    abilityFamily,
    abilitySilhouette: ABILITY_SILHOUETTE_BY_FAMILY[abilityFamily] || 'forward_cannon',
    movementFamily: inferMovementFamily(enemy, enemyType, opts.movementFamily),
    formationMembership: inferFormationMembership(enemy, tier, opts.formationMembership),
    visualComplexity: tier === BEAT_SWARM_ENEMY_TIERS.BASIC ? 'simple' : (tier === BEAT_SWARM_ENEMY_TIERS.ELITE ? 'complex' : 'boss'),
  };
}

export function assignBeatSwarmEnemyGameplayDescriptor(enemyLike = null, overrides = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  if (!enemy) return null;
  const descriptor = createBeatSwarmEnemyGameplayDescriptor(enemy, overrides);
  enemy.gameplayDescriptor = descriptor;
  enemy.enemyTier = descriptor.tier;
  enemy.enemyScale = descriptor.scale;
  enemy.musicalOwnership = descriptor.musicalOwnership;
  enemy.laneEventMode = descriptor.laneEventMode;
  enemy.abilityFamily = descriptor.abilityFamily;
  enemy.movementFamily = descriptor.movementFamily;
  enemy.formationMembership = descriptor.formationMembership;
  return descriptor;
}

export function applyBeatSwarmEnemyDescriptorVisualIdentity(enemyLike = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  const descriptor = enemy?.gameplayDescriptor || null;
  const el = enemy?.el || null;
  if (!enemy || !descriptor || !el?.classList) return descriptor;
  const abilityClasses = [
    'is-ability-projectile',
    'is-ability-laser',
    'is-ability-local-explosion',
    'is-ability-wind-push',
    'is-ability-charge',
    'is-ability-arena-shape',
    'is-ability-summoning',
    'is-ability-support',
  ];
  el.classList.remove(
    'is-basic-ability-carrier',
    'is-basic-large-carrier',
    'is-basic-small-carrier',
    ...abilityClasses,
  );
  if (descriptor.tier === BEAT_SWARM_ENEMY_TIERS.BASIC) {
    // Ability owns a basic enemy's outer silhouette. Legacy composer shapes
    // would otherwise override it and make identical abilities look unrelated.
    el.classList.remove('is-shape-circle', 'is-shape-square', 'is-shape-diamond');
    el.classList.add('is-basic-ability-carrier');
    el.classList.add(descriptor.scale === BEAT_SWARM_ENEMY_SCALES.LARGE
      ? 'is-basic-large-carrier'
      : 'is-basic-small-carrier');
    el.classList.add(`is-ability-${String(descriptor.abilityFamily || 'projectile').replace(/_/g, '-')}`);
  }
  if (el.dataset) {
    el.dataset.enemyTier = String(descriptor.tier || 'basic');
    el.dataset.enemyAbilityFamily = String(descriptor.abilityFamily || 'projectile');
    el.dataset.enemyAbilitySilhouette = String(descriptor.abilitySilhouette || 'forward_cannon');
  }
  return descriptor;
}

function getLaneEventMode(enemyLike = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : {};
  const mode = normalizeChoice(
    enemy?.gameplayDescriptor?.laneEventMode || enemy?.laneEventMode,
    new Set(Object.values(BEAT_SWARM_ENEMY_LANE_EVENT_MODES)),
    '',
  );
  if (mode) return mode;
  return createBeatSwarmEnemyGameplayDescriptor(enemy).laneEventMode;
}

function getMusicalOwnership(enemyLike = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : {};
  const ownership = normalizeChoice(
    enemy?.gameplayDescriptor?.musicalOwnership || enemy?.musicalOwnership,
    new Set(Object.values(BEAT_SWARM_ENEMY_MUSICAL_OWNERSHIP)),
    '',
  );
  if (ownership) return ownership;
  return createBeatSwarmEnemyGameplayDescriptor(enemy).musicalOwnership;
}

function sortLanePerformers(members = []) {
  return members.slice().sort((a, b) => {
    const aIndex = Math.trunc(Number(a?.formationMemberIndex) || 0);
    const bIndex = Math.trunc(Number(b?.formationMemberIndex) || 0);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return Math.trunc(Number(a?.id) || 0) - Math.trunc(Number(b?.id) || 0);
  });
}

export function selectBeatSwarmLaneEventPerformers(options = null) {
  const members = Array.isArray(options?.aliveMembers) ? options.aliveMembers.filter(Boolean) : [];
  const chooseRoundRobin = typeof options?.chooseRoundRobin === 'function'
    ? options.chooseRoundRobin
    : null;
  const coreLaneMembers = members.filter((enemy) => (
    getMusicalOwnership(enemy) === BEAT_SWARM_ENEMY_MUSICAL_OWNERSHIP.CORE_LANE
  ));
  const fullLaneMembers = sortLanePerformers(coreLaneMembers.filter((enemy) => (
    getLaneEventMode(enemy) === BEAT_SWARM_ENEMY_LANE_EVENT_MODES.FULL_LANE
  )));
  const roundRobinMembers = coreLaneMembers.filter((enemy) => (
    getLaneEventMode(enemy) === BEAT_SWARM_ENEMY_LANE_EVENT_MODES.ROUND_ROBIN
  ));
  const roundRobinPerformer = roundRobinMembers.length
    ? (chooseRoundRobin?.(roundRobinMembers) || roundRobinMembers[0] || null)
    : null;
  if (!roundRobinPerformer) return fullLaneMembers;
  const roundRobinId = Math.trunc(Number(roundRobinPerformer?.id) || 0);
  if (fullLaneMembers.some((enemy) => Math.trunc(Number(enemy?.id) || 0) === roundRobinId)) {
    return fullLaneMembers;
  }
  return [...fullLaneMembers, roundRobinPerformer];
}
