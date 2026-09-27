import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDgStateIo } from '../src/drawgrid/dg-state-io.js';

import {
  DRAWGRID_STROKE_SPACE_LOGICAL,
  createDrawGridViewportSpace,
  drawGridClientToStrokeLogical,
  drawGridLogicalPointToNormalized,
  drawGridLogicalToDisplay,
} from '../src/drawgrid/drawgrid-viewport-space.js';

const LOGICAL_POINTS = Object.freeze([
  Object.freeze({ x: 75, y: 90 }),
  Object.freeze({ x: 400, y: 300 }),
  Object.freeze({ x: 730, y: 510 }),
]);

test('client input captures identical logical stroke points at every display size', () => {
  const displays = [
    { left: 0, top: 0, width: 400, height: 300 },
    { left: 25, top: 40, width: 800, height: 600 },
    { left: -80, top: 120, width: 1600, height: 1200 },
    { left: 100, top: 50, width: 800, height: 800 },
  ];
  for (const display of displays) {
    const viewport = createDrawGridViewportSpace(display);
    const captured = LOGICAL_POINTS.map((point) => (
      drawGridClientToStrokeLogical(viewport, drawGridLogicalToDisplay(viewport, point))
    ));
    assert.deepEqual(captured, LOGICAL_POINTS);
  }
});

test('board zoom and --toy-scale transformed rectangles do not change captured points', () => {
  const logical = { x: 250, y: 425 };
  for (const rect of [
    { left: 30, top: 45, width: 320, height: 240 },
    { left: 60, top: 90, width: 600, height: 450 },
    { left: -200, top: 15, width: 1440, height: 1080 },
  ]) {
    const viewport = createDrawGridViewportSpace(rect);
    const client = drawGridLogicalToDisplay(viewport, logical);
    assert.deepEqual(drawGridClientToStrokeLogical(viewport, client), logical);
  }
});

test('DPR has no effect on stroke input', () => {
  const logical = { x: 315, y: 175 };
  const results = [0.5, 1, 2, 3].map((backingScale) => {
    const viewport = createDrawGridViewportSpace({ left: 20, top: 10, width: 640, height: 480, backingScale });
    return drawGridClientToStrokeLogical(viewport, drawGridLogicalToDisplay(viewport, logical));
  });
  for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
});

test('letterbox input is rejected rather than clamped onto an edge', () => {
  const square = createDrawGridViewportSpace({ width: 800, height: 800 });
  assert.equal(drawGridClientToStrokeLogical(square, { x: 400, y: 50 }), null);
  assert.equal(drawGridClientToStrokeLogical(square, { x: 400, y: 750 }), null);
  assert.deepEqual(drawGridClientToStrokeLogical(square, { x: 400, y: 100 }), { x: 400, y: 0 });

  const ultrawide = createDrawGridViewportSpace({ width: 1600, height: 600 });
  assert.equal(drawGridClientToStrokeLogical(ultrawide, { x: 200, y: 300 }), null);
  assert.equal(drawGridClientToStrokeLogical(ultrawide, { x: 1400, y: 300 }), null);
});

test('fixed-grid normalization is stable across presentation resize', () => {
  const ptsN = LOGICAL_POINTS.map(drawGridLogicalPointToNormalized);
  for (const display of [
    { width: 400, height: 300 },
    { width: 800, height: 600 },
    { width: 1200, height: 900 },
    { width: 1000, height: 600 },
  ]) createDrawGridViewportSpace(display);
  assert.deepEqual(LOGICAL_POINTS.map(drawGridLogicalPointToNormalized), ptsN);
});

test('state capture persists logical strokes as fixed-grid ptsN', () => {
  const stroke = {
    coordinateSpace: DRAWGRID_STROKE_SPACE_LOGICAL,
    pts: [{ x: 30, y: 30 }, { x: 400, y: 300 }, { x: 770, y: 570 }],
    color: '#fff',
  };
  const state = {
    cols: 8,
    autoTune: true,
    panel: { dataset: {} },
    gridArea: { x: 5, y: 7, w: 200, h: 100 },
    topPad: 0,
    strokes: [stroke],
    currentMap: { active: Array(8).fill(false), nodes: Array.from({ length: 8 }, () => new Set()), disabled: Array.from({ length: 8 }, () => new Set()) },
    persistentDisabled: [],
    nodeGroupMap: [],
    manualOverrides: [],
  };
  const io = createDgStateIo({ state, deps: {} });
  const captured = io.captureState();
  assert.equal(captured.schemaVersion, 2);
  assert.equal(captured.coordinateSpace, 'drawgrid-logical-800x600');
  assert.deepEqual(captured.strokes[0].ptsN, [
    { nx: 0, ny: 0 },
    { nx: 0.5, ny: 0.5 },
    { nx: 1, ny: 1 },
  ]);
});

