import test from 'node:test';
import assert from 'node:assert/strict';

import { getEnemyCombatVisualRotationRuntime } from '../src/beat-swarm/beat-swarm-enemy-update.js';

test('uses the actual combat angle for elite art', () => {
  assert.equal(
    getEnemyCombatVisualRotationRuntime({ combatFacingAngle: 0, enemyTier: 'elite' }),
    0,
  );
  assert.equal(
    getEnemyCombatVisualRotationRuntime({
      combatFacingAngle: Math.PI,
      gameplayDescriptor: { tier: 'elite' },
    }),
    Math.PI,
  );
});

test('does not offset basic enemy combat angles', () => {
  assert.equal(
    getEnemyCombatVisualRotationRuntime({ combatFacingAngle: Math.PI * 0.25, enemyTier: 'basic' }),
    Math.PI * 0.25,
  );
  assert.equal(getEnemyCombatVisualRotationRuntime({ enemyTier: 'elite' }), null);
});
