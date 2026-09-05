import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
test('mixed toy chains carry completion timestamps forward, including loop back to the head', () => {
  const panels = {
    head: { id: 'head', dataset: { toy: 'bouncer', nextToyId: 'tail' } },
    tail: { id: 'tail', dataset: { toy: 'rippler', prevToyId: 'head' } },
  };
  for (const panel of Object.values(panels)) panel.closest = () => panel;
  const listeners = new Map();
  const context = vm.createContext({
    g_chainState: new Map([['head', 'head']]),
    document: {
      getElementById: id => panels[id],
      addEventListener: (name, fn) => listeners.set(name, fn),
    },
    findChainHead: () => panels.head, triggerConnectorPulse() {},
  });
  const a = source.indexOf('function advanceChain(');
  const b = source.indexOf('    // Only reset/cancel scheduling', a);
  const c = source.indexOf("  document.addEventListener('chain:next'");
  const d = source.indexOf('  // Add event listener for toys to request', c);
  assert.ok(a >= 0 && b > a && c >= 0 && d > c);
  vm.runInContext(source.slice(a, b) + '\n}\n' + source.slice(c, d), context);
  const next = listeners.get('chain:next');
  next({ target: panels.head, detail: { completedAt: 2.173 } });
  assert.equal(context.g_chainState.get('head'), 'tail');
  assert.equal(panels.tail.__chainStartAt, 2.173);
  next({ target: panels.head, detail: { completedAt: 99 } });
  assert.equal(panels.tail.__chainStartAt, 2.173, 'ignore completion from an inactive toy');
  next({ target: panels.tail, detail: { completedAt: 4.173 } });
  assert.equal(context.g_chainState.get('head'), 'head');
  assert.equal(panels.head.__chainStartAt, 4.173);
});

test('global bar wraps leave self-timed turns alone, including empty Ripplers', () => {
  const panels = {
    b: { dataset: { toy: 'bouncer' } },
    r: { dataset: { toy: 'rippler' } },
    grid: { dataset: { toy: 'loopgrid' } },
  };
  const advanced = [];
  const context = vm.createContext({
    info: { phase01: 0.01 }, g_lastAudioPhase01: 0.99,
    g_chainState: new Map([['b', 'b'], ['r', 'r'], ['grid', 'grid']]),
    document: { getElementById: id => panels[id] },
    advanceChain: id => advanced.push(id),
  });
  const a = source.indexOf('    // Advance chains on bar wrap inside the audio tick');
  const b = source.indexOf('    // Active toys are', a);
  vm.runInContext(source.slice(a, b), context);
  assert.deepEqual(advanced, ['grid']);
});

test('restarting the head stops every turn and cancels audio before resuming the head', () => {
  const stopped = [], cancelled = [], listeners = new Map();
  const panels = {
    head: { id: 'head', dataset: { nextToyId: 'tail', chainActive: 'false' } },
    tail: { id: 'tail', dataset: { prevToyId: 'head', chainActive: 'true' } },
  };
  for (const panel of Object.values(panels)) {
    panel.closest = () => panel;
    panel.__chainStartAt = 12;
    panel.dispatchEvent = e => stopped.push([panel.id, e.type]);
  }
  const context = vm.createContext({
    document: { getElementById: id => panels[id], addEventListener: (name, fn) => listeners.set(name, fn) },
    CustomEvent: class { constructor(type) { this.type = type; } },
    g_chainState: new Map([['head', 'tail']]),
    cancelScheduledToySources: id => cancelled.push(id), bumpToyAudioGen() {},
  });
  const a = source.indexOf("  document.addEventListener('chain:restart'");
  const b = source.indexOf('  // Add event listener for toys to request', a);
  vm.runInContext(source.slice(a, b), context);
  listeners.get('chain:restart')({ target: panels.head });
  assert.deepEqual(stopped, [['head', 'chain:stop'], ['tail', 'chain:stop']]);
  assert.deepEqual(cancelled, ['head', 'tail']);
  assert.equal(context.g_chainState.get('head'), 'head');
  assert.equal(panels.head.dataset.chainActive, 'true');
  assert.equal(panels.tail.dataset.chainActive, 'false');
  assert.equal(panels.tail.__chainStartAt, undefined);
});
