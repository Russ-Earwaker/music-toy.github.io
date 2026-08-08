import {
  getBeatSwarmEnemyAttackPattern,
  getBeatSwarmEnemyCombatProfile,
} from './beat-swarm-enemy-combat-profiles.js?v=2026-08-08-conductor-v2';

function normalizeBeat(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function getAimAngle(enemy, target) {
  return Math.atan2(
    (Number(target?.y) || 0) - (Number(enemy?.wy) || 0),
    (Number(target?.x) || 0) - (Number(enemy?.wx) || 0),
  );
}

function getProjectileAngles(baseAngle, count, spreadRadians) {
  const safeCount = Math.max(1, Math.trunc(Number(count) || 1));
  const spread = Math.max(0, Number(spreadRadians) || 0);
  if (safeCount === 1 || spread <= 0) return [baseAngle];
  return Array.from({ length: safeCount }, (_, index) => {
    const t = index / Math.max(1, safeCount - 1);
    return baseAngle + ((t - 0.5) * spread);
  });
}

export function configureBeatSwarmEnemyCombatRuntime(enemy, options = null) {
  if (!enemy) return null;
  const profileId = String(options?.profileId || enemy.combatProfileId || '').trim().toLowerCase();
  const profile = getBeatSwarmEnemyCombatProfile(profileId);
  if (!profile) return null;
  const pattern = getBeatSwarmEnemyAttackPattern(profile.id, options?.patternId);
  enemy.combatProfileId = profile.id;
  enemy.combatPatternId = pattern?.id || profile.defaultPatternId;
  enemy.combatEnabled = options?.enabled !== false;
  enemy.combatNextAttackBeat = Number.isFinite(Number(options?.startBeat))
    ? normalizeBeat(options.startBeat)
    : null;
  enemy.combatBurstRemaining = 0;
  enemy.combatBurstNextBeat = null;
  enemy.combatLastProcessedBeat = null;
  enemy.singleBehaviorId = String(options?.movementBehaviorId || profile.movementBehaviorId || '').trim().toLowerCase();
  enemy.combatAnchorX = Number.isFinite(Number(options?.anchorX)) ? Number(options.anchorX) : Number(enemy.wx) || 0;
  enemy.combatAnchorY = Number.isFinite(Number(options?.anchorY)) ? Number(options.anchorY) : Number(enemy.wy) || 0;
  enemy.combatRole = profile.combatRole;
  enemy.combatChallengeTags = Array.from(profile.challengeTags || []);
  return enemy;
}

export function setBeatSwarmEnemyCombatPatternRuntime(enemy, patternId, startBeat = null) {
  if (!enemy) return false;
  const pattern = getBeatSwarmEnemyAttackPattern(enemy.combatProfileId, patternId);
  if (!pattern) return false;
  enemy.combatPatternId = pattern.id;
  enemy.combatBurstRemaining = 0;
  enemy.combatBurstNextBeat = null;
  enemy.combatNextAttackBeat = Number.isFinite(Number(startBeat)) ? normalizeBeat(startBeat) : null;
  return true;
}

export function createBeatSwarmEnemyCombatRuntime() {
  let lastGlobalBeat = null;

  function reset() {
    lastGlobalBeat = null;
  }

  function update(options = null) {
    const beatIndex = normalizeBeat(options?.beatIndex);
    if (lastGlobalBeat === beatIndex) return 0;
    lastGlobalBeat = beatIndex;
    const enemies = Array.isArray(options?.enemies) ? options.enemies : [];
    const target = options?.target || null;
    const spawnProjectile = options?.spawnProjectile;
    const spawnHazard = options?.spawnHazard;
    const playAttackSound = options?.playAttackSound;
    const onAttack = options?.onAttack;
    if (!target || (typeof spawnProjectile !== 'function' && typeof spawnHazard !== 'function')) return 0;
    let attackCount = 0;

    for (const enemy of enemies) {
      if (!enemy || enemy.combatEnabled !== true || enemy.retreating || String(enemy.lifecycleState || 'active') !== 'active') continue;
      const profile = getBeatSwarmEnemyCombatProfile(enemy.combatProfileId);
      const pattern = getBeatSwarmEnemyAttackPattern(profile?.id, enemy.combatPatternId);
      if (!profile || !pattern || enemy.combatLastProcessedBeat === beatIndex) continue;
      enemy.combatLastProcessedBeat = beatIndex;

      if (!Number.isFinite(Number(enemy.combatNextAttackBeat))) enemy.combatNextAttackBeat = beatIndex + 1;
      const burstDue = Number(enemy.combatBurstRemaining) > 0
        && Number.isFinite(Number(enemy.combatBurstNextBeat))
        && beatIndex >= normalizeBeat(enemy.combatBurstNextBeat);
      const attackDue = beatIndex >= normalizeBeat(enemy.combatNextAttackBeat);
      if (!burstDue && !attackDue) continue;

      if (attackDue && !burstDue) {
        enemy.combatNextAttackBeat = beatIndex + Math.max(1, Math.trunc(Number(pattern.cadenceBeats) || 1));
        const burstCount = Math.max(1, Math.trunc(Number(pattern.burstCount) || 1));
        enemy.combatBurstRemaining = burstCount - 1;
        enemy.combatBurstNextBeat = burstCount > 1
          ? beatIndex + Math.max(1, Math.trunc(Number(pattern.burstSpacingBeats) || 1))
          : null;
      } else if (burstDue) {
        enemy.combatBurstRemaining = Math.max(0, Math.trunc(Number(enemy.combatBurstRemaining) || 0) - 1);
        enemy.combatBurstNextBeat = enemy.combatBurstRemaining > 0
          ? beatIndex + Math.max(1, Math.trunc(Number(pattern.burstSpacingBeats) || 1))
          : null;
      }

      const baseAngle = getAimAngle(enemy, target);
      const attackKind = String(pattern.attackKind || 'projectile').trim().toLowerCase();
      const isHazard = attackKind !== 'projectile';
      const angles = isHazard ? [] : getProjectileAngles(baseAngle, pattern.projectileCount, pattern.spreadRadians);
      if (isHazard) {
        if (typeof spawnHazard === 'function') spawnHazard(enemy, pattern, beatIndex);
      } else {
        for (const angle of angles) {
          spawnProjectile(enemy, {
            angle,
            speed: pattern.projectileSpeed,
            damage: pattern.damage,
            noteName: enemy.soundNote,
            patternId: pattern.id,
            homing: pattern.homing === true,
            homingTurnRate: pattern.homingTurnRate,
            projectileLifetime: pattern.projectileLifetime,
          });
        }
      }
      if (pattern.deferSoundToActivation !== true && typeof playAttackSound === 'function') playAttackSound(enemy, pattern);
      enemy.composerActionPulseT = Math.max(Number(enemy.composerActionPulseT) || 0, 0.24);
      enemy.composerActionPulseDur = Math.max(Number(enemy.composerActionPulseDur) || 0, 0.24);
      attackCount += 1;
      if (typeof onAttack === 'function') {
        onAttack({
          beatIndex,
          enemy,
          profile,
          pattern,
          projectileCount: isHazard ? Math.max(1, Math.trunc(Number(pattern.beamCount) || 1)) : angles.length,
          burstShot: burstDue,
        });
      }
    }
    return attackCount;
  }

  return { reset, update };
}
