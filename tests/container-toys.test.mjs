import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createConnectionAdapter} from '../src/connection-adapter.js';
import {createContainerToyModel} from '../src/container-toys.js';
import {createContainerPresentations} from '../src/container-presentations.js';
import {createStructureToyModel} from '../src/structure-toys.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {clearPlaybackInstancesForTests,ensurePlaybackInstance,getPlaybackInstance} from '../src/playback-instances.js';
import {MAIN_TRANSPORT_ID} from '../src/transport-registry.js';
import {toyLoopLengthTicks} from '../src/drawgrid/dg-pattern-length.js';

function fixture(types=[]){
 clearPlaybackInstancesForTests();const model=createConnectionModel(),positions=new Map(),calls=[];
 const panels=['A','B','C'].map((id,i)=>{positions.set(id,{x:100+i*900,y:100+i*40,width:680,height:480});model.registerObject(id);ensurePlaybackInstance(id);return {id,dataset:{toy:'drawgrid',steps:'8'},__seqRev:0,__seqPattern:{},__sequencerSchedule(col,time,meta){if(col%2)return;calls.push({toy:id,col,tick:meta.eventTick,sourceMidi:60+i*12+col,context:meta.context,chord:meta.resolvedChord,occurrence:JSON.parse(meta.occurrenceId).slice(1)});}};});
 const getToy=id=>panels.find(p=>p.id===id),structures=createStructureToyModel(model,{getDuration:id=>toyLoopLengthTicks(getToy(id))});
 const containers=createContainerToyModel(model,{getRect:id=>positions.get(id)||(()=>{const s=structures.get(id);return s&&{x:s.x,y:s.y,width:224,height:128};})(),setPosition:(id,x,y)=>positions.set(id,{...positions.get(id),x,y}),getDuration:id=>toyLoopLengthTicks(getToy(id)),removeInternal:id=>{model.removeObject(id);positions.delete(id);const i=panels.findIndex(p=>p.id===id);if(i>=0)panels.splice(i,1);}});
 const p=(objectId,portId)=>({objectId,portId});let serial=1;
 const wire=(from,to,port='output',kind='sequence')=>{const r=model.connect(kind,p(from,port),p(to,'input'),{id:'wire'+serial++});assert.ok(r.ok,r.reason);return r.connection;};
 model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS,transportId:MAIN_TRANSPORT_ID});
 let previous=MAIN_TRANSPORT_ID,port='output',kind='transport';const wrappers=[];
 for(const type of types){const s=structures.createStandalone(type,{x:0,y:0});if(type==='transpose')structures.setSemitones(s.id,7);if(type==='repeat')structures.setCount(s.id,3);wire(previous,s.id,port,kind);previous=s.id;port='child:0';kind='sequence';wrappers.push(s);}
 wire(previous,'A',port,kind);wire('A','B');
 const adapter=createChainSequenceAdapter({getToy,chainState:new Map(),connectionModel:model}),scheduler=createSequencerScheduler();
 function sync(now=0){adapter.sync(panels,{currentTick:now,state:'stopped'},{connections:model.list('sequence'),structures:structures.list()});}
 function poll(from,to){const playbackTurns=adapter.turnsForLookahead(from,to,MAIN_TRANSPORT_ID);scheduler.tick({transportId:MAIN_TRANSPORT_ID,playbackTurns,getToy,currentTick:from,lookaheadEndTick:to,tickToAudioTime:t=>t});}
 sync();
 return {model,positions,panels,structures,containers,adapter,scheduler,calls,wire,p,wrappers,sync,poll,dispose(){scheduler.dispose();adapter.reset();structures.dispose();containers.dispose();clearPlaybackInstancesForTests();}};
}

