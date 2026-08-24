import {
  BEAT_SWARM_ENEMY_ABILITY_FAMILIES,
  constrainBeatSwarmEnemyAbilityFamily,
} from './beat-swarm-enemy-descriptor.js?v=2026-08-24-threat-ramp-v1';

export const BEAT_SWARM_LEVEL1_BASIC_ABILITY_PALETTE = Object.freeze([
  BEAT_SWARM_ENEMY_ABILITY_FAMILIES.PROJECTILE,
  BEAT_SWARM_ENEMY_ABILITY_FAMILIES.LASER,
  BEAT_SWARM_ENEMY_ABILITY_FAMILIES.LOCAL_EXPLOSION,
  BEAT_SWARM_ENEMY_ABILITY_FAMILIES.WIND_PUSH,
]);

export const BEAT_SWARM_LEVEL1_THREAT_ROSTER = Object.freeze([
  Object.freeze({ abilityFamily: BEAT_SWARM_ENEMY_ABILITY_FAMILIES.WIND_PUSH, scale: 'small', arrivalPhase: 0 }),
  Object.freeze({ abilityFamily: BEAT_SWARM_ENEMY_ABILITY_FAMILIES.WIND_PUSH, scale: 'small', arrivalPhase: 0 }),
  Object.freeze({ abilityFamily: BEAT_SWARM_ENEMY_ABILITY_FAMILIES.LASER, scale: 'small', arrivalPhase: 1 }),
  Object.freeze({ abilityFamily: BEAT_SWARM_ENEMY_ABILITY_FAMILIES.LOCAL_EXPLOSION, scale: 'small', arrivalPhase: 3 }),
  Object.freeze({ abilityFamily: BEAT_SWARM_ENEMY_ABILITY_FAMILIES.PROJECTILE, scale: 'large', arrivalPhase: 4 }),
  Object.freeze({ abilityFamily: BEAT_SWARM_ENEMY_ABILITY_FAMILIES.LASER, scale: 'small', arrivalPhase: 5 }),
]);

export const BEAT_SWARM_LEVEL1_THREAT_PHASES = Object.freeze([
  Object.freeze({ id: 'simple_prefill', startBeat: 0, maxFeaturedThreats: 0, targetBasicEnemies: 2 }),
  Object.freeze({ id: 'laser_teach', startBeat: 16, maxFeaturedThreats: 1, targetBasicEnemies: 3 }),
  Object.freeze({ id: 'laser_consolidate', startBeat: 32, maxFeaturedThreats: 1, targetBasicEnemies: 3 }),
  Object.freeze({ id: 'local_aoe_introduction', startBeat: 48, maxFeaturedThreats: 1, targetBasicEnemies: 4 }),
  Object.freeze({ id: 'projectile_introduction', startBeat: 64, maxFeaturedThreats: 1, targetBasicEnemies: 5 }),
  Object.freeze({ id: 'combined_pressure', startBeat: 80, maxFeaturedThreats: 2, targetBasicEnemies: 6 }),
]);

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
}

export function resolveBeatSwarmLevel1BasicAbility(options = null) {
  const actionType = normalizeToken(options?.actionType);
  const laneId = normalizeToken(options?.laneId);
  const role = normalizeToken(options?.role);
  const isIntroCarrier = options?.isIntroCarrier === true;
  let requested = BEAT_SWARM_ENEMY_ABILITY_FAMILIES.PROJECTILE;

  if (actionType.includes('explosion')) {
    requested = BEAT_SWARM_ENEMY_ABILITY_FAMILIES.LOCAL_EXPLOSION;
  } else if (actionType.includes('laser') || actionType.includes('beam')) {
    requested = BEAT_SWARM_ENEMY_ABILITY_FAMILIES.LASER;
  } else if (!isIntroCarrier && (laneId === 'primary_loop_lane' || role === 'lead')) {
    requested = BEAT_SWARM_ENEMY_ABILITY_FAMILIES.LASER;
  } else if (!isIntroCarrier && (laneId === 'secondary_loop_lane' || role === 'drum' || role === 'accent')) {
    requested = BEAT_SWARM_ENEMY_ABILITY_FAMILIES.LOCAL_EXPLOSION;
  }

  return constrainBeatSwarmEnemyAbilityFamily(
    requested,
    options?.abilityPalette || BEAT_SWARM_LEVEL1_BASIC_ABILITY_PALETTE,
  );
}

