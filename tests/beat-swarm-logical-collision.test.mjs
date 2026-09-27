import assert from 'node:assert/strict';
import test from 'node:test';
import { createViewportSpace } from '../src/coordinates/viewport-space.js';
import {
  createBeatSwarmProjectionBridge,
  projectBeatSwarmLogicalToScreen,
  projectBeatSwarmScreenToLogical,
} from '../src/beat-swarm/beat-swarm-viewport-space.js';
import {
  createWorldLogicalCollision,
  isLogicalPointWithinRadius,
  isLogicalPointWithinSegment,
} from '../src/beat-swarm/beat-swarm-logical-collision.js';

const displays = [
  [1280, 720], [1600, 900], [1920, 1080], [1440, 900], [1024, 768], [2560, 1080],
];

function collisionForDisplay(width, height) {
  const viewport = createViewportSpace({
    logicalWidth: 1600,
    logicalHeight: 900,
    displayRect: { left: 0, top: 0, width, height },
  });
  const bridge = createBeatSwarmProjectionBridge({
    getViewportSpace: () => viewport,
    boardWorldToScreen: (point) => projectBeatSwarmLogicalToScreen(viewport, point),
    boardScreenToWorld: (point) => projectBeatSwarmScreenToLogical(viewport, point),
  });
  return { bridge, collision: createWorldLogicalCollision(bridge.worldToLogical) };
}

for (const [label, radius] of [
  ['projectile hit', 24],
  ['pickup collection', 46],
  ['AoE explosion', 220],
  ['enemy projectile/player', 30],
  ['pushback shockwave', 430],
]) {
  test(`${label} boundaries are invariant across display sizes`, () => {
    const center = { x: 800, y: 450 };
    for (const [width, height] of displays) {
      const { bridge, collision } = collisionForDisplay(width, height);
      const centerWorld = bridge.logicalToWorld(center);
      const point = (distance) => bridge.logicalToWorld({ x: center.x + distance, y: center.y });
      assert.equal(collision.pointWithinRadius(point(radius - 0.001), centerWorld, radius), true);
      assert.equal(collision.pointWithinRadius(point(radius), centerWorld, radius), true);
      assert.equal(collision.pointWithinRadius(point(radius + 0.001), centerWorld, radius), false);
    }
  });
}

test('laser collision uses logical segment extent and radius', () => {
  const start = { x: 200, y: 450 };
  const end = { x: 1400, y: 450 };
  for (const [width, height] of displays) {
    const { bridge, collision } = collisionForDisplay(width, height);
    const startWorld = bridge.logicalToWorld(start);
    const endWorld = bridge.logicalToWorld(end);
    for (const [offset, expected] of [[27.999, true], [28, true], [28.001, false]]) {
      const pointWorld = bridge.logicalToWorld({ x: 800, y: 450 + offset });
      assert.equal(collision.pointWithinSegment(pointWorld, startWorld, endWorld, 28), expected);
    }
    assert.equal(collision.pointWithinSegment(bridge.logicalToWorld({ x: 1500, y: 450 }), startWorld, endWorld, 28), false);
  }
});

test('logical predicates include exact circle and segment boundaries', () => {
  assert.equal(isLogicalPointWithinRadius({ x: 24, y: 0 }, { x: 0, y: 0 }, 24), true);
  assert.equal(isLogicalPointWithinRadius({ x: 24.001, y: 0 }, { x: 0, y: 0 }, 24), false);
  assert.equal(isLogicalPointWithinSegment({ x: 50, y: 10 }, { x: 0, y: 0 }, { x: 100, y: 0 }, 10), true);
  assert.equal(isLogicalPointWithinSegment({ x: 50, y: 10.001 }, { x: 0, y: 0 }, { x: 100, y: 0 }, 10), false);
});