for(const types of [[],['sequence'],['together'],['repeat'],['transpose'],['chord-progression'],['chord-progression','transpose','repeat','together']]){
 test(`collapse/Open/Expand preserve exact scheduling, occurrence context and duration under ${types.join('/')||'Heartbeat'}`,()=>{
  const captures=[];
  for(const contained of [false,true]){const f=fixture(types);try{
   if(types.includes('together')){const s=f.wrappers.find(s=>s.type==='together');f.panels.find(p=>p.id==='C').dataset.steps='32';f.wire(s.id,'C','child:1');f.sync();}
   const initialWires=f.model.snapshot().connections,root=types.length?f.wrappers[0].id:'A';
   const definition=f.adapter.runtime.getDefinition(types.length?f.wrappers[0].definitionId:'sequence:A'),duration=definition.durationTicks;
   let id=null,instance=null;
   for(let now=0;now<duration*4;now+=24){
    if(contained&&now===120){instance=f.adapter.runtime.getInstance(definition.id);const result=f.containers.collapse(['A','B']);assert.ok(result.ok,result.reason);id=result.container.id;assert.equal(f.containers.durationOf(id),768);assert.equal(f.model.getTransportId(id),MAIN_TRANSPORT_ID);assert.deepEqual(f.model.snapshot().connections,initialWires);f.sync(now);assert.strictEqual(f.adapter.runtime.getInstance(definition.id),instance);}
    if(contained&&now===240){f.containers.open(id);f.sync(now);assert.ok(f.containers.get(id).presentation.state.open);assert.deepEqual(f.model.snapshot().connections,initialWires);}
    if(contained&&now===480){assert.ok(f.containers.expand(id).ok);f.sync(now);assert.equal(f.containers.list().length,0);assert.deepEqual(f.model.snapshot().connections,initialWires);}
    f.poll(now,Math.min(now+120,duration*4));
   }
   assert.equal(f.adapter.runtime.getDefinition(definition.id).durationTicks,duration);assert.ok(f.calls.length);captures.push(f.calls);
  }finally{f.dispose();}}
  // Independent runtime IDs differ; authored occurrence paths and ticks must match.
  assert.deepEqual(captures[0],captures[1]);
 });
}

test('one IN/OUT projects outer wires and supports normal endpoint reconnection without changing internal IDs',()=>{
 const f=fixture();try{
  f.wire('B','C');const before=f.model.snapshot().connections,result=f.containers.collapse(['A','B']);assert.ok(result.ok);const id=result.container.id;
  assert.deepEqual(Object.keys(f.model.getObject(id).ports),['input','output']);assert.equal(f.model.getPort(f.p(id,'pattern')),null);
  assert.deepEqual(f.containers.connections().map(e=>[e.from.objectId,e.to.objectId]),[[MAIN_TRANSPORT_ID,id],[id,'C']]);
  assert.deepEqual(f.model.snapshot().connections,before);
  assert.deepEqual(f.model.socketDragIntent(f.p(id,'output')),{kind:'sequence',connectionId:before[2].id,end:'from'});
  assert.ok(f.model.beginDrag(f.p(id,'input')));assert.equal(f.model.getEditing().connectionId,before[0].id);f.model.cancelDrag();
  assert.equal(f.model.validate('sequence',f.p('C','output'),f.p(id,'input')).reason,'cycle');
  f.model.disconnect(before[2].id);assert.ok(f.model.connect('sequence',f.p(id,'output'),f.p('C','input'),{id:before[2].id}).ok);
  f.containers.open(id);assert.deepEqual(f.containers.connections(),f.model.snapshot().connections);f.containers.expand(id);assert.deepEqual(f.model.snapshot().connections,before);
 }finally{f.dispose();}
});

