import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('normal enemy health-bar DOM and styling are absent while HP state remains', () => {
  const mode = readFileSync(new URL('../src/beat-swarm/beat-swarm-mode.js', import.meta.url), 'utf8');
  const composerSpawn = readFileSync(new URL('../src/beat-swarm/beat-swarm-composer-spawn.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.doesNotMatch(mode, /className\s*=\s*['"]beat-swarm-enemy-hp/);
  assert.doesNotMatch(composerSpawn, /className\s*=\s*['"]beat-swarm-enemy-hp/);
  assert.doesNotMatch(css, /\.beat-swarm-enemy-hp(?:-fill)?\s*\{/);
  assert.match(mode, /enemy\.hp\s*-=\s*appliedDamage/);
  assert.match(mode, /maxHp:/);
});

test('lane-carrier first-trigger diagnostic is included in production capture', () => {
  const mode = readFileSync(new URL('../src/beat-swarm/beat-swarm-mode.js', import.meta.url), 'utf8');
  const perfLab = readFileSync(new URL('../src/perf/perf-lab.js', import.meta.url), 'utf8');
  assert.match(mode, /phase:\s*'first_visible'/);
  assert.match(mode, /phase:\s*'first_musical_trigger'/);
  assert.match(mode, /phase:\s*'visible_without_trigger_over_phrase'/);
  assert.match(perfLab, /'music_lane_carrier_trigger_timing'/);
});
