import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createStructureToyModel} from '../src/structure-toys.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {createStructureRuntime} from '../src/structure-runtime.js';
import {ensurePlaybackInstance,clearPlaybackInstancesForTests,isPlaybackOccurrenceValid} from '../src/playback-instances.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {resolveChordAtTick} from '../src/chord-progression.js';
import {MAIN_TRANSPORT_ID} from '../src/transport-registry.js';
import {structureFlashStrength} from '../src/graph-visuals.js';
import {readFileSync} from 'node:fs';

const input=objectId=>({objectId,portId:'input'}),out=(objectId,portId='output')=>({objectId,portId});
function harness(lengths={A:384,B:768,C:1536}){
 clearPlaybackInstancesForTests();
 const model=createConnectionModel();model.registerObject('H',{ports:HEARTBEAT_PORTS,transportId:MAIN_TRANSPORT_ID});
 const notes=[],pulses=[],panels=Object.entries(lengths).map(([id,length])=>{
  model.registerObject(id);ensurePlaybackInstance(id,{loopLengthTicks:length});
  return {id,dataset:{toy:'drawgrid',steps:'8'},__seqPattern:{},__seqRev:0,
   __sequencerSchedule(step,time,metadata){notes.push({toyId:id,...metadata});}};
 });
 const structures=createStructureToyModel(model),state={state:'stopped',currentTick:0};
 const adapter=createChainSequenceAdapter({connectionModel:model,getToy:id=>panels.find(p=>p.id===id),chainState:new Map(),onRootCycle:p=>pulses.push(p)});
 const sync=()=>adapter.sync(panels,state,{connections:model.list('sequence'),structures:structures.list()});
 const root=id=>model.connect('transport',out('H'),input(id)).connection;
 const child=(id,to,index=0)=>model.connect('sequence',out(id,'child:'+index),input(to)).connection;
 const turns=(from,to)=>adapter.turnsForLookahead(from,to);
 const close=()=>{adapter.reset();structures.dispose();};
 return {model,panels,structures,state,adapter,sync,root,child,turns,close,notes,pulses};
}

test('Heartbeat children start simultaneously and independently cycle 1/2/4 bars for 1000 bars',()=>{
 const h=harness();try{
  for(const id of ['C','A','B'])h.root(id);h.sync();
  assert.deepEqual(h.turns(0,1).map(t=>[t.toyId,t.startTick]).sort(),[['A',0],['B',0],['C',0]]);
  const turns=h.turns(0,384000);
  for(const [id,length,count] of [['A',384,1000],['B',768,500],['C',1536,250]]){
   const own=turns.filter(t=>t.toyId===id);assert.equal(own.length,count);
   assert.ok(own.every((t,n)=>t.startTick===n*length && t.endTick===(n+1)*length));
   assert.equal(h.adapter.isManaged(id),true);
  }
  for(let tick=96;tick<=1536;tick+=96)h.adapter.updateCurrent(tick);
  assert.deepEqual(h.pulses.filter(p=>p.headId==='A').map(p=>p.startTick),[0,384,768,1152,1536]);
  assert.deepEqual(h.pulses.filter(p=>p.headId==='B').map(p=>p.startTick),[0,768,1536]);
  assert.deepEqual(h.pulses.filter(p=>p.headId==='C').map(p=>p.startTick),[0,1536]);
 }finally{h.close();}
});

test('root occurrences schedule once, despite repeated lookahead, through the shared toy scheduler',()=>{
 const h=harness({A:384,B:768});try{
  h.root('A');h.root('B');h.sync();const scheduler=createSequencerScheduler();
  for(let now=0;now<1536;now+=24)for(let poll=0;poll<2;poll++)scheduler.tick({currentTick:now,lookaheadEndTick:Math.min(now+120,1536),
   playbackTurns:h.turns(now,Math.min(now+120,1536)),activeToyIds:new Set(),getToy:id=>h.panels.find(p=>p.id===id),tickToAudioTime:t=>t/192});
  assert.equal(h.notes.filter(n=>n.toyId==='A').length,32);assert.equal(h.notes.filter(n=>n.toyId==='B').length,16);
  assert.equal(new Set(h.notes.map(n=>n.identity)).size,h.notes.length);
  scheduler.dispose();
 }finally{h.close();}
});

test('all structures are finite without root ownership, including nested Repeat/Sequence/Together/Timeline',()=>{
 const r=createStructureRuntime();
 r.defineStructure('together','together',[{toyId:'A',durationTicks:96},{toyId:'B',durationTicks:192}]);
 r.defineStructure('timeline','timeline',[{structureId:'together',offsetTick:96}]);
 r.defineStructure('repeat','repeat',[{structureId:'timeline'}],0,{count:2});
 r.defineSequence('song',[{structureId:'repeat'},{toyId:'outro',durationTicks:96}]);
 r.startStructure('song',0,{quantize:false});
 assert.equal(r.getDefinition('song').durationTicks,672);
 assert.deepEqual(r.turnsInWindow('song',0,10000).map(t=>[t.toyId,t.startTick]),[['A',96],['B',96],['A',384],['B',384],['outro',576]]);
 assert.ok(r.debugSnapshot().definitions.every(d=>d.finite));
});

