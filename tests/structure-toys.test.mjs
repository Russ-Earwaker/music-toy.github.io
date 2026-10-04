import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionModel } from '../src/connections.js';
import { createConnectionAdapter } from '../src/connection-adapter.js';
import { createStructureToyModel } from '../src/structure-toys.js';
import { createChainSequenceAdapter } from '../src/chain-sequence.js';
import { createStructureRuntime } from '../src/structure-runtime.js';
import { clearPlaybackInstancesForTests, ensurePlaybackInstance, getPlaybackInstance } from '../src/playback-instances.js';
import { MAIN_TRANSPORT_ID } from '../src/transport-registry.js';
import { createSequencerScheduler } from '../src/note-scheduler.js';
import { createConnectionQuickAdd } from '../src/connection-quick-add.js';

const input = id => ({objectId:id,portId:'input'}), output = id => ({objectId:id,portId:'output'});
const slot = (id,i) => ({objectId:id,portId:`child:${i}`});

test('automatic Structure displacement preserves manual position provenance through restore',()=>{
  const model=createConnectionModel();model.registerObject('A');model.registerObject('B');
  const toys=createStructureToyModel(model),edge=model.connect('sequence',output('A'),input('B')).connection;
  const s=toys.promote(edge.id,'sequence');assert.equal(s.positionSource,'auto');
  toys.move(s.id,500,200);assert.equal(toys.get(s.id).positionSource,'manual');
  toys.move(s.id,650,220,{manual:false});assert.equal(toys.get(s.id).positionSource,'manual');
  const saved=toys.list();toys.suspend(()=>toys.restore(saved));assert.equal(toys.get(s.id).positionSource,'manual');assert.equal(toys.get(s.id).x,650);toys.dispose();
});

test('menu Simple Rhythm then toy +, Together promotion and Structure + schedules the predecessor separately',()=>{
  clearPlaybackInstancesForTests();
  const model=createConnectionModel(), panels=[], state={currentTick:0,state:'stopped'}, calls=[];
  const sequence=createChainSequenceAdapter({connectionModel:model,getToy:id=>panels.find(p=>p.id===id),chainState:new Map()});
  const structures=createStructureToyModel(model,{getToyType:id=>panels.find(p=>p.id===id)?.dataset.toy});
  const adapter=createConnectionAdapter(model,{onSequenceChange:()=>sequence.sync(panels,state,
    {connections:model.list('sequence'),structures:structures.list()})});
  const createToy=type=>{
    const p={id:['A','B','C'][panels.length],dataset:{toy:type,steps:'8'},__seqRev:0,__seqPattern:{},
      __sequencerSchedule:(step,time,metadata)=>calls.push({toyId:p.id,...metadata})};
    panels.push(p);ensurePlaybackInstance(p.id,{loopLengthTicks:384});adapter.sync(panels);return p;
  };
  createToy('loopgrid');
  const quickAdd=createConnectionQuickAdd({model,structures,getToy:id=>panels.find(p=>p.id===id),createToy});
  quickAdd(output('A'));
  const root=sequence.runtime.getInstance('sequence:A');
  const s=structures.promote(model.getParent('B').id,'together');
  quickAdd(slot(s.id,1));
  assert.deepEqual(panels.map(p=>p.dataset.toy),['loopgrid','loopgrid','loopgrid']);
  assert.deepEqual(model.list('transport').map(c=>c.to.objectId),['A']);
  assert.deepEqual(sequence.turnsForLookahead(0,1536).map(t=>[t.toyId,t.startTick]),
    [['A',0],['B',384],['C',384],['A',768],['B',1152],['C',1152]]);
  const scheduler=createSequencerScheduler();
  scheduler.tick({activeToyIds:new Set(),playbackTurns:sequence.turnsForLookahead(0,768),
    getToy:id=>panels.find(p=>p.id===id),currentTick:0,lookaheadEndTick:768,tickToAudioTime:t=>t/192});
  assert.deepEqual(calls.filter(c=>c.eventTick===0).map(c=>c.toyId),['A']);
  assert.deepEqual(calls.filter(c=>c.eventTick===384).map(c=>c.toyId),['B','C']);
  assert.equal(calls.length,24);
  assert.equal(new Set(calls.map(c=>c.identity)).size,24);
  assert.strictEqual(sequence.runtime.getInstance('sequence:A'),root);
  assert.equal(root.startTick,0);assert.equal(root.transportId,MAIN_TRANSPORT_ID);
  adapter.dispose();structures.dispose();
});

