import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BEAT_SWARM_ELITE_ENEMY_TYPES,
  applyBeatSwarmEnemyDescriptorVisualIdentity,
  assignBeatSwarmEnemyGameplayDescriptor,
  constrainBeatSwarmEnemyAbilityFamily,
  createBeatSwarmEnemyGameplayDescriptor,
  normalizeBeatSwarmEnemyAbilityPalette,
  isBeatSwarmEliteEnemyType,
  selectBeatSwarmLaneEventPerformers,
} from '../src/beat-swarm/beat-swarm-enemy-descriptor.js';

test('maps generic enemies to basic small round-robin lane performers', () => {
  const descriptor = createBeatSwarmEnemyGameplayDescriptor({
    enemyType: 'dumb',
    musicalRole: 'accent',
    musicLaneId: 'secondary_loop_lane',
  });

  assert.deepEqual(descriptor, {
    version: 1,
    enemyType: 'dumb',
    tier: 'basic',
    scale: 'small',
    musicalOwnership: 'core_lane',
    laneId: 'secondary_loop_lane',
    laneRole: 'accent',
    laneEventMode: 'round_robin',
    abilityFamily: 'projectile',
    abilitySilhouette: 'forward_cannon',
    movementFamily: 'drift',
    formationMembership: 'individual',
    visualComplexity: 'simple',
  });
});

test('constrains abilities to a level palette with a stable fallback', () => {
  assert.deepEqual(
    normalizeBeatSwarmEnemyAbilityPalette(['laser', 'laser', 'unknown', 'local explosion']),
    ['laser', 'local_explosion'],
  );
  assert.equal(constrainBeatSwarmEnemyAbilityFamily('local_explosion', ['projectile', 'laser']), 'projectile');
  assert.equal(constrainBeatSwarmEnemyAbilityFamily('laser', ['projectile', 'laser']), 'laser');

  const descriptor = createBeatSwarmEnemyGameplayDescriptor(
    { enemyType: 'dumb' },
    { abilityFamily: 'local_explosion', abilityPalette: ['projectile', 'laser'] },
  );
  assert.equal(descriptor.abilityFamily, 'projectile');
  assert.equal(descriptor.abilitySilhouette, 'forward_cannon');
});

test('maps basic large enemies to full-lane playback', () => {
  const descriptor = createBeatSwarmEnemyGameplayDescriptor(
    { enemyType: 'dumb', musicalRole: 'bass' },
    { scale: 'large' },
  );

  assert.equal(descriptor.tier, 'basic');
  assert.equal(descriptor.scale, 'large');
  assert.equal(descriptor.laneEventMode, 'full_lane');
  assert.equal(descriptor.musicalOwnership, 'core_lane');
});

test('maps composer members to basic lane groups', () => {
  const descriptor = createBeatSwarmEnemyGameplayDescriptor({
    enemyType: 'composer-group-member',
    composerGroupId: 17,
    musicalRole: 'lead',
  });

  assert.equal(descriptor.tier, 'basic');
  assert.equal(descriptor.scale, 'small');
  assert.equal(descriptor.formationMembership, 'lane_group');
  assert.equal(descriptor.laneEventMode, 'round_robin');
});

test('applies the same ability silhouette identity to ordinary basic enemies', () => {
  const classes = new Set(['beat-swarm-enemy']);
  const enemy = {
    enemyType: 'dumb',
    el: {
      classList: {
        add: (...values) => values.forEach((value) => classes.add(value)),
        remove: (...values) => values.forEach((value) => classes.delete(value)),
      },
      dataset: {},
    },
  };
  assignBeatSwarmEnemyGameplayDescriptor(enemy, { abilityFamily: 'laser' });
  applyBeatSwarmEnemyDescriptorVisualIdentity(enemy);

  assert.equal(classes.has('is-basic-ability-carrier'), true);
  assert.equal(classes.has('is-ability-laser'), true);
  assert.equal(enemy.el.dataset.enemyAbilityFamily, 'laser');
  assert.equal(enemy.el.dataset.enemyAbilitySilhouette, 'beam_prism');
});

test('maps snakes and spawners to large additive elites', () => {
  const snake = createBeatSwarmEnemyGameplayDescriptor({ enemyType: 'drawsnake' });
  const spawner = createBeatSwarmEnemyGameplayDescriptor({ enemyType: 'spawner' });

  assert.equal(snake.tier, 'elite');
  assert.equal(snake.scale, 'large');
  assert.equal(snake.musicalOwnership, 'additive_motif');
  assert.equal(snake.movementFamily, 'winding_path');
  assert.equal(spawner.tier, 'elite');
  assert.equal(spawner.scale, 'large');
  assert.equal(spawner.abilityFamily, 'summoning');
  assert.equal(spawner.laneEventMode, 'additive_motif');
  assert.ok(BEAT_SWARM_ELITE_ENEMY_TYPES.includes('drawsnake'));
  assert.ok(BEAT_SWARM_ELITE_ENEMY_TYPES.includes('spawner'));
  assert.equal(isBeatSwarmEliteEnemyType('drawsnake'), true);
  assert.equal(isBeatSwarmEliteEnemyType('spawner'), true);
  assert.equal(isBeatSwarmEliteEnemyType('composer-group-member'), false);
});

