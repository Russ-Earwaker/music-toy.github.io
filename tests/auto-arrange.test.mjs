import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutoArranger,selectArrangementSources,arrangementRole} from '../src/auto-arrange.js';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createStructureToyModel,structureToyWidth,structureToyHeight} from '../src/structure-toys.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {ensurePlaybackInstance,clearPlaybackInstancesForTests,getPlaybackInstance} from '../src/playback-instances.js';
import {activeToyChord} from '../src/toy-chord-indicator.js';
import {resolveMusicalPitch,noteMidi} from '../src/harmonic-adaptation.js';
import {MAIN_TRANSPORT_ID} from '../src/transport-registry.js';
import {rectanglesOverlap} from '../src/graph-placement.js';
import {getActivationConnections} from '../src/graph-transition-feedback.js';

const panelsMaster=(h,id)=>h.panels.find(p=>p.id===id)?.dataset.masterToyId||id;
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
 const instanceSerial=new Map();
 const createInstance=(master,options)=>{const n=(instanceSerial.get(master.id)||0)+1;instanceSerial.set(master.id,n);const p={id:master.id+'.'+n,dataset:{...master.dataset,masterToyId:master.id,autoArrangeOwner:options.autoArrangeOwner},get sourceNotes(){return master.sourceNotes;},__sequencerSchedule:(...args)=>master.__sequencerSchedule(...args)};panels.push(p);model.registerObject(p.id);ensurePlaybackInstance(p.id,{loopLengthTicks:getPlaybackInstance(master.id)?.loopLengthTicks||384});return p;};
 const removeInstances=owner=>{for(const p of [...panels])if(p.dataset.autoArrangeOwner===owner){model.removeObject(p.id);panels.splice(panels.indexOf(p),1);}};
 const arranger=createAutoArranger({model,structures,getPanels:()=>panels,createInstance,removeInstances,createSource:async role=>{generated.push(role);return add(role,'filled-'+role);}});
 const schedule=(from=0,to=6144)=>{
  const scheduler=createSequencerScheduler();scheduler.tick({currentTick:from,lookaheadEndTick:to,playbackTurns:adapter.turnsForLookahead(from,to),activeToyIds:new Set(),getToy:id=>panels.find(p=>p.id===id),tickToAudioTime:t=>t/192});scheduler.dispose();
 };
 const close=()=>{adapter.reset();structures.dispose();};
 return {model,panels,structures,adapter,arranger,generated,notes,sync,schedule,close,add,state};
}

test('three supplied roles build a real finite 16-bar graph with compact B Timeline branches and unchanged sources',async()=>{
 const h=harness();try{
  const before=structuredClone(h.panels.map(p=>({notes:p.sourceNotes,dataset:p.dataset})));const result=await h.arranger.arrange();h.sync();
  assert.deepEqual(h.generated,[]);assert.equal(h.structures.list().length,10);
  const root=h.structures.get(result.rootId);assert.equal(root.type,'sequence');assert.equal(h.model.getParent(root.id).kind,'transport');
  assert.equal(h.adapter.runtime.getDefinition(root.definitionId).durationTicks,6144);
  assert.deepEqual(h.model.list('sequence').filter(e=>e.from.objectId===root.id).map(e=>h.structures.get(e.to.objectId).name),['Intro','A','B','Outro']);
  const bars=Array.from({length:16},(_,bar)=>h.adapter.runtime.turnsInWindow(root.definitionId,bar*384,bar*384+1).map(t=>panelsMaster(h,t.toyId)).sort());
  assert.ok(bars.slice(0,4).every(ids=>JSON.stringify(ids)==='["accompaniment"]'));
  assert.ok(bars.slice(4,8).every(ids=>JSON.stringify(ids)==='["accompaniment","melody","rhythm"]'));
  assert.deepEqual(bars.slice(8,12),[['accompaniment'],['accompaniment','rhythm'],['accompaniment','melody','rhythm'],['accompaniment','melody','rhythm']]);
  assert.ok(bars.slice(12).every(ids=>JSON.stringify(ids)==='["accompaniment"]'));
  assert.deepEqual(h.panels.filter(p=>!p.dataset.masterToyId).map(p=>({notes:p.sourceNotes,dataset:{toy:p.dataset.toy,musicalRole:p.dataset.musicalRole,steps:p.dataset.steps}})),before);
  assert.equal(h.model.list('sequence').filter(e=>h.panels.find(p=>p.id===e.to.objectId)?.dataset.masterToyId).length,8);
  assert.ok(h.panels.filter(p=>!p.dataset.masterToyId).every(p=>h.model.getParent(p.id)===null));assert.equal(h.panels.filter(p=>p.dataset.masterToyId).length,8);
  for(const [i,a] of h.structures.list().entries())for(const b of h.structures.list().slice(i+1))assert.equal(rectanglesOverlap({...a,width:structureToyWidth(a),height:structureToyHeight(a)},{...b,width:structureToyWidth(b),height:structureToyHeight(b)}),false);
 }finally{h.close();}
});

