import test from 'node:test';
import assert from 'node:assert/strict';
import { createSequencerScheduler } from '../src/note-scheduler.js';
import {
  activatePlaybackInstance,
  clearPlaybackInstancesForTests,
  deactivatePlaybackInstance,
  ensurePlaybackInstance,
  getPlaybackColumn,
  getPlaybackInstance,
} from '../src/playback-instances.js';

globalThis.window = globalThis.window || {};
window.__TOY_AUDIO_GEN = Object.create(null);

const types = { loop: 'loopgrid', drum: 'loopgrid-drum', draw: 'drawgrid' };
const tickToAudio = (tick, bpm = 120) => tick * (60 / bpm) / 96;

function makeToy(id, calls) {
  return {
    id,
    dataset: { toy: types[id], steps: '8', audiotoyid: id },
    __seqRev: 0,
    __seqPattern: { revision: 0 },
    __sequencerSchedule(column, audioTime, metadata) {
      calls.push({ id, column, audioTime, metadata });
    },
  };
}

test('Loop, Drum and DrawGrid keep independent tick offsets through pause/resume and tempo changes', () => {
  clearPlaybackInstancesForTests();
  const loop = ensurePlaybackInstance('loop', { active: true, startTick: 0, loopLengthTicks: 384 });
  const drum = activatePlaybackInstance('drum', 130, { quantize: true, loopLengthTicks: 384 });
  const draw = activatePlaybackInstance('draw', 250, { quantize: true, loopLengthTicks: 384 });
  assert.deepEqual([loop.startTick, drum.startTick, draw.startTick], [0, 192, 288]);

  const ids = [loop.id, drum.id, draw.id];
  const starts = [loop.startTick, drum.startTick, draw.startTick];
  const farTick = (384 * 9) + 330;
  const columns = [loop, drum, draw].map(instance => getPlaybackColumn(instance, farTick, 8));
  assert.equal(new Set(columns).size, 3, 'distinct starts remain distinct several bars later');

  // Pause/resume and BPM changes alter only transport-to-audio mapping. Instances
  // remain musical state and therefore do not need reconstruction or rebasing.
  assert.notEqual(tickToAudio(farTick, 120), tickToAudio(farTick, 73));
  assert.deepEqual(['loop', 'drum', 'draw'].map(id => getPlaybackInstance(id).id), ids);
  assert.deepEqual(['loop', 'drum', 'draw'].map(id => getPlaybackInstance(id).startTick), starts);
  assert.equal(activatePlaybackInstance('drum', 384, { quantize: true }).id, drum.id,
    'ordinary activation on a beat boundary does not rebase an active instance');
});

test('Drum and DrawGrid live edits preserve instances and affect future scheduler windows', () => {
  clearPlaybackInstancesForTests();
  const calls = [];
  const toys = new Map(['loop', 'drum', 'draw'].map(id => [id, makeToy(id, calls)]));
  ensurePlaybackInstance('loop', { active: true, startTick: 0, loopLengthTicks: 384 });
  activatePlaybackInstance('drum', 130, { quantize: true, loopLengthTicks: 384 });
  activatePlaybackInstance('draw', 250, { quantize: true, loopLengthTicks: 384 });
  const scheduler = createSequencerScheduler({ ticksPerBar: 384 });
  const poll = (currentTick, lookaheadEndTick) => scheduler.tick({
    activeToyIds: new Set(toys.keys()), getToy: id => toys.get(id), currentTick, lookaheadEndTick,
    tickToAudioTime: tick => tickToAudio(tick), audioTimeToTick: time => Math.round(time * 192),
  });

  poll(0, 500);
  const before = new Map(['drum', 'draw'].map(id => [id, {
    instanceId: getPlaybackInstance(id).id,
    startTick: getPlaybackInstance(id).startTick,
  }]));
  calls.length = 0;
  toys.get('drum').__seqRev += 1;
  toys.get('draw').__seqRev += 1;
  poll(500, 700);

  for (const id of ['drum', 'draw']) {
    assert.equal(getPlaybackInstance(id).id, before.get(id).instanceId);
    assert.equal(getPlaybackInstance(id).startTick, before.get(id).startTick);
    assert.ok(calls.filter(call => call.id === id).every(call => call.metadata.definitionRevision === 1));
    assert.ok(calls.filter(call => call.id === id).every(call => call.metadata.playbackInstanceId === before.get(id).instanceId));
  }
  assert.equal(new Set(calls.map(call => call.metadata.identity)).size, calls.length,
    'event identity stays stable and unique across scheduler polling');
});

test('retrigger and deactivate affect only the selected grid playback instance', () => {
  clearPlaybackInstancesForTests();
  const loop = ensurePlaybackInstance('loop', { active: true, startTick: 0, loopLengthTicks: 384 });
  const drum = activatePlaybackInstance('drum', 130, { quantize: true, loopLengthTicks: 384 });
  const draw = activatePlaybackInstance('draw', 250, { quantize: true, loopLengthTicks: 384 });

  const retriggered = activatePlaybackInstance('drum', 384, {
    quantize: true, retrigger: true, loopLengthTicks: 384,
  });
  assert.notEqual(retriggered.id, drum.id);
  assert.equal(retriggered.startTick, 480, 'strict next beat applies exactly on a boundary');
  assert.equal(getPlaybackInstance('loop').id, loop.id);
  assert.equal(getPlaybackInstance('draw').id, draw.id);

  deactivatePlaybackInstance('draw');
  assert.equal(getPlaybackInstance('draw').active, false);
  assert.equal(getPlaybackInstance('loop').active, true);
  assert.equal(getPlaybackInstance('drum').active, true);
});
