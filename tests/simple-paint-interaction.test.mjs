import test from 'node:test';
import assert from 'node:assert/strict';
import {createScissorsStroke} from '../src/free-play-scissors.js';
import {createLineSource} from '../src/free-play-line.js';
import {createSimpleDrawController} from '../src/simple-draw.js';
import {drawgridPatternFromState} from '../src/drawgrid/dg-authored-notes.js';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createConnectionAdapter} from '../src/connection-adapter.js';
import {createContainerToyModel} from '../src/container-toys.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {ensurePlaybackInstance,clearPlaybackInstancesForTests} from '../src/playback-instances.js';
import {MAIN_TRANSPORT_ID} from '../src/transport-registry.js';

const path=[{lineId:'a',segments:[[{x:0,y:100,progress:0},{x:400,y:100,progress:1}]]}];
const notes=()=>[{lineId:'a',id:'left',x:0,y:100,progress:0},{lineId:'a',id:'right',x:400,y:100,progress:1}];
function swipe(x,{nodes=notes(),points=[{x,y:30},{x,y:170}],paths=path}={}){
 const stroke=createScissorsStroke(points[0]),direct=[];for(const p of points.slice(1))direct.push(...stroke.add(p,nodes,paths));return {direct,fallback:stroke.finish(nodes,paths)};
}
test('scissors crossing sparse string chooses one nearest note by path distance',()=>{
 const result=swipe(170);assert.deepEqual(result.direct.map(n=>n.id),['left']);assert.deepEqual(result.fallback,[]);
 assert.deepEqual(swipe(250).direct.map(n=>n.id),['right']);
});
test('direct note hits take precedence at their crossing',()=>{const result=swipe(10);assert.deepEqual(result.direct.map(n=>n.id),['left']);assert.deepEqual(result.fallback,[]);});
test('fast and slow missed crossings choose the same fallback, only once',()=>{
 const slow=swipe(170,{points:Array.from({length:71},(_,i)=>({x:170,y:30+2*i}))});assert.deepEqual(slow,swipe(170));assert.equal(slow.direct.length,1);
});
test('already-cut nearest neighbor yields the other valid adjacent note',()=>{const ns=notes();ns[0].scissorMuted=true;assert.deepEqual(swipe(170,{nodes:ns}).direct.map(n=>n.id),['right']);ns[1].scissorMuted=true;assert.deepEqual(swipe(170,{nodes:ns}).direct,[]);});
test('distant near misses, empty tails and parallel drags never cause fallback',()=>{
 assert.equal(swipe(170,{points:[{x:170,y:30},{x:170,y:100},{x:170,y:30}]}).direct.length,1);
 assert.deepEqual(swipe(450).direct,[]);assert.deepEqual(swipe(170,{points:[{x:170,y:30},{x:170,y:80}]}).direct,[]);
 assert.deepEqual(swipe(170,{points:[{x:100,y:100},{x:300,y:100}]}).direct,[]);
 assert.deepEqual(swipe(170,{points:[{x:170,y:99},{x:170,y:101}]}).direct.map(n=>n.id),['left']);
 assert.deepEqual(swipe(350,{nodes:[{...notes()[0],progress:.1,x:40},{...notes()[1],progress:.5,x:200}]}).direct,[]);
});
test('fallback uses path order rather than Euclidean proximity at folded sections',()=>{
 const paths=[{lineId:'a',segments:[[{x:0,y:100,progress:0},{x:300,y:100,progress:.6},{x:300,y:140,progress:.7},{x:0,y:140,progress:1}]]}];
 const ns=[{...notes()[0],x:0,progress:0},{...notes()[1],x:300,progress:.6},{lineId:'a',id:'fold',x:170,y:140,progress:.83}];
 const result=swipe(170,{nodes:ns,paths,points:[{x:170,y:70},{x:170,y:105}]});assert.deepEqual(result.direct.map(n=>n.id),['right']);
});
test('cut string gaps do not create invisible fallback intersections',()=>{
 const paths=[{lineId:'a',segments:[[{x:0,y:100,progress:0},{x:150,y:100,progress:.375}],[{x:250,y:100,progress:.625},{x:400,y:100,progress:1}]]}];assert.deepEqual(swipe(200,{paths}).direct,[]);
});
test('revisiting the same missed crossing cannot cut both neighbors',()=>{assert.equal(swipe(170,{points:[{x:170,y:30},{x:170,y:170},{x:170,y:30}]}).direct.length,1);});

