import test from 'node:test';
import assert from 'node:assert/strict';
import {createStringSurfaces,stringSegments,stringTap,stringCrossings,STRING_TUNING} from '../src/string-surface.js';
import {createStringSurfaceLoop} from '../src/string-surface-loop.js';
import {createBoardObject,resolveBoardInteraction,resolvePlayableActivation} from '../src/board-object.js';
import {boardCollisionBody} from '../src/board-collision-body.js';
import {simulateThrow} from '../src/simple-bouncer-physics.js';
import {waveReceiverContacts,crossedWaveReceivers} from '../src/board-wave.js';
import {createLoopingRippleController} from '../src/simple-ripple-loop.js';
import {createRippleObjects} from '../src/simple-ripple.js';
import {createTickTransport} from '../src/tick-transport.js';
import {createBoardObjectLayer} from '../src/board-object-layer.js';
import {createBoardPhysicalObjects} from '../src/board-physical-objects.js';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {installRippleConnections} from '../src/simple-ripple-connections.js';
import {surfaceRegionIndex,worldSegment} from '../src/receiver-surface.js';
import {stringRunways,stringInputHit,chooseStringSurface} from '../src/string-surface-input.js';

function fixture(kind='string'){
 const objects=createStringSurfaces(),events=[],feedback=[],cancelled=[],released=[],context={currentTime:0,state:'running'};let loop,plays=0;
 const transport=createTickTransport({id:'main',getContext:()=>context,emit:e=>{if(e.type==='play')plays++;loop?.transportChanged('main',e.type,e.fromState);}});
 loop=createStringSurfaceLoop({objects,getTransport:()=>transport,getTriggerTransport:()=>transport,schedule:e=>events.push(e),cancel:id=>cancelled.push(id),release:id=>released.push(id)});loop.subscribe(e=>feedback.push(e));
 const o=objects.create({kind,start:{x:0,y:100},end:{x:400,y:100},instrument:'PIANO'});
 return {objects,events,feedback,cancelled,released,context,transport,loop,o,plays:()=>plays,at(tick){context.currentTime=transport.tickToAudioTime(tick);loop.tick();}};
}
test('String and Strum share authored endpoint geometry and the BoardObject capability model',()=>{
 const objects=createStringSurfaces();for(const kind of ['string','strum']){
  const o=objects.create({kind,start:{x:-150,y:40},end:{x:250,y:340}}),lanes=stringSegments(o);
  assert.equal(o.bounds.length,500);assert.equal(lanes.length,kind==='string'?1:4);assert.ok(o.capabilities.playable&&o.capabilities.triggerReceiver&&o.capabilities.instrumentSource&&o.capabilities.draggable);
  assert.equal(o.transform.rotation,Math.atan2(300,400));const before=lanes.map(s=>Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y));objects.update(o.id,{x:500,y:600});assert.ok(stringSegments(objects.get(o.id)).every((s,i)=>Math.abs(Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y)-before[i])<1e-8));
 }
});
test('String has eight low-to-high pentatonic regions; chord mode uses compatible open voicings',()=>{
 const f=fixture(),notes=Array.from({length:8},(_,i)=>resolvePlayableActivation(f.o,0,{lane:0,progress:(i+.5)/8}).sourceMidi);
 assert.deepEqual(notes,[60,62,64,67,69,72,74,76]);f.objects.update(f.o.id,{mode:'chord'});
 for(let i=0;i<8;i++){const e=resolvePlayableActivation(f.objects.get(f.o.id),0,{lane:0,progress:(i+.5)/8});assert.equal(e.sourceMidis.length,3);assert.ok(e.sourceMidis.every(m=>[0,2,4,7,9].includes(m%12)));}f.loop.destroy();
});
test('direct taps select their actual segment and lane under rotated logical geometry',()=>{
 const objects=createStringSurfaces(),o=objects.create({kind:'strum',start:{x:100,y:100},end:{x:400,y:400}});
 for(const segment of stringSegments(o)){const p={x:segment.a.x*.25+segment.b.x*.75,y:segment.a.y*.25+segment.b.y*.75},hit=stringTap(o,p);assert.equal(hit.lane,segment.lane);assert.ok(Math.abs(hit.progress-.75)<1e-8);}
});
test('Strum tuning and swept crossing order reverse naturally and do not depend on event density',()=>{
 const f=fixture('strum');assert.deepEqual(f.o.capabilities.playable.surface.voices.map(v=>v[0][0]),STRING_TUNING);
 const a={x:200,y:20},b={x:200,y:180};assert.deepEqual(stringCrossings(f.o,a,b).map(h=>h.lane),[0,1,2,3]);assert.deepEqual(stringCrossings(f.o,b,a).map(h=>h.lane),[3,2,1,0]);
 const fine=new Set();for(let y=20;y<180;y++)for(const h of stringCrossings(f.o,{x:200,y},{x:200,y:y+1}))fine.add(h.lane);assert.deepEqual([...fine],[0,1,2,3]);assert.equal(stringCrossings(f.o,{x:0,y:160},{x:400,y:160}).length,0);f.loop.destroy();
});
test('manual tap records, autoplays once and repeats on shared Heartbeat phase',async()=>{
 const f=fixture();assert.equal(f.transport.state,'stopped');await f.loop.perform(f.o.id,[{lane:0,progress:.8}]);assert.equal(f.transport.state,'playing');assert.equal(f.plays(),1);assert.equal(f.objects.get(f.o.id).authoredState.recordedEvents.length,1);assert.equal(f.events[0].sourceMidi,74);
 for(let tick=0;tick<840;tick+=3)f.at(tick);assert.deepEqual(f.events.map(e=>e.eventTick),[48,432,816]);assert.equal(f.feedback.length,3);assert.equal(f.objects.get(f.o.id).authoredState.recordedEvents.length,1);f.loop.destroy();
});
for(const order of [[0,1,2,3],[3,2,1,0]])test('measured strum preserves direction in recorded playback '+order.join('-'),async()=>{
 const f=fixture('strum');await f.loop.perform(f.o.id,order.map((lane,i)=>({lane,progress:.5,delayMs:i*65})));const notes=f.objects.get(f.o.id).authoredState.recordedEvents;
 assert.deepEqual(notes.map(n=>n.lane),order);assert.ok(notes.every((n,i)=>!i||n.offsetTick>notes[i-1].offsetTick));
 for(let tick=0;tick<500;tick+=3)f.at(tick);assert.deepEqual(f.events.filter(e=>e.eventTick>=384).map(e=>e.lane),order);assert.equal(f.objects.get(f.o.id).authoredState.recordedEvents.length,4);f.loop.destroy();
});
test('same-cell manual repeats are admitted once and effectively instantaneous strums can be simultaneous',async()=>{
 const f=fixture('strum');await f.loop.perform(f.o.id,[0,1,2,3].map(lane=>({lane,progress:.5})),{instant:true});assert.equal(new Set(f.events.map(e=>e.eventTick)).size,1);
 await f.loop.perform(f.o.id,[{lane:0,progress:.5}]);assert.equal(f.objects.get(f.o.id).authoredState.recordedEvents.length,4);assert.equal(f.events.length,4);assert.equal(f.plays(),1);f.loop.destroy();
});
test('generic receiver-owned sound policy resolves instrument and voice without toy-kind dispatch',()=>{
 const f=fixture(),emitter=createBoardObject('ripple',{id:'r',authoredState:{instrument:'KALIMBA'}}),contact={lane:0,progress:.9};
 const event=resolveBoardInteraction(emitter,f.o,0,contact);assert.equal(event.instrument,'PIANO');assert.equal(event.sourceMidi,76);assert.equal(event.soundSource,'receiver');
 const generic={...f.o,kind:'future-receiver'};assert.deepEqual(resolveBoardInteraction(emitter,generic,0,contact),event);f.loop.destroy();
});
test('triggered lane/region sounds and animates but never records or starts its receiver transport',async()=>{
 const f=fixture('strum');const triggerClock={...f.transport,id:'trigger',state:'playing',currentTick:48,tickToAudioTime:t=>t/192};
 const loop=createStringSurfaceLoop({objects:f.objects,getTransport:()=>f.transport,getTriggerTransport:()=>triggerClock,schedule:e=>f.events.push(e)});let hits=0;loop.subscribe(()=>hits++);
 loop.trigger({receiverId:f.o.id,lane:2,progress:.3,eventTick:48,transportId:'trigger'});loop.tick();assert.equal(f.events[0].sourceMidi,72);assert.equal(hits,1);assert.equal(f.transport.state,'stopped');assert.equal(f.objects.get(f.o.id).authoredState.recordedEvents.length,0);loop.destroy();f.loop.destroy();
});
for(const kind of ['string','strum'])test('Ball swept capsule bounces and resolves receiver contact for '+kind,()=>{
 const objects=createStringSurfaces(),o=objects.create({kind,start:{x:0,y:100},end:{x:400,y:100},instrument:'PIANO'}),capture=simulateThrow({launch:{x:300,y:0,vx:0,vy:1600},cubes:[boardCollisionBody(o)]});
 assert.equal(capture.collisions.length,1);const hit=capture.collisions[0];assert.ok(Math.abs(hit.contact.progress-.75)<1e-8);assert.equal(hit.contact.lane,0);assert.ok(capture.trajectory.at(-1).vy<0);
 const emitter=createBoardObject('cannon',{id:'c',authoredState:{instrument:'KALIMBA'}}),event=resolveBoardInteraction(emitter,{id:o.id,capabilities:hit.receiverCapabilities},hit.timeSeconds,hit.contact);assert.equal(event.instrument,'PIANO');assert.equal(event.lane,0);
});
test('angled capsule contacts and end caps preserve Ball speed',()=>{
 const objects=createStringSurfaces(),o=objects.create({start:{x:0,y:0},end:{x:400,y:400}}),c=simulateThrow({launch:{x:200,y:-150,vx:0,vy:1600},cubes:[boardCollisionBody(o)]});assert.ok(c.collisions.length);const last=c.trajectory.at(-1);assert.ok(Math.abs(Math.hypot(last.vx,last.vy)-1600)<1e-6);
 const end=simulateThrow({launch:{x:-100,y:0,vx:1600,vy:0},cubes:[boardCollisionBody(o)]});assert.ok(end.collisions.length);
});
test('Ripple contacts each musical lane independently using shared receiver geometry',async()=>{
 const f=fixture('strum'),ripples=createRippleObjects(),emitter=ripples.create({x:200,y:-100});const contacts=waveReceiverContacts(emitter.transform,f.o);assert.equal(contacts.length,4);assert.ok(contacts.every(c=>Math.abs(c.contact.progress-.5)<1e-9));
 const wave={origin:emitter.transform,emitter,speed:100,triggeredReceiverIds:new Set()};assert.equal(crossedWaveReceivers(wave,[f.o],-1,400).length,4);assert.equal(crossedWaveReceivers(wave,[f.o],-1,400).length,0);
 const loop=createLoopingRippleController({objects:ripples,getReceivers:()=>f.objects.list(),getTransport:()=>f.transport,schedule:e=>f.loop.trigger(e)});await f.transport.play();for(let tick=0;tick<384;tick+=3){f.context.currentTime=f.transport.tickToAudioTime(tick);loop.tick();f.loop.tick();}
 assert.equal(f.events.length,4);assert.equal(f.objects.get(f.o.id).authoredState.recordedEvents.length,0);loop.destroy();f.loop.destroy();
});
test('Clear Pattern retains geometry/settings; JSON restore preserves identity and authored events only',async()=>{
 const f=fixture();await f.loop.perform(f.o.id,[{lane:0,progress:.2}]);f.objects.update(f.o.id,{volume:.3,periodLoops:3,mode:'chord'});const saved=JSON.parse(JSON.stringify(f.objects.snapshot()));f.objects.restore(saved);assert.deepEqual(f.objects.snapshot(),saved);const before=f.objects.get(f.o.id);f.loop.clearPattern(f.o.id);const after=f.objects.get(f.o.id);assert.deepEqual(after.transform,before.transform);assert.deepEqual(after.bounds,before.bounds);assert.equal(after.authoredState.instrument,'PIANO');assert.equal(after.authoredState.volume,.3);assert.equal(after.authoredState.periodLoops,3);assert.equal(after.authoredState.mode,'chord');assert.deepEqual(after.authoredState.recordedEvents,[]);f.loop.destroy();
});
test('pause, BPM and reset retain authored notes and shared clock phase',async()=>{
 const f=fixture();await f.loop.perform(f.o.id,[{lane:0,progress:.5}]);f.at(30);f.transport.pause();const count=f.events.length;f.context.currentTime+=2;f.loop.tick();assert.equal(f.events.length,count);assert.equal(f.loop.phase(f.o.id).tick,30);const saved=JSON.stringify(f.objects.snapshot());await f.transport.play();assert.equal(f.transport.currentTick,30);f.transport.setBpm(90);assert.equal(f.transport.currentTick,30);f.transport.returnToStart();assert.equal(f.loop.phase(f.o.id).tick,0);assert.equal(JSON.stringify(f.objects.snapshot()),saved);f.loop.destroy();
});
test('shared BoardObject movement/deletion cleans transport ports and releases receiver audio without child ownership',async()=>{
 const f=fixture('strum'),model=createConnectionModel();model.registerObject('heartbeat',{ports:HEARTBEAT_PORTS,transportId:'main'});const off=installRippleConnections({objects:f.objects,model,getHeartbeat:()=>({id:'heartbeat'})});
 const layer=createBoardObjectLayer({objects:createBoardPhysicalObjects(),containers:{list:()=>[],get:()=>null},strings:f.objects});const old=stringSegments(f.o);layer.move(f.o.id,500,700);const moved=stringSegments(layer.get(f.o.id));assert.ok(moved.every((s,i)=>s.b.x-s.a.x===old[i].b.x-old[i].a.x));assert.deepEqual(layer.get(f.o.id).owns,[]);
 await f.loop.perform(f.o.id,[{lane:0,progress:.5}]);layer.remove(f.o.id);assert.equal(layer.get(f.o.id),null);assert.equal(model.getObject(f.o.id),null);assert.ok(f.released.includes(f.o.id));off();f.loop.destroy();
});
test('malformed restore is rejected atomically',()=>{
 const f=fixture(),saved=f.objects.snapshot();assert.throws(()=>f.objects.restore([{...f.o,bounds:{length:NaN}}]));assert.deepEqual(f.objects.snapshot(),saved);assert.throws(()=>f.objects.restore([{...f.o,authoredState:{...f.o.authoredState,recordedEvents:[{id:'bad',offsetTick:3,lane:99,progress:2}]}}]));f.loop.destroy();
});

