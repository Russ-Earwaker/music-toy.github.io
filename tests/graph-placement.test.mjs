import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionModel,createStructurePorts,HEARTBEAT_PORTS} from '../src/connections.js';
import {createStructureToyModel,structureToyWidth,structureToyHeight} from '../src/structure-toys.js';
import {createGraphPlacement,rectanglesOverlap,clearVerticalSlot,MIN_NODE_GAP_X,MIN_SIBLING_GAP_Y} from '../src/graph-placement.js';
const out=(objectId,portId='output')=>({objectId,portId}),input=objectId=>({objectId,portId:'input'});
function harness(manual=new Set()){
  const model=createConnectionModel(),rects=new Map(),moves=[];
  const add=(id,x,y,width=144,height=100,structure=false)=>{
    rects.set(id,{x,y,width,height});model.registerObject(id,structure?{ports:createStructurePorts(4),structure:{}}:{});
  };
  const layout=createGraphPlacement({model,getRect:id=>rects.get(id),isManual:id=>manual.has(id),setPosition:(id,x,y)=>{moves.push(id);Object.assign(rects.get(id),{x,y});}});
  const connect=(a,b,port='output')=>assert.equal(model.connect('sequence',out(a,port),input(b)).ok,true);
  return {model,rects,moves,add,connect,layout};
}
test('Structure quick-add keeps second and third children in a downstream column with clear vertical slots',()=>{
  const h=harness();h.add('S',0,0,144,100,true);
  const original=h.rects.get('S');
  for(let i=0;i<3;i++){
    const p=h.layout.placeChild('S',{width:300,height:200});
    assert.equal(p.x,144+MIN_NODE_GAP_X);assert.equal(p.depth,1);
    for(const r of h.rects.values())assert.equal(rectanglesOverlap(p,r,48),false);
    h.add(`C${i}`,p.x,p.y,300,200);h.connect('S',`C${i}`,`child:${i}`);
  }
  assert.equal(new Set([...h.rects.values()].slice(1).map(r=>r.y)).size,3);
  assert.strictEqual(h.rects.get('S'),original);assert.deepEqual(h.moves,[]);
});
test('normal toy sequential placement stays horizontal and does not move manual obstacles',()=>{
  const h=harness();h.add('A',100,200,300,200);h.add('manual',464,200,300,200);
  const before=structuredClone([...h.rects]);
  const p=h.layout.placeChild('A',{width:300,height:200});assert.equal(p.x,400+MIN_NODE_GAP_X);
  h.add('new',p.x,p.y,300,200);h.connect('A','new');h.layout.repairSubgraph('A');
  assert.equal(rectanglesOverlap(h.rects.get('new'),h.rects.get('manual'),MIN_SIBLING_GAP_Y),false);assert.deepEqual(h.rects.get('manual'),before[1][1]);
  h.rects.delete('manual');h.model.removeObject('manual');assert.equal(h.layout.placeChild('A',{width:300,height:200}).y,200);
});
test('nearest collision slot is deterministic even with many stacked obstacles',()=>{
  const desired={x:0,y:0,width:100,height:100},obstacles=Array.from({length:100},(_,i)=>({x:0,y:i*148,width:100,height:100}));
  const a=clearVerticalSlot(desired,obstacles);assert.equal(a.y,-100-MIN_SIBLING_GAP_Y);assert.deepEqual(clearVerticalSlot(desired,[...obstacles].reverse()),a);
});
test('a manually distant sibling does not pull automatic placement out of its parent column',()=>{
  const h=harness();h.add('S',0,0,144,100,true);h.add('manual',10000,0);h.connect('S','manual','child:0');
  assert.equal(h.layout.placeChild('S',{width:300,height:200}).x,144+MIN_NODE_GAP_X);assert.deepEqual(h.moves,[]);
});
test('explicit arrange uses graph depth, variable bounds, nonoverlapping siblings, and anchors only the selected root',()=>{
  const h=harness();h.add('A',100,300,300,200);h.add('S',0,0,360,150,true);h.add('B',0,0,250,300);h.add('C',0,0,500,220);h.add('R',0,0,144,100,true);h.add('E',0,0,300,200);h.add('manual',2000,2000);
  h.connect('A','S');h.connect('S','B','child:0');h.connect('S','C','child:1');h.connect('C','R');h.connect('R','E','child:0');
  const root={...h.rects.get('A')},manual={...h.rects.get('manual')};const result=h.layout.arrangeSubgraph('A');
  assert.equal(h.layout.depth('E'),4);assert.equal(result.length,5);assert.deepEqual(h.rects.get('A'),root);assert.deepEqual(h.rects.get('manual'),manual);
  assert.equal(h.rects.get('B').x,h.rects.get('C').x);
  assert.ok(h.rects.get('S').x>=root.x+root.width+64);assert.ok(h.rects.get('E').x>h.rects.get('R').x);
  const rs=['A','S','B','C','R','E'].map(id=>h.rects.get(id));for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++)assert.equal(rectanglesOverlap(rs[i],rs[j],48),false);
  assert.deepEqual(h.layout.arrangeSubgraph('A'),[],'repeat arrangement is stable and has no further displacement');
});
test('Heartbeat-root arrangement includes its transport children without moving the Heartbeat',()=>{
  const h=harness();h.rects.set('H',{x:0,y:0,width:96,height:96});h.model.registerObject('H',{ports:HEARTBEAT_PORTS,transportId:'main-heartbeat'});
  h.add('A',0,0);h.add('B',0,0);h.model.connect('transport',out('H'),input('A'));h.model.connect('transport',out('H'),input('B'));
  h.layout.arrangeSubgraph('H');assert.deepEqual(h.moves,['A','B']);assert.equal(h.rects.get('A').x,96+MIN_NODE_GAP_X);assert.equal(h.rects.get('B').x,96+MIN_NODE_GAP_X);assert.equal(rectanglesOverlap(h.rects.get('A'),h.rects.get('B'),48),false);
});
test('promotion opens a full corridor and translates the downstream chain together without moving unrelated objects',()=>{
  const h=harness();h.add('A',0,0,300,200);h.add('B',350,0,300,200);h.add('C',794,0,300,200);h.add('unrelated',0,1000);
  h.connect('A','B');h.connect('B','C');
  const toys=createStructureToyModel(h.model,{placeStructure:(r,id)=>h.layout.placeStructure(r,id)});
  const originalRect=h.rects.get.bind(h.rects),getRect=id=>{const s=toys.get(id);return s?{x:s.x,y:s.y,width:structureToyWidth(s),height:structureToyHeight(s)}:originalRect(id);};
  const layout=createGraphPlacement({model:h.model,getRect,setPosition:(id,x,y)=>{if(toys.get(id))toys.move(id,x,y,{manual:false});else Object.assign(h.rects.get(id),{x,y});}});
  const before={...h.rects.get('unrelated')},s=toys.promote(h.model.getParent('B').id,'sequence');
  layout.repairSubgraph('A');assert.equal(toys.get(s.id).x,444);assert.equal(h.rects.get('B').x,444+structureToyWidth(s)+MIN_NODE_GAP_X);
  assert.equal(h.rects.get('C').x-h.rects.get('B').x,444);assert.equal(h.rects.get('C').y-h.rects.get('B').y,0);
  assert.deepEqual(h.rects.get('unrelated'),before);assert.deepEqual(h.rects.get('A'),{x:0,y:0,width:300,height:200});
  assert.ok(h.model.list().every(c=>layout.hasUsableConnectionCorridor(c.id)));toys.dispose();
});
test('middle socket insertion separates whole subtrees in connector order with minimum displacement',()=>{
  const h=harness();h.add('S',0,0,224,200,true);h.add('B',368,0,200,200);h.add('D',368,280,200,200);h.add('E',712,280,200,200);h.connect('S','B','child:0');h.connect('S','D','child:2');h.connect('D','E');
  h.add('C',368,140,200,200);h.connect('S','C','child:1');const relative={x:h.rects.get('E').x-h.rects.get('D').x,y:h.rects.get('E').y-h.rects.get('D').y};
  const topology=h.model.list();h.layout.repairSubgraph('S');
  for(const [a,b]of [['B','C'],['C','D']]){const aa=h.layout.branchBounds(a),bb=h.layout.branchBounds(b);assert.ok(aa.y+aa.height+MIN_SIBLING_GAP_Y<=bb.y+1e-9);}
  assert.equal(h.rects.get('E').x-h.rects.get('D').x,relative.x);assert.equal(h.rects.get('E').y-h.rects.get('D').y,relative.y);
  assert.deepEqual(h.model.list(),topology);assert.deepEqual(h.layout.repairSubgraph('S'),[]);
});
test('manual branches have stronger resistance while still yielding to unusable overlap',()=>{
  const make=manual=>{const h=harness(manual);h.add('S',0,0,224,200,true);h.add('B',368,0,200,200);h.add('C',368,20,200,200);h.connect('S','B','child:0');h.connect('S','C','child:1');h.layout.repairSubgraph('S');return h;};
  const resistant=make(new Set(['B'])),automatic=make(new Set());
  assert.ok(Math.abs(resistant.rects.get('B').y)<Math.abs(automatic.rects.get('B').y));assert.equal(resistant.rects.get('B').y,0);
  assert.equal(rectanglesOverlap(resistant.layout.branchBounds('B'),resistant.layout.branchBounds('C'),MIN_SIBLING_GAP_Y),false);
  assert.deepEqual(resistant.layout.repairSubgraph('S'),[],'manual anchor and automatic sibling remain stable');
});
test('descendant bounds, not only child roots, reserve sibling space',()=>{
  const h=harness();h.add('S',0,0,224,200,true);h.add('B',368,0,200,200);h.add('E',712,350,200,400);h.add('C',368,210,200,200);h.connect('S','B','child:0');h.connect('B','E');h.connect('S','C','child:1');
  h.layout.repairSubgraph('S');assert.equal(rectanglesOverlap(h.layout.branchBounds('B'),h.layout.branchBounds('C'),MIN_SIBLING_GAP_Y),false);
  const incremental=h.layout.branchBounds('B');assert.equal(incremental.height,400);h.layout.arrangeSubgraph('S');assert.equal(rectanglesOverlap(h.layout.branchBounds('B'),h.layout.branchBounds('C'),MIN_SIBLING_GAP_Y),false);
});
test('a midpoint blocked by an unrelated object extends its downstream branch and becomes accessible',()=>{
  const h=harness();h.add('A',0,0,100,100);h.add('B',244,0,100,100);h.add('blocker',160,40,60,20);h.connect('A','B');const c=h.model.getParent('B'),before={...h.rects.get('blocker')};
  assert.equal(h.layout.hasUsableConnectionCorridor(c.id),false);h.layout.repairSubgraph('A');assert.equal(h.layout.hasUsableConnectionCorridor(c.id),true);assert.deepEqual(h.rects.get('blocker'),before);
});
test('many quick-add children remain ordered and nonoverlapping, with usable connection corridors',()=>{
  const h=harness();h.add('S',0,0,224,900,true);h.model.registerObject('S',{ports:createStructurePorts(17),structure:{}});
  for(let i=0;i<16;i++){const p=h.layout.placeChild('S',{width:300,height:200});h.add(`C${i}`,p.x,p.y,300,200);h.connect('S',`C${i}`,`child:${i}`);h.layout.repairSubgraph('S');}
  for(let i=1;i<16;i++){const a=h.layout.branchBounds(`C${i-1}`),b=h.layout.branchBounds(`C${i}`);assert.ok(a.y+a.height+MIN_SIBLING_GAP_Y<=b.y+1e-9);}
  assert.ok(h.model.list().every(c=>h.layout.hasUsableConnectionCorridor(c.id)));assert.deepEqual(h.layout.repairSubgraph('S'),[]);
});
test('a new Heartbeat branch repairs only that branch and treats other roots as stationary obstacles',()=>{
  const h=harness();h.rects.set('H',{x:0,y:0,width:96,height:96});h.model.registerObject('H',{ports:HEARTBEAT_PORTS});h.add('existing',240,-300);h.add('new',0,0);
  h.model.connect('transport',out('H'),input('existing'));const c=h.model.connect('transport',out('H'),input('new')).connection,before={...h.rects.get('existing')};
  h.layout.repairConnection(c.id);assert.deepEqual(h.rects.get('existing'),before);assert.ok(h.layout.hasUsableConnectionCorridor(c.id));
});
test('explicit depth columns accommodate the widest parent at each depth',()=>{
  const h=harness();h.add('S',0,0,224,200,true);h.add('B',0,0,200,100);h.add('C',0,0,500,100);h.add('D',0,0,200,100);h.add('E',0,0,200,100);h.connect('S','B','child:0');h.connect('S','C','child:1');h.connect('B','D');h.connect('C','E');
  h.layout.arrangeSubgraph('S');assert.equal(h.rects.get('D').x,h.rects.get('E').x);assert.ok(h.model.list().every(c=>h.layout.hasUsableConnectionCorridor(c.id)));
});
test('fractional camera/position rounding does not classify a full corridor as inaccessible',()=>{
  const h=harness();h.add('A',1856.72,0,618,343);h.add('B',2618.72,0,618,343);h.connect('A','B');assert.ok(h.layout.hasUsableConnectionCorridor(h.model.getParent('B').id));assert.deepEqual(h.layout.repairSubgraph('A'),[]);
});
test('endpoint accessibility repairs the immediate covering neighbour without moving a stable root',()=>{
  const h=harness(new Set(['nearby']));h.add('A',0,0,100,100);h.add('B',244,0,100,100);h.add('nearby',115,30,80,40);h.add('far',1000,1000);h.connect('A','B');const c=h.model.getParent('B'),far={...h.rects.get('far')};
  assert.equal(h.layout.hasUsableConnectionCorridor(c.id),false);h.layout.repairSubgraph('A');assert.ok(h.layout.hasUsableConnectionCorridor(c.id));assert.equal(h.rects.get('A').y,0);assert.notEqual(h.rects.get('nearby').y,30);assert.deepEqual(h.rects.get('far'),far);
});
test('layout and corridor obstacles stay within the selected board scope',()=>{
  const h=harness();h.rects.set('H',{x:0,y:0,width:96,height:96});h.model.registerObject('H',{ports:HEARTBEAT_PORTS});h.add('global',100,0,500,500);h.add('internal',0,0);h.add('internal-child',0,0);
  h.model.connect('transport',out('H'),input('global'));const c=h.model.connect('transport',out('H'),input('internal')).connection;h.connect('internal','internal-child');
  const before={...h.rects.get('global')};const layout=createGraphPlacement({model:h.model,getRect:id=>h.rects.get(id),getScope:id=>id.startsWith('internal')?'art-board':null,setPosition:(id,x,y)=>Object.assign(h.rects.get(id),{x,y})});
  layout.repairConnection(c.id);assert.deepEqual(h.rects.get('global'),before);assert.ok(layout.hasUsableConnectionCorridor(c.id));
  const inside={...h.rects.get('internal')};layout.arrangeSubgraph('H');assert.deepEqual(h.rects.get('internal'),inside,'global arrange excludes the internal board');
});
test('reparenting targets its new slot before resistance packing and leaves established manual siblings anchored',()=>{
  const h=harness(new Set(['B','C']));h.add('S',0,0,224,200,true);h.add('B',368,0,200,200);h.add('D',368,272,200,200);h.add('C',712,0,200,200);h.connect('S','B','child:0');h.connect('S','D','child:1');h.connect('B','C');
  h.model.disconnect(h.model.getParent('C').id);h.connect('S','C','child:2');h.layout.repairSubgraph('S',{recentlyAttached:new Set(['C'])});
  assert.equal(h.rects.get('B').y,0);assert.equal(h.rects.get('D').y,272);assert.equal(h.rects.get('C').x,368);assert.equal(h.rects.get('C').y,544);assert.ok(h.model.list().every(c=>h.layout.hasUsableConnectionCorridor(c.id)));
});
test('growth protects unrelated connection midpoints without moving their endpoints',()=>{
  const h=harness();h.add('A',0,0,100,100);h.add('S',244,0,224,128,true);h.connect('A','S');h.add('U',0,300,100,100);h.add('V',1124,-300,100,100);h.connect('U','V');
  h.add('C',612,14,100,100);h.connect('S','C','child:0');const oldWire=h.model.getParent('V'),u={...h.rects.get('U')},v={...h.rects.get('V')};
  assert.equal(h.layout.hasUsableConnectionCorridor(oldWire.id),false);h.layout.repairSubgraph('A');
  assert.ok(h.model.list().every(c=>h.layout.hasUsableConnectionCorridor(c.id)));assert.deepEqual(h.rects.get('U'),u);assert.deepEqual(h.rects.get('V'),v);assert.equal(h.rects.get('C').y,0);assert.ok(h.rects.get('C').x>636);
});

