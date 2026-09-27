import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateBeatSwarmHeroVisualBodyTargets,
  applyBeatSwarmLaneFocusToCarrierCounts,
  createBeatSwarmProductionHeroMixConfig,
  createBeatSwarmLaneFocusRuntime,
  evaluateBeatSwarmLaneFocusPresentation,
  getBeatSwarmHeroVisualPresentationTarget,
  resolveBeatSwarmLaneFocusBudget,
  resolveBeatSwarmProductionHeroLane,
} from '../src/beat-swarm/beat-swarm-lane-focus.js';

test('focus budget grows with intensity and difficulty', () => {
  assert.deepEqual(resolveBeatSwarmLaneFocusBudget('low', 0), {
    stage: 'low', difficulty: 0, primary: 1, supporting: 0,
  });
  assert.deepEqual(resolveBeatSwarmLaneFocusBudget('peak', 2), {
    stage: 'peak', difficulty: 2, primary: 2, supporting: 4,
  });
});

test('production Hero prefers a forced main lane and holds it for the phrase', () => {
  const first = resolveBeatSwarmProductionHeroLane({
    phraseIndex: 5,
    availableLaneIds: ['foundation_lane', 'primary_loop_lane'],
    forcedLaneIds: ['primary_loop_lane'],
    primaryLaneIds: ['foundation_lane'],
  });
  assert.equal(first.heroLaneId, 'primary_loop_lane');
  const held = resolveBeatSwarmProductionHeroLane({
    phraseIndex: 5,
    availableLaneIds: ['foundation_lane', 'primary_loop_lane', 'secondary_loop_lane'],
    forcedLaneIds: ['secondary_loop_lane'],
    primaryLaneIds: ['secondary_loop_lane'],
  }, first);
  assert.equal(held.heroLaneId, 'primary_loop_lane');
  const nextPhrase = resolveBeatSwarmProductionHeroLane({
    phraseIndex: 6,
    availableLaneIds: ['foundation_lane', 'secondary_loop_lane'],
    forcedLaneIds: ['secondary_loop_lane'],
    primaryLaneIds: ['foundation_lane'],
  }, held);
  assert.equal(nextPhrase.heroLaneId, 'secondary_loop_lane');
});

test('production Hero mix maps focused main lanes to support and unfocused lanes to background', () => {
  assert.deepEqual(createBeatSwarmProductionHeroMixConfig({
    heroLaneId: 'foundation_lane',
    focusedLaneIds: ['foundation_lane', 'secondary_loop_lane', 'sparkle_lane'],
  }), {
    heroLane: 'foundation_lane',
    roles: {
      foundation_lane: 'hero',
      primary_loop_lane: 'background',
      secondary_loop_lane: 'support',
    },
  });
});

test('peak carrier counts retain Hero density and cap other main lanes to one', () => {
  assert.deepEqual(applyBeatSwarmLaneFocusToCarrierCounts({
    foundation: 3,
    secondary_loop_rhythm: 2,
    primary_loop_lead: 3,
    ornament: 1,
  }, {
    stage: 'peak',
    heroLaneId: 'primary_loop_lane',
    focusedLaneIds: ['foundation_lane', 'secondary_loop_lane', 'primary_loop_lane', 'sparkle_lane'],
  }), {
    foundation: 1,
    secondary_loop_rhythm: 1,
    primary_loop_lead: 3,
    ornament: 1,
  });
});

test('Hero visual bodies take first claim without increasing the existing body pool', () => {
  const counts = { foundation: 1, secondary_loop_rhythm: 1, primary_loop_lead: 1 };
  const targets = allocateBeatSwarmHeroVisualBodyTargets(counts, {
    heroLaneId: 'primary_loop_lane',
    availableLaneIds: ['foundation_lane', 'secondary_loop_lane', 'primary_loop_lane'],
    focusedLaneIds: ['foundation_lane', 'secondary_loop_lane', 'primary_loop_lane'],
  }, { foundationBodies: 3 });
  assert.deepEqual(targets, {
    foundation_lane: 1,
    primary_loop_lane: 3,
    secondary_loop_lane: 1,
  });
  assert.ok(targets.primary_loop_lane > targets.foundation_lane);
  assert.ok(targets.primary_loop_lane > targets.secondary_loop_lane);
  assert.ok(Object.values(targets).reduce((sum, count) => sum + count, 0) <= 7);
});

