import test from 'node:test';
import assert from 'node:assert/strict';
import {createLineSource} from '../src/free-play-line.js';
import {paintShapes,paintShapeContains,drawPaintShapes,updateSilence,eventMuted} from '../src/free-play-silence.js';
import {evaluateScenePaint,topPaintAt,canonicalLineNodes} from '../src/free-play-paint.js';
import {planSilenceChaos} from '../src/free-play-chaos.js';
import {selectDrawGridSilence} from '../src/drawgrid/dg-random-silence.js';
import {looseEndMotion,stringSegments} from '../src/free-play-line-visual.js';
const make=(count=8)=>{const source=createLineSource([{x:.1,y:.8},{x:.9,y:.2}]);source.events=Array.from({length:count},(_,i)=>({...source.events[0],id:'n'+i,x:.1+.8*i/count,y:.8-.6*i/count,pathDistance:source.path.totalLength*i/count,offsetTick:i*48}));source.durationTicks=count*48;return {id:'line',source,straightened:false,randomCutIds:[]};};
const stamp=(x=.5,y=.5)=>({id:'ink',seed:42,x,y,radius:.065,space:'surface-v2',owner:'line'});

test('the shared DrawGrid silence policy retains a whole source column with polyphonic nodes',()=>{
 const notes=[{id:'a',col:0},{id:'b',col:0},{id:'c',col:1},{id:'d',col:1}];
 const selected=selectDrawGridSilence(notes,{random:()=>0});assert.deepEqual(selected,['a','b']);
 assert.deepEqual(selectDrawGridSilence(notes.slice(0,2),{random:()=>0}),[]);
});

test('the exact rendered ellipses define center, edge and droplet coverage at all canvas sizes',()=>{
 const s=stamp(),shapes=paintShapes(s),drawn=[];
 const ctx={save(){},restore(){},beginPath(){},fill(){},ellipse(x,y,rx,ry){drawn.push({x,y,rx,ry});}};
 for(const [w,h]of [[800,600],[1600,400],[350,900]]){
  drawn.length=0;drawPaintShapes(ctx,shapes,w,h);
  drawn.forEach((p,i)=>{assert.equal(p.x,shapes[i].x*w);assert.equal(p.ry,shapes[i].ry*h);});
 }
 const edge={x:shapes[0].x+shapes[0].rx,y:shapes[0].y};assert.equal(paintShapeContains(shapes[0],edge),true);
 assert.equal(paintShapeContains(shapes[0],{...edge,x:edge.x+1e-6}),false);
 assert.equal(paintShapeContains(shapes[1],shapes[1]),true);
});

test('coverage includes other lines and recomputes on coiled/uncoiled layout without cached IDs',()=>{
 const a=make(),b={...make(),id:'b',source:{...make().source,events:make().source.events.map(n=>({...n,id:'b'+n.id}))}};
 for(const straightened of [false,true]){
  a.straightened=b.straightened=straightened;
  const node=canonicalLineNodes(a)[3],s=stamp(node.x,node.y);s.notes=['stale'];
  const result=evaluateScenePaint([a,b],[s]);assert.ok(result.coveredIds.includes('n3'));assert.ok(result.coveredIds.includes('bn3'));
  assert.ok(!result.coveredIds.includes('stale'));assert.deepEqual(evaluateScenePaint([a,b],[]).coveredIds,[]);
 }
});

test('topmost removal preserves overlapping paint and independent scissor reasons',()=>{
 const line=make(),node=canonicalLineNodes(line)[3],a=stamp(node.x,node.y),b={...a,id:'top'};
 assert.equal(topPaintAt([a,b],node).id,'top');
 const note={id:'n3',sourceMidi:73,col:3,scissorMuted:true};
 updateSilence([note],{coveredIds:evaluateScenePaint([line],[a]).coveredIds});assert.equal(note.paintCovered,true);
 updateSilence([note],{coveredIds:[]});assert.equal(eventMuted(note),true);assert.equal(note.sourceMidi,73);
 updateSilence([note],{cuts:{n3:false}});assert.equal(eventMuted(note),false);
});

