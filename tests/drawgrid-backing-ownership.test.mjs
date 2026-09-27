import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  resizeOffscreenCanvasFromSurface,
  resizeDrawGridOffscreenBuffers,
} from '../src/drawgrid/dg-offscreen-backing.js';
import { createDgPaintRedraw } from '../src/drawgrid/dg-paint-redraw.js';

function canvas(width = 1, height = 1) {
  return { width, height };
}

test('offscreen buffers mirror the managed backing snapshot', () => {
  const first = canvas();
  const second = canvas(20, 30);
  const snapshot = {
    cssWidth: 400,
    cssHeight: 300,
    backingWidth: 800,
    backingHeight: 600,
    effectiveDpr: 2,
  };
  assert.equal(resizeDrawGridOffscreenBuffers([first, second], snapshot), true);
  assert.deepEqual(first, { width: 800, height: 600 });
  assert.deepEqual(second, { width: 800, height: 600 });
  assert.equal(resizeDrawGridOffscreenBuffers([first, second], snapshot), false);
});

test('DPR changes rebuild backing only and never mutate logical state', () => {
  const buffer = canvas(800, 600);
  const model = {
    strokes: [{ pts: [{ x: 30, y: 30 }, { x: 770, y: 570 }] }],
    nodes: [[1, 4], [6]],
    gridRect: { x: 30, y: 30, w: 740, h: 540 },
  };
  const before = structuredClone(model);
  assert.equal(resizeOffscreenCanvasFromSurface(buffer, {
    backingWidth: 1600,
    backingHeight: 1200,
    effectiveDpr: 2,
  }), true);
  assert.deepEqual(model, before);
  assert.deepEqual(buffer, { width: 1600, height: 1200 });
});

test('visible and offscreen ownership paths remain separated', () => {
  const manager = readFileSync(new URL('../src/toy-surface-manager.js', import.meta.url), 'utf8');
  const sizing = readFileSync(new URL('../src/drawgrid/dg-layout-sizing.js', import.meta.url), 'utf8');
  const backSync = readFileSync(new URL('../src/drawgrid/dg-back-sync.js', import.meta.url), 'utf8');
  const overlayFlush = readFileSync(new URL('../src/drawgrid/dg-overlay-flush.js', import.meta.url), 'utf8');
  const paintBuffers = readFileSync(new URL('../src/drawgrid/dg-paint-buffers.js', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../src/drawgrid/dg-layout.js', import.meta.url), 'utf8');

  assert.match(manager, /getSnapshot/);
  assert.match(sizing, /dgSurfaces\.applyExplicit/);
  assert.match(sizing, /resizeOffscreenBuffers/);
  assert.doesNotMatch(backSync, /resizeCanvasForDpr|syncCanvasesCssSize|devicePixelRatio/);
  assert.doesNotMatch(overlayFlush, /__dgResizeCanvasIfNeeded|document\.createElement\(['"]canvas['"]\)/);
  assert.match(paintBuffers, /surfaceSnapshot\.backingWidth/);
  assert.doesNotMatch(paintBuffers, /cssW\s*\*\s*paintDpr|cssH\s*\*\s*paintDpr/);
  assert.doesNotMatch(layout, /document\.createElement\(['"]canvas['"]\)/);
  assert.match(layout, /layout:vector-redraw/);
});

test('paint snapshot module is no longer wired into production', () => {
  const drawgrid = readFileSync(new URL('../src/drawgrid/drawgrid.js', import.meta.url), 'utf8');
  const zoom = readFileSync(new URL('../src/drawgrid/dg-zoom-recompute.js', import.meta.url), 'utf8');
  assert.doesNotMatch(drawgrid, /createDgPaintSnapshot|capturePaintSnapshot|restorePaintSnapshot/);
  assert.doesNotMatch(zoom, /capturePaintSnapshot|restorePaintSnapshot/);
});

test('vector redraw reconstructs paint after a backing reset', () => {
  const calls = [];
  const ctx = {
    canvas: { width: 1600, height: 1200 },
    clearRect: (...args) => calls.push(['clear', ...args]),
  };
  const strokes = [
    { id: 'old', pts: [{ x: 30, y: 30 }, { x: 100, y: 100 }] },
    { id: 'new', justCreated: true, pts: [{ x: 200, y: 200 }, { x: 300, y: 300 }] },
  ];
  const redraw = createDgPaintRedraw({
    state: {
      strokes,
      cssW: 800,
      cssH: 600,
      paintDpr: 2,
      usingBackBuffers: false,
      DG_SINGLE_CANVAS: false,
      frontCtx: ctx,
    },
    deps: {
      F: { perfMarkSection: (_name, fn) => fn() },
      FD: { markRegenSource() {} },
      R: {
        resetCtx() {},
        withLogicalSpace: (_ctx, fn) => fn(),
      },
      __dgWithLogicalSpace: (_ctx, fn) => fn(),
      getActivePaintCtx: () => ctx,
      drawFullStroke: (_ctx, stroke) => calls.push(['stroke', stroke.id]),
    },
  });
  redraw.clearAndRedrawFromStrokes(null, 'test-backing-reset');
  assert.deepEqual(calls, [
    ['clear', 0, 0, 800, 600],
    ['stroke', 'old'],
    ['stroke', 'new'],
  ]);
  assert.deepEqual(strokes[0].pts, [{ x: 30, y: 30 }, { x: 100, y: 100 }]);
});
