import test from 'node:test';
import assert from 'node:assert/strict';
import {interactionHintBox} from '../src/simple-interaction-hint.js';
import {contextualTriggerHint} from '../src/simple-hint-placement.js';

test('interaction hints avoid occupied board space when an open region exists',()=>{
 const viewport={left:0,top:0,width:2000,height:1000},obstacle={x:900,y:200,width:200,height:600};
 const box=interactionHintBox(viewport,p=>p,[obstacle]);
 assert.ok(box.x+box.width<=obstacle.x||box.x>=obstacle.x+obstacle.width);
});
test('trigger hint stays near a remote Cube cluster and aims just outside one selected Cube',()=>{
 const cubes=[{id:'a',x:500,y:850,width:58,height:58},{id:'b',x:650,y:1000,width:58,height:58}],obstacles=cubes.map(c=>({id:c.id,x:c.x-29,y:c.y-29,width:58,height:58}));
 for(const demo of ['tap','swipe']){
  const h=contextualTriggerHint({area:{x:0,y:0,width:4000,height:2000},cubes,obstacles,demo}),target=cubes.find(c=>c.id===h.targetId);
  assert.ok(target);assert.ok(Math.hypot(h.worldOrigin.x-target.x,h.worldOrigin.y-target.y)<600);
  assert.ok(h.box.x+h.box.width<=target.x-29||h.box.x>=target.x+29||h.box.y+h.box.width*300/440<=target.y-29||h.box.y>=target.y+29);
  const dx=target.x-h.worldOrigin.x,dy=target.y-h.worldOrigin.y,ex=h.worldEnd.x-h.worldOrigin.x,ey=h.worldEnd.y-h.worldOrigin.y;
  assert.ok(Math.abs(dx*ey-dy*ex)<1e-6);assert.ok(Math.hypot(h.worldEnd.x-target.x,h.worldEnd.y-target.y)>=39-1e-8);
 }
});
test('trigger targets ignore off-screen and UI-covered Cubes',()=>{
 const h=contextualTriggerHint({area:{x:0,y:0,width:1200,height:800},cubes:[{id:'hidden',x:600,y:400},{id:'visible',x:900,y:400},{id:'offscreen',x:3000,y:400}],obstacles:[{id:'panel',x:550,y:350,width:100,height:100}]});
 assert.equal(h.targetId,'visible');assert.equal(contextualTriggerHint({area:{x:0,y:0,width:500,height:500},cubes:[]}),null);
});
test('hint positioning stays within logical board viewport across zoom, offsets and narrow layouts',()=>{
 for(const zoom of [.3,.75,1,2])for(const width of [280,1200]){
  const r={left:45,top:75,width,height:700};
  const convert=p=>({x:(p.x-r.left)/zoom-300,y:(p.y-r.top)/zoom+200});
  const box=interactionHintBox(r,convert),a=convert({x:r.left,y:r.top}),b=convert({x:r.left+r.width,y:r.top+r.height});
  assert.ok(box.x>=a.x&&box.x+box.width<=b.x+1e-8);assert.ok(box.y>=a.y&&box.y+box.width*300/440<=b.y+1e-8);
 }
});
