import test from 'node:test';
import assert from 'node:assert/strict';
import { createSequencerScheduler } from '../src/note-scheduler.js';
import {
  activatePlaybackInstance,
  clearPlaybackInstancesForTests,
  deactivatePlaybackInstance,
  ensurePlaybackInstance,
  getPlaybackInstance,
} from '../src/playback-instances.js';

globalThis.window = globalThis.window || {};
window.__TOY_AUDIO_GEN = Object.create(null);

const audioToTick = time => Math.round(time * 192);
const makeTickToAudio = ticksPerSecond => tick => tick / ticksPerSecond;

function makeGrid(id, calls) {
  return {
    id,
    dataset: { toy: 'loopgrid', steps: '8', audiotoyid: id },
    __seqRev: 0,
    __seqPattern: { steps: Array(8).fill(true), noteIndices: Array(8).fill(0) },
    __sequencerSchedule(column, audioTime, metadata) { calls.push({ id, column, audioTime, metadata }); },
  };
}

test('Loop Grid playback instances retain independent offsets through transport changes and edits', () => {
  clearPlaybackInstancesForTests();
  const calls = [];
  const a = makeGrid('A', calls);
  const b = makeGrid('B', calls);
  const toys = new Map([['A', a], ['B', b]]);
  const instanceA = ensurePlaybackInstance('A', { active: true, startTick: 0, loopLengthTicks: 384 });
  const instanceB = activatePlaybackInstance('B', 130, { quantize: true, loopLengthTicks: 384 });
  assert.equal(instanceA.startTick, 0, 'initial scene Play starts at tick zero');
  assert.equal(instanceB.startTick, 192, 'activation at tick 130 starts on the next beat');
  assert.equal(instanceB.startTick - instanceA.startTick, 192);

  const exactBoundary = activatePlaybackInstance('boundary', 192, { quantize: true, loopLengthTicks: 384 });
  assert.equal(exactBoundary.startTick, 288, 'an interaction on a beat boundary waits for the following beat');

  const scheduler = createSequencerScheduler({ ticksPerBar: 384 });
  const poll = (currentTick, lookaheadEndTick, ticksPerSecond = 192) => scheduler.tick({
    activeToyIds: new Set(['A', 'B']), getToy: id => toys.get(id), currentTick, lookaheadEndTick,
    tickToAudioTime: makeTickToAudio(ticksPerSecond), audioTimeToTick: audioToTick,
  });
  poll(0, 400);
  const at192 = calls.filter(call => call.metadata.eventTick === 192);
  assert.deepEqual(at192.map(call => [call.id, call.column]), [['A', 4], ['B', 0]]);
  assert.match(at192.find(call => call.id === 'A').metadata.playbackInstanceId, /^playback:A:/);
  assert.match(at192.find(call => call.id === 'B').metadata.playbackInstanceId, /^playback:B:/);

  calls.length = 0;
  scheduler.resetTimeline(960, { includeBoundary: false });
  poll(960, 1010);
  const afterResume = calls.filter(call => call.metadata.eventTick === 1008);
  assert.deepEqual(afterResume.map(call => [call.id, call.column]), [['A', 5], ['B', 1]]);
  assert.equal(getPlaybackInstance('B').startTick - getPlaybackInstance('A').startTick, 192,
    'pause/resume preserves the authored offset');

  calls.length = 0;
  scheduler.resetTimeline(1008, { includeBoundary: true });
  poll(1008, 1060, 96);
  assert.equal(getPlaybackInstance('A').startTick, 0);
  assert.equal(getPlaybackInstance('B').startTick, 192, 'BPM conversion cannot change start ticks');

  const aId = instanceA.id;
  a.__seqRev += 1;
  calls.length = 0;
  poll(1060, 1110, 96);
  assert.equal(getPlaybackInstance('A').id, aId);
  assert.equal(getPlaybackInstance('A').startTick, 0);
  assert.equal(getPlaybackInstance('B').startTick, 192);
  assert.ok(calls.filter(call => call.id === 'A').every(call => call.metadata.definitionRevision === 1),
    'future A events use the edited revision');
});

test('deactivation is local and retrigger creates a deliberate next-beat instance', () => {
  clearPlaybackInstancesForTests();
  const calls = [];
  const grid = makeGrid('grid', calls);
  const original = ensurePlaybackInstance('grid', { active: true, startTick: 0, loopLengthTicks: 384 });
  const scheduler = createSequencerScheduler({ ticksPerBar: 384 });
  const args = {
    activeToyIds: new Set(['grid']), getToy: () => grid,
    tickToAudioTime: makeTickToAudio(192), audioTimeToTick: audioToTick,
  };
  deactivatePlaybackInstance('grid');
  scheduler.tick({ ...args, currentTick: 300, lookaheadEndTick: 400 });
  assert.equal(calls.length, 0);
  assert.equal(getPlaybackInstance('grid').active, false);

  const retriggered = activatePlaybackInstance('grid', 350, {
    quantize: true, retrigger: true, loopLengthTicks: 384,
  });
  assert.notEqual(retriggered.id, original.id);
  assert.equal(retriggered.startTick, 384);
  scheduler.tick({ ...args, currentTick: 350, lookaheadEndTick: 440 });
  assert.deepEqual(calls.map(call => call.metadata.eventTick), [384, 432]);
  assert.ok(calls.every(call => call.metadata.playbackInstanceId === retriggered.id));
});
