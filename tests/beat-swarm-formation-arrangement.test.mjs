import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveRhythmicFormationMotifs,
  projectRhythmSubdivisionsToBeats,
} from '../src/beat-swarm/beat-swarm-formation-arrangement.js';

test('projects eighth-note rhythm activity onto attack beat boundaries', () => {
  assert.deepEqual(
    projectRhythmSubdivisionsToBeats([true, false, false, true, false, false, true, true], 2),
    [true, true, false, true],
  );
});

test('uses the first playable player lane in arrangement priority order', () => {
  const result = deriveRhythmicFormationMotifs({
    sourceLaneIds: ['secondary_loop_lane', 'foundation_lane'],
    laneStepsById: {
      secondary_loop_lane: Array(16).fill(false),
      foundation_lane: [true, false, false, false, true, false, false, false],
    },
    motifLength: 8,
    memberCount: 2,
    startBeat: 0,
  });
  assert.equal(result.sourceLaneId, 'foundation_lane');
  assert.equal(result.derived, true);
  assert.deepEqual(result.memberSteps, [[0, 4], [2, 6]]);
});

test('aligns derived attacks to the source global loop phase', () => {
  const result = deriveRhythmicFormationMotifs({
    sourceLaneIds: ['foundation_lane'],
    laneStepsById: {
      foundation_lane: [true, false, false, false, false, false, true, false],
    },
    motifLength: 8,
    memberCount: 2,
    startBeat: 1,
  });
  assert.deepEqual(result.memberSteps, [[2, 6], [3, 7]]);
});

test('returns an explicit legacy fallback when no player rhythm is playable', () => {
  const result = deriveRhythmicFormationMotifs({
    sourceLaneIds: ['secondary_loop_lane'],
    laneStepsById: { secondary_loop_lane: Array(16).fill(false) },
    motifLength: 16,
    memberCount: 3,
  });
  assert.equal(result.derived, false);
  assert.equal(result.derivationMode, 'legacy_independent_fallback');
  assert.deepEqual(result.memberSteps, []);
});
