import assert from 'node:assert/strict';
import {createAutoArranger} from '../../src/auto-arrange.js';
import {auditArrangementInputs} from '../../src/auto-arrange-inputs.js';
import {createConnectionModel,HEARTBEAT_PORTS} from '../../src/connections.js';
import {createStructureToyModel} from '../../src/structure-toys.js';
import {createChainSequenceAdapter} from '../../src/chain-sequence.js';
import {createSequencerScheduler} from '../../src/note-scheduler.js';
import {ensurePlaybackInstance,clearPlaybackInstancesForTests} from '../../src/playback-instances.js';
import {bouncerEventsInWindow} from '../../src/bouncer-transport.js';
import {ripplerEventsInWindow} from '../../src/ripplesynth-transport.js';
import {resolveMusicalPitch,noteMidi} from '../../src/harmonic-adaptation.js';
import {prepareDrawgridPhrase} from '../../src/drawgrid/dg-phrase-chunks.js';
import {DEFAULT_CHORDS} from '../../src/chord-progression.js';
import {MAIN_TRANSPORT_ID as H} from '../../src/transport-registry.js';
import {generatedMelody,seededRandom} from './generated-melody.mjs';
const input=objectId=>({objectId,portId:'input'}),out=(objectId,portId='output')=>({objectId,portId});

export const INPUT_MATRIX=[
 ['drawgrid'],['loopgrid'],['bouncer'],['rippler'],
 ['drawgrid','loopgrid'],['drawgrid','bouncer'],['drawgrid','rippler'],
 ['loopgrid','bouncer'],['loopgrid','rippler'],['bouncer','rippler'],
 ['drawgrid','bouncer','rippler'],['loopgrid','loopgrid'],['loopgrid-drum','loopgrid'],
 ['loopgrid','loopgrid','loopgrid'],['drawgrid','loopgrid','loopgrid'],
 ['drawgrid','bouncer','rippler','loopgrid'],
 [{kind:'bouncer',role:'percussion'},{kind:'rippler',role:'percussion'},'loopgrid'],
 [{kind:'drawgrid',role:'accompaniment'},'bouncer'],
 [{kind:'drawgrid',sparse:true},{kind:'loopgrid',sparse:true}],
 [{kind:'drawgrid',empty:true},'rippler'],
 [{kind:'bouncer',empty:true},'loopgrid'],
 [{kind:'rippler',empty:true},'drawgrid'],
 [{kind:'rippler',instrument:'SYNTH BRIGHT',sparse:true}],
];

