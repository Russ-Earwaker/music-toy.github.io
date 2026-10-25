import {createStringSurfaces} from '../src/string-surface.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createContainerToyModel} from '../src/container-toys.js';
import {createSimpleBouncerController,bouncerGridState} from '../src/simple-bouncer.js';
import {simulateThrow,trajectoryPoint,boardLaunch} from '../src/simple-bouncer-physics.js';
import {createBoardPhysicalObjects} from '../src/board-physical-objects.js';
import {normalizeAuthoredState,restoreAuthoredNotes,drawgridPatternFromState} from '../src/drawgrid/dg-authored-notes.js';
import {toyLoopLengthTicks} from '../src/drawgrid/dg-pattern-length.js';
import {createStructureToyModel} from '../src/structure-toys.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {MAIN_TRANSPORT_ID} from '../src/transport-registry.js';
import {ensurePlaybackInstance,clearPlaybackInstancesForTests,getPlaybackInstance} from '../src/playback-instances.js';
import {SAFE_LINE_MIDI} from '../src/free-play-line.js';

function fixture({afterCreate=async()=>{},extraReceivers=()=>[],onReceiverTrigger=()=>{}}={}){
 clearPlaybackInstancesForTests();const model=createConnectionModel(),toys=new Map(),positions=new Map(),calls=[],commits=[];let serial=0,sync=()=>{};
 const objects=createBoardPhysicalObjects();
 const transport={state:'stopped',currentTick:0,bpm:120,async play(){this.state='playing';}};
 model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS,transportId:MAIN_TRANSPORT_ID});
 const containers=createContainerToyModel(model,{getRect:id=>positions.get(id),getDuration:id=>toyLoopLengthTicks(toys.get(id)),setPosition:(id,x,y)=>positions.set(id,{...positions.get(id),x,y}),onBoundsCommit:id=>commits.push(id),removeInternal:id=>{model.removeObject(id);toys.delete(id);positions.delete(id);}});
 async function applyGrid(p,state){p.state=normalizeAuthoredState(state);p.dataset.steps=String(state.steps);p.dataset.instrument=state.instrument;restoreAuthoredNotes(p,p.state);p.__seqPattern=drawgridPatternFromState(p.state);p.__seqRev++;ensurePlaybackInstance(p.id,{loopLengthTicks:toyLoopLengthTicks(p)});}
 async function createGrid(state,pos){const p={id:`grid${++serial}`,dataset:{toy:'drawgrid'},__seqRev:0,__sequencerSchedule(col,time,meta){for(const note of (this.__sequencerPatternAtTick?.(meta.eventTick,meta)||this.__seqPatternActive||this.__seqPattern).cols[col]?.notes||[])calls.push({id:this.id,tick:meta.eventTick,col,midi:note.sourceMidi,instrument:note.instrument||this.dataset.instrument,context:meta.context});}};await applyGrid(p,state);toys.set(p.id,p);positions.set(p.id,{...pos,width:800,height:760});model.registerObject(p.id);await afterCreate(p);return p;}
 const service=createSimpleBouncerController({containers,objects,getCollisionObjects:()=>[...objects.list('cube'),...extraReceivers()],onReceiverTrigger,model,getToy:id=>toys.get(id),createGrid,applyGrid,removeGrid:p=>{model.removeObject(p.id);toys.delete(p.id);},cancelScheduled:(p,tick)=>scheduler.resetToyTimeline(p.id,tick,{includeBoundary:false}),publish:()=>sync(),getTransport:id=>model.getTransportId(id)?transport:null,onChanged:()=>sync()});
 const structures=createStructureToyModel(model,{getDuration:id=>toyLoopLengthTicks(toys.get(id))}),adapter=createChainSequenceAdapter({getToy:id=>toys.get(id),chainState:new Map(),connectionModel:model}),scheduler=createSequencerScheduler();
 sync=()=>adapter.sync([...toys.values()],{currentTick:transport.currentTick,state:'stopped'},{connections:model.list('sequence'),structures:structures.list()});
 const wire=(from,to,port='output',kind='sequence')=>{const r=model.connect(kind,{objectId:from,portId:port},{objectId:to,portId:'input'});assert.ok(r.ok,r.reason);return r.connection;};
 const create=(types=[],options={})=>{const c=service.create({x:0,y:0,...options});let parent=MAIN_TRANSPORT_ID,port='output',kind='transport';for(const type of types){const s=structures.createStandalone(type);if(type==='transpose')structures.setSemitones(s.id,7);if(type==='repeat')structures.setCount(s.id,2);wire(parent,s.id,port,kind);parent=s.id;port='child:0';kind='sequence';}wire(parent,c.id,port,kind);sync();return c;};
 const poll=(from,to)=>{transport.currentTick=from;scheduler.tick({transportId:MAIN_TRANSPORT_ID,playbackTurns:adapter.turnsForLookahead(from,to),getToy:id=>toys.get(id),currentTick:from,lookaheadEndTick:to,tickToAudioTime:t=>t});};
 const capture=async(id,launch={x:0,y:0,vx:420,vy:0})=>{if(!objects.list("cube").length)objects.addCube(300,0);const ball=objects.addBall(launch.x,launch.y);await service.throwBall(id,{ballId:ball.id,launch});return ball;};
 return {objects,capture,model,toys,containers,service,transport,positions,calls,commits,create,wire,poll,sync,structures,createGrid,scheduler,dispose(){service.destroy();scheduler.dispose();adapter.reset();structures.dispose();containers.dispose();clearPlaybackInstancesForTests();}};
}
test('physical objects exist without a musical container, retain IDs on restore, and preserve note/colour assignments',()=>{
 const objects=createBoardPhysicalObjects(),cube=objects.addCube(-200,50),ball=objects.addBall(1000,300);
 assert.equal(objects.list().length,2);assert.ok(SAFE_LINE_MIDI.includes(cube.sourceMidi));assert.ok(cube.color);assert.equal(cube.width,58);assert.equal(ball.motion.vx,0);
 const snapshot=JSON.parse(JSON.stringify(objects.snapshot()));objects.restore(snapshot);objects.restore(snapshot);assert.deepEqual(objects.snapshot(),snapshot);assert.equal(objects.list().length,2);assert.ok(!snapshot.some(o=>'ownerId' in o));
 const other=objects.addCube(100,200);assert.notEqual(other.id,cube.id);objects.update(cube.id,{instrument:'piano',sourceMidi:72});assert.equal(objects.get(cube.id).sourceMidi,72);assert.equal(objects.get(cube.id).color,cube.color);assert.equal(objects.get(cube.id).instrument,undefined);
});
test('free-flight has no implicit walls, clamping, deletion or container-area input',()=>{
 const launch={x:-1000,y:800,vx:420,vy:-100},capture=simulateThrow({cubes:[],launch,bars:4,bpm:120});
 assert.equal(capture.durationTicks,1536);assert.equal(capture.collisions.length,0);const last=capture.trajectory.at(-1);assert.ok(Math.abs(last.x-(launch.x+420*8))<1e-5);assert.ok(Math.abs(last.y)<1e-5);assert.deepEqual(trajectoryPoint(capture.trajectory,0),trajectoryPoint(capture.trajectory,1536));
 assert.deepEqual(boardLaunch({x:100,y:50},{x:200,y:50}),{x:100,y:50,vx:840,vy:0});
});
test('new objects after reload never reuse the ID of a deleted referenced cube',()=>{
 const original=createBoardPhysicalObjects(),deleted=original.addCube(0,0);original.remove(deleted.id);const reloaded=createBoardPhysicalObjects();reloaded.restore(original.snapshot());assert.notEqual(reloaded.addCube(0,0).id,deleted.id);
});
test('cube collisions use board coordinates outside UI bounds, preserve cube identity, and quantize in tick order',()=>{
 const objects=createBoardPhysicalObjects(),a=objects.addCube(700,0),b=objects.addCube(-100,0),launch={x:0,y:0,vx:420,vy:0};
 const capture=simulateThrow({cubes:objects.list('cube'),launch,bars:4,bpm:120});assert.ok(capture.collisions.some(e=>e.cubeId===a.id));assert.ok(capture.collisions.some(e=>e.cubeId===b.id));assert.deepEqual(capture,simulateThrow({cubes:objects.list('cube'),launch,bars:4,bpm:120}));
 for(const [i,event]of capture.collisions.entries()){assert.equal(event.tick%48,0);if(i)assert.ok(event.tick>=capture.collisions[i-1].tick);const cube=objects.get(event.cubeId);assert.equal(event.sourceMidi,cube.sourceMidi);assert.equal(event.instrument,cube.instrument);}
});
for(const bars of [1,2,3,4])for(const types of [[],['repeat'],['chord-progression','transpose']])test(`${bars} bars under ${types.join('/')||'Heartbeat'}: normal capture/Open/Expand retain every attack and context`,async()=>{
 const f=fixture();try{const c=f.create(types);f.service.setBars(c.id,bars);await f.capture(c.id);const p=f.service.panels(c.id)[0],duration=bars*384;assert.equal(toyLoopLengthTicks(p),duration);assert.ok(p.__dgAuthoredNotes.length);assert.equal(f.containers.owner(f.objects.list('cube')[0].id),null);
 const notes=structuredClone(p.__dgAuthoredNotes),wires=structuredClone(f.model.snapshot().connections),objects=f.objects.snapshot(),runs=[];
 for(let cycle=0;cycle<3;cycle++){if(cycle===1)f.containers.open(c.id);if(cycle===2)f.containers.expand(c.id);f.sync();const start=f.calls.length;for(let tick=cycle*duration;tick<(cycle+1)*duration;tick+=24)f.poll(tick,Math.min(tick+120,(cycle+1)*duration));runs.push(f.calls.slice(start).map(e=>({tick:e.tick-cycle*duration,col:e.col,midi:e.midi,instrument:e.instrument,transpose:e.context.transposeSemitones,harmony:!!e.context.harmony})));}
 assert.ok(runs[0].length);assert.deepEqual(runs[1],runs[0]);assert.deepEqual(runs[2],runs[0]);assert.deepEqual(p.__dgAuthoredNotes,notes);assert.deepEqual(f.model.snapshot().connections,wires);assert.deepEqual(f.objects.list('cube'),objects.filter(o=>o.kind==='cube'));assert.deepEqual(f.objects.list('ball').map(b=>[b.id,b.x,b.y]),objects.filter(o=>o.kind==='ball').map(b=>[b.id,b.x,b.y]));
 }finally{f.dispose();}
});
test('two captures reference the same cube without ownership; every kind of shared cube edit marks both stale without changing notes',async()=>{
 const f=fixture();try{const cube=f.objects.addCube(300,0),a=f.create(),b=f.create();await f.capture(a.id);f.transport.currentTick=384;await f.capture(b.id);const before=[a,b].map(c=>structuredClone(f.service.panels(c.id)[0].__dgAuthoredNotes));
 for(const c of [a,b])assert.deepEqual(f.service.data(c.id).cubeIds,[cube.id]);
 for(const change of [{x:320},{y:20},{sourceMidi:72},{instrument:'piano'}]){f.objects.update(cube.id,change);for(const [i,c]of [a,b].entries()){assert.equal(f.service.data(c.id).stale,true);assert.deepEqual(f.service.panels(c.id)[0].__dgAuthoredNotes,before[i]);}}
 f.objects.remove(cube.id);for(const c of [a,b]){assert.deepEqual(f.service.data(c.id).brokenReferences,[cube.id]);assert.ok(f.containers.get(c.id));}
 assert.equal(f.model.getObject(cube.id),null);
 }finally{f.dispose();}
});
test('moving chrome translates launch handles while shared cubes stay independent; Clear keeps physical objects',async()=>{
 const f=fixture();try{const c=f.create();await f.capture(c.id);const cube=f.objects.list('cube')[0],ball=f.objects.list('ball')[0],bounds=f.containers.get(c.id).bounds,launch=structuredClone(f.service.data(c.id).launch);
 f.objects.update(cube.id,{x:9000,y:-4000});assert.deepEqual(f.containers.get(c.id).bounds,bounds);assert.equal(f.commits.length,0);
 f.containers.move(c.id,800,1200);assert.equal(f.objects.get(cube.id).x,9000);assert.deepEqual({x:f.service.cannon(c.id).x,y:f.service.cannon(c.id).y},{x:800,y:1200});
 f.service.clear(c.id);assert.ok(f.containers.get(c.id));assert.equal(f.toys.size,0);assert.equal(f.objects.list().length,2);assert.equal(f.objects.get(ball.id).captureId,null);assert.equal(f.service.data(c.id).capture,null);
 }finally{f.dispose();}
});
test('physical positions, assignments, balls, references, stale state and trajectory round trip independently',async()=>{
 const f=fixture();try{const c=f.create();f.service.setBars(c.id,4);await f.capture(c.id);f.objects.addBall(3000,1000);f.objects.update(f.objects.list('cube')[0].id,{x:500});const saved=JSON.parse(JSON.stringify({containers:f.containers.snapshot(),physicalObjects:f.objects.snapshot(),notes:f.service.panels(c.id)[0].__dgAuthoredNotes}));
 f.objects.restore(saved.physicalObjects);f.containers.restore(saved.containers);assert.deepEqual(f.objects.authoredSnapshot(),saved.physicalObjects.map(({motion,captureId,captureToyId,instrument,...o})=>o));assert.ok(f.objects.list('ball').every(b=>b.motion.vx===0&&b.motion.vy===0));assert.deepEqual(f.containers.snapshot(),saved.containers);assert.deepEqual(f.service.panels(c.id)[0].__dgAuthoredNotes,saved.notes);assert.equal(f.objects.list('ball').length,2);
 const edge=f.model.getParent(f.service.panels(c.id)[0].id);f.model.disconnect(edge.id);f.sync();assert.equal(f.model.getTransportId(c.id),null);f.wire(MAIN_TRANSPORT_ID,c.id,'output','transport');f.sync();assert.equal(f.model.getTransportId(c.id),MAIN_TRANSPORT_ID);
 }finally{f.dispose();}
});
test('Clear cancels pending capture without removing reusable physical objects or leaking grids',async()=>{
 let finish;const barrier=new Promise(r=>{finish=r;}),f=fixture({afterCreate:()=>barrier});
 try{const c=f.create(),attempt=f.capture(c.id);assert.equal(f.service.busy(),true);f.service.clear(c.id);finish();await attempt;assert.equal(f.toys.size,0);assert.equal(f.objects.list().length,2);assert.equal(f.service.data(c.id).capture,null);}finally{finish();f.dispose();}
});
test('pause and loop restart sample recorded world-space trajectory; deleting one ball preserves other balls and captured music',async()=>{
 const f=fixture();try{const c=f.create(),ball=await f.capture(c.id),other=f.objects.addBall(-1000,3000);f.transport.currentTick=96;f.transport.state='paused';const position=f.service.ballView(f.objects.get(ball.id)).position;assert.deepEqual(f.service.ballView(f.objects.get(ball.id)).position,position);
 f.transport.currentTick=0;const start=f.service.view(c.id).ball;f.transport.currentTick=384;assert.deepEqual(f.service.view(c.id).ball,start);f.objects.remove(ball.id);assert.ok(f.objects.get(other.id));assert.ok(f.service.panels(c.id)[0].__dgAuthoredNotes.length);assert.ok(f.service.data(c.id).brokenReferences.includes(ball.id));
 }finally{f.dispose();}
});
test('legacy private playground migrates to world objects once without changing canonical music',async()=>{
 const f=fixture();try{const c=f.create();await f.capture(c.id);const p=f.service.panels(c.id)[0],before=structuredClone(p.__dgAuthoredNotes),history=f.service.data(c.id).capture;
 f.containers.setPresentation(c.id,{interactionData:{version:1,bars:1,cubes:[{id:'old',x:300,y:0,sourceMidi:60,instrument:'piano'}],capture:history,stale:false}});f.service.migrateLegacy();const count=f.objects.list().length;f.service.migrateLegacy();assert.equal(f.objects.list().length,count);assert.equal(f.service.data(c.id).version,3);assert.deepEqual(p.__dgAuthoredNotes,before);
 }finally{f.dispose();}
});
test('a throw during playback authors a phase offset, preserving the clock while launching from its recorded start',async()=>{
 const f=fixture();try{const c=f.create();f.transport.currentTick=97;f.transport.state='playing';await f.capture(c.id);const d=f.service.data(c.id),p=f.service.panels(c.id)[0];assert.equal(f.transport.currentTick,97);assert.equal(f.transport.state,'playing');assert.equal(getPlaybackInstance(p.id).sourcePhaseOriginTick,0);assert.equal(d.capture.phaseOffsetTick,192);assert.equal(f.service.recording(c.id),true);assert.deepEqual(f.service.view(c.id).ball,{x:0,y:0});f.transport.currentTick=192;assert.deepEqual(f.service.view(c.id).ball,{x:0,y:0});f.poll(192+384,192+384+120);assert.deepEqual(f.service.view(c.id).ball,{x:0,y:0});
 const raw=simulateThrow({cubes:f.objects.list('cube'),launch:d.launch,bars:1,bpm:120});assert.deepEqual(p.__dgAuthoredNotes.map(n=>n.col*48),raw.collisions.map(e=>(e.tick+192)%384));
 }finally{f.dispose();}
});

