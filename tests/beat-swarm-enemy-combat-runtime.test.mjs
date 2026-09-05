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

test('fires subdivision motifs on authored offbeats without changing beat motifs', () => {
  const enemy = {
    wx: 10,
    wy: 20,
    lifecycleState: 'active',
    soundNote: 'C4',
    combatGroupMotifLength: 8,
    combatGroupMotifStartBeat: 0,
    combatGroupMotifStartStep: 0,
    combatGroupMotifSubdivisionsPerBeat: 2,
    combatGroupMotifSteps: [1, 4],
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
  const firedSteps = [];
  for (let stepIndex = 0; stepIndex < 6; stepIndex += 1) {
    runtime.update({
      beatIndex: Math.floor(stepIndex / 2),
      stepIndex,
      enemies: [enemy],
      target: { x: 100, y: 20 },
      spawnProjectile: () => firedSteps.push(stepIndex),
    });
  }
  assert.deepEqual(firedSteps, [1, 4]);
});

test('does not repeat legacy beat motifs on the second subdivision', () => {
  const enemy = {
    wx: 10,
    wy: 20,
    lifecycleState: 'active',
    soundNote: 'C4',
    combatGroupMotifLength: 4,
    combatGroupMotifStartBeat: 0,
    combatGroupMotifSteps: [0],
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
  let attackCount = 0;
  runtime.update({ beatIndex: 0, stepIndex: 0, enemies: [enemy], target: { x: 100, y: 20 }, spawnProjectile: () => { attackCount += 1; } });
  runtime.update({ beatIndex: 0, stepIndex: 1, enemies: [enemy], target: { x: 100, y: 20 }, spawnProjectile: () => { attackCount += 1; } });
  assert.equal(attackCount, 1);
});

test('does not fall back to default attacks while a group motif is explicitly muted', () => {
  const enemy = {
    wx: 10,
    wy: 20,
    lifecycleState: 'active',
    combatGroupMotifMuted: true,
    combatGroupMotifSteps: [],
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
  let attackCount = 0;
  for (let beatIndex = 0; beatIndex < 20; beatIndex += 1) {
    runtime.update({
      beatIndex,
      enemies: [enemy],
      target: { x: 100, y: 20 },
      spawnProjectile: () => { attackCount += 1; },
    });
  }
  assert.equal(attackCount, 0);
});

test('starts deferred hazard warnings early so activation lands on the authored offbeat', () => {
  const enemy = {
    wx: 10,
    wy: 20,
    lifecycleState: 'active',
    soundNote: 'C4',
    combatGroupMotifLength: 8,
    combatGroupMotifStartBeat: 2,
    combatGroupMotifStartStep: 4,
    combatGroupMotifSubdivisionsPerBeat: 2,
    combatGroupMotifSteps: [1, 5],
  };
  configureBeatSwarmEnemyCombatRuntime(enemy, {
    profileId: 'laser_spinner',
    patternId: 'arena_beam_group_pulse',
    movementBehaviorId: 'hold_position',
    anchorX: 10,
    anchorY: 20,
    startBeat: 2,
  });
  const runtime = createBeatSwarmEnemyCombatRuntime();
  const warnings = [];
  const attacks = [];
  for (let stepIndex = 3; stepIndex <= 9; stepIndex += 1) {
    runtime.update({
      beatIndex: Math.floor(stepIndex / 2),
      stepIndex,
      enemies: [enemy],
      target: { x: 100, y: 20 },
      spawnHazard: (_enemy, _pattern, _beat, timing) => warnings.push(timing.stepIndex),
      onAttack: (attack) => attacks.push({
        stepIndex: attack.stepIndex,
        motifStep: attack.motifStep,
        warningMotifStep: attack.warningMotifStep,
      }),
    });
  }
  assert.deepEqual(warnings, [3, 7]);
  assert.deepEqual(attacks, [
    { stepIndex: 3, motifStep: 1, warningMotifStep: 7 },
    { stepIndex: 7, motifStep: 5, warningMotifStep: 3 },
  ]);
});

test('uses the resolved laser warning duration when scheduling an authored motif note', () => {
  const enemy = {
    wx: 10,
    wy: 20,
    lifecycleState: 'active',
    soundNote: 'C4',
    combatGroupMotifLength: 16,
    combatGroupMotifStartBeat: 0,
    combatGroupMotifSteps: [8],
  };
  configureBeatSwarmEnemyCombatRuntime(enemy, {
    profileId: 'laser_spinner',
    patternId: 'arena_beam_group_pulse',
    movementBehaviorId: 'hold_position',
    anchorX: 10,
    anchorY: 20,
    startBeat: 0,
  });
  const runtime = createBeatSwarmEnemyCombatRuntime();
  const warnings = [];
  for (let beatIndex = 0; beatIndex <= 8; beatIndex += 1) {
    runtime.update({
      beatIndex,
      enemies: [enemy],
      target: { x: 100, y: 20 },
      resolvePattern: (_enemy, pattern) => ({ ...pattern, phaseBeats: 2, warningBeats: 4 }),
      spawnHazard: (_enemy, pattern, warningBeat) => warnings.push({
        warningBeat,
        warningBeats: pattern.warningBeats,
      }),
    });
  }
  assert.deepEqual(warnings, [{ warningBeat: 4, warningBeats: 4 }]);
});
