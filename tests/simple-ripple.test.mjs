import test from 'node:test';
import assert from 'node:assert/strict';
import {createRippleObjects,createSimpleRippleController,RIPPLE_RANGE,RIPPLE_SPEED} from '../src/simple-ripple.js';
import {createBoardObject,resolveBoardInteraction} from '../src/board-object.js';
import {waveReceiverDistance,crossedWaveReceivers} from '../src/board-wave.js';
import {createBoardPhysicalObjects} from '../src/board-physical-objects.js';
import {simulateThrow} from '../src/simple-bouncer-physics.js';
import {bouncerGridState} from '../src/simple-bouncer.js';
import {createBoardObjectLayer} from '../src/board-object-layer.js';

const receiver=(id,x,y=0,pitch=60)=>createBoardObject('cube',{id,transform:{x,y},bounds:{width:58,height:58},authoredState:{pitch}});
test('LAN HTTP without randomUUID can create, emit and reload unique Ripple IDs',t=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 t.mock.method(Date,'now',()=>123456789);
 t.mock.method(Math,'random',()=>0.5);
 try{
  for(const cryptoValue of [{},undefined]){
   Object.defineProperty(globalThis,'crypto',{configurable:true,value:cryptoValue});
   const objects=createRippleObjects(),other=createRippleObjects(),events=[];
   const a=objects.create({x:20,y:30}),b=objects.create(),c=other.create();
   assert.equal(new Set([a.id,b.id,c.id]).size,3);assert.match(a.id,/^ripple-[a-z0-9-]+$/i);
   assert.ok(createBoardObject('decorative-art').id);
   const controller=createSimpleRippleController({objects,getReceivers:()=>[receiver('shared',100,30)],getClock:()=>({audioTime:0,currentTick:0,bpm:120}),schedule:event=>events.push(event)});
   controller.emit(a.id);assert.equal(events.length,1);assert.equal(events[0].instrument,'ACOUSTIC GUITAR');
   const saved=JSON.parse(JSON.stringify(objects.snapshot()));objects.restore(saved);assert.deepEqual(objects.snapshot(),saved);
   assert.notEqual(objects.create().id,a.id);controller.destroy();
  }
 }finally{if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);else delete globalThis.crypto;}
});
function fixture(receivers=[receiver('shared',300)]){
 const objects=createRippleObjects(),scheduled=[],cancelled=[];
 let time=10;
 const controller=createSimpleRippleController({objects,getReceivers:()=>receivers,getClock:()=>({audioTime:time,currentTick:384,bpm:120}),schedule:event=>scheduled.push(event),cancel:id=>cancelled.push(id)});
 return {objects,controller,scheduled,cancelled,advance:seconds=>{time+=seconds;},destroy:()=>controller.destroy()};
}

test('Ripple is a canonical authored emitter and shares the board registry',()=>{
 const f=fixture(),layer=createBoardObjectLayer({objects:createBoardPhysicalObjects(),containers:{list:()=>[],get:()=>null},ripples:f.objects});
 const ripple=layer.create('ripple',{x:12,y:-40});assert.equal(ripple.kind,'ripple');
 assert.deepEqual(Object.keys(ripple.capabilities),['draggable','triggerEmitter','instrumentSource']);assert.equal(ripple.capabilities.instrumentSource.instrumentId,'ACOUSTIC GUITAR');
 layer.move(ripple.id,200,300);assert.deepEqual(layer.get(ripple.id).transform,{x:200,y:300,rotation:0});f.destroy();
});

test('arrival is robust across skipped frames and one receiver triggers once per wave',()=>{
 const r=receiver('near',200),wave={id:'wave',emitter:createBoardObject('ripple',{authoredState:{instrument:'PIANO'}}),origin:{x:0,y:0},speed:RIPPLE_SPEED,triggeredReceiverIds:new Set()};
 assert.equal(crossedWaveReceivers(wave,[r],0,170).length,0);
 const events=crossedWaveReceivers(wave,[r],170,600);assert.equal(events.length,1);assert.equal(events[0].timeSeconds,171/RIPPLE_SPEED);
 assert.equal(crossedWaveReceivers(wave,[r],0,720).length,0);assert.deepEqual([...wave.triggeredReceiverIds],['near']);
});

test('wave geometry uses authored bounds, rotation and radius; origin overlap is included',()=>{
 assert.equal(waveReceiverDistance({x:0,y:0},receiver('r',200)),171);
 const circle={...receiver('c',100),bounds:{radius:20}};assert.equal(waveReceiverDistance({x:0,y:0},circle),80);
 const rotated={...receiver('rotated',100),bounds:{width:100,height:20},transform:{x:100,y:0,rotation:Math.PI/2}};
 assert.ok(Math.abs(waveReceiverDistance({x:0,y:0},rotated)-90)<1e-8);
 const f=fixture([receiver('at-origin',0)]),r=f.objects.create();assert.equal(f.controller.emit(r.id).events[0].timeSeconds,0);f.destroy();
});

test('future non-Cube receiver works and decorative Art is ignored without exclusions',()=>{
 const painted={...receiver('painted',150,0,67),kind:'painted-shape'};
 const art=createBoardObject('decorative-art',{id:'art',transform:{x:100,y:0}});
 const f=fixture([art,painted]),r=f.objects.create();const result=f.controller.emit(r.id);
 assert.equal(result.events.length,1);assert.equal(result.events[0].receiverId,'painted');assert.equal(result.events[0].sourceMidi,67);f.destroy();
});

