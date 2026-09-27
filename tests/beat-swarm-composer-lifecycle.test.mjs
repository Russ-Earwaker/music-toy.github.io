import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getComposerLifecycleAvailableSpawnSlots,
  maintainComposerEnemyGroupsLifecycle,
} from '../src/beat-swarm/beat-swarm-composer-lifecycle.js';

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

test('reserves one temporary spawn slot for a missing playable core lane', () => {
  assert.equal(getComposerLifecycleAvailableSpawnSlots({
    maxLiveGroups: 3,
    liveGroupCount: 3,
    missingRequiredCarrierCount: 1,
  }), 1);
  assert.equal(getComposerLifecycleAvailableSpawnSlots({
    maxLiveGroups: 3,
    liveGroupCount: 3,
    missingRequiredCarrierCount: 0,
  }), 0);
});

test('retires a surplus group to admit a missing required Hero-lane carrier at the group cap', () => {
  const existingEnemy = { id: 90, hp: 10, musicState: 'active', retreating: false };
  const existingGroup = {
    id: 89,
    active: true,
    retiring: false,
    lifecycleState: 'active',
    musicState: 'active',
    role: 'support',
    musicRole: 'support',
    roleLifecycleStartedBar: 12,
    roleLifecycle: { role: 'support', minReadableBars: 4, maxRoleBars: 16 },
    musicLaneId: 'answer_lane',
    assignedMusicLaneId: 'answer_lane',
    sectionKey: 'test:0:default',
    sectionContinuityKey: 'test:0',
    memberIds: new Set([existingEnemy.id]),
    size: 1,
    performers: 1,
  };
  const groups = [existingGroup];
  const retired = [];
  const lifecyclePhases = [];

  maintainComposerEnemyGroupsLifecycle({
    enabled: true,
    composerEnemyGroups: groups,
    currentBarIndex: 12,
    sessionAgeBars: 12,
    pacingCaps: { desiredGroups: 1, maxComposerGroups: 1 },
    composer: { sectionId: 'test', cycle: 0 },
    requiredBasicLaneCarriers: [{
      laneId: 'secondary_loop_lane',
      profileSourceType: 'secondary_bridge_backbeat',
    }],
    getAliveIdsForGroup: (group) => new Set(group.memberIds),
    getAliveEnemiesByIds: (ids) => ids?.has?.(existingEnemy.id) ? [existingEnemy] : [],
    retireGroup: (group, reason) => {
      retired.push({ group, reason });
      group.retiring = true;
    },
    noteMusicSystemEvent: (type, payload) => {
      if (type === 'enemy_basic_lane_carrier_lifecycle') lifecyclePhases.push(payload.phase);
    },
    pickTemplate: () => ({ id: 'hero-replacement-test' }),
    createComposerEnemyGroupProfile: () => ({}),
    createGroupFromMotif: () => ({ id: 91, size: 1, performers: 1 }),
    getBasicLaneCarrierBodyPlan: () => ({ scale: 'large', memberCount: 1 }),
    isMusicLaneAvailableForEnemy: () => true,
    spawnComposerGroupOffscreenMembers: (_group, count) => count,
  });

  assert.equal(retired.length, 1);
  assert.equal(retired[0].group, existingGroup);
  assert.equal(retired[0].reason, 'required_basic_lane_reserve');
  assert.equal(groups.some((group) => group.musicLaneId === 'secondary_loop_lane' && group.retiring !== true), true);
  assert.deepEqual(lifecyclePhases.filter((phase) => [
    'replacement_retired',
    'replacement_request',
    'admission_attempted',
    'admitted_offscreen',
  ].includes(phase)), [
    'replacement_retired',
    'replacement_request',
    'admission_attempted',
    'admitted_offscreen',
  ]);
});

