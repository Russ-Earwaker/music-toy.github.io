import test from 'node:test';
import assert from 'node:assert/strict';
import {simpleShapes,shapeBounds,shapeDefinition,shapeClip,shapePreviewGeometry} from '../src/simple-shapes.js';
import {createBoardPhysicalObjects} from '../src/board-physical-objects.js';
import {boardCollisionBody} from '../src/board-collision-body.js';
import {simulateThrow} from '../src/simple-bouncer-physics.js';
import {bouncerGridState} from '../src/simple-bouncer.js';
import {createBoardObject,resolveBoardInteraction} from '../src/board-object.js';
import {waveReceiverDistance} from '../src/board-wave.js';
import {createRippleObjects,createSimpleRippleController} from '../src/simple-ripple.js';
import {PRESETS,canCreateShape} from '../src/runtime-config.js';

test('six metadata geometries share actual visual extents and preset availability',()=>{
 assert.deepEqual(simpleShapes.map(s=>[s.id,s.label]),[['cube','Cube'],['circle','Circle'],['triangle','Triangle'],['diamond','Diamond'],['hexagon','Hex'],['star','Star']]);
 for(const shape of simpleShapes){
  assert.equal(canCreateShape(shape.id,PRESETS.simplePlaytest),true);
  assert.ok(shapePreviewGeometry(shape.id));assert.ok(shapeClip(shape.id));
  const bounds=shapeBounds(shape.id);
  if(shape.geometry==='circle')assert.deepEqual(bounds,{radius:29});
  else{assert.equal(bounds.width,58);assert.equal(bounds.height,58);}
  if(bounds.polygon){
   assert.equal(Math.max(...bounds.polygon.map(p=>p.x))-Math.min(...bounds.polygon.map(p=>p.x)),58);
   assert.equal(Math.max(...bounds.polygon.map(p=>p.y))-Math.min(...bounds.polygon.map(p=>p.y)),58);
  }
 }
 assert.throws(()=>shapeDefinition('invented'));assert.equal(canCreateShape('invented'),false);
});

