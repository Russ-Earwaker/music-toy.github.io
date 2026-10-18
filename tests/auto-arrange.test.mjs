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
test('Free Play Heartbeat arrangements leave a pre-existing arrangement intact',async()=>{
 const h=harness();
 try{
  const original=await h.arranger.arrange(),originalRoot=structuredClone(h.structures.get(original.rootId));
  const heartbeat='free-play-test';h.model.registerObject(heartbeat,{ports:HEARTBEAT_PORTS,transportId:heartbeat});
  const authored=['rhythm','accompaniment','melody'].map(role=>h.add(role,'play-'+role));
  for(const panel of authored){h.model.disconnect(h.model.getParent(panel.id).id);assert.equal(h.model.connect('transport',out(heartbeat),input(panel.id)).ok,true);}
  const result=await h.arranger.arrange({heartbeatId:heartbeat});
  assert.equal(h.model.getTransportId(result.rootId),heartbeat);
  assert.deepEqual(h.structures.get(original.rootId),originalRoot);
  assert.equal(h.model.getTransportId(original.rootId),MAIN_TRANSPORT_ID);
  assert.ok(authored.every(p=>result.inputReport.authoredSourceIds.includes(p.id)));
  const rebuilt=await h.arranger.arrange({heartbeatId:heartbeat});
  assert.equal(h.model.getTransportId(rebuilt.rootId),heartbeat);
  assert.deepEqual(h.structures.get(original.rootId),originalRoot);
 }finally{h.close();}
});
const input=objectId=>({objectId,portId:'input'}),out=(objectId,portId='output')=>({objectId,portId});
function harness(roles=['rhythm','accompaniment','melody']){
 clearPlaybackInstancesForTests();
 const model=createConnectionModel();model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS,transportId:MAIN_TRANSPORT_ID});
 const panels=[],generated=[],notes=[];
 function add(role,id=role){
  const percussion=['rhythm','extraRhythm'].includes(role);
  const panel={id,dataset:{toy:percussion?'loopgrid':'drawgrid',musicalRole:percussion?'percussion':role,steps:'8'},
   sourceNotes:role==='melody'?['E4','G4','A4','G4','E4','D4','F#4','C4']:Array(8).fill(percussion?'C4':'C3'),__gridState:{steps:role==='extraRhythm'?[false,true,false,true,true,false,true,false]:Array(8).fill(true)},__seqPattern:{},__seqRev:0};
  panel.__sequencerSchedule=(step,time,metadata)=>{if(percussion&&!panel.__gridState.steps[step])return;notes.push({toyId:id,...resolveMusicalPitch({sourcePitch:panel.sourceNotes[step],eventTick:metadata.eventTick,context:metadata.context,role:panel.dataset.musicalRole})});};
  panels.push(panel);model.registerObject(id);ensurePlaybackInstance(id,{loopLengthTicks:384});model.connect('transport',out(MAIN_TRANSPORT_ID),input(id));return panel;
 }
 roles.forEach(role=>add(role));
 const structures=createStructureToyModel(model),adapter=createChainSequenceAdapter({model,connectionModel:model,getToy:id=>panels.find(p=>p.id===id),chainState:new Map()});
 const state={state:'paused',currentTick:0};
 const sync=()=>adapter.sync(panels,state,{connections:model.list('sequence'),structures:structures.list()});
 const instanceSerial=new Map();
 const createInstance=(master,options)=>{const n=(instanceSerial.get(master.id)||0)+1;instanceSerial.set(master.id,n);const p={id:master.id+'.'+n,dataset:{...master.dataset,masterToyId:master.id,autoArrangeOwner:options.autoArrangeOwner},get sourceNotes(){return master.sourceNotes;},__sequencerSchedule:(...args)=>master.__sequencerSchedule(...args)};panels.push(p);model.registerObject(p.id);ensurePlaybackInstance(p.id,{loopLengthTicks:getPlaybackInstance(master.id)?.loopLengthTicks||384});return p;};
 const removeInstances=owner=>{for(const p of [...panels])if(p.dataset.autoArrangeOwner===owner){model.removeObject(p.id);panels.splice(panels.indexOf(p),1);}};
 const arranger=createAutoArranger({model,structures,getPanels:()=>panels,createInstance,removeInstances,createSource:async role=>{generated.push(role);const p=add(role,'filled-'+role);if(role==='melody'){p.dataset.steps='32';p.sourceNotes=Array.from({length:32},(_,i)=>p.sourceNotes[i%8]);ensurePlaybackInstance(p.id,{loopLengthTicks:1536});}return p;}});
 const schedule=(from=0,to=6144)=>{
  const scheduler=createSequencerScheduler();scheduler.tick({currentTick:from,lookaheadEndTick:to,playbackTurns:adapter.turnsForLookahead(from,to),activeToyIds:new Set(),getToy:id=>panels.find(p=>p.id===id),tickToAudioTime:t=>t/192});scheduler.dispose();
 };
 const close=()=>{adapter.reset();structures.dispose();};
 return {model,panels,structures,adapter,arranger,generated,notes,sync,schedule,close,add,state};
}

