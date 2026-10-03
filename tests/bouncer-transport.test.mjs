import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSequencerScheduler } from '../src/note-scheduler.js';
import { activatePlaybackInstance, clearPlaybackInstancesForTests, deactivatePlaybackInstance, getPlaybackInstance } from '../src/playback-instances.js';
import {
  bouncerEventsInWindow,
  getBouncerReplayCompletionTick,
  interpolateBouncerTrajectory,
  nextBouncerRecordingStartTick,
  normalizeBouncerPattern,
  normalizeBouncerTrajectory,
  quantizeBouncerOffsetTick,
  recordBouncerTrajectorySample,
} from '../src/bouncer-transport.js';

test('Bouncer records collision timing once as quantized integer ticks', () => {
  assert.equal(quantizeBouncerOffsetTick(131, 96, 0), 35);
  assert.equal(quantizeBouncerOffsetTick(131, 96, 2), 48);
  assert.equal(quantizeBouncerOffsetTick(137, 96, 4), 48);
  assert.equal(quantizeBouncerOffsetTick(479, 96, 2), 383,
    'a final-cell collision must not wrap to the launch tick');
  assert.equal(nextBouncerRecordingStartTick(384), 768);
});

test('Bouncer legacy beat offsets hydrate as tick offsets', () => {
  assert.deepEqual(normalizeBouncerPattern([{ note: 'C4', offset: 1.5, blockIndex: 2 }]), [
    { note: 'C4', offset: 1.5, offsetTick: 144, blockIndex: 2 },
  ]);
});

test('Bouncer pattern repeats once per bar and filters inactive collision sources', () => {
  clearPlaybackInstancesForTests();
  const instance = activatePlaybackInstance('bouncer', 0, { quantize: false, loopLengthTicks: 384 });
  const pattern = [
    { note: 'C4', offsetTick: 48, blockIndex: 0 },
    { note: 'D4', offsetTick: 96, edgeControllerIndex: 0 },
  ];
  const events = bouncerEventsInWindow({
    instance, pattern, blocks: [{ active: true }], edgeControllers: [{ active: false }], fromTick: 0, toTick: 900,
  });
  assert.deepEqual(events.map(event => event.eventTick), [48, 432, 816]);
  assert.ok(events.every(event => Number.isInteger(event.offsetTick)));
});

test('Bouncer replay exposes raw impact cues before quantized note events', () => {
  clearPlaybackInstancesForTests();
  const instance = activatePlaybackInstance('bouncer-cues', 0, { quantize: false, loopLengthTicks: 384 });
  const events = bouncerEventsInWindow({
    instance,
    pattern: [{ note: 'C4', impactOffsetTick: 37, offsetTick: 48, blockIndex: 0 }],
    blocks: [{ active: true }],
    fromTick: 0,
    toTick: 100,
    includeImpactCues: true,
  });
  assert.deepEqual(events.map(event => [event.eventTick, event.visualOnly || 'note']), [
    [37, 'impact'],
    [48, 'note'],
  ]);
});

test('shared scheduler gives Bouncer stable tick identities across repeated polls and tempo mapping', () => {
  clearPlaybackInstancesForTests();
  activatePlaybackInstance('bouncer', 96, { quantize: false, loopLengthTicks: 384 });
  const calls = [];
  const toy = {
    dataset: {}, __seqRev: 1,
    __sequencerEventsInWindow(fromTick, toTick, instance) {
      return bouncerEventsInWindow({ instance, pattern: [{ note: 'E4', offsetTick: 48, blockIndex: 0 }], blocks: [{ active: true }], fromTick, toTick });
    },
    __sequencerScheduleEvent(event, audioTime, metadata) { calls.push({ event, audioTime, metadata }); },
  };
  const scheduler = createSequencerScheduler({ ticksPerBar: 384 });
  const poll = bpm => scheduler.tick({
    activeToyIds: new Set(['bouncer']), getToy: () => toy, currentTick: 100, lookaheadEndTick: 700,
    tickToAudioTime: tick => tick * (60 / bpm / 96),
  });
  poll(120);
  poll(90);
  assert.deepEqual(calls.map(call => call.metadata.eventTick), [144, 528]);
  assert.equal(new Set(calls.map(call => call.metadata.identity)).size, calls.length);
});

