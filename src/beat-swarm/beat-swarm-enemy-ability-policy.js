import {
  BEAT_SWARM_ENEMY_ABILITY_FAMILIES,
  constrainBeatSwarmEnemyAbilityFamily,
} from './beat-swarm-enemy-descriptor.js?v=2026-08-23-production-abilities-v2';

export const BEAT_SWARM_LEVEL1_BASIC_ABILITY_PALETTE = Object.freeze([
  BEAT_SWARM_ENEMY_ABILITY_FAMILIES.PROJECTILE,
  BEAT_SWARM_ENEMY_ABILITY_FAMILIES.LASER,
  BEAT_SWARM_ENEMY_ABILITY_FAMILIES.LOCAL_EXPLOSION,
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
