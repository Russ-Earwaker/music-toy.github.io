import test from 'node:test';
import assert from 'node:assert/strict';
import {createGraphPlacement} from '../src/graph-placement.js';
import {createGraphBranchDrag} from '../src/graph-branch-drag.js';
import {createConnectionModel,createStructurePorts} from '../src/connections.js';
import {createStructureToyModel,structureToyWidth,structureToyHeight,structurePortPoint} from '../src/structure-toys.js';

for(const root of ['A','S'])test(`dragging ${root==='S'?'Structure':'musical parent'} translates only its descendant branch and pins only the root`,()=>{
 const model=createConnectionModel(),structures=createStructureToyModel(model),points=new Map();
 for(const [id,x,y] of [['A',0,100],['B',700,20],['C',1200,300],['upstream',-300,100]]){points.set(id,{x,y,startTick:960,transportId:'main-heartbeat'});model.registerObject(id);}
 structures.restore([{id:'S',type:'sequence',x:350,y:100},{id:'R',type:'repeat',count:4,x:1000,y:300}]);
 const edge=(a,b,port='output')=>assert.equal(model.connect('sequence',{objectId:a,portId:port},{objectId:b,portId:'input'}).ok,true);
 edge('upstream','A');edge('A','S');edge('S','B','child:0');edge('S','R','child:1');edge('R','C','child:0');
 const get=id=>structures.get(id)||points.get(id),before=new Map(model.getObjectIds().map(id=>[id,{...get(id)}])),topology=model.snapshot().connections;
 const layout=createGraphPlacement({model,getRect:id=>({...get(id),width:100,height:100})}),canceled=[];
 const drag=createGraphBranchDrag({descendants:layout.descendants,getPosition:get,cancelAnimation:id=>canceled.push(id),setPosition:(id,x,y,{manual})=>{if(structures.get(id))structures.move(id,x,y,{manual});else Object.assign(points.get(id),{x,y,...(manual?{positionSource:'manual'}:{})});}});
 drag.start(root);drag.move(root,before.get(root).x+125,before.get(root).y-75);drag.end();
 for(const id of model.getObjectIds()){const moved=layout.descendants(root).has(id);assert.equal(get(id).x,before.get(id).x+(moved?125:0));assert.equal(get(id).y,before.get(id).y-(moved?75:0));if(id!==root)assert.equal(get(id).positionSource,before.get(id).positionSource);assert.equal(get(id).transportId,before.get(id).transportId);assert.equal(get(id).count,before.get(id).count);}
 assert.equal(get(root).positionSource,'manual');assert.deepEqual(model.snapshot().connections,topology);assert.deepEqual(canceled,[...layout.descendants(root)]);assert.equal(points.get('C').startTick,960);structures.dispose();
});

test('musical drag synchronises from externally moved root without cumulative drift; reset drops gesture',()=>{
 const p=new Map([['A',{x:0,y:0}],['B',{x:100,y:20}]]);
 const drag=createGraphBranchDrag({descendants:()=>new Set(['A','B']),getPosition:id=>p.get(id),setPosition:(id,x,y)=>Object.assign(p.get(id),{x,y})});
 drag.start('A');Object.assign(p.get('A'),{x:10,y:15});drag.sync();drag.sync();assert.deepEqual(p.get('B'),{x:110,y:35});Object.assign(p.get('A'),{x:20,y:30});drag.end();assert.deepEqual(p.get('B'),{x:120,y:50});drag.start('A');drag.clear();p.get('A').x=200;drag.sync();assert.equal(p.get('B').x,120);
});

test('collapse persists, retains every valid socket, and never notifies musical topology',()=>{
 const model=createConnectionModel(),structures=createStructureToyModel(model);
 for(const type of ['sequence','together','repeat','timeline']){
  structures.restore([{id:'S',type,count:4,x:10,y:20,outputCount:4}]);const original=structures.get('S'),ports=Object.keys(model.getObject('S').ports),events=[];const unsub=model.subscribe(e=>events.push(e));
  structures.setCollapsed('S',true);const compact=structures.get('S');assert.ok(structureToyWidth(compact)<structureToyWidth(original));assert.ok(structureToyHeight(compact)<=structureToyHeight(original));assert.deepEqual(Object.keys(model.getObject('S').ports),ports);assert.equal(events.length,0);assert.equal(structures.durationOf('S'),0);
  for(const port of ports){const point=structurePortPoint(compact,port);assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));}
  unsub();const save=JSON.parse(JSON.stringify(structures.list()));structures.restore(save);assert.equal(structures.get('S').collapsed,true);structures.restore([{id:'S',type,x:10,y:20}]);assert.equal(structures.get('S').collapsed,false);
 }
 structures.dispose();
});

test('collision correction keeps descendant offsets after the pointer gesture has ended',()=>{
 const p=new Map([['A',{x:0,y:0}],['B',{x:100,y:20}],['C',{x:200,y:20}]]);
 const drag=createGraphBranchDrag({descendants:()=>new Set(['A','B','C']),getPosition:id=>p.get(id),setPosition:(id,x,y)=>Object.assign(p.get(id),{x,y})});
 drag.start('A');drag.move('A',40,30);drag.end();p.get('A').x=20;p.get('A').y=10;drag.translateDescendants('A',-20,-20);assert.deepEqual(p.get('B'),{x:120,y:30});assert.deepEqual(p.get('C'),{x:220,y:30});
});