test('Background lane can receive zero visual bodies', () => {
  const targets = allocateBeatSwarmHeroVisualBodyTargets({
    foundation: 1,
    primary_loop_lead: 1,
  }, {
    heroLaneId: 'foundation_lane',
    availableLaneIds: ['foundation_lane', 'secondary_loop_lane', 'primary_loop_lane'],
    focusedLaneIds: ['foundation_lane', 'primary_loop_lane'],
  }, { foundationBodies: 2 });
  assert.deepEqual(targets, {
    foundation_lane: 3,
    primary_loop_lane: 1,
    secondary_loop_lane: 0,
  });
});

test('Hero visual allocation is declarative and does not mutate carrier targets', () => {
  const counts = { foundation: 1, secondary_loop_rhythm: 1, primary_loop_lead: 0 };
  const before = { ...counts };
  allocateBeatSwarmHeroVisualBodyTargets(counts, {
    heroLaneId: 'secondary_loop_lane',
    availableLaneIds: ['foundation_lane', 'secondary_loop_lane'],
    focusedLaneIds: ['foundation_lane', 'secondary_loop_lane'],
  });
  assert.deepEqual(counts, before);
});

test('ornament structural budget is reallocated to Hero without increasing total bodies', () => {
  const targets = allocateBeatSwarmHeroVisualBodyTargets({
    foundation: 1,
    secondary_loop_rhythm: 1,
    primary_loop_lead: 0,
  }, {
    heroLaneId: 'secondary_loop_lane',
    availableLaneIds: ['foundation_lane', 'secondary_loop_lane'],
    focusedLaneIds: ['foundation_lane', 'secondary_loop_lane'],
  }, { foundationBodies: 2, extraBodyBudget: 2 });
  assert.deepEqual(targets, {
    foundation_lane: 1,
    primary_loop_lane: 0,
    secondary_loop_lane: 3,
  });
  assert.ok(targets.secondary_loop_lane >= Object.values(targets).reduce((sum, count) => sum + count, 0) / 2);
  assert.ok(Object.values(targets).reduce((sum, count) => sum + count, 0) <= 6);
});

test('visual presentation caps Hero, Support, and Background without inventing carriers', () => {
  assert.equal(getBeatSwarmHeroVisualPresentationTarget('hero', 5), 3);
  assert.equal(getBeatSwarmHeroVisualPresentationTarget('hero', 2), 2);
  assert.equal(getBeatSwarmHeroVisualPresentationTarget('support', 5), 1);
  assert.equal(getBeatSwarmHeroVisualPresentationTarget('background', 5), 0);
  assert.equal(getBeatSwarmHeroVisualPresentationTarget('hero', 0), 0);
});

