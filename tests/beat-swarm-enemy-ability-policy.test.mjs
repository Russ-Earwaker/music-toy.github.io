import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BEAT_SWARM_LEVEL1_BASIC_ABILITY_PALETTE,
  resolveBeatSwarmLevel1BasicAbility,
} from '../src/beat-swarm/beat-swarm-enemy-ability-policy.js';

test('keeps the Level 1 basic ability palette intentionally narrow', () => {
  assert.deepEqual(BEAT_SWARM_LEVEL1_BASIC_ABILITY_PALETTE, [
    'projectile',
    'laser',
    'local_explosion',
  ]);
});

test('maps core musical lanes to stable readable ability families', () => {
  assert.equal(resolveBeatSwarmLevel1BasicAbility({ laneId: 'foundation_lane' }), 'projectile');
  assert.equal(resolveBeatSwarmLevel1BasicAbility({ laneId: 'secondary_loop_lane' }), 'local_explosion');
  assert.equal(resolveBeatSwarmLevel1BasicAbility({ laneId: 'primary_loop_lane' }), 'laser');
});

test('keeps onboarding carriers on the least disruptive ability', () => {
  assert.equal(resolveBeatSwarmLevel1BasicAbility({
    laneId: 'primary_loop_lane',
    role: 'lead',
    isIntroCarrier: true,
  }), 'projectile');
});

test('respects explicit action semantics and a restricted level palette', () => {
  assert.equal(resolveBeatSwarmLevel1BasicAbility({ actionType: 'composer-group-explosion' }), 'local_explosion');
  assert.equal(resolveBeatSwarmLevel1BasicAbility({
    actionType: 'composer-group-laser',
    abilityPalette: ['projectile'],
  }), 'projectile');
});
