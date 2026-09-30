import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const retiredScalingModules = [
  'src/bouncer-draw.js',
  'src/bouncer-pointer.js',
  'src/bouncer-physworld.js',
  'src/bouncer-interact.js',
  'src/bouncer-square-fit.js',
  'src/bouncer-scale.js',
  'src/grid-particles.js',
  'src/grid-observers.js',
  'src/drum-particles.js',
  'src/ripplesynth-safety.js',
  'src/rippler-square-fit.js',
  'src/toy-visual-wrap.js',
  'src/toy-visual-positioner.js',
  'src/bouncer-diag.js',
  'src/toy-zoom-debug.js',
  'src/toy-zoom-debug2.js',
];

test('retired scaling modules cannot return as alternate production paths', () => {
  for (const relativePath of retiredScalingModules) {
    assert.equal(existsSync(`${root}/${relativePath}`), false, `${relativePath} should remain retired`);
  }
});

test('migrated pointer systems require their logical coordinate adapters', () => {
  const bouncer = source('src/bouncer-interactions.js');
  assert.match(bouncer, /Bouncer interactions require clientToLogical/);
  assert.doesNotMatch(bouncer, /canvas\.width\s*\|\|\s*1/);
  assert.doesNotMatch(bouncer, /getBoundingClientRect/);

  const rippler = source('src/ripplesynth-input.js');
  assert.match(rippler, /Rippler pointer handlers require getCanvasPos/);
  assert.doesNotMatch(rippler, /getBoundingClientRect/);
  assert.doesNotMatch(rippler, /devicePixelRatio/);

  const art = source('src/art/art-toy-factory.js');
  const dragHelper = art.slice(
    art.indexOf('function attachSlotHandleDrag'),
    art.indexOf('function installArtToyControls'),
  );
  assert.match(dragHelper, /requires clientToLogical/);
  assert.doesNotMatch(dragHelper, /panelPx|canvas\.width|getBoundingClientRect/);
});