test('three supplied roles build a real finite 16-bar graph with B percussion lift and unchanged authored sources',async()=>{
 const h=harness();try{
  const before=structuredClone(h.panels.map(p=>({notes:p.sourceNotes,dataset:p.dataset})));const result=await h.arranger.arrange();h.sync();
  assert.deepEqual(h.generated,['extraRhythm']);assert.equal(h.structures.list().length,7);
  const root=h.structures.get(result.rootId);assert.equal(root.type,'sequence');assert.equal(h.model.getParent(root.id).kind,'transport');
  assert.equal(h.adapter.runtime.getDefinition(root.definitionId).durationTicks,6144);
  assert.deepEqual(h.model.list('sequence').filter(e=>e.from.objectId===root.id).map(e=>h.structures.get(e.to.objectId).name),['Intro','A','B','Outro']);
  const bars=Array.from({length:16},(_,bar)=>h.adapter.runtime.turnsInWindow(root.definitionId,bar*384,bar*384+1).map(t=>panelsMaster(h,t.toyId)).sort());
  assert.ok(bars.slice(0,4).every(ids=>JSON.stringify(ids)==='["accompaniment"]'));
  assert.ok(bars.slice(4,8).every(ids=>JSON.stringify(ids)==='["accompaniment","melody","rhythm"]'));
  assert.ok(bars.slice(8,12).every(ids=>JSON.stringify(ids)==='["accompaniment","filled-extraRhythm","melody","rhythm"]'));
  assert.ok(bars.slice(12).every(ids=>JSON.stringify(ids)==='["accompaniment"]'));
  assert.deepEqual(h.panels.filter(p=>!p.dataset.masterToyId&&!p.dataset.autoArrangeFill).map(p=>({notes:p.sourceNotes,dataset:{toy:p.dataset.toy,musicalRole:p.dataset.musicalRole,steps:p.dataset.steps}})),before);
  assert.equal(h.model.list('sequence').filter(e=>h.panels.find(p=>p.id===e.to.objectId)?.dataset.masterToyId).length,5);
  assert.ok(h.panels.filter(p=>!p.dataset.masterToyId).every(p=>h.model.getParent(p.id)?.kind==='sequence'));assert.equal(h.panels.filter(p=>p.dataset.masterToyId).length,5);
  for(const [i,a] of h.structures.list().entries())for(const b of h.structures.list().slice(i+1))assert.equal(rectanglesOverlap({...a,width:structureToyWidth(a),height:structureToyHeight(a)},{...b,width:structureToyWidth(b),height:structureToyHeight(b)}),false);
 }finally{h.close();}
});

