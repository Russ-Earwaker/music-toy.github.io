import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionModel, TOY_PORTS, HEARTBEAT_PORTS } from '../src/connections.js';
import { createConnectionAdapter } from '../src/connection-adapter.js';
import { createChainSequenceAdapter } from '../src/chain-sequence.js';
import { ensurePlaybackInstance, getPlaybackInstance, clearPlaybackInstancesForTests } from '../src/playback-instances.js';
import { connectionCurve, curvePath, curvePoint, projectConnectionPoint } from '../src/connection-geometry.js';
import { MAIN_TRANSPORT_ID } from '../src/transport-registry.js';

const point = (objectId, portId) => ({ objectId, portId });
const input = id => point(id, 'input'), output = id => point(id, 'output');
function modelWithToys(...ids) {
  const model = createConnectionModel();
  for (const id of ids) model.registerObject(id);
  model.registerObject(MAIN_TRANSPORT_ID, { ports: HEARTBEAT_PORTS, transportId: MAIN_TRANSPORT_ID });
  return model;
}
const link = (m, a, b) => m.connect('sequence', output(a), input(b));

test('output to input and input to output normalize to the same directional connection', () => {
  for (const reverse of [false, true]) {
    const model = modelWithToys('A', 'B');
    assert.equal(model.beginDrag(reverse ? input('B') : output('A')), true);
    const result = model.drop(reverse ? output('A') : input('B'));
    assert.equal(result.ok, true);
    assert.deepEqual(result.connection.from, output('A'));
    assert.deepEqual(result.connection.to, input('B'));
    assert.equal(result.connection.kind, 'sequence');
    assert.equal(Object.isFrozen(result.connection), true);
    assert.equal(Object.isFrozen(result.connection.from), true);
  }
});

test('dragging D input to C output joins A-B-C and D-E without replacing any link', () => {
  const m = modelWithToys('A', 'B', 'C', 'D', 'E');
  for (const [a, b] of [['A','B'], ['B','C'], ['D','E']]) assert.equal(link(m, a, b).ok, true);
  m.beginDrag(input('D'));
  assert.equal(m.preview(output('C')).ok, true);
  assert.equal(m.drop(output('C')).ok, true);
  assert.deepEqual(m.list().map(c => [c.from.objectId, c.to.objectId]).sort(), [['A','B'],['B','C'],['C','D'],['D','E']]);
});

test('either connected endpoint can be pulled away and reattached with the same connection identity', () => {
  for (const end of ['from', 'to']) {
    const m = modelWithToys('A', 'B', 'C');
    const original = link(m, 'A', 'B').connection;
    assert.equal(m.beginDrag(original[end], { connectionId: original.id, end }), true);
    assert.equal(m.getEditing().fixed.objectId, end === 'from' ? 'B' : 'A');
    assert.strictEqual(m.get(original.id), original, 'original survives until an accepted drop');
    const result = m.drop(end === 'from' ? output('C') : input('C'));
    assert.equal(result.connection.id, original.id);
    assert.equal(m.list().length, 1);
    assert.equal(result.connection[end].objectId, 'C');
  }
});

test('dropping a detached endpoint into empty space removes its logical connection; new empty drags create nothing', () => {
  const m = modelWithToys('A', 'B');
  const c = link(m, 'A', 'B').connection;
  m.beginDrag(c.to, { connectionId: c.id, end: 'to' });
  assert.equal(m.drop(null).deleted, true);
  assert.equal(m.get(c.id), null);
  assert.equal(m.getEditing(), null);
  m.beginDrag(output('A')); m.drop(null);
  assert.equal(m.list().length, 0);
});

test('invalid direction, kind, missing ports, self edges and Sequence cycles are rejected', () => {
  const m = modelWithToys('A', 'B', 'C');
  assert.equal(m.connect('sequence', output('A'), output('B')).reason, 'invalid-direction');
  assert.equal(m.connect('sequence', input('A'), input('B')).reason, 'invalid-direction');
  assert.equal(m.connect('transport', output('A'), input('B')).reason, 'invalid-kind');
  assert.equal(m.connect('sequence', output(MAIN_TRANSPORT_ID), input('B')).reason, 'invalid-kind');
  assert.equal(m.connect('sequence', output('missing'), input('B')).reason, 'missing-port');
  assert.equal(link(m, 'A', 'A').reason, 'self-connection');
  link(m, 'A', 'B'); link(m, 'B', 'C');
  assert.equal(link(m, 'C', 'A').reason, 'cycle');
  assert.equal(m.list().length, 2);
});

test('occupied normal output centrally requests promotion and never silently replaces a branch', () => {
  const m = modelWithToys('A', 'B', 'C');
  const original = link(m, 'A', 'B').connection;
  const events = []; m.subscribe(e => events.push(e));
  m.beginDrag(input('C'));
  assert.equal(m.preview(output('A')).reason, 'requires-promotion');
  assert.equal(m.drop(output('A')).reason, 'requires-promotion');
  assert.strictEqual(m.get(original.id), original);
  assert.equal(m.list().length, 1);
  assert.equal(events.find(e => e.type === 'promotion-required').port.objectId, 'A');
  assert.equal(TOY_PORTS.output.capacity.sequence, 1);
});

