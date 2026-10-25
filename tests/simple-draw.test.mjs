import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createContainerToyModel} from '../src/container-toys.js';
import {createSimpleDrawController} from '../src/simple-draw.js';
import {createLineSource} from '../src/free-play-line.js';
import {lineDrawGridStates,applyFreePlayDrawGrid} from '../src/free-play-drawgrid.js';
import {restoreAuthoredNotes,drawgridPatternFromState,normalizeAuthoredState} from '../src/drawgrid/dg-authored-notes.js';
import {toyLoopLengthTicks} from '../src/drawgrid/dg-pattern-length.js';
import {eventMuted,paintShapes,paintShapeContains} from '../src/free-play-silence.js';
import {createStructureToyModel} from '../src/structure-toys.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {ensurePlaybackInstance,getPlaybackInstance,clearPlaybackInstancesForTests} from '../src/playback-instances.js';
import {MAIN_TRANSPORT_ID} from '../src/transport-registry.js';
import {resolveMusicalPitch} from '../src/harmonic-adaptation.js';
import {midiToName} from '../src/note-helpers.js';
import {uiMode} from '../src/ui-mode.js';
import {prepareBoardDrawing,drawingAuthoredBounds} from '../src/simple-draw-placement.js';
import {simplePaintState} from '../src/simple-paint-state.js';

const short=()=>createLineSource([{x:.1,y:.8},{x:.6,y:.2}]);
const maximum=()=>createLineSource([{x:0,y:.9},{x:1,y:.1},{x:0,y:.9},{x:1,y:.1},{x:0,y:.9}]);
test('Paint actions derive from content and transient drawing state',()=>{
 assert.deepEqual(simplePaintState(false),{state:'EMPTY_IDLE',canvas:false,draw:true,drawSelected:false,scissors:false,scissorsSelected:false,coil:false,clear:false});
 assert.equal(simplePaintState(false,true).state,'DRAW_ACTIVE');assert.equal(simplePaintState(false,true).draw,true);assert.equal(simplePaintState(false,true).drawSelected,true);
 assert.deepEqual(simplePaintState(true),{state:'AUTHORED_SCISSORS',canvas:true,draw:false,drawSelected:false,scissors:true,scissorsSelected:true,coil:true,clear:true});
});
function fixture({afterCreate=async()=>{}}={}){
 clearPlaybackInstancesForTests();const model=createConnectionModel(),toys=new Map(),positions=new Map(),calls=[],slots=[],cancelled=[];let serial=0,sync=()=>{};
 model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS,transportId:MAIN_TRANSPORT_ID});
 const getToy=id=>toys.get(id),containers=createContainerToyModel(model,{getRect:id=>positions.get(id),getDuration:id=>toyLoopLengthTicks(getToy(id)),setPosition:(id,x,y)=>positions.set(id,{...positions.get(id),x,y}),removeInternal:id=>{model.removeObject(id);toys.delete(id);positions.delete(id);}});
 const publish=p=>{p.state=normalizeAuthoredState({...p.state,authoredNotes:p.__dgAuthoredNotes});p.__seqPattern=drawgridPatternFromState(p.state);p.__seqRev++;};
 async function createGrid(state,position){
  const id=`grid${++serial}`,p={id,dataset:{toy:'drawgrid',steps:state.steps},state:structuredClone(state),__seqRev:0,__sequencerSchedule(col,time,meta){
   const column=p.__seqPattern.cols[col],notes=column?.active?column.notes:[];
   slots.push({id,col,tick:meta.eventTick,voices:notes.map(n=>[n.id,n.sourceMidi,eventMuted(n)])});
   for(const n of notes)if(!eventMuted(n))calls.push({id,noteId:n.id,col,tick:meta.eventTick,sourceMidi:n.sourceMidi,performed:resolveMusicalPitch({sourcePitch:midiToName(n.sourceMidi),eventTick:meta.eventTick,context:meta.context,role:'melody'}).finalNote,context:meta.context});
  }};
  restoreAuthoredNotes(p,state);applyFreePlayDrawGrid(p,state.freePlay);publish(p);model.registerObject(id);ensurePlaybackInstance(id,{loopLengthTicks:toyLoopLengthTicks(p)});toys.set(id,p);positions.set(id,{...position,width:800,height:760});await afterCreate(p);return p;
 }
 const transport={state:'stopped',currentTick:0,async play(){this.state='playing';}},structures=createStructureToyModel(model,{getDuration:id=>toyLoopLengthTicks(getToy(id))});
 const service=createSimpleDrawController({containers,model,getToy,createGrid,removeGrid:p=>{model.removeObject(p.id);toys.delete(p.id);positions.delete(p.id);},publish,cancelScheduled:p=>cancelled.push(p.id),getTransport:id=>model.isRooted(id)?transport:null,onChanged:()=>sync()});
 const adapter=createChainSequenceAdapter({getToy,chainState:new Map(),connectionModel:model}),scheduler=createSequencerScheduler();
 sync=()=>adapter.sync([...toys.values()],{currentTick:transport.currentTick,state:'stopped'},{connections:model.list('sequence'),structures:structures.list()});
 const wire=(from,to,port='output',kind='sequence')=>{const r=model.connect(kind,{objectId:from,portId:port},{objectId:to,portId:'input'});assert.ok(r.ok,r.reason);return r.connection;};
 function create(types=[]){const c=service.create({x:50,y:100});let from=MAIN_TRANSPORT_ID,port='output',kind='transport';for(const type of types){const s=structures.createStandalone(type);if(type==='transpose')structures.setSemitones(s.id,7);if(type==='repeat')structures.setCount(s.id,3);wire(from,s.id,port,kind);from=s.id;port='child:0';kind='sequence';}wire(from,c.id,port,kind);sync();return c;}
 function poll(from,to){transport.currentTick=from;const turns=adapter.turnsForLookahead(from,to);scheduler.tick({transportId:MAIN_TRANSPORT_ID,playbackTurns:turns,getToy,currentTick:from,lookaheadEndTick:to,tickToAudioTime:t=>t});}
 return {model,containers,service,structures,toys,positions,calls,slots,cancelled,transport,createGrid,publish,wire,create,sync,poll,adapter,scheduler,dispose(){scheduler.dispose();adapter.reset();structures.dispose();containers.dispose();clearPlaybackInstancesForTests();}};
}

