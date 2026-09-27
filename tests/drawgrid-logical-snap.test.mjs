import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  drawGridStrokeToLogicalPoints,
  snapDrawGridStrokeLogical,
} from '../src/drawgrid/drawgrid-logical-snap.js';
import {
  DRAWGRID_STROKE_SPACE_LOGICAL,
  createDrawGridLogicalGeometry,
  createDrawGridViewportSpace,
  drawGridClientToStrokeLogical,
  drawGridLogicalToDisplay,
} from '../src/drawgrid/drawgrid-viewport-space.js';
import { upgradeDrawGridStroke } from '../src/drawgrid/drawgrid-stroke-persistence.js';

const geometry = createDrawGridLogicalGeometry({ cols: 8, rows: 12 });

function serialize(result) {
  return {
    active: result.active,
    nodes: result.nodes.map((set) => [...set]),
    disabled: result.disabled.map((set) => [...set]),
    representativeY: result.representativeY,
  };
}

function snap(points, options = {}) {
  return snapDrawGridStrokeLogical({
    stroke: { coordinateSpace: DRAWGRID_STROKE_SPACE_LOGICAL, pts: points },
    geometry,
    strokeWidth: geometry.strokeWidth,
    ...options,
  });
}

const CASES = {
  horizontal: [{ x: 30, y: 255 }, { x: 770, y: 255 }],
  vertical: [{ x: 400, y: 30 }, { x: 400, y: 570 }],
  diagonal: [{ x: 30, y: 30 }, { x: 770, y: 570 }],
  shallow: [{ x: 30, y: 220 }, { x: 770, y: 330 }],
  steep: [{ x: 300, y: 30 }, { x: 470, y: 570 }],
  zigzag: [{ x: 30, y: 120 }, { x: 250, y: 470 }, { x: 500, y: 100 }, { x: 770, y: 430 }],
  backtrack: [{ x: 30, y: 160 }, { x: 650, y: 430 }, { x: 170, y: 250 }, { x: 770, y: 340 }],
  single: [{ x: 400, y: 300 }],
  boundary: [{ x: 122.5, y: 100 }, { x: 122.5, y: 500 }],
};

const loopPoints = Array.from({ length: 49 }, (_, index) => {
  const angle = (index / 48) * Math.PI * 2;
  return { x: 400 + Math.cos(angle) * 135, y: 300 + Math.sin(angle) * 105 };
});
const generatedPoints = Array.from({ length: 97 }, (_, index) => {
  const t = index / 96;
  return { x: 30 + 740 * t, y: 300 + Math.sin(t * Math.PI * 5) * 170 + Math.sin(t * Math.PI * 13) * 24 };
});
const VALIDATION_CORPUS = Object.freeze({
  repositoryGenerated: { pts: generatedPoints },
  weaponPresetHydrated: {
    __ptsN: [
      { nx: 0, ny: 0.15 }, { nx: 0.14, ny: 0.8 }, { nx: 0.28, ny: 0.25 },
      { nx: 0.43, ny: 0.72 }, { nx: 0.58, ny: 0.18 }, { nx: 0.72, ny: 0.82 },
      { nx: 0.86, ny: 0.32 }, { nx: 1, ny: 0.65 },
    ],
  },
  legacyRaw: { pts: CASES.zigzag },
  scribble: { pts: [
    { x: 50, y: 90 }, { x: 310, y: 500 }, { x: 160, y: 150 }, { x: 610, y: 470 },
    { x: 260, y: 80 }, { x: 750, y: 530 }, { x: 500, y: 120 }, { x: 70, y: 410 },
  ] },
  tightLoop: { pts: loopPoints },
  repeatedCrossings: { pts: CASES.backtrack },
  veryShort: { pts: [{ x: 398, y: 298 }, { x: 402, y: 302 }] },
  rowBoundary: { pts: [{ x: 30, y: 255 }, { x: 770, y: 255 }] },
  columnBoundary: { pts: CASES.boundary },
  nearGridEdge: { pts: [{ x: 31, y: 32 }, { x: 400, y: 48 }, { x: 769, y: 31 }] },
});

test('representative stroke families produce deterministic logical notes', () => {
  for (const [name, points] of Object.entries(CASES)) {
    const first = serialize(snap(points));
    const second = serialize(snap(points));
    assert.deepEqual(second, first, name);
  }
});

test('display size, board/toy transforms, and DPR cannot change snap results', () => {
  const displays = [
    { left: 0, top: 0, width: 400, height: 300, backingScale: 1 },
    { left: 40, top: 80, width: 800, height: 600, backingScale: 2 },
    { left: -100, top: 25, width: 1600, height: 1200, backingScale: 0.75 },
    { left: 90, top: 10, width: 800, height: 800, backingScale: 3 },
    { left: 15, top: 30, width: 1800, height: 600, backingScale: 1.5 },
  ];
  for (const [name, points] of Object.entries(CASES)) {
    const expected = serialize(snap(points));
    for (const display of displays) {
      const viewport = createDrawGridViewportSpace(display);
      const roundTripped = points.map((point) => drawGridClientToStrokeLogical(
        viewport,
        drawGridLogicalToDisplay(viewport, point),
      ));
      assert.deepEqual(serialize(snap(roundTripped)), expected, `${name}: ${display.width}x${display.height}@${display.backingScale}`);
    }
  }
});