test('restoring legacy includeInput Structures follows visible input/output topology',()=>{
  const h=harness(),s=h.toys.promote(h.connect('A','B').connection.id,'together');
  h.model.connect('sequence',slot(s.id,1),input('C'));
  const saved={structures:h.toys.list().map(s=>({...s,includeInput:true})),connections:h.model.list()};
  const fresh=harness();
  fresh.toys.suspend(()=>{fresh.toys.restore(saved.structures);fresh.adapter.restore(saved.connections,fresh.panels);});
  assert.equal(fresh.toys.get(s.id).includeInput,false);
  assert.deepEqual(fresh.sequence.turnsForLookahead(0,768).map(t=>[t.toyId,t.startTick]),[['A',0],['B',384],['C',384]]);
});
for (const type of ['sequence','together']) test(`deleting active ${type} revokes runtime authority and does not restart its children`,()=>{
  const h=harness();const s=h.toys.promote(h.connect('A','B').connection.id,type);
  h.state.state='playing';const obsolete=h.sequence.turnsForLookahead(0,1000);
  const parent=h.sequence.runtime.getInstance('sequence:A'),generation=parent.generation;
  const before=h.panels.slice();h.toys.remove(s.id);
  assert.deepEqual(h.panels,before);
  assert.equal(h.sequence.runtime.getDefinition(s.definitionId),null);
  assert.equal(h.sequence.runtime.getInstance(s.definitionId),null);
  assert.equal(h.sequence.runtime.getInstance('sequence:A'),null);
  assert.equal(parent.active,false);assert.ok(parent.generation>generation);
  assert.ok(obsolete.filter(turn=>turn.toyId!=='A').every(turn=>turn.playbackInstance.active===false));
  for(let now=120;now<3072;now+=48) {
    assert.deepEqual(h.sequence.turnsForLookahead(now,now+120),[]);
    assert.deepEqual([...h.sequence.getActiveToyIds()],['A']);
    assert.equal(getPlaybackInstance('A').active,true,'the surviving Heartbeat root is independently rooted');
    assert.equal(getPlaybackInstance('B').active,false);
  }
});

for (const [before,after,expected] of [['sequence','together',[['B',384],['C',384]]],['together','sequence',[['B',384],['C',768]]]])
test(`${before} to ${after} resolves an unreached nested Structure using its latest definition`,()=>{
  const h=harness();h.connect('A','B');const s=h.toys.get(h.connect('A','C').structureId);
  h.toys.setType(s.id,before);h.state.state='playing';h.state.currentTick=100;
  h.sequence.turnsForLookahead(100,220);
  const root=h.sequence.runtime.getInstance('sequence:A'),snapshot={id:root.id,startTick:root.startTick,generation:root.generation,transportId:root.transportId};
  h.toys.setType(s.id,after);
  const turns=h.sequence.turnsForLookahead(220,1152).filter(t=>['B','C'].includes(t.toyId)&&t.startTick<1152);
  assert.deepEqual(turns.slice(0,2).map(t=>[t.toyId,t.startTick]),expected);
  for(const [key,value] of Object.entries(snapshot))assert.equal(root[key],value);
});

test('a partially reached Sequence keeps its committed child and applies Together to the remaining children',()=>{
  const h=harness();h.connect('A','B');const s=h.toys.get(h.connect('A','C').structureId);
  h.model.connect('sequence',slot(s.id,2),input('D'));h.state.state='playing';h.state.currentTick=450;
  const submitted=h.sequence.turnsForLookahead(450,500).map(t=>[t.id,t.toyId,t.startTick]);
  const root=h.sequence.runtime.getInstance('sequence:A');h.toys.setType(s.id,'together');
  assert.deepEqual(h.sequence.turnsForLookahead(450,500).map(t=>[t.id,t.toyId,t.startTick]),submitted);
  assert.deepEqual(h.sequence.turnsForLookahead(768,1100).map(t=>[t.toyId,t.startTick]),[['C',768],['D',768]]);
  assert.equal(root.startTick,0);
});