const centre=r=>r.y+r.height/2;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function balancedTree(count=3){
  const h=harness();h.add('S',0,100,224,180,true);
  for(let i=0;i<count;i++){h.add(`C${i}`,400,800+i*500,200,100);h.connect('S',`C${i}`,`child:${i}`);}
  return h;
}
test('one-child and nested Repeat-style Structures form a straight horizontal run',()=>{
  const h=balancedTree(1);h.add('R',800,-900,224,220,true);h.add('leaf',1200,2000,300,300);h.connect('C0','R');h.connect('R','leaf','child:0');
  h.layout.repairSubgraph('S');for(const id of ['C0','R','leaf'])near(centre(h.rects.get(id)),centre(h.rects.get('S')));
  assert.deepEqual(h.layout.repairSubgraph('S'),[]);
});
test('two equal child envelopes balance symmetrically and three have even socket-ordered spacing',()=>{
  for(const count of [2,3]){const h=balancedTree(count);h.layout.repairSubgraph('S');
    const rs=Array.from({length:count},(_,i)=>h.layout.branchBounds(`C${i}`));
    near((rs[0].y+rs.at(-1).y+rs.at(-1).height)/2,centre(h.rects.get('S')));
    for(let i=1;i<count;i++)near(rs[i].y-rs[i-1].y-rs[i-1].height,MIN_SIBLING_GAP_Y);
    assert.ok(h.model.list().every(c=>h.layout.hasUsableConnectionCorridor(c.id)));
    assert.deepEqual(h.layout.repairSubgraph('S'),[]);
  }
});
test('recursive asymmetric subtree envelopes determine centring rather than root averages',()=>{
  const h=balancedTree(2);h.model.registerObject('C0',{ports:createStructurePorts(4),structure:{}});
  h.add('large',800,2000,300,600);h.add('small',800,-500,100,100);h.connect('C0','large','child:0');h.connect('C0','small','child:1');
  h.layout.repairSubgraph('S');const a=h.layout.branchBounds('C0'),b=h.layout.branchBounds('C1');
  near(centre(h.rects.get('C0')),centre(a));near(centre(h.rects.get('S')),(a.y+b.y+b.height)/2);near(b.y-a.y-a.height,MIN_SIBLING_GAP_Y);
  assert.ok(a.height>h.rects.get('C0').height);assert.deepEqual(h.layout.repairSubgraph('S'),[]);
  const before=structuredClone([...h.rects]);h.layout.arrangeSubgraph('S');assert.deepEqual([...h.rects],before,'explicit and incremental share balanced targets');
});
test('insertion redistributes siblings, removal closes the gap, and reparent balances both parents',()=>{
  const h=balancedTree(2);h.layout.repairSubgraph('S');const before=h.rects.get('C0').y;
  h.add('C2',400,2000,200,100);h.connect('S','C2','child:2');h.layout.repairSubgraph('S');assert.ok(h.rects.get('C0').y<before);
  h.model.disconnect(h.model.getParent('C1').id);h.model.removeObject('C1');h.rects.delete('C1');h.layout.repairSubgraph('S');
  near(h.rects.get('C2').y-h.rects.get('C0').y-100,MIN_SIBLING_GAP_Y);
  h.add('T',0,1200,224,180,true);h.model.disconnect(h.model.getParent('C2').id);h.connect('T','C2','child:0');
  h.layout.repairSubgraph('T',{recentlyAttached:new Set(['C2'])});h.layout.repairSubgraph('S');
  near(centre(h.rects.get('C0')),centre(h.rects.get('S')));near(centre(h.rects.get('C2')),centre(h.rects.get('T')));
});
test('incremental depth bands propagate a wide sibling width locally',()=>{
  const h=balancedTree(2);h.rects.get('C0').width=600;h.add('D',800,0);h.add('E',800,0);h.connect('C0','D');h.connect('C1','E');h.layout.repairSubgraph('S');
  near(h.rects.get('D').x,h.rects.get('E').x);assert.ok(h.model.list().every(c=>h.layout.hasUsableConnectionCorridor(c.id)));
});

