import assert from 'node:assert/strict';
import test from 'node:test';
import { createViewportSpace } from '../src/coordinates/viewport-space.js';
import { logicalToScreen, screenToLogical } from '../src/coordinates/viewport-space.js';
import { getRandomOffscreenSpawnPointRuntime } from '../src/beat-swarm/beat-swarm-spawn-utils.js';
import { spawnComposerGroupOffscreenMembersRuntime } from '../src/beat-swarm/beat-swarm-composer-spawn.js';

const displays = [
  [1280, 720], [1600, 900], [1920, 1080], [1440, 900], [1024, 768], [2560, 1080],
];

function viewport(width, height) {
  return createViewportSpace({
    logicalWidth: 1600,
    logicalHeight: 900,
    displayRect: { left: 0, top: 0, width, height },
  });
}

function spawnPoint(group, memberIndex = 0, memberCount = 4) {
  return getRandomOffscreenSpawnPointRuntime({
    group,
    memberIndex,
    memberCount,
    constants: { logicalWidth: 1600, logicalHeight: 900, enemyFallbackSpawnMarginLogical: 42 },
    helpers: { randRange: (min, max) => min + ((max - min) * 0.375) },
  });
}

test('authored edge spawn geometry is independent of display size', () => {
  const groups = [
    { id: 2, formationSpawnRegion: 'lower_outer' },
    { id: 3, formationSpawnRegion: 'mid_side' },
    { id: 4, formationSpawnRegion: 'side_diagonal' },
    { id: 5, formationSpawnRegion: 'upper_mid' },
    { id: 6, formationSpawnRegion: 'lead_reply_edge' },
    { id: 8, behavioralFormationActive: true, behavioralFormationArchetype: 'winding_chain' },
    { id: 9, behavioralFormationActive: true, behavioralFormationArchetype: 'advancing_line' },
  ];

  for (const group of groups) {
    const logical = spawnPoint(group, 1, 4);
    for (const [width, height] of displays) {
      const space = viewport(width, height);
      const roundTrip = screenToLogical(space, logicalToScreen(space, logical));
      assert.ok(Math.abs(roundTrip.x - logical.x) < 1e-9);
      assert.ok(Math.abs(roundTrip.y - logical.y) < 1e-9);
    }
  }
});

test('all four random spawn edges use fixed logical bounds', () => {
  const originalRandom = Math.random;
  try {
    for (let edge = 0; edge < 4; edge += 1) {
      Math.random = () => (edge + 0.1) / 4;
      const point = spawnPoint({ id: 1 }, 0, 1);
      if (edge === 0) assert.equal(point.x, -42);
      if (edge === 1) assert.equal(point.x, 1642);
      if (edge === 2) assert.equal(point.y, -42);
      if (edge === 3) assert.equal(point.y, 942);
    }
  } finally {
    Math.random = originalRandom;
  }
});

test('composer advancing-line correction clamps against logical gameplay bounds', () => {
  const spawned = [];
  const group = {
    id: 3,
    behavioralFormationActive: true,
    behavioralFormationArchetype: 'advancing_line',
    memberIds: new Set(),
  };
  spawnComposerGroupOffscreenMembersRuntime({
    group,
    count: 2,
    getRandomOffscreenSpawnPoint: () => ({ x: 1650, y: 450 }),
    logicalToWorld: (point) => ({ ...point }),
    worldToLogical: (point) => ({ ...point }),
    spawnComposerGroupEnemyAt: (x, y, _group, index, count) => spawned.push({ x, y, index, count }),
  });
  assert.deepEqual(spawned, [
    { x: 1746, y: 450, index: 0, count: 2 },
    { x: 1746, y: 450, index: 1, count: 2 },
  ]);
  assert.equal(group.behavioralFormationPathOriginWorldX, 1746);
  assert.equal(group.behavioralFormationPathDirX, -1);
});

test('reference formation radii project uniformly and round trip logically', () => {
  const radii = [162, 171, 180, 189, 198, 211.5, 279, 306, 320, 340, 342, 350, 360, 390];
  for (const [width, height] of displays) {
    const space = viewport(width, height);
    for (const radius of radii) {
      const centre = logicalToScreen(space, { x: 800, y: 450 });
      const edge = logicalToScreen(space, { x: 800 + radius, y: 450 });
      assert.ok(Math.abs((edge.x - centre.x) / space.presentationScale - radius) < 1e-9);
    }
  }
});