test('cannon centre is the only launch position; moving preserves aim and speed; aiming is fixed length',async()=>{
 const f=fixture();try{
  const c=f.create();await f.capture(c.id,boardLaunch({x:10,y:20},{x:210,y:20}));f.transport.currentTick=1000;f.transport.state='paused';f.service.busy();
  const cubes=f.objects.list('cube');f.service.setAim(c.id,{x:10,y:220});assert.deepEqual(f.service.data(c.id).direction,{x:0,y:1});assert.deepEqual(f.service.data(c.id).launch,{x:10,y:20,vx:0,vy:840});
  f.containers.move(c.id,50,80);assert.deepEqual(f.service.cannon(c.id).endpoint,{x:50,y:176});assert.deepEqual(f.service.data(c.id).direction,{x:0,y:1});assert.deepEqual(f.objects.list('cube'),cubes);
  assert.deepEqual(f.service.handles(),[]);assert.equal(f.service.data(c.id).startPosition,undefined);assert.equal(f.service.data(c.id).targetPosition,undefined);
  f.service.setAim(c.id,{x:50,y:1000});assert.equal(Math.hypot(f.service.data(c.id).launch.vx,f.service.data(c.id).launch.vy),840);
  const saved=JSON.parse(JSON.stringify(f.containers.snapshot()));f.containers.restore(saved);assert.deepEqual(f.containers.snapshot(),saved);
  await f.service.throwBall(c.id);assert.deepEqual(f.service.data(c.id).capture.trajectory[0],{tick:0,x:50,y:80,vx:0,vy:840});
 }finally{f.dispose();}
});