test('maps musical combat groups to additive elite formations', () => {
  const descriptor = createBeatSwarmEnemyGameplayDescriptor({
    enemyType: 'gunner',
    combatSyncGroupId: 4,
    combatMusicalPartEndsOnDeath: true,
    combatLabMovementBehaviorId: 'hold_position',
  });

  assert.equal(descriptor.tier, 'elite');
  assert.equal(descriptor.scale, 'small');
  assert.equal(descriptor.formationMembership, 'elite_formation');
  assert.equal(descriptor.musicalOwnership, 'additive_motif');
  assert.equal(descriptor.movementFamily, 'hold_position');
});

test('maps bosses to large full-structure performers', () => {
  const descriptor = createBeatSwarmEnemyGameplayDescriptor({ enemyType: 'boss-orbital' });

  assert.equal(descriptor.tier, 'boss');
  assert.equal(descriptor.scale, 'large');
  assert.equal(descriptor.musicalOwnership, 'full_structure');
  assert.equal(descriptor.laneEventMode, 'full_structure');
  assert.equal(descriptor.formationMembership, 'boss_structure');
  assert.equal(descriptor.visualComplexity, 'boss');
});

test('recomputes inferred fields after a legacy enemy type mutation', () => {
  const enemy = { enemyType: 'dumb' };
  assignBeatSwarmEnemyGameplayDescriptor(enemy);
  assert.equal(enemy.gameplayDescriptor.tier, 'basic');

  enemy.enemyType = 'spawner';
  assignBeatSwarmEnemyGameplayDescriptor(enemy);
  assert.equal(enemy.gameplayDescriptor.tier, 'elite');
  assert.equal(enemy.gameplayDescriptor.scale, 'large');
  assert.equal(enemy.gameplayDescriptor.musicalOwnership, 'additive_motif');
});

test('selects one rotating small performer for a core lane event', () => {
  const members = [
    { id: 1, enemyType: 'composer-group-member', formationMemberIndex: 0 },
    { id: 2, enemyType: 'composer-group-member', formationMemberIndex: 1 },
    { id: 3, enemyType: 'composer-group-member', formationMemberIndex: 2 },
  ];
  members.forEach((enemy) => assignBeatSwarmEnemyGameplayDescriptor(enemy));

  const performers = selectBeatSwarmLaneEventPerformers({
    aliveMembers: members,
    chooseRoundRobin: (eligible) => eligible[1],
  });

  assert.deepEqual(performers.map((enemy) => enemy.id), [2]);
});

test('selects every large performer plus one small performer', () => {
  const smallA = { id: 1, enemyType: 'composer-group-member', formationMemberIndex: 0 };
  const smallB = { id: 2, enemyType: 'composer-group-member', formationMemberIndex: 1 };
  const largeA = { id: 3, enemyType: 'composer-group-member', formationMemberIndex: 3 };
  const largeB = { id: 4, enemyType: 'composer-group-member', formationMemberIndex: 2 };
  assignBeatSwarmEnemyGameplayDescriptor(smallA);
  assignBeatSwarmEnemyGameplayDescriptor(smallB);
  assignBeatSwarmEnemyGameplayDescriptor(largeA, { scale: 'large' });
  assignBeatSwarmEnemyGameplayDescriptor(largeB, { scale: 'large' });

  const performers = selectBeatSwarmLaneEventPerformers({
    aliveMembers: [smallA, largeA, smallB, largeB],
    chooseRoundRobin: (eligible) => eligible[1],
  });

  assert.deepEqual(performers.map((enemy) => enemy.id), [4, 3, 2]);
});

test('keeps additive elite performers out of core lane allocation', () => {
  const basic = { id: 1, enemyType: 'composer-group-member' };
  const elite = {
    id: 2,
    enemyType: 'gunner',
    combatSyncGroupId: 9,
    combatMusicalPartEndsOnDeath: true,
  };
  assignBeatSwarmEnemyGameplayDescriptor(basic);
  assignBeatSwarmEnemyGameplayDescriptor(elite);

  const performers = selectBeatSwarmLaneEventPerformers({
    aliveMembers: [elite, basic],
    chooseRoundRobin: (eligible) => eligible[0],
  });

  assert.deepEqual(performers.map((enemy) => enemy.id), [1]);
});
