import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptBouncerPendingHit,
  clearBouncerPendingHit,
  getBouncerPrimeGlow,
} from '../src/bouncer-pending-hit.js';

test('Bouncer source stays locked until its quantized fire tick', () => {
  const source = {};
  assert.equal(acceptBouncerPendingHit(source, { impactTick: 10, fireTick: 48, eventId: 'first' }), true);
  assert.equal(acceptBouncerPendingHit(source, { impactTick: 30, fireTick: 48, eventId: 'ignored' }), false);
  assert.deepEqual(source.pendingHit, { impactTick: 10, fireTick: 48, eventId: 'first' });
  assert.equal(acceptBouncerPendingHit(source, { impactTick: 48, fireTick: 96, eventId: 'second' }), true);
  assert.deepEqual(source.pendingHit, { impactTick: 48, fireTick: 96, eventId: 'second' });
});

test('Bouncer prime glow rises in tick time and clears at the note', () => {
  const source = {};
  acceptBouncerPendingHit(source, { impactTick: 24, fireTick: 48, eventId: 'hit' });
  const start = getBouncerPrimeGlow(source, 24);
  const middle = getBouncerPrimeGlow(source, 36);
  assert.ok(start >= 0.2 && start <= 0.3);
  assert.ok(middle > start && middle < 0.7);
  assert.equal(getBouncerPrimeGlow(source, 48), 0);
  assert.equal(clearBouncerPendingHit(source, 'hit'), true);
  assert.equal(source.pendingHit, null);
});

test('no-quantization pending hit has no artificial priming interval', () => {
  const source = {};
  assert.equal(acceptBouncerPendingHit(source, { impactTick: 72, fireTick: 72, eventId: 'now' }), true);
  assert.equal(getBouncerPrimeGlow(source, 72), 0);
});
