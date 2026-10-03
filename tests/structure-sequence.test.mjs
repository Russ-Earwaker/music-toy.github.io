import test from 'node:test';
import assert from 'node:assert/strict';
import { createStructureRuntime } from '../src/structure-runtime.js';
import { createChainSequenceAdapter } from '../src/chain-sequence.js';
import { createSequencerScheduler } from '../src/note-scheduler.js';
import { bouncerEventsInWindow } from '../src/bouncer-transport.js';
import { ripplerEventsInWindow } from '../src/ripplesynth-transport.js';
import { MAIN_TRANSPORT_ID, transportRegistry } from '../src/transport-registry.js';
import { ensureAudioContext, setBpm } from '../src/audio-core.js';
import { clearPlaybackInstancesForTests, ensurePlaybackInstance, getPlaybackInstance,
  activatePlaybackInstance } from '../src/playback-instances.js';

const state = (currentTick = 0, status = 'playing') => ({ currentTick, state: status });
const children = ids => ids.map(toyId => ({ toyId, durationTicks: 384 }));

test('A-B-C has exact half-open boundaries, no gap/overlap, and stable repeated loops', () => {
  const runtime = createStructureRuntime();
  const definition = runtime.defineSequence('abc', children(['A', 'B', 'C']));
  const instance = runtime.startSequence('abc', 130);
  assert.equal(instance.startTick, 192);
  assert.equal(instance.transportId, MAIN_TRANSPORT_ID);
  assert.equal(definition.durationTicks, 1152);
  assert.deepEqual(definition.children.map(child => child.offsetTicks), [0, 384, 768]);
  const turns = runtime.turnsInWindow('abc', 192, 192 + 1152 * 1000);
  assert.equal(turns.length, 3000);
  for (let index = 0; index < turns.length; index++) {
    assert.equal(turns[index].startTick, 192 + index * 384);
    assert.equal(turns[index].endTick, 192 + (index + 1) * 384);
    assert.equal(turns[index].toyId, ['A', 'B', 'C'][index % 3]);
  }
  assert.equal(runtime.turnsInWindow('abc', 575, 576)[0].toyId, 'A');
  assert.equal(runtime.turnsInWindow('abc', 576, 577)[0].toyId, 'B');
  assert.equal(runtime.turnsInWindow('abc', 1344, 1345)[0].toyId, 'A');
  assert.equal(runtime.turnsInWindow('abc', 0, 192).length, 0);
});

test('durations come from children, and reorder preserves anchor and committed lookahead', () => {
  const runtime = createStructureRuntime();
  runtime.defineSequence('variable', [{ toyId: 'A', durationTicks: 96 }, { toyId: 'B', durationTicks: 192 }]);
  runtime.startSequence('variable', 0, { quantize: false });
  assert.equal(runtime.getDefinition('variable').durationTicks, 288);
  assert.deepEqual(runtime.turnsInWindow('variable', 0, 576).map(turn => turn.startTick), [0, 96, 288, 384]);
  runtime.defineSequence('abc', children(['A', 'B', 'C']));
  const instance = runtime.startSequence('abc', 130);
  const before = runtime.turnsInWindow('abc', 550, 800);
  runtime.commitThrough('abc', 800);
  runtime.defineSequence('abc', children(['A', 'C', 'B']), 550);
  assert.strictEqual(runtime.getInstance('abc'), instance);
  assert.equal(instance.startTick, 192);
  assert.deepEqual(runtime.turnsInWindow('abc', 550, 800), before);
  assert.deepEqual(runtime.turnsInWindow('abc', 1344, 2496).map(turn => [turn.toyId, turn.startTick]),
    [['A', 1344], ['C', 1728], ['B', 2112]]);
});

