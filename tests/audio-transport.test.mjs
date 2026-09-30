import test from 'node:test';
import assert from 'node:assert/strict';

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.destination = {};
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime() {},
        cancelScheduledValues() {},
        linearRampToValueAtTime() {},
      },
      connect() {},
    };
  }
}

class FakeCustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
}

test('absolute tick transport retains position and maps AudioContext time', async () => {
  const listeners = new Map();
  const emitted = [];
  globalThis.CustomEvent = FakeCustomEvent;
  globalThis.document = {
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    dispatchEvent(event) {
      emitted.push(event);
      for (const fn of listeners.get(event.type) || []) fn(event);
      return true;
    },
  };
  globalThis.window = {
    AudioContext: FakeAudioContext,
    localStorage: { getItem() { return null; }, setItem() {} },
  };
  globalThis.localStorage = globalThis.window.localStorage;

  const core = await import(`../src/audio-core.js?transport-test=${Date.now()}`);
  const ctx = core.ensureAudioContext();

  assert.equal(core.ticksPerBeat, 96);
  assert.equal(core.beatsPerBar, 4);
  assert.equal(core.ticksPerBar, 384);

  await Promise.all([core.play(), core.play()]);
  assert.deepEqual(core.getTransportState(), {
    state: 'playing', positionTick: 0, currentTick: 0, currentBeat: 0, currentBar: 0,
    bpm: 120, ticksPerBeat: 96, beatsPerBar: 4, ticksPerBar: 384,
    mapping: { originTick: 0, originAudioTime: 0, bpm: 120 },
  });
  assert.equal(emitted.filter(event => event.type === 'transport:change' && event.detail.type === 'play').length, 1,
    'concurrent play requests produce one transition');

  ctx.currentTime = 0.25;
  assert.equal(core.getTransportState().currentTick, 48, 'mid-beat position');
  assert.equal(core.pause(), true);
  assert.equal(core.getTransportState().positionTick, 48);
  ctx.currentTime = 10;
  assert.equal(core.getTransportState().positionTick, 48, 'paused position is frozen');

  await core.play();
  assert.equal(core.getTransportState().positionTick, 48, 'resume starts at retained tick');
  ctx.currentTime = 10.5;
  assert.equal(core.getTransportState().currentTick, 144);

  core.seekTick(384 * 12 + 96 * 2 + 17);
  let info = core.getLoopInfo();
  assert.equal(info.currentTick, 4817);
  assert.equal(info.beatIndex, 50);
  assert.equal(info.barIndex, 12);
  assert.equal(info.tickInBar, 209);
  assert.equal(info.barSec, info.barLen);
  assert.equal(Object.hasOwn(info, 'col'), false);

  for (const nextBpm of [30, 73, 120, 157, 200]) {
    const before = core.getTransportState().currentTick;
    core.setBpm(nextBpm);
    assert.equal(core.getTransportState().currentTick, before, `BPM ${nextBpm} preserves tick`);
    for (const tick of [0, 95, 384, 4817, 384 * 200 + 37]) {
      assert.equal(core.audioTimeToTick(core.tickToAudioTime(tick)), tick, `round trip at BPM ${nextBpm}`);
    }
  }

  core.seekTick(9999);
  assert.equal(core.getTransportState().positionTick, 9999);
  core.returnToStart();
  assert.equal(core.getTransportState().positionTick, 0);

  core.seekTick(1000);
  core.setBpm(120);
  for (let i = 0; i < 8; i += 1) {
    const expected = 1000 + ((i + 1) * 24);
    ctx.currentTime += 0.125;
    core.pause();
    assert.equal(core.getTransportState().positionTick, expected);
    ctx.currentTime += 5;
    await core.play();
    assert.equal(core.getTransportState().positionTick, expected);
  }

  const changes = emitted.filter(event => event.type === 'transport:change').map(event => event.detail.type);
  const playEvents = emitted.filter(event => event.type === 'transport:play');
  const resumeEvents = emitted.filter(event => event.type === 'transport:resume');
  const pauseEvents = emitted.filter(event => event.type === 'transport:pause');
  assert.equal(playEvents.length, changes.filter(type => type === 'play').length);
  assert.equal(resumeEvents.length, changes.filter(type => type === 'play').length);
  assert.equal(pauseEvents.length, changes.filter(type => type === 'pause').length);
  assert.equal(core.pause(), true);
  const countAfterPause = emitted.length;
  assert.equal(core.pause(), false, 'repeated pause is not a transition');
  assert.equal(emitted.length, countAfterPause, 'no duplicate events for a no-op pause');
});
