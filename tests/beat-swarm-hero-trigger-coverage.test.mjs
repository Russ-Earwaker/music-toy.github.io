import assert from 'node:assert/strict';
import test from 'node:test';

import { executePerformedBeatEventRuntime } from '../src/beat-swarm/beat-swarm-event-execution.js';

function executeDirectPrimary(actionType, payload = {}) {
  const carrier = { id: 42, musicLaneId: 'primary_loop_lane' };
  const audio = [];
  const visual = [];
  const ok = executePerformedBeatEventRuntime({
    event: {
      actorId: 42,
      beatIndex: 8,
      stepIndex: 2,
      actionType,
      instrumentId: 'RETRO SQUARE',
      note: 'C4',
      payload: { musicLaneId: 'primary_loop_lane', audioGain: 0.72, ...payload },
    },
    constants: { composerBeatsPerBar: 4 },
    state: {},
    helpers: {
      getSwarmEnemyById: (id) => id === 42 ? carrier : null,
      triggerInstrument: (...args) => audio.push(args),
      notifyEnemyMusicalTrigger: (enemy, options) => visual.push({ enemy, options }),
    },
  });
  return { ok, carrier, audio, visual };
}

test('direct lead-ball playback notifies its exact carrier after audio execution', () => {
  const result = executeDirectPrimary('player-lead-theme-direct', { leadBallMotifDerived: true });
  assert.equal(result.ok, true);
  assert.equal(result.audio.length, 1);
  assert.deepEqual(result.visual, [{
    enemy: result.carrier,
    options: { laneId: 'primary_loop_lane', source: 'primary_lead_ball_direct', strength: 'strong' },
  }]);
});

test('direct Primary release echo reports a missing carrier through the shared notification', () => {
  const visual = [];
  const ok = executePerformedBeatEventRuntime({
    event: {
      actorId: 0,
      beatIndex: 12,
      stepIndex: 4,
      actionType: 'player-lead-release-echo',
      instrumentId: 'RETRO SQUARE',
      note: 'D4',
      payload: { musicLaneId: 'primary_loop_lane', audioGain: 0.24 },
    },
    constants: { composerBeatsPerBar: 4 },
    state: {},
    helpers: {
      triggerInstrument() {},
      notifyEnemyMusicalTrigger: (enemy, options) => visual.push({ enemy, options }),
    },
  });
  assert.equal(ok, true);
  assert.deepEqual(visual, [{
    enemy: null,
    options: { laneId: 'primary_loop_lane', source: 'primary_release_echo_direct', strength: 'soft' },
  }]);
});