function integrationHarness() {
  clearPlaybackInstancesForTests();
  globalThis.window = globalThis.window || {};
  window.__TOY_AUDIO_GEN = Object.create(null);
  const calls = [];
  const panels = new Map();
  const ids = ['rhythm', 'draw', 'bounce', 'ripple'];
  const types = ['loopgrid', 'drawgrid', 'bouncer', 'rippler'];
  ids.forEach((id, index) => {
    ensurePlaybackInstance(id, { startTick: 0, loopLengthTicks: 384 });
    panels.set(id, { id, __seqRev: 0, __seqPattern: {},
      dataset: { toy: types[index], steps: '8', audiotoyid: id,
        ...(index ? { prevToyId: ids[index - 1] } : {}),
        ...(index < ids.length - 1 ? { nextToyId: ids[index + 1] } : {}) },
      __sequencerSchedule(step, audioTime, metadata) { calls.push({ id, step, audioTime, ...metadata }); },
    });
  });
  const bounce = panels.get('bounce');
  bounce.__sequencerEventsInWindow = (fromTick, toTick, instance) => bouncerEventsInWindow({
    instance, fromTick, toTick, pattern: [{ note: 'C4', offsetTick: 0, blockIndex: 0 }], blocks: [{ active: true }], edgeControllers: [],
  });
  bounce.__sequencerScheduleEvent = (event, audioTime, metadata) => calls.push({ id: 'bounce', audioTime, ...metadata });
  const ripple = panels.get('ripple');
  ripple.__sequencerEventsInWindow = (fromTick, toTick, instance) => ripplerEventsInWindow({
    instance, fromTick, toTick, pattern: [new Set([0]), ...Array.from({ length: 7 }, () => new Set())],
    patternOffsets: [new Map([[0, 0]]), ...Array.from({ length: 7 }, () => new Map())], blocks: [{ active: true }],
  });
  ripple.__sequencerScheduleEvent = (event, audioTime, metadata) => calls.push({ id: 'ripple', audioTime, ...metadata });
  const standalone = ensurePlaybackInstance('standalone', { startTick: 48 });
  panels.set('standalone', { id: 'standalone', dataset: { toy: 'loopgrid', steps: '8' },
    __sequencerSchedule(step, audioTime, metadata) { calls.push({ id: 'standalone', step, audioTime, ...metadata }); } });
  const scheduler = createSequencerScheduler();
  const chainState = new Map();
  const transitions = [];
  const cancelled = [];
  const adapter = createChainSequenceAdapter({ getToy: id => panels.get(id), chainState,
    cancelToy: id => { cancelled.push(id); scheduler.clearToy(id); },
    onTurn: turn => transitions.push(turn),
  });
  adapter.sync([...panels.values()], state(0, 'stopped'));
  function poll(currentTick, lookaheadEndTick, bpm = 120) {
    const playbackTurns = adapter.turnsForLookahead(currentTick, lookaheadEndTick);
    return scheduler.tick({ activeToyIds: new Set(['standalone']), playbackTurns,
      getToy: id => panels.get(id), currentTick, lookaheadEndTick,
      tickToAudioTime: tick => tick * 60 / bpm / 96 });
  }
  return { adapter, scheduler, panels, chainState, calls, poll, transitions, cancelled, standalone };
}

test('Simple Rhythm-DrawGrid-Bouncer-Rippler schedules across boundaries exactly once and leaves standalone intact', () => {
  const h = integrationHarness();
  const sequence = h.adapter.runtime.getInstance('sequence:rhythm');
  for (let now = 0; now < 1536 * 4; now += 24) {
    h.poll(now, Math.min(now + 120, 1536 * 4));
    h.poll(now, Math.min(now + 120, 1536 * 4));
    const active = ['rhythm', 'draw', 'bounce', 'ripple'].filter(id => getPlaybackInstance(id)?.active);
    assert.equal(active.length, 1);
    assert.equal(active[0], h.chainState.get('rhythm'));
  }
  const musicalCalls = h.calls.filter(call => call.id !== 'standalone');
  assert.equal(musicalCalls.length, 18 * 4);
  assert.equal(new Set(musicalCalls.map(call => call.identity)).size, musicalCalls.length);
  for (let cycle = 0; cycle < 4; cycle++) {
    for (const [index, id] of ['rhythm', 'draw', 'bounce', 'ripple'].entries()) {
      const start = cycle * 1536 + index * 384;
      const events = musicalCalls.filter(call => call.id === id && call.eventTick >= start && call.eventTick < start + 384);
      assert.equal(events[0].eventTick, start);
      assert.ok(events.every(call => call.eventTick < start + 384));
    }
  }
  assert.strictEqual(h.adapter.runtime.getInstance('sequence:rhythm'), sequence);
  assert.strictEqual(getPlaybackInstance('standalone'), h.standalone);
  assert.equal(h.standalone.startTick, 48);
  assert.equal(h.adapter.runtime.getDefinition('sequence:standalone'), null);
});