test('layout and presentation survive JSON save/reload; move and Expand preserve relative layout',()=>{
 const f=fixture();try{
  const initial=structuredClone([...f.positions]),{container:c}=f.containers.collapse(['A','B'],{presentationType:'simple-draw',interactionData:{tool:'scissors'},presentationState:{color:'blue'}});
  f.containers.move(c.id,c.bounds.x+300,c.bounds.y-40);f.containers.open(c.id);
  const saved=JSON.parse(JSON.stringify(f.containers.snapshot())),wires=f.model.snapshot().connections;
  f.containers.restore([]);f.containers.restore(saved);assert.deepEqual(f.containers.snapshot(),saved);assert.deepEqual(f.model.snapshot().connections,wires);
  assert.equal(f.containers.get(c.id).interactionData.tool,'scissors');assert.equal(f.containers.get(c.id).presentation.type,'simple-draw');
  assert.ok(f.containers.expand(c.id).ok);for(const [id,r]of initial.filter(([id])=>id!=='C'))assert.deepEqual(f.positions.get(id),{...r,x:r.x+300,y:r.y-40});
 }finally{f.dispose();}
});

test('fresh scene reload retains one copy of each internal toy, canonical wires and playback',()=>{
 let saved,expected;const original=fixture(['transpose']);
 try{original.containers.collapse(['A','B']);original.poll(0,1536);expected=original.calls;
  saved=JSON.parse(JSON.stringify({containers:original.containers.snapshot(),connections:original.model.snapshot().connections,positions:[...original.positions]}));
 }finally{original.dispose();}
 const loaded=fixture(['transpose']);try{
  for(const edge of loaded.model.list())loaded.model.disconnect(edge.id);
  for(const edge of saved.connections)assert.ok(loaded.model.connect(edge.kind,edge.from,edge.to,{id:edge.id}).ok);
  for(const [id,rect]of saved.positions)loaded.positions.set(id,rect);
  loaded.containers.restore(saved.containers);loaded.sync();loaded.poll(0,1536);
  assert.deepEqual(loaded.calls,expected);assert.equal(loaded.panels.length,3);assert.equal(loaded.containers.list().length,1);assert.deepEqual(loaded.model.snapshot().connections,saved.connections);
 }finally{loaded.dispose();}
});

test('internal modifiers remain internal and outer Together derives its max duration through the normal runtime',()=>{
 for(const internal of [false,true]){const f=fixture(['chord-progression','transpose','repeat']);try{
  const before=f.adapter.runtime.debugSnapshot();
  if(internal){const result=f.containers.collapse([...f.wrappers.map(s=>s.id),'A','B']);assert.ok(result.ok,result.reason);f.sync();assert.deepEqual(f.adapter.runtime.debugSnapshot(),before);}
  f.poll(0,1536);assert.ok(f.calls.every(e=>e.context.transposeSemitones===7&&e.context.harmony));
 }finally{f.dispose();}}
 const f=fixture(['together']);try{
  f.panels.find(p=>p.id==='C').dataset.steps='32';f.wire(f.wrappers[0].id,'C','child:1');f.sync();
  const result=f.containers.collapse(['A','B']);assert.ok(result.ok);assert.equal(f.containers.durationOf(result.container.id),768);
  assert.equal(f.adapter.runtime.getDefinition(f.wrappers[0].definitionId).durationTicks,1536);
  const board=f.containers.boardGraph;assert.ok(!board.getObjectIds().includes('A'));assert.equal(board.getParent(result.container.id).from.objectId,f.wrappers[0].id);
 }finally{f.dispose();}
});

test('delete removes owned objects/connections with no hidden orphans and leaves outside toys alone',()=>{
 const f=fixture();try{f.wire('B','C');const {container:c}=f.containers.collapse(['A','B']);assert.ok(f.containers.remove(c.id).ok);
  assert.equal(f.containers.owner('A'),null);for(const id of ['A','B',c.id])assert.equal(f.model.getObject(id),null);assert.ok(f.model.getObject('C'));assert.equal(f.model.list().length,0);assert.deepEqual(f.panels.map(p=>p.id),['C']);
 }finally{f.dispose();}
});