function controllerFixture(){
 const model=createConnectionModel(),panels=new Map(),positions=new Map();let serial=0,gate=null;
 const containers=createContainerToyModel(model,{getRect:id=>positions.get(id),setPosition:(id,x,y)=>Object.assign(positions.get(id),{x,y}),removeInternal:id=>{model.removeObject(id);panels.delete(id);positions.delete(id);}});
 const controller=createSimpleDrawController({containers,model,getToy:id=>panels.get(id),createGrid:async(state,position)=>{
  if(gate)await gate;const id='grid-'+ ++serial;model.registerObject(id);positions.set(id,{...position,width:680,height:480});
  const panel={id,dataset:{toy:'drawgrid',instrument:'PIANO',steps:'8'},__freePlayDrawGrid:state.freePlay,__dgAuthoredNotes:state.authoredNotes,__seqPattern:drawgridPatternFromState(state)};panels.set(id,panel);return panel;
 },removeGrid:p=>{model.removeObject(p.id);panels.delete(p.id);},publish(){},cancelScheduled(){},getTransport:()=>null});
 return {controller,containers,model,panels,positions,block(promise){gate=promise;}};
}
const source=()=>createLineSource([{x:.1,y:.5},{x:.9,y:.5}]);
test('one-line ownership rejects replacement; Clear allows one fresh line without changing source semantics',async()=>{
 const f=controllerFixture(),c=f.controller.create();try{
 await f.controller.draw(c.id,source());const before=f.containers.get(c.id),canonical=structuredClone([...f.panels.values()].map(p=>p.__dgAuthoredNotes));
 let error;try{await f.controller.draw(c.id,source())}catch(e){error=e}assert.equal(error?.code,'DRAWING_EXISTS');assert.deepEqual(f.containers.get(c.id),before);assert.deepEqual([...f.panels.values()].map(p=>p.__dgAuthoredNotes),canonical);
 assert.ok(f.controller.clear(c.id).ok);assert.equal(f.controller.line(c.id),null);assert.equal(f.panels.size,0);await f.controller.draw(c.id,source());assert.ok(f.controller.line(c.id));assert.equal(f.containers.get(c.id).internalObjectIds.length,1);
 }finally{f.containers.dispose();}
});
test('pending creation also blocks a second stroke and Clear cancels pending ownership',async()=>{
 const f=controllerFixture(),c=f.controller.create();let release;f.block(new Promise(r=>release=r));const first=f.controller.draw(c.id,source());
 let error;try{await f.controller.draw(c.id,source())}catch(e){error=e}assert.equal(error?.code,'DRAWING_EXISTS');f.controller.clear(c.id);release();try{await first}catch(e){assert.equal(e.code,'DRAWING_CANCELLED')}assert.equal(f.panels.size,0);assert.equal(f.containers.get(c.id).internalObjectIds.length,0);f.containers.dispose();
});
test('moving the container preserves line geometry and moves all owned grids by the same displacement',async()=>{
 const f=controllerFixture(),c=f.controller.create({x:100,y:200});try{await f.controller.draw(c.id,source());const before=structuredClone(f.controller.line(c.id).source),positions=structuredClone([...f.positions]);f.containers.move(c.id,450,100);assert.deepEqual(f.controller.line(c.id).source,before);for(const [id,p]of positions){assert.equal(f.positions.get(id).x,p.x+350);assert.equal(f.positions.get(id).y,p.y-100)}}finally{f.containers.dispose()}
});

