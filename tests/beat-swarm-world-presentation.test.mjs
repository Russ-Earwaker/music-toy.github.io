import test from 'node:test';
import assert from 'node:assert/strict';

import { createViewportSpace, logicalLengthToScreen, logicalToScreen } from '../src/coordinates/viewport-space.js';
import { createBeatSwarmGameplayPresentationSpace } from '../src/beat-swarm/beat-swarm-presentation.js';
import { createBeatSwarmWorldLogicalProjection } from '../src/beat-swarm/beat-swarm-viewport-space.js';

const PLAYER_WORLD = Object.freeze({ x: 10000, y: -4000 });
const WORLD_CAMERA_SCALE = 0.6;
const ARENA_RADIUS_WORLD = 1100;
const ENEMY_DIAMETER_LOGICAL = 50;
const PLAYER_DIAMETER_LOGICAL = 38;

function projectScene(width, height) {
  const raw = createViewportSpace({
    logicalWidth: 1600,
    logicalHeight: 900,
    displayRect: { left: 0, top: 0, width, height },
  });
  const viewport = createBeatSwarmGameplayPresentationSpace(raw);
  const world = createBeatSwarmWorldLogicalProjection({
    getPlayerWorld: () => PLAYER_WORLD,
    getWorldScale: () => WORLD_CAMERA_SCALE,
  });
  const enemyAWorld = { x: PLAYER_WORLD.x - 200, y: PLAYER_WORLD.y };
  const enemyBWorld = { x: PLAYER_WORLD.x + 200, y: PLAYER_WORLD.y };
  const playerLogical = world.worldToLogical(PLAYER_WORLD);
  const enemyALogical = world.worldToLogical(enemyAWorld);
  const enemyBLogical = world.worldToLogical(enemyBWorld);
  const arenaRadiusLogical = world.worldLengthToLogical(ARENA_RADIUS_WORLD);
  const arenaDiameterScreen = logicalLengthToScreen(viewport, arenaRadiusLogical * 2);
  const enemyDistanceScreen = logicalLengthToScreen(viewport, enemyBLogical.x - enemyALogical.x);
  return {
    scale: viewport.presentationScale,
    playerScreen: logicalToScreen(viewport, playerLogical),
    enemyAScreen: logicalToScreen(viewport, enemyALogical),
    enemyBScreen: logicalToScreen(viewport, enemyBLogical),
    arenaDiameterScreen,
    enemyDiameterScreen: logicalLengthToScreen(viewport, ENEMY_DIAMETER_LOGICAL),
    playerDiameterScreen: logicalLengthToScreen(viewport, PLAYER_DIAMETER_LOGICAL),
    enemyDistanceScreen,
  };
}

test('fixed logical scene preserves body, spacing, and arena ratios across resolutions', () => {
  const scenes = [
    projectScene(800, 450),
    projectScene(1280, 720),
    projectScene(1600, 900),
  ];
  const ratios = scenes.map((scene) => ({
    enemyArena: scene.enemyDiameterScreen / scene.arenaDiameterScreen,
    playerArena: scene.playerDiameterScreen / scene.arenaDiameterScreen,
    spacingArena: scene.enemyDistanceScreen / scene.arenaDiameterScreen,
  }));
  for (const ratio of ratios.slice(1)) assert.deepEqual(ratio, ratios[0]);
  assert.deepEqual(scenes.map((scene) => scene.scale), [0.5, 0.8, 1]);
  assert.deepEqual(scenes.map((scene) => scene.playerScreen), [
    { x: 400, y: 225 },
    { x: 640, y: 360 },
    { x: 800, y: 450 },
  ]);
  assert.deepEqual(scenes.map((scene) => scene.enemyBScreen.x - scene.enemyAScreen.x), [120, 192, 240]);
  assert.deepEqual(scenes.map((scene) => scene.enemyDiameterScreen), [25, 40, 50]);
  assert.deepEqual(scenes.map((scene) => scene.arenaDiameterScreen), [660, 1056, 1320]);
});

test('existing 1.0 cap is applied to the complete gameplay presentation space', () => {
  const scene = projectScene(1920, 1080);
  assert.equal(scene.scale, 1);
  assert.deepEqual(scene.playerScreen, { x: 960, y: 540 });
  assert.equal(scene.enemyDiameterScreen, 50);
  assert.equal(scene.arenaDiameterScreen, 1320);
  assert.equal(scene.enemyBScreen.x - scene.enemyAScreen.x, 240);
});
