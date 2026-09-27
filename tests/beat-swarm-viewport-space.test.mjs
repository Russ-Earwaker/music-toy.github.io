import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewportSpace } from '../src/coordinates/viewport-space.js';
import {
  BEAT_SWARM_LOGICAL_BOUNDS,
  BEAT_SWARM_LOGICAL_CENTER,
  BEAT_SWARM_LOGICAL_SIZE,
  classifyBeatSwarmScreenPoint,
  createBeatSwarmPlayerAnchorSnapshot,
  createBeatSwarmProjectionBridge,
  createBeatSwarmViewportDebugSnapshot,
  isLogicalPointInsideGameplay,
  projectBeatSwarmLogicalToScreen,
  projectBeatSwarmScreenToLogical,
} from '../src/beat-swarm/beat-swarm-viewport-space.js';

function makeViewport(width, height, left = 0, top = 0) {
  return createViewportSpace({
    logicalWidth: BEAT_SWARM_LOGICAL_SIZE.width,
    logicalHeight: BEAT_SWARM_LOGICAL_SIZE.height,
    displayRect: { left, top, width, height },
  });
}

const fitCases = [
  { name: '1920x1080', width: 1920, height: 1080, scale: 1.2, left: 0, top: 0 },
  { name: '1280x720', width: 1280, height: 720, scale: 0.8, left: 0, top: 0 },
  { name: '1440x900', width: 1440, height: 900, scale: 0.9, left: 0, top: 45 },
  { name: '1024x768', width: 1024, height: 768, scale: 0.64, left: 0, top: 96 },
  { name: '2560x1080 ultrawide', width: 2560, height: 1080, scale: 1.2, left: 320, top: 0 },
];

for (const item of fitCases) {
  test(`BeatSwarm fixed viewport contains into ${item.name}`, () => {
    const viewport = makeViewport(item.width, item.height);
    assert.equal(viewport.presentationScale, item.scale);
    assert.equal(viewport.contentRect.left, item.left);
    assert.equal(viewport.contentRect.top, item.top);
    assert.equal(viewport.contentRect.width, 1600 * item.scale);
    assert.equal(viewport.contentRect.height, 900 * item.scale);
    assert.deepEqual(projectBeatSwarmLogicalToScreen(viewport, BEAT_SWARM_LOGICAL_CENTER), {
      x: item.width * 0.5,
      y: item.height * 0.5,
    });
  });
}

test('BeatSwarm exposes stable logical bounds', () => {
  assert.deepEqual(BEAT_SWARM_LOGICAL_BOUNDS, {
    left: 0, top: 0, right: 1600, bottom: 900, width: 1600, height: 900,
  });
});

test('BeatSwarm screen and logical projection round trip', () => {
  const viewport = makeViewport(1440, 900, 20, 10);
  const logical = { x: 321.25, y: 678.5 };
  const roundTrip = projectBeatSwarmScreenToLogical(
    viewport,
    projectBeatSwarmLogicalToScreen(viewport, logical),
  );
  assert.ok(Math.abs(roundTrip.x - logical.x) < 1e-9);
  assert.ok(Math.abs(roundTrip.y - logical.y) < 1e-9);
});

test('pointer classification distinguishes gameplay, letterbox, and browser exterior', () => {
  const viewport = makeViewport(1440, 900);
  assert.deepEqual(classifyBeatSwarmScreenPoint(viewport, { x: 720, y: 450 }), {
    insideDisplay: true,
    insideGameplayContent: true,
    outsideGameplayInsideDisplay: false,
  });
  assert.deepEqual(classifyBeatSwarmScreenPoint(viewport, { x: 720, y: 20 }), {
    insideDisplay: true,
    insideGameplayContent: false,
    outsideGameplayInsideDisplay: true,
  });
  assert.deepEqual(classifyBeatSwarmScreenPoint(viewport, { x: -1, y: 20 }), {
    insideDisplay: false,
    insideGameplayContent: false,
    outsideGameplayInsideDisplay: false,
  });
});

test('resizing changes projection without mutating logical coordinates', () => {
  const logical = Object.freeze({ x: 800, y: 450 });
  let viewport = makeViewport(1280, 720);
  const bridge = createBeatSwarmProjectionBridge({ getViewportSpace: () => viewport });
  assert.deepEqual(bridge.logicalToScreen(logical), { x: 640, y: 360 });
  viewport = makeViewport(1024, 768);
  assert.deepEqual(bridge.logicalToScreen(logical), { x: 512, y: 384 });
  assert.deepEqual(logical, { x: 800, y: 450 });
});

test('player anchor keeps logical and world positions invariant across resize', () => {
  const worldPosition = Object.freeze({ x: 4123.5, y: -876.25 });
  const cases = [
    { from: [1600, 900], to: [1920, 1080], expectedScreen: { x: 960, y: 540 } },
    { from: [1920, 1080], to: [1280, 720], expectedScreen: { x: 640, y: 360 } },
    { from: [1600, 900], to: [1440, 900], expectedScreen: { x: 720, y: 450 } },
    { from: [1600, 900], to: [1024, 768], expectedScreen: { x: 512, y: 384 } },
    { from: [1600, 900], to: [2560, 1080], expectedScreen: { x: 1280, y: 540 } },
  ];

  for (const item of cases) {
    const before = createBeatSwarmPlayerAnchorSnapshot(makeViewport(...item.from), worldPosition);
    const after = createBeatSwarmPlayerAnchorSnapshot(makeViewport(...item.to), worldPosition);
    assert.deepEqual(after.logical, before.logical);
    assert.deepEqual(after.logical, { x: 800, y: 450 });
    assert.deepEqual(after.world, before.world);
    assert.deepEqual(after.screen, item.expectedScreen);
  }
  assert.deepEqual(worldPosition, { x: 4123.5, y: -876.25 });
});

