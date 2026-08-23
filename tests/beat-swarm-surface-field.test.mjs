import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBeatSwarmSurfaceFieldRuntime,
  getBeatSwarmArenaResistanceBandRadii,
} from '../src/beat-swarm/beat-swarm-surface-field.js';

test('places the inward stream between the arena ring and outer resistance limit', () => {
  const radii = getBeatSwarmArenaResistanceBandRadii(1100, 275);
  assert.ok(radii.innerRadius > 1100);
  assert.ok(radii.outerRadius < 1375);
  assert.ok(radii.outerRadius > radii.innerRadius);
});

test('captures one viewport projection per surface-field frame', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { innerWidth: 800, innerHeight: 600 };
  let projectionCalls = 0;
  const context = {
    clearRect() {},
    fillRect() {},
    set fillStyle(value) {},
    set globalAlpha(value) {},
  };
  const runtime = createBeatSwarmSurfaceFieldRuntime({
    getState: () => ({ arenaVisible: false, effects: [], dragPointerId: null }),
    helpers: {
      worldToScreen: ({ x, y }) => {
        projectionCalls += 1;
        return { x: x * 0.75 + 100, y: y * 0.75 + 50 };
      },
    },
  });
  try {
    runtime.setCanvas({
      width: 0,
      height: 0,
      getContext: () => context,
    });
    runtime.spawnDebris({ x: 200, y: 200 }, { count: 12 });
    runtime.update(1 / 60, null);
    assert.equal(projectionCalls, 2);
  } finally {
    globalThis.window = previousWindow;
  }
});
