import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getEnemyCombatVisualRotationRuntime,
  preserveOnboardingAsteroidDriftRuntime,
  updateEnemyMovementFacingRuntime,
} from '../src/beat-swarm/beat-swarm-enemy-update.js';

test('onboarding rocks retain their initial ballistic drift', () => {
  const rock = {
    enemyType: 'onboarding-asteroid',
    vx: -42,
    vy: 13,
  };
  assert.equal(preserveOnboardingAsteroidDriftRuntime(rock), true);
  rock.vx = 90;
  rock.vy = -80;
  assert.equal(preserveOnboardingAsteroidDriftRuntime(rock), true);
  assert.equal(rock.vx, -42);
  assert.equal(rock.vy, 13);
  assert.equal(preserveOnboardingAsteroidDriftRuntime({ enemyType: 'composer' }), false);
});

test('lead-ball reserve rocks retain ballistic drift instead of following the arena', () => {
  const rock = {
    enemyType: 'onboarding-asteroid',
    leadBallReserve: true,
    wx: 0,
    wy: 0,
    vx: -84,
    vy: 27,
  };
  assert.equal(preserveOnboardingAsteroidDriftRuntime(rock, { x: 100, y: 200 }), true);
  rock.vx = 320;
  rock.vy = -250;
  assert.equal(preserveOnboardingAsteroidDriftRuntime(rock, { x: 1200, y: -900 }), true);
  assert.equal(rock.vx, -84);
  assert.equal(rock.vy, 27);
});

test('lead-ball reserve rocks ignore screen conversion and arena displacement', () => {
  const rock = {
    enemyType: 'onboarding-asteroid',
    leadBallReserve: true,
    wx: 0,
    wy: 0,
    vx: 76,
    vy: -31,
  };
  preserveOnboardingAsteroidDriftRuntime(rock, { x: 0, y: 0 }, () => ({ x: 9999, y: 9999 }), 0.1);
  assert.equal(rock.wx, 0);
  assert.equal(rock.wy, 0);
  assert.equal(rock.vx, 76);
  assert.equal(rock.vy, -31);
  preserveOnboardingAsteroidDriftRuntime(rock, { x: -5000, y: 4000 }, () => ({ x: -9999, y: -9999 }), 0.1);
  assert.equal(rock.vx, 76);
  assert.equal(rock.vy, -31);
});

test('uses the actual combat angle for rightward-authored projectile art', () => {
  assert.equal(
    getEnemyCombatVisualRotationRuntime({
      combatFacingAngle: 0,
      enemyTier: 'elite',
      abilityFamily: 'projectile',
    }),
    0,
  );
  assert.equal(
    getEnemyCombatVisualRotationRuntime({
      combatFacingAngle: Math.PI,
      gameplayDescriptor: { tier: 'elite' },
      combatProfileId: 'gunner',
    }),
    Math.PI,
  );
});

test('does not offset non-projectile combat angles', () => {
  assert.equal(
    getEnemyCombatVisualRotationRuntime({
      combatFacingAngle: Math.PI * 0.25,
      enemyTier: 'elite',
      abilityFamily: 'laser',
    }),
    Math.PI * 0.25,
  );
  assert.equal(getEnemyCombatVisualRotationRuntime({ enemyTier: 'elite' }), null);
});

test('turns directional silhouettes toward movement while preserving active attack aim', () => {
  const moving = {
    vx: 0,
    vy: 120,
    combatFacingAngle: 0,
    gameplayDescriptor: { abilityFamily: 'charge', abilitySilhouette: 'forward_charge' },
  };
  assert.equal(updateEnemyMovementFacingRuntime(moving, 1), true);
  assert.equal(moving.combatFacingAngle, Math.PI * 0.5);

  const firing = {
    vx: 0,
    vy: 120,
    combatFacingAngle: 0,
    combatFireVisualStartedAtMs: 100,
    gameplayDescriptor: { abilityFamily: 'charge', abilitySilhouette: 'forward_charge' },
  };
  assert.equal(updateEnemyMovementFacingRuntime(firing, 1), false);
  assert.equal(firing.combatFacingAngle, 0);
});

test('player-targeting enemies track the player while static formation lasers retain their aim', () => {
  const gunner = {
    wx: 10,
    wy: 10,
    vx: 100,
    vy: 0,
    combatFacingAngle: 0,
    combatProfileId: 'gunner',
    combatPatternId: 'straight',
  };
  assert.equal(updateEnemyMovementFacingRuntime(gunner, 1, { x: 10, y: 110 }), true);
  assert.equal(gunner.combatFacingAngle, Math.PI * 0.5);

  const staticLaser = {
    wx: 10,
    wy: 10,
    vx: 0,
    vy: 100,
    combatFacingAngle: 0.75,
    combatProfileId: 'laser_spinner',
    combatPatternId: 'arena_beam_thin',
  };
  assert.equal(updateEnemyMovementFacingRuntime(staticLaser, 1, { x: 10, y: 110 }), false);
  assert.equal(staticLaser.combatFacingAngle, 0.75);
});

test('draw snakes retain trail-defined orientation instead of tracking the player', () => {
  const snake = {
    enemyType: 'drawsnake',
    wx: 10,
    wy: 10,
    vx: 100,
    vy: 0,
    combatFacingAngle: 0.75,
    gameplayDescriptor: { abilityFamily: 'projectile', abilitySilhouette: 'forward_cannon' },
  };
  assert.equal(updateEnemyMovementFacingRuntime(snake, 1, { x: 10, y: 110 }), false);
  assert.equal(Object.hasOwn(snake, 'combatFacingAngle'), false);
  assert.equal(getEnemyCombatVisualRotationRuntime(snake), null);
});
