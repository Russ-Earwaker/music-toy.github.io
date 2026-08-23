import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveBeatSwarmOneShotOrbitTiming,
} from '../src/beat-swarm/beat-swarm-enemy-update.js';

test('initializes a reset one-shot orbit instead of treating null as timestamp zero', () => {
  const timing = resolveBeatSwarmOneShotOrbitTiming(null, 12000, 5600);

  assert.equal(timing.startedAtMs, 12000);
  assert.equal(timing.progress, 0);
  assert.equal(timing.completed, false);
});

test('completes a one-shot orbit only after its full duration', () => {
  const midway = resolveBeatSwarmOneShotOrbitTiming(1000, 3800, 5600);
  const complete = resolveBeatSwarmOneShotOrbitTiming(1000, 6600, 5600);

  assert.equal(midway.progress, 0.5);
  assert.equal(midway.completed, false);
  assert.equal(complete.progress, 1);
  assert.equal(complete.completed, true);
});