test('logical stroke thickness admits a stroke barely entering an adjacent column', () => {
  const boundary = geometry.gridRect.x + geometry.cellWidth;
  const result = snap([
    { x: boundary + geometry.strokeWidth / 2 - 0.01, y: 210 },
    { x: boundary + geometry.strokeWidth / 2 - 0.01, y: 390 },
  ]);
  assert.equal(result.active[0], true);
  assert.equal(result.active[1], true);
});

test('exact column boundaries, row boundaries, and degenerate segments have stable rules', () => {
  const columnBoundary = geometry.gridRect.x + geometry.cellWidth;
  const rowBoundary = geometry.gridRect.y + geometry.cellHeight * 4;
  const boundary = snap([{ x: columnBoundary, y: rowBoundary }]);
  assert.equal(boundary.active[0], true);
  assert.equal(boundary.active[1], true);
  assert.deepEqual([...boundary.nodes[0]], [4]);
  assert.deepEqual([...boundary.nodes[1]], [4]);

  const repeated = snap([{ x: 400, y: 300 }, { x: 400, y: 300 }]);
  const single = snap([{ x: 400, y: 300 }]);
  assert.deepEqual(serialize(repeated), serialize(single));
});

test('multiple crossings use merged geometric coverage for representative Y', () => {
  const result = snap([
    { x: 30, y: 120 }, { x: 770, y: 120 },
    { x: 770, y: 480 }, { x: 30, y: 480 },
  ]);
  for (const y of result.representativeY) assert.ok(Math.abs(y - 300) < 1e-9);
});

test('normalized and legacy imports upgrade once into logical strokes', () => {
  const logical = { coordinateSpace: DRAWGRID_STROKE_SPACE_LOGICAL, pts: [{ x: 215, y: 435 }] };
  const hydrated = { ptsN: [{ nx: 0.25, ny: 0.75 }] };
  const legacy = { pts: [{ x: 215, y: 435 }] };
  const before = structuredClone({ logical, hydrated, legacy });
  assert.deepEqual(drawGridStrokeToLogicalPoints(logical, geometry), [{ x: 215, y: 435 }]);
  assert.deepEqual(drawGridStrokeToLogicalPoints(upgradeDrawGridStroke(hydrated), geometry), [{ x: 215, y: 435 }]);
  assert.deepEqual(drawGridStrokeToLogicalPoints(upgradeDrawGridStroke(legacy), geometry), [{ x: 215, y: 435 }]);
  assert.deepEqual({ logical, hydrated, legacy }, before);
});

const EXPECTED_CORPUS_ROWS = Object.freeze({
  repositoryGenerated: [[8], [6], [3], [8], [8], [3], [6], [8]],
  weaponPresetHydrated: [[5], [7], [5], [7], [4], [7], [6], [6]],
  legacyRaw: [[4], [7], [9], [6], [3], [3], [5], [8]],
  scribble: [[4], [5], [6], [5], [5], [6], [8], [10]],
  tightLoop: [[6], [6], [6], [6], [6], [6], [6], [6]],
  repeatedCrossings: [[3], [5], [5], [6], [7], [7], [7], [7]],
  veryShort: [[6], [6], [6], [6], [6], [6], [6], [6]],
  rowBoundary: [[5], [5], [5], [5], [5], [5], [5], [5]],
  columnBoundary: [[6], [6], [6], [6], [6], [6], [6], [6]],
  nearGridEdge: [[0], [0], [0], [0], [0], [0], [0], [0]],
});
const ALL_ACTIVE = Object.freeze(Array(8).fill(true));
const EXPECTED_CORPUS_ACTIVE = Object.freeze({
  repositoryGenerated: ALL_ACTIVE,
  weaponPresetHydrated: ALL_ACTIVE,
  legacyRaw: ALL_ACTIVE,
  scribble: ALL_ACTIVE,
  tightLoop: Object.freeze([false, false, true, true, true, true, false, false]),
  repeatedCrossings: ALL_ACTIVE,
  veryShort: Object.freeze([false, false, false, true, true, false, false, false]),
  rowBoundary: ALL_ACTIVE,
  columnBoundary: Object.freeze([true, true, false, false, false, false, false, false]),
  nearGridEdge: ALL_ACTIVE,
});

test('validated real-stroke corpus keeps its musical row decisions', () => {
  for (const [name, stroke] of Object.entries(VALIDATION_CORPUS)) {
    const result = snapDrawGridStrokeLogical({ stroke: upgradeDrawGridStroke(stroke), geometry, strokeWidth: 36 });
    assert.deepEqual(result.nodes.map((set) => [...set]), EXPECTED_CORPUS_ROWS[name], name);
    assert.deepEqual(result.active, EXPECTED_CORPUS_ACTIVE[name], `${name}: active columns`);
  }
});

test('musical snapping has no raster, canvas-size, or DPR dependency', () => {
  const source = readFileSync(new URL('../src/drawgrid/dg-snap.js', import.meta.url), 'utf8');
  const logicalSource = readFileSync(new URL('../src/drawgrid/drawgrid-logical-snap.js', import.meta.url), 'utf8');
  assert.match(source, /const result = snapDrawGridStrokeLogical/);
  for (const forbidden of [/getImageData/, /devicePixelRatio/, /paintDpr/, /canvas\.width/, /canvas\.height/, /createElement\(['"]canvas/]) {
    assert.doesNotMatch(source, forbidden);
    assert.doesNotMatch(logicalSource, forbidden);
  }
  assert.doesNotMatch(source, /__DRAWGRID_(?:COMPARE_RASTER_SNAP|SNAP_COMPARISON)/);
});
