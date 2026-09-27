const HERO_DAMAGE_LANES = new Set(['foundation_lane', 'primary_loop_lane', 'secondary_loop_lane']);

export function resolveBeatSwarmEnemyIncomingDamage(amountLike = 0, enemyLike = null, roleLike = '') {
  const requestedDamage = Math.max(0, Number(amountLike) || 0);
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  const laneId = String(enemy?.assignedMusicLaneId || enemy?.musicLaneId || '').trim().toLowerCase();
  const role = String(roleLike || '').trim().toLowerCase();
  const heroProtected = HERO_DAMAGE_LANES.has(laneId) && role === 'hero';
  const multiplier = heroProtected ? 0.5 : 1;
  return Object.freeze({ requestedDamage, appliedDamage: requestedDamage * multiplier, multiplier, heroProtected, laneId });
}
