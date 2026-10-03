import test from 'node:test';
import assert from 'node:assert/strict';
import { transport, ensureAudioContext, setBpm } from '../src/audio-core.js';
import { MAIN_TRANSPORT_ID, transportRegistry } from '../src/transport-registry.js';
import {
  activatePlaybackInstance, activatePlaybackInstanceForChainTurn,
  clearPlaybackInstancesForTests, deactivatePlaybackInstance,
  ensurePlaybackInstance, getPlaybackInstance, getPlaybackStepEvents,
  updatePlaybackInstanceProgress,
} from '../src/playback-instances.js';

test('registry returns the existing absolute tick transport and no additional clocks', () => {
  assert.equal(MAIN_TRANSPORT_ID, 'main-heartbeat');
  assert.strictEqual(transportRegistry.get(MAIN_TRANSPORT_ID), transport);
  assert.equal(transportRegistry.get('unknown'), undefined);
});

test('migrated playback instances retain ownership through transport and instance lifecycle changes', async () => {
  class FakeAudioContext {
    currentTime = 0;
    state = 'running';
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  globalThis.window = { AudioContext: FakeAudioContext };
  clearPlaybackInstancesForTests();
  const toys = ['loopgrid', 'loopgrid-drum', 'drawgrid', 'chordwheel', 'rippler', 'bouncer'];
  const originals = toys.map((toy, index) => index % 2
    ? activatePlaybackInstance(toy, 130, { loopLengthTicks: 384 })
    : ensurePlaybackInstance(toy, { startTick: 192, loopLengthTicks: 384 }));
  for (const instance of originals) {
    assert.equal(instance.transportId, MAIN_TRANSPORT_ID);
    assert.equal(instance.startTick, 192);
    assert.deepEqual(getPlaybackStepEvents(instance, 192, 384).map(event => event.eventTick), [192, 240, 288, 336]);
  }

  const ctx = ensureAudioContext();
  await transport.play();
  ctx.currentTime = 0.25;
  assert.equal(transport.currentTick, 48);
  transport.pause();
  ctx.currentTime = 10;
  assert.equal(transport.currentTick, 48);
  await transport.play();
  setBpm(73);
  assert.equal(transport.currentTick, 48);
  assert.equal(transport.audioTimeToTick(transport.tickToAudioTime(960)), 960);

  for (const [index, toy] of toys.entries()) {
    assert.strictEqual(getPlaybackInstance(toy), originals[index]);
    assert.equal(getPlaybackInstance(toy).transportId, MAIN_TRANSPORT_ID);
    // Definition edits and scheduler progress cannot move ownership or rebase.
    ensurePlaybackInstance(toy, { loopLengthTicks: 768 });
    updatePlaybackInstanceProgress(toy, { scheduledUntilTick: 960, definitionRevisionSeen: 2 });
    assert.equal(getPlaybackInstance(toy).transportId, MAIN_TRANSPORT_ID);
    assert.equal(getPlaybackInstance(toy).startTick, 192);
    deactivatePlaybackInstance(toy);
    const reactivated = activatePlaybackInstance(toy, 384);
    assert.equal(reactivated.transportId, originals[index].transportId);
    assert.equal(reactivated.startTick, 480);
    const retriggered = activatePlaybackInstance(toy, 480, { retrigger: true });
    assert.notEqual(retriggered.id, reactivated.id);
    assert.equal(retriggered.transportId, reactivated.transportId);
    assert.equal(retriggered.startTick, 576);
    const chain = activatePlaybackInstanceForChainTurn(toy, 768);
    assert.equal(chain.transportId, retriggered.transportId);
    assert.equal(chain.startTick, 768);
  }
  transport.pause();
  setBpm(120);
  transport.returnToStart();
});
