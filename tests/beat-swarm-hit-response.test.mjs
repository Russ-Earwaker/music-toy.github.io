import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBeatSwarmPlayerHealthRuntime,
  isEnemyMusicalActivationVisualActiveRuntime,
  resolveBeatSwarmPlayerHitRuntime,
} from '../src/beat-swarm/beat-swarm-hit-response.js';

test('infinite health preserves health while applying one-second knockback immunity', () => {
  const state = createBeatSwarmPlayerHealthRuntime({ maximum: 100, infinite: true });
  const first = resolveBeatSwarmPlayerHitRuntime({
    state,
    nowMs: 1000,
    random: () => 0.5,
    hit: { sourceType: 'projectile', travelDirection: { x: 1, y: 0 }, damage: 25 },
  });
  assert.equal(first.knockbackApplied, true);
  assert.equal(first.currentHealth, 100);
  assert.deepEqual(first.direction, { x: 1, y: 0 });

  const second = resolveBeatSwarmPlayerHitRuntime({
    state,
    nowMs: 1500,
    hit: { sourceType: 'projectile', travelDirection: { x: 1, y: 0 }, damage: 25 },
  });
  assert.equal(second.knockbackApplied, false);
  assert.equal(second.currentHealth, 100);

  const third = resolveBeatSwarmPlayerHitRuntime({
    state,
    nowMs: 2000,
    hit: { sourceType: 'projectile', travelDirection: { x: 1, y: 0 }, damage: 25 },
  });
  assert.equal(third.knockbackApplied, true);
});

test('finite health takes damage and collisions push away from their source', () => {
  const state = createBeatSwarmPlayerHealthRuntime({ maximum: 80, infinite: false });
  const result = resolveBeatSwarmPlayerHitRuntime({
    state,
    nowMs: 10,
    hit: {
      sourceType: 'collision',
      sourcePosition: { x: 4, y: 0 },
      playerPosition: { x: 0, y: 0 },
      damage: 12,
    },
  });
  assert.equal(result.currentHealth, 68);
  assert.equal(result.direction.x, -1);
  assert.equal(result.direction.y, 0);
});

test('enemy musical activation is detectable', () => {
  const enemy = {};
  assert.equal(isEnemyMusicalActivationVisualActiveRuntime(enemy), false);
  enemy.combatFireVisualStartedAtMs = 1200;
  assert.equal(isEnemyMusicalActivationVisualActiveRuntime(enemy), true);
});