test('forces a required carrier onto its requested lane before availability validation', () => {
  const groups = [];
  const checkedLaneIds = [];

  maintainComposerEnemyGroupsLifecycle({
    enabled: true,
    composerEnemyGroups: groups,
    pacingCaps: { desiredGroups: 1 },
    composer: { sectionId: 'test' },
    requiredBasicLaneCarriers: [{
      laneId: 'primary_loop_lane',
      profileSourceType: 'lead_melody',
    }],
    pickTemplate: () => ({ id: 'generic-foundation-template' }),
    createComposerEnemyGroupProfile: () => ({}),
    createGroupFromMotif: () => ({
      id: 4,
      size: 1,
      performers: 1,
      musicLaneId: 'foundation_lane',
      musicProfileSourceType: 'foundation_rhythm',
    }),
    getBasicLaneCarrierBodyPlan: () => ({ scale: 'large', memberCount: 1 }),
    isMusicLaneAvailableForEnemy: (laneId) => {
      checkedLaneIds.push(laneId);
      return laneId === 'primary_loop_lane';
    },
    spawnComposerGroupOffscreenMembers: (_group, count) => count,
  });

  assert.deepEqual(checkedLaneIds, ['primary_loop_lane']);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].musicLaneId, 'primary_loop_lane');
  assert.equal(groups[0].assignedMusicLaneId, 'primary_loop_lane');
  assert.equal(groups[0].musicProfileSourceType, 'lead_melody');
});

test('released lane bodies do not block an active focused carrier replacement', () => {
  const releasedEnemy = {
    id: 11,
    hp: 10,
    musicState: 'released',
    retreating: false,
  };
  const secondaryGroup = {
    id: 5,
    active: true,
    retiring: false,
    lifecycleState: 'active',
    musicState: 'released',
    musicLaneId: 'secondary_loop_lane',
    memberIds: new Set([releasedEnemy.id]),
    size: 1,
    performers: 1,
  };
  const groups = [secondaryGroup];

  maintainComposerEnemyGroupsLifecycle({
    enabled: true,
    composerEnemyGroups: groups,
    currentBarIndex: 24,
    pacingCaps: { desiredGroups: 1, maxComposerGroups: 3 },
    composer: { sectionId: 'test' },
    requiredBasicLaneCarriers: [{
      laneId: 'secondary_loop_lane',
      profileSourceType: 'secondary_bridge_backbeat',
    }],
    getAliveEnemiesByIds: (ids) => ids?.has?.(releasedEnemy.id) ? [releasedEnemy] : [],
    pickTemplate: () => ({ id: 'replacement-test' }),
    createComposerEnemyGroupProfile: () => ({}),
    createGroupFromMotif: () => ({ id: 6, size: 2, performers: 2 }),
    getBasicLaneCarrierBodyPlan: () => ({ scale: 'small', memberCount: 2 }),
    isMusicLaneAvailableForEnemy: () => true,
    spawnComposerGroupOffscreenMembers: (_group, count) => count,
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 6);
  assert.equal(groups[0].musicLaneId, 'secondary_loop_lane');
  assert.equal(groups[0].musicState, 'active');
});

test('recovers two simultaneously missing required lanes in one lifecycle pass', () => {
  const groups = [];
  let nextId = 20;

  maintainComposerEnemyGroupsLifecycle({
    enabled: true,
    composerEnemyGroups: groups,
    currentBarIndex: 32,
    pacingCaps: { desiredGroups: 2, maxComposerGroups: 3 },
    composer: { sectionId: 'test' },
    requiredBasicLaneCarriers: [
      { laneId: 'secondary_loop_lane', profileSourceType: 'secondary_bridge_backbeat' },
      { laneId: 'primary_loop_lane', profileSourceType: 'lead_melody' },
    ],
    getAliveEnemiesByIds: () => [],
    pickTemplate: () => ({ id: 'required-recovery-test' }),
    createComposerEnemyGroupProfile: () => ({}),
    createGroupFromMotif: () => ({ id: nextId++, size: 1, performers: 1 }),
    getBasicLaneCarrierBodyPlan: () => ({ scale: 'large', memberCount: 1 }),
    isMusicLaneAvailableForEnemy: () => true,
    spawnComposerGroupOffscreenMembers: (_group, count) => count,
  });

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.musicLaneId), [
    'secondary_loop_lane',
    'primary_loop_lane',
  ]);
});

