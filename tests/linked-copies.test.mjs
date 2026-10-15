import test from 'node:test';
import assert from 'node:assert/strict';
import {createLinkedToyViewController} from '../src/linked-toy-views.js';
import {createLinkedSequenceController} from '../src/linked-sequences.js';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createStructureToyModel} from '../src/structure-toys.js';
import {getCurrentPlaybackOccurrence,withPlaybackOccurrence} from '../src/playback-context.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {ensurePlaybackInstance,clearPlaybackInstancesForTests} from '../src/playback-instances.js';
import {linkToyAudioBus,setToyVolume,getToyVolumeRaw,setToyMuted,isToyMuted,getToyGain} from '../src/audio-core.js';
import {validateInstanceLinks} from '../src/toy-instances.js';
import {validateStructureInstanceLinks} from '../src/structure-instances.js';

function dom(){
 const saved=Object.fromEntries(['document','window','CustomEvent'].map(k=>[k,globalThis[k]]));
 const node=()=>({textContent:'',style:{setProperty(){}},classList:{add(){},remove(){}},addEventListener(){},append(){},setAttribute(){},querySelector(){return null;}});
 globalThis.document={addEventListener(){},createElement:node};globalThis.window={addEventListener(){},dispatchEvent(){},AudioContext:class{constructor(){this.currentTime=0;this.state='running';this.destination={};}createGain(){return {gain:{value:1,setValueAtTime(v){this.value=v;},cancelScheduledValues(){}},connect(){}};}}};globalThis.CustomEvent=class{constructor(type,args){this.type=type;this.detail=args?.detail;}};
 return {node,close:()=>Object.assign(globalThis,saved)};
}
test('equal-status full toy views share edits, keep local positions/context, and promote safely after original deletion',async()=>{
 const d=dom(),panels=[];let n=0;
 function panel(id){const label=d.node(),header=d.node(),p={id,isConnected:true,__drawToy:{},dataset:{toy:'drawgrid',toyName:'Draw 1'},style:{left:'0px',top:'0px'},classList:d.node().classList,offsetWidth:680,addEventListener(){},querySelector:q=>q.includes('master-name')?label:q==='.toy-header'?header:null,state:{notes:['C3'],instrument:'PIANO',musicalRole:'melody',localTranspose:0},__audioToyId:'bus-'+id};p.__sequencerSchedule=step=>({note:p.state.notes[step],context:getCurrentPlaybackOccurrence()});panels.push(p);return p;}
 const source=panel('source'),controller=createLinkedToyViewController({getPanels:()=>panels,getMaster:id=>panels.find(p=>p.id===id),createView:()=>panel('copy-'+(++n)),capture:p=>structuredClone(p.state),apply:async(p,state)=>{p.state=structuredClone(state);},register(){},changed(){},focus(){},remove(){}});
 try{
  const a=controller.create(source),b=controller.create(a);assert.equal(a.dataset.linkedCopyNumber,'1');assert.equal(b.dataset.linkedCopyNumber,'2');assert.equal(a.dataset.sharedDefinitionId,b.dataset.sharedDefinitionId);
  await new Promise(resolve=>setImmediate(resolve));a.style.left='100px';b.style.left='900px';b.state.notes=['E4'];b.state.instrument='KALIMBA';b.state.musicalRole='accompaniment';controller.edit(b);
  // Scheduling reads the editing view immediately, even before peer hydration.
  const scheduled=withPlaybackOccurrence({occurrenceId:'B',context:{harmony:{progressionId:'B'}}},()=>a.__sequencerSchedule(0));assert.equal(scheduled.note,'E4');assert.equal(scheduled.context.instanceToyId,a.id);assert.equal(scheduled.context.context.harmony.progressionId,'B');
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(a.state,b.state);assert.deepEqual(source.state,b.state);assert.equal(a.style.left,'100px');assert.equal(b.style.left,'900px');
  a.state.notes=['G3'];controller.edit(a);await new Promise(resolve=>setImmediate(resolve));assert.equal(b.state.notes[0],'G3');
  const definition=b.dataset.sharedDefinitionId;controller.beforeDelete(source);source.isConnected=false;panels.splice(panels.indexOf(source),1);
  assert.equal(a.dataset.masterToyId,undefined);assert.equal(b.dataset.masterToyId,a.id);assert.equal(b.dataset.sharedDefinitionId,definition);assert.equal(a.dataset.linkedCopyNumber,'1');assert.equal(b.dataset.linkedCopyNumber,'2');assert.equal(b.__sequencerSchedule(0).note,'G3');
  const c=controller.create(b);assert.equal(c.dataset.linkedCopyNumber,'3');assert.equal(controller.canDelete(a),true);
 }finally{d.close();}
});

