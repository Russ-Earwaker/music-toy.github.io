import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHeartbeatVisualModel, getHeartbeatVisualPhase } from '../src/heartbeat-visuals.js';
import { MAIN_TRANSPORT_ID } from '../src/transport-registry.js';
import { clearPlaybackInstancesForTests, ensurePlaybackInstance, deactivatePlaybackInstance } from '../src/playback-instances.js';
import { connectionCurve, curvePoint, projectConnectionPoint } from '../src/connection-geometry.js';
const playing = currentTick => ({ state: 'playing', currentTick, ticksPerBeat: 96 });
const wire = toyId => ({ id: toyId, kind: 'transport', from: { objectId: MAIN_TRANSPORT_ID, portId: 'output' }, to: { objectId: toyId, portId: 'input' } });

test('Heartbeat visibility derives only from canonical transport connections, including dormant children', () => {
  const model = createHeartbeatVisualModel(() => [wire('dormant'), wire('active'), { ...wire('sequence'), kind: 'sequence' }]);
  assert.deepEqual(model.update(['dormant','active','sequence','unconnected'], playing(0)).connectedToyIds, ['dormant','active']);
  assert.deepEqual(model.update(null, playing(0)).connectedToyIds, ['dormant','active']);
});
test('pause and inactive chain turns retain explicit links without mutating playback', () => {
  clearPlaybackInstancesForTests();
  const instance = ensurePlaybackInstance('toy', { startTick: 192 });
  const before = { ...instance };
  const model = createHeartbeatVisualModel(() => [wire('toy')]);
  assert.equal(model.update(['toy'], playing(24)).activePulseCount, 1);
  const paused = model.update(['toy'], { ...playing(24), state: 'paused' });
  assert.deepEqual(paused.connectedToyIds, ['toy']);
  assert.equal(paused.activePulseCount, 0);
  assert.equal(paused.pulse.travel, null);
  assert.deepEqual(instance, before);
  deactivatePlaybackInstance('toy');
  assert.deepEqual(model.update(['toy'], playing(24)).connectedToyIds, ['toy']);
  assert.ok(Object.isFrozen(paused));
  assert.ok(Object.isFrozen(paused.connectedToyIds));
});
test('pulse phase follows ticks through tempo changes, resume, tab lag, and return-to-start', () => {
  const a = getHeartbeatVisualPhase({ ...playing(120), bpm: 120 });
  assert.deepEqual(a, getHeartbeatVisualPhase({ ...playing(120), bpm: 73 }));
  assert.equal(a.phase, 0.25);
  assert.equal(a.travel, 0.3125);
  assert.equal(a.energy, 0.421875);
  assert.equal(getHeartbeatVisualPhase(playing(96 * 100 + 24)).phase, a.phase);
  assert.equal(getHeartbeatVisualPhase({ ...playing(0), state: 'stopped' }).energy, 0);
  assert.equal(getHeartbeatVisualPhase({ ...playing(0), state: 'paused' }).travel, null);
  assert.equal(getHeartbeatVisualPhase(playing(96)).energy, 1);
});
test('deleted wires and absent panels disappear without inferred ownership recreating them', () => {
  let wires = [wire('a'), wire('b')];
  const model = createHeartbeatVisualModel(() => wires);
  assert.deepEqual(model.update(['b'], playing(0)).connectedToyIds, ['b']);
  wires = [wire('a')];
  assert.deepEqual(model.update(['a','b'], playing(0)).connectedToyIds, ['a']);
  wires = [];
  assert.deepEqual(model.update(null, playing(0)).connectedToyIds, []);
});
test('transport wire geometry uses the shared pan, zoom and responsive projection', () => {
  for (const transform of [{ scale: 1, tx: 0, ty: 0 }, { scale: .4, tx: 320, ty: -50 }, { scale: 2, tx: -120, ty: 200 }]) {
    const origin = projectConnectionPoint({ x: 0, y: 0 }, transform);
    const end = projectConnectionPoint({ x: 800, y: 400 }, transform);
    const curve = connectionCurve(origin, end);
    assert.deepEqual(curvePoint(curve, 0), origin);
    assert.deepEqual(curvePoint(curve, 1), end);
    const pulse = curvePoint(curve, getHeartbeatVisualPhase(playing(24)).travel);
    assert.ok(Number.isFinite(pulse.x) && Number.isFinite(pulse.y));
  }
});
test('anchor keeps phase/debug state while the shared connector engine owns all wire rendering', () => {
  const anchor = readFileSync(new URL('../src/board-anchor.js', import.meta.url), 'utf8');
  const visuals = readFileSync(new URL('../src/heartbeat-visuals.js', import.meta.url), 'utf8');
  assert.match(anchor, /transportRegistry\.get\(MAIN_TRANSPORT_ID\)\.getState\(\)/);
  assert.match(visuals, /connectionModel\.list\('transport'\)/);
  assert.match(anchor, /heartbeatVisuals\.update\(null, transportState\)/);
  assert.doesNotMatch(anchor + visuals, /drawHeartbeatOwnership\(|ownershipObserver/);
  assert.doesNotMatch(visuals, /requestAnimationFrame|setInterval|setTimeout|activatePlaybackInstance|triggerInstrument/);
});