for(const roles of [['melody'],['accompaniment'],['rhythm'],['rhythm','melody'],['accompaniment','melody']])test('missing roles become ordinary editable sources for '+roles.join('+'),async()=>{
 const h=harness(roles);try{
  const originals=h.panels.map(p=>({id:p.id,notes:structuredClone(p.sourceNotes)})),result=await h.arranger.arrange();h.sync();
  assert.equal(h.panels.filter(p=>!p.dataset.masterToyId).length,4);assert.deepEqual(h.generated.sort(),['extraRhythm',...['rhythm','accompaniment','melody'].filter(r=>!roles.includes(r))].sort());
  for(const p of originals)assert.deepEqual(h.panels.find(t=>t.id===p.id).sourceNotes,p.notes);
  for(const role of h.generated){const p=h.panels.find(p=>p.id===result.sourceIds[role]);assert.equal(arrangementRole(p),role==='extraRhythm'?null:role);assert.equal(p.dataset.autoArrangeOrigin,'filled');p.sourceNotes[0]='D4';}
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
    if(role==='percussion' || !instance?.active)assert.equal(displayed,null);
    else assert.equal(displayed,expected[bar%16],`${panel.id} at bar ${bar}`);
   }
  }
 }finally{h.close();}
});

test('B Together keeps normal melody register, extra percussion, harmony and Heartbeat phase',async()=>{
 const h=harness();try{
  const before=h.panels.map(p=>structuredClone(p.sourceNotes)),result=await h.arranger.arrange();h.sync();
  const a=h.structures.list().find(n=>n.name==='A layers'),b=h.structures.list().find(n=>n.name==='B layers');
  assert.equal(a.type,'together');assert.equal(b.type,'together');assert.ok(h.structures.list().every(n=>!['timeline','repeat','transpose'].includes(n.type)));
  assert.equal(h.adapter.runtime.getInstance(h.structures.get(result.rootId).definitionId).phaseOriginTick,0);
  const bInstances=h.adapter.turnsForLookahead(3072,3073).map(t=>h.panels.find(p=>p.id===t.toyId));
  assert.deepEqual(bInstances.map(p=>panelsMaster(h,p.id)).sort(),['accompaniment','filled-extraRhythm','melody','rhythm']);
  assert.ok(bInstances.every(p=>p.sourceNotes===h.panels.find(m=>m.id===panelsMaster(h,p.id)).sourceNotes));
  for(const cycle of [0,6144])for(let bar=0;bar<4;bar++){
   const tick=cycle+3072+bar*384;h.adapter.updateCurrent(tick);
   const active=h.adapter.turnsForLookahead(tick,tick+1);
   assert.deepEqual(active.map(t=>panelsMaster(h,t.toyId)).sort(),['accompaniment','filled-extraRhythm','melody','rhythm']);
   for(const turn of active){const role=h.panels.find(p=>p.id===turn.toyId).dataset.musicalRole;
    assert.equal(turn.playbackInstance.sourcePhaseOriginTick,0);
    assert.equal(turn.context.transposeSemitones,0);
    assert.equal(activeToyChord({instance:turn.playbackInstance,currentTick:tick,playing:true,role}),role==='percussion'?null:['F','G','Am','C'][bar]);
   }
  }
  const aTurns=h.adapter.turnsForLookahead(1536,1537);assert.equal(aTurns.length,3);assert.ok(aTurns.every(t=>t.playbackInstance.sourcePhaseOriginTick===0));
  assert.deepEqual(h.panels.filter(p=>!p.dataset.masterToyId&&!p.dataset.autoArrangeFill).map(p=>p.sourceNotes),before);
 }finally{h.close();}
});

test('B preserves longer natural source timing while the complete arrangement stays 16 bars',async()=>{
 const h=harness();try{
  ensurePlaybackInstance('accompaniment',{loopLengthTicks:768});const result=await h.arranger.arrange();h.sync();
  assert.equal(h.adapter.runtime.getDefinition(h.structures.get(result.rootId).definitionId).durationTicks,6144);
  for(const tick of [3072,3456,3840,4224])assert.ok(h.adapter.turnsForLookahead(tick,tick+1).some(t=>panelsMaster(h,t.toyId)==='accompaniment'));
 }finally{h.close();}
});

