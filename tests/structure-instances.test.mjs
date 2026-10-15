import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createStructureToyModel} from '../src/structure-toys.js';
import {createStructureInstanceController,validateStructureInstanceLinks} from '../src/structure-instances.js';
import {attachInstancePlayback} from '../src/toy-instances.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {getCurrentPlaybackOccurrence} from '../src/playback-context.js';
import {ensurePlaybackInstance,clearPlaybackInstancesForTests,getPlaybackInstance} from '../src/playback-instances.js';
import {activeToyChord} from '../src/toy-chord-indicator.js';
import {resolveMusicalPitch} from '../src/harmonic-adaptation.js';
import {playbackAudioBusId} from '../src/toy-audio-routing.js';
import {createAutoArranger} from '../src/auto-arrange.js';
import {splitDrawgridPhrase} from '../src/drawgrid/dg-phrase-chunks.js';

const input=objectId=>({objectId,portId:'input'}),out=(objectId,i=0)=>({objectId,portId:'child:'+i});
function harness(){
 clearPlaybackInstancesForTests();
 const model=createConnectionModel(),panels=[],notes=[];let serial=0;
 model.registerObject('main-heartbeat',{ports:HEARTBEAT_PORTS,transportId:'main-heartbeat'});
 const getToy=id=>panels.find(p=>p.id===id),structures=createStructureToyModel(model);
 const connect=(a,b,i=0)=>{const r=model.connect(a==='main-heartbeat'?'transport':'sequence',a==='main-heartbeat'?{objectId:a,portId:'output'}:out(a,i),input(b));assert.equal(r.ok,true,r.reason);};
 function toy(id,role='melody'){
  const p={id,__audioToyId:'bus:'+id,dataset:{toy:role==='percussion'?'loopgrid':'drawgrid',musicalRole:role,steps:'8'},__seqRev:0,__seqPattern:{notes:Array(8).fill('C3')},__sequencerStep(){}};
  p.__sequencerSchedule=(step,time,metadata)=>{const occurrence=getCurrentPlaybackOccurrence();notes.push({toyId:occurrence?.instanceToyId||id,step,eventTick:metadata.eventTick,source:p.__seqPattern.notes[step],...resolveMusicalPitch({sourcePitch:p.__seqPattern.notes[step],eventTick:metadata.eventTick,context:metadata.context,role:p.dataset.musicalRole}),bus:playbackAudioBusId(id,occurrence),occurrence});};
  panels.push(p);model.registerObject(id);ensurePlaybackInstance(id,{loopLengthTicks:384});return p;
 }
 function instance(master,opts={}){
  const p={id:master.id+'.'+(++serial),dataset:{...master.dataset,masterToyId:master.id,structureInstanceId:opts.structureInstanceId,structureMasterChildId:opts.structureMasterChildId,autoArrangeOwner:opts.autoArrangeOwner},ui:opts.ui,__sequencerStep(){}};
  panels.push(p);attachInstancePlayback(p,master);model.registerObject(p.id);ensurePlaybackInstance(p.id,{loopLengthTicks:384});return p;
 }
 function removeToy(p){model.removeObject(p.id);panels.splice(panels.indexOf(p),1);}
 const linked=createStructureInstanceController({model,structures,getToy,getPanels:()=>panels,createToyInstance:instance,removeToy});
 structures.configure({canRemove:linked.canRemove,canChangeType:linked.canChangeType,onRemove:linked.cleanup});
 function phrase(){
  const s=structures.createStandalone('sequence',{name:'Melody Phrase'});
  model.transaction(()=>{structures.annotate(s.id,{outputCount:5});['a','b','c','d'].forEach((id,i)=>connect(s.id,toy(id).id,i));});return structures.get(s.id);
 }
 const adapter=createChainSequenceAdapter({connectionModel:model,getToy,chainState:new Map()}),scheduler=createSequencerScheduler();
 const sync=(tick=0,state='paused')=>adapter.sync(panels,{state,currentTick:tick},{connections:model.list('sequence'),structures:structures.list()});
 const schedule=(from,to)=>scheduler.tick({currentTick:from,lookaheadEndTick:to,playbackTurns:adapter.turnsForLookahead(from,to),getToy,tickToAudioTime:t=>t/192});
 const owned=id=>panels.filter(p=>p.dataset.structureInstanceId===id);
 const close=()=>{scheduler.dispose();adapter.reset();linked.dispose();structures.dispose();};
 return {model,panels,notes,getToy,structures,linked,toy,instance,removeToy,phrase,connect,owned,adapter,sync,schedule,close};
}

