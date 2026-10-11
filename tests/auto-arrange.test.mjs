import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutoArranger,selectArrangementSources,arrangementRole} from '../src/auto-arrange.js';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createStructureToyModel,structureToyWidth,structureToyHeight} from '../src/structure-toys.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {ensurePlaybackInstance,clearPlaybackInstancesForTests} from '../src/playback-instances.js';
import {resolveMusicalPitch,noteMidi} from '../src/harmonic-adaptation.js';
import {MAIN_TRANSPORT_ID} from '../src/transport-registry.js';
import {rectanglesOverlap} from '../src/graph-placement.js';
import {getActivationConnections} from '../src/graph-transition-feedback.js';

const input=objectId=>({objectId,portId:'input'}),out=(objectId,portId='output')=>({objectId,portId});
function harness(roles=['rhythm','accompaniment','melody']){
 clearPlaybackInstancesForTests();
 const model=createConnectionModel();model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS,transportId:MAIN_TRANSPORT_ID});
 const panels=[],generated=[],notes=[];
 function add(role,id=role){
  const panel={id,dataset:{toy:role==='rhythm'?'loopgrid':'drawgrid',musicalRole:role==='rhythm'?'percussion':role,steps:'8'},
   sourceNotes:role==='melody'?['E4','G4','A4','G4','E4','D4','F#4','C4']:Array(8).fill(role==='rhythm'?'C4':'C3'),__seqPattern:{},__seqRev:0};
  panel.__sequencerSchedule=(step,time,metadata)=>notes.push({toyId:id,...resolveMusicalPitch({sourcePitch:panel.sourceNotes[step],eventTick:metadata.eventTick,context:metadata.context,role:panel.dataset.musicalRole})});
  panels.push(panel);model.registerObject(id);ensurePlaybackInstance(id,{loopLengthTicks:384});model.connect('transport',out(MAIN_TRANSPORT_ID),input(id));return panel;
 }
 roles.forEach(role=>add(role));
 const structures=createStructureToyModel(model),adapter=createChainSequenceAdapter({model,connectionModel:model,getToy:id=>panels.find(p=>p.id===id),chainState:new Map()});
 const state={state:'paused',currentTick:0};
 const sync=()=>adapter.sync(panels,state,{connections:model.list('sequence'),structures:structures.list()});
 const arranger=createAutoArranger({model,structures,getPanels:()=>panels,createSource:async role=>{generated.push(role);return add(role,'filled-'+role);}});
 const schedule=(from=0,to=6144)=>{
  const scheduler=createSequencerScheduler();scheduler.tick({currentTick:from,lookaheadEndTick:to,playbackTurns:adapter.turnsForLookahead(from,to),activeToyIds:new Set(),getToy:id=>panels.find(p=>p.id===id),tickToAudioTime:t=>t/192});scheduler.dispose();
 };
 const close=()=>{adapter.reset();structures.dispose();};
 return {model,panels,structures,adapter,arranger,generated,notes,sync,schedule,close,add,state};
}

test('three supplied roles build a real finite 16-bar graph with seven named structures and unchanged sources',async()=>{
 const h=harness();try{
  const before=structuredClone(h.panels.map(p=>({notes:p.sourceNotes,dataset:p.dataset})));const result=await h.arranger.arrange();h.sync();
  assert.deepEqual(h.generated,[]);assert.equal(h.structures.list().length,7);
  const root=h.structures.get(result.rootId);assert.equal(root.type,'sequence');assert.equal(h.model.getParent(root.id).kind,'transport');
  assert.equal(h.adapter.runtime.getDefinition(root.definitionId).durationTicks,6144);
  assert.deepEqual(h.model.list('sequence').filter(e=>e.from.objectId===root.id).map(e=>h.structures.get(e.to.objectId).name),['Intro','A','B','Outro']);
  const bars=Array.from({length:16},(_,bar)=>h.adapter.runtime.turnsInWindow(root.definitionId,bar*384,bar*384+1).map(t=>t.toyId).sort());
  assert.ok(bars.slice(0,4).every(ids=>JSON.stringify(ids)==='["accompaniment"]'));
  assert.ok(bars.slice(4,12).every(ids=>JSON.stringify(ids)==='["accompaniment","melody","rhythm"]'));
  assert.ok(bars.slice(12).every(ids=>JSON.stringify(ids)==='["accompaniment"]'));
  assert.deepEqual(h.panels.map(p=>({notes:p.sourceNotes,dataset:{toy:p.dataset.toy,musicalRole:p.dataset.musicalRole,steps:p.dataset.steps}})),before);
  assert.equal(h.model.list('sequence').filter(e=>e.to.portId==='pattern').length,8);
  assert.ok(h.panels.every(p=>h.model.getParent(p.id)===null && h.model.isRooted(p.id)));
  for(const [i,a] of h.structures.list().entries())for(const b of h.structures.list().slice(i+1))assert.equal(rectanglesOverlap({...a,width:structureToyWidth(a),height:structureToyHeight(a)},{...b,width:structureToyWidth(b),height:structureToyHeight(b)}),false);
 }finally{h.close();}
});

