import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveMelodicFormationMotifs,
  deriveRhythmicFormationMotifs,
  deriveTonalBassFormationMotifs,
  projectMelodySubdivisionsToBeats,
  projectRhythmSubdivisionsToBeats,
} from '../src/beat-swarm/beat-swarm-formation-arrangement.js';

const TONAL_BASS_SOURCE = [
  true, false, false, false,
  true, false, true, false,
  true, false, false, false,
  true, false, true, false,
];

function deriveTonalBass(energyState, startBeat = 0) {
  return deriveTonalBassFormationMotifs({
    sourceSteps: TONAL_BASS_SOURCE,
    rootNote: 'C2',
    fifthNote: 'G2',
    octaveRootNote: 'C3',
    energyState,
    motifLength: 16,
    memberCount: 3,
    startBeat,
  });
}

test('derives a sparse pitched bass lane from Foundation without replacing it', () => {
  const result = deriveTonalBass('medium');
  assert.equal(result.derived, true);
  assert.equal(result.sourceLaneId, 'foundation_lane');
  assert.equal(result.outputLaneId, 'tonal_bass_lane');
  assert.equal(result.subdivisionsPerBeat, 1);
  assert.ok(result.motifHitCount > 0);
  assert.ok(result.motifHitCount < result.sourceHitCount * 2);
  const notes = result.members.flatMap((member) => Object.values(member.noteByStep));
  assert.ok(notes.every((note) => note === 'C2' || note === 'G2'));
});

test('increases tonal bass density from Medium through Build to Peak', () => {
  const medium = deriveTonalBass('medium');
  const build = deriveTonalBass('build');
  const peak = deriveTonalBass('peak');
  assert.ok(medium.motifHitCount < build.motifHitCount);
  assert.ok(build.motifHitCount < peak.motifHitCount);
  assert.ok(peak.members.some((member) => Object.values(member.noteByStep).includes('C3')));
});

test('keeps tonal bass cadence aligned to the global Foundation phase', () => {
  const shifted = deriveTonalBass('peak', 1);
  const activeSteps = shifted.members.flatMap((member) => member.steps).sort((a, b) => a - b);
  assert.deepEqual(activeSteps.slice(0, 3), [1, 2, 3]);
});

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

test('preserves authored offbeats when subdivision scheduling is requested', () => {
  const result = deriveRhythmicFormationMotifs({
    sourceLaneIds: ['secondary_loop_lane'],
    laneStepsById: {
      secondary_loop_lane: [true, false, false, true, false, false, true, false],
    },
    motifLength: 4,
    memberCount: 2,
    startBeat: 0,
    subdivisionsPerBeat: 2,
    preserveSubdivisions: true,
  });
  assert.equal(result.derivationMode, 'player_rhythm_subdivision_preserved');
  assert.equal(result.motifLength, 8);
  assert.equal(result.subdivisionsPerBeat, 2);
  assert.equal(result.sourceHitCount, 3);
  assert.deepEqual(result.memberSteps, [[0, 6], [3]]);
});

test('keeps preserved subdivisions aligned to the source global phase', () => {
  const result = deriveRhythmicFormationMotifs({
    sourceLaneIds: ['foundation_lane'],
    laneStepsById: {
      foundation_lane: [true, false, false, true, false, false, true, false],
    },
    motifLength: 4,
    memberCount: 1,
    startBeat: 1,
    subdivisionsPerBeat: 2,
    preserveSubdivisions: true,
  });
  assert.deepEqual(result.memberSteps, [[1, 4, 6]]);
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

test('projects melody subdivisions without inventing additional notes', () => {
  assert.deepEqual(
    projectMelodySubdivisionsToBeats(['C4', '', '', 'D#4', 'F4', 'G4'], 2),
    ['C4', 'D#4', 'F4'],
  );
});

test('derives a phased pentatonic response with per-step member notes', () => {
  const result = deriveMelodicFormationMotifs({
    sourceLaneId: 'primary_loop_lane',
    sourceNoteSteps: ['C4', '', '', '', 'F4', '', '', ''],
    pitchPalette: ['G4', 'F4', 'D#4', 'C4'],
    pitchOffset: 1,
    responseDelayBeats: 1,
    motifLength: 8,
    memberCount: 2,
    startBeat: 1,
  });
  assert.equal(result.derived, true);
  assert.equal(result.sourceHitCount, 2);
  assert.equal(result.motifHitCount, 4);
  assert.deepEqual(result.members, [
    { steps: [0, 4], noteByStep: { 0: 'C4', 4: 'C4' } },
    { steps: [2, 6], noteByStep: { 2: 'D#4', 6: 'D#4' } },
  ]);
});

test('moves low-register responses toward the palette centre and can thin source events', () => {
  const result = deriveMelodicFormationMotifs({
    sourceNoteSteps: ['D#3', '', 'C3', '', 'F3', '', 'C3', ''],
    pitchPalette: ['G3', 'F3', 'D#3', 'C3'],
    pitchOffset: null,
    sourceEventStride: 2,
    motifLength: 8,
    memberCount: 2,
    startBeat: 0,
  });
  assert.equal(result.pitchOffset, -1);
  assert.equal(result.sourceHitCount, 4);
  assert.equal(result.motifHitCount, 4);
  assert.deepEqual(result.members, [
    { steps: [1, 5], noteByStep: { 1: 'F3', 5: 'F3' } },
    { steps: [3, 7], noteByStep: { 3: 'G3', 7: 'G3' } },
  ]);
});