for(const roles of [['melody'],['accompaniment'],['rhythm'],['rhythm','melody'],['accompaniment','melody']])test('missing roles become ordinary editable sources for '+roles.join('+'),async()=>{
 const h=harness(roles);try{
  const originals=h.panels.map(p=>({id:p.id,notes:structuredClone(p.sourceNotes)})),result=await h.arranger.arrange();h.sync();
  assert.equal(h.panels.filter(p=>!p.dataset.masterToyId).length,3);assert.deepEqual(h.generated.sort(),['rhythm','accompaniment','melody'].filter(r=>!roles.includes(r)).sort());
  for(const p of originals)assert.deepEqual(h.panels.find(t=>t.id===p.id).sourceNotes,p.notes);
  for(const role of h.generated){const p=h.panels.find(p=>p.id===result.sourceIds[role]);assert.equal(arrangementRole(p),role);assert.equal(p.dataset.autoArrangeOrigin,'filled');p.sourceNotes[0]='D4';}
  assert.equal(h.adapter.runtime.getDefinition(h.structures.get(result.rootId).definitionId).durationTicks,6144);
 }finally{h.close();}
});

test('16-bar chord display follows each Instance section including reordered B and complete piece looping',async()=>{
 const h=harness();try{
  await h.arranger.arrange();h.sync();
  const expected=['C','Am','F','G','C','Am','F','G','F','G','Am','C','C','Am','F','G'];
  for(let bar=0;bar<32;bar++){
   const tick=bar*384;h.adapter.updateCurrent(tick);
   for(const panel of h.panels){
    const instance=getPlaybackInstance(panel.id),role=panel.dataset.musicalRole;
    const displayed=activeToyChord({instance,currentTick:tick,playing:true,role});
    if(!panel.dataset.masterToyId || role==='percussion' || !instance?.active)assert.equal(displayed,null);
    else assert.equal(displayed,expected[bar%16],`${panel.id} at bar ${bar}`);
   }
  }
 }finally{h.close();}
});