test('repeated interface switches during playback preserve topology, ownership, phase and scheduled voices',async()=>{
 const f=fixture();try{
  const a=f.create(['repeat','transpose']),b=f.create(['chord-progression']);
  await f.service.draw(a.id,short());await f.service.draw(b.id,short());
  await f.transport.play();
  const graph=structuredClone(f.model.snapshot()),containers=f.containers.snapshot();
  f.poll(0,120);
  const transport={state:f.transport.state,currentTick:f.transport.currentTick},voices=structuredClone(f.calls);
  const phases=[...f.toys.values()].map(p=>getPlaybackInstance(p.id).sourcePhaseOriginTick);
  let events=0;const off=f.model.subscribe(()=>events++);
  for(let i=0;i<20;i++)uiMode.set(i%2?'simple':'advanced');
  assert.equal(events,0);off();
  assert.deepEqual(f.model.snapshot(),graph);assert.deepEqual(f.containers.snapshot(),containers);
  assert.equal(f.transport.state,transport.state);assert.equal(f.transport.currentTick,transport.currentTick);
  assert.deepEqual([...f.toys.values()].map(p=>getPlaybackInstance(p.id).sourcePhaseOriginTick),phases);
  assert.deepEqual(f.calls,voices);f.poll(0,120);assert.deepEqual(f.calls,voices);
 }finally{uiMode.set('simple');f.dispose();}
});

