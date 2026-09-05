import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the production launch, bar-transition and replay code without a
// browser/audio device. Collision events are supplied at the recorder boundary.
const main = readFileSync(new URL('../src/bouncer.main.js', import.meta.url), 'utf8');
const render = readFileSync(new URL('../src/bouncer-render.js', import.meta.url), 'utf8');
function section(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing production section: ${start}`);
  return source.slice(a, b);
}
const launchCode = section(main, '  function spawnBallFrom(', 'function setNextLaunchAt(');
const recorderCode = section(main, '  function stateSignature(', '  // Spawn debounce');
const replayCode = section(render, '        try {\n            const lr = S.visQ', '        // After the physics step');

function harness() {
  const played = [];
  const clock = { currentTime: 0.25 };
  const recorder = { mode: 'record', pattern: [], signature: '', seen: new Set() };
  const context = vm.createContext({
    console, window: {}, DBG_RESPAWN: () => false,
    panel: { dataset: {} }, blocks: [],
    visQ: { loopRec: recorder }, lastLaunch: null, ball: null, nextLaunchAt: null,
    ensureAudioContext: () => clock, isRunning: () => true,
    getLoopInfo: () => ({ now: clock.currentTime, loopStartTime: 0, barLen: 2 }),
    ballR: () => 7, BOUNCER_BARS_PER_LIFE: 1, fx: {},
    shouldRunPhysics: true, isChained: false,
  });
  context.S = {
    visQ: context.visQ, getLoopInfo: context.getLoopInfo, instrument: 'test',
    getQuantDiv: () => 2,
    triggerInstrumentRaw: (instrument, note, when) => played.push({ note, when }),
  };
  vm.runInContext(`${recorderCode}\n${launchCode}\nfunction replay() { ${replayCode} }`, context);
  return { context, clock, recorder, played };
}

test('successive launches record new notes and replay them for multiple bars', () => {
  const { context, clock, recorder, played } = harness();
  const sharedRecorder = recorder;
  for (const [index, note] of ['C4', 'E4', 'G4'].entries()) {
    const launchAt = index * 6 + 0.25;
    clock.currentTime = launchAt;
    context.spawnBallFrom({ x: 40 + index * 60, y: 90, vx: 120, vy: -80 });
    assert.equal(context.visQ.loopRec, sharedRecorder, 'keep shared recorder references valid');
    assert.equal(recorder.mode, 'record');
    assert.equal(recorder.pattern.length, 0, 'discard the previous launch pattern');
    context.onNewBar(context.getLoopInfo(), 0);
    recorder.pattern.push({ note, offset: 0.5 });
    for (const bar of [1, 2]) {
      clock.currentTime = launchAt + bar * 2;
      context.onNewBar(context.getLoopInfo(), bar);
      clock.currentTime += 0.25; // Half a beat after this launch's local bar start.
      const before = played.length;
      context.replay();
      context.replay();
      assert.equal(played.length, before + 1, `launch ${index + 1}, repeat ${bar} must sound once`);
      assert.equal(played.at(-1).note, note);
      assert.equal(played.at(-1).when, clock.currentTime);
    }
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