test('canonical launch speed doubles in all directions without depending on drag length',()=>{
 for(const end of [{x:100,y:0},{x:3,y:4},{x:-90,y:-120},{x:0,y:1000}]){
  const v=boardLaunch({x:0,y:0},end);assert.ok(Math.abs(Math.hypot(v.vx,v.vy)-840)<1e-10);assert.ok(Math.abs(v.vx*end.y-v.vy*end.x)<1e-8);
 }
});

test('swept collisions cover tiny cubes, grazing hits, fast diagonals and close neighbours with debounce',()=>{
 const cube=(id,x,y,width=1,height=1)=>({id,x,y,width,height,sourceMidi:60,instrument:'PIANO'});
 for(const [cubes,launch]of [
  [[cube('tiny',100,0)],{x:0,y:0,vx:840,vy:0}],
  [[cube('glance',100,13.49)],{x:0,y:0,vx:840,vy:0}],
  [[cube('diagonal',100,100)],boardLaunch({x:0,y:0},{x:100,y:100})],
  // Extreme speed deliberately exceeds the old discrete step's expanded cube width.
  [[cube('tunnel',100,0)],{x:0,y:0,vx:100000,vy:0}],
  [[cube('left',-30,0),cube('right',30,0)],{x:0,y:0,vx:840,vy:0}],
 ]){
  const result=simulateThrow({cubes,launch});assert.ok(result.collisions.length,cubes[0].id);
  for(const c of cubes)assert.ok(result.collisions.some(e=>e.cubeId===c.id),c.id);
  for(const c of cubes){const hits=result.collisions.filter(e=>e.cubeId===c.id);for(let i=1;i<hits.length;i++)assert.ok(hits[i].timeSeconds*192>=hits[i-1].tick-1e-6,'A cube stays primed until its pending note fires');}
 }
});