// The actual graph adapter, structure runtime and note scheduler, not a toy clock.
function playbackFixture({wrapped=true,connected=true}={}){
 clearPlaybackInstancesForTests();const model=createConnectionModel(),calls=[],cancelled=[];
 const panels=['paint-a','paint-b'].map(id=>{model.registerObject(id);ensurePlaybackInstance(id);return {id,dataset:{toy:'drawgrid',steps:'8'},__seqRev:0,__sequencerSchedule(col,time,meta){calls.push({id,col,tick:meta.eventTick})}}});
 model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS,transportId:MAIN_TRANSPORT_ID});model.connect('sequence',{objectId:'paint-a',portId:'output'},{objectId:'paint-b',portId:'input'});
 const containers=createContainerToyModel(model),wrapper=wrapped?containers.collapse(panels.map(p=>p.id),{presentationType:'simple-draw'}).container:null,root=wrapper?.id||'paint-a';
 const getToy=id=>panels.find(p=>p.id===id),adapter=createChainSequenceAdapter({getToy,chainState:new Map(),connectionModel:model,cancelToy:id=>cancelled.push(id)}),scheduler=createSequencerScheduler();
 const connection=createConnectionAdapter(model,{onDetach:id=>{cancelled.push(id);scheduler.clearToy(id)}});connection.sync(panels,{autoRoot:false,importLegacy:false});
 const sync=(tick=0,state='playing')=>adapter.sync(panels,{currentTick:tick,state},{connections:model.list('sequence')});
 const connect=()=>{const r=model.connect('transport',{objectId:MAIN_TRANSPORT_ID,portId:'output'},{objectId:root,portId:'input'});assert.ok(r.ok);return r.connection.id};
 if(connected)connect();sync();
 return {model,containers,wrapper,adapter,calls,cancelled,sync,connect,disconnect(){const parent=model.getParent(root);assert.ok(parent);model.disconnect(parent.id);},poll(tick,end){scheduler.tick({transportId:MAIN_TRANSPORT_ID,playbackTurns:adapter.turnsForLookahead(tick,end,MAIN_TRANSPORT_ID),getToy,currentTick:tick,lookaheadEndTick:end,tickToAudioTime:t=>t})},snapshot:()=>({connections:model.snapshot().connections,containers:containers.snapshot()}),connection,panels,dispose(){connection.dispose();scheduler.dispose();adapter.reset();containers.dispose();clearPlaybackInstancesForTests();}};
}
test('disconnect while playing stops future scheduling and reconnect uses ordinary Heartbeat phase without catch-up',()=>{
 const captures=[];for(const wrapped of [false,true]){const f=playbackFixture({wrapped});try{
 f.poll(0,240);assert.ok(f.calls.length);f.disconnect();f.sync(240);const count=f.calls.length;f.poll(240,800);assert.equal(f.calls.length,count);assert.ok(f.cancelled.length);assert.equal(f.model.getTransportId('paint-a'),null);f.connection.discoverOwnership();assert.equal(f.model.getParent('paint-a'),null);
 f.connect();f.sync(800);f.poll(800,1600);const resumed=f.calls.slice(count);assert.ok(resumed.length);assert.ok(resumed.every(e=>e.tick>=800));assert.ok(resumed.every(e=>e.tick%48===0));assert.equal(new Set(resumed.map(e=>e.id+':'+e.tick)).size,resumed.length);captures.push(resumed);
 }finally{f.dispose()}}assert.deepEqual(captures[0],captures[1]);
});
test('repeated playing reconnects remain on the ordinary root timeline without historical bursts',()=>{
 const f=playbackFixture();try{for(const tick of [120,410,850,1450]){f.disconnect();f.sync(tick);const count=f.calls.length;f.poll(tick,tick+96);assert.equal(f.calls.length,count);f.connect();f.sync(tick+96);f.poll(tick+96,tick+400);const emitted=f.calls.slice(count);assert.ok(emitted.every(e=>e.tick>=tick+96&&e.tick%48===0));}}finally{f.dispose()}
});
test('disconnect paused, Return to Start, and reconnect obey the same root/phase rules as an ordinary chain',()=>{
 const captures=[];for(const wrapped of [false,true]){const f=playbackFixture({wrapped});try{f.poll(0,384);f.disconnect();f.sync(384,'paused');assert.equal(f.model.getTransportId('paint-a'),null);f.adapter.seekTransport(MAIN_TRANSPORT_ID,{currentTick:0,state:'stopped'});f.connect();f.sync(0,'stopped');const before=f.calls.length;f.poll(0,768);captures.push(f.calls.slice(before));assert.ok(f.calls.slice(before).some(e=>e.tick===0));}finally{f.dispose()}}assert.deepEqual(captures[0],captures[1]);
});
test('save/reload while disconnected preserves the missing wire and schedules no events',()=>{
 const f=playbackFixture();let saved;try{f.disconnect();f.sync(100);saved=JSON.parse(JSON.stringify(f.snapshot()))}finally{f.dispose()}
 const loaded=playbackFixture({connected:false});try{loaded.connection.restore(saved.connections,loaded.panels);loaded.containers.restore(saved.containers);loaded.sync(500);loaded.poll(500,1500);loaded.connection.discoverOwnership();assert.equal(loaded.model.getTransportId('paint-a'),null);assert.deepEqual(loaded.calls,[]);assert.deepEqual(loaded.model.snapshot().connections,saved.connections);}finally{loaded.dispose()}
});