test('selection is deterministic, prefers authored sources and explicit roles, and includes Drum Kit',()=>{
 const p=(id,toy,role,filled=false)=>({id,dataset:{toy,musicalRole:role,instrument:'bass',...(filled?{autoArrangeOrigin:'filled'}:{})}});
 const panels=[p('z','drawgrid','melody'),p('a','drawgrid','melody'),p('0','drawgrid','melody',true),p('kit','loopgrid-drum','percussion'),p('bass','drawgrid','bass')];
 assert.equal(selectArrangementSources(panels).melody.id,'a');assert.equal(selectArrangementSources(panels.reverse()).melody.id,'a');
 assert.equal(selectArrangementSources(panels).accompaniment.id,'bass');assert.equal(selectArrangementSources(panels).rhythm.id,'kit');
});

test('new four-bar fill Melody is stored once, supports full A/B density and is reused after edits',async()=>{
 const h=harness(['rhythm','accompaniment']);try{
  const result=await h.arranger.arrange();h.sync();const master=h.panels.find(p=>p.id===result.sourceIds.melody),root=h.structures.get(result.rootId);
  assert.equal(master.dataset.steps,'32');assert.equal(master.sourceNotes.length,32);assert.equal(getPlaybackInstance(master.id).loopLengthTicks,1536);
  assert.equal(h.adapter.runtime.getDefinition(root.definitionId).durationTicks,6144);
  for(let bar=4;bar<12;bar++){
   const tick=bar*384,turns=h.adapter.turnsForLookahead(tick,tick+1),melody=turns.find(t=>panelsMaster(h,t.toyId)===master.id);
   assert.equal(turns.length,bar<8?3:4);assert.equal(melody.playbackInstance.loopLengthTicks,1536);assert.equal(melody.playbackInstance.sourcePhaseOriginTick,0);
  }
  const uses=h.panels.filter(p=>p.dataset.masterToyId===master.id);assert.equal(uses.length,1);assert.ok(uses.every(p=>p.sourceNotes===master.sourceNotes));
  master.sourceNotes[0]='B4';const edited=structuredClone(master.sourceNotes);await h.arranger.arrange();assert.deepEqual(master.sourceNotes,edited);assert.equal(h.generated.filter(r=>r==='melody').length,1);
 }finally{h.close();}
});

test('one editable extra rhythm Master is B-only, percussion, aligned, and reused without erasing edits',async()=>{
 const h=harness();try{
  const first=await h.arranger.arrange();h.sync();const extra=h.panels.find(p=>p.id===first.sourceIds.extraRhythm),main=h.panels.find(p=>p.id===first.sourceIds.rhythm);
  assert.equal(extra.dataset.toy,'loopgrid');assert.equal(extra.dataset.masterToyId,undefined);assert.equal(extra.dataset.autoArrangeOrigin,'filled');assert.equal(extra.dataset.autoArrangeFill,'extra-rhythm');
  assert.notDeepEqual(extra.__gridState.steps,main.__gridState.steps);assert.ok(extra.__gridState.steps.some(Boolean));
  const turns=h.adapter.turnsForLookahead(0,6144).filter(t=>panelsMaster(h,t.toyId)===extra.id);
  assert.equal(turns.length,4);assert.deepEqual(turns.map(t=>t.startTick),[3072,3456,3840,4224]);
  assert.ok(turns.every(t=>t.playbackInstance.sourcePhaseOriginTick===0&&activeToyChord({instance:t.playbackInstance,currentTick:t.startTick,playing:true,role:'percussion'})===null));
  h.schedule();const notes=h.notes.filter(n=>n.toyId===extra.id);assert.equal(notes.length,16);assert.ok(notes.every(n=>n.sourceNote===n.finalNote&&n.resolvedChord===null&&n.transpose===0));
  extra.__gridState.steps=[true,false,true,false,false,false,true,false];extra.dataset.instrument='CLICK PERCUSSION SHORT';extra.dataset.toyVolume='.8';
  const edited=structuredClone({steps:extra.__gridState.steps,dataset:extra.dataset}),second=await h.arranger.arrange();
  assert.equal(second.sourceIds.extraRhythm,extra.id);assert.deepEqual({steps:extra.__gridState.steps,dataset:extra.dataset},edited);
  assert.equal(h.panels.filter(p=>!p.dataset.masterToyId&&p.dataset.autoArrangeFill==='extra-rhythm').length,1);
  assert.equal(h.panels.filter(p=>p.dataset.masterToyId===extra.id).length,0);assert.equal(h.generated.filter(r=>r==='extraRhythm').length,1);
  assert.equal(selectArrangementSources(h.panels).rhythm.id,main.id);
 }finally{h.close();}
});

