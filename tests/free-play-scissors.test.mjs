import test from 'node:test';
import assert from 'node:assert/strict';
import {createScissorsStroke,nearestCutGap,SCISSORS_RADIUS,HEAL_RADIUS} from '../src/free-play-scissors.js';
import {createLineSource} from '../src/free-play-line.js';
import {stringSegments} from '../src/free-play-line-visual.js';
import {updateSilence,eventMuted} from '../src/free-play-silence.js';
import {contentPointer} from '../src/surface-coordinates.js';
const nodes=()=>[100,200,300].map((x,i)=>({lineId:'a',id:'n'+i,x,y:100,sourceMidi:60+i,scissorMuted:false}));
function stroke(points,ns=nodes()){const s=createScissorsStroke(points[0]),hits=[];for(const p of points.slice(1))hits.push(...s.add(p,ns));return {s,hits};}
test('one forgiving swipe cuts a node; a tap does not cut',()=>{
 assert.deepEqual(stroke([{x:100,y:50},{x:100,y:150}]).hits.map(n=>n.id),['n0']);
 const tap=stroke([{x:100,y:100},{x:106,y:100}]);assert.equal(tap.s.isSwipe,false);assert.deepEqual(tap.hits,[]);
});
test('small touch jitter stays a tap regardless of the number of samples',()=>{
 const jitter=stroke([{x:100,y:100},...Array.from({length:80},(_,i)=>({x:100+(i%2?4:-4),y:100}))]);assert.equal(jitter.s.isSwipe,false);assert.deepEqual(jitter.hits,[]);
});
test('coarse fast and finely sampled slow swipes cut the same nodes in crossing order',()=>{
 const coarse=stroke([{x:50,y:100},{x:350,y:100}]),fine=stroke(Array.from({length:101},(_,i)=>({x:50+i*3,y:100})));
 assert.deepEqual(coarse.hits.map(n=>n.id),['n0','n1','n2']);assert.deepEqual(fine.hits,coarse.hits);
 assert.deepEqual(stroke([{x:350,y:100},{x:50,y:100}]).hits.map(n=>n.id),['n2','n1','n0']);
});
test('backtracking and crossing the same node twice emit one cut per gesture',()=>{
 const {hits}=stroke([{x:50,y:100},{x:350,y:100},{x:50,y:100},{x:350,y:100}]);assert.equal(hits.length,3);assert.equal(new Set(hits.map(n=>n.id)).size,3);
});
test('near misses respect the logical thick-path radius and already-cut nodes are ignored',()=>{
 assert.equal(stroke([{x:50,y:100+SCISSORS_RADIUS},{x:350,y:100+SCISSORS_RADIUS}]).hits.length,3);
 assert.equal(stroke([{x:50,y:101+SCISSORS_RADIUS},{x:350,y:101+SCISSORS_RADIUS}]).hits.length,0);
 const ns=nodes();ns[1].scissorMuted=true;assert.deepEqual(stroke([{x:50,y:100},{x:350,y:100}],ns).hits.map(n=>n.id),['n0','n2']);
});
test('bent polylines follow their segments rather than the start/end chord',()=>{
 const ns=[{lineId:'a',id:'corner',x:200,y:0},{lineId:'a',id:'chord',x:200,y:100}];
 assert.deepEqual(stroke([{x:100,y:100},{x:200,y:0},{x:300,y:100}],ns).hits.map(n=>n.id),['corner']);
});
test('zoom, DPR and content offsets affect only pointer conversion, not cuts or heal radius',()=>{
 const points=[{x:50,y:100},{x:350,y:100}],ns=nodes();
 for(const zoom of [.2,.5,1,2])for(const dpr of [1,2,3]){
  // DPR scales backing pixels, never layout inputs. Recreate actual screen →
  // local conversion including a historical content-space translation.
  const origin={x:40,y:80},offset={x:-200,y:126,width:1068,height:520};
  const canvas={clientWidth:640,clientHeight:440,width:640*dpr,height:440*dpr,getBoundingClientRect:()=>({left:origin.x,top:origin.y,width:640*zoom,height:440*zoom})};
  const screen=points.map(p=>({clientX:origin.x+(p.x+offset.x)*zoom,clientY:origin.y+(p.y+offset.y)*zoom}));
  const local=screen.map(e=>{const p=contentPointer(e,canvas,offset);return {x:p.x*offset.width,y:p.y*offset.height};});
  assert.deepEqual(stroke(local,ns).hits.map(n=>n.id),['n0','n1','n2']);
 }
});
test('healing is generous near resting gaps and loose ends, and far taps do nothing',()=>{
 const gaps=[{lineId:'a',id:'cut',anchors:[{x:100,y:100},{x:110,y:132}]}];
 assert.equal(nearestCutGap({x:100-HEAL_RADIUS,y:100},gaps).id,'cut');assert.equal(nearestCutGap({x:110,y:170},gaps).id,'cut');assert.equal(nearestCutGap({x:0,y:0},gaps),null);
});
test('overlapping gaps choose a deterministic nearest target independent of enumeration order',()=>{
 const gaps=[{lineId:'a',id:'b',anchors:[{x:100,y:100}]},{lineId:'a',id:'a',anchors:[{x:100,y:100}]},{lineId:'a',id:'closer',anchors:[{x:105,y:100}]}];
 assert.equal(nearestCutGap({x:100,y:100},gaps).id,'a');assert.equal(nearestCutGap({x:100,y:100},[...gaps].reverse()).id,'a');assert.equal(nearestCutGap({x:106,y:100},gaps).id,'closer');
});
test('one heal preserves all other cuts, paint mute, pitches and JSON persistence',()=>{
 const ns=nodes();ns.forEach(n=>{n.scissorMuted=true;n.paintCovered=true;});const before=structuredClone(ns);
 updateSilence(ns,{cuts:{n1:false}});assert.equal(ns[1].scissorMuted,false);assert.equal(eventMuted(ns[1]),true);assert.deepEqual(ns[0],before[0]);assert.deepEqual(ns[2],before[2]);assert.deepEqual(ns.map(n=>n.sourceMidi),before.map(n=>n.sourceMidi));assert.deepEqual(JSON.parse(JSON.stringify(ns)),ns);
});
test('the physical mend transition returns to the exact original curve',()=>{
 const source=createLineSource([{x:.1,y:.8},{x:.9,y:.2}]);source.events.forEach((n,i)=>n.id='n'+i);const original=stringSegments(source,0,520),node=source.events[1];
 const motion=new Map([[node.id,{cut:false,cutAt:0,mendAt:1000}]]);
 assert.notDeepEqual(stringSegments(source,0,520,1,motion,1100),original);assert.deepEqual(stringSegments(source,0,520,1,motion,1350),original);
});

