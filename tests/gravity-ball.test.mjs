import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateThrow,predictCannonTrajectory,trajectoryState,boardLaunch,BALL_GRAVITY,BALL_LAUNCH_SPEED,GRAVITY_BOUNCE_RETENTION} from '../src/simple-bouncer-physics.js';
import {createStringSurfaces} from '../src/string-surface.js';
import {createDrumObjects} from '../src/simple-drum.js';
import {createBoardObject,resolveBoardInteraction} from '../src/board-object.js';
import {boardCollisionBody} from '../src/board-collision-body.js';
import {gravityTeachingFlight} from '../src/gravity-ball-teaching.js';

const launch=boardLaunch({x:0,y:0},{x:100,y:0});
const gravity=(options={})=>simulateThrow({launch,cubes:[],bpm:120,ballMode:'gravity',...options});

test('gravity uses the same launch convention and deterministic fixed steps, independent of rendering',()=>{
 const a=gravity(),b=gravity();assert.deepEqual(a,b);assert.equal(launch.vx,BALL_LAUNCH_SPEED);
 for(const p of a.trajectory){const seconds=p.tick/192;assert.ok(Math.abs(p.x-BALL_LAUNCH_SPEED*seconds)<1e-7);assert.ok(Math.abs(p.y-.5*BALL_GRAVITY*seconds**2)<1e-7);assert.ok(Math.abs(p.vy-BALL_GRAVITY*seconds)<1e-7);}
 const normal=simulateThrow({launch,cubes:[],bpm:120});assert.ok(normal.trajectory.every(p=>p.y===0));assert.ok(a.trajectory.at(-1).y>1000);
});

test('gravity retains swept Cube reflection, then continues accelerating downwards',()=>{
 const capture=gravity({launch:{x:0,y:0,vx:0,vy:840},cubes:[{id:'floor',x:0,y:200,width:200,height:20,sourceMidi:60}]});assert.ok(capture.collisions.length);
 const hit=capture.collisions[0],at=capture.trajectory.find(p=>Math.abs(p.tick-hit.timeSeconds*192)<1e-6);assert.ok(at.vy<0);assert.ok(Math.abs(at.vy+GRAVITY_BOUNCE_RETENTION*(840+BALL_GRAVITY*hit.timeSeconds))<3);
 const after=capture.trajectory.find(p=>p.tick>at.tick+10);assert.ok(after.vy>at.vy);
});

for(const kind of ['string','strum'])test(`gravity sweeps thin ${kind} geometry without tunnelling and selects receiver sound`,()=>{
 const objects=createStringSurfaces(),o=objects.create({kind,start:{x:-200,y:180},end:{x:200,y:180},instrument:'PIANO'}),body=boardCollisionBody(o);
 const capture=gravity({launch:{x:40,y:-100,vx:0,vy:9000},cubes:[body]});assert.ok(capture.collisions.length);const hit=capture.collisions[0];assert.equal(hit.cubeId,o.id);assert.ok(Math.abs(hit.contact.progress-.6)<1e-6);
 const emitter=createBoardObject('cannon',{id:'g',authoredState:{instrument:'KALIMBA',ballMode:'gravity'}}),event=resolveBoardInteraction(emitter,o,hit.timeSeconds,hit.contact);assert.equal(event.instrument,'PIANO');assert.equal(event.soundSource,'receiver');assert.equal(objects.get(o.id).authoredState.recordedEvents.length,0);
 const point=capture.trajectory.find(p=>Math.abs(p.tick-hit.timeSeconds*192)<1e-6);assert.ok(point.vy<0);
});

test('Drum collision uses receiver identity through the same capability resolver',()=>{
 const drums=createDrumObjects(),o=drums.create({x:0,y:200,instrument:'DRUM SNARE 1'}),capture=gravity({launch:{x:0,y:0,vx:0,vy:840},cubes:[boardCollisionBody(o)]});assert.ok(capture.collisions.length);
 const event=resolveBoardInteraction(createBoardObject('cannon',{id:'g',authoredState:{instrument:'KALIMBA'}}),o,capture.collisions[0].timeSeconds);assert.equal(event.instrument,'DRUM SNARE 1');assert.equal(drums.get(o.id).authoredState.pattern.authoredNotes.length,0);
});

for(const setup of ['empty','cube','string'])test(`preview and launched simulation have identical gravity paths: ${setup}`,()=>{
 const strings=createStringSurfaces(),o=strings.create({start:{x:250,y:100},end:{x:550,y:100}}),cubes=setup==='empty'?[]:setup==='cube'?[{id:'c',x:300,y:50,width:58,height:58,sourceMidi:60}]:[boardCollisionBody(o)],options={launch,cubes,bpm:120,bars:2,ballMode:'gravity'};
 assert.deepEqual(predictCannonTrajectory(options),simulateThrow(options).trajectory);assert.deepEqual(gravity({cubes,bars:2}).trajectory,simulateThrow(options).trajectory);
});

test('gravity lifetime and world fall limits terminate a flight instead of simulating indefinitely',()=>{
 const fall=gravity({launch:{x:0,y:0,vx:0,vy:0},bars:4,bpm:30});assert.equal(fall.termination,'bounds');assert.ok(fall.endTick<fall.durationTicks);assert.ok(fall.trajectory.length<1000);
 const life=gravity({launch:{x:0,y:0,vx:0,vy:-3000},bars:4,bpm:30});assert.equal(life.termination,'lifetime');assert.ok(Math.abs(life.endTick/48-8)<1e-8);
});

test('repeated floor bounces lose energy and settle with a finite collision count',()=>{
 const capture=gravity({launch:{x:0,y:0,vx:0,vy:0},cubes:[{id:'floor',x:0,y:200,width:1000,height:20,sourceMidi:60}],bars:4,bpm:60});assert.ok(capture.collisions.length>2);assert.ok(capture.collisions.length<128);assert.ok(['settled','lifetime'].includes(capture.termination));
 const up=capture.trajectory.filter((p,i,a)=>p.vy<0&&i&&a[i-1].vy>0).map(p=>Math.abs(p.vy));assert.ok(up.length>2);assert.ok(up.every((v,i)=>!i||v<up[i-1]));
});

test('gravity teaching arc comes from the shared simulation and bends toward its target',()=>{
 const {points,aim}=gravityTeachingFlight({x:80,y:180},{x:350,y:180});assert.ok(points.length>5);assert.ok(aim.y<180);assert.ok(points.some(p=>p.y<178));assert.ok(Math.abs(points.at(-1).x-350)<20);assert.ok(Math.abs(points.at(-1).y-180)<20);
});

test('live receiver edits resume gravity velocity from the current shared-clock position',()=>{
 const full=gravity(),tick=101,state=trajectoryState(full.trajectory,tick,120,BALL_GRAVITY),continued=gravity({launch:state,startTick:tick});
 assert.ok(Math.abs(state.vy-BALL_GRAVITY*tick/192)<1e-7);
 const a=full.trajectory.at(-1),b=continued.trajectory.at(-1);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<.1);
});
