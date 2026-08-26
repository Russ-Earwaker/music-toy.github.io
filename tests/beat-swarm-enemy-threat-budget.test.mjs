import test from 'node:test';
import assert from 'node:assert/strict';

import {
  estimateBeatSwarmEnemyThreatCost,
  estimateBeatSwarmThreatCandidate,
  evaluateBeatSwarmThreatAdmission,
  getBeatSwarmAdaptiveThreatBudget,
  getBeatSwarmStructuralBodyFloor,
  summarizeBeatSwarmBattlefieldThreat,
} from '../src/beat-swarm/beat-swarm-enemy-threat-budget.js';

function enemy(overrides = null) {
  return {
    id: 1,
    hp: 8,
    maxHp: 8,
    gameplayDescriptor: {
      tier: 'basic',
      scale: 'small',
      musicalOwnership: 'core_lane',
      abilityFamily: 'wind_push',
      movementFamily: 'drift',
      formationMembership: 'lane_group',
    },
    ...(overrides || {}),
  };
}

test('costs a large elite laser above a basic wind carrier', () => {
  const basic = estimateBeatSwarmEnemyThreatCost(enemy());
  const elite = estimateBeatSwarmEnemyThreatCost(enemy({
    maxHp: 64,
    gameplayDescriptor: {
      tier: 'elite',
      scale: 'large',
      musicalOwnership: 'additive_motif',
      abilityFamily: 'laser',
      movementFamily: 'pursuit',
      formationMembership: 'elite_formation',
    },
  }));
  assert.ok(elite.total > basic.total);
  assert.ok(elite.ability > basic.ability);
  assert.ok(elite.durability > basic.durability);
});

test('separates required core cost from optional elite cost', () => {
  const summary = summarizeBeatSwarmBattlefieldThreat([
    enemy({ id: 1 }),
    enemy({
      id: 2,
      gameplayDescriptor: {
        tier: 'elite',
        scale: 'small',
        musicalOwnership: 'additive_motif',
        abilityFamily: 'projectile',
        movementFamily: 'orbit',
        formationMembership: 'elite_formation',
      },
    }),
  ]);
  assert.equal(summary.coreBodies, 1);
  assert.equal(summary.optionalBodies, 1);
  assert.ok(summary.requiredCoreCost > 0);
  assert.ok(summary.eliteCost > 0);
});

test('treats onboarding rocks as low-cost ambient targets, not core lane bodies', () => {
  const rockEnemy = enemy({
    enemyType: 'onboarding-asteroid',
    onboardingAsteroid: true,
    maxHp: 100,
  });
  const rock = estimateBeatSwarmEnemyThreatCost(rockEnemy);
  const summary = summarizeBeatSwarmBattlefieldThreat([rockEnemy]);
  assert.equal(rock.total, 0.18);
  assert.equal(rock.descriptor.ownership, 'ambient_target');
  assert.equal(summary.coreBodies, 0);
  assert.equal(summary.combatBodies, 0);
  assert.equal(summary.ambientBodies, 1);
  assert.equal(summary.totalBodies, 1);
  assert.equal(summary.optionalBodies, 0);
});

test('classifies core bodies above a lane quota as discretionary', () => {
  const carriers = Array.from({ length: 4 }, (_, index) => enemy({
    id: index + 1,
    gameplayDescriptor: {
      tier: 'basic',
      scale: 'small',
      musicalOwnership: 'core_lane',
      abilityFamily: 'wind_push',
      movementFamily: 'drift',
      formationMembership: 'lane_group',
      laneId: 'foundation_lane',
    },
  }));
  const summary = summarizeBeatSwarmBattlefieldThreat(carriers, {
    requiredCoreBodiesByLane: { foundation_lane: 2 },
  });
  assert.equal(summary.coreBodies, 2);
  assert.equal(summary.optionalBodies, 2);
  assert.deepEqual(summary.requiredCoreBodiesByLane, { foundation_lane: 2 });
});

test('player power simulation raises live and entry budgets', () => {
  const base = getBeatSwarmAdaptiveThreatBudget({ energyState: 'medium', playerDps: 16 });
  const upgraded = getBeatSwarmAdaptiveThreatBudget({
    energyState: 'medium',
    playerDps: 16,
    simulatedPowerMultiplier: 2,
  });
  assert.ok(upgraded.liveLimit > base.liveLimit);
  assert.ok(upgraded.entryLimit > base.entryLimit);
  assert.equal(upgraded.effectivePlayerDps, 32);
});

test('mandatory core admission survives an exhausted optional budget', () => {
  const budget = getBeatSwarmAdaptiveThreatBudget({ energyState: 'low', requiredCoreCost: 6 });
  const current = { totalCost: budget.liveLimit };
  const optional = evaluateBeatSwarmThreatAdmission({ current, budget, candidateCost: 2 });
  const mandatory = evaluateBeatSwarmThreatAdmission({ current, budget, candidateCost: 2, mandatory: true });
  assert.equal(optional.allowed, false);
  assert.equal(optional.reasons.includes('live_threat_budget'), true);
  assert.equal(mandatory.allowed, true);
});

test('body readability remains a separate admission constraint', () => {
  const budget = getBeatSwarmAdaptiveThreatBudget({ energyState: 'peak' });
  const result = evaluateBeatSwarmThreatAdmission({
    current: { totalCost: 1, totalBodies: 12 },
    budget,
    candidateCost: 1,
    candidateBodies: 3,
    bodyLimit: 14,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reasons.includes('live_body_budget'), true);
});

test('medium budget admits one normal formation but meters an immediate second group', () => {
  const candidate = estimateBeatSwarmThreatCandidate({
    count: 3,
    tier: 'elite',
    scale: 'small',
    abilityFamily: 'projectile',
    formationMembership: 'elite_formation',
    baselineHp: 2,
    maxHp: 8,
  });
  const budget = getBeatSwarmAdaptiveThreatBudget({
    energyState: 'medium',
    playerDps: 8,
    baselinePlayerDps: 8,
    targetPressure: 0.45,
    difficultyRamp: 0.3,
    requiredCoreCost: 8,
  });
  const first = evaluateBeatSwarmThreatAdmission({
    current: { totalCost: 8 },
    budget,
    candidateCost: candidate.totalCost,
  });
  const second = evaluateBeatSwarmThreatAdmission({
    current: { totalCost: 8 + candidate.totalCost },
    budget,
    candidateCost: candidate.totalCost,
    entryUsed: candidate.totalCost,
  });
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.equal(second.reasons.includes('entry_threat_budget'), true);
});

test('structural body floor represents lane groups rather than lane count', () => {
  assert.equal(getBeatSwarmStructuralBodyFloor({
    foundation: 1,
    secondary_loop_rhythm: 1,
    primary_loop_lead: 1,
    ornament: 1,
  }), 8);
  assert.equal(getBeatSwarmStructuralBodyFloor({ foundation: 1 }, { foundationBodies: 3 }), 3);
});