test('future children can be added, removed and reordered without restarting a reached parent',()=>{
  const h=harness();h.connect('A','B');const s=h.toys.get(h.connect('A','C').structureId);
  h.toys.setType(s.id,'sequence');h.state.state='playing';h.state.currentTick=100;
  h.sequence.turnsForLookahead(100,220);const root=h.sequence.runtime.getInstance('sequence:A');
  h.model.connect('sequence',slot(s.id,2),input('D'));
  h.model.transaction(()=>{
    for(const c of h.model.list('sequence').filter(c=>c.from.objectId===s.id))h.model.disconnect(c.id);
    h.model.connect('sequence',slot(s.id,0),input('D'));
    h.model.connect('sequence',slot(s.id,1),input('B'));
  });
  assert.deepEqual(h.sequence.turnsForLookahead(384,1152).map(t=>[t.toyId,t.startTick]),[['D',384],['B',768]]);
  assert.strictEqual(h.sequence.runtime.getInstance('sequence:A'),root);assert.equal(root.startTick,0);
});

test('deleting a nested Structure also stops surviving downstream chains instead of launching them as new roots',()=>{
  const h=harness();h.connect('A','B');h.connect('B','E');h.connect('E','F');
  const s=h.toys.get(h.connect('A','C').structureId);h.sequence.turnsForLookahead(0,1500);
  h.toys.remove(s.id);
  for(let now=0;now<3000;now+=96)assert.ok(h.sequence.turnsForLookahead(now,now+120).every(t=>!['B','C','E','F'].includes(t.toyId)));
  for(const id of ['B','C','E','F'])assert.equal(getPlaybackInstance(id).active,false);
});

test('the note scheduler uses a live unreached Together definition without duplicating its committed predecessor',()=>{
  globalThis.window=globalThis.window||{};window.__TOY_AUDIO_GEN=Object.create(null);
  const h=harness(),calls=[],scheduler=createSequencerScheduler();
  for(const id of ['A','B','C']) {
    const p=h.byId.get(id);p.dataset.steps='8';p.__seqRev=0;p.__seqPattern={};
    p.__sequencerSchedule=(step,time,metadata)=>calls.push({toyId:id,...metadata});
  }
  h.connect('A','B');const s=h.toys.get(h.connect('A','C').structureId);
  const poll=(now,end)=>scheduler.tick({activeToyIds:h.sequence.getActiveToyIds(),
    playbackTurns:h.sequence.turnsForLookahead(now,end),getToy:id=>h.byId.get(id),
    currentTick:now,lookaheadEndTick:end,tickToAudioTime:t=>t/192});
  // The app excludes managed toys from independent scheduler work.
  const schedule=(now,end)=>scheduler.tick({activeToyIds:new Set(),
    playbackTurns:h.sequence.turnsForLookahead(now,end),getToy:id=>h.byId.get(id),
    currentTick:now,lookaheadEndTick:end,tickToAudioTime:t=>t/192});
  schedule(0,120);h.state.state='playing';h.state.currentTick=100;
  h.toys.setType(s.id,'together');
  for(let now=96;now<768;now+=24){schedule(now,Math.min(now+120,768));schedule(now,Math.min(now+120,768));}
  assert.deepEqual(calls.filter(c=>c.eventTick===384).map(c=>c.toyId).sort(),['B','C']);
  assert.equal(calls.filter(c=>c.toyId==='A').length,8);
  assert.equal(new Set(calls.map(c=>c.identity)).size,calls.length);
  h.toys.remove(s.id);const count=calls.length;
  for(let now=768;now<3072;now+=96)poll(now,now+120);
  assert.equal(calls.length,count,'deletion cannot create later note-scheduler events');
});
test('Together feeds the existing note scheduler exactly once and a live type switch preserves submitted lookahead',()=>{
  globalThis.window = globalThis.window || {};
  window.__TOY_AUDIO_GEN = Object.create(null);
  const h=harness(),calls=[];
  for(const id of ['A','B','C']) {
    const p=h.byId.get(id);
    p.dataset.steps='8';p.__seqRev=0;p.__seqPattern={};
    p.__sequencerSchedule=(step,audioTime,metadata)=>calls.push({toyId:id,step,audioTime,...metadata});
  }
  const s=h.toys.promote(h.connect('A','B').connection.id,'together');
  h.model.connect('sequence',slot(s.id,1),input('C'));
  const root=h.sequence.runtime.getInstance('sequence:A'),scheduler=createSequencerScheduler();
  const poll=(tick,end)=>scheduler.tick({activeToyIds:new Set(),
    playbackTurns:h.sequence.turnsForLookahead(tick,end),getToy:id=>h.byId.get(id),
    currentTick:tick,lookaheadEndTick:end,tickToAudioTime:t=>t/192});
  h.state.state='playing';
  for(let tick=0;tick<720;tick+=24){poll(tick,tick+120);poll(tick,tick+120);}
  const submitted=calls.slice();h.state.currentTick=720;
  h.toys.setType(s.id,'sequence');
  assert.deepEqual(calls,submitted,'editing does not rewrite submitted audio events');
  for(let tick=720;tick<1920;tick+=24){poll(tick,Math.min(tick+120,1920));poll(tick,Math.min(tick+120,1920));}
  assert.strictEqual(h.sequence.runtime.getInstance('sequence:A'),root);
  assert.equal(root.startTick,0);
  assert.equal(new Set(calls.map(c=>c.identity)).size,calls.length);
  for(const [start,toys] of [[0,['A']],[384,['B','C']],[768,['A']],[1152,['B']],[1536,['C']]])
    assert.deepEqual(calls.filter(c=>c.eventTick===start).map(c=>c.toyId).sort(),toys);
  assert.equal(calls.length,48,'one Together loop followed by one Sequence loop');
});
function harness(lengths = {}) {
  clearPlaybackInstancesForTests();
  const panels = ['A','B','C','D','E','F','G','H'].map(id=>({id,dataset:{toy:'drawgrid'}}));
  const byId = new Map(panels.map(p=>[p.id,p]));
  for (const p of panels) ensurePlaybackInstance(p.id,{loopLengthTicks:lengths[p.id] || 384});
  const model = createConnectionModel();
  const toys = createStructureToyModel(model,{getPosition:p=>({x:p.objectId==='A'?100:500,y:200})});
  const state={currentTick:0,state:'stopped'};
  const cancelled=[];
  const sequence=createChainSequenceAdapter({getToy:id=>byId.get(id),chainState:new Map(),cancelToy:id=>cancelled.push(id)});
  toys.configure({onRemove:s=>sequence.terminateStructure(s.definitionId),getToyType:id=>byId.get(id)?.dataset.toy});
  const sync=()=>sequence.sync(panels,state,{connections:model.list('sequence'),structures:toys.list()});
  const adapter=createConnectionAdapter(model,{onSequenceChange:sync}); adapter.sync(panels);
  const connect=(a,b)=>model.connect('sequence',output(a),input(b));
  return {panels,byId,model,toys,state,sequence,adapter,sync,connect,cancelled};
}

