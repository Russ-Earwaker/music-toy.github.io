import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createPlaybackVisualQueue} from '../src/playback-visual-events.js';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createStructureToyModel} from '../src/structure-toys.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {createAutoArranger} from '../src/auto-arrange.js';
import {createLinkedSequenceController} from '../src/linked-sequences.js';
import {bouncerEventsInWindow} from '../src/bouncer-transport.js';
import {ripplerEventsInWindow} from '../src/ripplesynth-transport.js';
import {ensurePlaybackInstance,clearPlaybackInstancesForTests,invalidatePlaybackOccurrence} from '../src/playback-instances.js';
import {MAIN_TRANSPORT_ID as H} from '../src/transport-registry.js';
const input=objectId=>({objectId,portId:'input'}),out=(objectId,portId='output')=>({objectId,portId});

test('Bouncer initializes full Linked Copy editors once while retaining the legacy instance guard',()=>{
  const source=readFileSync(new URL('../src/bouncer-init.js',import.meta.url),'utf8');
  const start=source.indexOf('export function initializeBouncer'),end=source.indexOf('\nfunction bootBouncers');
  let creates=0;
  const context=vm.createContext({initToyUI(){},createBouncer(){creates++;return {};},console});
  vm.runInContext(source.slice(start,end).replace('export function','function'),context);
  context.initializeBouncer({dataset:{masterToyId:'source'}});assert.equal(creates,0);
  const copy={dataset:{masterToyId:'source',linkedView:'1'}};
  context.initializeBouncer(copy);context.initializeBouncer(copy);assert.equal(creates,1);
});

test('a delayed frame retains heard occurrences while cancelled future voices get no visual event',()=>{
  clearPlaybackInstancesForTests();const clock={state:'playing',currentTick:100};
  const queue=createPlaybackVisualQueue({getTransport:()=>clock}),instance=ensurePlaybackInstance('toy');
  const occurrence={occurrenceId:instance.occurrenceId,generation:instance.generation,identity:'heard'};
  queue.enqueue({toyId:'toy',transportId:H,dueTick:48,eventTick:48,occurrence});
  queue.enqueue({toyId:'toy',transportId:H,dueTick:192,eventTick:192,occurrence:{...occurrence,identity:'future'}});
  invalidatePlaybackOccurrence(instance.occurrenceId);clock.currentTick=500;
  const seen=[];queue.flush(()=>clock,e=>seen.push(e.eventTick));queue.flush(()=>clock,e=>seen.push(e.eventTick));
  assert.deepEqual(seen,[48]);queue.dispose();
});

test('100 root cycles retain boundary notes and one visible event per Bouncer/Rippler occurrence',()=>{
  clearPlaybackInstancesForTests();
  const model=createConnectionModel(),queue=createPlaybackVisualQueue(),state={state:'paused',currentTick:0};
  model.registerObject(H,{ports:HEARTBEAT_PORTS,transportId:H});
  const audio=[],visual=[],blocks=[{active:true},{active:true}];
  const panels=['bouncer','rippler'].map(type=>({id:type,dataset:{toy:type},__seqRev:0,
    __sequencerEventsInWindow:(fromTick,toTick,instance)=>type==='bouncer'
      ?bouncerEventsInWindow({instance,pattern:[{note:'C4',blockIndex:0,offsetTick:0},{note:'G4',blockIndex:1,offsetTick:192}],blocks,fromTick,toTick})
      :ripplerEventsInWindow({instance,pattern:[new Set([0]),new Set([1])],patternOffsets:[new Map([[0,0]]),new Map([[1,192]])],blocks,fromTick,toTick}),
    __sequencerScheduleEvent(event,when,occurrence){audio.push({type,event,occurrence});queue.enqueue({toyId:type,transportId:H,dueTick:event.eventTick,eventTick:event.eventTick,eventKey:event.eventKey,occurrence});},
  }));
  for(const p of panels){model.registerObject(p.id);ensurePlaybackInstance(p.id);model.connect('transport',out(H),input(p.id));}
  const adapter=createChainSequenceAdapter({connectionModel:model,getToy:id=>panels.find(p=>p.id===id),chainState:new Map()});
  adapter.sync(panels,state,{connections:model.list('sequence')});
  state.state='playing';
  const scheduler=createSequencerScheduler({lateGraceTicks:16});
  for(let tick=3;tick<38400;tick+=12){
    state.currentTick=tick;
    const turns=adapter.turnsForLookahead(tick,Math.min(38400,tick+48),H);
    scheduler.tick({transportId:H,currentTick:tick,lookaheadEndTick:Math.min(38400,tick+48),playbackTurns:turns,getToy:id=>panels.find(p=>p.id===id),tickToAudioTime:t=>t});
    queue.flush(()=>state,e=>visual.push(e));
    for(const p of panels)p.presentation={scale:tick%2?.4:2,dpr:2,width:tick%2?800:1280};
  }
  for(const type of ['bouncer','rippler']){
    const notes=audio.filter(e=>e.type===type);assert.equal(notes.length,200);
    assert.deepEqual(notes.map(e=>e.event.eventTick),Array.from({length:200},(_,i)=>i*192));
    assert.equal(visual.filter(e=>e.toyId===type).length,200,`${type}: missing ${notes.filter(n=>!visual.some(v=>v.occurrence.identity===n.occurrence.identity)).map(n=>n.event.eventTick)}`);
    assert.equal(new Set(notes.map(e=>e.occurrence.identity)).size,200);
  }
  queue.clear(H);adapter.seekTransport(H,{state:'paused',currentTick:0});state.currentTick=0;state.state='paused';
  queue.flush(()=>state,()=>assert.fail('paused seek emitted a note'));
  assert.equal(adapter.turnsForLookahead(0,10,H)[0].startTick,0);
  scheduler.dispose();adapter.reset();queue.dispose();
});

