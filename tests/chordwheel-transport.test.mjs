import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSequencerScheduler } from '../src/note-scheduler.js';
import { createChordWheelStrumTimes } from '../src/chordwheel-timing.js';
import {
  activatePlaybackInstance,
  clearPlaybackInstancesForTests,
  deactivatePlaybackInstance,
  ensurePlaybackInstance,
  getPlaybackColumn,
  getPlaybackInstance,
  getPlaybackStepEvents,
} from '../src/playback-instances.js';

globalThis.window = globalThis.window || {};
window.__TOY_AUDIO_GEN = Object.create(null);

const atBpm = bpm => tick => tick * (60 / bpm) / 96;

function makeChordWheel(calls) {
  const toy = {
    id: 'chord',
    dataset: { toy: 'chordwheel', steps: '8', audiotoyid: 'chord' },
    __seqRev: 0,
    __seqPattern: {
      numSteps: 8,
      stepStates: [1, -1, 2, -1, 1, -1, 2, -1],
      progression: [1, 2, 3, 4, 5, 6, 7, 8],
    },
  };
  toy.__sequencerEventsInWindow = (fromTick, toTick, instance) => (
    getPlaybackStepEvents(instance, fromTick, toTick, toy.__seqPattern.numSteps)
      .filter(event => toy.__seqPattern.stepStates[event.step] !== -1)
      .map(event => ({ ...event, eventKey: `chord:${event.step}` }))
  );
  toy.__sequencerScheduleEvent = (event, audioTime, metadata) => calls.push({ event, audioTime, metadata });
  return toy;
}

test('Chord Wheel activation and local progression phase use its retained playback offset', () => {
  clearPlaybackInstancesForTests();
  const initial = ensurePlaybackInstance('initial', { active: true, startTick: 0, loopLengthTicks: 384 });
  const chord = activatePlaybackInstance('chord', 350, { quantize: true, loopLengthTicks: 384 });
  const boundary = activatePlaybackInstance('boundary', 384, { quantize: true, loopLengthTicks: 384 });
  assert.equal(initial.startTick, 0);
  assert.equal(chord.startTick, 384);
  assert.equal(boundary.startTick, 480, 'activation exactly on a beat uses the following beat');
  assert.deepEqual(getPlaybackStepEvents(chord, 384, 530, 8), [
    { eventTick: 384, step: 0 }, { eventTick: 432, step: 1 },
    { eventTick: 480, step: 2 }, { eventTick: 528, step: 3 },
  ]);
  assert.equal(getPlaybackColumn(chord, 384 * 6 + 432, 8), 1,
    'phase remains relative to Chord Wheel start several bars later');
});

test('shared scheduler emits stable Chord Wheel events without RAF or overlap duplicates', () => {
  clearPlaybackInstancesForTests();
  const calls = [];
  const toy = makeChordWheel(calls);
  const instance = activatePlaybackInstance('chord', 350, { quantize: true, loopLengthTicks: 384 });
  const scheduler = createSequencerScheduler({ ticksPerBar: 384 });
  const poll = (currentTick, lookaheadEndTick, bpm = 120) => scheduler.tick({
    activeToyIds: new Set(['chord']), getToy: () => toy, currentTick, lookaheadEndTick,
    tickToAudioTime: atBpm(bpm), audioTimeToTick: time => Math.round(time * 192),
  });
  poll(350, 590);
  poll(400, 650);
  assert.deepEqual(calls.map(call => [call.metadata.eventTick, call.event.step]), [
    [384, 0], [480, 2], [576, 4],
  ]);
  assert.equal(new Set(calls.map(call => call.metadata.identity)).size, calls.length);
  assert.ok(calls.every(call => call.metadata.playbackInstanceId === instance.id));

  const id = instance.id;
  const startTick = instance.startTick;
  calls.length = 0;
  scheduler.resetTimeline(600, { includeBoundary: false });
  poll(600, 780);
  assert.ok(calls.every(call => call.metadata.eventTick > 600), 'resume does not force step zero or retrigger the boundary');
  assert.equal(getPlaybackInstance('chord').id, id);
  assert.equal(getPlaybackInstance('chord').startTick, startTick);

  calls.length = 0;
  toy.__seqRev += 1;
  toy.__seqPattern = { ...toy.__seqPattern, stepStates: [-1, 1, -1, 2, -1, 1, -1, 2] };
  poll(780, 970, 73);
  assert.equal(getPlaybackInstance('chord').id, id);
  assert.equal(getPlaybackInstance('chord').startTick, startTick);
  assert.ok(calls.every(call => call.metadata.definitionRevision === 1));
  assert.ok(calls.every(call => [1, 3, 5, 7].includes(call.event.step)));
});

test('four migrated toy offsets survive tempo mapping, deactivation and Chord Wheel retrigger', () => {
  clearPlaybackInstancesForTests();
  const starts = [
    ensurePlaybackInstance('loop', { active: true, startTick: 0, loopLengthTicks: 384 }),
    ensurePlaybackInstance('drum', { active: true, startTick: 192, loopLengthTicks: 384 }),
    ensurePlaybackInstance('draw', { active: true, startTick: 288, loopLengthTicks: 384 }),
    activatePlaybackInstance('chord', 350, { quantize: true, loopLengthTicks: 384 }),
  ];
  assert.deepEqual(starts.map(instance => instance.startTick), [0, 192, 288, 384]);
  const ids = starts.map(instance => instance.id);
  const farTick = 384 * 12 + 530;
  assert.notEqual(atBpm(120)(farTick), atBpm(73)(farTick));
  assert.deepEqual(['loop', 'drum', 'draw', 'chord'].map(id => getPlaybackInstance(id).id), ids);
  assert.deepEqual(['loop', 'drum', 'draw', 'chord'].map(id => getPlaybackInstance(id).startTick), [0, 192, 288, 384]);

  deactivatePlaybackInstance('chord');
  assert.equal(getPlaybackInstance('chord').active, false);
  assert.ok(['loop', 'drum', 'draw'].every(id => getPlaybackInstance(id).active));
  const retriggered = activatePlaybackInstance('chord', 960, { quantize: true, retrigger: true, loopLengthTicks: 384 });
  assert.equal(retriggered.startTick, 1056);
  assert.notEqual(retriggered.id, ids[3]);
});

test('strummed notes remain small AudioContext offsets from one authoritative event time', () => {
  const times = createChordWheelStrumTimes(12.5, 6, { sweep: 0.065, jitter: 0.003, random: () => 0.5 });
  assert.deepEqual(times, [12.5, 12.513, 12.526, 12.539, 12.552, 12.565]);
  assert.ok(times.every(time => time >= 12.5 && time <= 12.565));
});

test('Chord Wheel RAF is visual-only and derives phase from transport/playback state', () => {
  const source = readFileSync(new URL('../src/chordwheel.js', import.meta.url), 'utf8');
  const drawStart = source.indexOf('  function draw(frameTime)');
  const drawEnd = source.indexOf('  function dbToGain', drawStart);
  const drawBody = source.slice(drawStart, drawEnd);
  assert.match(drawBody, /getPlaybackLocalTick\(playbackInstance, transportTick\)/);
  assert.doesNotMatch(drawBody, /scheduleStrum\s*\(/);
  assert.doesNotMatch(source, /lastAudioStep/);
  assert.match(source, /__sequencerEventsInWindow/);
  assert.match(source, /__sequencerScheduleEvent/);
});