test('events are scheduled in radial arrival order with exact canonical tick times, without RAF',()=>{
 const f=fixture([receiver('far',600),receiver('near',100),receiver('middle',300)]),r=f.objects.create();
 const {events}=f.controller.emit(r.id);assert.deepEqual(events.map(e=>e.receiverId),['near','middle','far']);
 for(const e of events){assert.equal(e.when,10+e.timeSeconds);assert.equal(e.eventTick,384+e.timeSeconds*192);}
 assert.equal(f.scheduled.length,3);f.controller.visibleWaves(11);f.controller.visibleWaves(11.5);assert.equal(f.scheduled.length,3);f.destroy();
});

test('independent waves retrigger and two emitters own different instruments for the same receiver',()=>{
 const f=fixture(),a=f.objects.create({instrument:'PIANO'}),b=f.objects.create({instrument:'KALIMBA'});
 const first=f.controller.emit(a.id),second=f.controller.emit(a.id),third=f.controller.emit(b.id);
 assert.notEqual(first.id,second.id);assert.deepEqual(f.scheduled.map(e=>[e.receiverId,e.sourceMidi,e.instrument]),[['shared',60,'PIANO'],['shared',60,'PIANO'],['shared',60,'KALIMBA']]);
 f.objects.update(a.id,{instrument:'KALIMBA'});assert.equal(f.controller.emit(a.id).events[0].instrument,'KALIMBA');assert.equal(first.events[0].instrument,'PIANO');f.destroy();
});

test('Cannon and Ripple resolve the same Cube pitch using their own instrument',()=>{
 const physical=createBoardPhysicalObjects(),cube=physical.addCube(300,0,{sourceMidi:67});
 const capture=simulateThrow({cubes:physical.list('cube'),launch:{x:0,y:0,vx:420,vy:0}});
 const cannonMusic=bouncerGridState(capture,'cannon','KALIMBA');assert.equal(cannonMusic.instrument,'KALIMBA');assert.equal(cannonMusic.authoredNotes[0].sourceMidi,67);
 const f=fixture([cube.boardObject]),r=f.objects.create({instrument:'PIANO'}),event=f.controller.emit(r.id).events[0];
 const direct=resolveBoardInteraction(r,cube.boardObject,event.timeSeconds);assert.equal(event.instrument,direct.instrument);assert.equal(event.sourceMidi,cannonMusic.authoredNotes[0].sourceMidi);assert.equal(cube.instrument,undefined);f.destroy();
});

test('movement affects next wave; current wave geometry and timbre stay latched',()=>{
 const f=fixture(),r=f.objects.create();const first=f.controller.emit(r.id).events[0];
 f.objects.update(r.id,{x:200,instrument:'KALIMBA'});const second=f.controller.emit(r.id).events[0];
 assert.ok(second.timeSeconds<first.timeSeconds);assert.equal(first.instrument,'ACOUSTIC GUITAR');assert.equal(second.instrument,'KALIMBA');assert.equal(f.controller.visibleWaves()[0].origin.x,0);f.destroy();
});

test('range limits apply to bounds and deleting emitter preserves receivers and cancels future audio',()=>{
 const shared=receiver('shared',300),f=fixture([shared,receiver('outside',RIPPLE_RANGE+60)]),r=f.objects.create();
 assert.equal(f.controller.emit(r.id).events.length,1);assert.equal(f.controller.visibleWaves().length,1);
 f.objects.remove(r.id);assert.equal(f.controller.visibleWaves().length,0);assert.ok(f.cancelled.includes(r.id));assert.equal(shared.capabilities.pitchSource.midi,60);f.destroy();
});

test('save/reload keeps IDs, geometry, sound state and discards transient wave data',()=>{
 const f=fixture(),r=f.objects.create({x:40,y:70,instrument:'KALIMBA'});f.objects.update(r.id,{volume:0.4,muted:true});f.controller.emit(r.id);
 const saved=JSON.parse(JSON.stringify(f.objects.snapshot()));assert.equal(saved[0].owns.length,0);assert.deepEqual(saved[0].references,{cubeIds:[],triggerIds:[]});
 saved[0].waves=[{radius:500}];saved[0].authoredState.hover=true;
 f.objects.restore(saved);assert.equal(f.controller.visibleWaves().length,0);assert.equal(f.objects.get(r.id).authoredState.hover,undefined);assert.equal(f.objects.get(r.id).waves,undefined);
 assert.equal(f.objects.get(r.id).authoredState.volume,0.4);assert.equal(f.objects.get(r.id).authoredState.muted,true);assert.equal(f.objects.get(r.id).id,r.id);
 assert.equal(f.objects.get(r.id).capabilities.instrumentSource.instrumentId,'KALIMBA');f.objects.restore([]);assert.equal(f.objects.list().length,0);f.destroy();
});

test('invalid restore is atomic and completed runtime waves expire naturally',()=>{
 const f=fixture(),r=f.objects.create();f.controller.emit(r.id);assert.throws(()=>f.objects.restore([{id:r.id,kind:'ripple',version:1,transform:{x:NaN,y:0}}]));assert.ok(f.objects.get(r.id));
 f.advance(RIPPLE_RANGE/RIPPLE_SPEED+0.01);assert.equal(f.controller.visibleWaves().length,0);f.destroy();
});