test('simple one-to-one remains an implicit Sequence without a board Structure',()=>{
  const h=harness(); h.connect('A','B');
  assert.equal(h.toys.list().length,0);
  assert.equal(h.sequence.runtime.getDefinition('sequence:A').type,'sequence');
  assert.deepEqual(h.sequence.runtime.turnsInWindow('sequence:A',0,768).map(t=>[t.toyId,t.startTick]),[['A',0],['B',384]]);
});

test('midpoint promotion preserves endpoint toys, original connection identity and the existing root performance',()=>{
  const h=harness(); const edge=h.connect('A','B').connection;
  const root=h.sequence.runtime.getInstance('sequence:A');
  const beforeA=getPlaybackInstance('A').id;
  const s=h.toys.promote(edge.id,'together');
  assert.equal(s.type,'together'); assert.equal(s.provenance,'explicit'); assert.equal(s.includeInput,false);
  assert.equal(h.model.get(edge.id).to.objectId,'B');
  assert.equal(h.model.get(edge.id).from.objectId,s.id);
  assert.ok(h.model.list('sequence').some(c=>c.from.objectId==='A'&&c.to.objectId===s.id));
  assert.equal(h.panels.length,8);
  assert.strictEqual(h.sequence.runtime.getInstance('sequence:A'),root);
  assert.equal(root.startTick,0);
  assert.equal(getPlaybackInstance('A').id,beforeA,'promotion preserves an unchanged playback occurrence');
  assert.deepEqual([...h.sequence.getActiveToyIds()].sort(),['A']);
});

