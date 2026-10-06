import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createChainSequenceAdapter } from '../src/chain-sequence.js';
import { clearPlaybackInstancesForTests, ensurePlaybackInstance } from '../src/playback-instances.js';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

function harness() {
  clearPlaybackInstancesForTests();
  const panels = {
    head: { id: 'head', dataset: { toy: 'bouncer', nextToyId: 'tail' } },
    tail: { id: 'tail', dataset: { toy: 'rippler', prevToyId: 'head' } },
  };
  for (const panel of Object.values(panels)) {
    panel.closest = () => panel;
    ensurePlaybackInstance(panel.id);
  }
  const chainState = new Map();
  const cancelled = [];
  const adapter = createChainSequenceAdapter({ getToy: id => panels[id], chainState, cancelToy: id => cancelled.push(id) });
  adapter.sync(Object.values(panels), { currentTick: 0, state: 'stopped' });
  const listeners = new Map();
  const context = vm.createContext({
    document: { addEventListener: (name, fn) => listeners.set(name, fn) },
    g_sequenceChains: adapter, MAIN_TRANSPORT_ID: 'main-heartbeat',
    transportRegistry: { get: () => ({ getState: () => ({ currentTick: 1450, state: 'playing' }) }) },
    getPanelTransport: () => ({getState: () => ({currentTick:1450,state:'playing'})}),
    updateChains: () => adapter.sync(Object.values(panels), { currentTick: 1450, state: 'playing' }),
  });
  const a = source.indexOf('  // Legacy completion events');
  const b = source.indexOf('  // Add event listener for instrument propagation', a);
  assert.ok(a >= 0 && b > a);
  vm.runInContext(source.slice(a, b), context);
  return { panels, adapter, listeners, chainState, cancelled };
}

test('legacy chain:next notifications cannot activate a second child or duplicate a timeline handoff', () => {
  const h = harness();
  h.adapter.updateCurrent(384);
  const instance = h.adapter.runtime.getInstance('sequence:head');
  for (const panel of Object.values(h.panels)) {
    h.listeners.get('chain:next')({ target: panel, detail: { completedAt: 999 } });
    h.listeners.get('chain:next')({ target: panel, detail: { completedAt: 999 } });
  }
  assert.equal(h.chainState.get('head'), 'tail');
  assert.strictEqual(h.adapter.runtime.getInstance('sequence:head'), instance);
  h.adapter.updateCurrent(768);
  assert.equal(h.chainState.get('head'), 'head');
});

test('head restart creates one strict-next-beat Sequence performance; set-active edit requests leave its anchor fixed', () => {
  const h = harness();
  const before = h.adapter.runtime.getInstance('sequence:head');
  h.listeners.get('chain:restart')({ target: h.panels.head });
  const next = h.adapter.runtime.getInstance('sequence:head');
  assert.notEqual(next.id, before.id);
  assert.equal(next.startTick, 1536);
  assert.equal(next.generation, before.generation + 1);
  assert.equal(h.chainState.get('head'), null);
  h.listeners.get('chain:set-active')({ target: h.panels.tail });
  assert.strictEqual(h.adapter.runtime.getInstance('sequence:head'), next);
  assert.equal(next.startTick, 1536);
});

test('production resume and scheduler use the parent timeline, with no global-bar or child-completion authority', () => {
  assert.doesNotMatch(source, /advanceChain\(|CHAIN_PRE_ADVANCE/);
  assert.match(source, /g_sequenceChains\.turnsForLookahead\(currentTick, lookaheadEndTick, id\)/);
  assert.match(source, /playbackTurns: playbackTurns\.filter/);
  const a = source.indexOf('function restoreChainStateAfterResume');
  const b = source.indexOf('// Install listeners once', a);
  const resume = source.slice(a, b);
  assert.doesNotMatch(resume, /retrigger|g_chainState\.set\(headId, headId\)|seekTick|returnToStart/);
  assert.match(resume, /g_sequenceChains\.updateCurrent/);
});