test('state capture ignores stale normalized caches', () => {
  const state = {
    cols: 8,
    autoTune: false,
    panel: { dataset: {} },
    strokes: [{
      coordinateSpace: DRAWGRID_STROKE_SPACE_LOGICAL,
      pts: [{ x: 215, y: 435 }],
      __ptsN: [{ nx: 0.9, ny: 0.1 }],
    }],
    currentMap: { active: Array(8).fill(false), nodes: Array.from({ length: 8 }, () => new Set()) },
    persistentDisabled: [],
    nodeGroupMap: [],
    manualOverrides: [],
  };
  assert.deepEqual(createDgStateIo({ state, deps: {} }).captureState().strokes[0].ptsN, [
    { nx: 0.25, ny: 0.75 },
  ]);
});

test('existing ptsN hydration upgrades immediately to logical runtime state', () => {
  const state = {
    isRestoring: false,
    panel: { dataset: {}, dispatchEvent() {} },
    gridArea: { x: 30, y: 30, w: 740, h: 540 },
    topPad: 0,
    strokes: [],
    currentMap: { active: Array(8).fill(false), nodes: Array.from({ length: 8 }, () => new Set()), disabled: Array.from({ length: 8 }, () => new Set()) },
    persistentDisabled: [],
    nodeGroupMap: [],
    manualOverrides: [],
    cols: 8,
    autoTune: true,
    pctx: {},
    nctx: {},
    fctx: { clearRect() {} },
    cssW: 800,
    paintDpr: 1,
    hydrationState: {},
  };
  const noOp = () => {};
  const deps = {
    R: {
      clearCanvas: noOp,
      resetCtx: noOp,
      getOverlayClearPad: () => 0,
      getOverlayClearRect: () => ({ x: 0, y: 0, w: 0, h: 0 }),
    },
    getActiveFlashCanvas: () => null,
    __dgGetCanvasDprFromCss: () => 1,
    __dgWithLogicalSpaceDpr: (_render, _ctx, _dpr, fn) => fn(),
    __dgWithLogicalSpace: (_ctx, fn) => fn(),
    normalizeMapColumns: (map) => map,
    computeSerializedNodeStats: () => ({ nodeCount: 0 }),
    FD: { markRegenSource: noOp },
    HY: { scheduleHydrationLayoutRetry: noOp },
    updateHydrateInboundFromState: noOp,
    regenerateMapFromStrokes: noOp,
    drawFullStroke: noOp,
    emitDG: noOp,
    ensurePostCommitRedraw: noOp,
    emitDrawgridUpdate: noOp,
    markStaticDirty: noOp,
    schedulePersistState: noOp,
  };
  const io = createDgStateIo({ state, deps });
  io.restoreFromState({
    strokes: [{ ptsN: [{ nx: 0.25, ny: 0.75 }], color: '#fff' }],
  });
  assert.equal(state.strokes.length, 1);
  assert.equal(state.strokes[0].coordinateSpace, DRAWGRID_STROKE_SPACE_LOGICAL);
  assert.deepEqual(state.strokes[0].__ptsN, [{ nx: 0.25, ny: 0.75 }]);
  assert.deepEqual(state.strokes[0].pts, [{ x: 215, y: 435 }]);
});

test('new and imported strokes share one logical runtime mode', () => {
  const input = readFileSync(new URL('../src/drawgrid/dg-input-handlers.js', import.meta.url), 'utf8');
  const stateIo = readFileSync(new URL('../src/drawgrid/dg-state-io.js', import.meta.url), 'utf8');
  const setState = readFileSync(new URL('../src/drawgrid/dg-set-state.js', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../src/drawgrid/dg-layout.js', import.meta.url), 'utf8');
  assert.match(input, /coordinateSpace:\s*d\.DRAWGRID_STROKE_SPACE_LOGICAL/);
  assert.match(stateIo, /upgradeDrawGridStrokes/);
  assert.match(setState, /upgradeDrawGridStrokes/);
  assert.doesNotMatch(stateIo, /drawgrid-normalized-hydrated|drawgrid-legacy-css/);
  assert.doesNotMatch(setState, /drawgrid-normalized-hydrated|drawgrid-legacy-css/);
  assert.match(layout, /resize must never scale or reproject them/);
  assert.doesNotMatch(layout, /st\.pts\s*=\s*st\.pts\.map/);
  assert.doesNotMatch(layout, /layout-reproject/);
});

test('node hit testing and strokes both use the fixed logical mapper', () => {
  const input = readFileSync(new URL('../src/drawgrid/dg-input-handlers.js', import.meta.url), 'utf8');
  assert.match(input, /hitTestLogicalCell\(s\.logicalGeometry, logicalInputPoint/);
  assert.match(input, /const logicalPaintStart = logicalInputPoint/);
  assert.match(input, /if \(!logicalPaintStart\) return/);
});
