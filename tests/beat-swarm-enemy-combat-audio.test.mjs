import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modeSource = readFileSync(new URL('../src/beat-swarm/beat-swarm-mode.js', import.meta.url), 'utf8');
const attackAudioBody = modeSource.match(
  /function playEnemyCombatAttackAudio\([\s\S]*?\n}\nfunction updateEnemyCombatRuntime/
)?.[0] || '';

test('enemy combat attack audio does not directly trigger its lane instrument', () => {
  assert.ok(attackAudioBody);
  assert.equal(attackAudioBody.includes('triggerBeatSwarmInstrument'), false);
  assert.equal(attackAudioBody.includes("playSwarmSoundEventScheduled('projectile'"), false);
  assert.equal(modeSource.includes("eventType: 'enemy_combat_ability_note'"), false);
});

test('enemy combat attack keeps its visual and separate functional SFX paths', () => {
  assert.match(attackAudioBody, /triggerEnemyCombatFiredVisual\(enemy, visualKind\)/);
  assert.match(modeSource, /enemyLaserRuntime\.spawn\(/);
  assert.match(modeSource, /triggerLowThreatBurstAt\(/);
  assert.match(modeSource, /playSwarmSoundEventImmediate\('projectile', Number\(charge\?\.soundVolume\)/);
});