test('moving Start or the container reanchors every replay loop and trail without changing captured music',async()=>{
 const f=fixture();try{
  const c=f.create(),ball=await f.capture(c.id,boardLaunch({x:10,y:20},{x:210,y:20}));
  const original=structuredClone(f.service.data(c.id).capture),notes=structuredClone(f.service.panels(c.id)[0].__dgAuthoredNotes),cubes=f.objects.list('cube');
  f.transport.currentTick=1000;f.transport.state='paused';f.service.busy();
  f.service.editHandle(c.id,'start',{x:110,y:70});
  for(const tick of [0,384,768]){f.transport.currentTick=tick;assert.deepEqual(f.service.ballView(f.objects.get(ball.id)).position,{x:110,y:70});}
  f.transport.currentTick=96;
  const preview=simulateThrow({cubes,launch:boardLaunch({x:110,y:70},{x:310,y:70}),bpm:original.bpm}).trajectory;
  let replay=f.service.ballView(f.objects.get(ball.id)),point=trajectoryPoint(preview,96);
  assert.deepEqual(replay.position,point);
  assert.deepEqual(replay.trail,preview.filter(p=>p.tick<=96&&p.tick>24));
  const bounds=f.containers.get(c.id).bounds;f.containers.move(c.id,bounds.x-30,bounds.y+40);
  const saved=JSON.parse(JSON.stringify(f.containers.snapshot()));f.containers.restore(saved);
  for(const tick of [384,768,1152]){f.transport.currentTick=tick;assert.deepEqual(f.service.view(c.id).ball,{x:80,y:110});}
  assert.deepEqual(f.service.data(c.id).capture,original);assert.deepEqual(f.service.panels(c.id)[0].__dgAuthoredNotes,notes);assert.deepEqual(f.objects.list('cube'),cubes);assert.equal(f.service.data(c.id).stale,true);
  f.transport.currentTick=2000;await f.service.throwBall(c.id);f.transport.state='paused';f.transport.currentTick=0;
  assert.deepEqual(f.service.view(c.id).ball,{x:80,y:110},'Recording again must not apply the movement twice');
 }finally{f.dispose();}
});

test('edited targets and current cube geometry drive cached visual physics while music waits for recording',async()=>{
 const f=fixture();try{
  const cube=f.objects.addCube(300,200),c=f.create(),ball=await f.capture(c.id,boardLaunch({x:0,y:0},{x:200,y:0}));
  const notes=structuredClone(f.service.panels(c.id)[0].__dgAuthoredNotes),capture=structuredClone(f.service.data(c.id).capture);
  assert.deepEqual(f.service.data(c.id).cubeIds,[],'Cube starts outside the original flight');
  f.transport.currentTick=1000;f.transport.state='paused';f.service.busy();
  f.objects.update(cube.id,{y:0});assert.ok(f.service.data(c.id).stale,'Previously unreferenced cubes can enter the flight');
  f.transport.currentTick=96;
  const hit=f.service.view(c.id);assert.ok(hit.ball.x<258,'Ball reflects from the moved cube');assert.strictEqual(f.service.view(c.id).trajectory,hit.trajectory,'Unchanged geometry reuses simulation');
  f.service.editHandle(c.id,'target',{x:0,y:200});const aimed=f.service.ballView(f.objects.get(ball.id));assert.equal(aimed.position.x,0);assert.ok(aimed.position.y>400);
  f.objects.update(cube.id,{x:0,y:300});assert.ok(f.service.view(c.id).ball.y<258,'Re-aimed path collides with updated cubes');
  f.objects.remove(cube.id);assert.ok(f.service.view(c.id).ball.y>400,'Removing cube restores free flight');
  f.objects.addCube(0,200);assert.ok(f.service.view(c.id).ball.y<158,'New cube also changes the path');
  assert.deepEqual(f.service.panels(c.id)[0].__dgAuthoredNotes,notes);assert.deepEqual(f.service.data(c.id).capture,capture);
  const saved=JSON.parse(JSON.stringify(f.containers.snapshot()));f.containers.restore(saved);assert.ok(f.service.view(c.id).ball.y<158,'Saved stale setup previews current geometry');
 }finally{f.dispose();}
});

test('in-flight launch stays fixed until the next loop after Start, Target or container edits',async()=>{
 const f=fixture();try{
  f.objects.addCube(5000,5000);const c=f.create(),ball=await f.capture(c.id,boardLaunch({x:0,y:0},{x:200,y:0}));
  Object.assign(getPlaybackInstance(f.service.panels(c.id)[0].id),{active:true,startTick:0,endTick:Infinity});
  f.transport.currentTick=480;f.service.busy();
  const old=f.service.ballView(f.objects.get(ball.id));assert.ok(old.position.x>400);assert.equal(old.position.y,0);
  f.service.editHandle(c.id,'target',{x:0,y:200});
  assert.deepEqual(f.service.ballView(f.objects.get(ball.id)),old,'Target edit must not redirect this flight or its trail');
  f.service.editHandle(c.id,'start',{x:100,y:50});
  assert.deepEqual(f.service.ballView(f.objects.get(ball.id)),old,'Start edit must not teleport this flight');
  const bounds=f.containers.get(c.id).bounds;f.containers.move(c.id,bounds.x+20,bounds.y+30);
  assert.deepEqual(f.service.ballView(f.objects.get(ball.id)),old,'Container move must not teleport this flight');
  f.transport.currentTick=576;const continuing=f.service.view(c.id).ball;assert.ok(continuing.x>800);assert.equal(continuing.y,0);
  f.transport.currentTick=768;assert.deepEqual(f.service.view(c.id).ball,{x:120,y:80},'Next loop starts from the latest origin');
  f.transport.currentTick=864;const next=f.service.view(c.id).ball;assert.equal(next.x,120);assert.ok(next.y>480,'Next flight uses the latest target');
 }finally{f.dispose();}
});