test('Together begins all children on one tick and lasts the maximum child duration',()=>{
  const h=harness({A:384,B:576}); const edge=h.connect('A','B').connection;
  const s=h.toys.promote(edge.id,'together');
  h.model.connect('sequence',slot(s.id,1),input('C'));
  const def=h.sequence.runtime.getDefinition(s.definitionId);
  assert.deepEqual(def.children.map(c=>c.offsetTicks),[0,0]);
  assert.equal(def.durationTicks,576);
  const turns=h.sequence.turnsForLookahead(0,1200);
  assert.deepEqual(turns.filter(t=>t.startTick===0).map(t=>[t.toyId,t.startTick,t.endTick]),[['A',0,384]]);
  assert.deepEqual(turns.filter(t=>t.startTick===384).map(t=>[t.toyId,t.startTick,t.endTick]),[['B',384,960],['C',384,768]]);
  assert.deepEqual(turns.filter(t=>t.startTick===960).map(t=>t.toyId),['A']);
  h.sequence.updateCurrent(800);
  assert.deepEqual([...h.sequence.getActiveToyIds()],['B']);
  assert.equal(getPlaybackInstance('B').active,true);
});

test('Together accepts third/fourth children and always exposes another empty shared output',()=>{
  const h=harness(); const s=h.toys.promote(h.connect('A','B').connection.id,'together');
  assert.equal(h.model.connect('sequence',slot(s.id,1),input('C')).ok,true);
  assert.equal(h.model.connect('sequence',input('D'),slot(s.id,2)).ok,true,'input-first works on Structure ports');
  assert.equal(h.toys.get(s.id).outputCount,4);
  assert.equal(h.model.getPort(slot(s.id,3)).direction,'out');
  assert.equal(h.model.list('sequence').some(c=>c.from.objectId===s.id&&c.from.portId==='child:3'),false);
  assert.deepEqual(h.sequence.runtime.getDefinition(s.definitionId).children.map(c=>c.toyId),['B','C','D']);
  assert.deepEqual(h.sequence.turnsForLookahead(384,385).map(t=>[t.toyId,t.startTick]),[['B',384],['C',384],['D',384]]);
  assert.equal(h.model.connect('sequence',slot(s.id,3),input('E')).ok,true);
  assert.equal(h.toys.get(s.id).outputCount,5);
});

test('occupied normal output atomically auto-promotes to Sequence without losing either downstream relationship',()=>{
  const h=harness(); h.connect('A','B'); const original=h.connect('B','C').connection;
  const root=h.sequence.runtime.getInstance('sequence:A');
  const observed=[]; h.model.subscribe(e=>{if(e.type==='change')observed.push(h.model.list('sequence'));});
  const result=h.model.connect('sequence',output('B'),input('D'));
  assert.equal(result.ok,true);
  const s=h.toys.get(result.structureId);
  assert.equal(s.type,'sequence'); assert.equal(s.provenance,'auto'); assert.equal(s.includeInput,false);
  assert.equal(h.model.get(original.id).to.objectId,'C');
  assert.equal(h.model.get(original.id).from.objectId,s.id);
  assert.ok(observed.every(edges=>edges.some(c=>c.to.objectId==='C')&&edges.some(c=>c.to.objectId==='D')),'observers never see an intermediate disconnected topology');
  assert.strictEqual(h.sequence.runtime.getInstance('sequence:A'),root);
  assert.deepEqual(h.sequence.runtime.getDefinition(s.definitionId).children.map(c=>[c.toyId,c.offsetTicks]),[['C',0],['D',384]]);
  assert.deepEqual(h.sequence.runtime.turnsInWindow('sequence:A',0,1536).map(t=>[t.toyId,t.startTick]),[['A',0],['B',384],['C',768],['D',1152]]);
});

test('downstream chains remain intact and Together runs branch chains from the same parent tick',()=>{
  const h=harness(); h.connect('A','B'); h.connect('B','C'); h.connect('D','E');
  const result=h.connect('B','D'), s=h.toys.get(result.structureId);
  h.toys.setType(s.id,'together');
  assert.deepEqual(h.sequence.runtime.turnsInWindow('sequence:A',0,1536).map(t=>[t.toyId,t.startTick]),[['A',0],['B',384],['C',768],['D',768],['E',1152]]);
  assert.equal(h.sequence.runtime.getDefinition(s.definitionId).durationTicks,768);
  assert.ok(h.model.list('sequence').some(c=>c.from.objectId==='D'&&c.to.objectId==='E'));
});

