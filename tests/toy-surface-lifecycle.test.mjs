import test from 'node:test';
import assert from 'node:assert/strict';
import { getToyLifecycle } from '../src/baseMusicToy/toyLifecycle.js';
import { mountToySurface } from '../src/baseMusicToy/toySurface.js';

function frameClock(t) {
  let nextId = 0;
  const pending = new Map();
  t.mock.method(globalThis, 'requestAnimationFrame', callback => {
    pending.set(++nextId, callback);
    return nextId;
  });
  t.mock.method(globalThis, 'cancelAnimationFrame', id => pending.delete(id));
  return {
    pending,
    tick() {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach(callback => callback(16));
    },
  };
}
// Node has no native animation frame API.
globalThis.requestAnimationFrame = () => {};
globalThis.cancelAnimationFrame = () => {};

function panel(connected = true) {
  return Object.assign(new EventTarget(), { isConnected: connected });
}

test('removal cancels every toy loop and removes external listeners exactly once', t => {
  const clock = frameClock(t);
  const owner = panel();
  const lifecycle = getToyLifecycle(owner);
  const transport = new EventTarget();
  let calls = 0, cleanups = 0;
  lifecycle.listen(transport, 'resume', () => calls++);
  lifecycle.addCleanup(() => cleanups++);
  const draw = () => { calls++; lifecycle.requestFrame(draw); };
  lifecycle.requestFrame(draw);
  lifecycle.requestFrame(draw); // Accidental double-start must not multiply loops.
  lifecycle.requestFrame(() => calls++);
  assert.equal(clock.pending.size, 2);
  owner.dispatchEvent(new Event('toy-remove'));
  owner.dispatchEvent(new Event('toy:remove'));
  transport.dispatchEvent(new Event('resume'));
  clock.tick();
  lifecycle.requestFrame(draw);
  assert.equal(clock.pending.size, 0);
  assert.equal(calls, 0);
  assert.equal(cleanups, 1);
  assert.equal(lifecycle.disposed, true);
});

test('separate toy instances keep independent lifecycles', t => {
  const clock = frameClock(t);
  const a = panel(), b = panel();
  const first = getToyLifecycle(a), second = getToyLifecycle(b);
  assert.equal(getToyLifecycle(a), first);
  let calls = 0;
  first.requestFrame(() => calls++);
  second.requestFrame(() => calls++);
  first.dispose();
  clock.tick();
  assert.equal(calls, 1);
  assert.equal(second.disposed, false);
  second.dispose();
});

test('detached mounting waits; synchronous reparenting survives; later removal disposes', t => {
  const clock = frameClock(t);
  const owner = panel(false);
  const lifecycle = getToyLifecycle(owner);
  let calls = 0;
  const draw = () => { calls++; lifecycle.requestFrame(draw); };
  lifecycle.requestFrame(draw);
  clock.tick();
  assert.equal(calls, 0);
  owner.isConnected = true;
  clock.tick();
  owner.isConnected = false;
  owner.isConnected = true;
  clock.tick();
  assert.equal(calls, 2);
  owner.isConnected = false;
  clock.tick();
  assert.equal(lifecycle.disposed, true);
  assert.equal(clock.pending.size, 0);
});

test('cleanup registered after disposal runs immediately', () => {
  const lifecycle = getToyLifecycle(panel());
  lifecycle.dispose();
  let cleaned = false;
  lifecycle.addCleanup(() => { cleaned = true; });
  assert.equal(cleaned, true);
});

function surfaceFixture(t) {
  const host = { clientWidth: 300, clientHeight: 300, children: [], appendChild(node) { this.children.push(node); } };
  const body = { querySelector: () => null, appendChild: node => assert.equal(node, host) };
  const owner = { dataset: {}, querySelector: () => body };
  let width = 300, height = 150, writes = 0;
  const canvas = {
    dataset: {}, classList: { add() {} },
    get width() { return width; }, set width(value) { width = value; writes++; },
    get height() { return height; }, set height(value) { height = value; writes++; },
  };
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = { createElement: () => host };
  globalThis.window = { devicePixelRatio: 2 };
  t.after(() => {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  });
  return { host, owner, canvas, writes: () => writes };
}
globalThis.document = {};
globalThis.window = {};

test('surface uses layout pixels and shared DPR policy without redundant backing writes', t => {
  const { host, owner, canvas, writes } = surfaceFixture(t);
  const surface = mountToySurface(owner, canvas);
  assert.equal(owner.dataset.toyLayout, 'square');
  assert.equal(canvas.dataset.skipAutoDpr, '1');
  assert.deepEqual(host.children, [canvas]);
  let resets = 0;
  const ctx = { setTransform() { resets++; } };
  surface.resize(ctx);
  assert.equal(canvas.width, 600);
  assert.equal(canvas.height, 600);
  const initialWrites = writes();
  // Zoom changes screen geometry only; the layout dimensions stay fixed.
  host.getBoundingClientRect = () => ({ width: 150, height: 150 });
  surface.resize(ctx);
  assert.equal(writes(), initialWrites);
  assert.equal(resets, 1);
  host.clientWidth = host.clientHeight = 420;
  surface.resize(ctx);
  assert.equal(canvas.width, 840);
  assert.equal(canvas.height, 840);
  window.devicePixelRatio = 1;
  surface.resize(ctx);
  assert.equal(canvas.width, 420);
});

test('hidden surfaces retain backing size and defer resizing until visible', t => {
  const { host, owner, canvas, writes } = surfaceFixture(t);
  const surface = mountToySurface(owner, canvas);
  host.clientWidth = host.clientHeight = 0;
  assert.equal(surface.resize(null), null);
  assert.equal(writes(), 0);
  host.clientWidth = host.clientHeight = 280;
  surface.resize(null);
  assert.equal(canvas.width, 560);
});

test('surface requires shared UI to be initialized before mounting', () => {
  assert.throws(() => mountToySurface({ querySelector: () => null }, {}), /Initialize toy UI/);
});
