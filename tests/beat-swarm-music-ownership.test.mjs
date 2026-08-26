import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BEAT_SWARM_FOUNDATION_INSTRUMENT_ID,
  BEAT_SWARM_FOUNDATION_NOTE,
  BEAT_SWARM_MUSIC_MUTATION,
  BEAT_SWARM_MUSIC_OWNERSHIP,
  getBeatSwarmFormationArrangementContract,
  getBeatSwarmPlayerMusicContract,
  getBeatSwarmWeaponEventOwnershipPayload,
  isBeatSwarmWeaponTransformationAllowed,
} from '../src/beat-swarm/beat-swarm-music-ownership.js';
import { triggerWeaponStageRuntime } from '../src/beat-swarm/beat-swarm-weapon-chain-core.js';

test('weapon riff is immutable gameplay feedback', () => {
  const contract = getBeatSwarmPlayerMusicContract('weaponRiff');
  assert.equal(contract.ownership, BEAT_SWARM_MUSIC_OWNERSHIP.GAMEPLAY_FEEDBACK);
  assert.equal(contract.mutationPolicy, BEAT_SWARM_MUSIC_MUTATION.IMMUTABLE);
  assert.equal(contract.preserveTiming, true);
  assert.equal(contract.preservePitch, true);
  assert.equal(contract.preserveInstrument, true);
  assert.equal(contract.preserveDamageSlots, true);
  assert.deepEqual(getBeatSwarmWeaponEventOwnershipPayload(), {
    musicOwnership: 'gameplay_feedback',
    musicSemanticRole: 'weapon_pulse',
    musicMutationPolicy: 'immutable',
    musicIdentityId: 'weaponRiff',
  });
});

test('weapon permits supporting relationships but rejects mutation', () => {
  assert.equal(isBeatSwarmWeaponTransformationAllowed('reinforce'), true);
  assert.equal(isBeatSwarmWeaponTransformationAllowed('harmonize_around'), true);
  assert.equal(isBeatSwarmWeaponTransformationAllowed('echo'), true);
  assert.equal(isBeatSwarmWeaponTransformationAllowed('fill_gaps'), true);
  assert.equal(isBeatSwarmWeaponTransformationAllowed('transpose'), false);
  assert.equal(isBeatSwarmWeaponTransformationAllowed('embellish'), false);
  assert.equal(isBeatSwarmWeaponTransformationAllowed('thin'), false);
});

test('weapon stage emits immutable ownership metadata from the firing scope', () => {
  let scheduled = null;
  let projectileSpawned = false;
  triggerWeaponStageRuntime({
    stage: { archetype: 'projectile', variant: 'standard' },
    originWorld: { x: 10, y: 20 },
    beatIndex: 4,
    remainingStages: [],
    context: {
      weaponSlotIndex: 0,
      stageIndex: 0,
      directSound: true,
      immediateSound: true,
      forcedNoteName: 'G4',
    },
    state: {},
    constants: {},
    helpers: {
      sanitizeWeaponStages: () => [],
      normalizeSwarmNoteName: (note) => note,
      getGameplayWeaponSoundVolume: () => 1,
      getPlayerWeaponSoundEventKeyForStage: () => 'projectile',
      playSwarmSoundEventScheduled: (...args) => { scheduled = args; },
      getShipFacingDirWorld: () => ({ x: 1, y: 0 }),
      spawnProjectileFromDirection: () => { projectileSpawned = true; },
      normalizeDir: (x, y) => ({ x, y }),
      logWeaponTuneFireDebug: () => {},
    },
  });
  assert.equal(projectileSpawned, true);
  assert.ok(scheduled);
  assert.equal(scheduled[4].musicOwnership, 'gameplay_feedback');
  assert.equal(scheduled[4].musicMutationPolicy, 'immutable');
  assert.equal(scheduled[4].musicIdentityId, 'weaponRiff');
});

test('compatibility bassDrive id represents player-owned foundation percussion', () => {
  const byTheme = getBeatSwarmPlayerMusicContract('bassDrive');
  const byLane = getBeatSwarmPlayerMusicContract('foundation_lane');
  assert.equal(byTheme, byLane);
  assert.equal(byTheme.ownership, BEAT_SWARM_MUSIC_OWNERSHIP.PLAYER_CORE);
  assert.equal(byTheme.semanticRole, 'foundation_percussion');
  assert.equal(byTheme.defaultInstrumentId, BEAT_SWARM_FOUNDATION_INSTRUMENT_ID);
  assert.equal(byTheme.defaultInstrumentId, 'DRUM KICK');
  assert.equal(byTheme.defaultNote, BEAT_SWARM_FOUNDATION_NOTE);
});

test('formation contracts are temporary arrangements with composition sources', () => {
  const rhythm = getBeatSwarmFormationArrangementContract('laser_hihat');
  const lead = getBeatSwarmFormationArrangementContract('laser_lead');
  assert.equal(rhythm.ownership, BEAT_SWARM_MUSIC_OWNERSHIP.TEMPORARY_ARRANGEMENT);
  assert.equal(rhythm.arrangementRole, 'rhythmic_reinforcement');
  assert.ok(rhythm.derivedFromLaneIds.includes('secondary_loop_lane'));
  assert.equal(lead.arrangementRole, 'countermelody');
  assert.deepEqual(lead.derivedFromLaneIds, ['primary_loop_lane']);
});