for(const types of [[],['repeat'],['chord-progression'],['transpose'],['chord-progression','transpose','repeat']])test(`closed/Open/Close/Expand preserve every voice, rest, tick and performed pitch under ${types.join('/')||'Heartbeat'}`,async()=>{
 const f=fixture();try{
  const c=f.create(types),source=maximum();await f.service.draw(c.id,source);const ps=f.service.panels(c.id),notes=ps.flatMap(p=>p.__dgAuthoredNotes);
  f.service.setSilence(c.id,{cuts:{[notes[2].id]:true,[notes[6].id]:true},coveredIds:[notes[4].id,notes[6].id]});
  const before=structuredClone(notes),wires=f.model.snapshot().connections,root=f.adapter.getRootForToy(ps[0].id),rootObject=f.model.getObject(root),definition=f.adapter.runtime.getDefinition(rootObject?.structure?.definitionId||rootObject?.modifier?.definitionId||'sequence:'+root),duration=definition.durationTicks;
  const captures=[];
  for(let cycle=0;cycle<4;cycle++){
   if(cycle===1)f.containers.open(c.id);if(cycle===2)f.containers.open(c.id,false);if(cycle===3)assert.ok(f.containers.expand(c.id).ok);
   f.sync();const start=f.calls.length,slotStart=f.slots.length;
   for(let tick=cycle*duration;tick<(cycle+1)*duration;tick+=24)f.poll(tick,Math.min(tick+120,(cycle+1)*duration));
   captures.push({calls:f.calls.slice(start).map(e=>({...e,tick:e.tick-cycle*duration,context:{...e.context,harmony:e.context.harmony?{...e.context.harmony,originTick:e.context.harmony.originTick-cycle*duration}:null}})),slots:f.slots.slice(slotStart).map(e=>({...e,tick:e.tick-cycle*duration}))});
  }
  for(const capture of captures.slice(1))assert.deepEqual(capture,captures[0]);assert.ok(captures[0].calls.length);assert.deepEqual(ps.flatMap(p=>p.__dgAuthoredNotes),before);assert.deepEqual(f.model.snapshot().connections,wires);
  assert.equal(f.containers.list().length,0);assert.ok(ps.every(p=>f.containers.isVisible(p.id)));assert.ok(!ps[0].__freePlayDrawGrid.path);
 }finally{f.dispose();}
});

test('lazy empty frame, full-grid trailing silence, historical geometry and ordinary chromatic edits',async()=>{
 const f=fixture();try{const c=f.create();assert.equal(f.toys.size,0);assert.equal(f.containers.durationOf(c.id),0);assert.equal(f.model.getTransportId(c.id),MAIN_TRANSPORT_ID);
  const source=short();await f.service.draw(c.id,source);const ps=f.service.panels(c.id);assert.equal(ps.length,1);assert.equal(f.containers.durationOf(c.id),384);assert.ok(!f.containers.isVisible(ps[0].id));
  const history=f.containers.get(c.id).interactionData;assert.deepEqual(history.gesture.path,source.path);assert.ok(!history.events&&!history.notes&&!history.durationTicks);
  const original=structuredClone(history),note=ps[0].__dgAuthoredNotes[0];note.sourceMidi=73;f.publish(ps[0]);assert.equal(f.service.line(c.id).source.events[0].midi,73);assert.deepEqual(f.containers.get(c.id).interactionData,original);
  f.poll(0,384);assert.ok(f.calls.every(e=>e.tick<source.durationTicks));assert.equal(new Set(f.calls.map(e=>e.tick)).size,f.calls.length);assert.equal(getPlaybackInstance(ps[0].id).sourcePhaseOriginTick,0);
  f.transport.currentTick=370;assert.equal(f.service.line(c.id).phase,1);f.containers.open(c.id);assert.ok(f.containers.isVisible(ps[0].id));
 }finally{f.dispose();}
});

