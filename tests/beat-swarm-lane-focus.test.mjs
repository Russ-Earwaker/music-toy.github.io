import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBeatSwarmLaneFocusToCarrierCounts,
  createBeatSwarmLaneFocusRuntime,
  evaluateBeatSwarmLaneFocusPresentation,
  resolveBeatSwarmLaneFocusBudget,
} from '../src/beat-swarm/beat-swarm-lane-focus.js';

test('focus budget grows with intensity and difficulty', () => {
  assert.deepEqual(resolveBeatSwarmLaneFocusBudget('low', 0), {
    stage: 'low', difficulty: 0, primary: 1, supporting: 0,
  });
  assert.deepEqual(resolveBeatSwarmLaneFocusBudget('peak', 2), {
    stage: 'peak', difficulty: 2, primary: 2, supporting: 4,
  });
});

test('presentation audit distinguishes visible, entering, and missing focus lanes', () => {
  const result = evaluateBeatSwarmLaneFocusPresentation({
    primaryLaneIds: ['primary_loop_lane', 'foundation_lane'],
    supportingLaneIds: ['secondary_loop_lane'],
  }, {
    primary_loop_lane: { visibleCount: 1, candidateCount: 2, selectedEnemyId: 8 },
    foundation_lane: { visibleCount: 0, candidateCount: 1, selectedEnemyId: 9, guidanceActive: true },
    secondary_loop_lane: { visibleCount: 0, candidateCount: 0 },
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.visibleLaneIds, ['primary_loop_lane']);
  assert.deepEqual(result.enteringLaneIds, ['foundation_lane']);
  assert.deepEqual(result.missingLaneIds, ['secondary_loop_lane']);
  assert.deepEqual(result.pendingPrimaryLaneIds, ['foundation_lane']);
  assert.deepEqual(result.missingPrimaryLaneIds, []);
});

test('focus rotates underexposed lanes at phrase boundaries', () => {
  const runtime = createBeatSwarmLaneFocusRuntime();
  const lanes = ['foundation_lane', 'secondary_loop_lane', 'primary_loop_lane'];
  const first = runtime.update({ barIndex: 0, intensityStage: 'low', availableLaneIds: lanes });
  const second = runtime.update({ barIndex: 4, intensityStage: 'low', availableLaneIds: lanes });
  assert.equal(first.primaryLaneIds.length, 1);
  assert.equal(second.primaryLaneIds.length, 1);
  assert.notEqual(first.primaryLaneIds[0], second.primaryLaneIds[0]);
});

test('focus hold length is configurable in phrases', () => {
  const runtime = createBeatSwarmLaneFocusRuntime({
    config: {
      phraseBars: 4,
      minimumPrimaryPhrases: 2,
      difficultySupportingLaneStep: 1,
      difficultyExtraPrimaryAt: 3,
      budgets: { low: { primary: 1, supporting: 0 } },
    },
  });
  const lanes = ['foundation_lane', 'secondary_loop_lane'];
  const first = runtime.update({ barIndex: 0, intensityStage: 'low', availableLaneIds: lanes });
  const held = runtime.update({ barIndex: 4, intensityStage: 'low', availableLaneIds: lanes });
  const rotated = runtime.update({ barIndex: 8, intensityStage: 'low', availableLaneIds: lanes });
  assert.deepEqual(held.primaryLaneIds, first.primaryLaneIds);
  assert.notDeepEqual(rotated.primaryLaneIds, first.primaryLaneIds);
});

test('newly authored lane immediately becomes primary focus', () => {
  const runtime = createBeatSwarmLaneFocusRuntime();
  const lanes = ['foundation_lane', 'secondary_loop_lane', 'primary_loop_lane'];
  runtime.update({ barIndex: 0, intensityStage: 'low', availableLaneIds: lanes });
  const protectedFocus = runtime.update({
    barIndex: 1,
    intensityStage: 'low',
    availableLaneIds: lanes,
    forcedLaneIds: ['primary_loop_lane'],
  });
  assert.deepEqual(protectedFocus.primaryLaneIds, ['primary_loop_lane']);
  assert.equal(protectedFocus.reason, 'player_authored_override');
});

test('carrier recruitment follows focus without mutating source counts', () => {
  const source = {
    foundation: 2,
    secondary_loop_rhythm: 3,
    primary_loop_lead: 2,
    ornament: 0,
  };
  const result = applyBeatSwarmLaneFocusToCarrierCounts(source, {
    focusedLaneIds: ['primary_loop_lane', 'sparkle_lane'],
  });
  assert.deepEqual(result, {
    foundation: 0,
    secondary_loop_rhythm: 0,
    primary_loop_lead: 2,
    ornament: 1,
  });
  assert.equal(source.foundation, 2);
});

test('an initialized empty focus recruits no musical lane carriers', () => {
  assert.deepEqual(applyBeatSwarmLaneFocusToCarrierCounts({
    foundation: 3,
    secondary_loop_rhythm: 2,
    primary_loop_lead: 2,
    ornament: 1,
  }, {
    focusedLaneIds: [],
  }), {
    foundation: 0,
    secondary_loop_rhythm: 0,
    primary_loop_lead: 0,
    ornament: 0,
  });
});