test('authored melody becomes four editable definitions and two four-view phrases, retained on Arrange Again/reload',async()=>{
  clearPlaybackInstancesForTests();const model=createConnectionModel(),structures=createStructureToyModel(model),panels=[];
  model.registerObject(H,{ports:HEARTBEAT_PORTS,transportId:H});let serial=0;
  const add=(role,id='toy'+(++serial))=>{const p={id,dataset:{toy:role==='rhythm'||role==='extraRhythm'?'loopgrid':'drawgrid',musicalRole:role,steps:'8'},notes:[1,3,5],volume:.37,instrument:'PIANO'};panels.push(p);model.registerObject(id);ensurePlaybackInstance(id);return p;};
  const first=add('melody','authored'),original=structuredClone(first);
  model.connect('transport',out(H),input(first.id));
  const linked=createLinkedSequenceController({model,structures,getPanels:()=>panels,getToy:id=>panels.find(p=>p.id===id),removeToy:p=>{model.removeObject(p.id);panels.splice(panels.indexOf(p),1);},
    createToyInstance:(master,options)=>{const p=add(master.dataset.musicalRole);p.dataset={...p.dataset,masterToyId:master.id,...options};return p;}});
  const arranger=createAutoArranger({model,structures,getPanels:()=>panels,createSource:async role=>add(role),
    createInstance:(master,opts)=>{const p=add(master.dataset.musicalRole);p.dataset.masterToyId=master.id;p.dataset.autoArrangeOwner=opts.autoArrangeOwner;return p;},
    createStructureInstance:linked.create,removeInstances:owner=>linked.removeOwned(owner),
    createPhraseSource:async({heartbeatId,firstChunk})=>{
      assert.equal(firstChunk,first);first.dataset.autoArrangeFill='melody-chunk';
      const s=structures.createStandalone('sequence');structures.annotate(s.id,{autoArrangePhrase:{heartbeatId},outputCount:5});
      const children=[first,...Array.from({length:3},()=>add('melody'))];
      children.forEach((p,i)=>{p.dataset.autoArrangeFill='melody-chunk';const edge=model.getParent(p.id);if(edge)model.disconnect(edge.id);model.connect('sequence',out(s.id,'child:'+i),input(p.id));});return structures.get(s.id);
    },
  });
  const result=await arranger.arrange();
  assert.deepEqual(first.notes,original.notes);assert.equal(first.instrument,original.instrument);assert.equal(first.volume,original.volume);assert.equal(first.dataset.musicalRole,original.dataset.musicalRole);
  const phrase=structures.get(result.sourceIds.melody),sources=model.list('sequence').filter(e=>e.from.objectId===phrase.id);
  assert.equal(sources.length,4);assert.equal(sources[0].to.objectId,first.id);assert.equal(new Set(sources.map(e=>e.to.objectId)).size,4);
  for(const copy of structures.list().filter(s=>s.masterStructureId===phrase.id))assert.equal(model.list('sequence').filter(e=>e.from.objectId===copy.id).length,4);
  assert.equal(structures.list().filter(s=>s.masterStructureId===phrase.id).length,1);
  assert.equal((await arranger.arrange()).sourceIds.melody,phrase.id);
  const saved=structures.list(),edges=model.list();structures.suspend(()=>{structures.restore(saved);edges.forEach(e=>model.connect(e.kind,e.from,e.to));});
  assert.equal(structures.get(phrase.id).sharedChildren.length,4);linked.dispose();structures.dispose();
});
