import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BEAT_SWARM_LEVEL1_BASIC_ABILITY_PALETTE,
  BEAT_SWARM_LEVEL1_THREAT_PHASES,
  BEAT_SWARM_LEVEL1_THREAT_ROSTER,
  getBeatSwarmFeaturedThreatCount,
  getBeatSwarmLevel1ThreatAbilityPalette,
  getBeatSwarmLevel1ThreatFamilyCaps,
  resolveBeatSwarmCappedThreatAbility,
  resolveBeatSwarmLevel1BasicAbility,
  resolveBeatSwarmLevel1GroupMemberAbility,
  resolveBeatSwarmProductionThreatPhase,
  resolveBeatSwarmLevel1ThreatPhase,
} from '../src/beat-swarm/beat-swarm-enemy-ability-policy.js';

test('keeps the Level 1 basic ability palette intentionally narrow', () => {
  assert.deepEqual(BEAT_SWARM_LEVEL1_BASIC_ABILITY_PALETTE, [
    'projectile',
    'laser',
    'local_explosion',
    'wind_push',
  ]);
});

test('introduces one featured threat with forgiving group fillers', () => {
  assert.deepEqual(
    Array.from({ length: 4 }, (_, memberIndex) => resolveBeatSwarmLevel1GroupMemberAbility({
      laneId: 'primary_loop_lane',
      memberIndex,
      memberCount: 4,
      difficultyRamp: 0.2,
    })),
    ['laser', 'wind_push', 'local_explosion', 'wind_push'],
  );
  assert.deepEqual(
    Array.from({ length: 4 }, (_, memberIndex) => resolveBeatSwarmLevel1GroupMemberAbility({
      laneId: 'secondary_loop_lane',
      memberIndex,
      memberCount: 4,
      difficultyRamp: 0.2,
    })),
    ['local_explosion', 'wind_push', 'wind_push', 'wind_push'],
  );
});

test('ramps featured threat count later in a level and sooner in later levels', () => {
  assert.equal(getBeatSwarmFeaturedThreatCount({ memberCount: 4, difficultyRamp: 0.2 }), 1);
  assert.equal(getBeatSwarmFeaturedThreatCount({ memberCount: 4, difficultyRamp: 0.5 }), 2);
  assert.equal(getBeatSwarmFeaturedThreatCount({ memberCount: 4, difficultyRamp: 0.3, levelIndex: 1 }), 2);
  assert.equal(getBeatSwarmFeaturedThreatCount({ memberCount: 2, difficultyRamp: 1 }), 2);
});

test('advances the Level 1 threat lesson at deterministic beat boundaries', () => {
  assert.equal(resolveBeatSwarmLevel1ThreatPhase(0).phase.id, 'simple_prefill');
  assert.equal(resolveBeatSwarmLevel1ThreatPhase(15).phase.id, 'simple_prefill');
  assert.equal(resolveBeatSwarmLevel1ThreatPhase(16).phase.id, 'laser_teach');
  assert.equal(resolveBeatSwarmLevel1ThreatPhase(47).phase.id, 'laser_consolidate');
  assert.equal(resolveBeatSwarmLevel1ThreatPhase(48).phase.id, 'local_aoe_introduction');
  assert.equal(resolveBeatSwarmLevel1ThreatPhase(80).phase.id, 'combined_pressure');
  assert.equal(BEAT_SWARM_LEVEL1_THREAT_PHASES.at(-1).maxFeaturedThreats, 2);
  assert.deepEqual(BEAT_SWARM_LEVEL1_THREAT_PHASES.map((phase) => phase.targetBasicEnemies), [2, 3, 3, 4, 5, 6]);
  assert.deepEqual(BEAT_SWARM_LEVEL1_THREAT_ROSTER.map(({ abilityFamily, scale }) => `${scale}:${abilityFamily}`), [
    'small:wind_push',
    'small:wind_push',
    'small:laser',
    'small:local_explosion',
    'large:projectile',
    'small:laser',
  ]);
});

