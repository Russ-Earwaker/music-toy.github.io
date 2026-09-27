import test from 'node:test';
import assert from 'node:assert/strict';

import { createViewportSpace, logicalLengthToScreen, logicalToScreen } from '../src/coordinates/viewport-space.js';
import { createBeatSwarmGameplayPresentationSpace } from '../src/beat-swarm/beat-swarm-presentation.js';
import {
  BEAT_SWARM_LOGICAL_BOUNDS,
  BEAT_SWARM_LOGICAL_CENTER,
  createBeatSwarmProjectionBridge,
  createBeatSwarmWorldLogicalProjection,
} from '../src/beat-swarm/beat-swarm-viewport-space.js';
import { getRandomOffscreenSpawnPointRuntime } from '../src/beat-swarm/beat-swarm-spawn-utils.js';
import { reflectBeatSwarmLogicalMotion } from '../src/beat-swarm/beat-swarm-logical-movement.js';
import { createWorldLogicalCollision } from '../src/beat-swarm/beat-swarm-logical-collision.js';
import {
  WEAPON_GATE_LOGICAL_CENTER,
  getWeaponGateCorridorBounds,
  getWeaponGateShipWorldX,
} from '../src/beat-swarm/beat-swarm-weapon-gate-geometry.js';
import { spawnWeaponGateShot, updateWeaponGateShots } from '../src/beat-swarm/beat-swarm-weapon-gate-effects.js';
import { createWeaponGateIntroState, initializeWeaponGateSchedule } from '../src/beat-swarm/beat-swarm-weapon-gate-state.js';
import { resolveBeatSwarmPauseState } from '../src/beat-swarm/beat-swarm-pause-state.js';

const DISPLAYS = Object.freeze([
  Object.freeze([800, 450]),
  Object.freeze([1280, 720]),
  Object.freeze([1600, 900]),
  Object.freeze([1920, 1080]),
  Object.freeze([2560, 1080]),
]);
const PLAYER_WORLD = Object.freeze({ x: 10000, y: -4000 });
const WORLD_SCALE = 0.6;
const ENEMY_WORLD = Object.freeze([
  Object.freeze({ x: 9800, y: -4100 }),
  Object.freeze({ x: 10200, y: -3900 }),
]);
const BODY_LOGICAL = Object.freeze({ player: 38, enemySmall: 50, enemyLarge: 82, pickup: 44 });
const ARENA_RADIUS_WORLD = 1100;
const ARENA_RESISTANCE_WORLD = 275;

function rawViewport(width, height) {
  return createViewportSpace({
    logicalWidth: 1600,
    logicalHeight: 900,
    displayRect: { left: 0, top: 0, width, height },
  });
}

function createScene(width, height) {
  const viewport = createBeatSwarmGameplayPresentationSpace(rawViewport(width, height));
  const worldProjection = createBeatSwarmWorldLogicalProjection({
    getPlayerWorld: () => PLAYER_WORLD,
    getWorldScale: () => WORLD_SCALE,
  });
  const bridge = createBeatSwarmProjectionBridge({
    getViewportSpace: () => viewport,
    worldToLogicalMap: worldProjection.worldToLogical,
    logicalToWorldMap: worldProjection.logicalToWorld,
  });
  return { viewport, worldProjection, bridge };
}

function createLogicalInvariantSnapshot(width, height) {
  const { worldProjection, bridge } = createScene(width, height);
  const playerLogical = worldProjection.worldToLogical(PLAYER_WORLD);
  const enemiesLogical = ENEMY_WORLD.map(worldProjection.worldToLogical);
  const spawn = getRandomOffscreenSpawnPointRuntime({
    group: { id: 12, formationSpawnRegion: 'lower_outer' },
    memberIndex: 1,
    memberCount: 4,
    constants: { logicalWidth: 1600, logicalHeight: 900, enemyFallbackSpawnMarginLogical: 42 },
    helpers: { randRange: (min, max) => min + ((max - min) * 0.375) },
  });
  const movement = reflectBeatSwarmLogicalMotion(
    { x: 1590, y: 20 },
    { x: 320, y: -120 },
    24,
  );
  const collision = createWorldLogicalCollision(worldProjection.worldToLogical);
  const collisionOrigin = worldProjection.logicalToWorld({ x: 800, y: 450 });
  const collisionPoint = worldProjection.logicalToWorld({ x: 824, y: 450 });
  const gate = createWeaponGateIntroState({}, { seed: 'cross-resolution-lock' });
  initializeWeaponGateSchedule(gate, 0.22, 0.04, 12, 100);
  const gateShotState = { shots: [], targets: [] };
  const gateShot = spawnWeaponGateShot(gateShotState, 'C4');
  updateWeaponGateShots(gateShotState, 0.125);

  return {
    logicalBounds: BEAT_SWARM_LOGICAL_BOUNDS,
    playerLogical,
    enemiesLogical,
    projectileLogical: { x: 1200, y: 450, vx: 600, vy: 0, enteredGameplay: true },
    enemyLogicalBodySizes: [BODY_LOGICAL.enemySmall, BODY_LOGICAL.enemyLarge],
    spawn,
    movement,
    collision: {
      atRadius: collision.pointWithinRadius(collisionPoint, collisionOrigin, 24),
      outsideRadius: collision.pointWithinRadius(
        worldProjection.logicalToWorld({ x: 824.001, y: 450 }),
        collisionOrigin,
        24,
      ),
    },
    gameplayVisibility: {
      carrierInside: bridge.isWorldPointInsideGameplay(worldProjection.logicalToWorld({ x: 25, y: 450 }), -24),
      carrierOutside: bridge.isWorldPointInsideGameplay(worldProjection.logicalToWorld({ x: -0.001, y: 450 })),
    },
    arena: {
      center: playerLogical,
      radius: worldProjection.worldLengthToLogical(ARENA_RADIUS_WORLD),
      resistanceRadius: worldProjection.worldLengthToLogical(ARENA_RADIUS_WORLD + ARENA_RESISTANCE_WORLD),
    },
    weaponGate: {
      player: WEAPON_GATE_LOGICAL_CENTER,
      shipWorldX: getWeaponGateShipWorldX(gate),
      corridor: getWeaponGateCorridorBounds(gate),
      firstGate: { x: gate.gates[0].x, targetStep: gate.gates[0].targetStep, targetTime: gate.gates[0].targetTime },
      shot: { x: gateShot.x, y: gateShot.y, vx: gateShot.vx, ttl: gateShot.ttl },
    },
  };
}