test('independent containers share the Heartbeat phase and canonical silence commits happen while closed',async()=>{
 const f=fixture();try{const a=f.create(),b=f.create();await f.service.draw(a.id,short());await f.service.draw(b.id,short());
  const aNotes=f.service.panels(a.id)[0].__dgAuthoredNotes,bNotes=structuredClone(f.service.panels(b.id)[0].__dgAuthoredNotes);
  f.service.setSilence(a.id,{cuts:{[aNotes[0].id]:true},coveredIds:[aNotes[1].id],randomCutIds:[aNotes[0].id],randomSeed:7});
  assert.ok(aNotes[0].scissorMuted&&aNotes[1].paintCovered);assert.deepEqual(f.service.panels(b.id)[0].__dgAuthoredNotes,bNotes);assert.ok(f.cancelled.length);
  f.service.paintStore(a.id).set([{id:'a-ink',x:.5,y:.5,seed:1}]);assert.deepEqual(f.service.paintStore(b.id).get(),[]);
  f.poll(0,768);assert.ok(f.calls.every(e=>e.noteId!==aNotes[0].id&&e.noteId!==aNotes[1].id));for(const p of f.toys.values())assert.equal(getPlaybackInstance(p.id).sourcePhaseOriginTick,0);
  f.service.clear(a.id);assert.ok(f.containers.get(a.id));assert.equal(f.service.panels(a.id).length,0);assert.equal(f.service.panels(b.id).length,1);assert.equal(f.model.getTransportId(a.id),MAIN_TRANSPORT_ID);assert.deepEqual(f.service.data(a.id).surfacePaint,[]);
  await f.service.draw(a.id,maximum());assert.equal(f.service.panels(a.id).length,4);f.containers.remove(a.id);assert.equal(f.toys.size,1);assert.equal(f.containers.owner([...f.toys.keys()][0]),b.id);
 }finally{f.dispose();}
});

test('empty routed container passes through; attaching and clearing retain outer connection IDs and context',async()=>{
 const f=fixture();try{const c=f.create(['transpose']),extra=await f.createGrid(lineDrawGridStates(short(),'tail')[0],{x:4000,y:0});const edge=f.wire(c.id,extra.id);f.sync();
  f.poll(0,384);assert.ok(f.calls.length);assert.ok(f.calls.every(e=>e.context.transposeSemitones===7));const incoming=f.model.getParent(c.id).id;
  await f.service.draw(c.id,short());assert.equal(f.model.getParent(c.id).id,incoming);assert.equal(f.model.get(edge.id).from.objectId,f.service.panels(c.id)[0].id);
  f.service.clear(c.id);assert.equal(f.model.getParent(c.id).id,incoming);assert.equal(f.model.get(edge.id).from.objectId,c.id);assert.equal(f.containers.durationOf(c.id),0);
 }finally{f.dispose();}
});

test('JSON reload preserves owned IDs, original stroke, cuts, paint, uncoil and empty wrappers without duplication',async()=>{
 const f=fixture();try{const c=f.create();await f.service.draw(c.id,maximum());const p=f.service.panels(c.id)[0],id=p.__dgAuthoredNotes[0].id;
  f.service.setSilence(c.id,{cuts:{[id]:true},paint:[{id:'ink',x:.3,y:.4,seed:7,radius:.065,notes:[id]}],randomCutIds:[id],randomSeed:19});f.service.setStraightened(c.id,true);const empty=f.create();
  const saved=JSON.parse(JSON.stringify(f.containers.snapshot())),canonical=[...f.toys.values()].map(p=>structuredClone({notes:p.__dgAuthoredNotes,strokes:p.state.strokes})),connections=f.model.snapshot().connections;
  f.containers.restore([]);f.containers.prepareRestore(saved);for(const e of f.model.list())f.model.disconnect(e.id);for(const e of connections)assert.ok(f.model.connect(e.kind,e.from,e.to,{id:e.id}).ok);f.containers.restore(saved);assert.deepEqual(f.containers.snapshot(),saved);assert.equal(f.containers.get(empty.id).internalToyIds.length,0);assert.equal(f.model.getTransportId(empty.id),MAIN_TRANSPORT_ID);assert.equal(f.toys.size,4);
  assert.deepEqual([...f.toys.values()].map(p=>({notes:p.__dgAuthoredNotes,strokes:p.state.strokes})),canonical);assert.deepEqual(f.model.snapshot().connections,connections);assert.ok(f.service.line(c.id).source.events[0].scissorMuted);
 }finally{f.dispose();}
});