test('invalid reconnect or pointer cancellation keeps the original wire and clears editing state', () => {
  const m = modelWithToys('A', 'B', 'C');
  const c = link(m, 'A', 'B').connection;
  m.beginDrag(c.to, { connectionId: c.id, end: 'to' });
  assert.equal(m.drop(output('C')).ok, false);
  assert.strictEqual(m.get(c.id), c);
  m.beginDrag(c.from, { connectionId: c.id, end: 'from' }); m.cancelDrag();
  assert.strictEqual(m.get(c.id), c);
  assert.equal(m.getEditing(), null);
});

test('Heartbeat fan-out uses port capacity in the same model without Sequence promotion', () => {
  const m = modelWithToys('A', 'B', 'C');
  const events = []; m.subscribe(e => events.push(e));
  for (const toy of ['A', 'B', 'C']) {
    m.beginDrag(output(MAIN_TRANSPORT_ID), { kind: 'transport' });
    assert.equal(m.drop(input(toy)).ok, true);
  }
  assert.equal(m.list('transport').length, 3);
  assert.equal(m.list('sequence').length, 0);
  assert.equal(HEARTBEAT_PORTS.output.capacity.transport, Infinity);
  assert.equal(events.some(e => e.type === 'promotion-required'), false);
  assert.equal(link(m, 'A', 'B').ok, true, 'a musical parent replaces the Heartbeat root');
  assert.equal(m.list('transport').length,2);
  assert.equal(m.getParent('B').from.objectId,'A');
});

function integration() {
  clearPlaybackInstancesForTests();
  const panels = ['A','B','C','D','E'].map(id => ({ id, dataset: { toy: 'drawgrid' } }));
  const byId = new Map(panels.map(p => [p.id, p]));
  for (const panel of panels) ensurePlaybackInstance(panel.id, { startTick: 123 });
  const model = createConnectionModel();
  const cancelled = [];
  const sequence = createChainSequenceAdapter({ getToy: id => byId.get(id), chainState: new Map(), cancelToy: id => cancelled.push(id) });
  const state = { currentTick: 250, state: 'playing' };
  let updates = 0;
  const adapter = createConnectionAdapter(model, { onSequenceChange() {
    updates++; sequence.sync(panels, state, { connections: model.list('sequence') });
  } });
  adapter.sync(panels);
  return { model, adapter, sequence, panels, byId, state, cancelled, getUpdates: () => updates };
}

test('model edits update Sequence definitions immediately and retain the existing structure startTick', () => {
  const h = integration();
  link(h.model, 'A', 'B'); const bc = link(h.model, 'B', 'C').connection;
  const instance = h.sequence.runtime.getInstance('sequence:A');
  const anchor = instance.startTick;
  h.model.beginDrag(bc.to, { connectionId: bc.id, end: 'to' }); h.model.drop(input('D'));
  assert.deepEqual(h.sequence.runtime.getDefinition('sequence:A').children.map(c => c.toyId), ['A', 'B', 'D']);
  assert.equal(h.sequence.runtime.getInstance('sequence:A').startTick, anchor);
  assert.equal(h.byId.get('C').dataset.prevToyId, undefined);
  assert.equal(h.sequence.isManaged('C'), false);
  h.model.beginDrag(input('D'), { connectionId: bc.id, end: 'to' }); h.model.drop(null);
  assert.deepEqual(h.sequence.runtime.getDefinition('sequence:A').children.map(c => c.toyId), ['A', 'B']);
  assert.equal(h.byId.get('B').dataset.nextToyId, undefined);
  assert.equal(h.sequence.isManaged('D'), false);
  h.model.disconnect(h.model.list('sequence')[0].id);
  assert.equal(h.sequence.runtime.getDefinition('sequence:A'), null);
  assert.equal(h.sequence.runtime.getInstance('sequence:A'), null);
});

test('joining two running chains yields one Sequence instance without resetting the surviving startTick', () => {
  const h = integration();
  link(h.model, 'A','B'); link(h.model,'B','C'); link(h.model,'D','E');
  const instance = h.sequence.runtime.getInstance('sequence:A');
  h.model.beginDrag(input('D')); h.model.drop(output('C'));
  assert.deepEqual(h.sequence.runtime.getDefinition('sequence:A').children.map(c => c.toyId), ['A','B','C','D','E']);
  assert.strictEqual(h.sequence.runtime.getInstance('sequence:A'), instance);
  assert.equal(h.sequence.runtime.getInstance('sequence:D'), null);
});

test('connecting a new predecessor retains the existing performance identity and anchor', () => {
  const h = integration();
  link(h.model, 'A', 'B');
  const instance = h.sequence.runtime.getInstance('sequence:A');
  h.state.currentTick = 750;
  assert.equal(link(h.model, 'C', 'A').ok, true);
  assert.strictEqual(h.sequence.runtime.getInstance('sequence:A'), instance);
  assert.deepEqual(h.sequence.runtime.getDefinition('sequence:A').children.map(c => c.toyId), ['C','A','B']);
});

