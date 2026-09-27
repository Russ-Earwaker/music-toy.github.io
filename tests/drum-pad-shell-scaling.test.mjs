import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shellSource = readFileSync(new URL('../src/grid-square-drum.js', import.meta.url), 'utf8');
const drumSource = readFileSync(new URL('../src/drum-core.js', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

test('Drum pad shell has no particle backing or DPR ownership', () => {
  assert.doesNotMatch(shellSource, /devicePixelRatio/);
  assert.doesNotMatch(shellSource, /\.width\s*=|\.height\s*=/);
  assert.doesNotMatch(shellSource, /sizeParticlesCanvas|drum-particles/);
  assert.match(drumSource, /tag:\s*'drum-pad-particles'/);
  assert.match(drumSource, /registerCanvas\('drum-pad-particles', particleCanvas, \{ policy: 'managed' \}\)/);
});

test('Drum pad shell no longer parses board transforms', () => {
  assert.doesNotMatch(shellSource, /getComputedStyle|matrix\(|__boardScale|getBoundingClientRect/);
});

test('TAP label sizing is presentation-only and scales with its container', () => {
  assert.match(shellSource, /fontSize:\s*'max\(24px, 39cqi\)'/);
  assert.match(shellSource, /containerType\s*=\s*'inline-size'/);
  assert.doesNotMatch(shellSource, /scale\s*=|unscaledMin|style\.fontSize\s*=\s*`/);
});

test('shell updates are event-driven with no resize listener or perpetual RAF', () => {
  assert.doesNotMatch(shellSource, /requestAnimationFrame|addEventListener\(['"]resize|__drumVisibilityLoop|__drumResizeHandler/);
  assert.match(shellSource, /lifecycle\.listen\(window, 'help:toggle'/);
  assert.match(shellSource, /lifecycle\.listen\(panel, 'loopgrid:playcol'/);
});

test('legacy shell particle canvas styling is retired', () => {
  assert.doesNotMatch(styleSource, /loopgrid-drum[^\n]*\.drum-particles/);
});

test('presentation cleanup leaves logical particle runtime untouched', () => {
  assert.match(drumSource, /createDrumPadParticles\(\)/);
  assert.match(drumSource, /particles\.step\(dt\)/);
  assert.match(drumSource, /createDrumParticleViewportSpace/);
  assert.doesNotMatch(shellSource, /particles\.step|createDrumPadParticles|DRUM_PARTICLE_LOGICAL/);
});