test('one shared fret definition drives both instruments, exact boundaries and rotated hit selection',()=>{
 const objects=createStringSurfaces();for(const kind of ['string','strum']){
  let o=objects.create({kind,start:{x:100,y:80},end:{x:400,y:480}});const surface=o.capabilities.playable.surface;
  assert.equal(surface.regions.length,8);
  for(const region of surface.regions){
   const progress=region.start,point=worldSegment(o,{a:{x:-o.bounds.length/2+progress*o.bounds.length,y:surface.segments[0].a.y},b:{x:0,y:0}}).a;
   assert.equal(surfaceRegionIndex(surface,progress),region.index);
   if(progress>0)assert.equal(surfaceRegionIndex(surface,progress-1e-8),region.index-1);
   assert.ok(Math.abs(stringTap(o,point).progress-progress)<1e-8);
   const voice=resolvePlayableActivation(o,0,{lane:0,progress});assert.equal(voice.region,region.index);assert.equal(voice.sourceMidi,[60,62,64,67,69,72,74,76][region.index]);
   if(kind==='strum')assert.deepEqual(surface.voices.map(v=>v[region.index][0]),[0,2,3,5].map(i=>[60,62,64,67,69,72,74,76,79,81,84,86,88][region.index+i]));
  }
  assert.equal(surfaceRegionIndex(surface,1),7);
  o=objects.update(o.id,{mode:'chord'});assert.equal(resolvePlayableActivation(o,0,{lane:0,progress:1/8}).sourceMidis.length,kind==='string'?3:1);
 }
});

