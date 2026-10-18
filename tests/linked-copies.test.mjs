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
import {createAutoArranger} from '../src/auto-arrange.js';
import {continueDrawgridPhrase,splitDrawgridPhrase,prepareDrawgridPhrase,hasDrawgridPhraseMaterial,repairDrawgridPhraseStrokes} from '../src/drawgrid/dg-phrase-chunks.js';
import {storeLinkedDefinitions,projectLinkedDefinitions} from '../src/linked-definitions.js';
import {updateSilence,eventMuted} from '../src/free-play-silence.js';

test('Arrange generates melody for a freshly created empty DrawGrid but preserves an authored seed',async()=>{
 const empty={steps:8,instrument:'PIANO',nodes:{active:Array(8).fill(false),list:Array.from({length:8},()=>[]),disabled:Array.from({length:8},()=>[])},strokes:[]};
 let generated=0;const generate=async()=>{generated++;return {...empty,steps:32,nodes:{active:Array(32).fill(true),list:Array.from({length:32},(_,i)=>[i%5]),disabled:Array.from({length:32},()=>[])}};};
 assert.equal(hasDrawgridPhraseMaterial(empty),false);const parts=await prepareDrawgridPhrase(empty,generate);assert.equal(generated,1);assert.equal(parts.length,4);assert.ok(parts.every(p=>p.steps===8&&hasDrawgridPhraseMaterial(p)));assert.equal(empty.steps,8);assert.ok(empty.nodes.list.every(rows=>rows.length===0));
 const authored=structuredClone(parts[0]),before=structuredClone(authored),seeded=await prepareDrawgridPhrase(authored,()=>assert.fail('Authored notes must not be randomized'));assert.deepEqual(authored,before);assert.deepEqual(seeded[0],authored);
 await assert.rejects(prepareDrawgridPhrase(empty,async()=>({...empty,steps:32})),/no notes/);
});

test('seed continuations preserve authored chunk, instrument, range and rhythm with a motif development',()=>{
 const seed={steps:8,instrument:'PIANO',musicalRole:'melody',nodes:{active:[true,false,true,true,true,false,true,true],list:[[2],[],[4],[6],[3],[],[5],[4]],disabled:Array.from({length:8},()=>[])},strokes:[{ptsN:[{nx:0,ny:.2},{nx:.5,ny:.6},{nx:1,ny:.4}],color:'#abcdef',isSpecial:true,generatorId:1}],manualOverrides:[]};
 const before=structuredClone(seed),parts=continueDrawgridPhrase(seed);assert.deepEqual(seed,before);assert.deepEqual(parts[0],seed);assert.deepEqual(parts[1].nodes,seed.nodes);assert.deepEqual(parts[2].nodes.list,[...seed.nodes.list.slice(4),...seed.nodes.list.slice(0,4)]);assert.deepEqual(parts[3].nodes.list.at(-1),[2]);
 assert.ok(parts.every(p=>p.instrument==='PIANO'&&p.musicalRole==='melody'&&p.steps===8));
 assert.deepEqual(parts[1].strokes,seed.strokes);assert.deepEqual(parts[3].strokes,seed.strokes);assert.equal(parts[2].strokes.length,1);assert.deepEqual(parts[2].strokes[0].ptsN,[{nx:0,ny:.6},{nx:.5,ny:.4},{nx:.5,ny:.2},{nx:1,ny:.6}]);
 for(const steps of [16,32]){const long={...seed,steps,nodes:Object.fromEntries(Object.entries(seed.nodes).map(([k,v])=>[k,Array.from({length:steps},(_,i)=>structuredClone(v[i%8]))]))},before=structuredClone(long),chunks=continueDrawgridPhrase(long);assert.deepEqual(long,before);assert.equal(chunks.length,4);assert.deepEqual(chunks.slice(0,steps/8).flatMap(c=>c.nodes.list),long.nodes.list);}
 const backwards=splitDrawgridPhrase({...seed,steps:32,strokes:[{ptsN:[{nx:1,ny:.2},{nx:0,ny:.8}],color:'#abc'}]});assert.ok(backwards.every(p=>p.strokes.length===1&&p.strokes[0].ptsN.length===2));assert.equal(backwards[0].strokes[0].ptsN[0].nx,1);assert.equal(backwards[3].strokes[0].ptsN.at(-1).nx,0);
 const old=structuredClone(parts);old.slice(1).forEach(p=>{p.strokes=[];p.nodes.list[0]=[9];});const repaired=repairDrawgridPhraseStrokes(old);assert.ok(repaired.every(p=>p.strokes.length));assert.ok(repaired.slice(1).every(p=>p.nodes.list[0][0]===9));assert.ok(old.slice(1).every(p=>p.strokes.length===0));assert.equal(repairDrawgridPhraseStrokes(repaired)[2],repaired[2]);
});

