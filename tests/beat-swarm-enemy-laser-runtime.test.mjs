import assert from 'node:assert/strict';
import test from 'node:test';

import { createBeatSwarmEnemyLaserRuntime } from '../src/beat-swarm/beat-swarm-enemy-laser-runtime.js';

function createFakeElement() {
  const classes = new Set();
  return {
    className: '',
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, active) => active ? classes.add(name) : classes.delete(name),
    },
    style: {},
    remove() {},
  };
}

test('uses equal aiming and locked phases before activating on a subdivision', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => createFakeElement() };
  try {
    const runtime = createBeatSwarmEnemyLaserRuntime();
    const enemy = { id: 1, wx: 0, wy: 0 };
    const activations = [];
    const locks = [];
    runtime.spawn({
      layer: { appendChild() {} },
      enemy,
      target: { x: 100, y: 0 },
      beatIndex: 0,
      stepIndex: 1,
      subdivisionsPerBeat: 2,
      pattern: {
        id: 'test_laser',
        beamCount: 1,
        phaseBeats: 1,
        warningBeats: 2,
        activeBeats: 1,
        aimMode: 'formation',
      },
    });
    const update = (beatIndex, stepIndex) => runtime.update({
      dt: 0.016,
      beatIndex,
      stepIndex,
      enemies: [enemy],
      player: { x: 1000, y: 1000 },
      worldToScreen: (point) => point,
      onLock: (event) => locks.push(event.stepIndex),
      onActivate: (event) => activations.push(event.stepIndex),
    });
    update(1, 2);
    assert.deepEqual(locks, []);
    assert.deepEqual(activations, []);
    update(1, 3);
    assert.deepEqual(locks, [3]);
    assert.deepEqual(activations, []);
    update(2, 4);
    assert.deepEqual(activations, []);
    update(2, 5);
    assert.deepEqual(activations, [5]);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('keeps every overlapping warning committed through lock and activation', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => createFakeElement() };
  try {
    const runtime = createBeatSwarmEnemyLaserRuntime();
    const enemy = { id: 7, wx: 0, wy: 0, el: createFakeElement() };
    const layer = { appendChild() {} };
    const pattern = {
      id: 'overlap_test_laser',
      beamCount: 1,
      phaseBeats: 1,
      activeBeats: 1,
      aimMode: 'track_then_lock',
    };
    runtime.spawn({ layer, enemy, target: { x: 100, y: 0 }, beatIndex: 0, pattern });
    runtime.spawn({ layer, enemy, target: { x: 0, y: 100 }, beatIndex: 1, pattern });
    assert.equal(runtime.getSnapshot().length, 2);

    const locks = [];
    const activations = [];
    const update = (beatIndex) => runtime.update({
      dt: 0.016,
      beatIndex,
      enemies: [enemy],
      player: { x: 100, y: 100 },
      worldToScreen: (point) => point,
      onLock: ({ hazard }) => locks.push(hazard.id),
      onActivate: ({ hazard }) => activations.push(hazard.id),
    });

    update(1);
    assert.deepEqual(locks, [1]);
    update(2);
    assert.deepEqual(locks, [1, 2]);
    assert.deepEqual(activations, [1]);
    update(3);
    assert.deepEqual(activations, [1, 2]);
    assert.equal(runtime.getSnapshot().length, 1);
    assert.equal(enemy.combatLaserPhase, 'active');
    update(4);
    assert.equal(runtime.getSnapshot().length, 0);
    assert.equal(enemy.combatLaserPhase, '');
  } finally {
    globalThis.document = previousDocument;
  }
});