test('single plucks use strict forward 48-tick Simple anchors; raw times never persist',async()=>{
 const f=fixture();await f.transport.play();f.at(17);await f.loop.perform(f.o.id,[{lane:0,progress:.1}]);assert.equal(f.events.at(-1).eventTick,48);
 const n=f.objects.get(f.o.id).authoredState.recordedEvents[0];assert.equal(n.offsetTick,48);assert.equal('delayMs' in n,false);assert.equal('offsetTicks' in n,false);f.loop.destroy();
});

for(const order of [[0,1,2,3],[3,2,1,0]])for(const spacing of [1,65,145])test(`gesture anchor and relative timing survive replay: ${order} / ${spacing}ms`,async()=>{
 const f=fixture('strum'),gesture=f.loop.beginGesture(f.o.id);const expected=order.map((_,i)=>48+Math.round(i*spacing*192/1000/12)*12);
 // Incremental samples share the original anchor even as the clock moves.
 for(let i=0;i<4;i++){await f.loop.perform(f.o.id,[{lane:order[i],progress:.1,delayMs:i*spacing}],{gesture});f.at(i*5);}
 assert.deepEqual(f.events.filter(e=>e.activationSource==='manual').map(e=>e.eventTick),expected);
 const notes=f.objects.get(f.o.id).authoredState.recordedEvents;assert.deepEqual(notes.map(n=>n.lane),order);assert.equal(new Set(notes.map(n=>n.gestureId)).size,1);assert.deepEqual(notes.map(n=>n.order),[0,1,2,3]);
 f.transport.setBpm(90);for(let t=20;t<600;t+=3)f.at(t);
 const replay=f.events.filter(e=>e.eventTick>=384);assert.deepEqual(replay.map(e=>e.lane),order);assert.deepEqual(replay.map(e=>e.eventTick),expected.map(t=>t+384));assert.equal(f.objects.get(f.o.id).authoredState.recordedEvents.length,4);f.loop.destroy();
});