test('root Sequence cycles the whole nested group then Outro; Together repeats as one group',()=>{
 const h=harness({A:384,B:768,C:384});try{
  const group=h.structures.createStandalone('together'),song=h.structures.createStandalone('sequence');
  h.child(group.id,'A');h.child(group.id,'B',1);h.child(song.id,group.id);h.child(song.id,'C',1);h.root(song.id);h.sync();
  assert.deepEqual(h.turns(0,2304).map(t=>[t.toyId,t.startTick]),[['A',0],['B',0],['C',768],['A',1152],['B',1152],['C',1920]]);
  h.model.disconnect(h.model.getParent(group.id).id);h.root(group.id);h.sync();
  assert.deepEqual(h.turns(0,1536).filter(t=>t.toyId!=='C').map(t=>[t.toyId,t.startTick]),[['A',0],['B',0],['A',768],['B',768]]);
 }finally{h.close();}
});

test('root progression plays C Am F G twice; nested progression completes before Outro',()=>{
 const h=harness({A:384,C:384});try{
  const progression=h.structures.createStandalone('chord-progression');h.child(progression.id,'A');h.root(progression.id);h.sync();
  assert.deepEqual(h.turns(0,3072).map(t=>resolveChordAtTick(t.context,t.startTick).root),['C','A','F','G','C','A','F','G']);
  const song=h.structures.createStandalone('sequence');h.child(song.id,progression.id);h.child(song.id,'C',1);h.root(song.id);h.sync();
  assert.deepEqual(h.turns(0,3840).map(t=>[t.toyId,t.startTick]),[['A',0],['A',384],['A',768],['A',1152],['C',1536],['A',1920],['A',2304],['A',2688],['A',3072],['C',3456]]);
 }finally{h.close();}
});

test('disconnect revokes future occurrences; reconnect and retrigger establish gates on the shared phase lattice',()=>{
 const h=harness({A:384,B:384});try{
  const edge=h.root('A');h.root('B');h.sync();const pending=h.turns(400,800).find(t=>t.toyId==='A');
  assert.equal(isPlaybackOccurrenceValid(pending.playbackInstance),true);
  h.state.currentTick=400;h.state.state='playing';h.model.disconnect(edge.id);h.sync();
  assert.ok(h.turns(400,2000).every(t=>t.toyId==='B'));assert.equal(isPlaybackOccurrenceValid(pending.playbackInstance),false);
  assert.equal(h.model.getParent('A'),null);h.root('A');h.sync();
  const instance=h.adapter.runtime.getInstance('sequence:A');assert.equal(instance.startTick,480);
  assert.deepEqual(h.turns(400,1248).filter(t=>t.toyId==='A').map(t=>t.startTick),[480,768,1152]);
  h.adapter.retrigger('A',{state:'playing',currentTick:500});h.state.currentTick=510;h.sync();
  assert.equal(h.adapter.runtime.getInstance('sequence:A').startTick,576,'resync must not restart a deliberately retriggered root');
 }finally{h.close();}
});

test('live duration changes retain the root anchor, committed occurrence and align later starts to the new duration',()=>{
 const h=harness({A:384});try{
  const repeat=h.structures.createStandalone('repeat');h.structures.setCount(repeat.id,2);h.child(repeat.id,'A');h.root(repeat.id);h.sync();
  h.turns(0,100);const root=h.adapter.runtime.getInstance(repeat.definitionId);
  h.state.currentTick=100;h.structures.setCount(repeat.id,3);h.sync();
  assert.equal(root.startTick,0);assert.equal(h.adapter.runtime.getInstance(repeat.definitionId),root);
  const cycles=[...new Set(h.turns(100,4608).map(t=>t.rootCycleStartTick))];assert.deepEqual(cycles,[0,1152,2304,3456]);
  h.state.currentTick=4700;h.structures.setCount(repeat.id,1);h.sync();
  const future=h.turns(4800,7000);assert.ok(future.every(t=>(t.rootCycleStartTick-root.startTick)%384===0));
  assert.equal(new Set(future.map(t=>t.id)).size,future.length);
 }finally{h.close();}
});

test('pause/resume, tempo and board edits preserve root instance and tick anchors',()=>{
 const h=harness({A:384});try{
  h.root('A');h.sync();h.state.currentTick=500;const before=h.turns(500,501)[0];
  for(const state of ['paused','playing']){h.state.state=state;h.state.bpm=73;h.sync();assert.equal(h.turns(500,501)[0].id,before.id);}
  assert.equal(h.adapter.runtime.getInstance('sequence:A').startTick,0);
 }finally{h.close();}
});

