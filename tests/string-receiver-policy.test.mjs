import test from 'node:test';
import assert from 'node:assert/strict';
import {createStringSurfaces,stringSegments,stringTap} from '../src/string-surface.js';
import {createStringSurfaceLoop} from '../src/string-surface-loop.js';
import {resolvePlayableActivation,resolveBoardInteraction,createBoardObject} from '../src/board-object.js';
import {boardCollisionBody} from '../src/board-collision-body.js';
import {simulateThrow} from '../src/simple-bouncer-physics.js';
import {createRippleObjects} from '../src/simple-ripple.js';
import {createLoopingRippleController} from '../src/simple-ripple-loop.js';

const clock=()=>({id:'main',state:'playing',currentTick:48,bpm:120,tickToAudioTime:t=>t/192,audioTimeToTick:t=>t*192});
const wrong={sourceMidi:12,sourceMidis:[12,13,14],region:0,instrument:'WRONG TRIGGER',volume:1};
const musical=e=>({notes:e.sourceMidis,instrument:e.instrument,volume:e.volume,lane:e.lane,region:e.region});

for(const kind of ['string','strum'])for(const mode of kind==='string'?['note','chord']:['note'])test(`${kind}/${mode}: every fret and lane uses manual lookup for raw trigger contacts and ignores trigger pitch`,()=>{
 const objects=createStringSurfaces(),o=objects.create({kind,mode,start:{x:350,y:230},end:{x:590,y:550},instrument:'PIANO',volume:.31}),t=clock(),events=[],feedback=[];
 const loop=createStringSurfaceLoop({objects,getTransport:()=>t,schedule:e=>events.push(e)});loop.subscribe(e=>feedback.push(e));let serial=0;
 for(const lane of stringSegments(o))for(let region=0;region<8;region++){
  const progress=(region+.5)/8,position={x:lane.a.x+(lane.b.x-lane.a.x)*progress,y:lane.a.y+(lane.b.y-lane.a.y)*progress},manual=resolvePlayableActivation(o,0,stringTap(o,position));
  for(const emitter of ['Ball','Gravity Ball','Ripple','future trigger']){
   const at=48*(++serial),trigger=loop.trigger({...wrong,receiverId:o.id,eventTick:at,contact:{position},emitterId:emitter});assert.deepEqual(musical(trigger),musical(manual));
  }
 }
 t.currentTick=48*(serial+1);loop.tick();assert.equal(feedback.length,events.length);assert.ok(feedback.every((e,i)=>e.lane===events[i].lane&&e.region===events[i].region));assert.equal(objects.get(o.id).authoredState.recordedEvents.length,0);loop.destroy();
});

for(const ballMode of ['normal','gravity'])test(`${ballMode} Ball: impact before Strum-band separation preserves all four musical lanes`,()=>{
 const objects=createStringSurfaces(),o=objects.create({kind:'strum',start:{x:300,y:200},end:{x:700,y:200},instrument:'PIANO'});
 for(const lane of stringSegments(o))for(const progress of [.08,.43,.9]){
  const point={x:lane.a.x+(lane.b.x-lane.a.x)*progress,y:lane.a.y},capture=simulateThrow({ballMode,launch:{...point,vx:0,vy:lane.lane<2?100:-100},cubes:[boardCollisionBody(o)]}),hit=capture.collisions[0];assert.ok(hit);assert.equal(hit.contact.lane,lane.lane);assert.ok(Math.abs(hit.contact.progress-progress)<1e-8);
  const event=resolveBoardInteraction(createBoardObject('cannon',{id:'c',authoredState:{instrument:'WRONG TRIGGER'}}),o,0,{...hit.contact,...wrong});assert.deepEqual(musical(event),musical(resolvePlayableActivation(o,0,stringTap(o,point))));
 }
});

