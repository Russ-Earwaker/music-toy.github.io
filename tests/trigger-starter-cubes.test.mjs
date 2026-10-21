import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {seedTriggerCubes,triggerCreationPoint,STARTER_CUBE_RADIUS,STARTER_CUBE_OFFSETS} from '../src/trigger-starter-cubes.js';
import {createBoardPhysicalObjects} from '../src/board-physical-objects.js';
import {createRippleObjects} from '../src/simple-ripple.js';
import {createLoopingRippleController} from '../src/simple-ripple-loop.js';

test('starter Cubes have canonical IDs, capabilities, independent positions, and ordinary persistence',()=>{
 const objects=createBoardPhysicalObjects(),center={x:2000,y:-1000},seeded=seedTriggerCubes({objects,center});assert.equal(seeded.length,3);
 assert.equal(new Set(seeded.map(c=>c.id)).size,3);
 assert.deepEqual(seeded.map(c=>[c.x-center.x,c.y-center.y]),STARTER_CUBE_OFFSETS);
 for(const c of seeded){assert.equal(c.boardObject.kind,'cube');for(const capability of ['draggable','pitchSource','triggerReceiver'])assert.ok(c.boardObject.capabilities[capability]);assert.deepEqual(c.boardObject.owns,[]);}
 const saved=objects.authoredSnapshot(),restored=createBoardPhysicalObjects();restored.restore(JSON.parse(JSON.stringify(saved)));assert.deepEqual(restored.authoredSnapshot(),saved);
 assert.equal(seedTriggerCubes({objects:restored,center}).length,0);
});
test('650 logical units inclusive around likely creation point; distant Cubes do not suppress starters',()=>{
 const center={x:1000,y:2000};for(const [distance,count]of [[STARTER_CUBE_RADIUS,0],[STARTER_CUBE_RADIUS+1,3]]){
  const objects=createBoardPhysicalObjects();objects.addCube(center.x+distance,center.y);assert.equal(seedTriggerCubes({objects,center}).length,count);
 }
 const viewport={getBoundingClientRect:()=>({left:100,top:80,width:1000,height:800})};
 const point=triggerCreationPoint({viewport,screenToWorld:p=>({x:(p.clientX-20)/2,y:(p.clientY+40)/2})});assert.deepEqual(point,{x:275,y:268});
});
test('Ball and Ripple reuse starter Cubes in either order; removing emitter leaves shared objects',()=>{
 for(const order of [['Ball','Ripple'],['Ripple','Ball']]){
  const objects=createBoardPhysicalObjects(),ripples=createRippleObjects(),center={x:0,y:0};
  for(const name of order){seedTriggerCubes({objects,center});if(name==='Ripple')ripples.create(center);}
  assert.equal(objects.list('cube').length,3);const ids=objects.list().map(c=>c.id);ripples.clear();assert.deepEqual(objects.list().map(c=>c.id),ids);
 }
});
test('Ripple selection seeds through shared callback without creating emitter until placement',()=>{
 class Node{constructor(){this.classList={add(){},remove(){},toggle(){}};}append(){}remove(){}}
 const physical=createBoardPhysicalObjects(),ripples=createRippleObjects(),world=new Node(),win={addEventListener(){},removeEventListener(){}};
 const context={document:{body:new Node(),createElement:()=>new Node(),createElementNS:()=>new Node()},window:win,requestAnimationFrame:()=>1,cancelAnimationFrame(){}};vm.createContext(context);
 const source=readFileSync(new URL('../src/simple-ripple-board.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace('export function installSimpleRippleBoard','function installSimpleRippleBoard');
 const install=vm.runInContext(source+';installSimpleRippleBoard',context);
 const board=install({objects:ripples,controller:{visibleWaves:()=>[],reset(){}},getWorld:()=>world,getViewport:()=>world,screenToWorld:p=>p,now:()=>0,unlock(){},seedCubes:()=>seedTriggerCubes({objects:physical,center:{x:0,y:0}})});
 assert.equal(board.arm(),true);assert.equal(physical.list('cube').length,3);assert.equal(ripples.list().length,0);assert.equal(board.arm(),false);assert.equal(board.arm(),true);assert.equal(physical.list().length,3);board.dispose();assert.equal(physical.list().length,3);
});
test('seeded receivers work with normal quantised Ripple cycles without ownership changes',()=>{
 const physical=createBoardPhysicalObjects(),ripples=createRippleObjects();seedTriggerCubes({objects:physical,center:{x:0,y:0}});const r=ripples.create();let now=0;const events=[],hits=[];
 const transport={id:'test',state:'playing',get currentTick(){return now;},tickToAudioTime:t=>t/192,audioTimeToTick:s=>Math.round(s*192)};
 const controller=createLoopingRippleController({objects:ripples,getReceivers:()=>physical.list().map(c=>c.boardObject),getTransport:()=>transport,schedule:e=>events.push(e),respond:e=>hits.push(e)});
 for(now=0;now<384;now+=6)controller.tick();assert.equal(hits.length,3);assert.ok(events.every(e=>e.eventTick%48===0));assert.deepEqual(ripples.get(r.id).owns,[]);
 ripples.remove(r.id);assert.equal(physical.list('cube').length,3);controller.destroy();
});
