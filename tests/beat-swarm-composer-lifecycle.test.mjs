import test from 'node:test';
import assert from 'node:assert/strict';

import { maintainComposerEnemyGroupsLifecycle } from '../src/beat-swarm/beat-swarm-composer-lifecycle.js';

test('uses the supplied body plan when creating a missing basic lane carrier', () => {
  const groups = [];
  let bodyPlanCalls = 0;

  maintainComposerEnemyGroupsLifecycle({
    enabled: true,
    composerEnemyGroups: groups,
    pacingCaps: { desiredGroups: 1 },
    composer: { sectionId: 'test' },
    requiredBasicLaneCarriers: [{
      laneId: 'foundation_lane',
      profileSourceType: 'bass_foundation',
    }],
    pickTemplate: () => ({ id: 'foundation-test' }),
    createComposerEnemyGroupProfile: () => ({}),
    createGroupFromMotif: () => ({ id: 1, size: 4, performers: 4 }),
    getBasicLaneCarrierBodyPlan: ({ laneId }) => {
      bodyPlanCalls += 1;
      assert.equal(laneId, 'foundation_lane');
      return { scale: 'large', memberCount: 1 };
    },
    spawnComposerGroupOffscreenMembers: (_group, count) => count,
  });

  assert.equal(bodyPlanCalls, 1);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].basicLargeLaneCarrier, true);
  assert.equal(groups[0].basicLaneCarrierHandoff, true);
  assert.equal(groups[0].size, 1);
});

test('does not register a composer group when threat admission rejects every member', () => {
  const groups = [];
  const composerRuntime = {};

  maintainComposerEnemyGroupsLifecycle({
    enabled: true,
    composerEnemyGroups: groups,
    composerRuntime,
    currentBarIndex: 12,
    pacingCaps: { desiredGroups: 1 },
    composer: { sectionId: 'test' },
    requiredBasicLaneCarriers: [{
      laneId: 'foundation_lane',
      profileSourceType: 'bass_foundation',
    }],
    pickTemplate: () => ({ id: 'blocked-test' }),
    createComposerEnemyGroupProfile: () => ({}),
    createGroupFromMotif: () => ({ id: 2, size: 3, performers: 3, musicLaneId: 'foundation_lane' }),
    getBasicLaneCarrierBodyPlan: () => ({ scale: 'small', memberCount: 3 }),
    spawnComposerGroupOffscreenMembers: () => 0,
  });

  assert.equal(groups.length, 0);
  assert.equal(composerRuntime.__bsThreatAdmissionRetryBar, 13);
});

test('registers the admitted composer group size rather than the requested size', () => {
  const groups = [];

  maintainComposerEnemyGroupsLifecycle({
    enabled: true,
    composerEnemyGroups: groups,
    currentBarIndex: 12,
    pacingCaps: { desiredGroups: 1 },
    composer: { sectionId: 'test' },
    requiredBasicLaneCarriers: [{
      laneId: 'foundation_lane',
      profileSourceType: 'bass_foundation',
    }],
    pickTemplate: () => ({ id: 'partial-test' }),
    createComposerEnemyGroupProfile: () => ({}),
    createGroupFromMotif: () => ({ id: 3, size: 4, performers: 4, musicLaneId: 'foundation_lane' }),
    getBasicLaneCarrierBodyPlan: () => ({ scale: 'small', memberCount: 4 }),
    spawnComposerGroupOffscreenMembers: () => 2,
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].size, 2);
  assert.equal(groups[0].performers, 2);
});

test('does not create a group for an onboarding lane that is still locked', () => {
  const groups = [];
  let spawnedMembers = 0;

  maintainComposerEnemyGroupsLifecycle({
    enabled: true,
    composerEnemyGroups: groups,
    pacingCaps: { desiredGroups: 1 },
    composer: { sectionId: 'test' },
    requiredBasicLaneCarriers: [{
      laneId: 'secondary_loop_lane',
      profileSourceType: 'secondary_bridge_backbeat',
    }],
    pickTemplate: () => ({ id: 'secondary-test' }),
    createComposerEnemyGroupProfile: () => ({}),
    createGroupFromMotif: () => ({
      id: 1,
      size: 3,
      performers: 3,
      musicLaneId: 'secondary_loop_lane',
    }),
    isMusicLaneAvailableForEnemy: (laneId) => laneId === 'foundation_lane',
    spawnComposerGroupOffscreenMembers: () => { spawnedMembers += 1; },
  });

  assert.equal(groups.length, 0);
  assert.equal(spawnedMembers, 0);
});
