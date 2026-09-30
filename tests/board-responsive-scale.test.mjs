import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  computeResponsiveBaseScale,
  composeEffectiveBoardScale,
  screenDeltaToWorldDelta,
  screenToWorldPoint,
  worldToScreenPoint,
  preserveWorldPointAtViewportCenter,
} from '../src/board-responsive-scale.js';

const closeTo = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

test('responsive board base scale follows the 1600x900 authored reference', () => {
  const cases = [
    [1600, 900, 1],
    [1280, 720, 0.8],
    [960, 720, 0.6],
    [800, 600, 0.5],
    [1920, 1080, 1],
  ];
  for (const [width, height, expected] of cases) {
    closeTo(computeResponsiveBaseScale(width, height), expected);
  }
});

test('effective scale composes responsive presentation with user zoom', () => {
  closeTo(composeEffectiveBoardScale(0.75, 0.8), 0.6);
  closeTo(composeEffectiveBoardScale(1, 0.5), 0.5);
});

test('world and screen projection round trip through effective scale', () => {
  const transform = { effectiveBoardScale: 0.48, x: 137, y: -42 };
  const world = { x: 825.5, y: 311.25 };
  const screen = worldToScreenPoint(world, transform);
  const roundTrip = screenToWorldPoint(screen, transform);
  closeTo(roundTrip.x, world.x);
  closeTo(roundTrip.y, world.y);
});

test('drag deltas invert the effective presentation scale', () => {
  assert.deepEqual(
    screenDeltaToWorldDelta({ x: 60, y: -30 }, 0.6),
    { x: 100, y: -50 },
  );
});

test('resize preserves the world point under the viewport centre', () => {
  const result = preserveWorldPointAtViewportCenter({
    oldCenter: { x: 800, y: 450 },
    newCenter: { x: 640, y: 360 },
    layoutOffset: { x: 0, y: 0 },
    translation: { x: 80, y: -20 },
    oldEffectiveScale: 1,
    newEffectiveScale: 0.8,
  });
  assert.deepEqual(result.worldPoint, { x: 720, y: 470 });
  const projected = worldToScreenPoint(result.worldPoint, {
    effectiveBoardScale: 0.8,
    x: result.translation.x,
    y: result.translation.y,
  });
  closeTo(projected.x, 640);
  closeTo(projected.y, 360);
});

test('responsive resize remains separate from persistence, overview, UI, and toy scale', async () => {
  const boardViewport = await readFile(new URL('../src/board-viewport.js', import.meta.url), 'utf8');
  const coordinator = await readFile(new URL('../src/zoom/ZoomCoordinator.js', import.meta.url), 'utf8');
  const uiScale = await readFile(new URL('../src/ui-scale.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.match(boardViewport, /JSON\.stringify\(\{ scale, x, y \}\)/);
  assert.doesNotMatch(boardViewport, /JSON\.stringify\([^\n]*responsiveBaseScale/);
  assert.match(boardViewport, /allowOverviewTransition\(scale\)/);
  assert.match(coordinator, /state\.currentScale \* responsiveBaseScale/);
  assert.match(uiScale, /--ui-scale/);
  assert.match(css, /--toy-scale:\s*0\.75/);
  assert.doesNotMatch(css, /--toy-scale:\s*var\(--responsive/);
});