test('Bouncer activation is strict-next-beat while pause-style retention leaves its instance unchanged', () => {
  clearPlaybackInstancesForTests();
  const first = activatePlaybackInstance('bouncer', 130, { quantize: true, loopLengthTicks: 384 });
  assert.equal(first.startTick, 192);
  assert.equal(getPlaybackInstance('bouncer'), first);
  assert.equal(getPlaybackInstance('bouncer'), first, 'a transport pause does not recreate the playback instance');
  deactivatePlaybackInstance('bouncer');
  const retriggered = activatePlaybackInstance('bouncer', 530, { quantize: true, retrigger: true, loopLengthTicks: 384 });
  assert.equal(retriggered.startTick, 576);
  assert.notEqual(retriggered.id, first.id);
});

test('Bouncer trajectory records one position per local tick and interpolates replay phase', () => {
  const samples = [];
  assert.equal(recordBouncerTrajectorySample(samples, { x: 10, y: 20, r: 7 }, 100, 96), true);
  assert.equal(recordBouncerTrajectorySample(samples, { x: 14, y: 24, r: 7 }, 100, 96), true);
  assert.equal(recordBouncerTrajectorySample(samples, { x: 30, y: 40, r: 7 }, 104, 96), true);
  assert.deepEqual(samples.map(sample => sample.offsetTick), [4, 8]);
  assert.equal(samples[0].x, 14, 'the latest physics sample owns a duplicated integer tick');
  assert.deepEqual(interpolateBouncerTrajectory(samples, 6), {
    offsetTick: 6, x: 22, y: 32, r: 7, replay: true,
  });
});

test('Bouncer trajectory sampling is limited to the learning loop and normalizes persisted samples', () => {
  const samples = [];
  assert.equal(recordBouncerTrajectorySample(samples, { x: 1, y: 2 }, 95, 96), false);
  assert.equal(recordBouncerTrajectorySample(samples, { x: 1, y: 2 }, 480, 96), false);
  assert.equal(recordBouncerTrajectorySample(samples, { x: 1, y: 2, isGhost: true }, 120, 96), false);
  assert.deepEqual(normalizeBouncerTrajectory([
    { offsetTick: 8, x: 8, y: 9, r: 7 },
    { offsetTick: 4, x: 4, y: 5, r: 7 },
  ]).map(sample => sample.offsetTick), [4, 8]);
});

test('production Bouncer bypasses physics during stable trajectory replay', () => {
  const render = readFileSync(new URL('../src/bouncer-render.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/bouncer.main.js', import.meta.url), 'utf8');
  assert.match(render, /if \(shouldRunPhysics && !replaying/);
  assert.match(render, /captureTrajectorySample\?\.\(\)/);
  assert.match(render, /if \(replaying\) advanceReplayLifecycle\?\.\(\)/);
  assert.match(main, /loopRec\.mode !== 'replay' \|\| loopRec\.isInvalid\)[\s\S]*?return null/,
    'the learning pass must not consume the first scheduler replay window');
  assert.match(main, /loopRec\.trajectory\.length === 0[\s\S]*loopRec\.trajectory\.push/,
    'recording must anchor trajectory replay at its launch seam');
});