const sparseNodes=()=>[0,400,800].map((x,i)=>({lineId:'a',id:'s'+i,x,y:100,progress:i/2}));
const sparsePaths=[{lineId:'a',segments:[[{x:0,y:100,progress:0},{x:800,y:100,progress:1}]]}];
function liveStroke(points,ns=sparseNodes(),ps=sparsePaths){
 const s=createScissorsStroke(points[0]),hits=[];
 for(const p of points.slice(1)){
  const live=s.add(p,ns,ps);hits.push(...live);
  for(const hit of live)ns.find(n=>n.id===hit.id).scissorMuted=true;
 }
 return {s,hits,ns,ps};
}
test('one-unit midpoint steps cut while held at contact; release emits no backlog',()=>{
 const ns=sparseNodes(),s=createScissorsStroke({x:200,y:50});let hits=[];
 for(let y=51;y<=100;y++)hits.push(...s.add({x:200,y},ns,sparsePaths));
 assert.deepEqual(hits.map(n=>n.id),['s0']);
 for(let y=101;y<=150;y++)assert.deepEqual(s.add({x:200,y},ns,sparsePaths),[]);
 assert.deepEqual(s.finish(ns,sparsePaths),[]);
 const fast=liveStroke([{x:200,y:50},{x:200,y:150}]);assert.deepEqual(fast.hits.map(n=>n.id),hits.map(n=>n.id));
});
test('one held gesture cuts distinct crossings and suppresses local repeats',()=>{
 const {s,hits,ns,ps}=liveStroke([{x:170,y:50},{x:170,y:150},{x:170,y:50},{x:600,y:50},{x:600,y:150}]);
 assert.deepEqual(hits.map(n=>n.id),['s0','s1']);assert.deepEqual(s.finish(ns,ps),[]);
});
test('live sparse crossings preserve canonical IDs in coiled and uncoiled views',()=>{
 const source=createLineSource([{x:.1,y:.5},{x:.4,y:.2},{x:.7,y:.8},{x:.9,y:.5}]);
 source.events.forEach((n,i)=>n.id='canonical-'+i);
 for(const morph of [0,1]){
  const segments=stringSegments(source,morph,300).map(s=>s.map(p=>({...p,x:p.x*600,y:p.y*300})));
  const edge=segments[0],i=Math.floor(edge.length/2),a=edge[i-1],b=edge[i],target={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  const length=Math.hypot(b.x-a.x,b.y-a.y),normal={x:-(b.y-a.y)/length,y:(b.x-a.x)/length};
  const ns=[source.events[0],source.events.at(-1)].map((n,i)=>({...n,lineId:'a',x:i?600:0,y:-1000,progress:i}));
  const points=Array.from({length:81},(_,j)=>({x:target.x+normal.x*(j-40),y:target.y+normal.y*(j-40)}));
  const result=liveStroke(points,ns,[{lineId:'a',segments}]);assert.equal(result.hits.length,1);assert.ok(ns.some(n=>n.id===result.hits[0].id));assert.deepEqual(result.s.finish(ns,result.ps),[]);
 }
});
test('a tiny live crossing is resolved without waiting for swipe slop or release',()=>{
 const {s,hits,ns,ps}=liveStroke([{x:170,y:99},{x:170,y:101}]);
 assert.equal(s.isSwipe,false);assert.equal(s.hasCuts,true);assert.equal(hits.length,1);assert.deepEqual(s.finish(ns,ps),[]);
});
test('an earlier direct cut does not suppress a later distinct spline crossing',()=>{
 const {hits}=liveStroke([{x:0,y:50},{x:0,y:150},{x:600,y:150},{x:600,y:50}]);
 assert.deepEqual(hits.map(n=>n.id),['s0','s1']);
});
