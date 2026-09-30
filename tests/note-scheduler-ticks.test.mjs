import test from 'node:test';
import assert from 'node:assert/strict';
import { createSequencerScheduler } from '../src/note-scheduler.js';
import { ensurePlaybackInstance } from '../src/playback-instances.js';

globalThis.window = globalThis.window || {};
window.__TOY_AUDIO_GEN = Object.create(null);

function makeToy(id, calls, type = 'legacy-grid') {
  return {
    id,
    dataset: { steps: '8', toy: type, audiotoyid: id },
    __seqRev: 3,
    __seqPattern: { instrument: type },
    __sequencerSchedule(column, audioTime, metadata) {
      calls.push({ id, column, audioTime, metadata });
    },
  };
}

const tickToAudioAt120 = tick => tick / 192;
const audioToTickAt120 = time => Math.round(time * 192);

test('scheduler uses absolute half-open tick windows without overlap duplicates', () => {
  const calls = [];
  const toy = makeToy('grid', calls);
  const scheduler = createSequencerScheduler({ ticksPerBar: 384 });
  const common = {
    activeToyIds: new Set(['grid']), getToy: () => toy,
    tickToAudioTime: tickToAudioAt120, audioTimeToTick: audioToTickAt120,
  };

  scheduler.tick({ ...common, currentTick: 1000, lookaheadEndTick: 1200 });
  assert.deepEqual(calls.map(call => call.metadata.eventTick), [1008, 1056, 1104, 1152]);
  scheduler.tick({ ...common, currentTick: 1050, lookaheadEndTick: 1250 });
  assert.deepEqual(calls.map(call => call.metadata.eventTick), [1008, 1056, 1104, 1152, 1200, 1248]);
  assert.equal(new Set(calls.map(call => call.metadata.identity)).size, calls.length);
  assert.equal(scheduler.getDebugState('grid').scheduledUntilTick, 1250);
});

test('pause/resume excludes the exact resume boundary, while seek includes its destination', () => {
  const calls = [];
  const toy = makeToy('grid', calls);
  const scheduler = createSequencerScheduler({ ticksPerBar: 384 });
  const args = {
    activeToyIds: new Set(['grid']), getToy: () => toy,
    tickToAudioTime: tickToAudioAt120, audioTimeToTick: audioToTickAt120,
  };
  scheduler.tick({ ...args, currentTick: 1100, lookaheadEndTick: 1180 });
  assert.deepEqual(calls.map(c => c.metadata.eventTick), [1104, 1152]);

  calls.length = 0;
  scheduler.resetTimeline(1152, { includeBoundary: false });
  scheduler.tick({ ...args, currentTick: 1152, lookaheadEndTick: 1210 });
  assert.deepEqual(calls.map(c => c.metadata.eventTick), [1200]);

  calls.length = 0;
  scheduler.resetTimeline(1152, { includeBoundary: true });
  scheduler.tick({ ...args, currentTick: 1152, lookaheadEndTick: 1210 });
  assert.deepEqual(calls.map(c => c.metadata.eventTick), [1152, 1200]);

  calls.length = 0;
  scheduler.resetTimeline(4800, { includeBoundary: true });
  scheduler.tick({ ...args, currentTick: 4800, lookaheadEndTick: 4860 });
  assert.deepEqual(calls.map(c => c.metadata.eventTick), [4800, 4848], 'forward seek');
  calls.length = 0;
  scheduler.resetTimeline(0, { includeBoundary: true });
  scheduler.tick({ ...args, currentTick: 0, lookaheadEndTick: 60 });
  assert.deepEqual(calls.map(c => c.metadata.eventTick), [0, 48], 'backward seek / return to start');
});