test('builds the learned ability palette without exposing future mechanics', () => {
  assert.deepEqual(getBeatSwarmLevel1ThreatAbilityPalette(0), ['wind_push']);
  assert.deepEqual(getBeatSwarmLevel1ThreatAbilityPalette(1), ['wind_push', 'laser']);
  assert.deepEqual(getBeatSwarmLevel1ThreatAbilityPalette(3), ['wind_push', 'laser', 'local_explosion']);
  assert.deepEqual(getBeatSwarmLevel1ThreatAbilityPalette(4), ['wind_push', 'laser', 'local_explosion', 'projectile']);
});

test('maps production structure and intensity onto the Level 1 lesson', () => {
  assert.equal(resolveBeatSwarmProductionThreatPhase({ activeLevelPhase: 'full_texture', introStage: 'soft_ramp' }).phaseIndex, 0);
  assert.equal(resolveBeatSwarmProductionThreatPhase({ activeLevelPhase: 'intro_teach' }).phaseIndex, 0);
  assert.equal(resolveBeatSwarmProductionThreatPhase({ activeLevelPhase: 'groove_establish' }).phaseIndex, 1);
  assert.equal(resolveBeatSwarmProductionThreatPhase({ activeLevelPhase: 'lead_merge', difficultyRamp: 0.12 }).phaseIndex, 2);
  assert.equal(resolveBeatSwarmProductionThreatPhase({ activeLevelPhase: 'lead_merge', difficultyRamp: 0.2 }).phaseIndex, 3);
  assert.equal(resolveBeatSwarmProductionThreatPhase({ activeLevelPhase: 'full_texture', intensityTier: 'medium' }).phaseIndex, 4);
  assert.equal(resolveBeatSwarmProductionThreatPhase({ activeLevelPhase: 'full_texture', intensityTier: 'high' }).phaseIndex, 5);
});

test('caps newly spawned featured mechanics across the visible field', () => {
  assert.deepEqual(getBeatSwarmLevel1ThreatFamilyCaps(4), {
    laser: 1,
    local_explosion: 1,
    projectile: 1,
  });
  assert.equal(resolveBeatSwarmCappedThreatAbility({
    phaseIndex: 1,
    abilityFamily: 'laser',
    abilityPalette: ['wind_push', 'laser'],
    currentCounts: { laser: 0 },
  }), 'laser');
  assert.equal(resolveBeatSwarmCappedThreatAbility({
    phaseIndex: 1,
    abilityFamily: 'laser',
    abilityPalette: ['wind_push', 'laser'],
    currentCounts: { laser: 1 },
  }), 'wind_push');
  assert.equal(getBeatSwarmLevel1ThreatFamilyCaps(5).laser, 2);
});

test('restricted learned palettes cannot leak future filler abilities', () => {
  assert.deepEqual(
    Array.from({ length: 4 }, (_, memberIndex) => resolveBeatSwarmLevel1GroupMemberAbility({
      laneId: 'primary_loop_lane',
      memberIndex,
      memberCount: 4,
      difficultyRamp: 0.2,
      featuredThreatLimit: 1,
      abilityPalette: ['wind_push', 'laser'],
    })),
    ['laser', 'wind_push', 'wind_push', 'wind_push'],
  );
});

test('maps core musical lanes to stable readable ability families', () => {
  assert.equal(resolveBeatSwarmLevel1BasicAbility({ laneId: 'foundation_lane' }), 'projectile');
  assert.equal(resolveBeatSwarmLevel1BasicAbility({ laneId: 'secondary_loop_lane' }), 'local_explosion');
  assert.equal(resolveBeatSwarmLevel1BasicAbility({ laneId: 'primary_loop_lane' }), 'laser');
});

test('keeps onboarding carriers on the least disruptive ability', () => {
  assert.equal(resolveBeatSwarmLevel1BasicAbility({
    laneId: 'primary_loop_lane',
    role: 'lead',
    isIntroCarrier: true,
  }), 'projectile');
});

test('respects explicit action semantics and a restricted level palette', () => {
  assert.equal(resolveBeatSwarmLevel1BasicAbility({ actionType: 'composer-group-explosion' }), 'local_explosion');
  assert.equal(resolveBeatSwarmLevel1BasicAbility({
    actionType: 'composer-group-laser',
    abilityPalette: ['projectile'],
  }), 'projectile');
});