test('editing one Melody Master reaches A and B with harmony adaptation and no generated octave lift',async()=>{
 const h=harness();try{
  await h.arranger.arrange();h.sync();const master=h.panels.find(p=>p.id==='melody');master.sourceNotes[0]='F#4';
  h.schedule(1536,1537);h.schedule(3072,3073);
  const notes=h.notes.filter(n=>n.toyId==='melody');assert.equal(notes.length,2);
  assert.ok(notes.every(n=>n.sourceNote==='F#4'&&n.adaptedNote==='F4'));
  assert.deepEqual(notes.map(n=>n.finalNote),['F4','F4']);assert.deepEqual(notes.map(n=>n.transpose),[0,0]);
  assert.equal(master.sourceNotes[0],'F#4');
 }finally{h.close();}
});

test('Arrange Again replaces legacy owned B Timeline/Repeats while preserving Masters and an unrelated Timeline',async()=>{
 const h=harness();try{
  const first=await h.arranger.arrange();h.sync();
  const b=h.structures.list().find(n=>n.name==='B layers'),root=h.structures.get(first.rootId),owner=first.owner;
  const instances=h.adapter.turnsForLookahead(3072,3073).map(t=>h.panels.find(p=>p.id===t.toyId));
  h.structures.suspend(()=>h.model.transaction(()=>{
   for(const p of instances){const edge=h.model.getParent(p.id);if(edge)h.model.disconnect(edge.id);}
   h.structures.setType(b.id,'timeline');const entries=[];
   for(const [i,role] of ['accompaniment','rhythm','melody'].entries()){
    const repeat=h.structures.createStandalone('repeat',{autoArrange:{owner}});h.structures.setCount(repeat.id,4-i);
    assert.ok(h.model.connect('sequence',out(b.id,'child:'+i),input(repeat.id)).ok);
    const toy=instances.find(p=>p.dataset.masterToyId===role);
    if(role==='melody'){
     const shift=h.structures.createStandalone('transpose',{autoArrange:{owner}});h.structures.setSemitones(shift.id,12);
     assert.ok(h.model.connect('sequence',out(repeat.id,'child:0'),input(shift.id)).ok);assert.ok(h.model.connect('sequence',out(shift.id,'child:0'),input(toy.id)).ok);
    }else assert.ok(h.model.connect('sequence',out(repeat.id,'child:0'),input(toy.id)).ok);
    entries.push({childId:repeat.id,portId:'child:'+i,offsetTick:i*384});
   }
   h.structures.annotate(b.id,{entries});h.structures.annotate(root.id,{autoArrange:{...root.autoArrange,version:1.1}});
  }));
  const unrelated=h.structures.createStandalone('timeline',{name:'User Timeline'}),spare=h.add('rhythm','z-spare');
  h.model.connect('sequence',out(unrelated.id,'child:0'),input(spare.id));h.structures.setOffset(unrelated.id,'child:0',192);
  h.model.connect('transport',out(MAIN_TRANSPORT_ID),input(unrelated.id));
  h.panels.find(p=>p.id==='melody').sourceNotes[0]='B4';
  const savedMasters=h.panels.filter(p=>!p.dataset.masterToyId).map(p=>({id:p.id,notes:structuredClone(p.sourceNotes)}));
  const oldNodes=h.structures.list().filter(n=>n.autoArrange?.owner===owner).map(n=>n.id),oldInstances=h.panels.filter(p=>p.dataset.autoArrangeOwner===owner).map(p=>p.id),userEdges=h.model.list().filter(e=>e.from.objectId===unrelated.id||e.to.objectId===unrelated.id);
  await h.arranger.arrange();h.sync();
  assert.ok(oldNodes.every(id=>!h.structures.get(id)));assert.ok(oldInstances.every(id=>!h.panels.some(p=>p.id===id)));
  assert.equal(h.structures.list().filter(n=>n.autoArrange).length,7);assert.equal(h.panels.filter(p=>p.dataset.masterToyId).length,5);assert.ok(!h.structures.list().some(n=>n.type==='transpose'));
  assert.deepEqual(h.panels.filter(p=>!p.dataset.masterToyId).map(p=>({id:p.id,notes:p.sourceNotes})),savedMasters);
  assert.deepEqual(h.model.list().filter(e=>e.from.objectId===unrelated.id||e.to.objectId===unrelated.id),userEdges);
  assert.equal(h.structures.get(unrelated.id).entries[0].offsetTick,192);
 }finally{h.close();}
});