test('audio lookahead and visible flights switch impact notes together, including silent flights and new cube assignments',async()=>{
 const f=fixture(),scheduler=f.scheduler;try{
  const right=f.objects.addCube(300,0),left=f.objects.addCube(-100,0),c=f.create(),ball=await f.capture(c.id,boardLaunch({x:0,y:0},{x:200,y:0})),panel=f.service.panels(c.id)[0];
  Object.assign(getPlaybackInstance(panel.id),{active:true,startTick:0,endTick:Infinity});
  const schedule=(from,to)=>{f.transport.currentTick=from;Object.assign(getPlaybackInstance(panel.id),{active:true,startTick:0,endTick:Infinity});panel.__chainTurnEndTick=Infinity;return scheduler.tick({activeToyIds:new Set([panel.id]),getToy:id=>f.toys.get(id),currentTick:from,lookaheadEndTick:to,tickToAudioTime:t=>t});};
  f.transport.currentTick=480;f.service.busy();const old=f.service.view(c.id),oldNotes=structuredClone(panel.__dgAuthoredNotes);
  f.service.editHandle(c.id,'start',{x:0,y:200});assert.deepEqual(f.service.view(c.id).ball,old.ball);
  schedule(480,960);assert.ok(f.calls.some(e=>e.tick>=480&&e.tick<768),'Current-flight impacts retain their notes');assert.ok(!f.calls.some(e=>e.tick>768),'Only the previous flight?s pending end-cell impact may sound on the next launch');
  assert.deepEqual(panel.__dgAuthoredNotes,oldNotes,'Lookahead must not publish future notes early');
  f.transport.currentTick=768;assert.deepEqual(f.service.view(c.id).ball,{x:0,y:200});assert.ok(panel.__dgAuthoredNotes.every(n=>n.col===0),'Silent flight retains only pending end-cell impacts at launch');assert.equal(f.service.data(c.id).stale,false);
  f.objects.update(right.id,{sourceMidi:77,instrument:'PIANO'});f.objects.update(left.id,{sourceMidi:74,instrument:'KALIMBA'});
  f.service.editHandle(c.id,'start',{x:0,y:0});schedule(960,1536);
  const nextNotes=f.calls.filter(e=>e.tick>=1152);assert.ok(nextNotes.length,'A silent capture must become audible again');assert.ok(nextNotes.some(e=>e.midi===77&&e.instrument==='KALIMBA'));assert.ok(nextNotes.some(e=>e.midi===74&&e.instrument==='KALIMBA'));
  f.transport.currentTick=1152;f.service.view(c.id);assert.ok(panel.__dgAuthoredNotes.some(n=>n.sourceMidi===77));assert.deepEqual(f.service.data(c.id).cubeIds.sort(),[right.id,left.id].sort());
  const saved=structuredClone({music:panel.__dgAuthoredNotes,data:f.service.data(c.id)});f.containers.restore(f.containers.snapshot());assert.deepEqual(f.service.data(c.id),saved.data);assert.deepEqual(panel.__dgAuthoredNotes,saved.music);
  f.containers.expand(c.id);assert.equal(panel.__simpleBouncerLive,undefined,'Expansion removes the live coordinator while keeping canonical notes');assert.deepEqual(panel.__dgAuthoredNotes,saved.music);
 }finally{scheduler.dispose();f.dispose();}
});

test('two cannons share pitch cubes while owning independent instruments; selector changes notes without per-event instrument copies',async()=>{
 const f=fixture();try{
  const cube=f.objects.addCube(300,0,{sourceMidi:65,instrument:'pluck'}),a=f.create(),b=f.create();f.service.setInstrument(a.id,'PIANO');
  await f.capture(a.id);f.transport.currentTick=384;await f.capture(b.id);
  const pa=f.service.panels(a.id)[0],pb=f.service.panels(b.id)[0];assert.equal(cube.instrument,undefined);
  for(const p of [pa,pb]){assert.ok(p.__dgAuthoredNotes.length);assert.ok(p.__dgAuthoredNotes.every(n=>n.sourceMidi===65&&!Object.hasOwn(n,'instrument')));}
  assert.equal(pa.__seqPattern.instrument,'PIANO');assert.equal(pb.__seqPattern.instrument,'KALIMBA');
  const notes=structuredClone(pa.__dgAuthoredNotes),cubes=f.objects.list('cube');f.service.setInstrument(a.id,'pluck');
  assert.deepEqual(pa.__dgAuthoredNotes,notes);assert.equal(pa.__seqPattern.instrument,'pluck');assert.equal(pb.__seqPattern.instrument,'KALIMBA');assert.deepEqual(f.objects.list('cube'),cubes);
  assert.equal(f.objects.get(f.service.data(a.id).ballId).instrument,'pluck');assert.equal(pa.__sequencerPatternAtTick(768,{}).instrument,'pluck');
 }finally{f.dispose();}
});

test('legacy Start/Target scenes migrate to one cannon at Start with one instrument and pitch-only cube data',async()=>{
 const f=fixture();try{
  const c=f.create();await f.capture(c.id);const panel=f.service.panels(c.id)[0],old=f.service.data(c.id),notes=structuredClone(panel.__dgAuthoredNotes);
  f.containers.setPresentation(c.id,{interactionData:{...old,version:2,instrument:'PIANO',startPosition:{x:100,y:200},targetPosition:{x:200,y:300},direction:undefined}});
  f.service.migrateLegacy();const d=f.service.data(c.id);assert.equal(d.version,3);assert.equal(d.startPosition,undefined);assert.equal(d.targetPosition,undefined);assert.equal(d.instrument,'PIANO');
  assert.equal(f.service.cannon(c.id).x,100);assert.equal(f.service.cannon(c.id).y,200);assert.ok(Math.abs(d.direction.x-Math.SQRT1_2)<1e-10);assert.equal(f.containers.get(c.id).bounds.width,80);
  assert.deepEqual(panel.__dgAuthoredNotes,notes);assert.equal(panel.__seqPattern.instrument,'PIANO');const saved=f.containers.snapshot();f.service.migrateLegacy();assert.deepEqual(f.containers.snapshot(),saved);
  const cube=f.objects.list('cube')[0];f.objects.restore([{...cube,instrument:'PIANO',color:'#f00'}]);assert.equal(f.objects.get(cube.id).instrument,undefined);assert.equal(f.objects.get(cube.id).color,'#829cab');
 }finally{f.dispose();}
});

test('deleting a cannon removes its ball and owned music while preserving shared cubes, other cannons and independent balls',async()=>{
 const f=fixture();try{
  f.objects.addCube(300,0);const a=f.create(),b=f.create();const ba=await f.capture(a.id);f.transport.currentTick=384;const bb=await f.capture(b.id),independent=f.objects.addBall(900,900),cubes=f.objects.list('cube'),pa=f.service.panels(a.id)[0];
  assert.ok(f.containers.remove(a.id).ok);assert.equal(f.objects.get(ba.id),null);assert.equal(f.toys.has(pa.id),false);assert.ok(f.objects.get(bb.id));assert.ok(f.objects.get(independent.id));assert.deepEqual(f.objects.list('cube'),cubes);assert.ok(f.containers.get(b.id));
 }finally{f.dispose();}
});

