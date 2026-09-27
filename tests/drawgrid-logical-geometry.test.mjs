import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createDrawGridLogicalGeometry,
  createDrawGridViewportSpace,
  drawGridClientToStrokeLogical,
  drawGridLogicalRowFromPoint,
  drawGridLogicalToDisplay,
  getDrawGridLogicalNodeCenter,
  hitTestDrawGridLogicalCell,
} from '../src/drawgrid/drawgrid-viewport-space.js';

const close = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

test('fixed grid and cell geometry matches the authored 800x600 reference', () => {
  const geometry = createDrawGridLogicalGeometry({ cols: 8, rows: 12 });
  assert.deepEqual(geometry.gridRect, { x: 30, y: 30, w: 740, h: 540 });
  assert.equal(geometry.cellWidth, 92.5);
  assert.equal(geometry.cellHeight, 45);
  assert.equal(geometry.topPad, 0);
  assert.ok(Object.isFrozen(geometry));
  assert.ok(Object.isFrozen(geometry.gridRect));
});

test('node centres and full-cell hit geometry are fixed logical values', () => {
  const geometry = createDrawGridLogicalGeometry({ cols: 8, rows: 12 });
  assert.deepEqual(getDrawGridLogicalNodeCenter(geometry, 0, 0), { x: 76.25, y: 52.5 });
  assert.deepEqual(getDrawGridLogicalNodeCenter(geometry, 7, 11), { x: 723.75, y: 547.5 });
  assert.equal(hitTestDrawGridLogicalCell(geometry, { x: 30, y: 30 }, 0, 0), true);
  assert.equal(hitTestDrawGridLogicalCell(geometry, { x: 122.6, y: 30 }, 0, 0), false);
});

test('node hit testing is invariant across display size, zoom, toy scale, DPR, and letterbox', () => {
  const geometry = createDrawGridLogicalGeometry({ cols: 8, rows: 12 });
  const logical = getDrawGridLogicalNodeCenter(geometry, 3, 7);
  const displays = [
    { left: 0, top: 0, width: 800, height: 600, backingScale: 1 },
    { left: 45, top: 70, width: 400, height: 300, backingScale: 2 },
    { left: -120, top: 30, width: 1200, height: 900, backingScale: 0.75 },
    { left: 100, top: 20, width: 800, height: 800, backingScale: 3 },
    { left: 15, top: 15, width: 1400, height: 500, backingScale: 1.5 },
  ];
  for (const display of displays) {
    const viewport = createDrawGridViewportSpace(display);
    const client = drawGridLogicalToDisplay(viewport, logical);
    const mapped = drawGridClientToStrokeLogical(viewport, client);
    close(mapped.x, logical.x);
    close(mapped.y, logical.y);
    assert.equal(hitTestDrawGridLogicalCell(geometry, mapped, 3, 7), true);
  }
});

test('node drag resolves the same logical row at every presentation size', () => {
  const geometry = createDrawGridLogicalGeometry({ cols: 8, rows: 12 });
  for (let row = 0; row < geometry.rows; row += 1) {
    const point = getDrawGridLogicalNodeCenter(geometry, 2, row);
    assert.equal(drawGridLogicalRowFromPoint(geometry, point), row);
  }
});

test('tool, overlay, tutorial, and playhead geometry is fixed logically', () => {
  const geometry = createDrawGridLogicalGeometry({ cols: 8, rows: 12 });
  assert.equal(geometry.strokeWidth, 36);
  assert.equal(geometry.liveMarkerSize, 6);
  assert.equal(geometry.nodeRadius, 9);
  assert.equal(geometry.nodeDragThreshold, 6);
  close(geometry.gridLineWidth, 1.35);
  close(geometry.overlayClearPadding, 21.6);
  close(geometry.tutorialRadius, 24.75);
  assert.equal(geometry.playheadGradientWidth, 74);
  close(geometry.playheadSimpleLineWidth, 7.4);
  assert.equal(geometry.playheadLineWidth, 3);
});

test('two logical geometry instances cannot mutate each other', () => {
  const first = createDrawGridLogicalGeometry({ cols: 8, rows: 12 });
  const second = createDrawGridLogicalGeometry({ cols: 16, rows: 12 });
  assert.notEqual(first, second);
  assert.equal(first.cellWidth, 92.5);
  assert.equal(second.cellWidth, 46.25);
  assert.equal(first.gridRect.w, second.gridRect.w);
});

test('production geometry has no CSS-sized grid fallback or module-global mutable grid', () => {
  const drawgrid = readFileSync(new URL('../src/drawgrid/drawgrid.js', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../src/drawgrid/dg-layout.js', import.meta.url), 'utf8');
  const gridRender = readFileSync(new URL('../src/drawgrid/dg-grid-render.js', import.meta.url), 'utf8');
  assert.match(drawgrid, /let logicalGeometry = createDrawGridLogicalGeometry/);
  assert.doesNotMatch(drawgrid, /^const gridAreaLogical\s*=/m);
  assert.match(layout, /createLogicalGeometry\(\{ cols: s\.cols, rows: s\.rows \}\)/);
  assert.doesNotMatch(gridRender, /gridArea\s*=\s*\{ x: 0, y: 0, w: s\.cssW/);
});