test('definition-centric scenes persist data independently of any editor ID and migrate legacy scenes',()=>{
 const legacy={toys:[{id:'a',type:'drawgrid',toyName:'Draw 1',sharedDefinitionId:'notes',instanceSerial:2,linkedCopyNumber:1,state:{notes:['C4']},volume:.4,muted:true},{id:'b',type:'drawgrid',sharedDefinitionId:'notes',masterToyId:'a',instanceNumber:2,linkedCopyNumber:2,state:{}}],structureToys:[{id:'p',type:'sequence',sharedDefinitionId:'phrase',sharedName:'Phrase',sharedChildren:[{slotId:'one',toyDefinitionId:'notes'}],linkedCopyNumber:1,structureInstanceSerial:2},{id:'q',type:'sequence',masterStructureId:'p',sharedDefinitionId:'phrase',linkedCopyNumber:2}],connections:[]};
 const saved=storeLinkedDefinitions(legacy);assert.equal(saved.sharedToyDefinitions.length,1);assert.equal(saved.sharedSequenceDefinitions.length,1);assert.ok(saved.toys.every(t=>!t.masterToyId&&!t.state));assert.ok(saved.structureToys.every(s=>!s.masterStructureId&&!s.sharedChildren));
 // A different visible editor can be the first restored view; identity/state/audio do not change.
 saved.toys.reverse();saved.structureToys.reverse();const restored=projectLinkedDefinitions(JSON.parse(JSON.stringify(saved)));assert.equal(restored.toys[0].id,'b');assert.deepEqual(restored.toys[0].state,{notes:['C4']});assert.equal(restored.toys[0].volume,.4);assert.equal(restored.toys[0].sharedDefinitionData.bus,'shared-audio:notes');assert.equal(restored.toys[1].masterToyId,'b');assert.deepEqual(restored.structureToys[0].sharedChildren,legacy.structureToys[0].sharedChildren);assert.equal(restored.structureToys[1].masterStructureId,'q');
 assert.equal(projectLinkedDefinitions(legacy),legacy);
});

test('reload repairs old nodes-only Phrase continuations without overwriting edited notes',()=>{
 const seed={steps:8,strokes:[{ptsN:[{nx:0,ny:.2},{nx:1,ny:.7}],color:'#abc'}],nodes:{list:Array.from({length:8},()=>[4])}},states=continueDrawgridPhrase(seed);
 states.slice(1).forEach(s=>{s.strokes=[];s.nodes.list[0]=[9];});
 const scene={
  toys:states.map((s,i)=>({id:'view-'+i,type:'drawgrid',sharedDefinitionId:'d'+i})),structureToys:[],
  sharedToyDefinitions:states.map((state,i)=>({id:'d'+i,type:'drawgrid',state})),
  sharedSequenceDefinitions:[{id:'phrase',autoArrangePhrase:{heartbeatId:'main-heartbeat'},children:states.map((s,i)=>({slotId:'s'+i,toyDefinitionId:'d'+i}))}]
 };
 const projected=projectLinkedDefinitions(scene);assert.ok(projected.toys.every(t=>t.state.strokes.length>0));assert.ok(projected.toys.slice(1).every(t=>t.state.nodes.list[0][0]===9));assert.ok(scene.sharedToyDefinitions.slice(1).every(d=>d.state.strokes.length===0));
});

