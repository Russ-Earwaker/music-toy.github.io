import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createStructureToyModel,structureToyWidth,structureToyHeight} from '../src/structure-toys.js';
import {createGraphPlacement,rectanglesOverlap,MIN_NODE_GAP_X} from '../src/graph-placement.js';
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const out=(objectId,portId='output')=>({objectId,portId}),input=objectId=>({objectId,portId:'input'});
function harness(){
 const model=createConnectionModel(),rects=new Map(),microtasks=[],repairs=[];
 const add=(id,x,y)=>{model.registerObject(id);rects.set(id,{x,y,width:300,height:200});};
 const structures=createStructureToyModel(model);
 const getRect=id=>{const s=structures.get(id);return s?{x:s.x,y:s.y,width:structureToyWidth(s),height:structureToyHeight(s)}:rects.get(id);};
 const placement=createGraphPlacement({model,getRect,isManual:id=>structures.get(id)?.positionSource==='manual',setPosition:(id,x,y)=>structures.get(id)?structures.move(id,x,y,{manual:false}):Object.assign(rects.get(id),{x,y})});
 structures.configure({placeStructure:(r,id)=>placement.placeStructure(r,id)});
 const context={connectionModel:model,structureToyModel:structures,document:{getElementById:()=>null},g_layoutAnimation:{cancel(){},batch:fn=>fn()},
 g_graphPlacement:{...placement,repairSubgraph:(id,o)=>{repairs.push(id);return placement.repairSubgraph(id,o);}},g_connectionView:{render(){}},
 window:{Persistence:{markDirty(){}}},queueMicrotask:fn=>microtasks.push(fn)};
 vm.createContext(context);
 const a=source.indexOf('const g_layoutPending='),b=source.indexOf('function isActivelyEditingToy()',a);
 vm.runInContext(source.slice(a,b),context);
 const c=source.indexOf('connectionModel.subscribe(event => {'),d=source.indexOf('const g_sequenceChains =',c);
 vm.runInContext(source.slice(c,d),context);
 const flush=()=>{while(microtasks.length)microtasks.shift()();};
 const connect=(a,b,p='output')=>assert.equal(model.connect('sequence',out(a,p),input(b)).ok,true);
 const validate=()=>{const ids=model.getObjectIds();for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)assert.equal(rectanglesOverlap(getRect(ids[i]),getRect(ids[j])),false);assert.ok(model.list().every(c=>placement.hasUsableConnectionCorridor(c.id)));};
 return {model,structures,placement,add,connect,flush,repairs,getRect,validate};
}
test('production subscriber repairs fresh first/second/third children after repeated manual branch movement',()=>{
 const h=harness();h.add('A',0,0);h.add('B',444,0);h.connect('A','B');h.flush();
 const s=h.structures.promote(h.model.getParent('B').id,'sequence');h.flush();
 for(let i=0;i<6;i++){
  const before=h.structures.get(s.id);const dx=320,dy=130;
  for(const id of h.placement.descendants(s.id)){const r=h.getRect(id);if(h.structures.get(id))h.structures.move(id,r.x+dx,r.y+dy);else Object.assign(r,{x:r.x+dx,y:r.y+dy});}
  const current=h.structures.get(s.id);assert.equal(current.x,before.x+dx);
  h.add('C'+i,-10000,10000);h.repairs.length=0;h.connect(s.id,'C'+i,'child:'+(i+1));assert.equal(h.repairs.length,0);h.flush();assert.equal(h.repairs.length,1);
  const child=h.getRect('C'+i);assert.equal(child.x,h.getRect(s.id).x+structureToyWidth(current)+MIN_NODE_GAP_X);assert.ok(Math.abs(child.y-current.y)<2200);h.validate();
 }
});
for(const nested of [false,true])test('promotion exposes insertion and repairs final '+(nested?'nested Structure':'musical branch')+' once',()=>{
 const h=harness();h.add('A',0,0);h.add('B',444,0);h.add('C',888,0);h.connect('A','B');h.connect('B','C');h.flush();
 if(nested){h.structures.promote(h.model.getParent('B').id,'sequence');h.flush();}
 const branch=h.model.list().find(c=>c.from.objectId==='A').to.objectId;
 const relative={x:h.getRect('C').x-h.getRect('B').x,y:h.getRect('C').y-h.getRect('B').y};
 const events=[];h.model.subscribe(e=>events.push(e));h.repairs.length=0;
 const inserted=h.structures.promote(h.model.getParent(branch).id,'sequence');
 assert.equal(h.repairs.length,0);assert.equal(events.length,1);
 const meta=events[0].events.find(e=>e.layoutInsertion)?.layoutInsertion;
 assert.deepEqual(meta,{insertedObjectId:inserted.id,attachedBranchId:branch,layoutRootId:'A'});
 h.flush();assert.equal(h.repairs.length,1);h.validate();
 assert.equal(h.getRect('C').x-h.getRect('B').x,relative.x);assert.equal(h.getRect('C').y-h.getRect('B').y,relative.y);
});

