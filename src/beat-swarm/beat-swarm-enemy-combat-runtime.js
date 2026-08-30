import {
  getBeatSwarmEnemyAttackPattern,
  getBeatSwarmEnemyCombatProfile,
} from './beat-swarm-enemy-combat-profiles.js?v=2026-08-10-musical-formations-v1';

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
  enemy.combatLastProcessedStep = null;
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
  let lastGlobalStep = null;

  function reset() {
    lastGlobalBeat = null;
    lastGlobalStep = null;
  }

  function update(options = null) {
    const beatIndex = normalizeBeat(options?.beatIndex);
    const stepIndex = Number.isFinite(Number(options?.stepIndex))
      ? normalizeBeat(options.stepIndex)
      : null;
    const beatChanged = lastGlobalBeat !== beatIndex;
    const stepChanged = stepIndex != null && lastGlobalStep !== stepIndex;
    if (!beatChanged && !stepChanged) return 0;
    lastGlobalBeat = beatIndex;
    if (stepIndex != null) lastGlobalStep = stepIndex;
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
      if (enemy.combatGroupMotifMuted === true) continue;
      const profile = getBeatSwarmEnemyCombatProfile(enemy.combatProfileId);
      const pattern = getBeatSwarmEnemyAttackPattern(profile?.id, enemy.combatPatternId);
      if (!profile || !pattern) continue;
      const motifSteps = Array.isArray(enemy.combatGroupMotifSteps)
        ? enemy.combatGroupMotifSteps.map((step) => normalizeBeat(step))
        : [];
      const motifLength = Math.max(1, Math.trunc(Number(enemy.combatGroupMotifLength) || 1));
      const motifEnabled = motifSteps.length > 0;
      const subdivisionsPerBeat = Math.max(1, Math.trunc(Number(enemy.combatGroupMotifSubdivisionsPerBeat) || 1));
      const subdivisionScheduled = motifEnabled && subdivisionsPerBeat > 1 && stepIndex != null;
      if (subdivisionScheduled) {
        if (!stepChanged || enemy.combatLastProcessedStep === stepIndex) continue;
        enemy.combatLastProcessedStep = stepIndex;
      } else {
        if (!beatChanged || enemy.combatLastProcessedBeat === beatIndex) continue;
        enemy.combatLastProcessedBeat = beatIndex;
      }

      if (pattern.requiresAnchor === true) {
        const anchorDistance = Math.hypot(
          (Number(enemy.combatAnchorX) || 0) - (Number(enemy.wx) || 0),
          (Number(enemy.combatAnchorY) || 0) - (Number(enemy.wy) || 0),
        );
        if (anchorDistance > Math.max(12, Number(pattern.anchorToleranceWorld) || 42)) {
          enemy.combatAnchorReady = false;
          enemy.combatNextAttackBeat = beatIndex + 1;
          continue;
        }
        if (enemy.combatAnchorReady !== true) {
          enemy.combatAnchorReady = true;
          options?.onAnchorReady?.({ beatIndex, enemy, profile, pattern, anchorDistance });
        }
        const syncGroupId = String(enemy.combatSyncGroupId || '').trim();
        if (syncGroupId && pattern.requiresGroupReady === true) {
          const groupReady = enemies
            .filter((candidate) => String(candidate?.combatSyncGroupId || '').trim() === syncGroupId)
            .every((candidate) => Math.hypot(
              (Number(candidate.combatAnchorX) || 0) - (Number(candidate.wx) || 0),
              (Number(candidate.combatAnchorY) || 0) - (Number(candidate.wy) || 0),
            ) <= Math.max(12, Number(pattern.anchorToleranceWorld) || 42));
          if (!groupReady) {
            enemy.combatNextAttackBeat = beatIndex + 1;
            continue;
          }
        }
      }

      const motifStartBeat = normalizeBeat(enemy.combatGroupMotifStartBeat);
      const motifStartStep = Number.isFinite(Number(enemy.combatGroupMotifStartStep))
        ? normalizeBeat(enemy.combatGroupMotifStartStep)
        : motifStartBeat * subdivisionsPerBeat;
      const timelineIndex = subdivisionScheduled ? stepIndex : beatIndex;
      const motifStartIndex = subdivisionScheduled ? motifStartStep : motifStartBeat;
      const warningLeadSteps = motifEnabled && pattern.deferSoundToActivation === true
        ? Math.max(0, Math.trunc(Number(pattern.warningBeats) || 0))
          * (subdivisionScheduled ? subdivisionsPerBeat : 1)
        : 0;
      if (motifEnabled && timelineIndex < motifStartIndex - warningLeadSteps) {
        enemy.combatNextAttackBeat = motifStartBeat;
        continue;
      }
      const warningMotifStep = motifEnabled
        ? ((timelineIndex - motifStartIndex) % motifLength + motifLength) % motifLength
        : -1;
      // Deferred hazards treat authored motif positions as the audible/active
      // moment. Begin their warning early enough for activation to land there.
      const motifStep = motifEnabled
        ? (warningMotifStep + warningLeadSteps) % motifLength
        : -1;
      const motifDue = motifEnabled && motifSteps.includes(motifStep);
      if (motifEnabled && !motifDue) {
        enemy.combatNextAttackBeat = beatIndex + 1;
        continue;
      }
      if (motifDue && enemy.combatGroupMotifNoteByStep && typeof enemy.combatGroupMotifNoteByStep === 'object') {
        const stepNote = String(enemy.combatGroupMotifNoteByStep[motifStep] || '').trim();
        if (stepNote) enemy.soundNote = stepNote;
      }

      if (!Number.isFinite(Number(enemy.combatNextAttackBeat)) || motifEnabled) enemy.combatNextAttackBeat = beatIndex;
      const burstDue = !motifEnabled && Number(enemy.combatBurstRemaining) > 0
        && Number.isFinite(Number(enemy.combatBurstNextBeat))
        && beatIndex >= normalizeBeat(enemy.combatBurstNextBeat);
      const attackDue = motifEnabled ? motifDue : beatIndex >= normalizeBeat(enemy.combatNextAttackBeat);
      if (!burstDue && !attackDue) continue;

      if (attackDue && !burstDue) {
        enemy.combatNextAttackBeat = beatIndex + Math.max(1, Math.trunc(Number(pattern.cadenceBeats) || 1));
        const burstCount = motifEnabled ? 1 : Math.max(1, Math.trunc(Number(pattern.burstCount) || 1));
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
        if (typeof spawnHazard === 'function') {
          spawnHazard(enemy, pattern, beatIndex, {
            stepIndex,
            subdivisionsPerBeat: subdivisionScheduled ? subdivisionsPerBeat : 1,
          });
        }
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
      if (pattern.deferSoundToActivation !== true && typeof playAttackSound === 'function') {
        playAttackSound(enemy, pattern, { beatIndex, stepIndex });
      }
      enemy.composerActionPulseT = Math.max(Number(enemy.composerActionPulseT) || 0, 0.24);
      enemy.composerActionPulseDur = Math.max(Number(enemy.composerActionPulseDur) || 0, 0.24);
      attackCount += 1;
      if (typeof onAttack === 'function') {
        onAttack({
          beatIndex,
          stepIndex,
          motifStep,
          warningMotifStep,
          warningLeadSteps,
          subdivisionsPerBeat: subdivisionScheduled ? subdivisionsPerBeat : 1,
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