test('narrow legacy Free Play migration transfers history to ownership and never regroups expanded DrawGrids',async()=>{
 const f=fixture();try{const source=short(),states=lineDrawGridStates(source,'legacy'),p=await f.createGrid(states[0],{x:100,y:100});const noteIds=p.__dgAuthoredNotes.map(n=>n.id);f.wire(MAIN_TRANSPORT_ID,p.id,'output','transport');
  const result=f.service.migrateLegacy();assert.ok(result[0].ok);const c=f.containers.list()[0];assert.equal(c.presentation.type,'simple-draw');assert.deepEqual(c.internalToyIds,[p.id]);assert.deepEqual(p.__dgAuthoredNotes.map(n=>n.id),noteIds);assert.ok(!p.__freePlayDrawGrid.path);assert.deepEqual(f.service.line(c.id).source.path,source.path);
  f.containers.expand(c.id);assert.deepEqual(f.service.migrateLegacy(),[]);assert.ok(f.toys.has(p.id));
 }finally{f.dispose();}
});

for(const action of ['clear','delete'])test(`pending drawing ${action} removes detached grids without orphaning music`,async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);let count=0;
 const f=fixture({afterCreate:()=>++count===1?gate:Promise.resolve()});try{
  const c=f.create(),first=f.service.draw(c.id,maximum());
  assert.equal(f.service.isPending(c.id),true);
  const rejected=assert.rejects(first,/cancelled/);
  if(action==='clear')f.service.clear(c.id);
  if(action==='delete')f.containers.remove(c.id);
  release();await rejected;
  assert.equal(f.service.isPending(c.id),false);
  assert.equal(f.toys.size,0);
  assert.equal(f.model.getObjectIds().filter(id=>id.startsWith('grid')).length,f.toys.size);
  assert.equal(f.containers.list().length,action==='clear'?1:0);
 }finally{release();f.dispose();}
});

test('completed and pending Simple Draw reject replacement without clearing contents; explicit Clear allows drawing',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);let count=0;
 const f=fixture({afterCreate:()=>++count===1?gate:Promise.resolve()});try{
  const c=f.create(),first=f.service.draw(c.id,short());
  await assert.rejects(f.service.draw(c.id,maximum()),{code:'DRAWING_EXISTS'});
  release();await first;
  const snapshot=f.containers.snapshot(),notes=structuredClone([...f.toys.values()].map(p=>p.__dgAuthoredNotes));
  await assert.rejects(f.service.draw(c.id,maximum()),{code:'DRAWING_EXISTS'});
  assert.deepEqual(f.containers.snapshot(),snapshot);assert.deepEqual([...f.toys.values()].map(p=>p.__dgAuthoredNotes),notes);
  f.service.clear(c.id);assert.equal(f.service.line(c.id),null);await f.service.draw(c.id,maximum());
  assert.deepEqual(f.service.data(c.id).gesture.path,maximum().path);
 }finally{release();f.dispose();}
});

test('legacy group already collapsed by the foundation upgrades in place',async()=>{
 const f=fixture();try{
  const source=short(),p=await f.createGrid(lineDrawGridStates(source,'collapsed-legacy')[0],{x:100,y:100});f.wire(MAIN_TRANSPORT_ID,p.id,'output','transport');
  const old=f.containers.collapse([p.id]).container;
  assert.ok(f.service.migrateLegacy()[0].ok);assert.equal(f.containers.list().length,1);
  const c=f.containers.get(old.id);assert.equal(c.presentation.type,'simple-draw');assert.equal(c.bounds.width,1100);assert.deepEqual(c.interactionData.gesture.path,source.path);
 }finally{f.dispose();}
});

