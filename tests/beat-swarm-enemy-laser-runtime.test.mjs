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
    },
    style: {},
    remove() {},
  };
}

test('activates subdivision-scheduled lasers on the matching offbeat', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => createFakeElement() };
  try {
    const runtime = createBeatSwarmEnemyLaserRuntime();
    const enemy = { id: 1, wx: 0, wy: 0 };
    const activations = [];
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
        warningBeats: 1,
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
      onActivate: (event) => activations.push(event.stepIndex),
    });
    update(1, 2);
    assert.deepEqual(activations, []);
    update(1, 3);
    assert.deepEqual(activations, [3]);
  } finally {
    globalThis.document = previousDocument;
  }
});