test('B Timeline sustains linked layers with explicit offsets, current harmony and stable Heartbeat phase',async()=>{
 const h=harness();try{
  const before=h.panels.map(p=>structuredClone(p.sourceNotes)),result=await h.arranger.arrange();h.sync();
  const a=h.structures.list().find(n=>n.name==='A layers'),b=h.structures.list().find(n=>n.name==='B layers');
  assert.equal(a.type,'together');assert.equal(b.type,'timeline');assert.deepEqual(b.entries.map(e=>e.offsetTick),[0,384,768]);
  assert.deepEqual(b.entries.map(e=>h.structures.get(e.childId).count),[4,3,2]);assert.equal(h.structures.durationOf(b.id),1536);
  assert.equal(h.adapter.runtime.getInstance(h.structures.get(result.rootId).definitionId).phaseOriginTick,0);
  const bInstances=b.entries.map(e=>h.panels.find(p=>p.id===h.model.list('sequence').find(c=>c.from.objectId===e.childId).to.objectId));
  assert.deepEqual(bInstances.map(p=>p.dataset.masterToyId),['accompaniment','rhythm','melody']);
  assert.ok(bInstances.every(p=>p.sourceNotes===h.panels.find(m=>m.id===p.dataset.masterToyId).sourceNotes));
  for(const cycle of [0,6144])for(let bar=0;bar<4;bar++){
   const tick=cycle+3072+bar*384;h.adapter.updateCurrent(tick);
   const active=h.adapter.turnsForLookahead(tick,tick+1);
   assert.deepEqual(active.map(t=>panelsMaster(h,t.toyId)).sort(),bar===0?['accompaniment']:bar===1?['accompaniment','rhythm']:['accompaniment','melody','rhythm']);
   for(const turn of active){const role=h.panels.find(p=>p.id===turn.toyId).dataset.musicalRole;
    assert.equal(turn.playbackInstance.sourcePhaseOriginTick,{accompaniment:0,percussion:384,melody:768}[role]);
    assert.equal(activeToyChord({instance:turn.playbackInstance,currentTick:tick,playing:true,role}),role==='percussion'?null:['F','G','Am','C'][bar]);
   }
  }
  const aTurns=h.adapter.turnsForLookahead(1536,1537);assert.equal(aTurns.length,3);assert.ok(aTurns.every(t=>t.playbackInstance.sourcePhaseOriginTick===0));
  assert.deepEqual(h.panels.filter(p=>!p.dataset.masterToyId).map(p=>p.sourceNotes),before);
 }finally{h.close();}
});

test('B Repeat counts respect longer natural sources while the complete arrangement stays 16 bars',async()=>{
 const h=harness();try{
  ensurePlaybackInstance('accompaniment',{loopLengthTicks:768});const result=await h.arranger.arrange();h.sync();
  const timeline=h.structures.list().find(n=>n.type==='timeline');assert.deepEqual(timeline.entries.map(e=>h.structures.get(e.childId).count),[2,3,2]);
  assert.equal(h.structures.durationOf(timeline.id),1536);assert.equal(h.adapter.runtime.getDefinition(h.structures.get(result.rootId).definitionId).durationTicks,6144);
  for(const tick of [3072,3456,3840,4224])assert.ok(h.adapter.turnsForLookahead(tick,tick+1).some(t=>panelsMaster(h,t.toyId)==='accompaniment'));
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
  const melody=h.notes.filter(n=>n.toyId==='melody');assert.equal(melody.length,48);assert.ok(melody.every(n=>Math.abs(noteMidi(n.finalNote)-noteMidi(n.sourceNote))<=1));
  const drums=h.notes.filter(n=>n.toyId==='rhythm');assert.equal(drums.length,56);assert.ok(drums.every(n=>n.finalNote===n.sourceNote && n.resolvedChord===null));
  const root=h.structures.get(result.rootId),first=h.adapter.runtime.turnsInWindow(root.definitionId,0,6144),second=h.adapter.runtime.turnsInWindow(root.definitionId,6144,12288);
  assert.deepEqual(second.map(t=>[t.toyId,t.startTick-6144]),first.map(t=>[t.toyId,t.startTick]));
  assert.ok(second.every(t=>t.rootCycleStartTick===6144));
  const turn=h.adapter.runtime.turnsInWindow(root.definitionId,1536,1537).find(t=>panelsMaster(h,t.toyId)==='accompaniment');
  const edges=getActivationConnections(h.model,turn);assert.ok(edges.some(e=>e.to.objectId===turn.toyId));
  assert.ok(edges.every(e=>e.to.objectId===turn.toyId||turn.structureDefinitionIds.includes(h.structures.get(e.to.objectId)?.definitionId)||e.to.objectId===root.id));
 }finally{h.close();}
});