test('does not promote a lane-locked rhythm carrier into the lead lane', () => {
  const secondaryEnemy = {
    id: 31,
    hp: 10,
    musicState: 'active',
    retreating: false,
  };
  const secondaryGroup = {
    id: 30,
    active: true,
    retiring: false,
    lifecycleState: 'active',
    musicState: 'active',
    role: 'support',
    assignedMusicLaneId: 'secondary_loop_lane',
    musicLaneId: 'secondary_loop_lane',
    musicProfileSourceType: 'secondary_bridge_backbeat',
    sectionKey: 'test:0:default',
    sectionContinuityKey: 'test:0',
    memberIds: new Set([secondaryEnemy.id]),
    size: 1,
    performers: 1,
  };
  const groups = [secondaryGroup];

  maintainComposerEnemyGroupsLifecycle({
    enabled: true,
    composerEnemyGroups: groups,
    currentBarIndex: 20,
    sessionAgeBars: 20,
    pacingCaps: { desiredGroups: 2, maxComposerGroups: 3, responseMode: 'group' },
    composer: { sectionId: 'test', cycle: 0, intensity: 0.6 },
    musicModeRuntime: { activeMusicMode: 'full_texture' },
    directorLanePlan: { primary_loop: { active: true, gameplayFocused: true } },
    requiredBasicLaneCarriers: [
      { laneId: 'secondary_loop_lane', profileSourceType: 'secondary_bridge_backbeat' },
      { laneId: 'primary_loop_lane', profileSourceType: 'lead_melody' },
    ],
    getAliveEnemiesByIds: (ids) => ids?.has?.(secondaryEnemy.id) ? [secondaryEnemy] : [],
    pickTemplate: () => ({ id: 'lead-replacement-test' }),
    createComposerEnemyGroupProfile: () => ({}),
    createGroupFromMotif: () => ({ id: 32, size: 1, performers: 1 }),
    getBasicLaneCarrierBodyPlan: () => ({ scale: 'large', memberCount: 1 }),
    isMusicLaneAvailableForEnemy: () => true,
    spawnComposerGroupOffscreenMembers: (_group, count) => count,
  });

  const leadGroup = groups.find((group) => group.musicLaneId === 'primary_loop_lane');
  assert.equal(secondaryGroup.musicLaneId, 'secondary_loop_lane');
  assert.equal(secondaryGroup.assignedMusicLaneId, 'secondary_loop_lane');
  assert.equal(leadGroup?.musicLaneId, 'primary_loop_lane');
  assert.equal(leadGroup?.assignedMusicLaneId, 'primary_loop_lane');
});

test('does not release a currently required lane carrier for role refresh', () => {
  const enemies = [41, 42].map((id) => ({ id, hp: 10, musicState: 'active', retreating: false }));
  const groups = enemies.map((enemy, index) => ({
    id: 40 + index,
    active: true,
    retiring: false,
    lifecycleState: 'active',
    musicState: 'active',
    musicRole: 'counter_rhythm',
    roleLifecycleStartedBar: 0,
    roleLifecycle: { role: 'counter_rhythm', minReadableBars: 1, maxRoleBars: 4 },
    assignedMusicLaneId: 'secondary_loop_lane',
    musicLaneId: 'secondary_loop_lane',
    musicProfileSourceType: 'secondary_bridge_backbeat',
    sectionKey: 'test:0:default',
    sectionContinuityKey: 'test:0',
    memberIds: new Set([enemy.id]),
    size: 1,
    performers: 1,
  }));

  maintainComposerEnemyGroupsLifecycle({
    enabled: true,
    composerEnemyGroups: groups,
    currentBarIndex: 20,
    sessionAgeBars: 20,
    pacingCaps: { desiredGroups: 2, maxComposerGroups: 3, responseMode: 'group' },
    composer: { sectionId: 'test', cycle: 0, intensity: 0.6 },
    musicModeRuntime: { activeMusicMode: 'full_texture' },
    requiredBasicLaneCarriers: [{
      laneId: 'secondary_loop_lane',
      profileSourceType: 'secondary_bridge_backbeat',
    }],
    getAliveIdsForGroup: (group) => new Set(group.memberIds),
    getAliveEnemiesByIds: (ids) => enemies.filter((enemy) => ids?.has?.(enemy.id)),
    isMusicLaneAvailableForEnemy: () => true,
  });

  assert.deepEqual(groups.map((group) => group.musicState), ['active', 'active']);
  assert.deepEqual(enemies.map((enemy) => enemy.musicState), ['active', 'active']);
});