test('Bouncer learning and replay flashes share the quantized note-time queue', () => {
  const main = readFileSync(new URL('../src/bouncer.main.js', import.meta.url), 'utf8');
  const step = readFileSync(new URL('../src/bouncer-step.js', import.meta.url), 'utf8');
  assert.match(main, /queueImpactVisual\(event, scheduledT,/,
    'the physics-learning pass must flash at its quantized note time');
  assert.match(main, /queueImpactVisual\(\{ \.\.\.event, fireTick: metadata\.eventTick/,
    'stable replay must use the same AudioContext-time visual queue');
  assert.match(main, /S\.deferImpactVisuals = true/);
  assert.match(step, /!S\.deferImpactVisuals/,
    'physics collisions must not also emit an immediate, unquantized flash');
  assert.doesNotMatch(step, /qSixteenth|DEDUPE_DIV/,
    'the collision layer must report raw impacts instead of owning quantization');
  assert.match(main, /acceptBouncerPendingHit/,
    'accepted impacts should be guarded by per-source pending state');
  assert.match(main, /includeImpactCues: true/,
    'stable replay must reproduce the pre-quantization impact glow');
});

test('Bouncer recording leaves its scheduler window open for the first replay', () => {
  clearPlaybackInstancesForTests();
  activatePlaybackInstance('learning-bouncer', 0, { quantize: false, loopLengthTicks: 384 });
  let learning = true;
  const calls = [];
  const toy = {
    dataset: { toy: 'bouncer' },
    __sequencerEventsInWindow(fromTick, toTick, instance) {
      if (learning) return null;
      return bouncerEventsInWindow({
        instance,
        pattern: [{ note: 'C4', offsetTick: 12, blockIndex: 0 }],
        blocks: [{}], fromTick, toTick,
      });
    },
    __sequencerScheduleEvent(event, _audioTime, metadata) {
      calls.push([event.note, metadata.eventTick]);
    },
  };
  const scheduler = createSequencerScheduler({ ticksPerBar: 384, lateGraceTicks: 8 });
  scheduler.tick({ activeToyIds: new Set(['learning-bouncer']), getToy: () => toy,
    currentTick: 300, lookaheadEndTick: 430, tickToAudioTime: tick => tick });
  learning = false;
  scheduler.tick({ activeToyIds: new Set(['learning-bouncer']), getToy: () => toy,
    currentTick: 384, lookaheadEndTick: 430, tickToAudioTime: tick => tick });
  assert.deepEqual(calls, [['C4', 396]]);
});

test('Bouncer replay completion is claimed once per playback turn across A-B-A loops', () => {
  const recorder = { mode: 'replay' };
  const turnA1 = { id: 'A:1', active: true, startTick: 0, loopLengthTicks: 384 };
  assert.equal(getBouncerReplayCompletionTick({ recorder, instance: turnA1, currentTick: 383,
    isChained: true, isChainActive: true }), null);
  assert.equal(getBouncerReplayCompletionTick({ recorder, instance: turnA1, currentTick: 384,
    isChained: true, isChainActive: true }), 384);
  assert.equal(getBouncerReplayCompletionTick({ recorder, instance: turnA1, currentTick: 500,
    isChained: true, isChainActive: true, completedInstanceId: 'A:1' }), null);

  const turnA2 = { id: 'A:2', active: true, startTick: 768, loopLengthTicks: 384 };
  assert.equal(getBouncerReplayCompletionTick({ recorder, instance: turnA2, currentTick: 1152,
    isChained: true, isChainActive: true, completedInstanceId: 'A:1' }), 1152,
    'a later activation of the same toy owns a new completion');
});

test('late Bouncer reactivation skips stale pattern events instead of compressing them at now', () => {
  clearPlaybackInstancesForTests();
  activatePlaybackInstance('late-bouncer', 384, { quantize: false, loopLengthTicks: 384 });
  const calls = [];
  const pattern = [
    { note: 'C4', offsetTick: 2, blockIndex: 0 },
    { note: 'D4', offsetTick: 6, blockIndex: 1 },
    { note: 'E4', offsetTick: 24, blockIndex: 2 },
  ];
  const toy = {
    dataset: { toy: 'bouncer' },
    __chainJustActivated: true,
    __chainTurnStartTick: 384,
    __chainTurnEndTick: 768,
    __sequencerEventsInWindow(fromTick, toTick, instance) {
      return bouncerEventsInWindow({ instance, pattern, blocks: [{}, {}, {}], fromTick, toTick });
    },
    __sequencerScheduleEvent(event, _audioTime, metadata) {
      calls.push([event.note, metadata.eventTick]);
    },
  };
  createSequencerScheduler({ ticksPerBar: 384, lateGraceTicks: 4 }).tick({
    activeToyIds: new Set(['late-bouncer']), getToy: () => toy,
    currentTick: 394, lookaheadEndTick: 430, tickToAudioTime: tick => tick,
  });
  assert.deepEqual(calls, [['D4', 390], ['E4', 408]],
    'only grace-window and future events retain their authored order');
});
