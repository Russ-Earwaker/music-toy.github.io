import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyBeatSwarmHeroLaneMixGain,
  getBeatSwarmHeroLaneMixForLane,
  getBeatSwarmPeakRoleAllowedSteps,
  resolveBeatSwarmHeroLaneMix,
  resolveBeatSwarmHeroLaneMixConfig,
} from '../src/beat-swarm/beat-swarm-hero-lane-mix.js';

test('none preserves all lane gains exactly', () => {
  for (const laneId of ['foundation_lane', 'primary_loop_lane', 'secondary_loop_lane']) {
    assert.deepEqual(getBeatSwarmHeroLaneMixForLane(laneId, { heroLane: 'none' }), {
      applied: false,
      laneId,
      role: '',
      multiplier: 1,
    });
  }
});

test('debug config overrides production Hero including explicit none', () => {
  const production = { heroLane: 'foundation_lane' };
  assert.equal(resolveBeatSwarmHeroLaneMixConfig({ heroLane: 'primary_loop_lane' }, production).heroLane, 'primary_loop_lane');
  assert.equal(resolveBeatSwarmHeroLaneMixConfig({ heroLane: 'none' }, production).heroLane, 'none');
  assert.equal(resolveBeatSwarmHeroLaneMixConfig(null, production).heroLane, 'foundation_lane');
});

test('peak density is dense only for Hero and progressively thinner by role', () => {
  assert.deepEqual(getBeatSwarmPeakRoleAllowedSteps('lead', 'hero', 0), [0, 1, 2, 4, 6, 7]);
  assert.deepEqual(getBeatSwarmPeakRoleAllowedSteps('lead', 'support', 0), [0, 2, 4, 6]);
  assert.deepEqual(getBeatSwarmPeakRoleAllowedSteps('lead', 'background', 0), [0]);
  assert.deepEqual(getBeatSwarmPeakRoleAllowedSteps('secondary', 'hero', 0), [6]);
  assert.deepEqual(getBeatSwarmPeakRoleAllowedSteps('secondary', 'support', 0), [4]);
  assert.deepEqual(getBeatSwarmPeakRoleAllowedSteps('secondary', 'background', 0), [4]);
  assert.deepEqual(getBeatSwarmPeakRoleAllowedSteps('foundation', 'background', 0), [0]);
});

test('forced hero and configured support/background roles resolve their multipliers', () => {
  const config = {
    heroLane: 'primary_loop_lane',
    roles: {
      foundation_lane: 'background',
      secondary_loop_lane: 'support',
    },
  };
  assert.equal(getBeatSwarmHeroLaneMixForLane('primary_loop_lane', config).multiplier, 1);
  assert.equal(getBeatSwarmHeroLaneMixForLane('foundation_lane', config).multiplier, 0.65);
  assert.equal(getBeatSwarmHeroLaneMixForLane('secondary_loop_lane', config).multiplier, 0.82);
});

test('hero role cannot be displaced by a conflicting per-lane role', () => {
  const mix = resolveBeatSwarmHeroLaneMix({
    heroLane: 'foundation_lane',
    foundation_lane: 'background',
    primary_loop_lane: 'background',
  });
  assert.equal(mix.rolesByLane.foundation_lane, 'hero');
  assert.equal(mix.rolesByLane.primary_loop_lane, 'background');
  assert.equal(mix.rolesByLane.secondary_loop_lane, 'support');
});

test('lanes outside the prototype remain untouched', () => {
  const config = { heroLane: 'secondary_loop_lane' };
  for (const laneId of ['tonal_bass_lane', 'sparkle_lane', 'answer_lane', '']) {
    assert.equal(getBeatSwarmHeroLaneMixForLane(laneId, config).applied, false);
    assert.equal(getBeatSwarmHeroLaneMixForLane(laneId, config).multiplier, 1);
  }
});

test('invalid hero selection disables the overlay', () => {
  assert.equal(resolveBeatSwarmHeroLaneMix({ heroLane: 'sparkle_lane' }).enabled, false);
});

test('final gain policy preserves Hero and attenuates Support and Background', () => {
  const config = {
    heroLane: 'primary_loop_lane',
    roles: { foundation_lane: 'background' },
  };
  assert.equal(applyBeatSwarmHeroLaneMixGain(0.8, 'primary_loop_lane', config).gain, 0.8);
  assert.ok(Math.abs(applyBeatSwarmHeroLaneMixGain(0.8, 'foundation_lane', config).gain - 0.52) < 1e-9);
  assert.ok(Math.abs(applyBeatSwarmHeroLaneMixGain(0.8, 'secondary_loop_lane', config).gain - 0.656) < 1e-9);
  assert.equal(applyBeatSwarmHeroLaneMixGain(0.8, 'tonal_bass_lane', config).gain, 0.8);
  assert.equal(applyBeatSwarmHeroLaneMixGain(0.8, 'primary_loop_lane', { heroLane: 'none' }).gain, 0.8);
  assert.equal(applyBeatSwarmHeroLaneMixGain(1, 'primary_loop_lane', config).gain, 1);
  assert.equal(applyBeatSwarmHeroLaneMixGain(1, 'secondary_loop_lane', config).gain, 0.82);
  assert.equal(applyBeatSwarmHeroLaneMixGain(1, 'foundation_lane', config).gain, 0.65);
});