export function getBeatSwarmFeaturedThreatCount(options = null) {
  const memberCount = Math.max(1, Math.trunc(Number(options?.memberCount) || 1));
  const levelIndex = Math.max(0, Math.trunc(Number(options?.levelIndex) || 0));
  const levelRamp = Math.max(0, Math.min(1, Number(options?.difficultyRamp) || 0));
  // Later levels reach mixed-threat groups sooner without changing damage or health yet.
  const effectiveRamp = Math.max(0, Math.min(1, levelRamp + (levelIndex * 0.16)));
  const requested = effectiveRamp >= 0.76 ? 3 : (effectiveRamp >= 0.42 ? 2 : 1);
  return Math.min(memberCount, requested);
}

export function resolveBeatSwarmLevel1ThreatPhase(elapsedBeatsLike = 0) {
  const elapsedBeats = Math.max(0, Math.trunc(Number(elapsedBeatsLike) || 0));
  let phaseIndex = 0;
  for (let index = 0; index < BEAT_SWARM_LEVEL1_THREAT_PHASES.length; index += 1) {
    if (elapsedBeats >= BEAT_SWARM_LEVEL1_THREAT_PHASES[index].startBeat) phaseIndex = index;
  }
  return {
    phaseIndex,
    phase: BEAT_SWARM_LEVEL1_THREAT_PHASES[phaseIndex],
  };
}

export function getBeatSwarmLevel1ThreatAbilityPalette(phaseIndexLike = 0) {
  const phaseIndex = Math.max(0, Math.min(
    BEAT_SWARM_LEVEL1_THREAT_PHASES.length - 1,
    Math.trunc(Number(phaseIndexLike) || 0),
  ));
  const palette = [];
  for (const entry of BEAT_SWARM_LEVEL1_THREAT_ROSTER) {
    if (entry.arrivalPhase > phaseIndex || palette.includes(entry.abilityFamily)) continue;
    palette.push(entry.abilityFamily);
  }
  return Object.freeze(palette.length ? palette : [BEAT_SWARM_ENEMY_ABILITY_FAMILIES.WIND_PUSH]);
}

export function getBeatSwarmLevel1ThreatFamilyCaps(phaseIndexLike = 0) {
  const phaseIndex = Math.max(0, Math.min(
    BEAT_SWARM_LEVEL1_THREAT_PHASES.length - 1,
    Math.trunc(Number(phaseIndexLike) || 0),
  ));
  const caps = Object.create(null);
  for (const entry of BEAT_SWARM_LEVEL1_THREAT_ROSTER) {
    if (entry.arrivalPhase > phaseIndex || entry.abilityFamily === BEAT_SWARM_ENEMY_ABILITY_FAMILIES.WIND_PUSH) continue;
    caps[entry.abilityFamily] = Math.max(0, Math.trunc(Number(caps[entry.abilityFamily]) || 0)) + 1;
  }
  return Object.freeze({ ...caps });
}

export function resolveBeatSwarmCappedThreatAbility(options = null) {
  const phaseIndex = Math.max(0, Math.trunc(Number(options?.phaseIndex) || 0));
  const abilityPalette = options?.abilityPalette || getBeatSwarmLevel1ThreatAbilityPalette(phaseIndex);
  const requested = constrainBeatSwarmEnemyAbilityFamily(options?.abilityFamily, abilityPalette);
  if (requested === BEAT_SWARM_ENEMY_ABILITY_FAMILIES.WIND_PUSH) return requested;
  const caps = getBeatSwarmLevel1ThreatFamilyCaps(phaseIndex);
  const currentCounts = options?.currentCounts && typeof options.currentCounts === 'object' ? options.currentCounts : {};
  const cap = Math.max(0, Math.trunc(Number(caps[requested]) || 0));
  const current = Math.max(0, Math.trunc(Number(currentCounts[requested]) || 0));
  return current < cap
    ? requested
    : constrainBeatSwarmEnemyAbilityFamily(BEAT_SWARM_ENEMY_ABILITY_FAMILIES.WIND_PUSH, abilityPalette);
}