function dom(){
 const saved=Object.fromEntries(['document','window','CustomEvent'].map(k=>[k,globalThis[k]]));
 const node=()=>({children:[],textContent:'',style:{setProperty(){}},classList:{add(){},remove(){}},addEventListener(){},append(n){this.children.push(n);},setAttribute(){},querySelector(q){return q==='.linked-copy-marker'?this.children.find(n=>n.className==='linked-copy-marker')||null:null;}});
 globalThis.document={addEventListener(){},createElement:node};globalThis.window={addEventListener(){},dispatchEvent(){},AudioContext:class{constructor(){this.currentTime=0;this.state='running';this.destination={};}createGain(){return {gain:{value:1,setValueAtTime(v){this.value=v;},cancelScheduledValues(){}},connect(){}};}}};globalThis.CustomEvent=class{constructor(type,args){this.type=type;this.detail=args?.detail;}};
 return {node,close:()=>Object.assign(globalThis,saved)};
}
test('equal-status full toy views share edits, keep local positions/context, and promote safely after original deletion',async()=>{
 const d=dom(),panels=[];let n=0,uiSyncs=0,panelReads=0;
 function panel(id){const label=d.node(),header=d.node(),p={id,isConnected:true,__drawToy:{},dataset:{toy:'drawgrid',toyName:'Draw 1'},style:{left:'0px',top:'0px'},classList:d.node().classList,offsetWidth:680,addEventListener(){},querySelector:q=>q.includes('master-name')?label:q==='.toy-header'?header:null,state:{notes:['C3'],instrument:'PIANO',musicalRole:'melody',localTranspose:0},__audioToyId:'bus-'+id};p.__sequencerSchedule=step=>({note:p.state.notes[step],context:getCurrentPlaybackOccurrence()});panels.push(p);return p;}
 const source=panel('source'),controller=createLinkedToyViewController({getPanels:()=>{panelReads++;return panels;},getMaster:id=>panels.find(p=>p.id===id),createView:()=>panel('copy-'+(++n)),capture:p=>structuredClone(p.state),apply:async(p,state)=>{p.state=structuredClone(state);},syncVolumeUI:()=>uiSyncs++,register(){},changed(){},focus(){},remove(){}});
 try{
  const a=controller.create(source),b=controller.create(a);assert.equal(a.dataset.linkedCopyNumber,'1');assert.equal(b.dataset.linkedCopyNumber,'2');assert.equal(a.dataset.sharedDefinitionId,b.dataset.sharedDefinitionId);
  controller.prepare();for(const p of [source,a,b])assert.equal(p.querySelector('.toy-header').querySelector('.linked-copy-marker').textContent,'⧉');
  const alone=panel('alone');controller.adopt(alone);assert.equal(alone.querySelector('.toy-header').querySelector('.linked-copy-marker'),null);
  controller.prepare();const initialSyncs=uiSyncs;for(let i=0;i<40;i++)controller.prepare();assert.equal(uiSyncs,initialSyncs,'idle preparation must not repaint unchanged headers or volume controls');
  const reads=panelReads;for(let i=0;i<40;i++)a.__sequencerSchedule(0);assert.equal(panelReads,reads,'playback getters must not repeatedly scan the DOM family');
  await new Promise(resolve=>setImmediate(resolve));a.style.left='100px';b.style.left='900px';b.state.notes=['E4'];b.state.instrument='KALIMBA';b.state.musicalRole='accompaniment';controller.edit(b);
  // Scheduling reads the editing view immediately, even before peer hydration.
  const scheduled=withPlaybackOccurrence({occurrenceId:'B',context:{harmony:{progressionId:'B'}}},()=>a.__sequencerSchedule(0));assert.equal(scheduled.note,'E4');assert.equal(scheduled.context.instanceToyId,a.id);assert.equal(scheduled.context.context.harmony.progressionId,'B');
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(a.state,b.state);assert.deepEqual(source.state,b.state);assert.equal(a.style.left,'100px');assert.equal(b.style.left,'900px');
  a.state.notes=['G3'];controller.edit(a);await new Promise(resolve=>setImmediate(resolve));assert.equal(b.state.notes[0],'G3');
  const definition=b.dataset.sharedDefinitionId,bus=b.__sharedToyDefinition.bus,record=b.__sharedToyDefinition;setToyVolume(bus,.42);controller.beforeDelete(source);source.isConnected=false;panels.splice(panels.indexOf(source),1);
  assert.equal(a.dataset.masterToyId,undefined);assert.equal(b.dataset.masterToyId,a.id);assert.equal(b.dataset.sharedDefinitionId,definition);assert.equal(a.dataset.linkedCopyNumber,'1');assert.equal(b.dataset.linkedCopyNumber,'2');assert.equal(b.__sequencerSchedule(0).note,'G3');
  const c=controller.create(b);assert.equal(c.dataset.linkedCopyNumber,'3');assert.equal(controller.canDelete(a),true);
  assert.equal(c.__sharedToyDefinition,record);assert.equal(c.__sharedToyDefinition.bus,bus);assert.equal(getToyVolumeRaw(c.__audioToyId),.42);assert.equal(getToyGain(c.__audioToyId),getToyGain(bus));
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

test('connected arrangement consumes authored seed, shares four chunks, preserves 16 bars and regenerates without orphans',async()=>{
 const d=dom(),panels=[],model=createConnectionModel();let serial=0;
 model.registerObject('main-heartbeat',{ports:HEARTBEAT_PORTS,transportId:'main-heartbeat'});const structures=createStructureToyModel(model);
 const make=(role,id='toy-'+(++serial))=>{const header=d.node(),label=d.node(),p={id,isConnected:true,dataset:{toy:role==='percussion'?'loopgrid':'drawgrid',musicalRole:role,steps:'8'},style:{left:'0px',top:'0px'},classList:d.node().classList,offsetWidth:680,addEventListener(){},querySelector:q=>q.includes('master-name')?label:q==='.toy-header'?header:null,__audioToyId:'audio-'+id,state:{steps:8,instrument:'PIANO',musicalRole:role,nodes:{active:Array(8).fill(true),list:[0,2,4,2,0,1,3,0].map(n=>[n]),disabled:Array.from({length:8},()=>[])},strokes:[]}};p.__drawToy={getState:()=>p.state};p.__sequencerSchedule=()=>({state:p.state,occurrence:getCurrentPlaybackOccurrence()});panels.push(p);model.registerObject(p.id);ensurePlaybackInstance(p.id,{loopLengthTicks:384});return p;};
 const getToy=id=>panels.find(p=>p.id===id);let toys,phrases;
 const remove=p=>{toys.beforeDelete(p);p.isConnected=false;model.removeObject(p.id);panels.splice(panels.indexOf(p),1);};
 toys=createLinkedToyViewController({getPanels:()=>panels,getMaster:getToy,createView:p=>make(p.dataset.musicalRole),capture:p=>structuredClone(p.state),apply:async(p,s)=>{p.state=structuredClone(s);},register(){},changed(){},focus(){},remove});
 phrases=createLinkedSequenceController({model,structures,getToy,getPanels:()=>panels,createToyInstance:toys.create,removeToy:remove});structures.configure({canRemove:phrases.canRemove,canChangeType:phrases.canChangeType,onRemove:phrases.cleanup});
 const seed=make('melody','authored-seed'),original=structuredClone(seed.state);model.connect('transport',{objectId:'main-heartbeat',portId:'output'},{objectId:seed.id,portId:'input'});
 const arranger=createAutoArranger({model,structures,getPanels:()=>panels,createSource:async role=>make(role==='accompaniment'?role:'percussion'),createInstance:toys.create,createStructureInstance:phrases.create,adoptSource:(p,{owner})=>{toys.adopt(p);p.dataset.autoArrangeOwner=owner;return p;},adoptPhrase:phrases.adopt,removeInstances:owner=>{phrases.removeOwned(owner);toys.removeOwned(owner);},createPhraseSource:async({seed})=>{
  const parts=continueDrawgridPhrase(seed.state),children=[seed,...parts.slice(1).map(state=>{const p=make('melody');p.state=state;return p;})],s=structures.createStandalone('sequence',{name:'Melody Phrase'});model.transaction(()=>structures.suspend(()=>{structures.annotate(s.id,{autoArrangePhrase:{heartbeatId:'main-heartbeat'},outputCount:5});children.forEach((p,i)=>{p.dataset.autoArrangeFill='melody-chunk';const parent=model.getParent(p.id);if(parent)model.disconnect(parent.id);assert.equal(model.connect('sequence',{objectId:s.id,portId:'child:'+i},{objectId:p.id,portId:'input'}).ok,true);});}));return structures.get(s.id);
 }});
 const adapter=createChainSequenceAdapter({connectionModel:model,getToy,chainState:new Map()});
 try{
  const first=await arranger.arrange();await new Promise(r=>setImmediate(r));assert.deepEqual(seed.state,original);
  const verify=()=>{assert.equal(panels.length,15);assert.ok(panels.every(p=>model.isRooted(p.id)),panels.filter(p=>!model.isRooted(p.id)).map(p=>p.id).join(','));const views=structures.list().filter(s=>s.sharedDefinitionId);assert.equal(views.length,2);assert.ok(views.every(s=>!s.collapsed));assert.equal(new Set(panels.map(p=>p.dataset.sharedDefinitionId)).size,7);
   adapter.sync(panels,{state:'paused',currentTick:0},{connections:model.list('sequence'),structures:structures.list()});const root=structures.list().find(s=>s.autoArrange?.root);assert.equal(adapter.runtime.getDefinition(root.definitionId).durationTicks,6144);
   for(let bar=0;bar<16;bar++){const turns=adapter.runtime.turnsInWindow(root.definitionId,bar*384,bar*384+1);assert.equal(turns.length,bar<4||bar>=12?1:bar<8?3:4);for(const t of turns){assert.equal(t.context.transposeSemitones,0);assert.equal(t.context.harmony.chords[0].root,bar>=8&&bar<12?'F':'C');}}
  };verify();
  const b=structures.list().filter(s=>s.sharedDefinitionId).find(s=>s.linkedCopyNumber===2),secondChild=getToy(model.list('sequence').find(e=>e.from.objectId===b.id&&e.from.portId==='child:1').to.objectId);secondChild.state.nodes.list[0]=[7];toys.edit(secondChild);await new Promise(r=>setImmediate(r));assert.ok(panels.filter(p=>p.dataset.sharedDefinitionId===secondChild.dataset.sharedDefinitionId).every(p=>p.state.nodes.list[0][0]===7));
  const bus=secondChild.__sharedToyDefinition.bus;setToyVolume(bus,.3);const definitions=[...new Set(panels.map(p=>p.dataset.sharedDefinitionId))].sort();const next=await arranger.arrange();await new Promise(r=>setImmediate(r));assert.notEqual(next.rootId,first.rootId);verify();assert.deepEqual([...new Set(panels.map(p=>p.dataset.sharedDefinitionId))].sort(),definitions);assert.equal(getToyVolumeRaw(bus),.3);
 }finally{panels.forEach(p=>p.isConnected=false);adapter.reset();phrases.dispose();structures.dispose();d.close();}
});
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

test('Arrange can await delayed linked-view sizing before laying out a branch',async()=>{
 const d=dom(),panels=[];let release;
 const make=id=>{const p={id,isConnected:true,dataset:{toy:'drawgrid'},style:{},classList:d.node().classList,addEventListener(){},querySelector:()=>null,state:{instrument:'PIANO',notes:['C4']},offsetHeight:160,__drawToy:{}};panels.push(p);return p;};
 const source=make('source');source.offsetHeight=757;
 const controller=createLinkedToyViewController({getPanels:()=>panels,getMaster:id=>panels.find(p=>p.id===id),capture:p=>p.state,createView:()=>make('copy'),apply:async p=>{await new Promise(r=>release=r);p.offsetHeight=source.offsetHeight;},register(){},changed(){},focus(){},remove(){}});
 try{const copy=controller.create(source);let ready=false;const pending=controller.whenReady([copy.id]).then(()=>ready=true);
  await Promise.resolve();assert.equal(ready,false);assert.equal(copy.offsetHeight,160);
  await controller.whenReady(['unrelated']);assert.equal(ready,false);
  release();await pending;assert.equal(copy.offsetHeight,757);assert.equal(ready,true);
 }finally{d.close();}
});

test('DrawGrid shared commit publishes canonical state/pattern together before window pointerup and to siblings',async()=>{
 const d=dom(),panels=[];
 function panel(id){const p={id,isConnected:true,__drawToy:{},dataset:{toy:'drawgrid',toyName:'Draw'},style:{},classList:d.node().classList,addEventListener(){},querySelector(){return null;},state:{steps:8,instrument:'PIANO',authoredNotes:[{id:'note',col:0,sourceMidi:81}],pitchRange:{minMidi:48,maxMidi:83},nodes:{list:[[2],[],[],[],[],[],[],[]],active:[true],disabled:[[],[],[],[],[],[],[],[]]}},__seqPattern:{steps:8,cols:[{nodes:[2]}]},__sequencerSchedule(){return p.__seqPatternActive;}};panels.push(p);return p;}
 const p=panel('source'),c=createLinkedToyViewController({getPanels:()=>panels,getMaster:id=>panels.find(p=>p.id===id),createView:()=>panel('peer'),capture:p=>structuredClone(p.state),apply:async(p,s)=>{p.state=structuredClone(s);},register(){},changed(){},focus(){},remove(){}});
 try{c.adopt(p);const peer=c.create(p);await c.whenReady([peer.id]);
  p.state.authoredNotes[0].sourceMidi=82;p.state.nodes.list[0]=[1];
  c.edit(p); // panel pointerup: sequencer callback has not run yet
  assert.equal(p.__sharedToyState.authoredNotes[0].sourceMidi,82);assert.equal(peer.__seqPattern.cols[0].notes[0].sourceMidi,82);assert.deepEqual(peer.__seqPattern.cols[0].nodes,[1]);
  const revision=p.__sharedToyDefinition.revision;p.__seqPattern={steps:8,cols:[{nodes:[1]}]};c.edit(p);assert.equal(p.__sharedToyDefinition.revision,revision);
  assert.equal(peer.__sequencerSchedule().cols[0].notes[0].sourceMidi,82);await c.whenReady([peer.id]);assert.equal(peer.state.authoredNotes[0].sourceMidi,82);
  p.state.authoredNotes[0].sourceMidi=81;p.state.nodes.list[0]=[2];c.edit(p);assert.equal(peer.__seqPattern.cols[0].notes[0].sourceMidi,81);assert.equal(p.__sharedToyState.authoredNotes[0].id,'note');
  const authored=structuredClone(p.state.authoredNotes);
  for(const offset of [1,-1,2,-2,0]){p.state.registerOctaves=offset;c.edit(p);await c.whenReady([peer.id]);assert.equal(peer.dataset.registerOctaves,String(offset));assert.equal(peer.state.registerOctaves,offset);assert.deepEqual(peer.state.authoredNotes,authored);assert.deepEqual(peer.__seqPattern.cols[0].notes.map(n=>n.sourceMidi),[81]);}
  for(const duration of [192,0]){p.state.authoredDurationTicks=duration;c.edit(p);await c.whenReady([peer.id]);assert.equal(peer.state.authoredDurationTicks,duration);assert.equal(peer.dataset.authoredDurationTicks,duration?String(duration):undefined);assert.deepEqual(peer.state.authoredNotes,authored);}
 }finally{d.close();}
});

test('Free Play bulk silence publishes through the ordinary shared DrawGrid commit before playback/reload',async()=>{
 const d=dom(),panels=[];
 function panel(id){const p={id,isConnected:true,__drawToy:{},dataset:{toy:'drawgrid',toyName:'Draw'},style:{},classList:d.node().classList,addEventListener(){},querySelector(){return null;},
  state:{steps:8,instrument:'PIANO',pitchRange:{minMidi:48,maxMidi:59},authoredNotes:[{id:'a',col:0,sourceMidi:81},{id:'b',col:1,sourceMidi:69},{id:'c',col:2,sourceMidi:60}],nodes:{list:[[2],[2],[11],[],[],[],[],[]],active:[true,true,true],disabled:[[],[],[],[],[],[],[],[]]},freePlay:{strokeId:'line',paint:[]}},
  __seqPattern:{steps:8,cols:[]},__sequencerSchedule(){return p.__seqPatternActive.cols.flatMap(c=>c.notes.filter(n=>!eventMuted(n))).map(n=>n.id);}};panels.push(p);return p;}
 const p=panel('source'),c=createLinkedToyViewController({getPanels:()=>panels,getMaster:id=>panels.find(p=>p.id===id),createView:()=>panel('peer'),capture:p=>structuredClone(p.state),apply:async(p,s)=>{p.state=structuredClone(s);},register(){},changed(){},focus(){},remove(){}});
 try{
  c.adopt(p);const peer=c.create(p);await c.whenReady([peer.id]);
  updateSilence(p.state.authoredNotes,{cuts:{b:true},coveredIds:['c']});c.edit(p);
  assert.deepEqual(peer.__sequencerSchedule(),['a']);assert.equal(peer.__seqPattern.cols[1].notes[0].scissorMuted,true);assert.equal(peer.__seqPattern.cols[2].notes[0].paintCovered,true);
  await c.whenReady([peer.id]);assert.deepEqual(peer.state.authoredNotes,p.state.authoredNotes);
  updateSilence(p.state.authoredNotes,{cuts:{b:false}});c.edit(p);assert.deepEqual(peer.__sequencerSchedule(),['a','b']);
  updateSilence(p.state.authoredNotes,{coveredIds:[]});p.state.freePlay.paint=[];c.edit(p);assert.deepEqual(peer.__sequencerSchedule(),['a','b','c']);
  await c.whenReady([peer.id]);const saved=JSON.parse(JSON.stringify(c.definitions()[0].state));assert.ok(saved.authoredNotes.every(n=>!eventMuted(n)));assert.deepEqual(saved.authoredNotes.map(n=>[n.id,n.sourceMidi,n.col]),[['a',81,0],['b',69,1],['c',60,2]]);
 }finally{d.close();}
});
