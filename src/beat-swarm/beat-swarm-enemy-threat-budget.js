const ENERGY_BUDGETS = Object.freeze({
  intro: Object.freeze({ live: 5, entry: 4 }),
  silent: Object.freeze({ live: 3.5, entry: 3 }),
  low: Object.freeze({ live: 6.5, entry: 6 }),
  medium: Object.freeze({ live: 9, entry: 9 }),
  build: Object.freeze({ live: 12, entry: 12 }),
  clash: Object.freeze({ live: 14, entry: 14 }),
  peak: Object.freeze({ live: 16, entry: 16 }),
  release: Object.freeze({ live: 8.5, entry: 7 }),
  settle: Object.freeze({ live: 7, entry: 6 }),
});

const ABILITY_COST = Object.freeze({
  wind_push: 0.12,
  support: 0.18,
  projectile: 0.36,
  local_explosion: 0.52,
  charge: 0.62,
  laser: 0.78,
  arena_shape: 0.82,
  summoning: 0.9,
});

const MOVEMENT_COST = Object.freeze({
  anchored: 0,
  drift: 0.05,
  hold_position: 0.05,
  orbit: 0.14,
  orbital: 0.14,
  pursuit: 0.2,
  winding_path: 0.22,
});

function normalizeToken(value, fallback = '') {
  const token = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  return token || fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function round3(value) {
  return Number((Number(value) || 0).toFixed(3));
}

function descriptorFor(enemyLike = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : {};
  const descriptor = enemy?.gameplayDescriptor && typeof enemy.gameplayDescriptor === 'object'
    ? enemy.gameplayDescriptor
    : {};
  return {
    tier: normalizeToken(descriptor.tier || enemy.enemyTier, 'basic'),
    scale: normalizeToken(descriptor.scale || enemy.enemyScale, 'small'),
    ownership: normalizeToken(descriptor.musicalOwnership || enemy.musicalOwnership, 'core_lane'),
    abilityFamily: normalizeToken(descriptor.abilityFamily || enemy.abilityFamily, 'projectile'),
    movementFamily: normalizeToken(descriptor.movementFamily || enemy.movementFamily, 'drift'),
    formationMembership: normalizeToken(descriptor.formationMembership || enemy.formationMembership, 'individual'),
    laneId: normalizeToken(
      descriptor.laneId || enemy.assignedMusicLaneId || enemy.musicLaneId || enemy.foundationLaneId,
    ),
  };
}

export function estimateBeatSwarmEnemyThreatCost(enemyLike = null, options = null) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : {};
  const opts = options && typeof options === 'object' ? options : {};
  const descriptor = descriptorFor(enemy);
  if (enemy.onboardingAsteroid === true || normalizeToken(enemy.enemyType) === 'onboarding-asteroid') {
    return Object.freeze({
      total: 0.18,
      body: 0.18,
      tier: 0,
      durability: 0,
      ability: 0,
      movement: 0,
      formation: 0,
      descriptor: Object.freeze({
        ...descriptor,
        tier: 'basic',
        ownership: 'ambient_target',
        abilityFamily: 'none',
        movementFamily: 'ballistic_drift',
      }),
      maxHp: round3(Math.max(1, Number(enemy.maxHp ?? enemy.hp) || 1)),
      baselineHp: round3(Math.max(1, Number(opts.baselineHp) || 8)),
    });
  }
  const baselineHp = Math.max(1, Number(opts.baselineHp) || 8);
  const maxHp = Math.max(1, Number(enemy.maxHp ?? enemy.hp) || baselineHp);
  const body = descriptor.scale === 'large' ? 1.35 : 0.72;
  const tier = descriptor.tier === 'boss' ? 3.5 : (descriptor.tier === 'elite' ? 0.72 : 0);
  const ability = ABILITY_COST[descriptor.abilityFamily] ?? ABILITY_COST.projectile;
  const movement = MOVEMENT_COST[descriptor.movementFamily] ?? 0.1;
  const formation = descriptor.formationMembership === 'elite_formation'
    ? 0.22
    : (descriptor.formationMembership === 'lane_group' ? 0.06 : 0);
  const healthRatio = maxHp / baselineHp;
  const durability = clamp(Math.log2(1 + healthRatio) * 0.22, 0.18, descriptor.tier === 'boss' ? 2.5 : 1.35);
  const cadenceScale = clamp(Number(enemy.threatCadenceScale ?? enemy.combatCadenceScale) || 1, 0.5, 2);
  const coverageScale = clamp(Number(enemy.threatCoverageScale ?? enemy.combatCoverageScale) || 1, 0.5, 2);
  const offense = ability * cadenceScale * coverageScale;
  const total = Math.max(0.1, body + tier + durability + offense + movement + formation);
  return Object.freeze({
    total: round3(total),
    body: round3(body),
    tier: round3(tier),
    durability: round3(durability),
    ability: round3(offense),
    movement: round3(movement),
    formation: round3(formation),
    descriptor: Object.freeze(descriptor),
    maxHp: round3(maxHp),
    baselineHp: round3(baselineHp),
  });
}

