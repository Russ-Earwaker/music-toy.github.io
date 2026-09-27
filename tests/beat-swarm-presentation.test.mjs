import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createViewportSpace } from '../src/coordinates/viewport-space.js';
import {
  composeBeatSwarmGameplayTransform,
  createBeatSwarmPresentationDebugEntry,
  getBeatSwarmPresentationScale,
  getBeatSwarmRawPresentationScale,
  projectBeatSwarmLogicalSize,
} from '../src/beat-swarm/beat-swarm-presentation.js';

const cases = [
  [1600, 900, 1],
  [1280, 720, 0.8],
  [800, 450, 0.5],
  [1920, 1080, 1],
  [1440, 900, 0.9],
  [2560, 1080, 1],
];

for (const [width, height, expectedScale] of cases) {
  test(`gameplay presentation scales uniformly into ${width}x${height}`, () => {
    const viewport = createViewportSpace({
      logicalWidth: 1600,
      logicalHeight: 900,
      displayRect: { left: 0, top: 0, width, height },
    });
    assert.equal(Math.min(1, viewport.presentationScale), expectedScale);
    assert.equal(projectBeatSwarmLogicalSize(viewport, 42), 42 * expectedScale);
    assert.equal(projectBeatSwarmLogicalSize(viewport, 86), 86 * expectedScale);
    assert.ok(Math.abs(
      (projectBeatSwarmLogicalSize(viewport, 86) / projectBeatSwarmLogicalSize(viewport, 42)) - (86 / 42),
    ) < 1e-12);
    assert.equal(projectBeatSwarmLogicalSize(viewport, 240), 240 * expectedScale);
  });
}

test('gameplay transforms scale bodies without scaling their screen translation', () => {
  assert.equal(
    composeBeatSwarmGameplayTransform('translate(320px, 180px) rotate(30deg)', 0.5),
    'translate(320px, 180px) rotate(30deg) scale(0.500000)',
  );
});

test('debug scale distinguishes raw viewport projection from capped gameplay bodies', () => {
  const viewport = createViewportSpace({
    logicalWidth: 1600,
    logicalHeight: 900,
    displayRect: { left: 0, top: 0, width: 1920, height: 1080 },
  });
  assert.equal(getBeatSwarmRawPresentationScale(viewport), 1.2);
  assert.equal(getBeatSwarmPresentationScale(viewport), 1);
});

test('presentation debugging reports logical and resulting CSS sizes without mutating gameplay values', () => {
  const collisionRadiusLogical = 24;
  const entry = createBeatSwarmPresentationDebugEntry({
    kind: 'projectile',
    logicalPosition: { x: 800, y: 450 },
    screenPosition: { x: 640, y: 360 },
    logicalSize: 12,
    presentationScale: 0.8,
  });
  assert.ok(Math.abs(entry.cssSize - 9.6) < 1e-12);
  assert.equal(entry.logicalSize, 12);
  assert.equal(collisionRadiusLogical, 24);
  assert.ok(Object.isFrozen(entry));
});

test('HUD and pause UI do not inherit the gameplay presentation scale', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.beat-swarm-ship-wrap[\s\S]*?scale\(var\(--bs-gameplay-presentation-scale, 1\)\)/);
  const pauseRule = css.match(/\.beat-swarm-pause-label\s*\{[\s\S]*?\}/)?.[0] || '';
  assert.doesNotMatch(pauseRule, /--bs-gameplay-presentation-scale/);
});

test('frame-pressure fallback keeps gameplay explosions visible', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  const severeHiddenRule = css.match(/\.beat-swarm-overlay\.is-frame-pressure-severe[^\{]+\{\s*display:\s*none\s*!important;\s*\}/)?.[0] || '';
  assert.doesNotMatch(severeHiddenRule, /beat-swarm-fx-explosion/);
});

test('startup weapon gates retain a fixed CSS width', async () => {
  const source = await readFile(new URL('../src/beat-swarm/beat-swarm-weapon-gate-render.js', import.meta.url), 'utf8');
  assert.match(source, /\.beat-swarm-weapon-gate\{[^}]*width:64px/);
  assert.doesNotMatch(source, /\.beat-swarm-weapon-gate\{[^}]*(?:vw|--bs-gameplay-presentation-scale)/);
});
