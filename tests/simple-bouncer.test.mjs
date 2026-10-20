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

function fixture({afterCreate=async()=>{}}={}){
 clearPlaybackInstancesForTests();const model=createConnectionModel(),toys=new Map(),positions=new Map(),calls=[],commits=[];let serial=0,sync=()=>{};
 const objects=createBoardPhysicalObjects();
 const transport={state:'stopped',currentTick:0,bpm:120,async play(){this.state='playing';}};
 model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS,transportId:MAIN_TRANSPORT_ID});
 const containers=createContainerToyModel(model,{getRect:id=>positions.get(id),getDuration:id=>toyLoopLengthTicks(toys.get(id)),setPosition:(id,x,y)=>positions.set(id,{...positions.get(id),x,y}),onBoundsCommit:id=>commits.push(id),removeInternal:id=>{model.removeObject(id);toys.delete(id);positions.delete(id);}});
 async function applyGrid(p,state){p.state=normalizeAuthoredState(state);p.dataset.steps=String(state.steps);p.dataset.instrument=state.instrument;restoreAuthoredNotes(p,p.state);p.__seqPattern=drawgridPatternFromState(p.state);p.__seqRev++;ensurePlaybackInstance(p.id,{loopLengthTicks:toyLoopLengthTicks(p)});}
 async function createGrid(state,pos){const p={id:`grid${++serial}`,dataset:{toy:'drawgrid'},__seqRev:0,__sequencerSchedule(col,time,meta){for(const note of (this.__sequencerPatternAtTick?.(meta.eventTick,meta)||this.__seqPatternActive||this.__seqPattern).cols[col]?.notes||[])calls.push({id:this.id,tick:meta.eventTick,col,midi:note.sourceMidi,instrument:note.instrument||this.dataset.instrument,context:meta.context});}};await applyGrid(p,state);toys.set(p.id,p);positions.set(p.id,{...pos,width:800,height:760});model.registerObject(p.id);await afterCreate(p);return p;}
 const service=createSimpleBouncerController({containers,objects,model,getToy:id=>toys.get(id),createGrid,applyGrid,removeGrid:p=>{model.removeObject(p.id);toys.delete(p.id);},cancelScheduled:(p,tick)=>scheduler.resetToyTimeline(p.id,tick,{includeBoundary:false}),publish:()=>sync(),getTransport:id=>model.getTransportId(id)?transport:null,onChanged:()=>sync()});
 const structures=createStructureToyModel(model,{getDuration:id=>toyLoopLengthTicks(toys.get(id))}),adapter=createChainSequenceAdapter({getToy:id=>toys.get(id),chainState:new Map(),connectionModel:model}),scheduler=createSequencerScheduler();
 sync=()=>adapter.sync([...toys.values()],{currentTick:transport.currentTick,state:'stopped'},{connections:model.list('sequence'),structures:structures.list()});
 const wire=(from,to,port='output',kind='sequence')=>{const r=model.connect(kind,{objectId:from,portId:port},{objectId:to,portId:'input'});assert.ok(r.ok,r.reason);return r.connection;};
 const create=(types=[])=>{const c=service.create({x:0,y:0});let parent=MAIN_TRANSPORT_ID,port='output',kind='transport';for(const type of types){const s=structures.createStandalone(type);if(type==='transpose')structures.setSemitones(s.id,7);if(type==='repeat')structures.setCount(s.id,2);wire(parent,s.id,port,kind);parent=s.id;port='child:0';kind='sequence';}wire(parent,c.id,port,kind);sync();return c;};
 const poll=(from,to)=>{transport.currentTick=from;scheduler.tick({transportId:MAIN_TRANSPORT_ID,playbackTurns:adapter.turnsForLookahead(from,to),getToy:id=>toys.get(id),currentTick:from,lookaheadEndTick:to,tickToAudioTime:t=>t});};
 const capture=async(id,launch={x:0,y:0,vx:420,vy:0})=>{if(!objects.list("cube").length)objects.addCube(300,0);const ball=objects.addBall(launch.x,launch.y);await service.throwBall(id,{ballId:ball.id,launch});return ball;};
 return {objects,capture,model,toys,containers,service,transport,positions,calls,commits,create,wire,poll,sync,structures,createGrid,scheduler,dispose(){service.destroy();scheduler.dispose();adapter.reset();structures.dispose();containers.dispose();clearPlaybackInstancesForTests();}};
}
test('physical objects exist without a musical container, retain IDs on restore, and preserve note/colour assignments',()=>{
 const objects=createBoardPhysicalObjects(),cube=objects.addCube(-200,50),ball=objects.addBall(1000,300);
 assert.equal(objects.list().length,2);assert.ok(SAFE_LINE_MIDI.includes(cube.sourceMidi));assert.ok(cube.color);assert.equal(cube.width,58);assert.equal(ball.motion.vx,0);
 const snapshot=JSON.parse(JSON.stringify(objects.snapshot()));objects.restore(snapshot);objects.restore(snapshot);assert.deepEqual(objects.snapshot(),snapshot);assert.equal(objects.list().length,2);assert.ok(!snapshot.some(o=>'ownerId' in o));
 const other=objects.addCube(100,200);assert.notEqual(other.id,cube.id);objects.update(cube.id,{instrument:'piano',sourceMidi:72});assert.equal(objects.get(cube.id).sourceMidi,72);assert.notEqual(objects.get(cube.id).color,cube.color);
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
 for(const [i,event]of capture.collisions.entries()){assert.equal(event.tick%48,0);if(i)assert.ok(event.tick-capture.collisions[i-1].tick>=48);const cube=objects.get(event.cubeId);assert.equal(event.sourceMidi,cube.sourceMidi);assert.equal(event.instrument,cube.instrument);}
});
for(const bars of [1,2,3,4])for(const types of [[],['repeat'],['chord-progression','transpose']])test(`${bars} bars under ${types.join('/')||'Heartbeat'}: normal capture/Open/Expand retain every attack and context`,async()=>{
 const f=fixture();try{const c=f.create(types);f.service.setBars(c.id,bars);await f.capture(c.id);const p=f.service.panels(c.id)[0],duration=bars*384;assert.equal(toyLoopLengthTicks(p),duration);assert.ok(p.__dgAuthoredNotes.length);assert.equal(f.containers.owner(f.objects.list('cube')[0].id),null);
 const notes=structuredClone(p.__dgAuthoredNotes),wires=structuredClone(f.model.snapshot().connections),objects=f.objects.snapshot(),runs=[];
 for(let cycle=0;cycle<3;cycle++){if(cycle===1)f.containers.open(c.id);if(cycle===2)f.containers.expand(c.id);f.sync();const start=f.calls.length;for(let tick=cycle*duration;tick<(cycle+1)*duration;tick+=24)f.poll(tick,Math.min(tick+120,(cycle+1)*duration));runs.push(f.calls.slice(start).map(e=>({tick:e.tick-cycle*duration,col:e.col,midi:e.midi,instrument:e.instrument,transpose:e.context.transposeSemitones,harmony:!!e.context.harmony})));}
 assert.ok(runs[0].length);assert.deepEqual(runs[1],runs[0]);assert.deepEqual(runs[2],runs[0]);assert.deepEqual(p.__dgAuthoredNotes,notes);assert.deepEqual(f.model.snapshot().connections,wires);assert.deepEqual(f.objects.snapshot(),objects);
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
 f.containers.move(c.id,800,1200);assert.equal(f.objects.get(cube.id).x,9000);assert.deepEqual(f.service.data(c.id).startPosition,{x:launch.x+800,y:launch.y+1200});
 f.service.clear(c.id);assert.ok(f.containers.get(c.id));assert.equal(f.toys.size,0);assert.equal(f.objects.list().length,2);assert.equal(f.objects.get(ball.id).captureId,null);assert.equal(f.service.data(c.id).capture,null);
 }finally{f.dispose();}
});
test('physical positions, assignments, balls, references, stale state and trajectory round trip independently',async()=>{
 const f=fixture();try{const c=f.create();f.service.setBars(c.id,4);await f.capture(c.id);f.objects.addBall(3000,1000);f.objects.update(f.objects.list('cube')[0].id,{x:500});const saved=JSON.parse(JSON.stringify({containers:f.containers.snapshot(),physicalObjects:f.objects.snapshot(),notes:f.service.panels(c.id)[0].__dgAuthoredNotes}));
 f.objects.restore(saved.physicalObjects);f.containers.restore(saved.containers);assert.deepEqual(f.objects.snapshot(),saved.physicalObjects);assert.deepEqual(f.containers.snapshot(),saved.containers);assert.deepEqual(f.service.panels(c.id)[0].__dgAuthoredNotes,saved.notes);assert.equal(f.objects.list('ball').length,2);
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
 f.containers.setPresentation(c.id,{interactionData:{version:1,bars:1,cubes:[{id:'old',x:300,y:0,sourceMidi:60,instrument:'piano'}],capture:history,stale:false}});f.service.migrateLegacy();const count=f.objects.list().length;f.service.migrateLegacy();assert.equal(f.objects.list().length,count);assert.equal(f.service.data(c.id).version,2);assert.deepEqual(p.__dgAuthoredNotes,before);
 }finally{f.dispose();}
});
test('a throw during playback authors a phase offset, preserving the clock while launching from its recorded start',async()=>{
 const f=fixture();try{const c=f.create();f.transport.currentTick=97;f.transport.state='playing';await f.capture(c.id);const d=f.service.data(c.id),p=f.service.panels(c.id)[0];assert.equal(f.transport.currentTick,97);assert.equal(f.transport.state,'playing');assert.equal(getPlaybackInstance(p.id).sourcePhaseOriginTick,0);assert.equal(d.capture.phaseOffsetTick,192);assert.equal(f.service.recording(c.id),true);assert.deepEqual(f.service.view(c.id).ball,{x:0,y:0});f.transport.currentTick=192;assert.deepEqual(f.service.view(c.id).ball,{x:0,y:0});f.poll(192+384,192+384+120);assert.deepEqual(f.service.view(c.id).ball,{x:0,y:0});
 const raw=simulateThrow({cubes:f.objects.list('cube'),launch:d.launch,bars:1,bpm:120});assert.deepEqual(p.__dgAuthoredNotes.map(n=>n.col*48),raw.collisions.map(e=>(e.tick+192)%384));
 }finally{f.dispose();}
});