function sequences(){
 clearPlaybackInstancesForTests();const model=createConnectionModel(),panels=[];let serial=0;
 model.registerObject('main-heartbeat',{ports:HEARTBEAT_PORTS,transportId:'main-heartbeat'});
 const structures=createStructureToyModel(model),getToy=id=>panels.find(p=>p.id===id);
 const toy=id=>{const p={id,dataset:{toy:'drawgrid',steps:'8',musicalRole:'melody',sharedDefinitionId:'toy-definition:'+id},state:{notes:['C3']}};panels.push(p);model.registerObject(id);ensurePlaybackInstance(id);return p;};
 const controller=createLinkedSequenceController({model,structures,getToy,getPanels:()=>panels,createToyInstance:(p,opts)=>{const child={id:'view-'+(++serial),dataset:{...p.dataset,masterToyId:p.id,structureInstanceId:opts.structureInstanceId,structureMasterChildId:opts.structureMasterChildId,autoArrangeOwner:opts.autoArrangeOwner}};panels.push(child);model.registerObject(child.id);ensurePlaybackInstance(child.id);return child;},removeToy:p=>{model.removeObject(p.id);panels.splice(panels.indexOf(p),1);}});
 structures.configure({canRemove:controller.canRemove,canChangeType:controller.canChangeType,onRemove:controller.cleanup});
 const source=structures.createStandalone('sequence',{name:'Phrase 1'});model.transaction(()=>{structures.annotate(source.id,{outputCount:5});['a','b','c','d'].forEach((id,i)=>model.connect('sequence',{objectId:source.id,portId:'child:'+i},{objectId:toy(id).id,portId:'input'}));});
 const ordered=id=>model.list('sequence').filter(e=>e.from.objectId===id).sort((a,b)=>a.from.portId.localeCompare(b.from.portId));
 return {model,structures,controller,source,panels,getToy,ordered,close:()=>{controller.dispose();structures.dispose();}};
}
test('editing either linked Sequence order updates every expansion while movement and context stay independent',()=>{
 const h=sequences();try{
  const a=h.controller.create(h.source),b=h.controller.create(a);assert.equal(a.name,'Phrase 1.1');assert.equal(b.name,'Phrase 1.2');assert.equal(a.collapsed,false);assert.equal(b.collapsed,false);
  const beforeA=h.structures.get(a.id);h.structures.move(b.id,900,700);assert.equal(h.structures.get(a.id).x,beforeA.x);assert.equal(h.structures.get(a.id).y,beforeA.y);
  const e=h.ordered(b.id);h.model.transaction(()=>{e.forEach(c=>h.model.disconnect(c.id));[e[0],e[2],e[1],e[3]].forEach((c,i)=>h.model.connect('sequence',{objectId:b.id,portId:'child:'+i},c.to));});
  for(const s of [h.source,a,b])assert.deepEqual(h.ordered(s.id).map(e=>h.getToy(e.to.objectId).dataset.structureMasterChildId),['a','c','b','d']);
  const adapter=createChainSequenceAdapter({connectionModel:h.model,getToy:h.getToy,chainState:new Map()});
  for(const [copy,roots] of [[a,['C','A','F','G']],[b,['F','G','A','C']]]){const chord=h.structures.createStandalone('chord-progression');h.structures.setProgression(chord.id,{chords:roots.map(root=>({root,quality:root==='A'?'minor':'major'}))});h.model.connect('transport',{objectId:'main-heartbeat',portId:'output'},{objectId:chord.id,portId:'input'});h.model.connect('sequence',{objectId:chord.id,portId:'child:0'},{objectId:copy.id,portId:'input'});}
  adapter.sync(h.panels,{state:'paused',currentTick:0},{connections:h.model.list('sequence'),structures:h.structures.list()});const turns=adapter.turnsForLookahead(0,1);assert.equal(turns.length,2);assert.equal(new Set(turns.map(t=>t.occurrenceId)).size,2);assert.equal(new Set(turns.map(t=>t.context.harmony.progressionId)).size,2);adapter.reset();
 }finally{h.close();}
});
test('deleting the original Sequence preserves sibling IDs/children and the shared definition',()=>{
 const h=sequences();try{const a=h.controller.create(h.source),b=h.controller.create(h.source),ids=h.ordered(a.id).map(e=>e.to.objectId),definition=a.sharedDefinitionId;
  assert.equal(h.structures.remove(h.source.id),true);assert.equal(h.structures.get(a.id).masterStructureId,null);assert.equal(h.structures.get(b.id).masterStructureId,a.id);assert.equal(h.structures.get(a.id).sharedDefinitionId,definition);assert.deepEqual(h.ordered(a.id).map(e=>e.to.objectId),ids);assert.equal(h.ordered(b.id).length,4);
  // Fake toy storage roots above are not promoted: keep their shared definitions
  // available for this structure-only harness's future creation test.
  for(const id of ['a','b','c','d'])if(!h.getToy(id)){const p=h.panels.find(p=>p.dataset.masterToyId===id);delete p.dataset.masterToyId;}
  const c=h.controller.create(b);assert.equal(c.structureInstanceNumber,3);
 }finally{h.close();}
});
test('deleting a local child copy keeps every sibling view and the shared definition',()=>{
 const h=sequences();try{const a=h.controller.create(h.source),b=h.controller.create(h.source),child=h.getToy(h.ordered(b.id)[1].to.objectId),others=h.ordered(a.id).map(e=>e.to.objectId);
  h.controller.removeLocalChild(child);h.model.removeObject(child.id);h.panels.splice(h.panels.indexOf(child),1);h.controller.sync();
  assert.equal(h.ordered(b.id).length,3);assert.deepEqual(h.ordered(a.id).map(e=>e.to.objectId),others);assert.equal(h.structures.get(h.source.id).sharedChildren.length,4);assert.ok(h.getToy('b'));assert.deepEqual(h.structures.get(b.id).omittedChildSlots,['b']);
 }finally{h.close();}
});
test('shared gain aliases preserve volume and mute for playback and audition from any view',()=>{
 const d=dom();try{linkToyAudioBus('linked-audio-a','linked-audio-root');linkToyAudioBus('linked-audio-b','linked-audio-root');setToyVolume('linked-audio-b',.35);assert.equal(getToyVolumeRaw('linked-audio-a'),.35);assert.equal(getToyGain('linked-audio-a'),getToyGain('linked-audio-root'));setToyMuted('linked-audio-a',true);assert.equal(isToyMuted('linked-audio-b'),true);assert.equal(getToyGain('linked-audio-b').gain.value,0);setToyMuted('linked-audio-b',false);assert.equal(getToyGain('linked-audio-root').gain.value,.35);}finally{d.close();}
});
test('equal-status scenes validate canonical toy editors inside canonical and linked Sequence views after promotion',()=>{
 const snapshot={structureToys:[{id:'phrase-a',type:'sequence',sharedDefinitionId:'phrase-definition',sharedChildren:[{slotId:'slot',toyDefinitionId:'note-definition'}],linkedCopyNumber:1},{id:'phrase-b',type:'sequence',masterStructureId:'phrase-a',sharedDefinitionId:'phrase-definition',structureInstanceNumber:2,linkedCopyNumber:2}],toys:[{id:'draw-a',type:'drawgrid',sharedDefinitionId:'note-definition',structureInstanceId:'phrase-a',structureMasterChildId:'slot',linkedCopyNumber:1,state:{notes:['G4']}},{id:'draw-b',type:'drawgrid',masterToyId:'draw-a',sharedDefinitionId:'note-definition',instanceNumber:2,linkedCopyNumber:2,structureInstanceId:'phrase-b',structureMasterChildId:'slot',state:{}}]};
 assert.equal(validateStructureInstanceLinks(validateInstanceLinks(snapshot)),snapshot);const roundTrip=JSON.parse(JSON.stringify(snapshot));assert.deepEqual(validateStructureInstanceLinks(validateInstanceLinks(roundTrip)),snapshot);
});
test('migration hydration preserves saved definitions even while normal editor buffers start empty',async()=>{
 const d=dom(),panels=[];let serial=0;
 const make=id=>{const label=d.node(),header=d.node(),p={id,isConnected:true,__drawToy:{},dataset:{toy:'drawgrid',toyName:'Draw 1'},style:{},classList:d.node().classList,offsetWidth:680,addEventListener(){},querySelector:q=>q.includes('master-name')?label:q==='.toy-header'?header:null,state:{notes:[]},__audioToyId:'hydrate-'+id};p.__sequencerSchedule=()=>p.state.notes[0];panels.push(p);return p;};
 const root=make('root');root.__linkedInitialState={notes:['F4'],instrument:'PIANO',musicalRole:'melody'};
 const controller=createLinkedToyViewController({getPanels:()=>panels,getMaster:id=>panels.find(p=>p.id===id),createView:()=>make('copy-'+(++serial)),capture:p=>structuredClone(p.state),apply:async(p,state)=>{await new Promise(resolve=>setImmediate(resolve));p.state=structuredClone(state);},register(){},changed(){},focus(){},remove(){}});
 try{controller.pause();root.__linkedInitialState={notes:['F4'],instrument:'PIANO',musicalRole:'melody'};const copy=controller.create(root);controller.resume();assert.equal(root.__sharedToyState.notes[0],'F4');await new Promise(resolve=>setTimeout(resolve,20));assert.equal(root.state.notes[0],'F4');assert.equal(copy.state.notes[0],'F4');assert.equal(copy.__sequencerSchedule(),'F4');}finally{panels.forEach(p=>p.isConnected=false);d.close();}
});