for(const roles of [['melody'],['accompaniment'],['rhythm'],['rhythm','melody'],['accompaniment','melody']])test('missing roles become ordinary editable sources for '+roles.join('+'),async()=>{
 const h=harness(roles);try{
  const originals=h.panels.map(p=>({id:p.id,notes:structuredClone(p.sourceNotes)})),result=await h.arranger.arrange();h.sync();
  assert.equal(h.panels.length,3);assert.deepEqual(h.generated.sort(),['rhythm','accompaniment','melody'].filter(r=>!roles.includes(r)).sort());
  for(const p of originals)assert.deepEqual(h.panels.find(t=>t.id===p.id).sourceNotes,p.notes);
  for(const role of h.generated){const p=h.panels.find(p=>p.id===result.sourceIds[role]);assert.equal(arrangementRole(p),role);assert.equal(p.dataset.autoArrangeOrigin,'filled');p.sourceNotes[0]='D4';}
  assert.equal(h.adapter.runtime.getDefinition(h.structures.get(result.rootId).definitionId).durationTicks,6144);
 }finally{h.close();}
});

test('selection is deterministic, prefers authored sources, ignores instruments, and excludes Drum Kit',()=>{
 const p=(id,toy,role,filled=false)=>({id,dataset:{toy,musicalRole:role,instrument:'bass',...(filled?{autoArrangeOrigin:'filled'}:{})}});
 const panels=[p('z','drawgrid','melody'),p('a','drawgrid','melody'),p('0','drawgrid','melody',true),p('kit','loopgrid-drum','percussion'),p('bass','drawgrid','bass')];
 assert.equal(selectArrangementSources(panels).melody.id,'a');assert.equal(selectArrangementSources(panels.reverse()).melody.id,'a');
 assert.equal(selectArrangementSources(panels).accompaniment.id,'bass');assert.equal(selectArrangementSources(panels).rhythm,null);
});

test('production scheduling adapts accompaniment, preserves the melody motif and drums, then repeats the complete piece',async()=>{
 const h=harness();try{
  const result=await h.arranger.arrange();h.sync();h.schedule();
  const accompaniment=h.notes.filter(n=>n.toyId==='accompaniment');assert.equal(accompaniment.length,128);
  assert.deepEqual(accompaniment.filter(n=>n.eventTick%384===0).map(n=>n.finalNote),['C3','A2','F3','G2','C3','A2','F3','G2','F3','G2','A2','C3','C3','A2','F3','G2']);
  const melody=h.notes.filter(n=>n.toyId==='melody');assert.equal(melody.length,64);assert.ok(melody.every(n=>Math.abs(noteMidi(n.finalNote)-noteMidi(n.sourceNote))<=1));
  const drums=h.notes.filter(n=>n.toyId==='rhythm');assert.equal(drums.length,64);assert.ok(drums.every(n=>n.finalNote===n.sourceNote && n.resolvedChord===null));
  const root=h.structures.get(result.rootId),first=h.adapter.runtime.turnsInWindow(root.definitionId,0,6144),second=h.adapter.runtime.turnsInWindow(root.definitionId,6144,12288);
  assert.deepEqual(second.map(t=>[t.toyId,t.startTick-6144]),first.map(t=>[t.toyId,t.startTick]));
  assert.ok(second.every(t=>t.rootCycleStartTick===6144));
  const turn=h.adapter.runtime.turnsInWindow(root.definitionId,1536,1537).find(t=>t.toyId==='accompaniment');
  const edges=getActivationConnections(h.model,turn);assert.ok(edges.some(e=>e.to.portId==='pattern'));
  assert.ok(edges.every(e=>e.to.objectId==='accompaniment'||turn.structureDefinitionIds.includes(h.structures.get(e.to.objectId)?.definitionId)||e.to.objectId===root.id));
 }finally{h.close();}
});