test('launch handles edit independently, translate with origin/container, and re-record from persisted values',async()=>{
 const f=fixture();try{
  const c=f.create();await f.capture(c.id,boardLaunch({x:10,y:20},{x:210,y:20}));f.transport.currentTick=1000;f.service.busy();
  const cubes=f.objects.snapshot().filter(o=>o.kind==='cube'),notes=structuredClone(f.service.panels(c.id)[0].__dgAuthoredNotes);
  f.service.editHandle(c.id,'target',{x:10,y:220});let d=f.service.data(c.id);
  assert.deepEqual(d.startPosition,{x:10,y:20});assert.deepEqual(d.targetPosition,{x:10,y:220});assert.deepEqual(d.launch,{x:10,y:20,vx:0,vy:840});assert.ok(d.stale);
  f.service.editHandle(c.id,'start',{x:50,y:80});d=f.service.data(c.id);
  assert.deepEqual(d.targetPosition,{x:50,y:280});assert.equal(f.containers.get(c.id).bounds.x,40);assert.equal(f.containers.get(c.id).bounds.y,60);
  f.containers.move(c.id,140,260);d=f.service.data(c.id);assert.deepEqual(d.startPosition,{x:150,y:280});assert.deepEqual(d.targetPosition,{x:150,y:480});
  assert.deepEqual(f.objects.list('cube'),cubes);assert.deepEqual(f.service.panels(c.id)[0].__dgAuthoredNotes,notes);
  const saved=JSON.parse(JSON.stringify(f.containers.snapshot()));f.containers.restore(saved);assert.deepEqual(f.containers.snapshot(),saved);
  await f.service.throwBall(c.id);d=f.service.data(c.id);assert.equal(d.stale,false);assert.deepEqual(d.capture.trajectory[0],{tick:0,x:150,y:280});assert.deepEqual(d.launch,{x:150,y:280,vx:0,vy:840});
  assert.deepEqual(f.service.handles().map(h=>[h.kind,h.x,h.y]),[['start',150,280],['target',150,480]]);
  f.transport.currentTick=2000;f.service.busy();f.service.editHandle(c.id,'target',{x:150,y:417});await f.service.throwBall(c.id);assert.deepEqual(f.service.data(c.id).targetPosition,{x:150,y:417});
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
  for(const c of cubes){const hits=result.collisions.filter(e=>e.cubeId===c.id);for(let i=1;i<hits.length;i++)assert.ok(hits[i].timeSeconds-hits[i-1].timeSeconds>=.25-1e-8);}
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
  schedule(480,960);assert.ok(f.calls.some(e=>e.tick>=480&&e.tick<768),'Current-flight impacts retain their notes');assert.ok(!f.calls.some(e=>e.tick>=768),'Next flight misses the cubes and plays no old impact notes');
  assert.deepEqual(panel.__dgAuthoredNotes,oldNotes,'Lookahead must not publish future notes early');
  f.transport.currentTick=768;assert.deepEqual(f.service.view(c.id).ball,{x:0,y:200});assert.deepEqual(panel.__dgAuthoredNotes,[],'Silent flight becomes canonical at launch');assert.equal(f.service.data(c.id).stale,false);
  f.objects.update(right.id,{sourceMidi:77,instrument:'PIANO'});f.objects.update(left.id,{sourceMidi:74,instrument:'KALIMBA'});
  f.service.editHandle(c.id,'start',{x:0,y:0});schedule(960,1536);
  const nextNotes=f.calls.filter(e=>e.tick>=1152);assert.ok(nextNotes.length,'A silent capture must become audible again');assert.ok(nextNotes.some(e=>e.midi===77&&e.instrument==='PIANO'));assert.ok(nextNotes.some(e=>e.midi===74&&e.instrument==='KALIMBA'));
  f.transport.currentTick=1152;f.service.view(c.id);assert.ok(panel.__dgAuthoredNotes.some(n=>n.sourceMidi===77));assert.deepEqual(f.service.data(c.id).cubeIds.sort(),[right.id,left.id].sort());
  const saved=structuredClone({music:panel.__dgAuthoredNotes,data:f.service.data(c.id)});f.containers.restore(f.containers.snapshot());assert.deepEqual(f.service.data(c.id),saved.data);assert.deepEqual(panel.__dgAuthoredNotes,saved.music);
  f.containers.expand(c.id);assert.equal(panel.__simpleBouncerLive,undefined,'Expansion removes the live coordinator while keeping canonical notes');assert.deepEqual(panel.__dgAuthoredNotes,saved.music);
 }finally{scheduler.dispose();f.dispose();}
});
