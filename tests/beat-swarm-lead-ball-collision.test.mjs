import test from 'node:test';
import assert from 'node:assert/strict';
import { sweepLeadBallCircle, reflectLeadBallVelocity } from '../src/beat-swarm/beat-swarm-lead-ball-collision.js';
import { createBeatSwarmLeadBallRuntime } from '../src/beat-swarm/beat-swarm-lead-ball.js';
for (const [label,from,to,center,radius] of [
 ['centred',{x:0,y:0},{x:200,y:0},{x:100,y:0},20],
 ['glancing',{x:0,y:15},{x:200,y:15},{x:100,y:0},20],
 ['high speed',{x:-10000,y:0},{x:10000,y:0},{x:100,y:0},20],
 ['initial overlap',{x:95,y:0},{x:110,y:0},{x:100,y:0},20],
]) test(label+' resolves the first contact and preserves energy',()=>{
 const hit=sweepLeadBallCircle(from,to,center,radius);assert.ok(hit);
 assert.ok(Math.abs(Math.hypot(hit.position.x-center.x,hit.position.y-center.y)-radius-.01)<1e-8);
 const velocity={x:1450,y:0};const out=reflectLeadBallVelocity(velocity,hit.normal);
 assert.ok(Math.abs(Math.hypot(out.x,out.y)-1450)<1e-8);
 assert.ok(out.x*hit.normal.x+out.y*hit.normal.y>=0);
 assert.deepEqual(sweepLeadBallCircle(from,to,center,radius),hit,'deterministic');
});
test('a near miss is not a hit',()=>assert.equal(sweepLeadBallCircle({x:0,y:21},{x:200,y:21},{x:100,y:0},20),null));
test('real ball runtime queues one contribution per enemy and visibly rebounds',()=>{
 globalThis.HTMLElement=class {};
 let tick=0;const collisions=[],notes=[],queued=[];
 const enemy={id:1,wx:1200,wy:450,hp:10,onboardingAsteroid:true};
 const runtime=createBeatSwarmLeadBallRuntime({getArenaCenterWorld:()=>({x:800,y:450}),getArenaRadius:()=>900,getPlayerWorld:()=>({x:962,y:450}),getEnemies:()=>[enemy],isWorldPointInsideGameplay:()=>true,getBeatClock:()=>({tickIndex:tick}),getNoteForWorld:()=> 'C4',onCollision:e=>collisions.push(e),playMotifNote:e=>notes.push(e),onHitQueued:e=>queued.push(e)});
 runtime.start({eventId:'fixture',ballCount:1,targetHitCount:8});
 runtime.update(.1);assert.equal(collisions.length,1);assert.equal(queued.length,1);assert.ok(collisions[0].velocity.x<0);assert.equal(notes.length,0,'audition remains quantized to shared clock');
 tick++;runtime.update(.1);assert.equal(notes.length,1);
 for(let i=0;i<100;i++){tick++;runtime.update(.1)}
 assert.equal(queued.length,1);assert.equal(notes.filter(e=>!e.loopPlayback).length,1);assert.equal(runtime.getSnapshot().hitCount,1);
 runtime.stop();delete globalThis.HTMLElement;
});

for(const scale of [.31,.46])test('world/logical contact aligns at camera scale '+scale,()=>{
 globalThis.HTMLElement=class {};
 const worldToLogical=p=>({x:800+(p.x-800)*scale,y:450+(p.y-450)*scale});
 const logicalToWorld=p=>({x:800+(p.x-800)/scale,y:450+(p.y-450)/scale});
 const enemy={id:1,wx:1200,wy:450,hp:10,onboardingAsteroid:true};let impact;
 const runtime=createBeatSwarmLeadBallRuntime({worldToLogical,logicalToWorld,getArenaCenterWorld:()=>({x:800,y:450}),getArenaRadius:()=>900,getPlayerWorld:()=>({x:962,y:450}),getEnemies:()=>[enemy],isWorldPointInsideGameplay:()=>true,getBeatClock:()=>({tickIndex:0}),getNoteForWorld:()=> 'C4',onCollision:e=>impact=e});
 runtime.start({eventId:'projection',ballCount:1,targetHitCount:8});runtime.update(.1);
 assert.ok(impact);const contact=worldToLogical(impact.at),target=worldToLogical({x:enemy.wx,y:enemy.wy});
 assert.ok(Math.abs(Math.hypot(contact.x-target.x,contact.y-target.y)-71.01)<1e-6);
 assert.ok(Math.abs(Math.hypot(impact.velocity.x,impact.velocity.y)-1450)<1e-6);
 runtime.stop();delete globalThis.HTMLElement;
});