export function summarizeBeatSwarmBattlefieldThreat(enemiesLike = null, options = null) {
  const enemies = Array.isArray(enemiesLike) ? enemiesLike : [];
  const opts = options && typeof options === 'object' ? options : {};
  const requiredLimits = opts.requiredCoreBodiesByLane && typeof opts.requiredCoreBodiesByLane === 'object'
    ? opts.requiredCoreBodiesByLane
    : null;
  const requiredCounts = Object.create(null);
  let requiredCoreCost = 0;
  let optionalCost = 0;
  let eliteCost = 0;
  let totalCost = 0;
  let coreBodies = 0;
  let optionalBodies = 0;
  let ambientBodies = 0;
  const byAbility = {};
  const entries = [];
  for (const enemy of enemies) {
    if (!enemy || enemy.retreating === true || enemy.__bsRemoved === true || Number(enemy.hp) <= 0) continue;
    const estimate = estimateBeatSwarmEnemyThreatCost(enemy, options);
    const coreCandidate = estimate.descriptor.ownership === 'core_lane' && estimate.descriptor.tier === 'basic';
    const laneId = estimate.descriptor.laneId || 'unassigned';
    const laneLimit = requiredLimits
      ? Math.max(0, Math.trunc(Number(requiredLimits[laneId]) || 0))
      : Number.POSITIVE_INFINITY;
    const requiredCore = coreCandidate && (Math.max(0, requiredCounts[laneId] || 0) < laneLimit);
    if (requiredCore) requiredCounts[laneId] = Math.max(0, requiredCounts[laneId] || 0) + 1;
    totalCost += estimate.total;
    if (requiredCore) {
      requiredCoreCost += estimate.total;
      coreBodies += 1;
    } else {
      optionalCost += estimate.total;
      if (estimate.descriptor.ownership === 'ambient_target') ambientBodies += 1;
      else optionalBodies += 1;
    }
    if (estimate.descriptor.tier === 'elite') eliteCost += estimate.total;
    byAbility[estimate.descriptor.abilityFamily] = round3(
      (Number(byAbility[estimate.descriptor.abilityFamily]) || 0) + estimate.total,
    );
    entries.push(Object.freeze({
      id: Math.max(0, Math.trunc(Number(enemy.id) || 0)),
      enemyType: normalizeToken(enemy.enemyType, 'unknown'),
      requiredCore,
      cost: estimate.total,
      descriptor: estimate.descriptor,
    }));
  }
  return Object.freeze({
    totalCost: round3(totalCost),
    requiredCoreCost: round3(requiredCoreCost),
    optionalCost: round3(optionalCost),
    eliteCost: round3(eliteCost),
    totalBodies: coreBodies + optionalBodies + ambientBodies,
    combatBodies: coreBodies + optionalBodies,
    ambientBodies,
    coreBodies,
    optionalBodies,
    byAbility: Object.freeze(byAbility),
    requiredCoreBodiesByLane: Object.freeze({ ...requiredCounts }),
    entries: Object.freeze(entries),
  });
}

export function getBeatSwarmAdaptiveThreatBudget(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const energyState = normalizeToken(opts.energyState, 'low');
  const profile = ENERGY_BUDGETS[energyState] || ENERGY_BUDGETS.low;
  const pressure = clamp(opts.targetPressure, 0, 1);
  const difficulty = clamp(opts.difficultyRamp, 0, 1);
  const baselinePlayerDps = Math.max(1, Number(opts.baselinePlayerDps) || 16);
  const measuredPlayerDps = Math.max(1, Number(opts.playerDps) || baselinePlayerDps);
  const simulatedPowerMultiplier = clamp(opts.simulatedPowerMultiplier || 1, 0.5, 3);
  const effectivePlayerDps = measuredPlayerDps * simulatedPowerMultiplier;
  const playerPowerFactor = clamp(Math.sqrt(effectivePlayerDps / baselinePlayerDps), 0.75, 2.25);
  const difficultyFactor = 0.9 + (difficulty * 0.35);
  const pressureAllowance = pressure * 3.5;
  const requiredCoreCost = Math.max(0, Number(opts.requiredCoreCost) || 0);
  const discretionaryLive = (profile.live + pressureAllowance) * playerPowerFactor * difficultyFactor;
  const liveLimit = Math.max(requiredCoreCost, requiredCoreCost + discretionaryLive);
  const entryLimit = profile.entry * playerPowerFactor * (0.9 + (difficulty * 0.25));
  return Object.freeze({
    energyState,
    liveLimit: round3(liveLimit),
    discretionaryLiveLimit: round3(discretionaryLive),
    entryLimit: round3(entryLimit),
    requiredCoreCost: round3(requiredCoreCost),
    measuredPlayerDps: round3(measuredPlayerDps),
    simulatedPowerMultiplier: round3(simulatedPowerMultiplier),
    effectivePlayerDps: round3(effectivePlayerDps),
    playerPowerFactor: round3(playerPowerFactor),
    difficultyFactor: round3(difficultyFactor),
    targetPressure: round3(pressure),
  });
}

