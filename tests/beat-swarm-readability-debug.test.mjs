import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  applyBeatSwarmRoleTriggerClass,
  getBeatSwarmRoleVisualPresentation,
  isBeatSwarmEnemyRoleOverlayEnabled,
  isBeatSwarmLeadHarmonyDisabled,
  isBeatSwarmReadabilityBackgroundEnabled,
  selectBeatSwarmVisibleTriggerRepresentative,
  summarizeBeatSwarmHeroVisualMetrics,
} from '../src/beat-swarm/beat-swarm-readability-debug.js';

function createFakeClassElement() {
  const values = new Set();
  return {
    offsetWidth: 42,
    classList: {
      add: (...names) => names.forEach((name) => values.add(name)),
      remove: (...names) => names.forEach((name) => values.delete(name)),
      contains: (name) => values.has(name),
    },
  };
}

test('readability A/B switches default to normal playback', () => {
  assert.equal(isBeatSwarmLeadHarmonyDisabled({}), false);
  assert.equal(isBeatSwarmLeadHarmonyDisabled({ __beatSwarmDebug: {} }), false);
  assert.equal(isBeatSwarmReadabilityBackgroundEnabled({ __beatSwarmDebug: {} }), false);
  assert.equal(isBeatSwarmEnemyRoleOverlayEnabled({ __beatSwarmDebug: {} }), false);
});

test('visible trigger representative prefers owner then rotates within its group', () => {
  const owner = { id: 1, composerGroupId: 7 };
  const peerA = { id: 2, composerGroupId: 7 };
  const peerB = { id: 3, composerGroupId: 7 };
  const other = { id: 4, composerGroupId: 9 };
  assert.equal(selectBeatSwarmVisibleTriggerRepresentative(owner, [owner, peerA], 0).representative, owner);
  const first = selectBeatSwarmVisibleTriggerRepresentative(owner, [peerA, peerB, other], 0);
  const second = selectBeatSwarmVisibleTriggerRepresentative(owner, [peerA, peerB, other], first.nextCursor);
  assert.equal(first.representative, peerA);
  assert.equal(second.representative, peerB);
  assert.equal(first.groupScoped, true);
});

test('visual readability switches require explicit true values', () => {
  const fakeGlobal = { __beatSwarmDebug: { readabilityBackground: true, enemyRoleOverlay: true } };
  assert.equal(isBeatSwarmReadabilityBackgroundEnabled(fakeGlobal), true);
  assert.equal(isBeatSwarmEnemyRoleOverlayEnabled(fakeGlobal), true);
});

test('Hero visual metrics report role shares and visible trigger totals', () => {
  assert.deepEqual(summarizeBeatSwarmHeroVisualMetrics({
    visibleHeroBodyCount: 3,
    visibleSupportBodyCount: 1,
    visibleBackgroundBodyCount: 1,
    firstVisibleHeroDelayMs: 123.6,
    sampledPhraseDurationMs: 1000,
    visibleHeroAtLeastOneDurationMs: 750,
    visibleHeroAtLeastTwoDurationMs: 500,
    currentNoVisibleHeroDurationMs: 100,
    longestNoVisibleHeroDurationMs: 180,
    lastVisibleHeroTimeMs: 900,
    visibleTriggerEventsByRole: { hero: 5, support: 2, background: 1 },
    triggerEventsWithoutVisibleCarrier: 3,
    noCarrierExists: 1,
    carrierExistsButNotResolved: 2,
    heroMusicalTriggerCount: 8,
    heroTriggersAssignedToVisibleHeroCarrier: 5,
    triggerEventsBySource: { primary_lead_ball_direct: 4, composer_group_player_accent_rhythm_direct: 2 },
  }), {
    visibleHeroBodyCount: 3,
    visibleSupportBodyCount: 1,
    visibleBackgroundBodyCount: 1,
    totalVisibleMusicalBodies: 5,
    visibleHeroPercentage: 60,
    hasVisibleHeroBody: true,
    sampledPhraseDurationMs: 1000,
    visibleHeroAtLeastOnePercentage: 75,
    visibleHeroAtLeastTwoPercentage: 50,
    longestNoVisibleHeroDurationMs: 180,
    firstVisibleHeroDelayMs: 124,
    lastVisibleHeroTimeMs: 900,
    noVisibleHeroTailMs: 100,
    heroDisappearedEarly: false,
    heroTriggerEvents: 5,
    supportTriggerEvents: 2,
    backgroundTriggerEvents: 1,
    heroMusicalTriggerCount: 8,
    heroTriggersAssignedToVisibleHeroCarrier: 5,
    successfulHeroVisualTriggerPercentage: 62.5,
    visibleTriggerEventsByRole: { hero: 5, support: 2, background: 1 },
    triggerEventsWithoutVisibleCarrier: 3,
    noCarrierExists: 1,
    carrierExistsButNotResolved: 2,
    triggerEventsBySource: { primary_lead_ball_direct: 4, composer_group_player_accent_rhythm_direct: 2 },
  });
});