test('Clear and free-board redraw retain identity, routing and audio but replace geometry and owned notes',async()=>{
 const f=fixture();try{
  const c=f.create(),first=prepareBoardDrawing([{x:100,y:200},{x:450,y:350},{x:650,y:150}]);
  await f.service.drawPrepared(c.id,first);
  f.service.panels(c.id).forEach(p=>Object.assign(p.dataset,{toyVolume:'0.27',toyMuted:'1'}));
  f.containers.setPresentation(c.id,{state:{customSetting:'retained'}});f.service.setStraightened(c.id,true);
  const oldIds=f.containers.get(c.id).internalObjectIds,wire=f.model.getParent(c.id),identity=f.containers.get(c.id).boardObject.id;
  assert.ok(f.service.clear(c.id).ok);
  const empty=f.containers.get(c.id);assert.equal(empty.id,c.id);assert.equal(empty.boardObject.id,identity);
  assert.deepEqual(empty.bounds,{x:first.bounds.x,y:first.bounds.y,width:280,height:140});
  assert.deepEqual(empty.internalObjectIds,[]);assert.equal(f.service.line(c.id),null);
  assert.deepEqual(empty.presentation.state.audioSettings,{volume:.27,muted:true});assert.equal(empty.presentation.state.customSetting,'retained');
  assert.equal(empty.interactionData.gesture,null);assert.equal(empty.interactionData.contentSpace,undefined);assert.equal(empty.interactionData.straightened,false);
  assert.ok(oldIds.every(id=>!f.model.getObject(id)&&!f.toys.has(id)));assert.equal(f.model.getParent(c.id).id,wire.id);
  const saved=JSON.parse(JSON.stringify(f.containers.snapshot()));f.containers.restore(saved);
  assert.deepEqual(f.containers.get(c.id).presentation.state.audioSettings,{volume:.27,muted:true});assert.equal(f.service.line(c.id),null);
  const second=prepareBoardDrawing([{x:2200,y:1300},{x:2550,y:1100},{x:2500,y:1500},{x:2900,y:1380}]);
  await f.service.drawPrepared(c.id,second);
  const next=f.containers.get(c.id);assert.equal(next.id,c.id);assert.deepEqual(next.bounds,second.bounds);assert.deepEqual(f.service.data(c.id).contentSpace,second.contentSpace);
  assert.deepEqual(drawingAuthoredBounds(f.service.line(c.id).source.path,second.contentSpace,next.bounds),drawingAuthoredBounds(second.source.path,second.contentSpace,second.bounds));
  assert.ok(f.service.panels(c.id).every(p=>p.dataset.toyVolume==='0.27'&&p.dataset.toyMuted==='1'));
  assert.ok(next.internalObjectIds.every(id=>!oldIds.includes(id)));assert.equal(f.model.getParent(c.id).id,wire.id);
  const authored=JSON.parse(JSON.stringify(f.containers.snapshot()));f.containers.restore(authored);assert.ok(f.service.line(c.id));assert.deepEqual(f.containers.get(c.id).bounds,second.bounds);
  const owned=next.internalObjectIds;assert.ok(f.containers.remove(c.id).ok);assert.ok(owned.every(id=>!f.toys.has(id)&&!f.model.getObject(id)));
  const other=f.create();await f.service.drawPrepared(other.id,first);f.service.clear(other.id);assert.ok(f.containers.remove(other.id).ok);assert.equal(f.toys.size,0);
 }finally{f.dispose();}
});

test('Paint completion starts stopped transport and never calls Play again on a running clock',async()=>{
 const f=fixture();try{let plays=0;f.transport.play=async()=>{plays++;f.transport.state='playing';};const a=f.create();await f.service.draw(a.id,short());assert.equal(f.transport.state,'playing');assert.equal(plays,1);
 f.transport.currentTick=217;const graph=f.model.snapshot().connections,b=f.create();await f.service.draw(b.id,short());assert.equal(plays,1);assert.equal(f.transport.currentTick,217);assert.ok(graph.every(e=>f.model.snapshot().connections.some(n=>n.id===e.id)));
 }finally{f.dispose();}
});
