import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateBeatSwarmEliteSpawnBudget } from '../src/beat-swarm/beat-swarm-elite-budget.js';

test('blocks an elite without musical justification', () => {
  const result = evaluateBeatSwarmEliteSpawnBudget({
    energyState: 'peak',
    candidateKind: 'laser_hihat',
    candidateMembers: 3,
    musicallyJustified: false,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reasons.includes('not_musically_justified'), true);
});

test('allows a justified additive formation inside the build budget', () => {
  const result = evaluateBeatSwarmEliteSpawnBudget({
    energyState: 'build',
    targetPressure: 0.6,
    candidateKind: 'gunner_snare',
    candidateMembers: 3,
    musicallyJustified: true,
  });
  assert.equal(result.allowed, true);
  assert.deepEqual(result.reasons, []);
});

test('blocks excessive additive density and visual complexity', () => {
  const result = evaluateBeatSwarmEliteSpawnBudget({
    energyState: 'medium',
    targetPressure: 0.4,
    activeGroups: 1,
    activeMembers: 4,
    candidateKind: 'laser_lead',
    candidateMembers: 4,
    musicallyJustified: true,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reasons.includes('visual_group_cap'), true);
  assert.equal(result.reasons.includes('additive_density_budget'), true);
});
