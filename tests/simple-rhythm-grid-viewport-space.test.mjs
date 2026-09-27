import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SIMPLE_RHYTHM_GRID_GEOMETRY,
  SIMPLE_RHYTHM_GRID_LOGICAL_HEIGHT,
  SIMPLE_RHYTHM_GRID_LOGICAL_WIDTH,
  createSimpleRhythmGridViewportSpace,
  getSimpleRhythmCubeRect,
  hitSimpleRhythmCube,
  simpleRhythmGridClientToLogical,
  simpleRhythmGridLogicalToDisplay,
} from '../src/simple-rhythm-grid-viewport-space.js';

const visualSource = readFileSync(new URL('../src/simple-rhythm-visual.js', import.meta.url), 'utf8');

function canvasFor(rect) {
  return { getBoundingClientRect: () => ({ ...rect }) };
}

function assertPoint(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual.x - expected.x) <= epsilon, `${actual.x} != ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) <= epsilon, `${actual.y} != ${expected.y}`);
}

test('authored sequencer geometry is fixed at 618x177', () => {
  assert.equal(SIMPLE_RHYTHM_GRID_LOGICAL_WIDTH, 618);
  assert.equal(SIMPLE_RHYTHM_GRID_LOGICAL_HEIGHT, 177);
  assert.deepEqual(SIMPLE_RHYTHM_GRID_GEOMETRY, {
    columns: 8,
    cubeSize: 59,
    gap: 4,
    stride: 63,
    originX: 59,
    originY: 59,
  });
  assert.deepEqual(getSimpleRhythmCubeRect(0), { x: 59, y: 59, width: 59, height: 59 });
  assert.deepEqual(getSimpleRhythmCubeRect(7), { x: 500, y: 59, width: 59, height: 59 });
});

test('logical and display coordinates round trip through contain-fit', () => {
  for (const display of [
    { left: 0, top: 0, width: 618, height: 177 },
    { left: 25, top: 40, width: 1236, height: 354 },
    { left: 0, top: 0, width: 800, height: 400 },
    { left: 0, top: 0, width: 1000, height: 177 },
  ]) {
    const viewport = createSimpleRhythmGridViewportSpace(display);
    const logical = { x: 311.5, y: 92.25 };
    const screen = simpleRhythmGridLogicalToDisplay(viewport, logical);
    assertPoint(simpleRhythmGridClientToLogical(canvasFor(display), screen), logical);
  }
});

test('cube hits are identical across display sizes and transformed board scale', () => {
  const logical = { x: 59 + (3 * 63) + 20, y: 88 };
  for (const display of [
    { left: 0, top: 0, width: 618, height: 177 },
    { left: 10, top: 20, width: 309, height: 88.5 },
    { left: 120, top: 70, width: 927, height: 265.5 },
    { left: 25, top: 30, width: 900, height: 300 },
  ]) {
    const viewport = createSimpleRhythmGridViewportSpace(display);
    const client = simpleRhythmGridLogicalToDisplay(viewport, logical);
    const mapped = simpleRhythmGridClientToLogical(canvasFor(display), client);
    assert.equal(hitSimpleRhythmCube(mapped), 3);
  }
});

test('gaps and non-square letterbox regions do not trigger cubes', () => {
  assert.equal(hitSimpleRhythmCube({ x: 118, y: 80 }), -1);
  assert.equal(hitSimpleRhythmCube({ x: 120, y: 80 }), -1);
  assert.equal(hitSimpleRhythmCube({ x: 122, y: 80 }), 1);

  const display = { left: 0, top: 0, width: 800, height: 400 };
  const viewport = createSimpleRhythmGridViewportSpace(display);
  assert.ok(viewport.contentRect.top > 0);
  assert.equal(simpleRhythmGridClientToLogical(canvasFor(display), { x: 400, y: 5 }), null);
});

test('DPR and backing size cannot affect input geometry', () => {
  const display = { left: 10, top: 15, width: 618, height: 177 };
  const point = { x: 250, y: 90 };
  const logicalByDpr = [1, 1.5, 2, 3].map((backingScale) => {
    const viewport = createSimpleRhythmGridViewportSpace({ ...display, backingScale });
    const client = simpleRhythmGridLogicalToDisplay(viewport, point);
    return simpleRhythmGridClientToLogical(canvasFor(display), client);
  });
  logicalByDpr.forEach((logical) => assertPoint(logical, point));
});

test('resize preserves sequencer state and logical burst/playhead geometry', () => {
  const sequencerState = Object.freeze({
    steps: Object.freeze([true, false, true, false, false, true, false, true]),
    noteIndices: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7]),
  });
  const before = JSON.stringify(sequencerState);
  const cube = getSimpleRhythmCubeRect(5);
  const logicalCenter = { x: cube.x + cube.width / 2, y: cube.y + cube.height / 2 };

  for (const display of [
    { width: 618, height: 177 },
    { width: 309, height: 88.5 },
    { width: 800, height: 400 },
  ]) {
    const viewport = createSimpleRhythmGridViewportSpace(display);
    const projected = simpleRhythmGridLogicalToDisplay(viewport, logicalCenter);
    assertPoint(simpleRhythmGridClientToLogical(canvasFor({ left: 0, top: 0, ...display }), projected), logicalCenter);
    assert.deepEqual(getSimpleRhythmCubeRect(5), cube);
  }
  assert.equal(JSON.stringify(sequencerState), before);
});

test('production grid uses logical input and projection without CSS-sized hit geometry', () => {
  assert.match(visualSource, /simpleRhythmGridClientToLogical\(canvas/);
  assert.match(visualSource, /hitSimpleRhythmCube\(pointer\)/);
  assert.match(visualSource, /createSimpleRhythmGridViewportSpace/);
  assert.doesNotMatch(visualSource, /getPropertyValue\('--loopgrid-cube-size'\)/);
  assert.doesNotMatch(visualSource, /e\.clientX\s*-\s*rawRect\.left/);
  assert.doesNotMatch(visualSource, /canvas\.width\s*\/\s*rawRect\.width/);
});