test('deleting a cannon during asynchronous creation removes its pending ball and leaves no musical orphan',async()=>{
 let finish;const barrier=new Promise(r=>{finish=r;}),f=fixture({afterCreate:()=>barrier});try{
  const c=f.create(),attempt=f.capture(c.id);const ball=f.objects.list('ball')[0],cubes=f.objects.list('cube');assert.equal(ball.captureId,c.id);
  f.containers.remove(c.id);assert.equal(f.objects.get(ball.id),null);finish();await attempt;assert.equal(f.toys.size,0);assert.deepEqual(f.objects.list('cube'),cubes);
 }finally{finish();f.dispose();}
});

test('instrument edits made while a cannon is materializing survive grid creation',async()=>{
 let finish;const barrier=new Promise(r=>{finish=r;}),f=fixture({afterCreate:()=>barrier});try{
  const c=f.create(),attempt=f.capture(c.id);f.service.setInstrument(c.id,'PIANO');finish();await attempt;
  assert.equal(f.service.data(c.id).instrument,'PIANO');assert.equal(f.service.panels(c.id)[0].__seqPattern.instrument,'PIANO');assert.ok(f.service.panels(c.id)[0].__dgAuthoredNotes.every(n=>!('instrument'in n)));
 }finally{finish();f.dispose();}
});


test('prediction follows current cannon and cube geometry with exact bounce corners without redirecting the active launch',async()=>{
 const f=fixture();try{
  const cube=f.objects.addCube(300,0),c=f.create();await f.capture(c.id,boardLaunch({x:0,y:0},{x:100,y:0}));
  const panel=f.service.panels(c.id)[0];Object.assign(getPlaybackInstance(panel.id),{active:true,startTick:0,endTick:Infinity});
  f.transport.currentTick=480;f.service.busy();const before=f.service.view(c.id).ball;
  const first=f.service.prediction(c.id);assert.ok(first.some(p=>Math.abs(p.x-258)<1e-5),'Preview includes the exact contact corner');
  f.service.setAim(c.id,{x:0,y:100});const next=f.service.prediction(c.id);assert.ok(next.at(-1).y>1600);assert.deepEqual(f.service.view(c.id).ball,before);
  f.objects.update(cube.id,{x:0,y:300});const moved=f.service.prediction(c.id);assert.ok(moved.some(p=>Math.abs(p.y-258)<1e-5));assert.ok(moved.at(-1).y<0);assert.equal(f.objects.get(cube.id).width,58);
 }finally{f.dispose();}
});

test('moving a cube into the remaining flight changes its bounce and scheduled note during recording',async()=>{
 const f=fixture();try{
  const cube=f.objects.addCube(300,300,{sourceMidi:77}),c=f.create();await f.capture(c.id,boardLaunch({x:0,y:0},{x:100,y:0}));
  const panel=f.service.panels(c.id)[0];Object.assign(getPlaybackInstance(panel.id),{active:true,startTick:0,endTick:Infinity});
  f.transport.currentTick=24;const before=f.service.view(c.id).ball;assert.equal(f.service.busy(),true);
  f.objects.update(cube.id,{y:0});assert.deepEqual(f.service.view(c.id).ball,before,'Cube edits preserve the travelled path');
  assert.deepEqual(panel.__dgAuthoredNotes,[],'An edited flight stays live instead of recording a partial path');
  panel.__chainTurnEndTick=Infinity;f.poll(24,160);assert.ok(f.calls.some(e=>e.midi===77&&e.tick===96),'New impact sounds on the next eighth-note boundary');
  f.transport.currentTick=80;assert.ok(f.service.view(c.id).ball.x<258,'Ball bounces at the moved cube');
  assert.equal(f.service.cubeResponses().get(cube.id)?.pending,true);
  f.transport.currentTick=96;assert.equal(f.service.cubeResponses().get(cube.id)?.flash,1);
  f.transport.currentTick=384;const fresh=f.service.view(c.id);assert.equal(fresh.trajectory[0].x,0);assert.equal(f.service.data(c.id).stale,false);assert.ok(panel.__dgAuthoredNotes.some(n=>n.sourceMidi===77),'Settled geometry is recorded on the next launch');
  const expected=simulateThrow({cubes:f.objects.list('cube'),launch:boardLaunch({x:0,y:0},{x:100,y:0})});assert.deepEqual(fresh.trajectory,expected.trajectory);
 }finally{f.dispose();}
});

test('fast cube drags crossing the ball queue one quantised impact instead of tunnelling or stacking notes',async()=>{
 const f=fixture();try{
  const cube=f.objects.addCube(105,-100,{sourceMidi:79}),c=f.create();await f.capture(c.id,boardLaunch({x:0,y:0},{x:100,y:0}));
  const panel=f.service.panels(c.id)[0];Object.assign(getPlaybackInstance(panel.id),{active:true,startTick:0,endTick:Infinity});
  f.transport.currentTick=24;f.service.view(c.id);f.objects.update(cube.id,{y:100});f.objects.update(cube.id,{y:-100});
  const music=f.service.view(c.id);assert.ok(music.ball);assert.equal(panel.__sequencerPatternAtTick(48,{}).cols[1].notes.filter(n=>n.sourceMidi===79).length,1);
  panel.__chainTurnEndTick=Infinity;f.poll(24,96);assert.equal(f.calls.filter(e=>e.tick===48&&e.midi===79).length,1);
 }finally{f.dispose();}
});


test('an end-cell collision stays pending and sounds once on the following launch boundary',async()=>{
 const f=fixture();try{
  const cube=f.objects.addCube(1617,0,{sourceMidi:81}),c=f.create();await f.capture(c.id,boardLaunch({x:0,y:0},{x:100,y:0}));
  const panel=f.service.panels(c.id)[0];Object.assign(getPlaybackInstance(panel.id),{active:true,startTick:0,endTick:Infinity});panel.__chainTurnEndTick=Infinity;
  f.poll(0,96);assert.equal(f.calls.length,0,'End-cell notes must not fire early at the initial launch');
  f.poll(336,432);assert.equal(f.calls.filter(e=>e.midi===81&&e.tick===384).length,1);
  f.transport.currentTick=380;assert.equal(f.service.cubeResponses().get(cube.id)?.pending,true);
  f.transport.currentTick=384;assert.equal(f.service.cubeResponses().get(cube.id)?.flash,1);
 }finally{f.dispose();}
});


