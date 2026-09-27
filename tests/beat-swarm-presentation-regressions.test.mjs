import test from 'node:test';
import assert from 'node:assert/strict';

import { getMusicPickupPresentationScale } from '../src/beat-swarm/beat-swarm-music-missiles.js';
import {
  createBeatSwarmProjectileRemovalDiagnostic,
  getBeatSwarmProjectileViewportRemovalReason,
} from '../src/beat-swarm/beat-swarm-pickups-combat.js';
import { spawnWeaponGateShot, updateWeaponGateShots } from '../src/beat-swarm/beat-swarm-weapon-gate-effects.js';
import { isLogicalPointInsideGameplay } from '../src/beat-swarm/beat-swarm-viewport-space.js';

test('rocket pickup body and orbiting rockets share one presentation scale', () => {
  for (const scale of [0.5, 0.8, 1, 1.2]) {
    assert.equal(getMusicPickupPresentationScale(scale, 1), scale);
    assert.equal(getMusicPickupPresentationScale(scale, 1.22), scale * 1.22);
  }
});

test('standard projectile reaches the logical edge and lifetime margin before retirement', () => {
  const margin = 72;
  for (const x of [1599.999, 1600, 1600 + margin]) {
    const outside = !isLogicalPointInsideGameplay({ x, y: 450 }, margin);
    assert.equal(getBeatSwarmProjectileViewportRemovalReason({
      isOutsideLifetimeBounds: outside,
      enteredGameplay: true,
      ttl: 1,
    }), null);
  }
  const outside = !isLogicalPointInsideGameplay({ x: 1600 + margin + 0.001, y: 450 }, margin);
  assert.equal(getBeatSwarmProjectileViewportRemovalReason({
    isOutsideLifetimeBounds: outside,
    enteredGameplay: true,
    ttl: 1,
  }), 'logical_viewport_retirement');
});

test('projectile removal diagnostic preserves coordinate spaces and reason', () => {
  const entry = createBeatSwarmProjectileRemovalDiagnostic({
    projectile: { kind: 'standard', wx: 25, wy: 30, ttl: 0.4, enteredGameplay: true },
    reason: 'logical_viewport_retirement',
    logicalPosition: { x: 1672.1, y: 450 },
    screenPosition: { x: 1337.68, y: 360 },
    logicalBounds: { left: 0, top: 0, right: 1600, bottom: 900 },
    lifetimeMarginLogical: 72,
    presentationScale: 0.8,
  });
  assert.equal(entry.removalReason, 'logical_viewport_retirement');
  assert.equal(entry.enteredGameplay, true);
  assert.equal(entry.activeLifetimeMarginLogical, 72);
  assert.equal(entry.presentationScale, 0.8);
  assert.deepEqual(entry.logicalPosition, { x: 1672.1, y: 450 });
});

test('weapon-gate shot follows one logical path without resize rebasing', () => {
  const state = { shots: [], targets: [] };
  const shot = spawnWeaponGateShot(state, 'C4');
  assert.deepEqual({ x: shot.x, y: shot.y }, { x: 826, y: 450 });
  assert.deepEqual({ x: shot.target.x, y: shot.target.y }, { x: 1050, y: 450 });
  updateWeaponGateShots(state, 0.1);
  assert.deepEqual({ x: shot.x, y: shot.y }, { x: 904, y: 450 });
});