test('late polls skip old backlog and recover only explicit grace ticks', () => {
  const calls = [];
  const toy = makeToy('grid', calls);
  const scheduler = createSequencerScheduler({ ticksPerBar: 384, lateGraceTicks: 60 });
  const args = {
    activeToyIds: new Set(['grid']), getToy: () => toy,
    tickToAudioTime: tickToAudioAt120, audioTimeToTick: audioToTickAt120,
  };
  scheduler.tick({ ...args, currentTick: 900, lookaheadEndTick: 1000 });
  calls.length = 0;
  scheduler.tick({ ...args, currentTick: 1200, lookaheadEndTick: 1300 });
  assert.deepEqual(calls.map(c => c.metadata.eventTick), [1152, 1200, 1248, 1296]);
  assert.equal(calls[0].metadata.late, true, 'only the explicit grace-range event is recovered late');
  assert.equal(calls[1].metadata.late, false, 'event on current tick is not shifted or marked late');
});

test('event identity is tick based and BPM affects only final audio conversion', () => {
  const calls = [];
  const toy = makeToy('grid', calls);
  const scheduler = createSequencerScheduler({ ticksPerBar: 384 });
  const base = { activeToyIds: new Set(['grid']), getToy: () => toy, audioTimeToTick: audioToTickAt120 };
  scheduler.tick({ ...base, currentTick: 4800, lookaheadEndTick: 4860, tickToAudioTime: tick => tick / 192 });
  const first = calls.map(c => ({ tick: c.metadata.eventTick, identity: c.metadata.identity, time: c.audioTime }));
  calls.length = 0;
  scheduler.resetTimeline(4800, { includeBoundary: true });
  scheduler.tick({ ...base, currentTick: 4800, lookaheadEndTick: 4860, tickToAudioTime: tick => tick / 96 });
  assert.deepEqual(calls.map(c => c.metadata.eventTick), first.map(e => e.tick));
  assert.deepEqual(calls.map(c => c.metadata.identity), first.map(e => e.identity));
  assert.notDeepEqual(calls.map(c => c.audioTime), first.map(e => e.time));
});

test('Loop Grid, Drum Grid and DrawGrid retain callback compatibility and metadata', () => {
  const calls = [];
  const toys = new Map([
    ['loop', makeToy('loop', calls, 'loopgrid')],
    ['drum', makeToy('drum', calls, 'loopgrid-drum')],
    ['draw', makeToy('draw', calls, 'drawgrid')],
  ]);
  for (const id of toys.keys()) {
    ensurePlaybackInstance(id, { active: true, startTick: 0, loopLengthTicks: 384 });
  }
  const scheduler = createSequencerScheduler({ ticksPerBar: 384 });
  scheduler.tick({
    activeToyIds: new Set(toys.keys()), getToy: id => toys.get(id),
    currentTick: 0, lookaheadEndTick: 49,
    tickToAudioTime: tickToAudioAt120, audioTimeToTick: audioToTickAt120,
  });
  assert.deepEqual(calls.map(c => c.id).sort(), ['draw', 'draw', 'drum', 'drum', 'loop', 'loop']);
  for (const call of calls) {
    assert.equal(typeof call.column, 'number');
    assert.equal(typeof call.audioTime, 'number');
    assert.match(call.metadata.playbackInstanceId, new RegExp(`^playback:${call.id}:`));
    assert.match(call.metadata.eventKey, /^column:/);
    assert.equal(call.metadata.definitionRevision, 3);
    assert.equal(call.metadata.generation, 0);
  }
});

test('fresh migrated grids retain their exact first column when the first poll is slightly late', () => {
  const calls = [];
  const toys = new Map([
    ['loop-first', makeToy('loop-first', calls, 'loopgrid')],
    ['draw-first', makeToy('draw-first', calls, 'drawgrid')],
  ]);
  for (const id of toys.keys()) ensurePlaybackInstance(id, { active: true, startTick: 1200, loopLengthTicks: 384 });
  const scheduler = createSequencerScheduler({ ticksPerBar: 384 });
  scheduler.tick({
    activeToyIds: new Set(toys.keys()), getToy: id => toys.get(id),
    currentTick: 1202, lookaheadEndTick: 1240,
    tickToAudioTime: tickToAudioAt120, audioTimeToTick: audioToTickAt120,
  });
  assert.deepEqual(calls.map(call => [call.id, call.column, call.metadata.eventTick]).sort(), [
    ['draw-first', 0, 1200],
    ['loop-first', 0, 1200],
  ]);
  assert.ok(calls.every(call => call.metadata.late), 'the boundary is preserved rather than shifted');
});