test('temporary board bridge composes through screen space', () => {
  const viewport = makeViewport(1600, 900);
  const bridge = createBeatSwarmProjectionBridge({
    getViewportSpace: () => viewport,
    boardScreenToWorld: ({ x, y }) => ({ x: x + 100, y: y - 50 }),
    boardWorldToScreen: ({ x, y }) => ({ x: x - 100, y: y + 50 }),
  });
  assert.deepEqual(bridge.logicalToWorld({ x: 800, y: 450 }), { x: 900, y: 400 });
  assert.deepEqual(bridge.worldToLogical({ x: 900, y: 400 }), { x: 800, y: 450 });
});

test('logical gameplay containment includes edges and supports signed logical margins', () => {
  assert.equal(isLogicalPointInsideGameplay({ x: 800, y: 450 }), true);
  assert.equal(isLogicalPointInsideGameplay({ x: 0, y: 0 }), true);
  assert.equal(isLogicalPointInsideGameplay({ x: 1600, y: 900 }), true);
  assert.equal(isLogicalPointInsideGameplay({ x: 0.01, y: 899.99 }), true);
  assert.equal(isLogicalPointInsideGameplay({ x: -0.01, y: 450 }), false);
  assert.equal(isLogicalPointInsideGameplay({ x: 1600.01, y: 450 }), false);
  assert.equal(isLogicalPointInsideGameplay({ x: 800, y: -0.01 }), false);
  assert.equal(isLogicalPointInsideGameplay({ x: 800, y: 900.01 }), false);

  assert.equal(isLogicalPointInsideGameplay({ x: -80, y: 450 }, 80), true);
  assert.equal(isLogicalPointInsideGameplay({ x: 1680, y: 450 }, 80), true);
  assert.equal(isLogicalPointInsideGameplay({ x: -80.01, y: 450 }, 80), false);
  assert.equal(isLogicalPointInsideGameplay({ x: 1680.01, y: 450 }, 80), false);

  assert.equal(isLogicalPointInsideGameplay({ x: 23.99, y: 450 }, -24), false);
  assert.equal(isLogicalPointInsideGameplay({ x: 24, y: 24 }, -24), true);
  assert.equal(isLogicalPointInsideGameplay({ x: 1576, y: 876 }, -24), true);
  assert.equal(isLogicalPointInsideGameplay({ x: 1576.01, y: 450 }, -24), false);
});

test('world gameplay visibility is invariant across browser sizes and aspect ratios', () => {
  const browserSizes = [
    [1280, 720],
    [1600, 900],
    [1920, 1080],
    [1440, 900],
    [1024, 768],
    [2560, 1080],
  ];
  const cases = [
    { point: { x: 800, y: 450 }, margin: 0, expected: true },
    { point: { x: 0, y: 450 }, margin: 0, expected: true },
    { point: { x: -1, y: 450 }, margin: 0, expected: false },
    { point: { x: -80, y: 450 }, margin: 80, expected: true },
    { point: { x: -81, y: 450 }, margin: 80, expected: false },
    { point: { x: 24, y: 450 }, margin: -24, expected: true },
    { point: { x: 23, y: 450 }, margin: -24, expected: false },
  ];

  for (const [width, height] of browserSizes) {
    const viewport = makeViewport(width, height);
    const bridge = createBeatSwarmProjectionBridge({
      getViewportSpace: () => viewport,
      boardWorldToScreen: (point) => projectBeatSwarmLogicalToScreen(viewport, point),
      boardScreenToWorld: (point) => projectBeatSwarmScreenToLogical(viewport, point),
    });
    for (const item of cases) {
      assert.equal(
        bridge.isWorldPointInsideGameplay(item.point, item.margin),
        item.expected,
        `${width}x${height}: ${JSON.stringify(item)}`,
      );
    }
  }
});

test('world point diagnostics distinguish logical gameplay from physical presentation', () => {
  const viewport = makeViewport(2560, 1080);
  const bridge = createBeatSwarmProjectionBridge({
    getViewportSpace: () => viewport,
    boardWorldToScreen: (point) => projectBeatSwarmLogicalToScreen(viewport, point),
    boardScreenToWorld: (point) => projectBeatSwarmScreenToLogical(viewport, point),
  });
  const classification = bridge.classifyWorldPoint({ x: -100, y: 450 });
  assert.equal(classification.insideGameplay, false);
  assert.equal(classification.insidePresentation, true);
  assert.deepEqual(classification.logical, { x: -100, y: 450 });
  assert.deepEqual(classification.screen, { x: 200, y: 540 });
});

test('debug snapshot includes fixed logical geometry', () => {
  const debug = createBeatSwarmViewportDebugSnapshot(makeViewport(2560, 1080));
  assert.deepEqual(debug.logicalCenter, { x: 800, y: 450 });
  assert.equal(debug.logicalWidth, 1600);
  assert.equal(debug.logicalHeight, 900);
  assert.equal(debug.presentationScale, 1.2);
  assert.deepEqual(debug.contentRect, { left: 320, top: 0, width: 1920, height: 1080 });
});
