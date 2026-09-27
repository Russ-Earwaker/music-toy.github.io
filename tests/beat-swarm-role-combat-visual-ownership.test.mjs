import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mode = readFileSync(new URL('../src/beat-swarm/beat-swarm-mode.js', import.meta.url), 'utf8');
const pickupsCombat = readFileSync(new URL('../src/beat-swarm/beat-swarm-pickups-combat.js', import.meta.url), 'utf8');
const eventExecution = readFileSync(new URL('../src/beat-swarm/beat-swarm-event-execution.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const perfLab = readFileSync(new URL('../src/perf/perf-lab.js', import.meta.url), 'utf8');

test('performed composer abilities suppress combat body treatment but retain ability dispatch', () => {
  const composerAbility = mode.match(/function triggerSingleComposerGroupEnemyAbility[\s\S]*?\n}\n\nfunction triggerComposerGroupEnemyAbility/)?.[0] || '';
  assert.match(composerAbility, /triggerEnemyCombatFiredVisual\(enemy, 'projectile', \{ roleStyledMusicalTrigger: true \}\)/);
  assert.match(composerAbility, /triggerBasicEnemyWindPushAt\(origin, enemy, beatIndex, \{ roleStyledMusicalTrigger: true \}\)/);
  assert.match(composerAbility, /nextCombatActivationRoleStyledMusical = true/);
  assert.match(composerAbility, /const performerScreen = performerVisibility\?\.screen \|\| null;/);
  assert.match(composerAbility, /performerScreenX: Number\.isFinite\(Number\(performerScreen\?\.x\)\)/);
  const firedVisual = mode.match(/function triggerEnemyCombatFiredVisual[\s\S]*?\n}\nfunction playEnemyCombatAttackAudio/)?.[0] || '';
  assert.match(firedVisual, /if \(!roleStyledMusicalTrigger\) enemyEl\.classList\.add/);
  assert.match(firedVisual, /combatBodyTreatmentSuppressed: roleStyledMusicalTrigger/);
});

test('wind push uses one solid pressure wave and emits creation/display diagnostics', () => {
  const windCss = css.match(/\.beat-swarm-fx-wind-push\s*\{[\s\S]*?@keyframes beat-swarm-wind-push-fill-fade[\s\S]*?\n}/)?.[0] || '';
  assert.match(windCss, /border:\s*2px solid/);
  assert.doesNotMatch(windCss, /dotted|dashed|\.beat-swarm-fx-wind-push::after/);
  assert.match(mode, /enemy_wind_push_visual_status/);
  assert.match(perfLab, /'enemy_wind_push_visual_status'/);
  assert.match(mode, /visualElementCreated/);
  assert.match(mode, /effectRegistered/);
  assert.match(mode, /performerVisibleAtDispatch/);
  assert.match(mode, /playerAffected/);
  assert.match(mode, /const visibleEligible = eligible\.filter\(isBeatSwarmEnemyVisible\)/);
  assert.match(mode, /const selectionPool = visibleEligible\.length \? visibleEligible : eligible/);
  assert.match(perfLab, /'enemy_wind_push_triggered'/);
  assert.match(perfLab, /maxLines:\s*15000/);
  assert.match(pickupsCombat, /phase:\s*'completed'/);
  assert.match(pickupsCombat, /removalReason:\s*'shared_effect_cap'/);
  assert.match(pickupsCombat, /waveIntersectsViewport/);
});

test('musical role darkening follows the exact ability performer', () => {
  assert.match(mode, /options\?\.onPerformer\?\.\(enemy\)/);
  assert.match(eventExecution, /onPerformer\(performer\)[\s\S]*?notifyEnemyMusicalTrigger\?\.\(performer/);
  assert.match(eventExecution, /descriptorPerformerNotified = true/);
  assert.match(eventExecution, /primaryPerformerNotified = true/);
});

test('music-missile motif playback gives a visible lane carrier trigger feedback without dispatching an ability', () => {
  const motifPlayback = mode.match(/playMotifNote\(event = \{\}\) \{[\s\S]*?\n  \},\n  createMusicExplosion/)?.[0] || '';
  assert.match(motifPlayback, /notifyEnemyMusicalTrigger\(null/);
  assert.match(motifPlayback, /music_missile_motif_loop/);
  assert.match(motifPlayback, /onRepresentative\(representative\)/);
  assert.doesNotMatch(motifPlayback, /triggerComposerGroupEnemyAbility|triggerSingleComposerGroupEnemyAbility/);
});
