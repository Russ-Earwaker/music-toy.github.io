import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createDgStateIo } from '../src/drawgrid/dg-state-io.js';
import {
  DRAWGRID_PERSISTENCE_COORDINATE_SPACE,
  DRAWGRID_PERSISTENCE_VERSION,
  upgradeDrawGridStroke,
  upgradeDrawGridStrokes,
} from '../src/drawgrid/drawgrid-stroke-persistence.js';
import {
  DRAWGRID_STROKE_SPACE_LOGICAL,
  createDrawGridViewportSpace,
} from '../src/drawgrid/drawgrid-viewport-space.js';

function capture(strokes) {
  const cols = 8;
  return createDgStateIo({
    state: {
      cols,
      autoTune: true,
      panel: { dataset: { instrument: 'piano' } },
      strokes,
      currentMap: {
        active: Array(cols).fill(false),
        nodes: Array.from({ length: cols }, () => new Set()),
      },
      persistentDisabled: [],
      nodeGroupMap: [],
      manualOverrides: [],
    },
    deps: {},
  }).captureState();
}

test('current logical save/load round trip uses the versioned normalized boundary', () => {
  const logical = [{ x: 15, y: 20 }, { x: 400, y: 300 }, { x: 790, y: 590 }];
  const saved = capture([{
    coordinateSpace: DRAWGRID_STROKE_SPACE_LOGICAL,
    pts: logical,
    // Deliberately stale: capture must serialize authoritative logical points.
    __ptsN: [{ nx: 0.5, ny: 0.5 }],
    color: '#abc',
    isSpecial: true,
    generatorId: 2,
  }]);

  assert.equal(saved.schemaVersion, DRAWGRID_PERSISTENCE_VERSION);
  assert.equal(saved.coordinateSpace, DRAWGRID_PERSISTENCE_COORDINATE_SPACE);
  assert.equal(saved.strokes[0].ptsN.length, logical.length);

  const [loaded] = upgradeDrawGridStrokes(saved.strokes);
  assert.equal(loaded.coordinateSpace, DRAWGRID_STROKE_SPACE_LOGICAL);
  assert.deepEqual(loaded.pts, logical);
  assert.equal(loaded.isSpecial, true);
  assert.equal(loaded.generatorId, 2);
});

test('old normalized saves hydrate once into logical runtime points', () => {
  const input = {
    ptsN: [{ nx: 0, ny: 0 }, { nx: 0.25, ny: 0.75 }, { nx: 1, ny: 1 }],
    color: '#fff',
  };
  const upgraded = upgradeDrawGridStroke(input);
  assert.deepEqual(upgraded.pts, [
    { x: 30, y: 30 },
    { x: 215, y: 435 },
    { x: 770, y: 570 },
  ]);
  assert.deepEqual(upgraded.__ptsN, input.ptsN);
  assert.equal(upgraded.coordinateSpace, DRAWGRID_STROKE_SPACE_LOGICAL);
  assert.notStrictEqual(upgraded.__ptsN, input.ptsN);
});

test('normalized points outside the inset grid remain lossless', () => {
  const upgraded = upgradeDrawGridStroke({
    ptsN: [{ nx: -30 / 740, ny: -30 / 540 }, { nx: 770 / 740, ny: 570 / 540 }],
  });
  assert.deepEqual(upgraded.pts, [{ x: 0, y: 0 }, { x: 800, y: 600 }]);
});

test('legacy raw-coordinate saves upgrade one-way to logical points and ptsN', () => {
  const legacy = { pts: [{ x: 30, y: 30 }, { x: 215, y: 435 }], color: '#123' };
  const upgraded = upgradeDrawGridStroke(legacy);
  assert.deepEqual(upgraded.pts, legacy.pts);
  assert.deepEqual(upgraded.__ptsN, [{ nx: 0, ny: 0 }, { nx: 0.25, ny: 0.75 }]);
  assert.equal(upgraded.coordinateSpace, DRAWGRID_STROKE_SPACE_LOGICAL);
  assert.equal('ptsN' in upgraded, false);
});

test('presentation resize after import cannot mutate upgraded logical state', () => {
  const stroke = upgradeDrawGridStroke({ ptsN: [{ nx: 0.2, ny: 0.4 }, { nx: 0.8, ny: 0.6 }] });
  const before = structuredClone(stroke);
  for (const display of [
    { width: 400, height: 300, backingScale: 1 },
    { width: 800, height: 800, backingScale: 2 },
    { width: 1600, height: 600, backingScale: 3 },
  ]) createDrawGridViewportSpace(display);
  assert.deepEqual(stroke, before);
});

test('separate upgrades do not share mutable stroke state', () => {
  const source = [{ ptsN: [{ nx: 0.5, ny: 0.5 }] }];
  const first = upgradeDrawGridStrokes(source);
  const second = upgradeDrawGridStrokes(source);
  first[0].pts[0].x = 123;
  first[0].__ptsN[0].nx = 0.1;
  assert.deepEqual(second[0].pts[0], { x: 400, y: 300 });
  assert.deepEqual(second[0].__ptsN[0], { nx: 0.5, ny: 0.5 });
  assert.deepEqual(source, [{ ptsN: [{ nx: 0.5, ny: 0.5 }] }]);
});

test('production no longer depends on retired CSS-space stroke or viewport helpers', () => {
  const drawgrid = readFileSync(new URL('../src/drawgrid/drawgrid.js', import.meta.url), 'utf8');
  const stateIo = readFileSync(new URL('../src/drawgrid/dg-state-io.js', import.meta.url), 'utf8');
  const setState = readFileSync(new URL('../src/drawgrid/dg-set-state.js', import.meta.url), 'utf8');
  const resnap = readFileSync(new URL('../src/drawgrid/dg-resnap.js', import.meta.url), 'utf8');
  const combined = `${drawgrid}\n${stateIo}\n${setState}\n${resnap}`;

  assert.doesNotMatch(combined, /drawgrid-normalized-hydrated|drawgrid-legacy-css/);
  assert.doesNotMatch(combined, /reprojectNormalizedStrokesIfNeeded/);
  assert.doesNotMatch(drawgrid, /\bdgViewport\b|\bdgMap\b|createParticleViewport\s*\(/);
  assert.match(drawgrid, /Object\.freeze\(\{ w: DRAWGRID_LOGICAL_WIDTH, h: DRAWGRID_LOGICAL_HEIGHT \}\)/);
});

test('the unused live-size particle viewport export has been retired', () => {
  const baseIndex = readFileSync(new URL('../src/baseMusicToy/index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(baseIndex, /createParticleViewport|particle-viewport\.js/);
});