test('quick-add first child to an empty manually positioned Structure uses its current bounds',()=>{
 const h=harness();h.structures.restore([{id:'S',type:'sequence',x:3200,y:1800,outputCount:2,positionSource:'manual'}]);h.add('child',-9000,-9000);
 h.connect('S','child','child:0');h.flush();const s=h.getRect('S'),c=h.getRect('child');
 assert.equal(c.x,s.x+s.width+MIN_NODE_GAP_X);assert.equal(c.y+c.height/2,s.y+s.height/2);h.validate();
});
test('deep nested insertion preserves a deliberately positioned downstream composition',()=>{
 const h=harness();h.add('A',0,0);h.add('B',444,0);h.add('C',1100,220);h.connect('A','B');h.connect('B','C');h.flush();
 for(let i=0;i<5;i++){const edge=h.model.list().find(c=>c.from.objectId==='A');h.structures.promote(edge.id,'sequence');h.flush();h.validate();}
 // A clear but noncanonical interior must translate without being rearranged.
 const c=h.getRect('C');c.x+=240;c.y+=160;
 const before={x:c.x-h.getRect('B').x,y:c.y-h.getRect('B').y};
 const edge=h.model.list().find(c=>c.from.objectId==='A');h.repairs.length=0;h.structures.promote(edge.id,'sequence');h.flush();h.validate();
 assert.equal(h.repairs.length,1);assert.deepEqual({x:c.x-h.getRect('B').x,y:c.y-h.getRect('B').y},before);
});

test('conversion wrapper preserves existing child compositions while opening the inserted corridor',()=>{
 const h=harness();h.add('A',0,0);h.add('B',444,0);h.add('C',888,0);h.connect('A','B');h.connect('B','C');h.flush();
 const s=h.structures.promote(h.model.getParent('B').id,'sequence');h.flush();h.add('D',-1000,1000);h.add('E',-100,1000);h.connect(s.id,'D','child:1');h.connect('D','E');h.flush();
 h.getRect('C').x+=200;h.getRect('E').x+=180;
 const before=[h.getRect('C').x-h.getRect('B').x,h.getRect('E').x-h.getRect('D').x];
 h.structures.setType(s.id,'repeat');h.flush();h.validate();
 assert.deepEqual([h.getRect('C').x-h.getRect('B').x,h.getRect('E').x-h.getRect('D').x],before);
});

test('Heartbeat insertion repairs its downstream branch without arranging other transport roots',()=>{
 const h=harness();h.add('H',0,0);h.model.registerObject('H',{ports:HEARTBEAT_PORTS,transportId:'H'});h.add('A',444,0);h.add('unrelated',444,1500);
 h.model.connect('transport',out('H'),input('A'));h.model.connect('transport',out('H'),input('unrelated'));h.flush();h.getRect('unrelated').y=1500;const before={...h.getRect('unrelated')};
 const s=h.structures.promote(h.model.getParent('A').id,'sequence');h.flush();h.validate();assert.deepEqual(h.getRect('unrelated'),before);assert.equal(h.model.getParent(s.id).kind,'transport');assert.equal(h.model.list('transport').length,2);
});