for(const ballMode of ['normal','gravity'])test(`${ballMode} Ball: falling contacts across String frets preserve receiver notes and chords`,()=>{
 const objects=createStringSurfaces();for(const mode of ['note','chord']){const o=objects.create({mode,start:{x:300,y:200},end:{x:700,y:200},instrument:'PIANO',volume:.23});
  for(let i=0;i<8;i++){const x=300+(i+.5)*50,capture=simulateThrow({ballMode,launch:{x,y:0,vx:0,vy:840},cubes:[boardCollisionBody(o)]}),hit=capture.collisions[0],manual=resolvePlayableActivation(o,0,{lane:0,progress:(i+.5)/8});assert.ok(hit);assert.deepEqual(musical(resolvePlayableActivation(o,0,{...wrong,contact:hit.contact})),musical(manual));}
 }
});

test('current receiver settings and local contact remain authoritative after settings edits and movement',()=>{
 const objects=createStringSurfaces(),o=objects.create({start:{x:300,y:200},end:{x:700,y:200},instrument:'KALIMBA'}),t=clock(),events=[],loop=createStringSurfaceLoop({objects,getTransport:()=>t,schedule:e=>events.push(e)});
 const old=resolvePlayableActivation(o,0,{lane:0,progress:.2});objects.update(o.id,{mode:'chord',instrument:'PIANO',volume:.17,x:900,y:700});
 const event=loop.trigger({...old,...wrong,receiverId:o.id,eventTick:48}),current=resolvePlayableActivation(objects.get(o.id),0,{lane:0,progress:.2});assert.deepEqual(musical(event),musical(current));assert.equal(event.sourceMidis.length,3);assert.equal(event.volume,.17);assert.equal(objects.get(o.id).authoredState.recordedEvents.length,0);loop.destroy();
});

test('Ripple resolves a discovered contact against current receiver settings at admission',()=>{
 const objects=createStringSurfaces(),o=objects.create({start:{x:300,y:200},end:{x:700,y:200},instrument:'KALIMBA'}),ripples=createRippleObjects(),r=ripples.create({x:375,y:0,instrument:'WRONG TRIGGER'}),t=clock(),events=[];
 t.currentTick=0;const ripple=createLoopingRippleController({objects:ripples,getReceivers:()=>objects.list(),getTransport:()=>t,schedule:e=>events.push(e)});ripple.tick();objects.update(o.id,{mode:'chord',instrument:'PIANO',volume:.19});t.currentTick=132;ripple.tick();assert.equal(events.length,1);
 assert.deepEqual(musical(events[0]),musical(resolvePlayableActivation(objects.get(o.id),0,{lane:0,progress:75/400})));assert.equal(objects.get(o.id).authoredState.recordedEvents.length,0);ripple.destroy();
});

test('receiver edits replace queued trigger audio once while retaining its tick, geometry and feedback',()=>{
 const objects=createStringSurfaces(),o=objects.create({start:{x:300,y:200},end:{x:700,y:200},instrument:'KALIMBA'}),t=clock(),active=[],feedback=[];let cancellations=0;
 const loop=createStringSurfaceLoop({objects,getTransport:()=>t,schedule:e=>active.push(e),cancel:id=>{cancellations++;for(let i=active.length-1;i>=0;i--)if(active[i].sourceId===id)active.splice(i,1);}});loop.subscribe(e=>feedback.push(e));
 loop.trigger({...wrong,receiverId:o.id,eventTick:96,contact:{position:{x:375,y:200}}});assert.equal(active.length,1);assert.deepEqual(active[0].sourceMidis,[62]);
 objects.update(o.id,{mode:'chord',instrument:'PIANO',volume:.11});assert.equal(cancellations,1);assert.equal(active.length,1);assert.equal(active[0].eventTick,96);assert.equal(active[0].region,1);assert.deepEqual(active[0].sourceMidis,[62,67,72]);assert.equal(active[0].instrument,'PIANO');assert.equal(active[0].volume,.11);
 t.currentTick=96;loop.tick();loop.tick();assert.equal(feedback.length,1);assert.deepEqual(musical(feedback[0]),musical(active[0]));assert.equal(objects.get(o.id).authoredState.recordedEvents.length,0);loop.destroy();
});