test('standalone trigger is quantised to 48 ticks without recording; Ripple preserves lane offsets',async()=>{
 const f=fixture('strum');f.loop.trigger({receiverId:f.o.id,lane:1,progress:.1,eventTick:17,transportId:'main'});assert.equal(f.events[0].eventTick,48);assert.equal(f.objects.get(f.o.id).authoredState.recordedEvents.length,0);
 f.events.length=0;const ripples=createRippleObjects();ripples.create({x:20,y:-100});const ripple=createLoopingRippleController({objects:ripples,getReceivers:()=>f.objects.list(),getTransport:()=>f.transport,schedule:e=>f.loop.trigger(e)});
 await f.transport.play();for(let t=0;t<384;t+=3){f.context.currentTime=f.transport.tickToAudioTime(t);ripple.tick();f.loop.tick();}
 const hits=f.events.filter(e=>e.activationSource==='trigger');assert.deepEqual(hits.map(e=>e.lane),[0,1,2,3]);assert.equal(hits[0].eventTick%48,0);assert.ok(hits.every((e,i)=>!i||e.eventTick>hits[i-1].eventTick));assert.ok(hits.every(e=>e.eventTick%12===0));assert.equal(f.objects.get(f.o.id).authoredState.recordedEvents.length,0);ripple.destroy();f.loop.destroy();
});

