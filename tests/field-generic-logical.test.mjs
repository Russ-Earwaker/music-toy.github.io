import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  collectParticleLinks,
  createGenericParticleField,
} from '../src/baseMusicToy/particles/field-generic.js';
import {
  SIMPLE_RHYTHM_PARTICLE_BOUNDS,
  createSimpleRhythmParticleViewportSpace,
} from '../src/simple-rhythm-particle-viewport-space.js';

function createField(seed = 'loop-grid-test') {
  return createGenericParticleField(
    { bounds: SIMPLE_RHYTHM_PARTICLE_BOUNDS },
    {
      seed,
      cap: 600,
      returnSeconds: 2.4,
      forceMul: 1,
      noise: 0,
      kick: 0,
      drawMode: 'dots+links',
      linkDist: 42,
    },
  );
}

function snapshot(field) {
  return field.runtime.particles.map((particle) => ({ ...particle }));
}

test('logical particle motion is identical across display sizes and DPR', () => {
  const displays = [
    { width: 309, height: 88.5, backingScale: 1 },
    { width: 618, height: 177, backingScale: 2 },
    { width: 1236, height: 354, backingScale: 3 },
    { width: 800, height: 300, backingScale: 1.5 },
  ];
  const states = displays.map((display) => {
    createSimpleRhythmParticleViewportSpace(display);
    const field = createField();
    field.poke(309, 88.5, { radius: 70, strength: 35 });
    for (const dt of [1 / 60, 1 / 30, 0.01]) field.step(dt);
    return snapshot(field);
  });
  for (const state of states.slice(1)) assert.deepEqual(state, states[0]);
});

test('particle count and quality depend on logical configuration, not display area', () => {
  const fieldA = createField('quality');
  const fieldB = createField('quality');
  createSimpleRhythmParticleViewportSpace({ width: 309, height: 88.5, backingScale: 1 });
  createSimpleRhythmParticleViewportSpace({ width: 1236, height: 354, backingScale: 3 });
  assert.equal(fieldA.runtime.size, fieldB.runtime.size);
  fieldA.applyBudget({ maxCountScale: 0.5, capScale: 0.75 });
  fieldB.applyBudget({ maxCountScale: 0.5, capScale: 0.75 });
  for (let index = 0; index < 120; index += 1) {
    fieldA.step(1 / 60);
    fieldB.step(1 / 60);
  }
  assert.equal(fieldA.runtime.size, fieldB.runtime.size);
  assert.equal(fieldA._state.targetDesired, fieldB._state.targetDesired);
});

test('surface resize preserves positions, homes, velocities, and displacement', () => {
  const field = createField('resize');
  field.pushDirectional(309, 88.5, 1, 0, { radius: 90, strength: 120 });
  field.step(1 / 60);
  const identities = [...field.runtime.particles];
  const before = snapshot(field);
  for (const display of [
    { width: 200, height: 200, backingScale: 1 },
    { width: 618, height: 177, backingScale: 2 },
    { width: 1000, height: 250, backingScale: 3 },
  ]) createSimpleRhythmParticleViewportSpace(display);
  assert.deepEqual(snapshot(field), before);
  assert.ok(field.runtime.particles.every((particle, index) => particle === identities[index]));
});

test('dots-and-links decisions remain invariant in logical space', () => {
  const particles = [
    { x: 10, y: 10, fade: 1 },
    { x: 30, y: 10, fade: 1 },
    { x: 100, y: 10, fade: 1 },
  ];
  const expected = [{ first: 0, second: 1 }];
  assert.deepEqual(collectParticleLinks(particles, 42), expected);
  for (const display of [
    { width: 309, height: 88.5, backingScale: 1 },
    { width: 1236, height: 354, backingScale: 3 },
  ]) {
    createSimpleRhythmParticleViewportSpace(display);
    assert.deepEqual(collectParticleLinks(particles, 42), expected);
  }
});

test('logical field implementation contains no DOM, canvas-size, resize, or DPR ownership', () => {
  const source = readFileSync(new URL('../src/baseMusicToy/particles/field-generic.js', import.meta.url), 'utf8');
  for (const forbidden of [
    'ResizeObserver',
    'devicePixelRatio',
    'getBoundingClientRect',
    'clientWidth',
    'clientHeight',
    'canvas.width',
    'canvas.height',
    'window.innerWidth',
    'window.innerHeight',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});

test('Simple Rhythm and DrawGrid use the logical field without a legacy export', () => {
  const simpleSource = readFileSync(new URL('../src/simple-rhythm-visual.js', import.meta.url), 'utf8');
  const drawGridSource = readFileSync(new URL('../src/drawgrid/drawgrid.js', import.meta.url), 'utf8');
  const indexSource = readFileSync(new URL('../src/baseMusicToy/index.js', import.meta.url), 'utf8');
  assert.match(simpleSource, /createToySurfaceManager/);
  assert.match(simpleSource, /createGenericParticleField/);
  assert.doesNotMatch(simpleSource, /createParticleViewport/);
  assert.match(drawGridSource, /createGenericParticleField/);
  assert.doesNotMatch(indexSource, /field-generic-legacy|createField/);
});