test('a duration growth waits for the new anchored boundary without an extra old-length cycle',()=>{
 const r=createStructureRuntime();r.defineSequence('root',[{toyId:'A',durationTicks:96}]);
 const root=r.startStructure('root',0,{quantize:false,loop:true});root.rootAnchor=true;r.commitThrough('root',48);
 r.defineSequence('root',[{toyId:'A',durationTicks:192}],48);
 assert.deepEqual(r.turnsInWindow('root',48,576).map(t=>[t.startTick,t.endTick]),[[0,96],[192,384],[384,576]]);
 assert.equal(r.rootCycleAtTick('root',120),null);assert.equal(r.rootCycleAtTick('root',192).startTick,192);
});

test('root feedback waits until playing and does not reflash the same cycle on resume',()=>{
 const h=harness({A:384});try{
  const pulses=[];h.close();
  const adapter=createChainSequenceAdapter({connectionModel:h.model,getToy:id=>h.panels.find(p=>p.id===id),chainState:new Map(),
   onRootCycle:p=>{if(h.state.state!=='playing')return false;pulses.push(p.startTick);}});
  h.root('A');const sync=()=>adapter.sync(h.panels,h.state,{connections:[]});sync();assert.deepEqual(pulses,[]);
  h.state.state='playing';sync();assert.deepEqual(pulses,[0]);
  h.state.currentTick=96;h.state.state='paused';sync();h.state.state='playing';sync();assert.deepEqual(pulses,[0]);
  adapter.updateCurrent(384);assert.deepEqual(pulses,[0,384]);adapter.reset();
 }finally{h.close();}
});

test('root energy pulses once per cycle even with simultaneous children, Timeline silence, and empty progression',()=>{
 const h=harness({A:384,B:384});try{
  const timeline=h.structures.createStandalone('timeline');h.child(timeline.id,'A');h.child(timeline.id,'B',1);
  h.structures.setOffset(timeline.id,'child:0',384);h.structures.setOffset(timeline.id,'child:1',384);
  h.root(timeline.id);h.sync();assert.equal(h.pulses.length,1);assert.equal(h.pulses[0].startTick,0);
  for(const tick of [96,192,384,385,480,768,769])h.adapter.updateCurrent(tick);
  assert.deepEqual(h.pulses.map(p=>p.startTick),[0,768]);
  const progression=h.structures.createStandalone('chord-progression');h.root(progression.id);h.sync();
  h.adapter.updateCurrent(1536);assert.ok(h.pulses.some(p=>p.headId===progression.id&&p.startTick===1536));
  assert.equal(structureFlashStrength(new Map([['edge',{fromId:'H',toId:timeline.id,rootActivation:true,structureUntil:320}]]),timeline.id,0),1);
 }finally{h.close();}
});

test('authored topology round trips without root cycle state, restoring powered roots and finite nesting',()=>{
 const h=harness({A:384,B:384});try{
  const song=h.structures.createStandalone('sequence');h.child(song.id,'A');h.child(song.id,'B',1);h.root(song.id);h.sync();h.turns(2000,3000);
  const saved=JSON.parse(JSON.stringify({nodes:h.structures.list(),edges:h.model.list()}));assert.doesNotMatch(JSON.stringify(saved),/rootAnchor|rootCycle|scheduledUntil|powerConnectionId/);
  h.adapter.reset();h.model.list().forEach(e=>h.model.disconnect(e.id));h.structures.restore(saved.nodes);
  saved.edges.forEach(e=>assert.equal(h.model.connect(e.kind,e.from,e.to,{id:e.id}).ok,true));h.sync();
  assert.deepEqual(h.turns(0,1536).map(t=>[t.toyId,t.startTick]),[['A',0],['B',384],['A',768],['B',1152]]);
 }finally{h.close();}
});

test('browser proof fixture authors three direct roots with 1/2/4 bar periods',()=>{
 const scene=JSON.parse(readFileSync(new URL('../resources/heartbeat-roots.scene.json',import.meta.url),'utf8')).payload;
 assert.deepEqual(scene.connections.filter(e=>e.kind==='transport').map(e=>e.to.objectId).sort(),['proof-chords','proof-drums','proof-melody-repeat']);
 const melody=scene.structureToys.find(s=>s.id==='proof-melody-repeat');assert.equal(melody.type,'repeat');assert.equal(melody.count,2);
 const progression=scene.structureToys.find(s=>s.id==='proof-chords');assert.equal(progression.chords.length*progression.stepTicks,1536);
 assert.equal(scene.structureToys.some(s=>s.type==='together'),false);
});