test('linked Sequence copies expand distinct normal Toy Instances with live source and audio-bus references',()=>{
 const h=harness();try{
  const master=h.phrase(),a=h.linked.create(master),b=h.linked.create(master);
  assert.equal(a.name,'Melody Phrase.1');assert.equal(b.name,'Melody Phrase.2');assert.equal(a.masterStructureId,master.id);
  assert.deepEqual(h.owned(a.id).map(p=>p.dataset.masterToyId),['a','b','c','d']);
  assert.deepEqual(h.owned(b.id).map(p=>p.dataset.masterToyId),['a','b','c','d']);
  assert.ok(h.owned(a.id).every(p=>!h.owned(b.id).some(q=>q.id===p.id)));
  const ca=h.owned(a.id)[2],cb=h.owned(b.id)[2];assert.equal(ca.__seqPattern,h.getToy('c').__seqPattern);assert.equal(cb.__seqPattern,ca.__seqPattern);
  h.getToy('c').__seqPattern.notes[0]='E3';h.getToy('c').__seqRev++;assert.equal(ca.__seqRev,1);assert.equal(cb.__seqPattern.notes[0],'E3');
  h.structures.annotate(master.id,{name:'Renamed Phrase'});assert.equal(h.structures.get(a.id).name,'Renamed Phrase.1');
 }finally{h.close();}
});

test('live Master reorder, addition and removal reconcile both copies without replacing unaffected child identities',()=>{
 const h=harness();try{
  const master=h.phrase(),a=h.linked.create(master),b=h.linked.create(master),ids=h.owned(a.id).map(p=>p.id);
  h.model.transaction(()=>{for(const e of h.model.list('sequence').filter(e=>e.from.objectId===master.id))h.model.disconnect(e.id);['a','c','b','d'].forEach((id,i)=>h.connect(master.id,id,i));});
  for(const copy of [a,b])assert.deepEqual(h.model.list('sequence').filter(e=>e.from.objectId===copy.id).map(e=>h.getToy(e.to.objectId).dataset.masterToyId),['a','c','b','d']);
  assert.deepEqual(h.owned(a.id).map(p=>p.id),ids);
  h.connect(master.id,h.toy('e').id,4);assert.equal(h.owned(a.id).length,5);assert.equal(h.owned(b.id).length,5);
  h.model.disconnect(h.model.getParent('b').id);assert.equal(h.owned(a.id).length,4);assert.ok(!h.owned(a.id).some(p=>p.dataset.masterToyId==='b'));
  assert.equal(h.structures.setType(master.id,'together'),null);assert.equal(h.structures.setType(a.id,'together'),null);
  const nested=h.structures.createStandalone('sequence');assert.equal(h.model.connect('sequence',out(master.id,4),input(nested.id)).reason,'linked-sequence-direct-children');
  assert.equal(h.model.connect('sequence',{objectId:'a',portId:'output'},input('e')).reason,'linked-sequence-direct-children');
  assert.equal(h.model.connect('sequence',out(a.id),input('e')).reason,'linked-sequence-owned-children');
 }finally{h.close();}
});

test('deleting one linked Sequence cleans only its owned children and safely blocks Master deletion',()=>{
 const h=harness();try{
  const master=h.phrase(),a=h.linked.create(master),b=h.linked.create(master),old=h.owned(a.id).map(p=>p.id);
  assert.equal(h.structures.remove(master.id),false);assert.ok(h.structures.get(master.id));
  assert.equal(h.structures.remove(a.id),true);assert.equal(h.owned(a.id).length,0);assert.ok(old.every(id=>!h.model.getObject(id)));
  assert.equal(h.owned(b.id).length,4);assert.ok(h.getToy('c'));h.structures.remove(b.id);assert.equal(h.structures.remove(master.id),true);
 }finally{h.close();}
});

