import test from 'node:test';
import assert from 'node:assert/strict';
import { updateBeatSwarmPickupsAndCombatRuntime } from '../src/beat-swarm/beat-swarm-pickups-combat.js';
import { updatePickupsAndCombatRuntimeWrapper } from '../src/beat-swarm/beat-swarm-pickups-combat-wrapper.js';
import { BASELINE_STRAIGHT_SHOT_TRAVEL } from '../src/beat-swarm/beat-swarm-projectile-travel.js';
function scene(width,height,enemies=[]){
 const shots=[{wx:500,wy:100,vx:1100,vy:0,ttl:1.9,collisionGraceT:0,kind:'standard',damage:1,el:{style:{},remove(){}}}];const removals=[];let camera=0,hits=0;
 return {shots,removals,get hits(){return hits;},tick(dt){camera+=53;updateBeatSwarmPickupsAndCombatRuntime({constants:{projectileHitRadiusLogical:10},state:{dt,projectiles:shots,enemies,suppressWeaponRuntime:true},helpers:{getViewportCenterWorld:()=>({x:camera,y:100}),worldToLogical:p=>({x:p.x-camera,y:p.y}),worldToScreen:p=>({x:p.x*width/1600,y:p.y*height/900}),isWorldPointInsideGameplay:()=>false,recordProjectileRemovalDiagnostic:e=>removals.push(e),withDamageSoundStage:(_,fn)=>fn(),damageEnemy:()=>hits++}});}};
}
test('authored 1100 speed / 1.9 lifetime yields 2090 world travel at all sizes and moving cameras',()=>{
 assert.equal(BASELINE_STRAIGHT_SHOT_TRAVEL,2090);
 for(const [w,h] of [[1600,900],[1920,1080],[1000,900]])for(const dt of [1/60,.05,.17]){
 const f=scene(w,h);for(let i=0;i<200&&f.shots.length;i++)f.tick(dt);
 assert.equal(f.removals.length,1);const r=f.removals[0];assert.equal(r.removalReason,'max_range');assert.ok(Math.abs(r.distanceTravelled-2090)<1e-8);assert.ok(Math.abs(r.worldPosition.x-r.spawnWorld.x-2090)<1e-8);
 }
});
test('wx/wy collision objects retain their positions; unobstructed shots do not falsely collide',()=>{
 const f=scene(1600,900,[{id:1,wx:550,wy:500,hp:2}]);for(let i=0;i<40&&f.shots.length;i++)f.tick(.05);assert.equal(f.hits,0);assert.equal(f.removals[0].removalReason,'max_range');
});
test('straight shots still hit targets between frame endpoints',()=>{
 const f=scene(1600,900,[{id:1,wx:550,wy:100,hp:2}]);f.tick(.1);assert.equal(f.hits,1);assert.equal(f.removals[0].removalReason,'collision');
});
test('combat wrapper forwards the removal diagnostic callback',()=>{
 const record=()=>{};let actual;updatePickupsAndCombatRuntimeWrapper({helpers:{recordProjectileRemovalDiagnostic:record,updateBeatSwarmPickupsAndCombatRuntime:o=>actual=o}});assert.equal(actual.helpers.recordProjectileRemovalDiagnostic,record);
});