test('recording never locks first-loop aim, position, phrase length, or other cannons',async()=>{
 const f=fixture();try{
  const c=f.create();await f.capture(c.id,boardLaunch({x:0,y:0},{x:100,y:0}));const panel=f.service.panels(c.id)[0];
  Object.assign(getPlaybackInstance(panel.id),{active:true,startTick:0,endTick:Infinity});f.transport.currentTick=24;
  assert.equal(f.service.recording(c.id),true);const before=f.service.view(c.id).ball;
  assert.equal(f.service.setAim(c.id,{x:0,y:100}),true);assert.deepEqual(f.service.view(c.id).ball,before);
  assert.equal(f.service.editHandle(c.id,'start',{x:80,y:100}),true);assert.deepEqual(f.service.view(c.id).ball,before);
  const other=f.create(),ball=f.objects.addBall(500,500);assert.equal(await f.service.throwBall(other.id,{ballId:ball.id,launch:boardLaunch({x:500,y:500},{x:600,y:500})}),true,'Another recording never prevents a new cannon');
  assert.equal(f.service.setBars(c.id,3),true);assert.equal(f.service.data(c.id).bars,3);
 }finally{f.dispose();}
});
import {seedTriggerCubes} from '../src/trigger-starter-cubes.js';
test('deleting committed Cannon leaves canonical starter Cubes available to other Triggers',async()=>{
 const f=fixture();try{const cubes=seedTriggerCubes({objects:f.objects,center:{x:0,y:0}}),c=f.create();await f.capture(c.id,boardLaunch({x:-300,y:-50},{x:100,y:-50}));f.containers.remove(c.id);assert.deepEqual(f.objects.list('cube').map(o=>o.id),cubes.map(o=>o.id));}finally{f.dispose();}
});
test('authored Cannon prediction uses current tempo and length through shared simulation',async()=>{
 const f=fixture();try{const c=f.create();await f.capture(c.id,boardLaunch({x:0,y:0},{x:100,y:0}));f.transport.bpm=60;f.service.setBars(c.id,2);assert.deepEqual(f.service.prediction(c.id),simulateThrow({launch:boardLaunch({x:0,y:0},{x:100,y:0}),cubes:f.objects.list('cube'),bpm:60,bars:2}).trajectory);}finally{f.dispose();}
});
import {createDrumObjects} from '../src/simple-drum.js';
import {createDrumLoopController} from '../src/simple-drum-loop.js';
import {boardCollisionBody} from '../src/board-collision-body.js';
test('normal Cannon capture bounces from Drum and routes a transient receiver-owned hit without recording or Kalimba notes',async()=>{
 const drums=createDrumObjects(),drum=drums.create({x:200,y:0,instrument:'DRUM SNARE 1'}),events=[];let loop;
 const f=fixture({extraReceivers:()=>drums.list().map(boardCollisionBody),onReceiverTrigger:e=>loop.trigger(e)});
 f.transport.tickToAudioTime=t=>t/192;f.transport.audioTimeToTick=s=>Math.round(s*192);
 loop=createDrumLoopController({objects:drums,getTransport:()=>f.transport,schedule:e=>events.push(e)});
 try{const c=f.create();await f.capture(c.id,boardLaunch({x:0,y:0},{x:100,y:0}));assert.ok(f.service.data(c.id).capture.collisions.some(e=>e.cubeId===drum.id));
  assert.equal(f.service.panels(c.id)[0].__dgAuthoredNotes.length,0);
  f.transport.currentTick=24;f.service.scheduleReceiverHits();assert.equal(events.length,0,'Do not sound a predicted collision before physical contact');f.transport.currentTick=36;f.service.scheduleReceiverHits();f.service.scheduleReceiverHits();assert.equal(events.length,1);assert.equal(events[0].instrument,'DRUM SNARE 1');assert.equal(events[0].sourceId,drum.id);assert.equal(drums.get(drum.id).authoredState.pattern.authoredNotes.length,0);
 }finally{loop.destroy();f.dispose();}
});

test('Cannon commit starts stopped transport once while passive Cube placement leaves it stopped',async()=>{
 const f=fixture();try{let plays=0;f.transport.play=async()=>{plays++;f.transport.state='playing';};f.objects.addCube(300,0);assert.equal(plays,0);assert.equal(f.transport.state,'stopped');
 const c=f.create();await f.capture(c.id);assert.equal(f.transport.state,'playing');assert.equal(plays,1);f.transport.currentTick=217;await f.capture(c.id);assert.equal(plays,1);assert.equal(f.transport.currentTick,217);
 }finally{f.dispose();}
});

test('Cannon receiver admission plays a String contact once without capturing receiver-owned music into the Cannon grid',async()=>{
 const surfaces=createStringSurfaces(),surface=surfaces.create({start:{x:180,y:-150},end:{x:180,y:150},instrument:'PIANO'}),received=[];
 const f=fixture({extraReceivers:()=>surfaces.list().map(boardCollisionBody),onReceiverTrigger:e=>received.push(e)});try{
  f.transport.tickToAudioTime=t=>t/192;f.transport.audioTimeToTick=t=>t*192;
  const c=f.create();await f.capture(c.id);const capture=f.service.data(c.id).capture;
  assert.equal(capture.collisions[0].cubeId,surface.id);assert.equal(f.service.panels(c.id)[0].__dgAuthoredNotes.length,0);
  f.transport.currentTick=90;f.service.scheduleReceiverHits();f.service.scheduleReceiverHits();assert.equal(received.length,1);assert.equal(received[0].instrument,'PIANO');assert.ok(Number.isFinite(received[0].progress));assert.equal(surfaces.get(surface.id).authoredState.recordedEvents.length,0);
 }finally{f.dispose();}
});

test('Gravity Cannon reuses stopped/running commit, pause/reset and next-flight aim semantics',async()=>{
 const f=fixture();try{let starts=0;f.transport.play=async()=>{starts++;f.transport.state='playing';};
  const c=f.create([],{ballMode:'gravity'}),launch=boardLaunch({x:0,y:0},{x:100,y:0});await f.capture(c.id,launch);assert.equal(starts,1);assert.equal(f.service.data(c.id).ballMode,'gravity');
  assert.deepEqual(f.service.data(c.id).capture.trajectory,simulateThrow({launch,cubes:f.objects.list('cube'),ballMode:'gravity',bpm:120}).trajectory);
  const panel=f.service.panels(c.id)[0];Object.assign(getPlaybackInstance(panel.id),{active:true,startTick:0,endTick:Infinity});f.transport.currentTick=72;const position=f.service.view(c.id).ball;
  f.transport.state='paused';assert.deepEqual(f.service.view(c.id).ball,position);f.transport.currentTick=0;assert.deepEqual(f.service.view(c.id).ball,{x:0,y:0});
  f.transport.state='playing';f.transport.currentTick=217;await f.capture(c.id,launch);assert.equal(starts,1);assert.equal(f.transport.currentTick,217);
  assert.ok(f.service.setAim(c.id,{x:0,y:-100}));assert.equal(f.service.data(c.id).ballMode,'gravity');assert.deepEqual(f.service.prediction(c.id),simulateThrow({launch:boardLaunch({x:0,y:0},{x:0,y:-100}),cubes:f.objects.list('cube'),ballMode:'gravity',bpm:120}).trajectory);
 }finally{f.dispose();}
});