export function resolveBeatSwarmProductionThreatPhase(options = null) {
  const introStage = normalizeToken(options?.introStage) || 'none';
  const activeLevelPhase = normalizeToken(options?.activeLevelPhase) || 'intro_teach';
  const phaseVariant = normalizeToken(options?.phaseVariant) || 'default';
  const difficultyRamp = Math.max(0, Math.min(1, Number(options?.difficultyRamp) || 0));
  const targetPressure = Math.max(0, Math.min(1, Number(options?.targetPressure) || 0));
  const intensityTier = normalizeToken(options?.intensityTier) || 'low';
  let phaseIndex = 0;
  if (introStage !== 'none') {
    phaseIndex = 0;
  } else if (activeLevelPhase === 'groove_establish') {
    phaseIndex = phaseVariant === 'foundation_only' ? 0 : 1;
  } else if (activeLevelPhase === 'lead_merge') {
    phaseIndex = difficultyRamp >= 0.16 && phaseVariant !== 'reduced_support' ? 3 : 2;
  } else if (activeLevelPhase === 'full_texture') {
    phaseIndex = intensityTier === 'high' || difficultyRamp >= 0.42 || targetPressure >= 0.72 ? 5 : 4;
  }
  return {
    phaseIndex,
    phase: BEAT_SWARM_LEVEL1_THREAT_PHASES[phaseIndex],
    abilityPalette: getBeatSwarmLevel1ThreatAbilityPalette(phaseIndex),
  };
}

export function resolveBeatSwarmLevel1GroupMemberAbility(options = null) {
  const memberIndex = Math.max(0, Math.trunc(Number(options?.memberIndex) || 0));
  const memberCount = Math.max(1, Math.trunc(Number(options?.memberCount) || 1));
  const featuredAbility = resolveBeatSwarmLevel1BasicAbility(options);
  if (options?.isIntroCarrier === true) return BEAT_SWARM_ENEMY_ABILITY_FAMILIES.PROJECTILE;

  const featuredThreatLimit = Number.isFinite(Number(options?.featuredThreatLimit))
    ? Math.max(0, Math.trunc(Number(options.featuredThreatLimit)))
    : memberCount;
  const featuredCount = Math.min(featuredThreatLimit, getBeatSwarmFeaturedThreatCount({
    memberCount,
    levelIndex: options?.levelIndex,
    difficultyRamp: options?.difficultyRamp,
  }));
  if (memberIndex < featuredCount) return featuredAbility;

  // Wind carriers provide non-damaging spacing pressure. Local blasts remain the
  // readable short-range fallback, but never multiply a newly introduced blast.
  if (featuredAbility === BEAT_SWARM_ENEMY_ABILITY_FAMILIES.LOCAL_EXPLOSION) {
    return constrainBeatSwarmEnemyAbilityFamily(
      BEAT_SWARM_ENEMY_ABILITY_FAMILIES.WIND_PUSH,
      options?.abilityPalette || BEAT_SWARM_LEVEL1_BASIC_ABILITY_PALETTE,
    );
  }
  const filler = (memberIndex - featuredCount) % 2 === 0
    ? BEAT_SWARM_ENEMY_ABILITY_FAMILIES.WIND_PUSH
    : BEAT_SWARM_ENEMY_ABILITY_FAMILIES.LOCAL_EXPLOSION;
  return constrainBeatSwarmEnemyAbilityFamily(
    filler,
    options?.abilityPalette || BEAT_SWARM_LEVEL1_BASIC_ABILITY_PALETTE,
  );
}
