import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseComposerGroupEnemyForNote } from '../src/beat-swarm/beat-swarm-composer-events.js';

function createMembers(count = 3) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    formationMemberIndex: index,
  }));
}

test('basic small lane carriers rotate even when legacy phrase metadata says solo', () => {
  const group = {
    basicLaneCarrierHandoff: true,
    basicLargeLaneCarrier: false,
    callResponseLane: 'solo',
    noteToEnemyId: new Map([['C4', 1]]),
  };
  const aliveMembers = createMembers(3);
  const selected = Array.from({ length: 6 }, () => chooseComposerGroupEnemyForNote({
    group,
    aliveMembers,
    noteName: 'C4',
  })?.id);

  assert.deepEqual(selected, [1, 2, 3, 1, 2, 3]);
  assert.equal(group.noteToEnemyId.has('C4'), false);
});

test('true solo groups keep a note assigned to one body', () => {
  const group = {
    soloCarrierType: 'rhythm',
    noteToEnemyId: new Map(),
  };
  const aliveMembers = createMembers(3);
  const first = chooseComposerGroupEnemyForNote({ group, aliveMembers, noteName: 'C4' });
  const second = chooseComposerGroupEnemyForNote({ group, aliveMembers, noteName: 'C4' });

  assert.equal(first?.id, 1);
  assert.equal(second?.id, 1);
});
