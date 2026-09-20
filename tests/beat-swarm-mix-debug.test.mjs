import assert from 'node:assert/strict';
import test from 'node:test';

import { createBeatSwarmMusicMixDebugRecord } from '../src/beat-swarm/beat-swarm-mix-debug.js';

test('mix debug record retains gain stages and derives bar timing', () => {
  assert.deepEqual(createBeatSwarmMusicMixDebugRecord({
    beatsPerBar: 4,
    beatIndex: 9,
    stepIndex: 73,
    lane: 'PRIMARY_LOOP_LANE',
    source: 'performed_event',
    eventType: 'composer_group_note',
    instrument: 'RETRO SQUARE',
    notes: ['E4'],
    role: 'Support',
    authoredGain: 0.18,
    postHierarchyGain: 0.18,
    postHeroGain: 0.18,
    preRoleFinalGain: 0.62,
    roleMultiplier: 0.82,
    postRoleFinalGain: 0.5084,
    finalExecutionGain: 0.5084,
    prominence: 'quiet',
  }), {
    barIndex: 2,
    beatIndex: 9,
    beatInBar: 1,
    stepIndex: 73,
    lane: 'primary_loop_lane',
    source: 'performed_event',
    eventType: 'composer_group_note',
    instrument: 'RETRO SQUARE',
    notes: ['E4'],
    role: 'support',
    authoredGain: 0.18,
    postHierarchyGain: 0.18,
    postHeroGain: 0.18,
    preRoleFinalGain: 0.62,
    roleMultiplier: 0.82,
    postRoleFinalGain: 0.5084,
    finalExecutionGain: 0.5084,
    prominence: 'quiet',
  });
});

test('player weapon diagnostics stay explicitly independent', () => {
  const record = createBeatSwarmMusicMixDebugRecord({
    lane: 'player_weapon',
    source: 'player_weapon',
    eventType: 'player_weapon',
    role: 'independent',
    notes: 'C4',
    finalExecutionGain: 0.7,
  });
  assert.equal(record.lane, 'player_weapon');
  assert.equal(record.role, 'independent');
  assert.deepEqual(record.notes, ['C4']);
  assert.equal(record.finalExecutionGain, 0.7);
  assert.equal(record.preRoleFinalGain, null);
  assert.equal(record.roleMultiplier, null);
  assert.equal(record.postRoleFinalGain, null);
});
