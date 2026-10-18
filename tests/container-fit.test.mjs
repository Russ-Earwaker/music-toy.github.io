import test from 'node:test';
import assert from 'node:assert/strict';
import {authoredBounds,fitAuthoredBounds,growAuthoredBounds,SIMPLE_DRAW_INSETS} from '../src/container-fit.js';
import {prepareBoardDrawing,drawingAuthoredBounds} from '../src/simple-draw-placement.js';
import {createContainerToyModel} from '../src/container-toys.js';
import {createConnectionModel} from '../src/connections.js';
import {createGraphPlacement} from '../src/graph-placement.js';

test('board gesture fitting preserves every world point with minimum size, regardless of presentation scale',()=>{
 for(const points of [[{x:90,y:40},{x:130,y:50}],[{x:-400,y:500},{x:200,y:200},{x:900,y:700}]]){
  const {source,bounds,contentSpace:s}=prepareBoardDrawing(points);assert.ok(bounds.width>=640&&bounds.height>=440);
  source.path.points.forEach((p,i)=>{assert.ok(Math.abs(bounds.x+s.x+p.x*s.width-points[i].x)<1e-9);assert.ok(Math.abs(bounds.y+s.y+p.y*s.height-points[i].y)<1e-9);});
  for(const scale of [.25,1,2]){
   const screen=points.map(p=>({x:p.x*scale+52,y:p.y*scale-80})),world=screen.map(p=>({x:(p.x-52)/scale,y:(p.y+80)/scale}));
   assert.deepEqual(prepareBoardDrawing(world),prepareBoardDrawing(points));
  }
 }
});
test('invalid gestures produce no materialization data; tiny valid gestures get usable frames',()=>{
 assert.equal(prepareBoardDrawing([]),null);assert.equal(prepareBoardDrawing([{x:1,y:1},{x:2,y:2}]),null);
 const tiny=prepareBoardDrawing([{x:0,y:0},{x:34,y:0}]);assert.equal(tiny.bounds.width,640);assert.equal(tiny.bounds.height,440);
});
test('four-bar cap fits only the interpreted authored path',()=>{
 const prepared=prepareBoardDrawing([{x:0,y:0},{x:1068,y:520},{x:0,y:0},{x:1068,y:520},{x:0,y:0}]);
 assert.equal(prepared.source.durationTicks,1536);assert.equal(prepared.source.path.totalLength,4);assert.equal(prepared.source.events.length,32);
 const actual=drawingAuthoredBounds(prepared.source.path,prepared.contentSpace,prepared.bounds);assert.deepEqual(prepared.bounds,fitAuthoredBounds(actual,{insets:SIMPLE_DRAW_INSETS}));
});
test('growth is authored-only, active-only, conservative and idempotent, with one tidy on commit',()=>{
 const commits=[],model=createConnectionModel(),containers=createContainerToyModel(model,{onBoundsCommit:id=>commits.push(id)}),c=containers.create({width:640,height:440});
 const outside={x:-200,y:0,width:900,height:500};
 for(const options of [{},{active:true,kind:'effect'}])assert.deepEqual(containers.requestContainerGrowth(c.id,outside,options).bounds,c.bounds);
 const next=containers.requestContainerGrowth(c.id,outside,{active:true}).bounds;assert.ok(next.x<0&&next.width>640);
 assert.equal(containers.commitContainerBounds(c.id).grew,true);assert.deepEqual(commits,[c.id]);
 assert.deepEqual(containers.requestContainerGrowth(c.id,outside,{active:true}).bounds,next);assert.equal(containers.commitContainerBounds(c.id).grew,false);
 assert.deepEqual(containers.requestContainerGrowth(c.id,{x:30,y:40,width:20,height:30},{active:true}).bounds,next);
 const saved=containers.snapshot();containers.restore(saved);assert.deepEqual(containers.get(c.id).bounds,next);containers.dispose();
});
test('deleting during growth cannot tidy a missing anchor or leak a pending bounds commit',()=>{
 const calls=[],model=createConnectionModel(),containers=createContainerToyModel(model,{onBoundsCommit:id=>calls.push(id)}),c=containers.create();
 containers.requestContainerGrowth(c.id,{x:0,y:0,width:900,height:900},{active:true});containers.remove(c.id);assert.equal(containers.commitContainerBounds(c.id).grew,false);assert.deepEqual(calls,[]);containers.dispose();
});
test('moving authored geometry and rebasing a growing frame preserves shape and never edits musical source',()=>{
 const prepared=prepareBoardDrawing([{x:100,y:100},{x:600,y:400}]),before=structuredClone(prepared.source),base=prepared.bounds,s=prepared.contentSpace;
 let bounds=base;
 for(const [dx,dy]of [[800,-300],[0,0],[800,-300]]){
  const worldSpace={...s,x:base.x+s.x+dx-bounds.x,y:base.y+s.y+dy-bounds.y};
  const content=drawingAuthoredBounds(prepared.source.path,worldSpace,bounds),next=growAuthoredBounds(bounds,content,{insets:SIMPLE_DRAW_INSETS});
  const rebased={...worldSpace,x:bounds.x+worldSpace.x-next.x,y:bounds.y+worldSpace.y-next.y};
  assert.deepEqual(drawingAuthoredBounds(prepared.source.path,rebased,next),content);bounds=next;
 }
 assert.deepEqual(prepared.source,before);assert.ok(bounds.width>base.width);assert.equal(authoredBounds([{x:NaN,y:0}]),null);
});

test('repair between real containers preserves each owned local layout and committed dimensions',()=>{
 const model=createConnectionModel(),rects=new Map(),containers=createContainerToyModel(model,{getRect:id=>rects.get(id),setPosition:(id,x,y)=>Object.assign(rects.get(id),{x,y})});
 function make(x,id){const c=containers.create({x,y:0,width:900,height:600,presentationType:'simple-draw'});model.registerObject(id);rects.set(id,{x:x+50,y:100,width:800,height:700});assert.ok(containers.attach(c.id,[id]).ok);return containers.get(c.id);}
 const a=make(0,'grid-a'),b=make(700,'grid-b');model.registerObject('distant');rects.set('distant',{x:10000,y:10000,width:200,height:200});const wires=model.snapshot().connections;
 const placement=createGraphPlacement({model:containers.boardGraph,getScope:id=>containers.owner(id),getRect:id=>containers.get(id)?.bounds||rects.get(id),isManual:()=>true,setPosition:(id,x,y)=>containers.get(id)?containers.move(id,x,y):Object.assign(rects.get(id),{x,y})});
 const result=placement.repairAround(a.id);assert.deepEqual(result.unresolved,[]);assert.deepEqual(containers.get(a.id).bounds,a.bounds);assert.notDeepEqual(containers.get(b.id).bounds,b.bounds);assert.deepEqual(containers.get(b.id).layout,b.layout);assert.equal(containers.get(b.id).bounds.width,900);assert.equal(containers.get(b.id).bounds.height,600);assert.equal(rects.get('grid-b').x-containers.get(b.id).bounds.x,50);
 assert.deepEqual(rects.get('distant'),{x:10000,y:10000,width:200,height:200});assert.deepEqual(placement.repairAround(a.id).moves,[]);assert.deepEqual(model.snapshot().connections,wires);containers.dispose();
});