test('Arrange Again replaces only owned topology, preserves every source and unrelated graph, including edited fill',async()=>{
 const h=harness(['melody']);try{
  const unrelated=h.structures.createStandalone('repeat');const spare=h.add('rhythm','z-unrelated');
  h.model.connect('sequence',out(unrelated.id,'child:0'),input(spare.id));h.model.connect('transport',out(MAIN_TRANSPORT_ID),input(unrelated.id));
  const unrelatedEdges=h.model.list().filter(e=>e.from.objectId===unrelated.id||e.to.objectId===unrelated.id);
  const first=await h.arranger.arrange();h.panels.find(p=>p.id===first.sourceIds.accompaniment).sourceNotes[0]='E3';
  h.structures.move(first.rootId,750,220,{manual:true});
  const sources=structuredClone(h.panels.filter(p=>!p.dataset.masterToyId).map(p=>p.sourceNotes));const second=await h.arranger.arrange();h.sync();
  assert.equal(h.structures.get(first.rootId),null);assert.equal(h.structures.list().length,11);assert.deepEqual(h.panels.filter(p=>!p.dataset.masterToyId).map(p=>p.sourceNotes),sources);
  assert.equal(h.structures.get(second.rootId).x,750);assert.equal(h.structures.get(second.rootId).y,220);
  assert.deepEqual(second.sourceIds,first.sourceIds);assert.deepEqual(h.model.list().filter(e=>e.from.objectId===unrelated.id||e.to.objectId===unrelated.id),unrelatedEdges);
  assert.equal(h.panels.filter(p=>!p.dataset.masterToyId&&p.dataset.autoArrangeOrigin==='filled').length,1);assert.ok(h.structures.get(unrelated.id));
 }finally{h.close();}
});

test('ordinary topology and ownership persist/reload without regeneration, supporting safe Arrange Again',async()=>{
 const h=harness();try{
  const first=await h.arranger.arrange();const saved=JSON.parse(JSON.stringify({nodes:h.structures.list(),edges:h.model.list()}));
  h.adapter.reset();h.model.list().forEach(e=>h.model.disconnect(e.id));h.structures.suspend(()=>{h.structures.restore(saved.nodes);saved.edges.forEach(e=>assert.equal(h.model.connect(e.kind,e.from,e.to,{id:e.id}).ok,true));});h.sync();
  const root=h.structures.get(first.rootId);assert.equal(h.adapter.runtime.getDefinition(root.definitionId).durationTicks,6144);assert.equal(h.adapter.runtime.turnsInWindow(root.definitionId,6144,6145).length,1);
  const timeline=h.structures.list().find(n=>n.type==='timeline');assert.deepEqual(timeline.entries.map(e=>e.offsetTick),[0,384,768]);
  const b=h.adapter.turnsForLookahead(3456,3457);assert.deepEqual(b.map(t=>panelsMaster(h,t.toyId)).sort(),['accompaniment','rhythm']);
  await h.arranger.arrange();assert.equal(h.structures.list().length,10);assert.equal(h.panels.filter(p=>!p.dataset.masterToyId).length,3);
 }finally{h.close();}
});

test('failed graph construction rolls back prior arrangement and unrelated topology without touching notes',async()=>{
 const h=harness();try{
  await h.arranger.arrange();const ids=h.structures.list().map(s=>s.id),edges=h.model.list(),notes=structuredClone(h.panels.filter(p=>!p.dataset.masterToyId).map(p=>p.sourceNotes));
  const broken=createAutoArranger({model:h.model,structures:h.structures,getPanels:()=>h.panels,createSource:()=>assert.fail(),place:()=>({x:NaN,y:0})});
  await assert.rejects(broken.arrange(),/place/);assert.deepEqual(h.structures.list().map(s=>s.id),ids);assert.deepEqual(h.model.list(),edges);assert.deepEqual(h.panels.filter(p=>!p.dataset.masterToyId).map(p=>p.sourceNotes),notes);
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
  assert.equal(h.model.getTransportId(result.rootId),MAIN_TRANSPORT_ID);assert.equal(h.model.getTransportId(h.panels.find(p=>p.dataset.masterToyId==='filled-accompaniment').id),MAIN_TRANSPORT_ID);
 }finally{h.close();}
});