test('Gravity Cannon mode survives JSON restore, clear and shared deletion without owning receivers',async()=>{
 const f=fixture();try{const cube=f.objects.addCube(0,200),c=f.create([],{ballMode:'gravity'});const ball=await f.capture(c.id,boardLaunch({x:0,y:0},{x:0,y:100}));f.service.setInstrument(c.id,'PIANO');
  const saved=JSON.parse(JSON.stringify(f.containers.snapshot())),physical=JSON.parse(JSON.stringify(f.objects.authoredSnapshot()));f.objects.restore(physical);f.containers.restore(saved);f.service.migrateLegacy();
  assert.equal(f.service.data(c.id).ballMode,'gravity');assert.equal(f.objects.get(ball.id).ballMode,'gravity');assert.equal(f.objects.get(ball.id).captureId,c.id);assert.equal(f.service.data(c.id).instrument,'PIANO');
  f.service.clear(c.id);assert.equal(f.service.data(c.id).ballMode,'gravity');await f.service.throwBall(c.id);f.containers.remove(c.id);assert.equal(f.objects.get(ball.id),null);assert.ok(f.objects.get(cube.id));assert.equal(f.service.panels(c.id).length,0);
 }finally{f.dispose();}
});

import {createStringSurfaceLoop} from '../src/string-surface-loop.js';
for(const kind of ['drum','string','strum'])test(`Gravity Cannon transient ${kind} contact uses receiver-owned sound, feedback and no recording`,async()=>{
 const receivers=kind==='drum'?createDrumObjects():createStringSurfaces(),receiver=kind==='drum'?receivers.create({x:0,y:200,instrument:'DRUM SNARE 1'}):receivers.create({kind,start:{x:-250,y:200},end:{x:250,y:200},instrument:'PIANO'}),events=[],feedback=[];let loop;
 const f=fixture({extraReceivers:()=>receivers.list().map(boardCollisionBody),onReceiverTrigger:e=>loop.trigger(e)});Object.assign(f.transport,{id:MAIN_TRANSPORT_ID,tickToAudioTime:t=>t/192,audioTimeToTick:t=>t*192});
 loop=kind==='drum'?createDrumLoopController({objects:receivers,getTransport:()=>f.transport,schedule:e=>events.push(e)}):createStringSurfaceLoop({objects:receivers,getTransport:()=>f.transport,schedule:e=>events.push(e)});loop.subscribe(e=>feedback.push(e));
 try{const c=f.create([],{ballMode:'gravity'}),before=JSON.stringify(receivers.snapshot());await f.capture(c.id,boardLaunch({x:0,y:0},{x:0,y:100}));const hits=f.service.data(c.id).capture.collisions.filter(e=>e.cubeId===receiver.id);assert.ok(hits.length);assert.equal(f.service.panels(c.id)[0].__dgAuthoredNotes.length,0);
  const hit=hits[0];f.transport.currentTick=Math.ceil(hit.timeSeconds*192);f.service.scheduleReceiverHits();f.service.scheduleReceiverHits();assert.equal(events.length,1);assert.equal(events[0].instrument,kind==='drum'?'DRUM SNARE 1':'PIANO');assert.equal(events[0].eventTick%48,0);f.transport.currentTick=hit.tick;loop.tick();assert.equal(feedback.length,1);assert.equal(JSON.stringify(receivers.snapshot()),before);
 }finally{loop.destroy();f.dispose();}
});

test('expired Gravity Ball stays hidden until the next ordinary Cannon loop',async()=>{
 const f=fixture();try{const c=f.create([],{ballMode:'gravity'});f.transport.bpm=30;f.service.setBars(c.id,4);const ball=await f.capture(c.id,boardLaunch({x:0,y:0},{x:100,y:0})),panel=f.service.panels(c.id)[0];Object.assign(getPlaybackInstance(panel.id),{active:true,startTick:0,endTick:Infinity});
  const end=f.service.data(c.id).capture.trajectory.at(-1).tick;assert.ok(end<1536);f.transport.currentTick=end+1;assert.equal(f.service.ballView(f.objects.get(ball.id)).hidden,true);f.transport.currentTick=1536;assert.equal(f.service.ballView(f.objects.get(ball.id)).hidden,false);
 }finally{f.dispose();}
});

for(const mode of ['normal','gravity'])test(`${mode} Cannon resolves current receiver chord/instrument/volume instead of captured sound snapshots`,async()=>{
 const surfaces=createStringSurfaces(),surface=surfaces.create({start:{x:-200,y:200},end:{x:200,y:200},instrument:'KALIMBA'}),received=[];
 const f=fixture({extraReceivers:()=>surfaces.list().map(boardCollisionBody),onReceiverTrigger:e=>received.push(e)});Object.assign(f.transport,{tickToAudioTime:t=>t/192,audioTimeToTick:t=>t*192});
 try{const c=f.create([],{ballMode:mode});await f.capture(c.id,boardLaunch({x:-100,y:0},{x:-100,y:100}));const hit=f.service.data(c.id).capture.collisions[0];surfaces.update(surface.id,{mode:'chord',instrument:'PIANO',volume:.23});
  f.transport.currentTick=Math.ceil(hit.timeSeconds*192);f.service.scheduleReceiverHits();f.service.scheduleReceiverHits();assert.equal(received.length,1);assert.deepEqual(received[0].sourceMidis,[64,69,74]);assert.equal(received[0].instrument,'PIANO');assert.equal(received[0].volume,.23);assert.equal(surfaces.get(surface.id).authoredState.recordedEvents.length,0);
 }finally{f.dispose();}
});

test('legacy Cannon pitch-only records recover surface contact from trajectory and never become Cannon-owned notes',async()=>{
 const surfaces=createStringSurfaces(),surface=surfaces.create({start:{x:-200,y:200},end:{x:200,y:200},mode:'chord',instrument:'PIANO'}),received=[];
 const f=fixture({extraReceivers:()=>surfaces.list().map(boardCollisionBody),onReceiverTrigger:e=>received.push(e)});Object.assign(f.transport,{tickToAudioTime:t=>t/192,audioTimeToTick:t=>t*192});
 try{const c=f.create();await f.capture(c.id,boardLaunch({x:-100,y:0},{x:-100,y:100}));const d=f.service.data(c.id);d.capture.collisions=d.capture.collisions.map(({contact,receiverCapabilities,...hit})=>({...hit,sourceMidi:36}));f.containers.setPresentation(c.id,{interactionData:d});
  const state=bouncerGridState(d.capture,c.id,'WRONG TRIGGER',id=>surfaces.get(id));assert.equal(state.authoredNotes.length,0);
  f.transport.currentTick=Math.ceil(d.capture.collisions[0].timeSeconds*192);f.service.scheduleReceiverHits();assert.equal(received.length,1);assert.deepEqual(received[0].sourceMidis,[64,69,74]);assert.equal(received[0].lane,0);assert.equal(received[0].region,2);assert.equal(received[0].instrument,'PIANO');
 }finally{f.dispose();}
});
