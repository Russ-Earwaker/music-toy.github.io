import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFormationHoldingSchedule,
  getFormationHoldingBeatState,
} from '../src/beat-swarm/beat-swarm-formation-lifecycle.js';

test('formation overload lasts exactly two motif loops', () => {
  const schedule = createFormationHoldingSchedule({
    startBeat: 12,
    motifLength: 16,
    subdivisionsPerBeat: 2,
  });
  assert.deepEqual(schedule, {
    startBeat: 12,
    loopBeats: 8,
    durationBeats: 16,
    triggerBeat: 28,
  });
  assert.equal(getFormationHoldingBeatState(schedule, 27).trigger, false);
  assert.equal(getFormationHoldingBeatState(schedule, 28).trigger, true);
});

test('formation overload pulse accelerates from four beats to every beat', () => {
  const schedule = createFormationHoldingSchedule({ startBeat: 8, motifLength: 16 });
  assert.equal(getFormationHoldingBeatState(schedule, 8).pulseEveryBeats, 4);
  assert.equal(getFormationHoldingBeatState(schedule, 8).pulse, true);
  assert.equal(getFormationHoldingBeatState(schedule, 9).pulse, false);
  assert.equal(getFormationHoldingBeatState(schedule, 24).pulseEveryBeats, 2);
  assert.equal(getFormationHoldingBeatState(schedule, 32).pulseEveryBeats, 1);
  assert.equal(getFormationHoldingBeatState(schedule, 33).pulse, true);
});
