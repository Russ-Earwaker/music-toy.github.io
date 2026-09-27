import assert from 'node:assert/strict';
import test from 'node:test';
import { createViewportSpace } from '../src/coordinates/viewport-space.js';
import {
  createBeatSwarmProjectionBridge,
  projectBeatSwarmLogicalToScreen,
  projectBeatSwarmScreenToLogical,
} from '../src/beat-swarm/beat-swarm-viewport-space.js';
import {
  clampBeatSwarmPairCenterLogical,
  getBeatSwarmFormationAnchorLogical,
  reflectBeatSwarmLogicalMotion,
} from '../src/beat-swarm/beat-swarm-logical-movement.js';
import { keepDrawSnakeEnemyOnscreenRuntime } from '../src/beat-swarm/beat-swarm-enemy-update.js';
import { buildBeatSwarmBehavioralFormationEnemyRuntime } from '../src/beat-swarm/beat-swarm-behavioral-runtime.js';

const displays = [
  [1280, 720], [1600, 900], [1920, 1080], [1440, 900], [1024, 768], [2560, 1080],
];

function makeBridge(width, height) {
  const viewport = createViewportSpace({
    logicalWidth: 1600,
    logicalHeight: 900,
    displayRect: { left: 0, top: 0, width, height },
  });
  return createBeatSwarmProjectionBridge({
    getViewportSpace: () => viewport,
    boardWorldToScreen: (point) => projectBeatSwarmLogicalToScreen(viewport, point),
    boardScreenToWorld: (point) => projectBeatSwarmScreenToLogical(viewport, point),
  });
}

test('lead-ball logical boundary reflection is aspect-ratio invariant', () => {
  const cases = [
    { position: { x: 20, y: 450 }, velocity: { x: -900, y: 120 } },
    { position: { x: 1585, y: 450 }, velocity: { x: 900, y: 120 } },
    { position: { x: 800, y: 20 }, velocity: { x: 120, y: -900 } },
    { position: { x: 800, y: 885 }, velocity: { x: 120, y: 900 } },
    { position: { x: 10, y: 890 }, velocity: { x: -600, y: 600 } },
  ];
  for (const item of cases) {
    const expected = reflectBeatSwarmLogicalMotion(item.position, item.velocity, 48.3);
    for (const [width, height] of displays) {
      const bridge = makeBridge(width, height);
      const world = bridge.logicalToWorld(item.position);
      const logical = bridge.worldToLogical(world);
      assert.deepEqual(reflectBeatSwarmLogicalMotion(logical, item.velocity, 48.3), expected);
      assert.equal(Math.hypot(expected.velocity.x, expected.velocity.y), Math.hypot(item.velocity.x, item.velocity.y));
    }
  }
});

test('draw-snake edge-return steering follows logical bounds on every display', () => {
  for (const [width, height] of displays) {
    const bridge = makeBridge(width, height);
    const enemy = {
      enemyType: 'drawsnake',
      wx: 1700,
      wy: 450,
      vx: 100,
      vy: 20,
      drawsnakeMoveAngle: 0,
      drawsnakeHasEnteredScreen: true,
    };
    keepDrawSnakeEnemyOnscreenRuntime({
      enemy,
      dt: 0.1,
      constants: { drawSnakeMarginLogical: 140, drawSnakeEdgePullRate: 8 },
      helpers: {
        worldToLogical: (point) => bridge.worldToLogical(point),
        logicalToWorld: (point) => bridge.logicalToWorld(point),
        worldToScreen: (point) => bridge.logicalToScreen(point),
      },
    });
    assert.ok(Math.abs(enemy.wx - 1508) < 1e-9);
    assert.equal(enemy.wy, 450);
    assert.equal(enemy.vx, 86);
    assert.equal(enemy.vy, 17.2);
  }
});

test('behavioral path targets and distances are aspect-ratio invariant', () => {
  const enemy = {
    id: 17,
    formationMemberIndex: 3,
    formationMemberCount: 5,
    behavioralFormationArchetype: 'winding_chain',
    behavioralFormationActive: true,
    behavioralFormationIntensity: 0.55,
  };
  for (const [width, height] of displays) {
    const bridge = makeBridge(width, height);
    const runtime = buildBeatSwarmBehavioralFormationEnemyRuntime({
      enemy,
      helpers: { logicalToWorld: (point) => bridge.logicalToWorld(point) },
    });
    const targetLogical = bridge.worldToLogical(runtime.targetWorld);
    assert.ok(Math.abs(targetLogical.x - 872) < 1e-9);
    assert.ok(Math.abs(targetLogical.y - 229.5) < 1e-9);
    assert.ok(Math.abs(runtime.followDistanceWorld - 51) < 1e-9);
    assert.ok(Math.abs(runtime.lateralOffsetWorld - 13) < 1e-9);
  }
});

test('protected formation movement anchors are fixed logical geometry', () => {
  const enemy = {
    formationArchetype: 'syncopation_stair',
    formationSpawnRegion: 'side_diagonal',
    formationMemberIndex: 2,
    formationMemberCount: 4,
  };
  const anchor = getBeatSwarmFormationAnchorLogical(enemy);
  assert.deepEqual(anchor, { x: 1280, y: 387 });
  for (const [width, height] of displays) {
    const bridge = makeBridge(width, height);
    assert.deepEqual(bridge.worldToLogical(bridge.logicalToWorld(anchor)), anchor);
  }
});

test('paired-dance safe centre uses logical 20-80 percent bounds', () => {
  assert.deepEqual(clampBeatSwarmPairCenterLogical({ x: -50, y: 1000 }), { x: 320, y: 720 });
  assert.deepEqual(clampBeatSwarmPairCenterLogical({ x: 900, y: 500 }), { x: 900, y: 500 });
  for (const [width, height] of displays) {
    const bridge = makeBridge(width, height);
    const clamped = clampBeatSwarmPairCenterLogical(bridge.worldToLogical(bridge.logicalToWorld({ x: -50, y: 1000 })));
    assert.deepEqual(clamped, { x: 320, y: 720 });
  }
});