export async function runInputCase(spec,{seed=42}={}){
 clearPlaybackInstancesForTests();const model=createConnectionModel(),structures=createStructureToyModel(model),panels=[],events=[],generated=[];
 const clock={state:'paused',currentTick:0};let serial=0;
 model.registerObject(H,{ports:HEARTBEAT_PORTS,transportId:H});
 const getToy=id=>panels.find(p=>p.id===id),remove=p=>{model.removeObject(p.id);panels.splice(panels.indexOf(p),1);};
 function add(spec,id='fill-'+(++serial),source=null){
  if(typeof spec==='string')spec={kind:spec};const kind=spec.kind;
  const percussion=['loopgrid','loopgrid-drum'].includes(kind)||spec.role==='percussion';
  const role=spec.role||(['loopgrid','loopgrid-drum'].includes(kind)?'percussion':kind==='drawgrid'?'melody':null);
  const state=spec.state||{
   steps:8,instrument:spec.instrument||(percussion?'HI-HAT CLOSED':'PIANO'),...(role?{musicalRole:role}:{}),
   nodes:{active:Array.from({length:8},(_,i)=>!spec.empty&&(!spec.sparse||i===0)),
    list:Array.from({length:8},(_,i)=>spec.empty||spec.sparse&&i!==0?[]:[spec.sparse?11:[7,5,4,5,7,9,6,11][i]]),disabled:Array.from({length:8},()=>[])},
   strokes:[],generator:{placed:!spec.empty},lastLaunch:spec.empty?null:{x:40,y:70,vx:3,vy:-4},
   loopRec:{mode:'replay',pattern:spec.empty?[]:[{note:'C4',offsetTick:0},{note:'G4',offsetTick:192}]}};
  const panel={id,dataset:{toy:kind,instrument:state.instrument,steps:String(state.steps),...(role?{musicalRole:role}:{}),sharedDefinitionId:source?.dataset.sharedDefinitionId||'definition:'+id},style:{left:'0px',top:'0px'}};
  if(source)Object.defineProperty(panel,'state',{get:()=>source.state});else panel.state=structuredClone(state);
  panel.__drawToy={getState:()=>panel.state};panel.__getBouncerSnapshot=()=>panel.state;
  panel.__getRipplerSnapshot=()=>({...panel.state,steps:panel.state.nodes.list.map((rows,i)=>rows.map((_,idx)=>({idx,offsetTick:i*48})))});
  if(percussion)panel.__gridState=source?.__gridState||{steps:Array.from({length:8},(_,i)=>!spec.empty&&(!spec.sparse||i===0)&&i%2===0)};
  panel.__sequencerEventsInWindow=(fromTick,toTick,instance)=>{
   if(kind==='bouncer')return bouncerEventsInWindow({instance,pattern:panel.state.loopRec.pattern,fromTick,toTick});
   if(kind==='rippler')return ripplerEventsInWindow({instance,pattern:panel.state.nodes.list.map((rows,i)=>rows.length&&panel.state.nodes.active[i]?[i]:[]),
    patternOffsets:panel.state.nodes.list.map((_,i)=>new Map([[i,i*48]])),blocks:Array.from({length:8},()=>({active:true})),fromTick,toTick});
   const result=[];
   for(let tick=Math.ceil(fromTick/48)*48;tick<toTick;tick+=48){
    const col=Math.floor(tick/48)%panel.state.steps;
    if(percussion){if(panel.__gridState.steps[col%8])result.push({eventTick:tick,eventKey:'step:'+col,note:48});}
    else if(panel.state.nodes.active[col])for(const row of panel.state.nodes.list[col])result.push({eventTick:tick,eventKey:'step:'+col+':'+row,note:59-row});
   }
   return result;
  };
  panel.__sequencerScheduleEvent=(event,when,metadata)=>{
   const sourcePitch=event.note!=null?noteMidi(event.note):59-panel.state.nodes.list[event.slot]?.[0];
   const musicalRole=panel.dataset.musicalRole||(percussion?'percussion':/bass/i.test(panel.dataset.instrument)?'accompaniment':'melody');
   const decision=resolveMusicalPitch({sourcePitch,eventTick:event.eventTick,context:metadata.context,role:musicalRole});
   events.push({tick:event.eventTick,when,pitch:decision.finalNote,sourcePitch,role:musicalRole,
    sourceId:source?.id||panel.id,toyId:panel.id,occurrenceId:metadata.occurrenceId,identity:metadata.identity,
    chord:decision.resolvedChord,dispatchTick:clock.currentTick,part:percussion?'rhythm':'pitched'});
  };
  panels.push(panel);model.registerObject(id);ensurePlaybackInstance(id,{loopLengthTicks:state.steps===32?1536:384});return panel;
 }
 const originals=spec.map((s,i)=>add(s,'user-'+i));for(const p of originals)model.connect('transport',out(H),input(p.id));
 const originalStates=originals.map(p=>structuredClone(p.state));
 const createInstance=(source,options)=>{const p=add({kind:source.dataset.toy,role:source.dataset.musicalRole},source.id+'.copy'+(++serial),source);
  Object.assign(p.dataset,{masterToyId:source.id,linkedView:'1',autoArrangeOwner:options.autoArrangeOwner});return p;};
 const createStructureInstance=(source,options)=>{
  const copy=structures.createStandalone('sequence',{name:'Phrase copy',autoArrange:options.autoArrange});
  structures.annotate(copy.id,{masterStructureId:source.id,autoArrangePhrase:source.autoArrangePhrase,sharedDefinitionId:'phrase:'+source.id,outputCount:5});
  for(const edge of model.list('sequence').filter(e=>e.from.objectId===source.id)){
   const p=createInstance(getToy(edge.to.objectId),{autoArrangeOwner:options.autoArrange.owner});model.connect('sequence',out(copy.id,edge.from.portId),input(p.id));
  }return structures.get(copy.id);
 };
 const arranger=createAutoArranger({model,structures,getPanels:()=>panels,createInstance,createStructureInstance,
  adoptSource:(p,{owner})=>{p.dataset.autoArrangeOwner=owner;return p;},
  adoptPhrase:(s,{owner})=>{structures.annotate(s.id,{autoArrange:{owner},sharedDefinitionId:'phrase:'+s.id});return structures.get(s.id);},
  removeInstances:owner=>{for(const p of [...panels])if(p.dataset.masterToyId&&p.dataset.autoArrangeOwner===owner)remove(p);},
  createSource:async role=>{generated.push(role);return add({kind:['rhythm','extraRhythm'].includes(role)?'loopgrid':'drawgrid',role:['rhythm','extraRhythm'].includes(role)?'percussion':role});},
  createPhraseSource:async({firstChunk})=>{
   generated.push('melody-phrase');const chunks=await prepareDrawgridPhrase(firstChunk?.state,()=>generatedMelody(seed),{harmony:{originTick:0,stepTicks:384,chords:DEFAULT_CHORDS},random:seededRandom(seed)});
   const s=structures.createStandalone('sequence',{name:'Melody Phrase'});structures.annotate(s.id,{autoArrangePhrase:{heartbeatId:H},outputCount:5});
   for(let i=0;i<4;i++){
    const p=i===0&&firstChunk?firstChunk:add({kind:'drawgrid',role:'melody',state:chunks[i]});
    p.state=chunks[i];p.dataset.steps='8';p.dataset.autoArrangeFill='melody-chunk';
    const edge=model.getParent(p.id);if(edge)model.disconnect(edge.id);model.connect('sequence',out(s.id,'child:'+i),input(p.id));
   }return structures.get(s.id);
  }});
 const adapter=createChainSequenceAdapter({connectionModel:model,getToy,chainState:new Map()}),scheduler=createSequencerScheduler();
 const sync=()=>adapter.sync(panels,clock,{structures:structures.list(),connections:model.list('sequence')});
 const poll=(from,to)=>{clock.currentTick=from;return scheduler.tick({transportId:H,currentTick:from,lookaheadEndTick:to,
  playbackTurns:adapter.turnsForLookahead(from,to,H),getToy,tickToAudioTime:tick=>tick/192});};
 try{
  const expected=auditArrangementInputs(originals).filter(e=>e.usable).map(e=>e.id),result=await arranger.arrange();sync();
  const root=structures.get(result.rootId);assert.equal(adapter.runtime.getDefinition(root.definitionId).durationTicks,6144);
  clock.state='playing';for(let tick=0;tick<6144;tick+=12)poll(tick,Math.min(6144,tick+48));
  const heard=[...new Set(events.map(e=>e.sourceId))];assert.ok(expected.every(id=>heard.includes(id)),JSON.stringify({expected,heard}));
  assert.ok(events.some(e=>e.role==='melody'));assert.ok(events.some(e=>e.role==='accompaniment'));assert.ok(events.some(e=>e.role==='percussion'));
  assert.equal(new Set(events.map(e=>e.identity)).size,events.length);
  assert.ok(events.every(e=>e.tick>=e.dispatchTick&&Number.isFinite(e.pitch)));
  assert.ok(events.filter(e=>e.role!=='percussion').every(e=>e.chord));
  for(let i=0;i<originals.length;i++)assert.deepEqual(originals[i].state,originalStates[i]);
  assert.ok(panels.filter(p=>!p.dataset.masterToyId).every(p=>!auditArrangementInputs([p])[0].usable||model.isRooted(p.id)));
  const song={durationTicks:6144,events:structuredClone(events)},beforeSourceIds=structuredClone(result.sourceIds);
  adapter.seekTransport(H,{state:'paused',currentTick:0});scheduler.resetTimeline(0);events.length=0;poll(0,48);poll(1,48);
  assert.equal(new Set(events.map(e=>e.identity)).size,events.length);assert.ok(events.every(e=>e.tick===0));
  const saved=JSON.parse(JSON.stringify({nodes:structures.list(),edges:model.list()}));
  adapter.reset();model.list().forEach(e=>model.disconnect(e.id));structures.suspend(()=>{structures.restore(saved.nodes);for(const edge of saved.edges)model.connect(edge.kind,edge.from,edge.to,{id:edge.id});});clock.state='paused';clock.currentTick=0;sync();
  assert.equal(adapter.runtime.getDefinition(root.definitionId).durationTicks,6144);
  const next=await arranger.arrange();sync();assert.deepEqual(next.sourceIds,beforeSourceIds);
  assert.deepEqual(next.inputReport.authoredSourceIds,result.inputReport.authoredSourceIds);
  for(let i=0;i<originals.length;i++)assert.deepEqual(originals[i].state,originalStates[i]);
  return {input:spec,userSourceIds:originals.map(p=>p.id),assigned:result.sourceIds,generated:result.inputReport.generated,
   actualFillCalls:generated,heardUserSources:expected.filter(id=>heard.includes(id)),durationTicks:6144,
   eventCount:song.events.length,reset:true,graphReload:true,arrangeAgain:true,inputReport:result.inputReport,song};
 }finally{scheduler.dispose();adapter.reset();structures.dispose();}
}