test('Sequence/Together switching preserves topology, ordering, transport domain, definition identity and board position',()=>{
  const h=harness(); const s=h.toys.promote(h.connect('A','B').connection.id,'together');
  h.model.connect('sequence',slot(s.id,1),input('C'));
  const topology=h.model.list(), old=h.toys.get(s.id), root=h.sequence.runtime.getInstance('sequence:A');
  h.toys.setType(s.id,'sequence');
  assert.deepEqual(h.model.list(),topology);
  assert.deepEqual(h.sequence.runtime.getDefinition(s.definitionId).children.map(c=>[c.toyId,c.offsetTicks]),[['B',0],['C',384]]);
  h.toys.setType(s.id,'together');
  const next=h.toys.get(s.id);
  for(const key of ['id','definitionId','x','y','transportId','outputCount']) assert.equal(next[key],old[key]);
  assert.strictEqual(h.sequence.runtime.getInstance('sequence:A'),root);
  assert.equal(h.sequence.runtime.getDefinition(s.definitionId).durationTicks,384);
});

test('an already-reached Together keeps committed children while its next occurrence uses the new type',()=>{
  const h=harness(); const s=h.toys.promote(h.connect('A','B').connection.id,'together');
  h.state.state='playing';h.state.currentTick=1450;
  const root=h.sequence.runtime.getInstance('sequence:A');
  const before=h.sequence.turnsForLookahead(1450,1500).map(t=>[t.id,t.toyId,t.startTick]);
  h.toys.setType(s.id,'sequence');
  assert.strictEqual(h.sequence.runtime.getInstance('sequence:A'),root);
  assert.equal(root.startTick,0);
  assert.deepEqual(h.sequence.runtime.turnsInWindow('sequence:A',1450,1500).map(t=>[t.id,t.toyId,t.startTick]),before);
  assert.deepEqual(h.sequence.runtime.turnsInWindow('sequence:A',1536,2304).map(t=>[t.toyId,t.startTick]),[['A',1536],['B',1920]]);
  h.sequence.turnsForLookahead(1536,1600);h.state.currentTick=1550;
  h.toys.setType(s.id,'together');
  assert.deepEqual(h.sequence.runtime.turnsInWindow('sequence:A',2304,3072).map(t=>[t.toyId,t.startTick]),[['A',2304],['B',2688]]);
  assert.equal(root.startTick,0);
});

test('removing/reconnecting children uses ordinary shared endpoint editing and updates definitions immediately',()=>{
  const h=harness(); const edge=h.connect('A','B').connection,s=h.toys.promote(edge.id,'together');
  h.model.beginDrag(input('B'),{connectionId:edge.id,end:'to'});
  h.model.drop(input('C'));
  assert.deepEqual(h.sequence.runtime.getDefinition(s.definitionId).children.map(c=>c.toyId),['C']);
  h.model.beginDrag(input('C'),{connectionId:edge.id,end:'to'}); h.model.drop(null);
  assert.deepEqual(h.sequence.runtime.getDefinition(s.definitionId).children.map(c=>c.toyId),[]);
  assert.ok(h.toys.get(s.id),'explicit structure remains visible');
  assert.equal(h.sequence.isManaged('C'),false);
});

test('redundant auto Sequence collapses to its original wire, preserving the remaining connection ID',()=>{
  const h=harness(); const original=h.connect('A','B').connection,result=h.connect('A','C');
  const s=h.toys.get(result.structureId);
  h.model.disconnect(result.connection.id);
  assert.equal(h.toys.get(s.id),null);
  assert.deepEqual(h.model.get(original.id).from,output('A'));
  assert.deepEqual(h.model.get(original.id).to,input('B'));
  assert.equal(h.model.list().some(c=>c.from.objectId===s.id||c.to.objectId===s.id),false);
  assert.equal(h.sequence.runtime.getDefinition(s.definitionId),null);
});

test('user-positioned auto Structure and explicit Sequence never collapse unexpectedly',()=>{
  for(const positioned of [true,false]) {
    const h=harness(),result=h.connect('A','B');
    const branch=h.connect('A','C'),s=h.toys.get(branch.structureId);
    if(positioned)h.toys.move(s.id,800,200);else h.toys.setType(s.id,'sequence');
    h.model.disconnect(branch.connection.id);
    assert.ok(h.toys.get(s.id));assert.equal(h.toys.get(s.id).provenance,'explicit');
    assert.equal(h.model.get(result.connection.id).from.objectId,s.id);
  }
});

