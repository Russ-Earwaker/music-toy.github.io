import test from 'node:test';
import {drumRingPoint} from '../src/simple-drum-ring.js';
import assert from 'node:assert/strict';
import {createDrumObjects} from '../src/simple-drum.js';
import {createDrumSet,DRUM_SET_LAYOUT} from '../src/simple-drum-set.js';
import {createDrumLoopController} from '../src/simple-drum-loop.js';
import {createBoardObject,resolveBoardInteraction} from '../src/board-object.js';
import {createBoardPlayableController} from '../src/board-playable.js';
import {createLoopingRippleController} from '../src/simple-ripple-loop.js';
import {createRippleObjects} from '../src/simple-ripple.js';
import {createTickTransport} from '../src/tick-transport.js';
import {simulateThrow} from '../src/simple-bouncer-physics.js';
import {boardCollisionBody} from '../src/board-collision-body.js';
function fixture(period=1){
 const objects=createDrumObjects(),context={currentTime:0,state:'running'},events=[],hits=[],cancelled=[],released=[],plays=[];let connected=true,controller;
 const t=createTickTransport({id:'main',getContext:()=>context,emit:e=>{if(e.type==='play')plays.push({tick:e.positionTick,notes:objects.list().reduce((sum,o)=>sum+o.authoredState.pattern.authoredNotes.length,0)});controller?.transportChanged('main',e.type,e.fromState);}});
 controller=createDrumLoopController({objects,getTransport:()=>connected?t:null,schedule:e=>events.push(e),cancel:id=>cancelled.push(id),release:id=>released.push(id)});controller.subscribe(e=>hits.push(e));
 const drum=objects.create({periodLoops:period,instrument:'DRUM SNARE 1'});
 return {objects,drum,t,context,events,hits,cancelled,released,plays,controller,at(tick){context.currentTime=t.tickToAudioTime(tick);controller.tick();},connect(v){connected=v;controller.tick();}};
}
test('Drum Set is six ordinary well-spaced receivers with existing percussion assignments',()=>{
 const objects=createDrumObjects(),kit=createDrumSet(objects,{x:1000,y:-500});assert.equal(kit.length,6);assert.equal(new Set(kit.map(o=>o.id)).size,6);
 assert.deepEqual(kit.map(o=>o.authoredState.instrument),DRUM_SET_LAYOUT.map(d=>d.instrument));
 for(const a of kit){assert.equal(a.kind,'drum');assert.ok(a.capabilities.playable);assert.equal(a.capabilities.triggerReceiver.soundSource,'receiver');assert.deepEqual(a.owns,[]);for(const b of kit)if(a!==b)assert.ok(Math.hypot(a.transform.x-b.transform.x,a.transform.y-b.transform.y)>150);}
 const first=kit[0];objects.remove(first.id);assert.equal(objects.list().length,5);assert.ok(objects.list().every(o=>o.authoredState.pattern.authoredNotes.length===0));
});
for(let loops=1;loops<=4;loops++)test(`${loops}-loop Drum stores canonical slot and repeats with shared phase`,async()=>{
 const f=fixture(loops);await f.controller.activate(f.drum.id);assert.equal(f.t.state,'playing');assert.equal(f.events[0].eventTick,48);assert.equal(f.events[0].when,f.t.tickToAudioTime(48));
 const pattern=f.objects.get(f.drum.id).authoredState.pattern;assert.equal(pattern.steps,loops*8);assert.equal(pattern.authoredDurationTicks,loops*384);assert.deepEqual(pattern.authoredNotes.map(n=>n.col),[1]);
 for(let tick=0;tick<loops*384*2+60;tick+=6)f.at(tick);assert.deepEqual(f.events.map(e=>e.eventTick),[48,loops*384+48,loops*768+48]);assert.equal(f.hits.length,3);
});
test('same quantised slot is admitted once across taps, triggers, and loop lookahead',async()=>{
 const f=fixture();await f.controller.activate(f.drum.id);await f.controller.activate(f.drum.id);f.controller.trigger({receiverId:f.drum.id,when:f.t.tickToAudioTime(48)});f.at(30);
 assert.equal(f.events.length,1);assert.equal(f.objects.get(f.drum.id).authoredState.pattern.authoredNotes.length,1);f.at(48);assert.equal(f.hits.length,1);
});
test('end-slot quantisation wraps once to next cycle without an extra delayed beat',async()=>{
 const f=fixture();await f.t.play();f.at(375);await f.controller.activate(f.drum.id);assert.equal(f.events[0].eventTick,384);assert.equal(f.objects.get(f.drum.id).authoredState.pattern.authoredNotes[0].col,0);
 f.controller.trigger({receiverId:f.drum.id,when:f.t.tickToAudioTime(383)});assert.equal(f.events.length,1);f.at(384);assert.equal(f.hits.length,1);
});
test('pause freezes phase, BPM keeps ticks, Return to Start preserves pattern',async()=>{
 const f=fixture(2);await f.controller.activate(f.drum.id);f.at(60);f.t.pause();const phase=f.controller.phase(f.drum.id);f.context.currentTime+=10;f.controller.tick();assert.deepEqual(f.controller.phase(f.drum.id),phase);
 await f.t.play();f.t.setBpm(60);const before=f.t.currentTick;f.context.currentTime+=1;f.controller.tick();assert.equal(f.t.currentTick,before+96);
 f.t.returnToStart();assert.equal(f.controller.phase(f.drum.id).tick,0);assert.equal(f.objects.get(f.drum.id).authoredState.pattern.authoredNotes.length,1);
});
test('hit removal, period edit, instrument/volume updates affect canonical future playback',async()=>{
 const f=fixture(2);await f.controller.activate(f.drum.id);f.objects.update(f.drum.id,{instrument:'HI-HAT CLOSED',volume:0.2});f.at(40);assert.equal(f.events.at(-1).instrument,'HI-HAT CLOSED');assert.equal(f.events.at(-1).volume,0.2);
 f.controller.removeHit(f.drum.id,1);assert.equal(f.objects.get(f.drum.id).authoredState.pattern.authoredNotes.length,0);f.objects.update(f.drum.id,{periodLoops:4});assert.equal(f.objects.get(f.drum.id).authoredState.pattern.steps,32);
});
test('generic receiver policy selects Drum sound without kind checks; Cube keeps emitter sound',()=>{
 const emitter=createBoardObject('cannon',{id:'ball',authoredState:{instrument:'KALIMBA'}}),f=fixture();const future={...f.drum,kind:'future-pad'};
 assert.equal(resolveBoardInteraction(emitter,future,.5).instrument,'DRUM SNARE 1');assert.equal(resolveBoardInteraction(emitter,future,.5).sourceId,f.drum.id);
 assert.equal(resolveBoardInteraction(emitter,createBoardObject('cube',{authoredState:{pitch:67}}),.5).instrument,'KALIMBA');assert.equal(resolveBoardInteraction(emitter,createBoardObject('decorative-art'),.5),null);
});
test('Ripple through kit leaves patterns unchanged and uses its own sound with shared hit feedback',async()=>{
 const f=fixture();f.objects.remove(f.drum.id);const kit=createDrumSet(f.objects,{x:250,y:0}),ripples=createRippleObjects();const r=ripples.create({x:0,y:0,instrument:'PIANO'});await f.t.play();
 const ripple=createLoopingRippleController({objects:ripples,getReceivers:()=>f.objects.list(),getTransport:()=>f.t,schedule:e=>f.controller.trigger(e)});
 for(let tick=0;tick<384;tick+=6){f.context.currentTime=f.t.tickToAudioTime(tick);ripple.tick();f.controller.tick();}
 for(const o of kit){const current=f.objects.get(o.id);assert.equal(current.authoredState.pattern.authoredNotes.length,0);assert.ok(f.events.some(e=>e.sourceId===o.id&&e.instrument===o.authoredState.instrument));assert.ok(f.hits.some(e=>e.sourceId===o.id));}
 assert.ok(f.events.every(e=>e.instrument!=='PIANO'));ripple.destroy();
});
test('swept Ball circle collision retains receiver policy and survives very high speed',()=>{
 const f=fixture();f.objects.update(f.drum.id,{x:300,y:0});const body=boardCollisionBody(f.objects.get(f.drum.id));
 for(const vx of [840,100000]){const capture=simulateThrow({cubes:[body],launch:{x:0,y:0,vx,vy:0}});assert.equal(capture.collisions[0].cubeId,f.drum.id);assert.equal(capture.collisions[0].receiverCapabilities.triggerReceiver.soundSource,'receiver');assert.ok(capture.trajectory.some(p=>Math.abs(p.x-235)<1e-5));}
});
test('tapped generic playable and triggered activation share sound and feedback with manual-only recording',async()=>{
 const f=fixture();let admission;const playable=createBoardPlayableController({objects:f.objects,getTime:()=>0,perform:e=>{admission=f.controller.activate(e.sourceId);}});playable.activate(f.drum.id);await admission;f.controller.trigger({receiverId:f.drum.id,when:f.t.tickToAudioTime(96)});
 f.at(96);assert.deepEqual(f.events.map(e=>e.eventTick),[48,96]);assert.equal(f.hits.length,2);assert.deepEqual(f.objects.get(f.drum.id).authoredState.pattern.authoredNotes.map(n=>n.col),[1]);playable.destroy();
});
test('save/reload preserves period/pattern, omits runtime feedback, deletion releases only one Drum',async()=>{
 const f=fixture(4),other=f.objects.create();await f.controller.activate(f.drum.id);const saved=JSON.parse(JSON.stringify(f.objects.snapshot()));assert.equal(saved[0].authoredState.pattern.authoredNotes[0].col,1);assert.equal(saved[0].feedback,undefined);
 f.objects.restore(saved);assert.equal(f.objects.get(f.drum.id).authoredState.periodLoops,4);assert.equal(f.objects.get(f.drum.id).authoredState.pattern.authoredNotes.length,1);f.at(30);assert.ok(f.events.length>=2);
 f.objects.remove(f.drum.id);assert.ok(f.released.includes(f.drum.id));assert.ok(f.objects.get(other.id));
});
test('disconnect cancels pending notes and reconnect joins current phase without catch-up',async()=>{
 const f=fixture();await f.controller.activate(f.drum.id);f.controller.tick();f.connect(false);assert.ok(f.cancelled.includes(f.drum.id));f.at(500);const count=f.events.length;f.connect(true);assert.equal(f.events.length,count);f.at(790);assert.equal(f.events.at(-1).eventTick,816);
});
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Node,dom,walk} from './graph-ui-dom.mjs';
test('real circular ring projects canonical slots, playhead, Clear, and hit feedback',async()=>{
 const f=fixture(2),environment=dom(),world=new Node(),viewport=new Node();viewport.append(world);environment.document.body.append(viewport);let frame,animations=0;
 const oldQuery=Node.prototype.querySelectorAll,oldAnimate=Node.prototype.animate;Node.prototype.querySelectorAll=function(selector){return walk(this,n=>n!==this&&n.matches(selector));};Node.prototype.animate=()=>{animations++;return {cancel(){}};};
 const context={...environment,drumRingPoint,DRUM_SIZE:104,requestAnimationFrame:fn=>{frame=fn;return 1;},cancelAnimationFrame(){},setToyVolume(){},setToyMuted(){},syncVolumeUI(){},installVolumeUI(){},decorateCircularControl:n=>n,expressiveControl:n=>n,installTapOrDrag:()=>()=>{},getDisplayNameForId:i=>i,closeInstrumentPicker(){},setExpressiveControlsVisible(){}};vm.createContext(context);
 const source=readFileSync(new URL('../src/simple-drum-board.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace('export function installSimpleDrumBoard','function installSimpleDrumBoard');const install=vm.runInContext(source+';installSimpleDrumBoard',context);
 let board;try{
  board=install({objects:f.objects,controller:f.controller,getWorld:()=>world,getViewport:()=>viewport,screenToWorld:p=>p,unlock(){}});
  assert.equal(walk(world,n=>n.classList.contains('drum-slot')).length,16);
  await f.controller.activate(f.drum.id);assert.equal(walk(world,n=>n.classList.contains('has-hit')).length,1);
  f.at(48);frame();assert.equal(animations,2);assert.equal(walk(world,n=>n.classList.contains('drum-playhead'))[0].dataset.tick,'48');
  await f.controller.trigger({receiverId:f.drum.id,when:f.t.tickToAudioTime(96)});f.at(96);assert.equal(animations,3);assert.equal(walk(world,n=>n.classList.contains('has-hit')).length,1);
  walk(world,n=>n.classList.contains('drum-clear'))[0].onclick();assert.equal(f.objects.get(f.drum.id).authoredState.pattern.authoredNotes.length,0);assert.equal(walk(world,n=>n.classList.contains('has-hit')).length,0);assert.equal(walk(world,n=>n.classList.contains('drum-playhead')).length,1);
 }finally{board?.dispose();Node.prototype.querySelectorAll=oldQuery;Node.prototype.animate=oldAnimate;f.controller.destroy();}
});
import {seedTriggerCubes} from '../src/trigger-starter-cubes.js';
import {createBoardPhysicalObjects} from '../src/board-physical-objects.js';
test('usable Drum kit receivers prevent starter Cubes being scattered over the pads',()=>{
 const drums=createDrumObjects(),physical=createBoardPhysicalObjects();createDrumSet(drums,{x:0,y:0});assert.equal(seedTriggerCubes({objects:physical,center:{x:0,y:0},otherReceivers:drums.list()}).length,0);assert.equal(physical.list().length,0);
});
test('edits at an already-sounded grid boundary do not re-admit that attack',async()=>{
 const f=fixture();await f.controller.activate(f.drum.id);f.at(48);assert.equal(f.events.length,1);f.objects.update(f.drum.id,{volume:0.4});f.controller.tick();assert.equal(f.events.length,1);f.objects.update(f.drum.id,{instrument:'DRUM KICK'});f.controller.tick();assert.equal(f.events.length,1);
});
test('identical simultaneous Drum sounds share one voice while both patterns and animations remain independent',async()=>{
 const f=fixture(),other=f.objects.create({instrument:'DRUM SNARE 1'});await f.controller.activate(f.drum.id);await f.controller.activate(other.id);
 assert.equal(f.events.length,1);assert.equal(f.objects.get(f.drum.id).authoredState.pattern.authoredNotes.length,1);assert.equal(f.objects.get(other.id).authoredState.pattern.authoredNotes.length,1);
 f.at(48);assert.equal(f.hits.length,2);f.at(400);f.at(432);assert.equal(f.events.length,2);assert.equal(f.hits.length,4);
});
test('deleting shared voice owner transfers only the unstarted note to surviving Drum',async()=>{
 const f=fixture(),other=f.objects.create({instrument:'DRUM SNARE 1'});await f.t.play();f.controller.trigger({receiverId:f.drum.id,when:f.t.tickToAudioTime(48)});f.controller.trigger({receiverId:other.id,when:f.t.tickToAudioTime(48)});f.objects.remove(f.drum.id);assert.equal(f.events.length,2);assert.equal(f.events.at(-1).sourceId,other.id);assert.equal(f.events.at(-1).eventTick,48);assert.ok(f.cancelled.includes(f.drum.id));
});
test('paused Return to Start includes a stored downbeat when playback resumes',async()=>{
 const f=fixture();await f.t.play();f.at(375);await f.controller.activate(f.drum.id);f.at(384);f.t.pause();f.t.returnToStart();await f.t.play();f.controller.tick();assert.deepEqual(f.events.map(e=>e.eventTick),[384,0]);
});
test('ordinary pause and resume on a sounded boundary does not double that note',async()=>{
 const f=fixture();await f.controller.activate(f.drum.id);f.at(48);f.t.pause();await f.t.play();f.controller.tick();assert.equal(f.events.length,1);
});
test('stored downbeat is admitted on Play before the first periodic scheduler poll',async()=>{
 const f=fixture();f.objects.update(f.drum.id,{pattern:{authoredNotes:[{col:0,sourceMidi:60}]}});await f.t.play();assert.equal(f.events.length,1);assert.equal(f.events[0].eventTick,0);f.at(24);assert.equal(f.events.length,1);
});

for(let loops=1;loops<=4;loops++)test(loops+'-loop ring maps canonical ticks clockwise through full circumference',()=>{
 const total=loops*384;assert.deepEqual(drumRingPoint(0,loops),{x:64,y:6,angle:0});
 assert.ok(Math.abs(drumRingPoint(total/2,loops).y-122)<1e-8);
 assert.ok(Math.abs(drumRingPoint(total,loops).angle-Math.PI*2)<1e-8);
 for(let loop=0;loop<loops;loop++)assert.equal(drumRingPoint(loop*384,loops).angle,loop/loops*Math.PI*2);
});
test('explicit sources admit only manual events and persist only authored hits',async()=>{
 const f=fixture();await f.controller.activate(f.drum.id);await f.controller.trigger({receiverId:f.drum.id,when:f.t.tickToAudioTime(96)});f.at(96);
 assert.deepEqual(f.events.map(e=>e.activationSource),['manual','trigger']);assert.deepEqual(f.hits.map(e=>e.activationSource),['manual','trigger']);
 for(let tick=102;tick<=432;tick+=6)f.at(tick);assert.equal(f.events.at(-1).activationSource,'loopPlayback');
 const saved=f.objects.snapshot();assert.deepEqual(saved[0].authoredState.pattern.authoredNotes.map(n=>n.col),[1]);f.objects.restore(saved);assert.deepEqual(f.objects.get(f.drum.id).authoredState.pattern.authoredNotes.map(n=>n.col),[1]);
});
test('Clear preserves Drum settings and phase, prevents repeats, allows fresh taps',async()=>{
 const f=fixture(4);await f.controller.activate(f.drum.id);f.at(48);const before=f.objects.get(f.drum.id),phase=f.controller.phase(f.drum.id);f.controller.clearPattern(f.drum.id);const after=f.objects.get(f.drum.id);
 assert.deepEqual({...after.authoredState,pattern:null},{...before.authoredState,pattern:null});assert.deepEqual(after.transform,before.transform);assert.deepEqual(f.controller.phase(f.drum.id),phase);assert.equal(after.authoredState.pattern.authoredNotes.length,0);
 for(let tick=54;tick<=1600;tick+=6)f.at(tick);assert.equal(f.events.length,1);await f.controller.activate(f.drum.id);assert.equal(f.objects.get(f.drum.id).authoredState.pattern.authoredNotes.length,1);
});

test('Clear retains a quantised transient hit already waiting to sound',async()=>{
 const f=fixture();await f.controller.activate(f.drum.id);await f.controller.trigger({receiverId:f.drum.id,when:f.t.tickToAudioTime(96)});f.controller.clearPattern(f.drum.id);f.at(96);
 assert.deepEqual(f.hits.map(e=>[e.eventTick,e.activationSource]),[[96,'trigger']]);assert.equal(f.objects.get(f.drum.id).authoredState.pattern.authoredNotes.length,0);
});
test('manual admission after a transient at the same tick records once and promotes marker feedback',async()=>{
 const f=fixture();await f.t.play();await f.controller.trigger({receiverId:f.drum.id,when:f.t.tickToAudioTime(48)});await f.controller.activate(f.drum.id);f.at(48);
 assert.equal(f.events.length,1);assert.equal(f.hits[0].activationSource,'manual');assert.equal(f.objects.get(f.drum.id).authoredState.pattern.authoredNotes.length,1);
});

test('manual Drum admission records before autoplay, preserves phase/BPM and never restarts a running transport',async()=>{
 const f=fixture();f.t.setBpm(137);f.t.seekTick(121);assert.equal(f.plays.length,0);await f.controller.activate(f.drum.id);
 assert.equal(f.t.state,'playing');assert.deepEqual(f.plays,[{tick:121,notes:1}]);assert.equal(f.t.bpm,137);assert.equal(f.t.currentTick,121);assert.equal(f.events[0].eventTick,144);
 await f.controller.activate(f.drum.id);assert.equal(f.plays.length,1);assert.equal(f.events.length,1);assert.equal(f.objects.get(f.drum.id).authoredState.pattern.authoredNotes.length,1);
 f.t.pause();const pattern=structuredClone(f.objects.get(f.drum.id).authoredState.pattern);await f.controller.trigger({receiverId:f.drum.id,when:f.t.tickToAudioTime(192)});assert.equal(f.t.state,'paused');assert.equal(f.plays.length,1);assert.deepEqual(f.objects.get(f.drum.id).authoredState.pattern,pattern);f.controller.destroy();
});
test('a triggered Drum hit while stopped cannot start playback or author a pattern',async()=>{
 const f=fixture();await f.controller.trigger({receiverId:f.drum.id,when:0});assert.equal(f.t.state,'stopped');assert.equal(f.plays.length,0);assert.equal(f.events.length,1);assert.equal(f.events[0].activationSource,'trigger');assert.equal(f.objects.get(f.drum.id).authoredState.pattern.authoredNotes.length,0);f.controller.destroy();
});