test('Arrange Again replaces only owned topology, preserves every source and unrelated graph, including edited fill',async()=>{
 const h=harness(['melody']);try{
  const unrelated=h.structures.createStandalone('repeat');const spare=h.add('rhythm','z-unrelated');
  h.model.connect('sequence',out(unrelated.id,'child:0'),input(spare.id));h.model.connect('transport',out(MAIN_TRANSPORT_ID),input(unrelated.id));
  const unrelatedEdges=h.model.list().filter(e=>e.from.objectId===unrelated.id||e.to.objectId===unrelated.id);
  const first=await h.arranger.arrange();h.panels.find(p=>p.id===first.sourceIds.accompaniment).sourceNotes[0]='E3';
  const sources=structuredClone(h.panels.map(p=>p.sourceNotes));const second=await h.arranger.arrange();h.sync();
  assert.equal(h.structures.get(first.rootId),null);assert.equal(h.structures.list().length,8);assert.deepEqual(h.panels.map(p=>p.sourceNotes),sources);
  assert.deepEqual(second.sourceIds,first.sourceIds);assert.deepEqual(h.model.list().filter(e=>e.from.objectId===unrelated.id||e.to.objectId===unrelated.id),unrelatedEdges);
  assert.equal(h.panels.filter(p=>p.dataset.autoArrangeOrigin==='filled').length,1);assert.ok(h.structures.get(unrelated.id));
 }finally{h.close();}
});

test('ordinary topology and ownership persist/reload without regeneration, supporting safe Arrange Again',async()=>{
 const h=harness();try{
  const first=await h.arranger.arrange();const saved=JSON.parse(JSON.stringify({nodes:h.structures.list(),edges:h.model.list()}));
  h.adapter.reset();h.model.list().forEach(e=>h.model.disconnect(e.id));h.structures.restore(saved.nodes);saved.edges.forEach(e=>assert.equal(h.model.connect(e.kind,e.from,e.to,{id:e.id}).ok,true));h.sync();
  const root=h.structures.get(first.rootId);assert.equal(h.adapter.runtime.getDefinition(root.definitionId).durationTicks,6144);assert.equal(h.adapter.runtime.turnsInWindow(root.definitionId,6144,6145).length,1);
  await h.arranger.arrange();assert.equal(h.structures.list().length,7);assert.equal(h.panels.length,3);
 }finally{h.close();}
});

test('failed graph construction rolls back prior arrangement and unrelated topology without touching notes',async()=>{
 const h=harness();try{
  await h.arranger.arrange();const ids=h.structures.list().map(s=>s.id),edges=h.model.list(),notes=structuredClone(h.panels.map(p=>p.sourceNotes));
  const broken=createAutoArranger({model:h.model,structures:h.structures,getPanels:()=>h.panels,createSource:()=>assert.fail(),place:()=>({x:NaN,y:0})});
  await assert.rejects(broken.arrange(),/place/);assert.deepEqual(h.structures.list().map(s=>s.id),ids);assert.deepEqual(h.model.list(),edges);assert.deepEqual(h.panels.map(p=>p.sourceNotes),notes);
 }finally{h.close();}
});

test('zero ideas is a clear error; references do not replace primary parents and lose power when the arrangement disconnects',async()=>{
 const empty=harness([]);try{await assert.rejects(empty.arranger.arrange(),/Make a musical idea/);assert.equal(empty.panels.length,0);}finally{empty.close();}
 const h=harness();try{
  const result=await h.arranger.arrange();h.sync();const parent=h.model.getParent(result.rootId);h.model.disconnect(parent.id);h.sync();assert.deepEqual(h.adapter.turnsForLookahead(0,20000),[]);
  assert.ok(h.panels.every(p=>!h.model.isRooted(p.id)));
 }finally{h.close();}
});

test('references play only the source pattern while an authored outgoing chain stays intact',async()=>{
 const h=harness();try{
  const tail=h.add('melody','z-tail');h.model.connect('sequence',out('melody'),input(tail.id));
  const edge=h.model.getParent(tail.id);const result=await h.arranger.arrange();h.sync();
  const root=h.structures.get(result.rootId);assert.equal(h.adapter.runtime.getDefinition(root.definitionId).durationTicks,6144);
  assert.ok(h.adapter.runtime.turnsInWindow(root.definitionId,0,6144).every(t=>t.toyId!==tail.id));assert.deepEqual(h.model.getParent(tail.id),edge);
  h.panels.find(p=>p.id==='melody').sourceNotes[0]='B4';h.schedule(1536,1537);
  assert.equal(h.notes.find(n=>n.toyId==='melody').sourceNote,'B4');
 }finally{h.close();}
});

test('sources from another Heartbeat stay intact while missing roles fill the chosen domain',async()=>{
 const h=harness();try{
  h.model.registerObject('other-heartbeat',{ports:HEARTBEAT_PORTS,transportId:'other'});
  h.model.connect('transport',out('other-heartbeat'),input('accompaniment'));
  const original=h.model.getParent('accompaniment'),result=await h.arranger.arrange();
  assert.equal(result.sourceIds.accompaniment,'filled-accompaniment');assert.deepEqual(h.model.getParent('accompaniment'),original);
  assert.equal(h.model.getTransportId(result.rootId),MAIN_TRANSPORT_ID);assert.equal(h.model.getTransportId('filled-accompaniment'),MAIN_TRANSPORT_ID);
 }finally{h.close();}
});