test('readability A/B switches require an explicit true value', () => {
  const fakeGlobal = {
    __beatSwarmDebug: {
      disableLeadHarmony: true,
    },
  };
  assert.equal(isBeatSwarmLeadHarmonyDisabled(fakeGlobal), true);
});

test('Hero visual metrics preserve never-visible first and last times as null', () => {
  const summary = summarizeBeatSwarmHeroVisualMetrics({
    sampledPhraseDurationMs: 6400,
    currentNoVisibleHeroDurationMs: 6400,
    firstVisibleHeroDelayMs: null,
    lastVisibleHeroTimeMs: null,
  });
  assert.equal(summary.firstVisibleHeroDelayMs, null);
  assert.equal(summary.lastVisibleHeroTimeMs, null);
  assert.equal(summary.noVisibleHeroTailMs, 6400);
  assert.equal(summary.heroDisappearedEarly, false);
});

test('role presentation preserves colour hierarchy and reserves black trigger body for Hero', () => {
  const hero = getBeatSwarmRoleVisualPresentation('hero');
  const support = getBeatSwarmRoleVisualPresentation('support');
  const background = getBeatSwarmRoleVisualPresentation('background');
  assert.equal(hero.triggerBody, 'black');
  assert.deepEqual([hero.idleBody, support.idleBody, background.idleBody], ['lane_color', 'lane_color', 'lane_color']);
  assert.notEqual(support.triggerBody, 'black');
  assert.notEqual(background.triggerBody, 'black');
  assert.ok(hero.outlineWidthPx > support.outlineWidthPx);
  assert.ok(hero.glowFarPx > support.glowFarPx);
  assert.ok(support.outlineWidthPx > background.outlineWidthPx);
  assert.ok(support.glowFarPx > background.glowFarPx);
  assert.deepEqual([hero.triggerScale, support.triggerScale, background.triggerScale], [1.22, 1.1, 1.05]);
  assert.deepEqual([hero.affectsBodyScale, support.affectsBodyScale, background.affectsBodyScale], [false, false, false]);
  const smallHeroPeakMarkerDiameter = (42 + (hero.markerInsetPx * 2)) * hero.triggerScale;
  const largeBackgroundPeakMarkerDiameter = (86 + (background.markerInsetPx * 2)) * background.triggerScale;
  assert.ok(largeBackgroundPeakMarkerDiameter > smallHeroPeakMarkerDiameter);
});

test('role trigger class is exclusive and clears after its configured duration', () => {
  for (const role of ['hero', 'support', 'background']) {
    const element = createFakeClassElement();
    const enemy = {};
    const scheduled = [];
    assert.equal(applyBeatSwarmRoleTriggerClass(element, enemy, role, (fn, ms) => scheduled.push({ fn, ms })), true);
    const presentation = getBeatSwarmRoleVisualPresentation(role);
    assert.equal(element.classList.contains(presentation.triggerClass), true);
    assert.equal(scheduled[0].ms, presentation.triggerDurationMs);
    scheduled[0].fn();
    assert.equal(element.classList.contains(presentation.triggerClass), false);
  }
});

test('Hero role selectors do not alter physical enemy dimensions or body transform', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.beat-swarm-enemy\s*\{[\s\S]*?width:\s*42px;[\s\S]*?height:\s*42px;/);
  assert.match(css, /\.beat-swarm-enemy\.is-composer-group\.is-basic-large-carrier\s*\{[\s\S]*?width:\s*86px;[\s\S]*?height:\s*86px;/);
  assert.doesNotMatch(
    css,
    /\.beat-swarm-enemy\.is-(?:hero|support|background)-musical-(?:enemy|trigger)\s*\{[^}]*(?:width|height|transform)\s*:/,
  );
});