test('production scheduling adapts accompaniment, preserves the melody motif and drums, then repeats the complete piece',async()=>{
 const h=harness();try{
  const result=await h.arranger.arrange();h.sync();h.schedule();
  const accompaniment=h.notes.filter(n=>n.toyId==='accompaniment');assert.equal(accompaniment.length,128);
  assert.deepEqual(accompaniment.filter(n=>n.eventTick%384===0).map(n=>n.finalNote),['C3','A2','F3','G2','C3','A2','F3','G2','F3','G2','A2','C3','C3','A2','F3','G2']);
  const melody=h.notes.filter(n=>n.toyId==='melody');assert.equal(melody.length,64);
  assert.ok(melody.every(n=>Math.abs(noteMidi(n.adaptedNote)-noteMidi(n.sourceNote))<=1));
  assert.ok(melody.every(n=>n.transpose===0&&n.finalNote===n.adaptedNote));
  const drums=h.notes.filter(n=>n.toyId==='rhythm');assert.equal(drums.length,64);assert.ok(drums.every(n=>n.finalNote===n.sourceNote && n.resolvedChord===null));
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
  assert.equal(h.structures.get(first.rootId),null);assert.equal(h.structures.list().length,8);assert.deepEqual(h.panels.filter(p=>!p.dataset.masterToyId).map(p=>p.sourceNotes),sources);
  assert.equal(h.structures.get(second.rootId).x,750);assert.equal(h.structures.get(second.rootId).y,220);
  assert.deepEqual(second.sourceIds,first.sourceIds);assert.deepEqual(h.model.list().filter(e=>e.from.objectId===unrelated.id||e.to.objectId===unrelated.id),unrelatedEdges);
  assert.equal(h.panels.filter(p=>!p.dataset.masterToyId&&p.dataset.autoArrangeOrigin==='filled').length,3);assert.ok(h.structures.get(unrelated.id));
 }finally{h.close();}
});

test('ordinary topology and ownership persist/reload without regeneration, supporting safe Arrange Again',async()=>{
 const h=harness();try{
  const first=await h.arranger.arrange();const saved=JSON.parse(JSON.stringify({nodes:h.structures.list(),edges:h.model.list()}));
  h.adapter.reset();h.model.list().forEach(e=>h.model.disconnect(e.id));h.structures.suspend(()=>{h.structures.restore(saved.nodes);saved.edges.forEach(e=>assert.equal(h.model.connect(e.kind,e.from,e.to,{id:e.id}).ok,true));});h.sync();
  const root=h.structures.get(first.rootId);assert.equal(h.adapter.runtime.getDefinition(root.definitionId).durationTicks,6144);assert.equal(h.adapter.runtime.turnsInWindow(root.definitionId,6144,6145).length,1);
  assert.ok(!h.structures.list().some(n=>n.type==='transpose'));
  const b=h.adapter.turnsForLookahead(3456,3457);assert.deepEqual(b.map(t=>panelsMaster(h,t.toyId)).sort(),['accompaniment','filled-extraRhythm','melody','rhythm']);
  await h.arranger.arrange();assert.equal(h.structures.list().length,7);assert.equal(h.panels.filter(p=>!p.dataset.masterToyId).length,4);
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
