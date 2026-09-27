import test from 'node:test';
import assert from 'node:assert/strict';

import { createViewportSpace, logicalToScreen } from '../src/coordinates/viewport-space.js';
import {
  WEAPON_GATE_LOGICAL_CENTER,
  getWeaponGateCorridorBounds,
  getWeaponGateShipWorldX,
} from '../src/beat-swarm/beat-swarm-weapon-gate-geometry.js';
import { spawnWeaponGateShot, updateWeaponGateShots } from '../src/beat-swarm/beat-swarm-weapon-gate-effects.js';
import { getWeaponGateGameplayPresentationTransform, isWeaponGateLogicalXVisible } from '../src/beat-swarm/beat-swarm-weapon-gate-render.js';
import { createWeaponGateIntroState, initializeWeaponGateSchedule } from '../src/beat-swarm/beat-swarm-weapon-gate-state.js';

const DISPLAYS = [
  [1280, 720],
  [1600, 900],
  [1920, 1080],
  [1440, 900],
  [1024, 768],
  [2560, 1080],
];

function makeViewport(width, height) {
  return createViewportSpace({
    logicalWidth: 1600,
    logicalHeight: 900,
    displayRect: { left: 0, top: 0, width, height },
  });
}

function makeState() {
  const state = createWeaponGateIntroState({}, { seed: 'logical-gate-test' });
  initializeWeaponGateSchedule(state, 0.22, 0.04, 12, 100);
  return state;
}

test('gate corridor and scheduled gate positions are display invariant', () => {
  const snapshots = DISPLAYS.map(() => {
    const state = makeState();
    return {
      player: WEAPON_GATE_LOGICAL_CENTER,
      playerWorldX: getWeaponGateShipWorldX(state),
      corridor: getWeaponGateCorridorBounds(state),
      gateX: state.gates[0].x,
      targetStep: state.gates[0].targetStep,
      playbackStepIndex: state.gates[0].playbackStepIndex,
    };
  });
  for (const snapshot of snapshots.slice(1)) assert.deepEqual(snapshot, snapshots[0]);
  assert.equal(snapshots[0].corridor.bottom - snapshots[0].corridor.top, 300);
});

test('gate projectile logical trajectory is invariant across display sizes', () => {
  const trajectories = DISPLAYS.map(() => {
    const state = { shots: [], targets: [] };
    const shot = spawnWeaponGateShot(state, 'C4');
    const points = [{ x: shot.x, y: shot.y }];
    for (const dt of [0.05, 0.075, 0.04]) {
      updateWeaponGateShots(state, dt);
      points.push({ x: shot.x, y: shot.y, ttl: shot.ttl });
    }
    return points;
  });
  for (const trajectory of trajectories.slice(1)) assert.deepEqual(trajectory, trajectories[0]);
});

test('resize mid-shot changes projection only, not logical trajectory', () => {
  const state = { shots: [], targets: [] };
  const shot = spawnWeaponGateShot(state, 'C4');
  updateWeaponGateShots(state, 0.1);
  const logicalBefore = { x: shot.x, y: shot.y, vx: shot.vx, ttl: shot.ttl };
  const screenBefore = logicalToScreen(makeViewport(1600, 900), shot);
  const screenAfterResize = logicalToScreen(makeViewport(1024, 768), shot);
  assert.deepEqual({ x: shot.x, y: shot.y, vx: shot.vx, ttl: shot.ttl }, logicalBefore);
  assert.notDeepEqual(screenAfterResize, screenBefore);
  updateWeaponGateShots(state, 0.1);
  assert.equal(shot.x, logicalBefore.x + logicalBefore.vx * 0.1);
  assert.equal(shot.y, logicalBefore.y);
});

test('gate admission uses fixed logical bounds', () => {
  const decisions = DISPLAYS.map(() => [
    isWeaponGateLogicalXVisible(-100),
    isWeaponGateLogicalXVisible(-100.001),
    isWeaponGateLogicalXVisible(1740),
    isWeaponGateLogicalXVisible(1740.001),
  ]);
  for (const decision of decisions.slice(1)) assert.deepEqual(decision, decisions[0]);
  assert.deepEqual(decisions[0], [true, false, true, false]);
});

test('the same logical gate point projects correctly for every supported display', () => {
  const logical = { x: 800, y: 450 };
  const projected = DISPLAYS.map(([width, height]) => ({
    width,
    height,
    point: logicalToScreen(makeViewport(width, height), logical),
  }));
  assert.deepEqual(projected.map((entry) => entry.point), [
    { x: 640, y: 360 },
    { x: 800, y: 450 },
    { x: 960, y: 540 },
    { x: 720, y: 450 },
    { x: 512, y: 384 },
    { x: 1280, y: 540 },
  ]);
});

test('gate presentation transform contains and centres the logical gameplay layer', () => {
  assert.equal(
    getWeaponGateGameplayPresentationTransform(makeViewport(1440, 900)),
    'translate(0px, 45px) scale(0.9)',
  );
  assert.equal(
    getWeaponGateGameplayPresentationTransform(makeViewport(2560, 1080)),
    'translate(320px, 0px) scale(1.2)',
  );
});