test('future turns never replace current playback; child edits cannot rebase structure or siblings', () => {
  const h = integrationHarness();
  const sequence = h.adapter.runtime.getInstance('sequence:rhythm');
  const rhythm = getPlaybackInstance('rhythm');
  h.poll(350, 480);
  assert.strictEqual(getPlaybackInstance('rhythm'), rhythm);
  assert.notEqual(getPlaybackInstance('draw')?.active, true);
  const boundaries = h.adapter.runtime.turnsInWindow('sequence:rhythm', 0, 1536);
  for (const id of ['rhythm', 'draw', 'bounce', 'ripple']) {
    h.panels.get(id).__seqRev = 1;
    activatePlaybackInstance(id, 960, { retrigger: true });
  }
  h.adapter.sync([...h.panels.values()], state(350));
  assert.strictEqual(h.adapter.runtime.getInstance('sequence:rhythm'), sequence);
  assert.equal(sequence.startTick, 0);
  assert.deepEqual(h.adapter.runtime.turnsInWindow('sequence:rhythm', 0, 1536), boundaries);
  h.poll(384, 520);
  assert.equal(getPlaybackInstance('draw').startTick, 384);
  assert.equal(getPlaybackInstance('draw').transportId, MAIN_TRANSPORT_ID);
});

test('pause/resume and BPM changes retain structure/child IDs and structural phase', () => {
  const h = integrationHarness();
  h.poll(480, 600);
  const structure = h.adapter.runtime.getInstance('sequence:rhythm');
  const child = getPlaybackInstance('draw');
  h.adapter.sync([...h.panels.values()], state(480, 'paused'));
  h.adapter.updateCurrent(480);
  h.scheduler.resetTimeline(480, { includeBoundary: false });
  h.poll(480, 600, 73);
  assert.strictEqual(h.adapter.runtime.getInstance('sequence:rhythm'), structure);
  assert.strictEqual(getPlaybackInstance('draw'), child);
  assert.equal(child.startTick, 384);
  const debug = h.adapter.runtime.debugSnapshot(480);
  assert.equal(debug.instances[0].currentChild, 'draw');
  assert.equal(debug.instances[0].currentLocalTick, 480);
  assert.ok(Object.isFrozen(debug.instances[0]));
});

test('detaching a child clears its structure ownership and prevents committed old turns from double scheduling it', () => {
  const h = integrationHarness();
  h.poll(100, 1200);
  const sequence = h.adapter.runtime.getInstance('sequence:rhythm');
  const draw = h.panels.get('draw');
  const bounce = h.panels.get('bounce');
  h.panels.get('rhythm').dataset.nextToyId = 'bounce';
  bounce.dataset.prevToyId = 'rhythm';
  delete draw.dataset.prevToyId;
  delete draw.dataset.nextToyId;
  h.adapter.sync([...h.panels.values()], state(100));
  assert.strictEqual(h.adapter.runtime.getInstance('sequence:rhythm'), sequence);
  assert.equal(h.adapter.isManaged('draw'), false);
  assert.equal(getPlaybackInstance('draw').structureInstanceId, undefined);
  assert.equal(draw.__sequenceDefinitionId, undefined);
  assert.equal(draw.__chainTurnEndTick, undefined);
  assert.ok(h.adapter.turnsForLookahead(350, 800).every(turn => turn.toyId !== 'draw'));
  h.adapter.updateCurrent(400);
  assert.equal(h.chainState.get('rhythm'), null, 'a committed removed child becomes a rest until the next layout seam');
  assert.equal(getPlaybackInstance('draw').active, true, 'detached toy retains independent playback');
});