test('transport root reconnection preserves playback identity and anchor while detached toys become inactive', () => {
  const h = integration();
  link(h.model, 'A','B');
  const before = Object.fromEntries(h.panels.map(p => [p.id, { ...getPlaybackInstance(p.id) }]));
  const structure = h.sequence.runtime.getInstance('sequence:A');
  const definition = h.sequence.runtime.getDefinition('sequence:A');
  const updates = h.getUpdates();
  const c = h.model.connect('transport', output(MAIN_TRANSPORT_ID), input('A')).connection;
  h.model.beginDrag(c.to, { connectionId: c.id, end: 'to' }); h.model.drop(input('D'));
  h.model.disconnect(c.id);
  for (const panel of h.panels) {
    const after=getPlaybackInstance(panel.id);
    for(const key of ['id','startTick','transportId','generation'])assert.equal(after[key],before[panel.id][key]);
  }
  assert.equal(getPlaybackInstance('D').active,false);
  assert.strictEqual(h.sequence.runtime.getInstance('sequence:A'), structure);
  assert.strictEqual(h.sequence.runtime.getDefinition('sequence:A'), definition);
  assert.ok(h.getUpdates()>updates);
});

test('ownership discovery creates default wires once and never resurrects a deliberately deleted wire', () => {
  const h = integration();
  h.adapter.discoverOwnership();
  const c = h.model.list('transport').find(c => c.to.objectId === 'D');
  assert.ok(c);
  h.model.disconnect(c.id);
  for (let i = 0; i < 5; i++) { h.adapter.sync(h.panels); h.adapter.discoverOwnership(); }
  assert.equal(h.model.list('transport').some(c => c.to.objectId === 'D'), false);
});

test('a manually attached and deleted transport wire is not recreated by first ownership discovery', () => {
  const h = integration();
  const c = h.model.connect('transport', output(MAIN_TRANSPORT_ID), input('D')).connection;
  h.model.disconnect(c.id); h.adapter.discoverOwnership();
  assert.equal(h.model.list('transport').some(c => c.to.objectId === 'D'), false);
});

test('removing a toy cleans both connection kinds and an in-progress edit without bridging neighbors', () => {
  const h = integration();
  link(h.model,'A','B'); const bc = link(h.model,'B','C').connection;
  h.adapter.discoverOwnership();
  h.model.beginDrag(bc.to, { connectionId: bc.id, end: 'to' });
  h.adapter.sync(h.panels.filter(p => p.id !== 'B'), { importLegacy: false });
  assert.equal(h.model.list().some(c => c.from.objectId === 'B' || c.to.objectId === 'B'), false);
  assert.equal(h.model.getEditing(), null);
  assert.equal(h.model.list('sequence').length, 0);
  assert.equal(h.byId.get('A').dataset.nextToyId, undefined);
  assert.equal(h.byId.get('C').dataset.prevToyId, undefined);
});

test('saved canonical connections restore identities and intentionally absent transport links', () => {
  const h = integration();
  link(h.model,'A','B'); h.adapter.discoverOwnership();
  h.model.disconnect(h.model.list('transport').find(c => c.to.objectId === 'D').id);
  const saved = h.model.list();
  const fresh = integration();
  fresh.adapter.restore(saved, fresh.panels);
  fresh.adapter.discoverOwnership();
  assert.deepEqual(fresh.model.list(), saved);
  const result = link(fresh.model,'C','D');
  assert.equal(result.ok, true);
  assert.equal(fresh.model.list().length, saved.length + 1, 'generated IDs never overwrite restored IDs');
});

test('legacy restored datasets import once into canonical validated state and project both directions', () => {
  const h = integration();
  h.byId.get('A').dataset.nextToyId = 'B';
  h.adapter.sync(h.panels);
  assert.equal(h.model.list('sequence').length, 1);
  assert.equal(h.byId.get('B').dataset.prevToyId, 'A');
  const id = h.model.list('sequence')[0].id;
  h.adapter.sync(h.panels);
  assert.equal(h.model.list('sequence')[0].id, id);
  h.model.disconnect(id);
  h.adapter.sync(h.panels);
  assert.equal(h.model.list('sequence').length, 0);
});

test('movement, pan, zoom and responsive projection affect geometry only; both kinds use the same curve', () => {
  const m = modelWithToys('A','B'); link(m,'A','B');
  m.connect('transport',output(MAIN_TRANSPORT_ID),input('A'));
  const snapshot = m.snapshot();
  const from = {x:100,y:120}, to = {x:600,y:300};
  const curves = [1,0.75,2].map(scale => connectionCurve(projectConnectionPoint(from,{scale,tx:20,ty:30}), projectConnectionPoint(to,{scale,tx:20,ty:30})));
  assert.notEqual(curvePath(curves[0]), curvePath(curves[1]));
  assert.deepEqual(curvePoint(curves[0],0), {x:120,y:150});
  assert.deepEqual(curvePoint(curves[0],1), {x:620,y:330});
  assert.deepEqual(m.snapshot(), snapshot);
});
