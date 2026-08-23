import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateAuthoringIntensityHandoffTrace,
  parseBeatSwarmTraceRecords,
} from '../src/beat-swarm/beat-swarm-authoring-intensity-audit.js';

function event(type, payload = {}, stepIndex = 0) {
  return { type, payload, stepIndex };
}

test('parses JSON-lines traces and ignores malformed lines', () => {
  const records = parseBeatSwarmTraceRecords('{"type":"one"}\ninvalid\n{"type":"two"}');
  assert.deepEqual(records.map((record) => record.type), ['one', 'two']);
});

test('passes a complete authored motif handoff through the intensity sequence', () => {
  const records = [
    event('music_contribution_empty_lanes_armed', { bassDriveSteps: 0, accentRhythmSteps: 0, leadSteps: 0 }),
    event('music_contribution_completed', { id: 'bass-1', laneId: 'foundation_lane' }),
    event('music_contribution_completed', { id: 'bass-2', laneId: 'foundation_lane' }),
    event('music_contribution_completed', { id: 'accent-1', laneId: 'secondary_loop_lane' }),
    event('music_contribution_completed', { id: 'accent-2', laneId: 'secondary_loop_lane' }),
    event('music_contribution_completed', { id: 'lead-1', laneId: 'primary_loop_lane' }),
    event('music_contribution_protection_armed', { laneId: 'foundation_lane' }),
    event('music_contribution_protection_armed', { laneId: 'secondary_loop_lane' }),
    event('music_contribution_protection_armed', { laneId: 'primary_loop_lane' }),
    event('music_rhythm_rewrite_committed_to_theme', {
      laneId: 'foundation_lane',
      patternChain: ['10000000', '00001000'],
    }),
    event('music_rhythm_rewrite_committed_to_theme', {
      laneId: 'secondary_loop_lane',
      patternChain: ['00100000', '00000010'],
    }),
    event('lead_ball_rewrite_committed_to_theme', {
      laneId: 'primary_loop_lane',
      activeSteps: [0, 4, 12],
    }),
    event('music_primary_loop_lane_emitted', { leadGateLiteralLoop: true }, 20),
    event('director_formation_flow_started_after_onboarding'),
    ...['low', 'medium', 'build', 'peak', 'release', 'settle']
      .map((section) => event('music_level1_arrangement_state', { intensityAuditionSection: section })),
    event('music_contribution_protection_expired', { laneId: 'primary_loop_lane' }, 40),
    event('music_primary_loop_lane_emitted', { leadGateLiteralLoop: false }, 44),
    event('director_density_contribution_requested', { contributionId: 'density-1' }),
    event('music_density_request_queued_as_contribution', { id: 'density-1' }),
  ];
  const rhythmTheme = {
    data: { toyType: 'simpleRhythm', patternChain: [[true, false], [false, true]] },
  };
  const leadTheme = {
    data: { toyType: 'drawgrid', tuneChain: [{ active: [true, false] }] },
  };
  const audit = evaluateAuthoringIntensityHandoffTrace(records, {
    bassDrive: rhythmTheme,
    accentRhythm: rhythmTheme,
    leadTheme,
  });
  assert.equal(audit.assertionsPassed, true);
  assert.deepEqual(audit.intensityOrder, ['low', 'medium', 'build', 'peak', 'release', 'settle']);
});

test('uses committed trace patterns when the runtime theme snapshot is unavailable', () => {
  const records = [
    event('music_rhythm_rewrite_committed_to_theme', {
      laneId: 'foundation_lane',
      patternChain: ['10000000', '00001000'],
    }),
    event('music_rhythm_rewrite_committed_to_theme', {
      laneId: 'secondary_loop_lane',
      patternChain: [[false, true], [true, false]],
    }),
    event('lead_ball_rewrite_committed_to_theme', {
      laneId: 'primary_loop_lane',
      activeSteps: [0, 8, 16],
    }),
  ];
  const audit = evaluateAuthoringIntensityHandoffTrace(records);
  assert.deepEqual(audit.themeStepCounts, {
    foundation_lane: 2,
    secondary_loop_lane: 2,
    primary_loop_lane: 3,
  });
  assert.equal(audit.assertions.authoredThemesPersisted, true);
});

test('fails when authoring is bypassed or the intensity run is incomplete', () => {
  const audit = evaluateAuthoringIntensityHandoffTrace([], {});
  assert.equal(audit.assertionsPassed, false);
  assert.equal(audit.assertions.lanesStartedEmpty, false);
  assert.equal(audit.assertions.fullIntensitySequenceObserved, false);
  assert.equal(audit.assertions.authoredThemesPersisted, false);
});