function createPresentationSnapshot(width, height) {
  const { viewport, worldProjection } = createScene(width, height);
  const enemyLogical = ENEMY_WORLD.map(worldProjection.worldToLogical);
  const arenaDiameter = logicalLengthToScreen(viewport, worldProjection.worldLengthToLogical(ARENA_RADIUS_WORLD) * 2);
  const enemySeparation = Math.hypot(
    enemyLogical[1].x - enemyLogical[0].x,
    enemyLogical[1].y - enemyLogical[0].y,
  );
  const sizes = Object.fromEntries(Object.entries(BODY_LOGICAL).map(([key, value]) => [key, logicalLengthToScreen(viewport, value)]));
  return {
    scale: viewport.presentationScale,
    contentRect: viewport.contentRect,
    playerScreen: logicalToScreen(viewport, BEAT_SWARM_LOGICAL_CENTER),
    arenaDiameter,
    enemySeparation: logicalLengthToScreen(viewport, enemySeparation),
    sizes,
    ratios: {
      enemyArena: sizes.enemySmall / arenaDiameter,
      playerArena: sizes.player / arenaDiameter,
      separationArena: logicalLengthToScreen(viewport, enemySeparation) / arenaDiameter,
      pickupArena: sizes.pickup / arenaDiameter,
    },
  };
}

test('fixed BeatSwarm scene keeps all gameplay decisions identical across resolutions', () => {
  const snapshots = DISPLAYS.map(([width, height]) => createLogicalInvariantSnapshot(width, height));
  for (const snapshot of snapshots.slice(1)) assert.deepEqual(snapshot, snapshots[0]);
  assert.deepEqual(snapshots[0].playerLogical, { x: 800, y: 450 });
  assert.equal(snapshots[0].collision.atRadius, true);
  assert.equal(snapshots[0].collision.outsideRadius, false);
  assert.deepEqual(snapshots[0].gameplayVisibility, { carrierInside: true, carrierOutside: false });
});

test('presentation ratios remain uniform below the cap and the complete scene caps above it', () => {
  const presentations = DISPLAYS.map(([width, height]) => createPresentationSnapshot(width, height));
  for (const presentation of presentations.slice(1)) {
    assert.deepEqual(presentation.ratios, presentations[0].ratios);
  }
  assert.deepEqual(presentations.map(({ scale }) => scale), [0.5, 0.8, 1, 1, 1]);

  const reference = presentations[2];
  for (const capped of presentations.slice(3)) {
    assert.equal(capped.arenaDiameter, reference.arenaDiameter);
    assert.equal(capped.enemySeparation, reference.enemySeparation);
    assert.deepEqual(capped.sizes, reference.sizes);
  }
});

test('silent-paused resize changes presentation only, never logical gameplay state', () => {
  const pause = resolveBeatSwarmPauseState(null, {
    paused: true,
    pauseUiVisible: false,
    pauseSource: 'silent-debug',
  });
  const logicalBefore = createLogicalInvariantSnapshot(1600, 900);
  const projectedBefore = createPresentationSnapshot(1600, 900);
  const logicalAfter = createLogicalInvariantSnapshot(2560, 1080);
  const projectedAfter = createPresentationSnapshot(2560, 1080);

  assert.deepEqual(pause, { paused: true, pauseUiVisible: false, pauseSource: 'silent-debug' });
  assert.deepEqual(logicalAfter, logicalBefore);
  assert.notDeepEqual(projectedAfter.contentRect, projectedBefore.contentRect);
  assert.notDeepEqual(projectedAfter.playerScreen, projectedBefore.playerScreen);
});
