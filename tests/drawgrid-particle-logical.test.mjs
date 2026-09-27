import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createGenericParticleField, collectParticleLinks } from '../src/baseMusicToy/particles/field-generic.js';
import {
  DRAWGRID_PARTICLE_BOUNDS,
  DRAWGRID_PARTICLE_LOGICAL_HEIGHT,
  DRAWGRID_PARTICLE_LOGICAL_WIDTH,
  createDrawGridParticleViewportSpace,
  drawGridParticleSourceLengthToLogical,
  drawGridParticleSourceToLogical,
} from '../src/drawgrid/drawgrid-particle-viewport-space.js';

function createField(seed = 'drawgrid-test') {
  return createGenericParticleField(
    { bounds: DRAWGRID_PARTICLE_BOUNDS },
    {
      seed,
      cap: 1200,
      returnSeconds: 2.4,
      forceMul: 2.5,
      vmaxMul: 6,
      noise: 0,
      kick: 0.25,
      kickDecay: 800,
      drawMode: 'dots',
    },
  );
}

function snapshot(field) {
  return field.runtime.particles.map((particle) => ({ ...particle }));
}

test('DrawGrid particle surface matches the authored 800x600 body', () => {
  assert.equal(DRAWGRID_PARTICLE_LOGICAL_WIDTH, 800);
  assert.equal(DRAWGRID_PARTICLE_LOGICAL_HEIGHT, 600);
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /data-toy="drawgrid"[^}]*--panel-w:\s*800px/s);
  assert.match(css, /data-toy="drawgrid"[^}]*\.toy-body[^}]*aspect-ratio:\s*4\s*\/\s*3/s);
});

test('DrawGrid logical particle motion is display-size and DPR independent', () => {
  const displays = [
    { width: 400, height: 300, backingScale: 1 },
    { width: 800, height: 600, backingScale: 2 },
    { width: 1600, height: 1200, backingScale: 3 },
    { width: 900, height: 700, backingScale: 1.5 },
  ];
  const states = displays.map((display) => {
    createDrawGridParticleViewportSpace(display);
    const field = createField();
    field.poke(400, 300, { radius: 80, strength: 40, mode: 'plow' });
    for (const dt of [1 / 60, 1 / 30, 0.01]) field.step(dt);
    return snapshot(field);
  });
  for (const state of states.slice(1)) assert.deepEqual(state, states[0]);
});

test('proportional DrawGrid pokes map to an identical logical impulse', () => {
  const sources = [{ width: 400, height: 300 }, { width: 800, height: 600 }, { width: 1600, height: 1200 }];
  const states = sources.map((source) => {
    const field = createField('poke');
    const point = drawGridParticleSourceToLogical({ x: source.width * 0.25, y: source.height * 0.75 }, source);
    const radius = drawGridParticleSourceLengthToLogical(source.width * 0.1, source);
    field.poke(point.x, point.y, { radius, strength: 50, mode: 'plow' });
    return snapshot(field);
  });
  for (const state of states.slice(1)) assert.deepEqual(state, states[0]);
});

test('proportional directional pushes produce identical logical velocity', () => {
  const sources = [{ width: 400, height: 300 }, { width: 800, height: 600 }, { width: 1600, height: 1200 }];
  const states = sources.map((source) => {
    const field = createField('push');
    const point = drawGridParticleSourceToLogical({ x: source.width / 2, y: source.height / 2 }, source);
    const radius = drawGridParticleSourceLengthToLogical(source.height * 0.2, source);
    field.pushDirectional(point.x, point.y, 1, 0, { radius, strength: 100, falloff: 'gaussian' });
    return snapshot(field);
  });
  for (const state of states.slice(1)) assert.deepEqual(state, states[0]);
});

test('presentation resize preserves DrawGrid particle identity and state', () => {
  const field = createField('resize');
  field.poke(320, 240, { radius: 75, strength: 45 });
  field.step(1 / 60);
  const identities = [...field.runtime.particles];
  const before = snapshot(field);
  for (const display of [
    { width: 400, height: 300, backingScale: 1 },
    { width: 800, height: 600, backingScale: 2 },
    { width: 1200, height: 700, backingScale: 3 },
  ]) createDrawGridParticleViewportSpace(display);
  assert.deepEqual(snapshot(field), before);
  assert.ok(field.runtime.particles.every((particle, index) => particle === identities[index]));
});

test('DrawGrid link geometry remains logical and presentation independent', () => {
  const particles = [{ x: 20, y: 20, fade: 1 }, { x: 50, y: 20, fade: 1 }, { x: 120, y: 20, fade: 1 }];
  const expected = [{ first: 0, second: 1 }];
  assert.deepEqual(collectParticleLinks(particles, 42), expected);
  createDrawGridParticleViewportSpace({ width: 400, height: 300, backingScale: 3 });
  assert.deepEqual(collectParticleLinks(particles, 42), expected);
});

test('DrawGrid owns a managed particle surface and no legacy field remains', () => {
  const drawgrid = readFileSync(new URL('../src/drawgrid/drawgrid.js', import.meta.url), 'utf8');
  const particles = readFileSync(new URL('../src/drawgrid/dg-particles.js', import.meta.url), 'utf8');
  const index = readFileSync(new URL('../src/baseMusicToy/index.js', import.meta.url), 'utf8');
  assert.match(drawgrid, /registerCanvas\?\.\('particles', particleCanvas, \{ policy: 'managed' \}/);
  assert.match(drawgrid, /createGenericParticleField/);
  assert.match(particles, /field\.render\(ctx\)/);
  assert.doesNotMatch(particles, /ResizeObserver|\.resize\?\./);
  assert.doesNotMatch(index, /field-generic-legacy|createField/);
});
