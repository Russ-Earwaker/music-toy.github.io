import assert from 'node:assert/strict';
import test from 'node:test';

import { getLeadBallCaptureAllowance } from '../src/beat-swarm/beat-swarm-lead-ball.js';

test('opens one lead-ball capture before the phrase clock starts', () => {
  assert.equal(getLeadBallCaptureAllowance({
    stepCount: 32,
    targetHitCount: 8,
    captureStartTick: -1,
    currentTick: 120,
  }), 1);
});

test('paces an eight-note ball motif across the full 32-step phrase', () => {
  const allowanceAt = (relativeStep) => getLeadBallCaptureAllowance({
    stepCount: 32,
    targetHitCount: 8,
    captureStartTick: 100,
    currentTick: 100 + relativeStep,
  });

  assert.equal(allowanceAt(0), 1);
  assert.equal(allowanceAt(3), 1);
  assert.equal(allowanceAt(4), 2);
  assert.equal(allowanceAt(18), 5);
  assert.equal(allowanceAt(27), 8);
  assert.equal(allowanceAt(31), 8);
});

test('never opens more captures than the requested motif density', () => {
  assert.equal(getLeadBallCaptureAllowance({
    stepCount: 32,
    targetHitCount: 11,
    captureStartTick: 40,
    currentTick: 400,
  }), 11);
});