test('presentation audit distinguishes visible, entering, and missing focus lanes', () => {
  const result = evaluateBeatSwarmLaneFocusPresentation({
    primaryLaneIds: ['primary_loop_lane', 'foundation_lane'],
    supportingLaneIds: ['secondary_loop_lane'],
  }, {
    primary_loop_lane: { visibleCount: 1, candidateCount: 2, selectedEnemyId: 8 },
    foundation_lane: { visibleCount: 0, candidateCount: 1, selectedEnemyId: 9, guidanceActive: true },
    secondary_loop_lane: { visibleCount: 0, candidateCount: 0 },
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.visibleLaneIds, ['primary_loop_lane']);
  assert.deepEqual(result.enteringLaneIds, ['foundation_lane']);
  assert.deepEqual(result.missingLaneIds, ['secondary_loop_lane']);
  assert.deepEqual(result.pendingPrimaryLaneIds, ['foundation_lane']);
  assert.deepEqual(result.missingPrimaryLaneIds, []);
});

test('focus rotates underexposed lanes at phrase boundaries', () => {
  const runtime = createBeatSwarmLaneFocusRuntime();
  const lanes = ['foundation_lane', 'secondary_loop_lane', 'primary_loop_lane'];
  const first = runtime.update({ barIndex: 0, intensityStage: 'low', availableLaneIds: lanes });
  const second = runtime.update({ barIndex: 4, intensityStage: 'low', availableLaneIds: lanes });
  assert.equal(first.primaryLaneIds.length, 1);
  assert.equal(second.primaryLaneIds.length, 1);
  assert.notEqual(first.primaryLaneIds[0], second.primaryLaneIds[0]);
});

test('focus hold length is configurable in phrases', () => {
  const runtime = createBeatSwarmLaneFocusRuntime({
    config: {
      phraseBars: 4,
      minimumPrimaryPhrases: 2,
      difficultySupportingLaneStep: 1,
      difficultyExtraPrimaryAt: 3,
      budgets: { low: { primary: 1, supporting: 0 } },
    },
  });
  const lanes = ['foundation_lane', 'secondary_loop_lane'];
  const first = runtime.update({ barIndex: 0, intensityStage: 'low', availableLaneIds: lanes });
  const held = runtime.update({ barIndex: 4, intensityStage: 'low', availableLaneIds: lanes });
  const rotated = runtime.update({ barIndex: 8, intensityStage: 'low', availableLaneIds: lanes });
  assert.deepEqual(held.primaryLaneIds, first.primaryLaneIds);
  assert.notDeepEqual(rotated.primaryLaneIds, first.primaryLaneIds);
});

test('newly authored lane immediately becomes primary focus', () => {
  const runtime = createBeatSwarmLaneFocusRuntime();
  const lanes = ['foundation_lane', 'secondary_loop_lane', 'primary_loop_lane'];
  runtime.update({ barIndex: 0, intensityStage: 'low', availableLaneIds: lanes });
  const protectedFocus = runtime.update({
    barIndex: 1,
    intensityStage: 'low',
    availableLaneIds: lanes,
    forcedLaneIds: ['primary_loop_lane'],
  });
  assert.deepEqual(protectedFocus.primaryLaneIds, ['primary_loop_lane']);
  assert.equal(protectedFocus.reason, 'player_authored_override');
});

test('held Hero remains first Primary when focus rebuilds inside its phrase', () => {
  const runtime = createBeatSwarmLaneFocusRuntime();
  const lanes = ['foundation_lane', 'secondary_loop_lane', 'primary_loop_lane', 'sparkle_lane'];
  const initial = runtime.update({
    barIndex: 80,
    intensityStage: 'build',
    availableLaneIds: lanes,
    forcedLaneIds: ['secondary_loop_lane'],
  });
  assert.equal(initial.heroLaneId, 'secondary_loop_lane');
  assert.equal(initial.primaryLaneIds[0], 'secondary_loop_lane');

  const rebuilt = runtime.update({
    barIndex: 82,
    intensityStage: 'build',
    availableLaneIds: lanes,
    forcedLaneIds: ['foundation_lane'],
  });
  assert.equal(rebuilt.heroPhraseIndex, initial.heroPhraseIndex);
  assert.equal(rebuilt.heroLaneId, 'secondary_loop_lane');
  assert.deepEqual(rebuilt.primaryLaneIds, ['secondary_loop_lane']);
  assert.equal(rebuilt.supportingLaneIds.length, 2);
  assert.equal(rebuilt.supportingLaneIds[0], 'foundation_lane');
});

test('Hero pin preserves peak Primary and Supporting budgets', () => {
  const runtime = createBeatSwarmLaneFocusRuntime();
  const lanes = ['foundation_lane', 'secondary_loop_lane', 'primary_loop_lane', 'sparkle_lane'];
  const initial = runtime.update({
    barIndex: 88,
    intensityStage: 'build',
    availableLaneIds: lanes,
    forcedLaneIds: ['foundation_lane'],
  });
  const peak = runtime.update({
    barIndex: 90,
    intensityStage: 'peak',
    availableLaneIds: lanes,
  });
  assert.equal(peak.heroLaneId, initial.heroLaneId);
  assert.equal(peak.primaryLaneIds[0], 'foundation_lane');
  assert.equal(peak.primaryLaneIds.length, 2);
  assert.equal(peak.supportingLaneIds.length, 2);
  assert.equal(new Set(peak.focusedLaneIds).size, 4);
});

test('carrier recruitment follows focus without mutating source counts', () => {
  const source = {
    foundation: 2,
    secondary_loop_rhythm: 3,
    primary_loop_lead: 2,
    ornament: 0,
  };
  const result = applyBeatSwarmLaneFocusToCarrierCounts(source, {
    focusedLaneIds: ['primary_loop_lane', 'sparkle_lane'],
  });
  assert.deepEqual(result, {
    foundation: 0,
    secondary_loop_rhythm: 0,
    primary_loop_lead: 2,
    ornament: 1,
  });
  assert.equal(source.foundation, 2);
});

test('an initialized empty focus recruits no musical lane carriers', () => {
  assert.deepEqual(applyBeatSwarmLaneFocusToCarrierCounts({
    foundation: 3,
    secondary_loop_rhythm: 2,
    primary_loop_lead: 2,
    ornament: 1,
  }, {
    focusedLaneIds: [],
  }), {
    foundation: 0,
    secondary_loop_rhythm: 0,
    primary_loop_lead: 0,
    ornament: 0,
  });
});
