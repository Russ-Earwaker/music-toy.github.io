import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSequencerScheduler } from '../src/note-scheduler.js';
import {
  nextRipplerRecordingStartTick,
  quantizeRipplerOffsetTick,
  ripplerEventsInWindow,
} from '../src/ripplesynth-transport.js';
import {
  activatePlaybackInstance,
  clearPlaybackInstancesForTests,
  deactivatePlaybackInstance,
  ensurePlaybackInstance,
  getPlaybackInstance,
} from '../src/playback-instances.js';

globalThis.window = globalThis.window || {};
window.__TOY_AUDIO_GEN = Object.create(null);

test('physical Rippler hits record quantized integer tick offsets', () => {
  assert.equal(quantizeRipplerOffsetTick(131, 96, 0), 35);
  assert.equal(quantizeRipplerOffsetTick(131, 96, 2), 48);
  assert.equal(quantizeRipplerOffsetTick(137, 96, 4), 48);
  assert.equal(quantizeRipplerOffsetTick(143, 96, 4), 48,
    'small physics variance resolves to the same stored musical tick');
  assert.equal(nextRipplerRecordingStartTick(130), 384);
  assert.equal(nextRipplerRecordingStartTick(384), 768, 'full re-record starts on the next bar boundary');
});

test('recorded Rippler pattern repeats exactly once per bar without physics', () => {
  clearPlaybackInstancesForTests();
  const instance = ensurePlaybackInstance('rippler', { active: true, startTick: 192, loopLengthTicks: 384 });
  const pattern = [new Set([0]), new Set(), new Set([1]), ...Array.from({ length: 5 }, () => new Set())];
  const offsets = [new Map([[0, 24]]), new Map(), new Map([[1, 120]]), ...Array.from({ length: 5 }, () => new Map())];
  const blocks = [{ active: true }, { active: true }];
  const events = ripplerEventsInWindow({ instance, pattern, patternOffsets: offsets, blocks, fromTick: 0, toTick: 1100 });
  assert.deepEqual(events.map(event => [event.eventTick, event.blockIndex]), [
    [216, 0], [312, 1], [600, 0], [696, 1], [984, 0], [1080, 1],
  ]);
});

test('Rippler stable replay emits notes in every one of five consecutive bars', () => {
  clearPlaybackInstancesForTests();
  const instance = ensurePlaybackInstance('rippler-five-bars', { active: true, startTick: 384, loopLengthTicks: 384 });
  const pattern = [new Set([0]), ...Array.from({ length: 7 }, () => new Set())];
  const offsets = [new Map([[0, 48]]), ...Array.from({ length: 7 }, () => new Map())];
  const events = ripplerEventsInWindow({
    instance, pattern, patternOffsets: offsets, blocks: [{ active: true }],
    fromTick: 384, toTick: 384 + (5 * 384),
  });
  assert.deepEqual(events.map(event => event.eventTick), [432, 816, 1200, 1584, 1968]);
});

test('Rippler recording does not consume the first replay window and then plays five bars', () => {
  clearPlaybackInstancesForTests();
  const pattern = [new Set([0]), ...Array.from({ length: 7 }, () => new Set())];
  const offsets = [new Map([[0, 24]]), ...Array.from({ length: 7 }, () => new Map())];
  const blocks = [{ active: true }];
  let recording = true;
  const calls = [];
  const toy = { dataset: { toy: 'rippler' },
    __sequencerEventsInWindow(fromTick, toTick, instance) {
      return recording ? null : ripplerEventsInWindow({ instance, pattern, patternOffsets: offsets, blocks, fromTick, toTick });
    },
    __sequencerScheduleEvent: (_event, _time, metadata) => calls.push(metadata.eventTick),
  };
  ensurePlaybackInstance('rippler-transition', { active: true, startTick: 0, loopLengthTicks: 384 });
  const scheduler = createSequencerScheduler({ ticksPerBar: 384 });
  const poll = (from, to) => scheduler.tick({ activeToyIds: new Set(['rippler-transition']), getToy: () => toy,
    currentTick: from, lookaheadEndTick: to, tickToAudioTime: tick => tick / 192 });
  poll(0, 420);
  recording = false;
  toy.__sequencerWindowStartTick = 384;
  toy.__forceSchedulerReset = true;
  for (let bar = 1; bar <= 5; bar++) poll(bar * 384, (bar + 1) * 384);
  assert.deepEqual(calls, [408, 792, 1176, 1560, 1944]);
});