test('a Structure inherits Heartbeat ancestry without a redundant direct transport wire',()=>{
  const h=harness();const s=h.toys.promote(h.connect('A','B').connection.id,'together');
  h.sequence.turnsForLookahead(0,500);
  const root=h.sequence.runtime.getInstance('sequence:A'), child=h.sequence.runtime.getInstance(s.definitionId);
  assert.equal(child.transportId,MAIN_TRANSPORT_ID);
  assert.equal(h.model.getTransportId(s.id),MAIN_TRANSPORT_ID);
  assert.equal(h.model.list('transport').some(c=>c.to.objectId===s.id),false);
  assert.strictEqual(h.sequence.runtime.getInstance('sequence:A'),root);
  assert.strictEqual(h.sequence.runtime.getInstance(s.definitionId),child);
  assert.equal(root.startTick,0);
});

test('detaching a nested Structure input gives it an independently scheduled root rather than a stale parent context',()=>{
  const h=harness();h.connect('A','B');h.connect('B','C');
  const branch=h.connect('B','D'),s=h.toys.get(branch.structureId);
  h.sequence.turnsForLookahead(0,1200);
  assert.equal(h.sequence.runtime.getInstance(s.definitionId).parentDefinitionId,'sequence:A');
  const edge=h.model.list('sequence').find(c=>c.to.objectId===s.id);
  h.model.beginDrag({objectId:s.id,portId:'input'},{connectionId:edge.id,end:'to'});
  h.model.drop(null);
  const root=h.sequence.runtime.getInstance(s.definitionId);
  assert.equal(root.parentDefinitionId,undefined);
  assert.equal(root.transportId,MAIN_TRANSPORT_ID);
  assert.deepEqual(h.sequence.turnsForLookahead(0,768).filter(t=>['C','D'].includes(t.toyId))
    .map(t=>[t.toyId,t.startTick]),[['C',0],['D',384]]);
  assert.ok(h.toys.get(s.id));
});

test('branching cycle attempts are rejected before promotion, including cycles through Structure output ports',()=>{
  const h=harness();h.connect('A','B');h.connect('B','C');
  assert.equal(h.connect('B','A').reason,'cycle');assert.equal(h.toys.list().length,0);
  const s=h.toys.get(h.connect('B','D').structureId);
  assert.equal(h.model.connect('sequence',slot(s.id,2),input('A')).reason,'cycle');
  assert.equal(h.toys.list().length,1);
});

test('failed Connection transactions roll back both object and edge state without exposing partial changes',()=>{
  const h=harness();h.connect('A','B');const before=h.model.snapshot();let events=0;
  h.model.subscribe(()=>events++);
  assert.throws(()=>h.model.transaction(()=>{h.model.disconnect(h.model.list()[0].id);h.model.registerObject('temp');throw Error('abort');}),/abort/);
  assert.deepEqual(h.model.snapshot(),before);assert.equal(h.model.getObject('temp'),null);assert.equal(events,0);
});

test('Structure and Connection persistence round-trip preserves type, provenance, ordering and ports',()=>{
  const h=harness();h.connect('A','B');const s=h.toys.get(h.connect('A','C').structureId);
  h.toys.setType(s.id,'together');h.toys.move(s.id,600,400);
  const saved=JSON.parse(JSON.stringify({structures:h.toys.list(),connections:h.model.list()}));
  const fresh=harness();fresh.toys.suspend(()=>{fresh.toys.restore(saved.structures);fresh.adapter.restore(saved.connections,fresh.panels);});
  assert.deepEqual(fresh.toys.list(),saved.structures);
  assert.deepEqual(fresh.model.list(),saved.connections);
  assert.equal(fresh.model.getPort(slot(s.id,2)).direction,'out');
});

test('nested definitions use one flattened tick-domain turn stream; a shorter Together child rests until the next parent loop',()=>{
  const runtime=createStructureRuntime();
  runtime.defineStructure('parallel','together',[{toyId:'B',durationTicks:96},{toyId:'C',durationTicks:192}],0,{representationId:'parallel'});
  runtime.defineSequence('root',[{toyId:'A',durationTicks:96},{structureId:'parallel'}]);
  runtime.startSequence('root',0,{quantize:false});
  assert.equal(runtime.getDefinition('root').durationTicks,288);
  assert.deepEqual(runtime.turnsInWindow('root',0,576).map(t=>[t.toyId,t.startTick,t.endTick]),[['A',0,96],['B',96,192],['C',96,288],['A',288,384],['B',384,480],['C',384,576]]);
});
