import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the production launch, bar-transition and replay code without a
// browser/audio device. Collision events are supplied at the recorder boundary.
const main = readFileSync(new URL('../src/bouncer.main.js', import.meta.url), 'utf8');
function section(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing production section: ${start}`);
  return source.slice(a, b);
}
const launchCode = section(main, '  function spawnBallFrom(', 'function setNextLaunchAt(');
const recorderCode = section(main, '  function stateSignature(', '  // Spawn debounce');

function harness() {
  const played = [];
  const clock = { currentTime: 0.25 };
  const recorder = { mode: 'record', pattern: [], signature: '', seen: new Set() };
  const context = vm.createContext({
    console, window: {}, DBG_RESPAWN: () => false,
    toyId: 'bouncer-test',
    panel: { id: 'bouncer-test', dataset: {}, dispatchEvent() {} }, blocks: [], edgeControllers: [],
    visQ: { loopRec: recorder }, lastLaunch: null, ball: null, nextLaunchAt: null,
    ensureAudioContext: () => clock, isRunning: () => true,
    getLoopInfo: () => ({ now: clock.currentTime, loopStartTime: 0, barLen: 2 }),
    getTransportState: () => ({ currentTick: Math.round(clock.currentTime * 192) }),
    audioTimeToTick: value => Math.round(value * 192),
    tickToAudioTime: tick => tick / 192,
    activatePlaybackInstance: (_id, tick) => ({ startTick: tick }),
    getPlaybackInstance: () => ({ startTick: 0 }),
    replayVisualEvents: { clear() {} },
    clearAllPendingHits() {},
    bumpToyAudioGen() {},
    nextBouncerRecordingStartTick: tick => (Math.floor(tick / 384) + 1) * 384,
    TICKS_PER_BAR: 384, TICKS_PER_BEAT: 96,
    ballR: () => 7, BOUNCER_BARS_PER_LIFE: 1, fx: {},
    shouldRunPhysics: true, isChained: false,
  });
  context.S = {
    visQ: context.visQ, getLoopInfo: context.getLoopInfo, instrument: 'test',
    getQuantDiv: () => 2,
    triggerInstrumentRaw: (instrument, note, when) => played.push({ note, when }),
  };
  vm.runInContext(`${recorderCode}\n${launchCode}`, context);
  return { context, clock, recorder, played };
}

test('successive manual launches retain the recorder object and discard the prior pattern', () => {
  const { context, clock, recorder } = harness();
  const sharedRecorder = recorder;
  for (const [index, note] of ['C4', 'E4', 'G4'].entries()) {
    const launchAt = index * 6 + 0.25;
    clock.currentTime = launchAt;
    context.spawnBallFrom({ x: 40 + index * 60, y: 90, vx: 120, vy: -80 });
    assert.equal(context.visQ.loopRec, sharedRecorder, 'keep shared recorder references valid');
    assert.equal(recorder.mode, 'record');
    assert.equal(recorder.pattern.length, 0, 'discard the previous launch pattern');
    context.onNewBar(context.getLoopInfo(), 0);
    recorder.pattern.push({ note, offsetTick: 96 });
    clock.currentTime = launchAt + 2;
    context.onNewBar(context.getLoopInfo(), 1);
    assert.equal(recorder.mode, 'replay');
    assert.equal(recorder.pattern[0].offsetTick, 96);
  }
});

test('automatic respawn preserves the recorded pattern and replay state', () => {
  const { context, recorder } = harness();
  recorder.mode = 'replay';
  recorder.pattern.push({ note: 'D4', offset: 0.5 });
  const pattern = recorder.pattern;
  const state = {};
  context.spawnBallFrom({ x: 30, y: 40, vx: 50, vy: 60 }, { isRespawn: true }, state);
  assert.equal(recorder.mode, 'replay');
  assert.equal(recorder.pattern, pattern);
  assert.equal(pattern.length, 1);
  assert.equal(state.nextLaunchAt, 2.25);
});

test('chain launches retain the exact handoff time despite a late frame', () => {
  const { context, clock, recorder } = harness();
  clock.currentTime = 2.29;
  const ball = context.spawnBallFrom({ x: 30, y: 40, vx: 50, vy: 60 }, { startAt: 2.25 });
  assert.equal(ball.spawnTime, 2.25);
  assert.equal(ball.flightEnd, 4.25);
  assert.equal(recorder.anchorStartTime, 2.25);
  clock.currentTime = 4.31;
  const next = context.spawnBallFrom({ x: 30, y: 40, vx: 50, vy: 60 }, { startAt: ball.flightEnd });
  assert.equal(next.flightEnd, 6.25, 'frame delays must not accumulate in the chain');
});

test('a stopped launch uses retained transport tick and captures the new launch signature', () => {
  const { context, clock, recorder } = harness();
  clock.currentTime = 42;
  context.isRunning = () => false;
  context.getTransportState = () => ({ currentTick: 0 });
  let activatedAt = null;
  context.activatePlaybackInstance = (_id, tick) => {
    activatedAt = tick;
    return { startTick: tick };
  };
  context.spawnBallFrom({ x: 40, y: 90, vx: 120, vy: -80 });
  assert.equal(activatedAt, 0, 'AudioContext wall time must not move stopped musical time');
  assert.equal(recorder.recordingStartTick, 0);
  assert.equal(recorder.signature, context.stateSignature(), 'the authored launch must not invalidate itself');
  assert.equal(recorder.trajectory[0].offsetTick, 0);
});

test('Bouncer records the complete first local bar before entering replay', () => {
  const { context, recorder } = harness();
  context.spawnBallFrom({ x: 40, y: 90, vx: 120, vy: -80 });
  recorder.trajectory.push({ offsetTick: 4, x: 44, y: 86, r: 7 });
  context.onNewBar(context.getLoopInfo(), 0);
  assert.equal(recorder.mode, 'record', 'local bar zero is the learning pass, not its completion');
  recorder.pattern.push({ note: 'C4', offsetTick: 96 });
  context.onNewBar(context.getLoopInfo(), 1);
  assert.equal(recorder.mode, 'replay');
});

test('a chained Bouncer hands off after learning instead of replaying its first turn twice', () => {
  const { context, recorder } = harness();
  const handoffs = [];
  context.CustomEvent = class {
    constructor(type, options) { this.type = type; this.detail = options?.detail; }
  };
  context.panel.dataset.nextToyId = 'bouncer-b';
  context.panel.dataset.chainActive = 'true';
  context.panel.dispatchEvent = event => handoffs.push(event);
  context.spawnBallFrom({ x: 40, y: 90, vx: 120, vy: -80 });
  recorder.trajectory.push({ offsetTick: 4, x: 44, y: 86, r: 7 });
  recorder.pattern.push({ note: 'C4', offsetTick: 96 });
  context.onNewBar(context.getLoopInfo(), 0);
  assert.equal(handoffs.filter(event => event.type === 'chain:next').length, 0);
  context.onNewBar(context.getLoopInfo(), 1);
  const nextEvents = handoffs.filter(event => event.type === 'chain:next');
  assert.equal(nextEvents.length, 1);
  assert.equal(nextEvents[0].detail.completedAt, 2.25);
});

test('Bouncer bar transitions are disabled while transport is stopped', () => {
  const render = readFileSync(new URL('../src/bouncer-render.js', import.meta.url), 'utf8');
  assert.match(render, /if \(isRunning\(\) && S && typeof S\.getLoopInfo/);
});
