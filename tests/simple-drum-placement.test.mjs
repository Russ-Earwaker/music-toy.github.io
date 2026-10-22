import test from 'node:test';
import assert from 'node:assert/strict';
import {createDrumObjects} from '../src/simple-drum.js';
import {createDrumSet,drumSetFootprint,DRUM_SET_LAYOUT} from '../src/simple-drum-set.js';
import {nearbyFreeRect,rectanglesOverlap} from '../src/graph-placement.js';
test('kit footprint is tested before any creation and moves as one padded logical layout',()=>{
 const objects=createDrumObjects(),obstacles=[{x:-100,y:-100,width:200,height:200}],before=structuredClone(obstacles);let additions=0;
 objects.subscribe(e=>{if(e.type==='add'){additions++;const center={x:e.object.transform.x-DRUM_SET_LAYOUT[0].x,y:e.object.transform.y-DRUM_SET_LAYOUT[0].y};if(additions===1)assert.ok(!rectanglesOverlap(drumSetFootprint(center),obstacles[0],24));}});
 const kit=createDrumSet(objects,{x:0,y:0},obstacles),center={x:kit[0].transform.x-45,y:kit[0].transform.y-170};
 assert.equal(kit.length,6);for(let i=0;i<6;i++)assert.deepEqual(kit[i].transform,{x:center.x+DRUM_SET_LAYOUT[i].x,y:center.y+DRUM_SET_LAYOUT[i].y,rotation:0});assert.deepEqual(obstacles,before);
 assert.ok(!rectanglesOverlap(drumSetFootprint(center),obstacles[0],24));
});
test('successive kits occupy distinct nearby footprints and never move the first kit',()=>{
 const objects=createDrumObjects(),first=createDrumSet(objects,{x:100,y:-200}),saved=objects.snapshot(),second=createDrumSet(objects,{x:100,y:-200});
 const center=kit=>({x:kit[0].transform.x-45,y:kit[0].transform.y-170});
 assert.ok(!rectanglesOverlap(drumSetFootprint(center(first)),drumSetFootprint(center(second)),24));
 assert.deepEqual(objects.snapshot().slice(0,6),saved);assert.ok(Math.hypot(center(second).x-100,center(second).y+200)<1000);
});
test('placement is deterministic in unbounded board units and preserves clear desired locations',()=>{
 const desired={x:100000,y:-200000,width:764,height:468},obstacles=[{...desired}];assert.deepEqual(nearbyFreeRect(desired,[]),desired);
 const a=nearbyFreeRect(desired,obstacles),b=nearbyFreeRect(desired,obstacles);assert.deepEqual(a,b);assert.ok(!rectanglesOverlap(a,obstacles[0],24));assert.equal(Math.hypot(a.x-desired.x,a.y-desired.y),492);
});

import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('spawn adapter includes canonical cubes, circles, paint, Cannon, Art and music-panel bounds',()=>{
 const records=[{kind:'cube',transform:{x:10,y:20},bounds:{width:58,height:58}},{kind:'ripple',transform:{x:50,y:60},bounds:{radius:38}},...['simple-paint','cannon','decorative-art'].map(kind=>({kind,transform:{x:100,y:200},bounds:{width:280,height:140}}))];
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),source=main.slice(main.indexOf('function drumSetPlacementBounds()'),main.indexOf('const g_drumBoard='));
 const context={window:{BoardObjects:{list:()=>records}},containerToyModel:{isVisible:()=>true},document:{querySelectorAll:()=>[{id:'music',dataset:{}}]},g_graphPlacement:{getRect:()=>({x:300,y:400,width:500,height:600})}};vm.createContext(context);
 const get=vm.runInContext(source+';drumSetPlacementBounds',context),bounds=JSON.parse(JSON.stringify(get()));assert.equal(bounds.length,6);assert.deepEqual(bounds[0],{x:-19,y:-9,width:58,height:58});assert.deepEqual(bounds[1],{x:12,y:22,width:76,height:76});assert.deepEqual(bounds[5],{x:300,y:400,width:500,height:600});
});