test('production runtime schedules concurrent linked phrases under independent harmony without phase or volume routing drift',()=>{
 const h=harness();try{
  const master=h.phrase(),a=h.linked.create(master),b=h.linked.create(master);
  for(const [copy,roots] of [[a,['C','A','F','G']],[b,['F','G','A','C']]]){
   const chord=h.structures.createStandalone('chord-progression');h.structures.setProgression(chord.id,{chords:roots.map(root=>({root,quality:root==='A'?'minor':'major'}))});h.connect('main-heartbeat',chord.id);h.connect(chord.id,copy.id);
  }
  h.sync();h.schedule(0,96);const first=h.notes.filter(n=>n.occurrence);
  assert.equal(new Set(first.map(n=>n.occurrence.occurrenceId)).size,2);assert.ok(first.every(n=>n.bus==='bus:a'));
  h.adapter.updateCurrent(0);assert.equal(activeToyChord({instance:getPlaybackInstance(h.owned(a.id)[0].id),currentTick:0,playing:true,role:'melody'}),'C');assert.equal(activeToyChord({instance:getPlaybackInstance(h.owned(b.id)[0].id),currentTick:0,playing:true,role:'melody'}),'F');
  h.getToy('c').__seqPattern.notes.fill('E4');h.getToy('c').__seqRev++;
  h.schedule(768,864);assert.ok(h.notes.filter(n=>n.occurrence?.masterToyId==='c').every(n=>n.source==='E4'&&n.bus==='bus:c'));
  const turns=h.adapter.turnsForLookahead(768,864);assert.ok(h.notes.every(n=>n.step===Math.floor(n.eventTick/48)%8));
  h.sync(864,'playing');const ids=turns.map(t=>t.toyId).sort();h.sync(864,'paused');h.sync(864,'playing');assert.deepEqual(h.adapter.turnsForLookahead(864,900).map(t=>t.toyId).sort(),ids);
  h.structures.remove(a.id);h.sync(864,'playing');assert.ok(h.adapter.turnsForLookahead(900,950).every(t=>!h.owned(a.id).some(p=>p.id===t.toyId)));
 }finally{h.close();}
});

test('persistence retains links, child identities/positions, monotonic numbers and rejects orphan structure links',()=>{
 const h=harness();try{
  const master=h.phrase(),a=h.linked.create(master),b=h.linked.create(master);
  const snapshot=JSON.parse(JSON.stringify({structureToys:h.structures.list(),connections:h.model.list(),toys:h.panels.map(p=>({id:p.id,type:p.dataset.toy,masterToyId:p.dataset.masterToyId,structureInstanceId:p.dataset.structureInstanceId,structureMasterChildId:p.dataset.structureMasterChildId,instanceNumber:1,ui:p.ui,state:p.dataset.masterToyId?{}:p.__seqPattern}))}));
  validateStructureInstanceLinks(snapshot);h.linked.pause();h.structures.suspend(()=>h.model.transaction(()=>{h.structures.restore(snapshot.structureToys);h.model.list().forEach(e=>h.model.disconnect(e.id));snapshot.connections.forEach(e=>h.model.connect(e.kind,e.from,e.to,{id:e.id}));}));h.linked.resume();
  assert.deepEqual(h.owned(a.id).map(p=>p.id),snapshot.toys.filter(t=>t.structureInstanceId===a.id).map(t=>t.id));
  assert.equal(h.linked.create(master).structureInstanceNumber,3);h.structures.remove(b.id);assert.equal(h.linked.create(master).structureInstanceNumber,4);
  snapshot.structureToys=snapshot.structureToys.filter(s=>s.id!==master.id);assert.throws(()=>validateStructureInstanceLinks(snapshot),/Structure Master/);
 }finally{h.close();}
});

