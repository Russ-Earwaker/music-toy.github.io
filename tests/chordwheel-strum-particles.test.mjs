import test from 'node:test';
import assert from 'node:assert/strict';

import { createChordWheelStrumParticles } from '../src/chordwheel-strum-particles.js';
import {
  CHORDWHEEL_STRUM_LOGICAL_HEIGHT,
  CHORDWHEEL_STRUM_LOGICAL_WIDTH,
  chordWheelStrumClientToLogical,
  createChordWheelStrumViewportSpace,
} from '../src/chordwheel-strum-viewport-space.js';

function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function snapshot(field) {
  return field.runtime.particles.map((particle) => ({ ...particle }));
}

function runField(display) {
  createChordWheelStrumViewportSpace(display);
  const field = createChordWheelStrumParticles({ random: seededRandom(42) });
  field.lineBurst(CHORDWHEEL_STRUM_LOGICAL_WIDTH / 2, 12, 4.6, 1.8);
  for (const dt of [1 / 60, 1 / 30, 0.01]) field.step(dt);
  return field;
}

test('strum particles have identical logical motion across display sizes and DPR', () => {
  const displays = [
    { width: 190, height: 190, backingScale: 1 },
    { width: 380, height: 380, backingScale: 2 },
    { width: 760, height: 760, backingScale: 3 },
    { width: 600, height: 360, backingScale: 1.5 },
  ];
  const states = displays.map((display) => snapshot(runField(display)));
  for (const state of states.slice(1)) assert.deepEqual(state, states[0]);
});

test('the same seeded strum produces the same logical disturbance', () => {
  const create = () => {
    const field = createChordWheelStrumParticles({ random: seededRandom(7) });
    field.lineBurst(190, 20, 4.6, 1.8);
    return field;
  };
  assert.deepEqual(snapshot(create()), snapshot(create()));
});

test('transformed client rectangles map gestures into logical coordinates', () => {
  const cases = [
    { rect: { left: 20, top: 30, width: 380, height: 380 }, scale: 1 },
    { rect: { left: 50, top: 80, width: 190, height: 190 }, scale: 0.5 },
    { rect: { left: 90, top: 40, width: 608, height: 608 }, scale: 1.6 },
  ];
  for (const { rect } of cases) {
    const point = chordWheelStrumClientToLogical({ x: rect.left + rect.width * 0.75, y: rect.top + rect.height * 0.25 }, rect);
    assert.deepEqual(point, { x: 285, y: 95 });
  }
});

test('contain-fit gesture mapping accounts for non-square letterbox offsets', () => {
  const rect = { left: 10, top: 20, width: 760, height: 380 };
  const center = chordWheelStrumClientToLogical({ x: 390, y: 210 }, rect);
  assert.deepEqual(center, { x: 190, y: 190 });
});

test('surface resize preserves particle identity and logical state', () => {
  const field = runField({ width: 380, height: 380, backingScale: 1 });
  const identities = [...field.runtime.particles];
  const before = snapshot(field);
  for (const display of [
    { width: 190, height: 190, backingScale: 1 },
    { width: 760, height: 760, backingScale: 2 },
    { width: 640, height: 360, backingScale: 3 },
  ]) createChordWheelStrumViewportSpace(display);
  assert.deepEqual(snapshot(field), before);
  assert.ok(field.runtime.particles.every((particle, index) => particle === identities[index]));
});

test('runtime geometry has no display or backing-buffer fields', () => {
  const field = createChordWheelStrumParticles({ random: seededRandom(3) });
  field.lineBurst(190, 2, 4.6, 1.8);
  assert.deepEqual(field.runtime.bounds, {
    left: 0,
    top: 0,
    width: CHORDWHEEL_STRUM_LOGICAL_WIDTH,
    height: CHORDWHEEL_STRUM_LOGICAL_HEIGHT,
    right: CHORDWHEEL_STRUM_LOGICAL_WIDTH,
    bottom: CHORDWHEEL_STRUM_LOGICAL_HEIGHT,
  });
  for (const particle of field.runtime.particles) {
    assert.equal('canvasWidth' in particle, false);
    assert.equal('canvasHeight' in particle, false);
    assert.equal('dpr' in particle, false);
  }
});
