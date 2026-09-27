import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RIPPLER_LOGICAL_HEIGHT,
  RIPPLER_LOGICAL_WIDTH,
  createRipplerViewportSpace,
  doesRippleIntersectBlock,
  reconstructRipplerBlock,
  ripplerClientToLogical,
  ripplerDisplayToLogical,
  ripplerLogicalToDisplay,
  ripplerLogicalToNormalized,
  ripplerNormalizedToLogical,
} from '../src/rippler-viewport-space.js';

const DISPLAYS = [[150, 150], [240, 240], [300, 300], [450, 450], [600, 360]];

test('Rippler logical and display coordinates round trip through contain-fit', () => {
  const logical = { x: 74.25, y: 211.5 };
  for (const [width, height] of DISPLAYS) {
    const viewport = createRipplerViewportSpace({ left: 17, top: 29, width, height });
    const roundTrip = ripplerDisplayToLogical(viewport, ripplerLogicalToDisplay(viewport, logical));
    assert.ok(Math.abs(roundTrip.x - logical.x) < 1e-9);
    assert.ok(Math.abs(roundTrip.y - logical.y) < 1e-9);
  }
});

test('normalized authored positions reconstruct fixed logical blocks', () => {
  assert.deepEqual(ripplerNormalizedToLogical({ nx: 0.5, ny: 0.5 }), { x: 150, y: 150 });
  assert.deepEqual(reconstructRipplerBlock({ nx: 0.5, ny: 0.5 }), { x: 129, y: 129, w: 42, h: 42 });
  assert.deepEqual(reconstructRipplerBlock({ nx: 0, ny: 1 }), { x: 4, y: 254, w: 42, h: 42 });
  assert.deepEqual(ripplerLogicalToNormalized({ x: 150, y: 150 }), { nx: 0.5, ny: 0.5 });
});

test('pointer mapping remains aligned through board zoom and --toy-scale', () => {
  const logical = { x: 82, y: 218 };
  for (const rect of [
    { left: 20, top: 30, width: 240, height: 240 },
    { left: 40, top: 55, width: 450, height: 450 },
    { left: 12, top: 18, width: 600, height: 360 },
  ]) {
    const viewport = createRipplerViewportSpace(rect);
    const client = ripplerLogicalToDisplay(viewport, logical);
    const mapped = ripplerClientToLogical({ getBoundingClientRect: () => rect }, client);
    assert.ok(Math.abs(mapped.x - logical.x) < 1e-9);
    assert.ok(Math.abs(mapped.y - logical.y) < 1e-9);
  }
});

test('DPR/backing size does not affect Rippler input', () => {
  const rect = { left: 10, top: 20, width: 300, height: 300 };
  const point = { x: 160, y: 170 };
  const dpr1 = { width: 300, height: 300, getBoundingClientRect: () => rect };
  const dpr3 = { width: 900, height: 900, getBoundingClientRect: () => rect };
  assert.deepEqual(ripplerClientToLogical(dpr1, point), { x: 150, y: 150 });
  assert.deepEqual(ripplerClientToLogical(dpr3, point), { x: 150, y: 150 });
});

test('ripple/block interaction is identical at every display size', () => {
  const source = ripplerNormalizedToLogical({ nx: 0.25, ny: 0.5 });
  const block = { nx: 0.75, ny: 0.5 };
  const rect = reconstructRipplerBlock(block);
  const radiusAtNearEdge = rect.x - source.x;
  const result = (radius) => doesRippleIntersectBlock({ source, radius, block, band: 9 });
  const reference = [result(radiusAtNearEdge - 10), result(radiusAtNearEdge), result(radiusAtNearEdge + 10)];
  assert.deepEqual(reference, [false, true, false]);
  for (const [width, height] of DISPLAYS) {
    createRipplerViewportSpace({ width, height });
    assert.deepEqual([result(radiusAtNearEdge - 10), result(radiusAtNearEdge), result(radiusAtNearEdge + 10)], reference);
  }
});

test('resizing preserves logical Rippler state', () => {
  const state = Object.freeze({
    generator: Object.freeze({ nx: 0.31, ny: 0.64 }),
    block: Object.freeze({ nx: 0.72, ny: 0.22, vx: 14, vy: -9 }),
    ripple: Object.freeze({ x: 94.52, y: 190.88, radius: 83, speed: Math.hypot(300, 300) / 2 }),
  });
  const before = JSON.stringify(state);
  for (const [width, height] of DISPLAYS) {
    const viewport = createRipplerViewportSpace({ width, height });
    ripplerLogicalToDisplay(viewport, ripplerNormalizedToLogical(state.generator));
    ripplerLogicalToDisplay(viewport, ripplerNormalizedToLogical(state.block));
  }
  assert.equal(JSON.stringify(state), before);
  assert.equal(RIPPLER_LOGICAL_WIDTH, 300);
  assert.equal(RIPPLER_LOGICAL_HEIGHT, 300);
});