// Growth should spend movement on automatic neighbours, not a long new wire.
test('cramped insertion stays at its ideal local column by shifting an automatic neighbouring branch',()=>{
 const h=harness();h.add('S',0,0,224,160,true);h.add('U',368,-20,300,200);h.add('V',812,-20,100,200);h.connect('U','V');
 const p=h.layout.placeChild('S',{width:300,height:200});h.add('new',p.x,p.y,300,200);h.connect('S','new','child:0');
 const u={...h.rects.get('U')},v={...h.rects.get('V')};h.layout.repairSubgraph('S',{recentlyAttached:new Set(['new'])});
 near(h.rects.get('new').x,p.x);near(h.rects.get('new').y,p.y);assert.notEqual(h.rects.get('U').y,u.y);near(h.rects.get('V').y-v.y,h.rects.get('U').y-u.y);
 assert.ok(h.model.list().every(c=>h.layout.hasUsableConnectionCorridor(c.id)));
 for(const a of ['new','U','V'])for(const b of ['new','U','V'])if(a!==b)assert.equal(rectanglesOverlap(h.rects.get(a),h.rects.get(b)),false);
});
test('manual neighbouring branch resists compact insertion, while repeated siblings keep one local column and minimum gaps',()=>{
 const h=harness(new Set(['U']));h.add('S',0,0,224,160,true);h.model.registerObject('S',{ports:createStructurePorts(8),structure:{}});h.add('U',368,-20,300,200);const manual={...h.rects.get('U')};
 for(let i=0;i<6;i++){const p=h.layout.placeChild('S',{width:300,height:200});h.add('C'+i,p.x,p.y,300,200);h.connect('S','C'+i,'child:'+i);h.layout.repairSubgraph('S',{recentlyAttached:new Set(['C'+i])});}
 assert.deepEqual(h.rects.get('U'),manual);for(let i=0;i<6;i++)near(h.rects.get('C'+i).x,368);
 for(let i=1;i<6;i++)near(h.rects.get('C'+i).y-h.rects.get('C'+(i-1)).y-200,MIN_SIBLING_GAP_Y);
});
