import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CHORDWHEEL_MAIN_CENTER,
  CHORDWHEEL_MAIN_LOGICAL_HEIGHT,
  CHORDWHEEL_MAIN_LOGICAL_WIDTH,
  CHORDWHEEL_MAIN_OUTER_CUBE_RADIUS,
  CHORDWHEEL_MAIN_OUTER_CUBE_SIZE,
  chordWheelMainClientToLogical,
  createChordWheelMainViewportSpace,
  getChordWheelCubeGeometry,
  hitTestChordWheelCubes,
  projectChordWheelLogicalPoint,
} from '../src/chordwheel-main-viewport-space.js';

const DISPLAYS = [
  { left: 0, top: 0, width: 260, height: 260, backingScale: 1 },
  { left: 20, top: 30, width: 520, height: 520, backingScale: 2 },
  { left: -100, top: 80, width: 1040, height: 1040, backingScale: 3 },
  { left: 40, top: 15, width: 900, height: 520, backingScale: 1.5 },
];

test('main wheel uses the authored 520x520 logical surface', () => {
  assert.equal(CHORDWHEEL_MAIN_LOGICAL_WIDTH, 520);
  assert.equal(CHORDWHEEL_MAIN_LOGICAL_HEIGHT, 520);
  assert.deepEqual(CHORDWHEEL_MAIN_CENTER, { x: 260, y: 260 });
  assert.equal(CHORDWHEEL_MAIN_OUTER_CUBE_RADIUS, 235);
  assert.equal(CHORDWHEEL_MAIN_OUTER_CUBE_SIZE, 48);
});

test('logical and display coordinates round trip at every display size', () => {
  const points = [{ x: 0, y: 0 }, CHORDWHEEL_MAIN_CENTER, { x: 496, y: 260 }];
  for (const display of DISPLAYS) {
    const viewport = createChordWheelMainViewportSpace(display);
    for (const point of points) {
      const screen = projectChordWheelLogicalPoint(viewport, point);
      assert.deepEqual(chordWheelMainClientToLogical(screen, viewport.displayRect), point);
    }
  }
});

test('cube hit testing is invariant across display size, zoom, and toy scale', () => {
  const { cubes } = getChordWheelCubeGeometry({ count: 16 });
  for (let index = 0; index < cubes.length; index += 1) {
    const cube = cubes[index];
    const logicalCenter = { x: cube.x + cube.w / 2, y: cube.y + cube.h / 2 };
    assert.equal(hitTestChordWheelCubes(cubes, logicalCenter), index);
    for (const display of DISPLAYS) {
      const viewport = createChordWheelMainViewportSpace(display);
      const client = projectChordWheelLogicalPoint(viewport, logicalCenter);
      const mapped = chordWheelMainClientToLogical(client, viewport.displayRect);
      assert.equal(hitTestChordWheelCubes(cubes, mapped), index);
    }
  }
});

test('logical wheel vectors and angular rotation are presentation invariant', () => {
  const { cubes } = getChordWheelCubeGeometry({ count: 8 });
  const vectors = cubes.map((cube) => ({
    x: cube.x + cube.w / 2 - CHORDWHEEL_MAIN_CENTER.x,
    y: cube.y + cube.h / 2 - CHORDWHEEL_MAIN_CENTER.y,
  }));
  for (const vector of vectors) {
    assert.ok(Math.abs(Math.hypot(vector.x, vector.y) - CHORDWHEEL_MAIN_OUTER_CUBE_RADIUS) < 1e-9);
  }
  const angles = vectors.map((vector) => Math.atan2(vector.y, vector.x));
  for (const display of DISPLAYS) {
    const viewport = createChordWheelMainViewportSpace(display);
    const projectedCenter = projectChordWheelLogicalPoint(viewport, CHORDWHEEL_MAIN_CENTER);
    const projectedAngles = cubes.map((cube) => {
      const projected = projectChordWheelLogicalPoint(viewport, {
        x: cube.x + cube.w / 2,
        y: cube.y + cube.h / 2,
      });
      return Math.atan2(projected.y - projectedCenter.y, projected.x - projectedCenter.x);
    });
    assert.deepEqual(projectedAngles, angles);
  }
});

test('DPR metadata cannot affect main-wheel input or hit geometry', () => {
  const displays = [1, 2, 3].map((backingScale) => ({ left: 25, top: 50, width: 520, height: 520, backingScale }));
  const logical = { x: 260, y: 25 };
  const results = displays.map((display) => {
    const viewport = createChordWheelMainViewportSpace(display);
    const client = projectChordWheelLogicalPoint(viewport, logical);
    return chordWheelMainClientToLogical(client, viewport.displayRect);
  });
  for (const result of results) assert.deepEqual(result, logical);
});

test('presentation resize cannot mutate chord or geometry state', () => {
  const state = { progression: [1, 4, 5, 1], selectedChord: 4, rotation: 0.75 };
  const geometry = getChordWheelCubeGeometry({ count: 8 });
  const beforeState = structuredClone(state);
  const beforeGeometry = structuredClone(geometry);
  for (const display of DISPLAYS) createChordWheelMainViewportSpace(display);
  assert.deepEqual(state, beforeState);
  assert.deepEqual(geometry, beforeGeometry);
});

test('main canvas has one managed backing owner and no raw DPR path', () => {
  const source = readFileSync(new URL('../src/chordwheel.js', import.meta.url), 'utf8');
  assert.match(source, /tag:\s*'chordwheel-main'/);
  assert.match(source, /registerCanvas\('wheel-cubes', canvas, \{ policy: 'managed' \}\)/);
  assert.doesNotMatch(source, /window\.devicePixelRatio|canvas\.width\s*=|canvas\.height\s*=/);
  assert.doesNotMatch(source, /currentBitmapWidth|currentBitmapHeight|wheelSizeDirty|currentWheelWidth/);
  assert.match(source, /chordWheelMainClientToLogical/);
});