test('shared scheduler deduplicates Rippler replay and preserves ticks across tempo/edit/resume', () => {
  clearPlaybackInstancesForTests();
  const calls = [];
  const pattern = [new Set([0]), ...Array.from({ length: 7 }, () => new Set())];
  const offsets = [new Map([[0, 48]]), ...Array.from({ length: 7 }, () => new Map())];
  const blocks = [{ active: true, noteIndex: 0 }];
  const toy = {
    id: 'rippler', dataset: { toy: 'rippler', audiotoyid: 'rippler' }, __seqRev: 1, __seqPattern: {},
    __sequencerEventsInWindow(fromTick, toTick, instance) {
      return ripplerEventsInWindow({ instance, pattern, patternOffsets: offsets, blocks, fromTick, toTick });
    },
    __sequencerScheduleEvent(event, audioTime, metadata) { calls.push({ event, audioTime, metadata }); },
  };
  const instance = ensurePlaybackInstance('rippler', { active: true, startTick: 192, loopLengthTicks: 384 });
  const scheduler = createSequencerScheduler({ ticksPerBar: 384 });
  const poll = (from, to, bpm = 120) => scheduler.tick({
    activeToyIds: new Set(['rippler']), getToy: () => toy, currentTick: from, lookaheadEndTick: to,
    tickToAudioTime: tick => tick * 60 / bpm / 96,
  });
  poll(190, 700);
  poll(300, 800);
  assert.deepEqual(calls.map(call => call.metadata.eventTick), [240, 624]);
  assert.equal(new Set(calls.map(call => call.metadata.identity)).size, calls.length);
  assert.ok(calls.every(call => call.metadata.playbackInstanceId === instance.id));

  const before = { id: instance.id, startTick: instance.startTick };
  calls.length = 0;
  scheduler.resetTimeline(700, { includeBoundary: false });
  toy.__seqRev += 1;
  offsets[0].set(0, 72);
  poll(700, 1100, 73);
  assert.deepEqual(calls.map(call => call.metadata.eventTick), [1032]);
  assert.equal(getPlaybackInstance('rippler').id, before.id);
  assert.equal(getPlaybackInstance('rippler').startTick, before.startTick);
  assert.ok(calls.every(call => call.metadata.definitionRevision === 2));
});

test('Rippler playback instance supports strict activation, local deactivation and retrigger', () => {
  clearPlaybackInstancesForTests();
  const initial = ensurePlaybackInstance('rippler', { active: true, startTick: 0, loopLengthTicks: 384 });
  deactivatePlaybackInstance('rippler');
  assert.equal(getPlaybackInstance('rippler').active, false);
  const activated = activatePlaybackInstance('rippler', 130, { quantize: true, retrigger: true, loopLengthTicks: 384 });
  assert.equal(activated.startTick, 192);
  assert.notEqual(activated.id, initial.id);
  const boundary = activatePlaybackInstance('rippler', 192, { quantize: true, retrigger: true, loopLengthTicks: 384 });
  assert.equal(boundary.startTick, 288);
});

test('production Rippler keeps incremental re-record sets and has no pause phase reconstruction', () => {
  const core = readFileSync(new URL('../src/ripplesynth-core.js', import.meta.url), 'utf8');
  const scheduler = readFileSync(new URL('../src/ripplesynth-scheduler.js', import.meta.url), 'utf8');
  assert.match(core, /liveBlocks\.add\(idx\)/);
  assert.match(core, /recordOnly\.add\(idx\)/);
  assert.match(core, /pattern\[s\]\.delete\(idx\)/);
  assert.doesNotMatch(core, /__relAtPause/);
  assert.match(core, /patternOffsets\[slotIx\]\.set\(i, hasTickTransport \? offsetTick/);
  assert.match(core, /__sequencerEventsInWindow/);
  assert.match(core, /__sequencerScheduleEvent/);
  assert.match(scheduler, /if \(sharedReplay\)/);
});
