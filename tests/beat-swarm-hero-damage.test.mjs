import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveBeatSwarmEnemyIncomingDamage } from '../src/beat-swarm/beat-swarm-hero-damage.js';

test('Hero-lane enemy takes half the incoming damage of an otherwise identical non-Hero', () => {
  const hero = { hp: 100, maxHp: 100, assignedMusicLaneId: 'secondary_loop_lane' };
  const support = { hp: 100, maxHp: 100, assignedMusicLaneId: 'secondary_loop_lane' };
  hero.hp -= resolveBeatSwarmEnemyIncomingDamage(20, hero, 'hero').appliedDamage;
  support.hp -= resolveBeatSwarmEnemyIncomingDamage(20, support, 'support').appliedDamage;
  assert.equal(hero.hp, 90);
  assert.equal(support.hp, 80);
});

test('role rotation changes future damage only and never mutates current or maximum health', () => {
  const enemy = { hp: 37, maxHp: 100, assignedMusicLaneId: 'primary_loop_lane' };
  const before = { ...enemy };
  assert.equal(resolveBeatSwarmEnemyIncomingDamage(12, enemy, 'hero').appliedDamage, 6);
  assert.deepEqual(enemy, before);
  assert.equal(resolveBeatSwarmEnemyIncomingDamage(12, enemy, 'background').appliedDamage, 12);
  assert.deepEqual(enemy, before);
});

test('non-musical enemies are never protected by Hero role', () => {
  assert.equal(resolveBeatSwarmEnemyIncomingDamage(12, { hp: 20 }, 'hero').appliedDamage, 12);
});