for(const count of [1,4,8,32])for(const tool of ['scissors','paint'])test(`${tool}: seeded ${count}-note selection is repeatable, bounded and agrees with canonical coverage`,()=>{
 const line=make(count),original=structuredClone(line),a=planSilenceChaos([line],tool,123),b=planSilenceChaos([line],tool,123);
 assert.deepEqual(a,b);assert.deepEqual(line,original);assert.ok(a.targets.length<count||count===0);
 if(tool==='scissors')assert.deepEqual(a.plans[0].randomCutIds,selectDrawGridSilence(line.source.events.map(n=>({...n,col:n.offsetTick/48})),{steps:Math.max(8,Math.ceil(count/8)*8),seed:123}));
 else{
  const covered=evaluateScenePaint([line],a.paint).coveredIds;
  for(const node of a.targets)assert.ok(covered.includes(node.id));
  for(const cosmetic of a.paint.filter(s=>s.id.startsWith('random-cosmetic')))assert.deepEqual(evaluateScenePaint([line],[cosmetic]).coveredIds,[]);
  assert.equal(new Set(a.paint.map(s=>s.id)).size,a.paint.length);
 }
});

test('new seeds vary selection and Randomise Again replaces owned cuts/paint while preserving manual edits',()=>{
 const line=make(32);line.source.events[0].scissorMuted=true;
 const a=planSilenceChaos([line],'scissors',1),b=planSilenceChaos([line],'scissors',987);assert.notDeepEqual(a.targets.map(n=>n.id),b.targets.map(n=>n.id));assert.ok(!a.targets.some(n=>n.id==='n0'));
 line.randomCutIds=a.plans[0].randomCutIds;for(const n of line.source.events)if(line.randomCutIds.includes(n.id))n.scissorMuted=true;
 const again=planSilenceChaos([line],'scissors',987);assert.equal(again.plans[0].cuts.n0,undefined);
 const manual=stamp(.98,.01),p=planSilenceChaos([make(32)],'paint',5,[manual]);
 const q=planSilenceChaos([make(32)],'paint',6,p.paint);assert.ok(q.paint.some(s=>s.id===manual.id));assert.ok(!q.paint.some(s=>s.randomTool==='paint'&&p.paint.some(old=>old.id===s.id)));
});

test('loose ends start with motion, overshoot, damp and settle downward; mend restores exact geometry',()=>{
 assert.deepEqual(looseEndMotion(0),{x:0,y:0});assert.ok(Math.abs(looseEndMotion(.1).x)>1);
 assert.ok(looseEndMotion(.15).y>32);assert.ok(Math.abs(looseEndMotion(4).x)<.001);assert.ok(Math.abs(looseEndMotion(4).y-32)<.001);
 const line=make(),s=line.source,saved=structuredClone(s),motion=new Map([['n3',{cut:true,cutAt:0,mendAt:-1e9}]]);
 const before=stringSegments(s,0,600);s.events[3].scissorMuted=true;const early=stringSegments(s,0,600,1,motion,100),late=stringSegments(s,0,600,1,motion,4000);assert.notDeepEqual(early,late);
 s.events[3].scissorMuted=false;motion.set('n3',{cut:false,cutAt:0,mendAt:5000});assert.notDeepEqual(stringSegments(s,0,600,1,motion,5100),before);assert.deepEqual(stringSegments(s,0,600,1,motion,5400),before);
 for(let i=0;i<20;i++){s.events[3].scissorMuted=true;stringSegments(s,1,600);s.events[3].scissorMuted=false;}assert.deepEqual(s.path,saved.path);
});

test('random cuts are canonical immediately but their physical reaction starts when the scissors visit',()=>{
 const s=make().source,before=stringSegments(s,0,600),motion=new Map([['n3',{cut:true,cutAt:500,mendAt:-1e9}]]);
 s.events[3].scissorMuted=true;assert.equal(eventMuted(s.events[3]),true);
 assert.deepEqual(stringSegments(s,0,600,1,motion,250),before);
 assert.notDeepEqual(stringSegments(s,0,600,1,motion,600),before);
});
