import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionModel, HEARTBEAT_PORTS } from '../src/connections.js';
import { createStructureToyModel } from '../src/structure-toys.js';
import { createConnectionQuickAdd } from '../src/connection-quick-add.js';
import { MAIN_TRANSPORT_ID } from '../src/transport-registry.js';

const out = (objectId, portId='output') => ({ objectId, portId });
const input = objectId => ({ objectId, portId:'input' });
function harness() {
  const model=createConnectionModel(),panels=new Map([['A',{id:'A',dataset:{toy:'drawgrid'}}],['B',{id:'B',dataset:{toy:'bouncer'}}],['C',{id:'C',dataset:{toy:'rippler'}}]]);
  model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS,transportId:MAIN_TRANSPORT_ID});
  for(const p of panels.values())model.registerObject(p.id,{transportId:MAIN_TRANSPORT_ID});
  for(const p of panels.values())model.connect('transport',out(MAIN_TRANSPORT_ID),input(p.id));
  const structures=createStructureToyModel(model,{getToyType:id=>panels.get(id)?.dataset.toy});
  const calls=[],picks=[];
  const quickAdd=createConnectionQuickAdd({model,structures,getToy:id=>panels.get(id),
    createToy:(type,context)=>{calls.push({type,context});const p={id:`new:${calls.length}`,dataset:{toy:type}};panels.set(p.id,p);return p;},
    pickToy:point=>picks.push(point)});
  return {model,panels,structures,calls,picks,quickAdd};
}
test('normal output quick-add repeats its source musical type and uses normal Sequence/transport wires',()=>{
  const h=harness(),p=h.quickAdd(out('A'));
  assert.equal(p.dataset.toy,'drawgrid');assert.equal(h.calls[0].context.reference,h.panels.get('A'));
  assert.deepEqual(h.model.list('sequence').map(c=>[c.from,c.to]),[[out('A'),input(p.id)]]);
  assert.equal(h.model.getParent(p.id).from.objectId,'A');
  assert.equal(h.model.getTransportId(p.id),MAIN_TRANSPORT_ID);
  assert.equal(h.model.list('transport').some(c=>c.to.objectId===p.id),false);
  assert.equal(h.quickAdd(out('A')),null);assert.equal(h.calls.length,1);
});
test('Structure spare output repeats its most recently connected musical child, and retains history after disconnect',()=>{
  const h=harness(),edge=h.model.connect('sequence',out('A'),input('B')).connection;
  const s=h.structures.promote(edge.id,'together');
  assert.equal(h.structures.get(s.id).lastChildType,'bouncer');
  h.model.connect('sequence',out(s.id,'child:1'),input('C'));
  const newest=h.model.list('sequence').find(c=>c.to.objectId==='C');h.model.disconnect(newest.id);
  assert.equal(h.structures.get(s.id).lastChildType,'rippler');
  const p=h.quickAdd(out(s.id,'child:1'));
  assert.equal(p.dataset.toy,'rippler');
  assert.equal(h.model.list('sequence').find(c=>c.to.objectId===p.id).from.objectId,s.id);
  assert.equal(h.model.getTransportId(p.id),MAIN_TRANSPORT_ID);
  assert.equal(h.model.list('transport').some(c=>c.to.objectId===p.id),false);
  assert.equal(h.structures.get(s.id).type,'together');
});
test('Structure without child history exposes the picker hook without guessing a type',()=>{
  const h=harness();h.structures.restore([{id:'empty',type:'together',x:0,y:0}]);
  assert.equal(h.quickAdd(out('empty','child:0')),null);
  assert.equal(h.calls.length,0);assert.deepEqual(h.picks,[out('empty','child:0')]);
});
test('quick-add never creates musical toys from Heartbeat outputs or input sockets',()=>{
  const h=harness();assert.equal(h.quickAdd(out(MAIN_TRANSPORT_ID)),null);assert.equal(h.quickAdd(input('A')),null);
  assert.equal(h.calls.length,0);
});
test('persisted Structure interaction history survives restore',()=>{
  const h=harness(),edge=h.model.connect('sequence',out('A'),input('B')).connection;
  const s=h.structures.promote(edge.id,'together');const saved=h.structures.list();
  h.structures.suspend(()=>h.structures.restore(saved));
  assert.equal(h.structures.get(s.id).lastChildType,'bouncer');
  assert.equal(h.quickAdd(out(s.id,'child:1')).dataset.toy,'bouncer');
});
