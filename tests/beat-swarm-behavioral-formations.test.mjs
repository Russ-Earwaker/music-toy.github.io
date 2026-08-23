import test from 'node:test';
import assert from 'node:assert/strict';

import {
  areBeatSwarmGroupBehaviorsCompatible,
  resolveBeatSwarmPhraseBehaviorAssignments,
} from '../src/beat-swarm/beat-swarm-behavioral-formations.js';

test('treats matching movement families as compatible and conflicting families as incompatible', () => {
  assert.equal(areBeatSwarmGroupBehaviorsCompatible('winding_chain', 'winding_chain'), true);
  assert.equal(areBeatSwarmGroupBehaviorsCompatible('none', 'paired_dance'), true);
  assert.equal(areBeatSwarmGroupBehaviorsCompatible('paired_dance', 'advancing_line'), false);
  assert.equal(areBeatSwarmGroupBehaviorsCompatible('winding_chain', 'advancing_line'), false);
});

test('holds director movement assignments for an entire four-bar phrase', () => {
  const first = resolveBeatSwarmPhraseBehaviorAssignments({
    barIndex: 4,
    phraseBars: 4,
    assignmentsByRole: {
      counter_rhythm: { groupBehaviorId: 'winding_chain' },
    },
  });
  const held = resolveBeatSwarmPhraseBehaviorAssignments({
    barIndex: 7,
    phraseBars: 4,
    previous: first,
    assignmentsByRole: {
      counter_rhythm: { groupBehaviorId: 'advancing_line' },
    },
  });

  assert.equal(held, first);
  assert.equal(held.assignmentsByRole.counter_rhythm.groupBehaviorId, 'winding_chain');
  assert.equal(held.phraseStartBar, 4);
  assert.equal(held.phraseEndBar, 7);
});

test('holds assignments during the zero-indexed opening phrase', () => {
  const first = resolveBeatSwarmPhraseBehaviorAssignments({
    barIndex: 0,
    assignmentsByRole: {
      counter_rhythm: { groupBehaviorId: 'winding_chain' },
    },
  });
  const held = resolveBeatSwarmPhraseBehaviorAssignments({
    barIndex: 3,
    previous: first,
    assignmentsByRole: {
      counter_rhythm: { groupBehaviorId: 'advancing_line' },
    },
  });

  assert.equal(held, first);
  assert.equal(held.phraseIndex, 0);
});

test('accepts a new movement assignment at the next phrase boundary', () => {
  const first = resolveBeatSwarmPhraseBehaviorAssignments({
    barIndex: 4,
    assignmentsByRole: {
      counter_rhythm: { groupBehaviorId: 'winding_chain' },
    },
  });
  const next = resolveBeatSwarmPhraseBehaviorAssignments({
    barIndex: 8,
    previous: first,
    assignmentsByRole: {
      counter_rhythm: { groupBehaviorId: 'advancing_line' },
    },
  });

  assert.notEqual(next, first);
  assert.equal(next.assignmentsByRole.counter_rhythm.groupBehaviorId, 'advancing_line');
  assert.equal(next.phraseIndex, 2);
});

test('suppresses incompatible simultaneous group movement without changing single behavior', () => {
  const runtime = resolveBeatSwarmPhraseBehaviorAssignments({
    barIndex: 12,
    assignmentsByRole: {
      counter_rhythm: {
        singleBehaviorId: 'zig_zag_on_beat',
        groupBehaviorId: 'winding_chain',
        groupBehaviorWindow: 'persistent',
      },
      lead_phrase: {
        singleBehaviorId: 'move_stop_on_beat',
        groupBehaviorId: 'advancing_line',
        groupBehaviorWindow: 'section_peak_only',
      },
    },
  });

  assert.equal(runtime.assignmentsByRole.counter_rhythm.groupBehaviorId, 'winding_chain');
  assert.equal(runtime.assignmentsByRole.lead_phrase.groupBehaviorId, 'none');
  assert.equal(runtime.assignmentsByRole.lead_phrase.singleBehaviorId, 'move_stop_on_beat');
  assert.equal(runtime.suppressedByRole.lead_phrase, 'advancing_line');
});