for(const {id:shapeType} of simpleShapes){
 test(`${shapeType}: authored save/reload, movement, deletion, neutral receiver and Cube pitch policy`,()=>{
  const store=createBoardPhysicalObjects(),a=store.addCube(200,0,{shapeType,instrument:'PIANO'}),defaultCube=createBoardPhysicalObjects().addCube(0,0);
  assert.equal(a.kind,'cube');assert.equal(a.sourceMidi,defaultCube.sourceMidi);
  assert.equal(a.boardObject.capabilities.pitchSource.midi,a.sourceMidi);
  assert.ok(a.boardObject.capabilities.triggerReceiver);assert.ok(a.boardObject.capabilities.draggable);
  assert.equal(a.boardObject.capabilities.physicsBody.shape,shapeDefinition(shapeType).geometry);
  assert.equal(a.instrument,undefined);assert.equal(a.boardObject.capabilities.instrumentSource,undefined);
  store.update(a.id,{x:220,y:30,drag:true,collisionFlash:1,instrument:'BELL'});
  const saved=JSON.parse(JSON.stringify(store.authoredSnapshot()));assert.equal(saved[0].shapeType,shapeType);
  for(const key of ['instrument','drag','collisionFlash','captureId'])assert.equal(key in saved[0],false);
  const restored=createBoardPhysicalObjects();restored.restore(saved);
  assert.deepEqual(restored.authoredSnapshot(),saved);assert.equal(restored.get(a.id).shapeType,shapeType);
  assert.deepEqual(restored.get(a.id).boardObject.bounds,a.boardObject.bounds);
  assert.equal(restored.get(a.id).x,220);assert.equal(restored.remove(a.id),true);assert.equal(restored.list().length,0);
 });
 for(const ballMode of ['normal','gravity'])test(`${shapeType}: ${ballMode} swept collision owns pitch and receives emitter timbre`,()=>{
  const store=createBoardPhysicalObjects(),shape=store.addCube(200,ballMode==='gravity'?20:0,{shapeType,sourceMidi:73});
  const launch={x:0,y:0,vx:840,vy:0},capture=simulateThrow({cubes:store.list('cube'),launch,ballMode});
  assert.ok(capture.collisions.length,shapeType);assert.equal(capture.collisions[0].cubeId,shape.id);
  assert.equal(capture.collisions[0].sourceMidi,73);assert.ok(capture.trajectory.every(p=>[p.x,p.y,p.vx,p.vy].every(Number.isFinite)));
  const state=bouncerGridState(capture,'test-cannon','PIANO');assert.equal(state.instrument,'PIANO');assert.equal(state.authoredNotes[0].sourceMidi,73);
  // The same flight works when called with a generic BoardObject collision body.
  const body=boardCollisionBody(shape.boardObject),adapted=simulateThrow({cubes:[body],launch,ballMode});
  assert.deepEqual(adapted.collisions,capture.collisions);
 });
 test(`${shapeType}: Ripple crosses the actual perimeter, latches receiver pitch and emitter instrument`,()=>{
  const store=createBoardPhysicalObjects(),shape=store.addCube(200,0,{shapeType,sourceMidi:71});
  const ripples=createRippleObjects(),ripple=ripples.create({x:0,y:0,instrument:'BELL'}),scheduled=[];
  const controller=createSimpleRippleController({objects:ripples,getReceivers:()=>store.list('cube').map(o=>o.boardObject),getClock:()=>({audioTime:0,currentTick:0,bpm:120}),schedule:e=>scheduled.push(e)});
  const result=controller.emit(ripple.id);assert.equal(result.events.length,1);
  assert.equal(scheduled[0].sourceMidi,71);assert.equal(scheduled[0].instrument,'BELL');assert.equal(scheduled[0].receiverId,shape.id);
  const emitter=createBoardObject('cannon',{authoredState:{instrument:'KALIMBA'}});
  assert.equal(resolveBoardInteraction(emitter,shape.boardObject,0).sourceMidi,71);
  assert.ok(waveReceiverDistance({x:0,y:0},shape.boardObject)>0);controller.destroy();
 });
}

test('nonrectangular bounds avoid invisible Cube corners, including Star recesses',()=>{
 const store=createBoardPhysicalObjects(),atCorner={x:171,y:-29};
 const distances=Object.fromEntries(simpleShapes.map(shape=>[shape.id,waveReceiverDistance(atCorner,store.addCube(200,0,{shapeType:shape.id}).boardObject)]));
 assert.equal(distances.cube,0);
 for(const type of ['circle','triangle','diamond','hexagon','star'])assert.ok(distances[type]>0,type);
 for(const shapeType of ['triangle','diamond','hexagon','star']){
  const shape=store.addCube(0,0,{shapeType}),capture=simulateThrow({cubes:[shape],launch:{x:0,y:0,vx:840,vy:100}});
  assert.ok(capture.collisions.length<32,'interior overlap resolves without a contact storm');
  assert.ok(capture.trajectory.every(p=>[p.x,p.y,p.vx,p.vy].every(Number.isFinite)));
 }
});

test('legacy Cube saves default safely and invalid shapes fail atomically',()=>{
 const store=createBoardPhysicalObjects();store.restore([{id:'legacy',kind:'cube',x:0,y:0,width:58,height:58,sourceMidi:60,instrument:'obsolete'}]);
 assert.equal(store.get('legacy').shapeType,'cube');assert.equal(store.get('legacy').boardObject.capabilities.physicsBody.shape,'box');
 const saved=store.authoredSnapshot();assert.throws(()=>store.restore([{...saved[0],shapeType:'unknown'}]));assert.deepEqual(store.authoredSnapshot(),saved);
 assert.throws(()=>store.update('legacy',{shapeType:'unknown'}));assert.deepEqual(store.authoredSnapshot(),saved);
});
