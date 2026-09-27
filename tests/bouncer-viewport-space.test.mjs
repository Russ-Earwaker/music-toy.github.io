import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOUNCER_LOGICAL_HEIGHT,
  BOUNCER_LOGICAL_WIDTH,
  bouncerClientToLogical,
  bouncerDisplayToLogical,
  bouncerLogicalToDisplay,
  createBouncerViewportSpace,
  getBouncerRenderTransform,
  reconstructBouncerBlockFromAnchor,
} from '../src/bouncer-viewport-space.js';
import { stepBouncer } from '../src/bouncer-step.js';

globalThis.window ||= globalThis;

const DISPLAYS = [[150, 150], [240, 240], [300, 300], [450, 450], [600, 360]];

function makeStepState({ ball, blocks = [] } = {}) {
  return {
    ball: { ...ball },
    blocks: blocks.map((block) => ({ ...block })),
    edgeControllers: [],
    EDGE: 6,
    physW: () => BOUNCER_LOGICAL_WIDTH,
    physH: () => BOUNCER_LOGICAL_HEIGHT,
    ballR: () => 7,
    lastAT: 1,
    ensureAudioContext: () => ({ currentTime: 1 + (1 / 60) }),
    getLoopInfo: () => null,
    getQuantDiv: () => 4,
    noteList: [],
    noteValue: () => null,
    triggerInstrument: () => {},
    mapControllersByEdge: () => ({}),
    __lastTickByBlock: new Map(),
    __lastTickByEdge: new Map(),
  };
}

test('Bouncer logical and displayed coordinates round trip through contain-fit', () => {
  const logical = { x: 73.25, y: 218.5 };
  for (const [width, height] of DISPLAYS) {
    const viewport = createBouncerViewportSpace({ left: 17, top: 29, width, height });
    const roundTrip = bouncerDisplayToLogical(viewport, bouncerLogicalToDisplay(viewport, logical));
    assert.ok(Math.abs(roundTrip.x - logical.x) < 1e-9);
    assert.ok(Math.abs(roundTrip.y - logical.y) < 1e-9);
    assert.equal(viewport.presentationScale, Math.min(width / 300, height / 300));
  }
});

test('fractional block anchors reconstruct stable 300x300 logical geometry', () => {
  assert.deepEqual(
    reconstructBouncerBlockFromAnchor({ _fx: 0.2, _fy: 0.35, _fw: 44 / 300, _fh: 44 / 300 }),
    { x: 60, y: 105, w: 44, h: 44 },
  );
});

test('ball trajectory is identical at every display size', () => {
  const results = DISPLAYS.map(([width, height]) => {
    createBouncerViewportSpace({ width, height });
    const state = makeStepState({ ball: { x: 80, y: 140, vx: 4.8, vy: -2.4, r: 7 } });
    stepBouncer(state, 1 + (1 / 60));
    return state.ball;
  });
  for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
  assert.ok(Math.abs(results[0].x - 84.8) < 1e-9);
  assert.ok(Math.abs(results[0].y - 137.6) < 1e-9);
  assert.equal(results[0].vx, 4.8);
  assert.equal(results[0].vy, -2.4);
  assert.equal(results[0].r, 7);
});

test('block collision result is identical at every display size', () => {
  const results = DISPLAYS.map(([width, height]) => {
    createBouncerViewportSpace({ width, height });
    const state = makeStepState({
      ball: { x: 80, y: 120, vx: 20, vy: 0, r: 7 },
      blocks: [{ x: 100, y: 95, w: 44, h: 44, active: false }],
    });
    stepBouncer(state, 1 + (1 / 60));
    return { ball: state.ball, block: state.blocks[0] };
  });
  for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
  assert.equal(results[0].ball.vx, -20);
  assert.ok(results[0].ball.x < 93);
});

test('pointer mapping remains aligned through --toy-scale and board zoom transforms', () => {
  const logical = { x: 75, y: 210 };
  for (const rect of [
    { left: 20, top: 30, width: 240, height: 240 }, // --toy-scale: 0.8
    { left: 40, top: 55, width: 450, height: 450 }, // board zoom: 1.5
    { left: 12, top: 18, width: 600, height: 360 }, // transformed non-square host
  ]) {
    const viewport = createBouncerViewportSpace(rect);
    const client = bouncerLogicalToDisplay(viewport, logical);
    const canvas = { getBoundingClientRect: () => rect };
    const mapped = bouncerClientToLogical(canvas, client);
    assert.ok(Math.abs(mapped.x - logical.x) < 1e-9);
    assert.ok(Math.abs(mapped.y - logical.y) < 1e-9);
  }
});

test('DPR changes backing projection only and cannot change logical input', () => {
  const css1 = getBouncerRenderTransform({ displayWidth: 300, displayHeight: 300, backingWidth: 300, backingHeight: 300 });
  const css2 = getBouncerRenderTransform({ displayWidth: 300, displayHeight: 300, backingWidth: 600, backingHeight: 600 });
  assert.equal(css1.scaleX, 1);
  assert.equal(css2.scaleX, 2);
  assert.equal(css1.scaleY, 1);
  assert.equal(css2.scaleY, 2);

  const rect = { left: 10, top: 20, width: 300, height: 300 };
  const point = { x: 160, y: 170 };
  const canvasAtDpr1 = { width: 300, height: 300, getBoundingClientRect: () => rect };
  const canvasAtDpr2 = { width: 600, height: 600, getBoundingClientRect: () => rect };
  assert.deepEqual(bouncerClientToLogical(canvasAtDpr1, point), { x: 150, y: 150 });
  assert.deepEqual(bouncerClientToLogical(canvasAtDpr2, point), { x: 150, y: 150 });
});
