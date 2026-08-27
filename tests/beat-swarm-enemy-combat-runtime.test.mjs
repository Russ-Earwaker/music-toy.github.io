import assert from 'node:assert/strict';
import test from 'node:test';

import {
  configureBeatSwarmEnemyCombatRuntime,
  createBeatSwarmEnemyCombatRuntime,
} from '../src/beat-swarm/beat-swarm-enemy-combat-runtime.js';

test('applies a formation step note before projectile and audio activation', () => {
  const enemy = {
    wx: 10,
    wy: 20,
    lifecycleState: 'active',
    soundNote: 'C4',
    combatGroupMotifLength: 8,
    combatGroupMotifStartBeat: 0,
    combatGroupMotifSteps: [2],
    combatGroupMotifNoteByStep: { 2: 'F4' },
  };
  configureBeatSwarmEnemyCombatRuntime(enemy, {
    profileId: 'gunner',
    patternId: 'formation_straight',
    movementBehaviorId: 'hold_position',
    anchorX: 10,
    anchorY: 20,
    startBeat: 0,
  });
  const runtime = createBeatSwarmEnemyCombatRuntime();
  const projectileNotes = [];
  const audioNotes = [];
  runtime.update({
    beatIndex: 2,
    enemies: [enemy],
    target: { x: 100, y: 20 },
    spawnProjectile: (_enemy, projectile) => projectileNotes.push(projectile.noteName),
    playAttackSound: (activeEnemy) => audioNotes.push(activeEnemy.soundNote),
  });
  assert.deepEqual(projectileNotes, ['F4']);
  assert.deepEqual(audioNotes, ['F4']);
});
