import test from 'node:test';
import assert from 'node:assert/strict';

import { createParticleRuntime } from '../src/baseMusicToy/particles/particle-runtime.js';
import { createDrumPadParticles } from '../src/drum-pad-particles.js';
import {
  DRUM_PARTICLE_LOGICAL_HEIGHT,
  DRUM_PARTICLE_LOGICAL_WIDTH,
  createDrumParticleViewportSpace,
} from '../src/drum-particle-viewport-space.js';

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

test('minimal runtime supports spawn, step, retirement, bounds updates, and clear', () => {
  const runtime = createParticleRuntime({
    bounds: { left: 0, top: 0, width: 10, height: 20 },
    capacity: 2,
    createParticle: ({ x }) => ({ x, y: 0, vx: 1, vy: 0 }),
    integrateParticle: (particle, dt) => { particle.x += particle.vx * dt; },
  });
  assert.ok(runtime.spawn({ x: 1 }));
  assert.ok(runtime.spawn({ x: 3 }));
  assert.equal(runtime.spawn({ x: 5 }), null);
  runtime.step(0.5);
  assert.deepEqual(runtime.particles.map(({ x }) => x), [1.5, 3.5]);
  runtime.retire((_particle, index) => index === 0);
  assert.equal(runtime.size, 1);
  runtime.setBounds({ left: -5, top: -5, width: 30, height: 40 });
  assert.deepEqual(runtime.bounds, { left: -5, top: -5, width: 30, height: 40, right: 25, bottom: 35 });
  runtime.clear();
  assert.equal(runtime.size, 0);
});

test('drum particle motion is identical across display sizes and DPR values', () => {
  const displays = [[200, 200, 1], [400, 400, 1], [800, 800, 2], [600, 360, 3]];
  const results = displays.map(([width, height, backingScale]) => {
    createDrumParticleViewportSpace({ width, height, backingScale });
    const field = createDrumPadParticles({ count: 8, random: seededRandom(41) });
    field.disturb();
    field.step(1 / 60);
    field.step(1 / 30);
    return snapshot(field);
  });
  for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
});

test('drum disturbance response is deterministic for the same state and random source', () => {
  const a = createDrumPadParticles({ count: 12, random: seededRandom(9) });
  const b = createDrumPadParticles({ count: 12, random: seededRandom(9) });
  a.disturb();
  b.disturb();
  assert.deepEqual(snapshot(a), snapshot(b));
  assert.ok(a.runtime.particles.every((particle) => particle.flash === 0.8));
});

test('logical bounds bounce is deterministic and preserves Drum flash behavior', () => {
  const field = createDrumPadParticles({ count: 1, random: () => 0.5 });
  const particle = field.runtime.particles[0];
  Object.assign(particle, { x: DRUM_PARTICLE_LOGICAL_WIDTH - 1, y: 200, vx: 180, vy: 0, homeX: 200, homeY: 200, flash: 0 });
  field.step(1 / 60);
  assert.equal(particle.x, DRUM_PARTICLE_LOGICAL_WIDTH);
  assert.ok(particle.vx < 0);
  assert.equal(particle.flash, 1);
});

test('surface resize preserves particle identity and complete logical state', () => {
  const field = createDrumPadParticles({ count: 6, random: seededRandom(18) });
  field.disturb();
  field.step(1 / 60);
  const references = [...field.runtime.particles];
  const before = snapshot(field);
  for (const [width, height] of [[200, 200], [400, 400], [640, 360], [800, 800]]) {
    createDrumParticleViewportSpace({ width, height, backingScale: width > 400 ? 2 : 1 });
  }
  assert.deepEqual(snapshot(field), before);
  assert.ok(field.runtime.particles.every((particle, index) => particle === references[index]));
  assert.equal(field.runtime.size, 6);
});

test('scheduler-style supplied dt produces identical state', () => {
  const run = () => {
    const field = createDrumPadParticles({ count: 10, random: seededRandom(77) });
    field.disturb();
    for (const dt of [1 / 60, 1 / 60, 1 / 30, 0.01, 0.02]) field.step(dt);
    return snapshot(field);
  };
  assert.deepEqual(run(), run());
  assert.equal(DRUM_PARTICLE_LOGICAL_WIDTH, 400);
  assert.equal(DRUM_PARTICLE_LOGICAL_HEIGHT, 400);
});

