import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WHEEL_LOGICAL_HEIGHT,
  WHEEL_LOGICAL_WIDTH,
  createWheelViewportSpace,
  getWheelGeometry,
  hitWheelSpokeButton,
  wheelClientToLogical,
  wheelDisplayToLogical,
  wheelLogicalToDisplay,
  wheelSpokeEnd,
} from '../src/wheel-viewport-space.js';
import { handleMaxRadius, radiusToSemi, semiToRadius } from '../src/wheel-handles.js';

const DISPLAYS = [
  [150, 150],
  [240, 240],
  [300, 300],
  [450, 450],
  [600, 360],
];

test('Wheel logical and display coordinates round trip through contain-fit', () => {
  const logical = { x: 71.25, y: 226.5 };
  for (const [width, height] of DISPLAYS) {
    const viewport = createWheelViewportSpace({ left: 13, top: 27, width, height });
    const displayed = wheelLogicalToDisplay(viewport, logical);
    const roundTrip = wheelDisplayToLogical(viewport, displayed);
    assert.ok(Math.abs(roundTrip.x - logical.x) < 1e-9);
    assert.ok(Math.abs(roundTrip.y - logical.y) < 1e-9);
    assert.equal(viewport.presentationScale, Math.min(width / 300, height / 300));
  }
});

test('segment hit detection is identical at every display size', () => {
  const geometry = getWheelGeometry();
  for (let index = 0; index < 16; index += 1) {
    const logicalTarget = wheelSpokeEnd(index, geometry);
    for (const [width, height] of DISPLAYS) {
      const rect = { left: 19, top: 31, width, height };
      const viewport = createWheelViewportSpace(rect);
      const clientTarget = wheelLogicalToDisplay(viewport, logicalTarget);
      const logicalPointer = wheelClientToLogical({ getBoundingClientRect: () => rect }, clientTarget);
      assert.equal(hitWheelSpokeButton(logicalPointer, geometry), index);
    }
  }
});

test('radial drag produces the same semitone at every display size', () => {
  const geometry = getWheelGeometry();
  const inner = geometry.Rmin * 0.7;
  const outer = handleMaxRadius({ ...geometry, Rmin: inner });
  const expectedSemi = 7;
  const logicalRadius = semiToRadius(expectedSemi, inner, outer);
  const logicalPoint = { x: geometry.cx + logicalRadius, y: geometry.cy };

  for (const [width, height] of DISPLAYS) {
    const rect = { left: 7, top: 11, width, height };
    const viewport = createWheelViewportSpace(rect);
    const client = wheelLogicalToDisplay(viewport, logicalPoint);
    const pointer = wheelClientToLogical({ getBoundingClientRect: () => rect }, client);
    const radius = Math.hypot(pointer.x - geometry.cx, pointer.y - geometry.cy);
    assert.equal(radiusToSemi(radius, inner, outer), expectedSemi);
  }
});

test('pointer mapping stays aligned under board zoom and --toy-scale transforms', () => {
  const logical = { x: 225, y: 90 };
  for (const rect of [
    { left: 20, top: 30, width: 240, height: 240 },
    { left: 40, top: 55, width: 450, height: 450 },
    { left: 12, top: 18, width: 600, height: 360 },
  ]) {
    const viewport = createWheelViewportSpace(rect);
    const client = wheelLogicalToDisplay(viewport, logical);
    const mapped = wheelClientToLogical({ getBoundingClientRect: () => rect }, client);
    assert.ok(Math.abs(mapped.x - logical.x) < 1e-9);
    assert.ok(Math.abs(mapped.y - logical.y) < 1e-9);
  }
});

test('DPR/backing size cannot affect Wheel input or geometry', () => {
  const rect = { left: 10, top: 20, width: 300, height: 300 };
  const point = { x: 160, y: 170 };
  const dpr1 = { width: 300, height: 300, getBoundingClientRect: () => rect };
  const dpr2 = { width: 600, height: 600, getBoundingClientRect: () => rect };
  assert.deepEqual(wheelClientToLogical(dpr1, point), { x: 150, y: 150 });
  assert.deepEqual(wheelClientToLogical(dpr2, point), { x: 150, y: 150 });
  assert.deepEqual(getWheelGeometry(), {
    cx: WHEEL_LOGICAL_WIDTH / 2,
    cy: WHEEL_LOGICAL_HEIGHT / 2,
    Rmin: 66,
    Rout: 126,
    Rbtn: 13.5,
  });
});

test('non-square displays contain the square Wheel without stretching', () => {
  const viewport = createWheelViewportSpace({ width: 600, height: 360 });
  assert.equal(viewport.presentationScale, 1.2);
  assert.deepEqual(viewport.contentRect, { left: 120, top: 0, width: 360, height: 360 });
  assert.equal(WHEEL_LOGICAL_WIDTH, 300);
  assert.equal(WHEEL_LOGICAL_HEIGHT, 300);
});