test('unsupported selections and invalid saves fail before changing graph or ownership',()=>{
 const f=fixture();try{
  const original=f.model.snapshot();for(const ids of [[],['missing'],['A','C'],[MAIN_TRANSPORT_ID,'A']])assert.equal(f.containers.collapse(ids).ok,false);
  assert.deepEqual(f.model.snapshot(),original);const {container:c}=f.containers.collapse(['A','B']);
  assert.equal(f.containers.collapse([c.id,'C']).ok,false);assert.equal(f.containers.collapse(['A','B']).ok,false);
  assert.equal(f.model.connect('sequence',f.p('A','output'),f.p('C','input')).ok,false);
  const internal=f.model.list('sequence').find(e=>e.from.objectId==='A');assert.equal(f.model.disconnect(internal.id),false);assert.equal(f.model.beginDrag(f.p('A','output'),{connectionId:internal.id,end:'from'}),false);
  const snapshot=f.containers.snapshot();assert.throws(()=>f.containers.restore([{...snapshot[0],ports:{input:f.p('B','input'),output:f.p('A','output')}}]));assert.deepEqual(f.containers.snapshot(),snapshot);
  assert.throws(()=>f.containers.restore([...snapshot,{...snapshot[0],id:'duplicate-owner'}]));assert.deepEqual(f.containers.snapshot(),snapshot);
  assert.throws(()=>f.containers.restore([{...snapshot[0],internalObjectIds:[c.id]}]));assert.deepEqual(f.containers.snapshot(),snapshot);
 }finally{f.dispose();}
});

test('branching selections, cross-boundary inputs/outputs, cycles, linked internals and unsafe deletion are rejected',()=>{
 const f=fixture(['together']);try{
  const root=f.wrappers[0];f.wire(root.id,'C','child:1');const before=f.model.snapshot();assert.equal(f.containers.collapse([root.id,'A','B','C']).ok,false);assert.equal(f.containers.collapse(['A','C']).ok,false);assert.deepEqual(f.model.snapshot(),before);
  f.containers.configure({canContain:id=>id!=='B'});assert.equal(f.containers.collapse(['A','B']).ok,false);
  f.containers.configure({canContain:()=>true});const {container:c}=f.containers.collapse(['A','B']);f.containers.configure({canDelete:()=>false});assert.equal(f.containers.remove(c.id).ok,false);assert.ok(f.containers.get(c.id));assert.deepEqual(f.model.snapshot(),before);
 }finally{f.dispose();}
});

test('duration comes from canonical internal Structure semantics, never wrapper presentation',()=>{
 for(const type of ['sequence','together','repeat','transpose']){const f=fixture([type]);try{
  const s=f.wrappers[0],result=f.containers.collapse([s.id,'A','B']);assert.ok(result.ok,result.reason);
  assert.equal(f.containers.durationOf(result.container.id),type==='repeat'?2304:768);
  f.containers.setPresentation(result.container.id,{state:{durationTicks:1}});assert.equal(f.containers.durationOf(result.container.id),type==='repeat'?2304:768);
 }finally{f.dispose();}}
});

test('presentation adapters edit only canonical owned toys and store no second musical pattern',()=>{
 const f=fixture();try{
  const {container:c}=f.containers.collapse(['A','B'],{presentationType:'future-simple'}),edits=[];
  const presentations=createContainerPresentations({containers:f.containers,readInternal:id=>f.panels.find(p=>p.id===id),applyInternalEdit:(id,edit)=>edits.push({id,edit})});
  presentations.register('future-simple',{renderSurface:(host,ctx)=>{host.value=ctx.readInternal('A').id;},handleInteraction:event=>event,mapInteractionToInternalEdit:intent=>[{objectId:intent.target,edit:{sourceMidi:61}}]});
  const host={};presentations.renderSurface(c.id,host);assert.equal(host.value,'A');presentations.handleInteraction(c.id,{target:'B'});assert.deepEqual(edits,[{id:'B',edit:{sourceMidi:61}}]);
  assert.throws(()=>presentations.handleInteraction(c.id,{target:'C'}));assert.equal(edits.length,1);assert.ok(!('notes' in f.containers.get(c.id)));assert.ok(!('pattern' in f.containers.get(c.id)));
 }finally{f.dispose();}
});