test('normal generated melody splits into four visible one-bar states with continuous boundaries and independent masks',()=>{
 const st={steps:32,strokes:[{ptsN:Array.from({length:33},(_,i)=>({nx:i/32,ny:.4+.1*Math.sin(i/4)})),color:'blue'}],nodes:{active:Array(32).fill(true),list:Array.from({length:32},(_,i)=>[i%8]),disabled:Array.from({length:32},()=>[])},manualOverrides:Array.from({length:32},()=>[])};
 const before=structuredClone(st),parts=splitDrawgridPhrase(st);assert.deepEqual(st,before);
 assert.ok(parts.every(p=>p.steps===8&&p.nodes.list.length===8&&p.strokes[0].ptsN[0].nx===0&&p.strokes[0].ptsN.at(-1).nx===1));
 for(let i=1;i<4;i++)assert.equal(parts[i-1].strokes[0].ptsN.at(-1).ny,parts[i].strokes[0].ptsN[0].ny);
 assert.deepEqual(parts.flatMap(p=>p.nodes.list),st.nodes.list);parts[0].nodes.list[0].push(10);assert.deepEqual(st,before);
});

test('Auto-Arrange fills one reusable four-chunk phrase, uses separate A/B copies, keeps B percussion, and reuses edits',async()=>{
 const h=harness();try{
  const rhythm=h.toy('rhythm','percussion'),accomp=h.toy('accomp','accompaniment');h.connect('main-heartbeat',rhythm.id);h.connect('main-heartbeat',accomp.id);
  let created=0,failCopies=false,copyCalls=0;
  const arranger=createAutoArranger({model:h.model,structures:h.structures,getPanels:()=>h.panels,createInstance:h.instance,createStructureInstance:(...args)=>{if(failCopies&&++copyCalls===2)throw new Error('test placement failure');return h.linked.create(...args);},
   removeInstances:owner=>{h.linked.removeOwned(owner);for(const p of [...h.panels])if(p.dataset.autoArrangeOwner===owner)h.removeToy(p);},
   createSource:async role=>{assert.equal(role,'extraRhythm');return h.toy('extra','percussion');},
   createPhraseSource:async({heartbeatId})=>{created++;const master=h.phrase();h.structures.annotate(master.id,{autoArrangePhrase:{heartbeatId}});for(const p of h.panels.filter(p=>['a','b','c','d'].includes(p.id))){p.dataset.autoArrangeFill='melody-chunk';p.dataset.autoArrangeOrigin='filled';}return h.structures.get(master.id);}});
  const result=await arranger.arrange();h.sync();assert.equal(created,1);assert.equal(h.structures.durationOf(result.rootId),6144);
  const copies=h.structures.list().filter(s=>s.masterStructureId);assert.equal(copies.length,2);assert.ok(copies.every(s=>h.owned(s.id).length===4));
  for(let bar=0;bar<16;bar++){
   const turns=h.adapter.turnsForLookahead(bar*384,bar*384+1),masters=turns.map(t=>h.getToy(t.toyId).dataset.masterToyId);
   assert.equal(turns.length,bar<4||bar>=12?1:bar<8?3:4);
   if(bar>=4&&bar<12)assert.ok(masters.includes(['a','b','c','d'][bar%4]));if(bar>=8&&bar<12)assert.ok(masters.includes('extra'));
  }
  h.getToy('c').__seqPattern.notes[0]='B4';const old=copies.map(s=>s.id),again=await arranger.arrange();h.sync();
  assert.equal(created,1);assert.equal(again.sourceIds.melody,result.sourceIds.melody);assert.equal(h.getToy('c').__seqPattern.notes[0],'B4');assert.ok(old.every(id=>!h.structures.get(id)&&h.owned(id).length===0));assert.equal(h.structures.list().filter(s=>s.masterStructureId).length,2);assert.equal(h.panels.filter(p=>!p.dataset.masterToyId).length,7);
  const saved={nodes:h.structures.list(),edges:h.model.list(),ids:h.panels.map(p=>p.id)};failCopies=true;
  await assert.rejects(arranger.arrange(),/test placement failure/);
  assert.deepEqual(h.structures.list(),saved.nodes);const byId=(a,b)=>a.id.localeCompare(b.id);assert.deepEqual(h.model.list().sort(byId),saved.edges.sort(byId));assert.deepEqual(h.panels.map(p=>p.id),saved.ids);assert.equal(h.getToy('c').__seqPattern.notes[0],'B4');
 }finally{h.close();}
});