test('disbanding a chain removes its definition/instance and releases all children', () => {
  const h = integrationHarness();
  h.poll(350, 520);
  for (const panel of h.panels.values()) { delete panel.dataset.nextToyId; delete panel.dataset.prevToyId; }
  h.adapter.sync([...h.panels.values()], state(350));
  assert.equal(h.adapter.runtime.getDefinition('sequence:rhythm'), null);
  assert.equal(h.adapter.runtime.getInstance('sequence:rhythm'), null);
  assert.deepEqual(h.adapter.turnsForLookahead(350, 520), []);
  for (const id of ['rhythm', 'draw', 'bounce', 'ripple']) {
    assert.equal(getPlaybackInstance(id).structureInstanceId, undefined);
    assert.equal(getPlaybackInstance(id).active, true);
  }
});

test('reordering to a different visual head retains the same Sequence definition identity and performance anchor', () => {
  const h = integrationHarness();
  h.poll(100, 300);
  const structure = h.adapter.runtime.getInstance('sequence:rhythm');
  const rhythm = h.panels.get('rhythm');
  const draw = h.panels.get('draw');
  delete draw.dataset.prevToyId;
  draw.dataset.nextToyId = 'rhythm';
  rhythm.dataset.prevToyId = 'draw';
  rhythm.dataset.nextToyId = 'bounce';
  h.panels.get('bounce').dataset.prevToyId = 'rhythm';
  h.adapter.sync([...h.panels.values()], state(100));
  assert.strictEqual(h.adapter.runtime.getInstance('sequence:rhythm'), structure);
  assert.equal(structure.startTick, 0);
  assert.deepEqual(h.adapter.runtime.getDefinition('sequence:rhythm').children.map(child => child.toyId),
    ['draw', 'rhythm', 'bounce', 'ripple']);
  assert.equal(h.adapter.hasSequence('draw'), true);
  assert.equal(h.adapter.hasSequence('rhythm'), false);
  assert.equal(h.adapter.runtime.debugSnapshot(100).instances.length, 1);
});

test('deliberate head retrigger replaces only its Sequence at strict next beat on an uninterrupted transport', async () => {
  class FakeAudioContext {
    currentTime = 0; state = 'running';
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  const h = integrationHarness();
  window.AudioContext = FakeAudioContext;
  const transport = transportRegistry.get(MAIN_TRANSPORT_ID);
  const ctx = ensureAudioContext();
  await transport.play();
  ctx.currentTime = 1450 / 192;
  assert.equal(transport.currentTick, 1450);
  const before = h.adapter.runtime.getInstance('sequence:rhythm');
  const next = h.adapter.retrigger('rhythm', transport.getState());
  assert.notEqual(next.id, before.id);
  assert.equal(next.startTick, 1536);
  assert.equal(next.generation, before.generation + 1);
  assert.equal(transport.currentTick, 1450);
  assert.equal(transport.state, 'playing');
  assert.strictEqual(getPlaybackInstance('standalone'), h.standalone);
  assert.equal(getPlaybackInstance('rhythm').startTick, 1536);
  h.poll(1450, 1570);
  assert.equal(h.chainState.get('rhythm'), null);
  h.adapter.updateCurrent(1536);
  assert.equal(h.chainState.get('rhythm'), 'rhythm');
  setBpm(73);
  assert.equal(next.startTick, 1536);
  assert.equal(transport.currentTick, 1450);
  transport.pause();
  setBpm(120);
  transport.returnToStart();
});