test('late Ripple strum carries canonical offsets across the emitter cycle boundary',async()=>{
 const f=fixture('strum'),ripples=createRippleObjects();ripples.create({x:20,y:-580});
 const ripple=createLoopingRippleController({objects:ripples,getReceivers:()=>f.objects.list(),getTransport:()=>f.transport,schedule:e=>f.loop.trigger(e)});
 await f.transport.play();for(let t=0;t<450;t+=3){f.context.currentTime=f.transport.tickToAudioTime(t);ripple.tick();f.loop.tick();}
 assert.deepEqual(f.events.map(e=>e.eventTick),[384,396,408,420]);assert.deepEqual(f.events.map(e=>e.lane),[0,1,2,3]);assert.equal(f.objects.get(f.o.id).authoredState.recordedEvents.length,0);ripple.destroy();f.loop.destroy();
});

test('normal-side runways span the fret axis, rotate with both toys and leave authored geometry unchanged',()=>{
 const objects=createStringSurfaces();for(const kind of ['string','strum'])for(const end of [{x:400,y:0},{x:0,y:400},{x:240,y:320}]){
  const o=objects.create({kind,start:{x:0,y:0},end}),saved=JSON.stringify(o),zones=stringRunways(o),coarse=stringRunways(o,{coarse:true});
  const centers=zones.map(r=>worldSegment(o,{a:{x:0,y:r.y+r.height/2},b:{x:0,y:0}}).a),dx=centers[1].x-centers[0].x,dy=centers[1].y-centers[0].y,angle=o.transform.rotation;
  assert.ok(Math.abs(dx*Math.cos(angle)+dy*Math.sin(angle))<1e-8,'runway separation has no longitudinal component');
  assert.ok(-dx*Math.sin(angle)+dy*Math.cos(angle)>0,'runways separate along the rotated normal');
  assert.equal(zones.length,2);assert.equal(zones[0].width,400);assert.equal(zones[1].width,400);assert.equal(zones[0].x,-200);assert.equal(zones[1].x,-200);assert.ok(zones[0].y+zones[0].height<0&&zones[1].y>0);assert.equal(zones[0].height,kind==='strum'?147:120);assert.ok(coarse[0].height>zones[0].height);
  for(const r of zones){const local={x:r.x+r.width/2,y:r.y+r.height/2},p=worldSegment(o,{a:local,b:local}).a,hit=stringInputHit(o,p);assert.equal(hit.playable,false);assert.equal(hit.runway.normal,r.normal);}
  const r=zones[0],outside=worldSegment(o,{a:{x:r.x-1,y:0},b:{x:r.x-1,y:0}}).a;assert.equal(stringInputHit(o,outside),null);
  const touch=worldSegment(o,{a:{x:0,y:coarse[0].y+1},b:{x:0,y:0}}).a;assert.equal(stringInputHit(o,touch),null);assert.ok(stringInputHit(o,touch,{coarse:true}));
  assert.equal(JSON.stringify(o),saved);assert.deepEqual(objects.get(o.id),o);
 }
 const short=objects.create({start:{x:0,y:0},end:{x:60,y:0}});assert.equal(stringRunways(short)[0].height,120);
});

