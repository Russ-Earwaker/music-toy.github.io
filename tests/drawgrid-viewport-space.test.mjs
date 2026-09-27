import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DRAWGRID_LOGICAL_BOUNDS,
  DRAWGRID_LOGICAL_CENTER,
  DRAWGRID_LOGICAL_GRID_RECT,
  DRAWGRID_LOGICAL_HEIGHT,
  DRAWGRID_LOGICAL_WIDTH,
  createDrawGridViewportSpace,
  drawGridClientToLogical,
  drawGridLogicalLengthToDisplay,
  drawGridLogicalToDisplay,
} from '../src/drawgrid/drawgrid-viewport-space.js';

function close(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

test('DrawGrid locks the authored 800x600 logical surface and reference grid', () => {
  assert.equal(DRAWGRID_LOGICAL_WIDTH, 800);
  assert.equal(DRAWGRID_LOGICAL_HEIGHT, 600);
  assert.deepEqual(DRAWGRID_LOGICAL_CENTER, { x: 400, y: 300 });
  assert.deepEqual(DRAWGRID_LOGICAL_BOUNDS, { left: 0, top: 0, width: 800, height: 600 });
  assert.deepEqual(DRAWGRID_LOGICAL_GRID_RECT, { left: 30, top: 30, width: 740, height: 540 });
});

test('800x600 reference projection is identity', () => {
  const viewport = createDrawGridViewportSpace({ width: 800, height: 600 });
  assert.equal(viewport.presentationScale, 1);
  assert.deepEqual(viewport.contentRect, { left: 0, top: 0, width: 800, height: 600 });
  assert.deepEqual(drawGridLogicalToDisplay(viewport, DRAWGRID_LOGICAL_CENTER), DRAWGRID_LOGICAL_CENTER);
});

test('1600x1200 projection scales proportionally', () => {
  const viewport = createDrawGridViewportSpace({ width: 1600, height: 1200 });
  assert.equal(viewport.presentationScale, 2);
  assert.deepEqual(drawGridLogicalToDisplay(viewport, DRAWGRID_LOGICAL_CENTER), { x: 800, y: 600 });
  assert.equal(drawGridLogicalLengthToDisplay(viewport, 30), 60);
});

test('square display letterboxes the 4:3 content vertically', () => {
  const viewport = createDrawGridViewportSpace({ width: 800, height: 800 });
  assert.equal(viewport.presentationScale, 1);
  assert.deepEqual(viewport.contentRect, { left: 0, top: 100, width: 800, height: 600 });
});

test('ultrawide display contains the full logical surface without stretching', () => {
  const viewport = createDrawGridViewportSpace({ width: 1600, height: 600 });
  assert.equal(viewport.presentationScale, 1);
  assert.deepEqual(viewport.contentRect, { left: 400, top: 0, width: 800, height: 600 });
});

test('client to logical to display round trip includes display origin and letterbox', () => {
  const viewport = createDrawGridViewportSpace({ left: 120, top: 75, width: 1000, height: 600 });
  const client = { x: 591.25, y: 308.5 };
  const logical = drawGridClientToLogical(viewport, client);
  const projected = drawGridLogicalToDisplay(viewport, logical);
  close(projected.x, client.x);
  close(projected.y, client.y);
});

test('transformed client rect keeps board zoom and --toy-scale pointer alignment', () => {
  const logical = { x: 185, y: 420 };
  for (const transformedRect of [
    { left: 40, top: 70, width: 400, height: 300 },
    { left: 90, top: 35, width: 640, height: 480 },
    { left: -125, top: 210, width: 1200, height: 900 },
  ]) {
    const viewport = createDrawGridViewportSpace(transformedRect);
    const client = drawGridLogicalToDisplay(viewport, logical);
    assert.deepEqual(drawGridClientToLogical(viewport, client), logical);
  }
});

test('DPR metadata cannot affect DrawGrid coordinate conversion', () => {
  const point = { x: 500, y: 350 };
  const results = [0.5, 1, 2, 3].map((backingScale) => {
    const viewport = createDrawGridViewportSpace({ left: 20, top: 50, width: 960, height: 720, backingScale });
    return drawGridClientToLogical(viewport, point);
  });
  for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
});

test('two DrawGrid viewport snapshots remain independent', () => {
  const first = createDrawGridViewportSpace({ left: 0, top: 0, width: 800, height: 600 });
  const second = createDrawGridViewportSpace({ left: 100, top: 50, width: 400, height: 400 });
  assert.notEqual(first, second);
  assert.deepEqual(first.contentRect, { left: 0, top: 0, width: 800, height: 600 });
  assert.deepEqual(second.contentRect, { left: 100, top: 100, width: 400, height: 300 });
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(second));
});

test('viewport integration remains separate from the legacy CSS mapper', () => {
  const source = readFileSync(new URL('../src/drawgrid/drawgrid.js', import.meta.url), 'utf8');
  const pointerSource = readFileSync(new URL('../src/drawgrid/dg-canvas-active.js', import.meta.url), 'utf8');
  assert.match(source, /__DRAWGRID_VIEWPORT_SPACE/);
  assert.match(source, /getDrawGridViewportSpace/);
  assert.doesNotMatch(pointerSource, /drawgrid-viewport-space/);
});
