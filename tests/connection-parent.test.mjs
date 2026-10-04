import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionModel} from '../src/connections.js';
import {createConnectionAdapter} from '../src/connection-adapter.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {createStructureToyModel} from '../src/structure-toys.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {clearPlaybackInstancesForTests,ensurePlaybackInstance,getPlaybackInstance} from '../src/playback-instances.js';
import {MAIN_TRANSPORT_ID} from '../src/transport-registry.js';

const input=objectId=>({objectId,portId:'input'}),output=objectId=>({objectId,portId:'output'});
function harness() {
  clearPlaybackInstancesForTests();globalThis.window=globalThis.window||{};window.__TOY_AUDIO_GEN=Object.create(null);
  const model=createConnectionModel(),calls=[],scheduler=createSequencerScheduler();
  const panels=['A','B','C','D'].map(id=>({id,dataset:{toy:'drawgrid',steps:'8'},__seqRev:0,__seqPattern:{},
    __sequencerSchedule(step,time,metadata){calls.push({toyId:id,...metadata});}}));
  const byId=new Map(panels.map(p=>[p.id,p]));
  for(const p of panels)ensurePlaybackInstance(p.id,{startTick:0});
  const state={state:'stopped',currentTick:0},chainState=new Map(panels.map(p=>[p.id,p.id]));
  const structures=createStructureToyModel(model,{getToyType:id=>byId.get(id)?.dataset.toy});
  const sequence=createChainSequenceAdapter({connectionModel:model,getToy:id=>byId.get(id),chainState,
    cancelToy:id=>scheduler.clearToy(id),onRelease:id=>scheduler.clearToy(id)});
  structures.configure({onRemove:s=>sequence.terminateStructure(s.definitionId)});
  const sync=()=>sequence.sync(panels,state,{connections:model.list('sequence'),structures:structures.list()});
  const adapter=createConnectionAdapter(model,{onSequenceChange:sync,onDetach:id=>scheduler.clearToy(id)});
  adapter.sync(panels);sync();
  const link=(a,b)=>model.connect('sequence',output(a),input(b));
  const root=id=>model.connect('transport',output(MAIN_TRANSPORT_ID),input(id));
  const poll=(now,end)=>scheduler.tick({activeToyIds:new Set([...sequence.getActiveToyIds()].filter(id=>!sequence.isManaged(id))),
    playbackTurns:sequence.turnsForLookahead(now,end),getToy:id=>byId.get(id),currentTick:now,lookaheadEndTick:end,tickToAudioTime:t=>t/192});
  return {model,panels,byId,state,structures,sequence,adapter,link,root,poll,calls};
}
test('new standalone registration creates one Heartbeat root and activates it without a second clock',()=>{
  const h=harness();assert.equal(h.model.list('transport').length,4);
  for(const p of h.panels){assert.equal(h.model.getParent(p.id).from.objectId,MAIN_TRANSPORT_ID);assert.equal(getPlaybackInstance(p.id).active,true);}
  h.adapter.sync(h.panels);h.adapter.discoverOwnership();assert.equal(h.model.list().length,4);
});
test('a standalone created before its musical initializer gets a root immediately and activates when its instance arrives',()=>{
  clearPlaybackInstancesForTests();const model=createConnectionModel(),panel={id:'late',dataset:{toy:'drawgrid'}};
  const adapter=createConnectionAdapter(model);adapter.sync([panel]);
  assert.equal(model.getParent(panel.id).from.objectId,MAIN_TRANSPORT_ID);
  const instance=ensurePlaybackInstance(panel.id,{active:false,startTick:123});
  adapter.discoverOwnership();assert.equal(instance.active,true);assert.equal(instance.startTick,123);
  model.disconnect(model.getParent(panel.id).id);adapter.sync([panel]);adapter.discoverOwnership();
  assert.equal(model.getParent(panel.id),null);assert.equal(instance.active,false);
});
test('A to B atomically replaces B root, preserves ownership, and cannot double-schedule B',()=>{
  const h=harness(),snapshots=[];h.model.subscribe(e=>{if(e.type==='change')snapshots.push(h.model.list().filter(c=>c.to.objectId==='B'));});
  h.link('A','B');assert.ok(snapshots.every(parents=>parents.length===1));
  assert.equal(h.model.getParent('B').from.objectId,'A');assert.equal(h.model.getTransportId('B'),MAIN_TRANSPORT_ID);
  assert.equal(h.model.list('transport').some(c=>c.to.objectId==='B'),false);
  for(let now=0;now<768;now+=24){h.poll(now,Math.min(now+120,768));h.poll(now,Math.min(now+120,768));}
  const b=h.calls.filter(c=>c.toyId==='B');assert.equal(b.length,8);assert.equal(b[0].eventTick,384);
  assert.equal(new Set(b.map(c=>c.identity)).size,b.length);
});
test('deleting a musical parent leaves its child inactive until an explicit Heartbeat reconnection',()=>{
  const h=harness(),edge=h.link('A','B').connection;
  h.poll(0,120);const anchor=getPlaybackInstance('B').startTick;
  h.model.disconnect(edge.id);
  assert.equal(h.model.getParent('B'),null);assert.equal(getPlaybackInstance('B').active,false);
  for(let now=120;now<2000;now+=96){h.adapter.sync(h.panels);h.adapter.discoverOwnership();h.poll(now,now+120);}
  assert.equal(h.model.getParent('B'),null);assert.equal(h.calls.filter(c=>c.toyId==='B').length,0);
  const instance=getPlaybackInstance('B');h.root('B');
  assert.strictEqual(getPlaybackInstance('B'),instance);assert.equal(instance.startTick,anchor);assert.equal(instance.active,true);
  h.poll(2000,2200);assert.ok(h.calls.some(c=>c.toyId==='B'));
});
test('disconnecting an ancestor silences the entire downstream chain while unrelated roots continue',()=>{
  const h=harness();const edge=h.link('A','B').connection;h.link('B','C');h.poll(0,120);
  const unrelated=getPlaybackInstance('D');h.model.disconnect(edge.id);
  for(let now=120;now<2500;now+=96)assert.ok(h.sequence.turnsForLookahead(now,now+120).every(t=>!['B','C'].includes(t.toyId)));
  assert.equal(getPlaybackInstance('B').active,false);assert.equal(getPlaybackInstance('C').active,false);
  assert.equal(h.sequence.retrigger('B',{state:'playing',currentTick:2500}),null,'a toy gesture cannot create a hidden root');
  assert.strictEqual(getPlaybackInstance('D'),unrelated);assert.equal(unrelated.active,true);
  h.root('B');assert.equal(h.model.getTransportId('C'),MAIN_TRANSPORT_ID);
  assert.ok(h.sequence.turnsForLookahead(2500,3300).some(t=>['B','C'].includes(t.toyId)));
});
test('normal and Structure parents replace old upstream wires, with no redundant Structure root',()=>{
  const h=harness();h.link('A','B');const s=h.structures.promote(h.model.getParent('B').id,'together');
  h.model.connect('sequence',{objectId:s.id,portId:'child:1'},input('C'));
  for(const id of [s.id,'B','C']){assert.equal(h.model.getTransportId(id),MAIN_TRANSPORT_ID);assert.notEqual(h.model.getParent(id).kind,'transport');}
  h.link('D','C');assert.equal(h.model.getParent('C').from.objectId,'D');assert.equal(h.model.list().filter(c=>c.to.objectId==='C').length,1);
});
test('grabbed endpoints retain the opposite endpoint and source reconnect can change parent kind',()=>{
 const h=harness(),initial=h.model.getParent('B');
 h.model.beginDrag(input('B'),h.model.socketDragIntent(input('B')));h.model.detachDrag();assert.equal(h.model.preview(input('A')).ok,true);h.model.drop(input('A'));assert.equal(h.model.getParent('A').id,initial.id);assert.equal(h.model.getParent('B'),null);
 h.link('A','B');const edge=h.model.getParent('B');
 h.model.beginDrag(output('A'),h.model.socketDragIntent(output('A')));h.model.detachDrag();h.model.drop(output('C'));assert.equal(h.model.getParent('B').from.objectId,'C');assert.equal(h.model.getParent('B').id,edge.id);
 h.model.beginDrag(output('C'),h.model.socketDragIntent(output('C')));h.model.detachDrag();h.model.drop(output(MAIN_TRANSPORT_ID));assert.equal(h.model.getParent('B').kind,'transport');assert.equal(h.model.getParent('B').id,edge.id);
 h.model.beginDrag(input('B'),h.model.socketDragIntent(input('B')));h.model.detachDrag();h.model.drop(null);assert.equal(h.model.getParent('B'),null);assert.equal(getPlaybackInstance('B').active,false);
});

test('restoring older parallel ownership wires keeps the structural parent regardless of saved order',()=>{
  for(const reverse of [false,true]){
    const h=harness(),saved=[{id:'rootA',kind:'transport',from:output(MAIN_TRANSPORT_ID),to:input('A')},
      {id:'AB',kind:'sequence',from:output('A'),to:input('B')},{id:'obsoleteRootB',kind:'transport',from:output(MAIN_TRANSPORT_ID),to:input('B')}];
    h.adapter.restore(reverse?saved.reverse():saved,h.panels);
    assert.equal(h.model.getParent('B').id,'AB');assert.equal(h.model.getParent('C'),null);
    assert.equal(h.model.getTransportId('B'),MAIN_TRANSPORT_ID);h.adapter.discoverOwnership();assert.equal(h.model.getParent('C'),null);
  }
});
test('invalid reparenting preserves the existing parent and central cycle validation',()=>{
  const h=harness();h.link('A','B');h.link('B','C');const original=h.model.getParent('A');
  assert.equal(h.link('C','A').reason,'cycle');assert.strictEqual(h.model.getParent('A'),original);
  assert.equal(h.model.list('transport').length,2);
});