test('runway overlap priority is visible target, then playable surface, then selected/nearest/topmost runway',()=>{
 const objects=createStringSurfaces(),a=objects.create({start:{x:0,y:0},end:{x:400,y:0}}),b=objects.create({start:{x:0,y:8},end:{x:400,y:8}}),list=objects.list();
 assert.equal(chooseStringSurface(list,{x:100,y:0},{targetId:b.id}).object.id,b.id);
 assert.equal(chooseStringSurface(list,{x:100,y:-60}).object.id,a.id);
 assert.equal(chooseStringSurface(list,{x:100,y:-60},{selectedIds:new Set([b.id])}).object.id,b.id);
 assert.equal(chooseStringSurface(list,{x:100,y:4}).object.id,b.id);
 const c=objects.create({start:{x:0,y:-60},end:{x:200,y:-60}});assert.equal(chooseStringSurface(objects.list(),{x:100,y:-60},{selectedIds:new Set([b.id])}).object.id,c.id);
 assert.equal(chooseStringSurface(list,{x:-200,y:0}),null);
 assert.equal(stringInputHit(a,{x:-1,y:0}),null,'endpoint extensions no longer claim performance');assert.equal(chooseStringSurface(list,{x:-1,y:-60}),null);
});

test('first crossing, rather than runway pointer-down, anchors slow preparation on a running transport',async()=>{
 const f=fixture('strum');await f.transport.play();f.at(12);const before=JSON.stringify(f.objects.snapshot());
 // Preparation advances the shared clock but creates no recording or audio admission.
 f.at(270);assert.equal(f.events.length,0);assert.equal(JSON.stringify(f.objects.snapshot()),before);
 // The first swept intersection happened 20ms before its containing sample arrived.
 const gesture=f.loop.beginGesture(f.o.id,{elapsedMs:20});await f.loop.perform(f.o.id,[{lane:0,progress:.2,delayMs:0},{lane:1,progress:.4,delayMs:65},{lane:2,progress:.6,delayMs:130},{lane:3,progress:.8,delayMs:195}],{gesture});
 assert.deepEqual(f.events.map(e=>e.eventTick),[288,300,312,324]);assert.equal(f.objects.get(f.o.id).authoredState.recordedEvents.length,4);f.loop.destroy();
});

test('diagonal normal-axis sweeps retain each lane crossing position and fret under rotation',()=>{
 const objects=createStringSurfaces();for(const end of [{x:400,y:0},{x:0,y:400},{x:240,y:320}]){
  const o=objects.create({kind:'strum',start:{x:0,y:0},end}),a=worldSegment(o,{a:{x:-180,y:-100},b:{x:180,y:100}}),hits=stringCrossings(o,a.a,a.b);
  assert.deepEqual(hits.map(h=>h.lane),[0,1,2,3]);assert.ok(hits.every((h,i)=>!i||h.progress>hits[i-1].progress));
  const voices=hits.map(h=>resolvePlayableActivation(o,0,h));assert.ok(new Set(voices.map(v=>v.region)).size>1);
  for(const voice of voices)assert.equal(voice.sourceMidi,o.capabilities.playable.surface.voices[voice.lane][voice.region][0]);
  assert.deepEqual(stringCrossings(o,a.b,a.a).map(h=>h.lane),[3,2,1,0]);
 }
});