export function evaluateBeatSwarmThreatAdmission(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const current = opts.current && typeof opts.current === 'object' ? opts.current : {};
  const budget = opts.budget && typeof opts.budget === 'object' ? opts.budget : {};
  const candidateCost = Math.max(0, Number(opts.candidateCost) || 0);
  const entryUsed = Math.max(0, Number(opts.entryUsed) || 0);
  const mandatory = opts.mandatory === true;
  const projectedLiveCost = Math.max(0, Number(current.totalCost) || 0) + candidateCost;
  const projectedEntryCost = entryUsed + candidateCost;
  const currentBodies = Math.max(0, Math.trunc(Number(opts.currentBodies ?? current.totalBodies) || 0));
  const candidateBodies = Math.max(0, Math.trunc(Number(opts.candidateBodies) || 0));
  const bodyLimit = Number.isFinite(Number(opts.bodyLimit))
    ? Math.max(0, Math.trunc(Number(opts.bodyLimit) || 0))
    : Number.POSITIVE_INFINITY;
  const projectedBodies = currentBodies + candidateBodies;
  const reasons = [];
  if (!mandatory && projectedLiveCost > Math.max(0, Number(budget.liveLimit) || 0)) reasons.push('live_threat_budget');
  if (!mandatory && projectedEntryCost > Math.max(0, Number(budget.entryLimit) || 0)) reasons.push('entry_threat_budget');
  if (!mandatory && projectedBodies > bodyLimit) reasons.push('live_body_budget');
  return Object.freeze({
    allowed: mandatory || reasons.length === 0,
    mandatory,
    reasons: Object.freeze(reasons),
    candidateCost: round3(candidateCost),
    currentLiveCost: round3(current.totalCost),
    projectedLiveCost: round3(projectedLiveCost),
    entryUsed: round3(entryUsed),
    projectedEntryCost: round3(projectedEntryCost),
    liveLimit: round3(budget.liveLimit),
    entryLimit: round3(budget.entryLimit),
    currentBodies,
    candidateBodies,
    projectedBodies,
    bodyLimit: Number.isFinite(bodyLimit) ? bodyLimit : null,
  });
}

export function getBeatSwarmStructuralBodyFloor(targetCarrierCountsLike = null, options = null) {
  const counts = targetCarrierCountsLike && typeof targetCarrierCountsLike === 'object'
    ? targetCarrierCountsLike
    : {};
  const opts = options && typeof options === 'object' ? options : {};
  const bodiesPerCarrier = Math.max(1, Math.trunc(Number(opts.bodiesPerCarrier) || 2));
  const foundationBodies = Math.max(
    bodiesPerCarrier,
    Math.trunc(Number(opts.foundationBodies) || bodiesPerCarrier),
  );
  const foundation = Math.max(0, Math.trunc(Number(counts.foundation) || 0));
  const secondary = Math.max(0, Math.trunc(Number(counts.secondary_loop_rhythm) || 0));
  const lead = Math.max(0, Math.trunc(Number(counts.primary_loop_lead) || 0));
  const ornament = Math.max(0, Math.trunc(Number(counts.ornament) || 0));
  return (foundation * foundationBodies) + ((secondary + lead + ornament) * bodiesPerCarrier);
}

export function estimateBeatSwarmThreatCandidate(options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const count = Math.max(1, Math.trunc(Number(opts.count) || 1));
  const estimate = estimateBeatSwarmEnemyThreatCost({
    maxHp: Math.max(1, Number(opts.maxHp) || Number(opts.baselineHp) || 8),
    gameplayDescriptor: {
      tier: opts.tier || 'elite',
      scale: opts.scale || 'small',
      musicalOwnership: opts.musicalOwnership || 'additive_motif',
      abilityFamily: opts.abilityFamily || 'projectile',
      movementFamily: opts.movementFamily || 'hold_position',
      formationMembership: opts.formationMembership || 'elite_formation',
    },
  }, opts);
  return Object.freeze({
    count,
    perEnemyCost: estimate.total,
    totalCost: round3(estimate.total * count),
    estimate,
  });
}
