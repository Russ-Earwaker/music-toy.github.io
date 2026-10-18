import test from 'node:test';
import assert from 'node:assert/strict';
import {createLineSource,SAFE_LINE_MIDI,LINE_MAX_TICKS} from '../src/free-play-line.js';
import {straightenedLinePoint,linePresentation,linePresentationPoint} from '../src/free-play-line-visual.js';
import {lineDrawGridStates} from '../src/free-play-drawgrid.js';
const almost=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
export const curves={
 rising:[{x:.1,y:.95},{x:.8,y:.05}],
 zigzag:[{x:.1,y:.9},{x:.3,y:.1},{x:.5,y:.9},{x:.7,y:.1},{x:.9,y:.9}],
 circle:Array.from({length:81},(_,i)=>({x:.5+.3*Math.cos(i/80*Math.PI*2),y:.5+.3*Math.sin(i/80*Math.PI*2)})),
 spiral:Array.from({length:121},(_,i)=>{const a=i/120*Math.PI*6,r=.28-i/120*.14;return {x:.5+Math.cos(a)*r,y:.5+Math.sin(a)*r};}),
 maximum:Array.from({length:81},(_,i)=>({x:i%2?.9:.1,y:.5+.35*Math.sin(i*.7)})),
};
for(const [name,points]of Object.entries(curves))test(`${name}: smooth time curve passes through authoritative notes without overshoot or music changes`,()=>{
 const source=createLineSource(points),saved=structuredClone(source),grids=lineDrawGridStates(source,'proof');
 assert.ok(source.events.length>1);
 for(const event of source.events){const p=straightenedLinePoint(source,event.offsetTick/source.durationTicks);almost(p.x,.06+.88*event.offsetTick/LINE_MAX_TICKS);almost(p.y,event.y);}
 for(let i=0;i<source.events.length-1;i++){
  const a=source.events[i],b=source.events[i+1],p=a.offsetTick/source.durationTicks,q=b.offsetTick/source.durationTicks;
  const ys=source.path.points.map(p=>p.y),ya=Math.min(...ys),yb=Math.max(...ys);
  for(let j=0;j<=20;j++){const point=straightenedLinePoint(source,p+(q-p)*j/20);assert.ok(point.y>=Math.min(ya,yb)-1e-9&&point.y<=Math.max(ya,yb)+1e-9);}
  const epsilon=1e-7,left=straightenedLinePoint(source,q-epsilon),center=straightenedLinePoint(source,q),right=straightenedLinePoint(source,q+epsilon);
  assert.ok(Math.abs((center.y-left.y)/epsilon-(right.y-center.y)/epsilon)<.01,'continuous tangent at node');
 }
 for(const morph of [0,.3,.7,1]){const view=linePresentation(source,morph);assert.deepEqual(view.events.map(e=>[e.note,e.midi,e.offsetTick]),saved.events.map(e=>[e.note,e.midi,e.offsetTick]));for(const e of source.events){const progress=e.offsetTick/source.durationTicks,node=view.events.find(n=>n.offsetTick===e.offsetTick);const tip=linePresentationPoint(source,progress,morph);almost(tip.x,node.x);almost(tip.y,node.y);almost(node.y,e.y);}}
 for(let i=0;i<30;i++){linePresentation(source,1);assert.deepEqual(linePresentation(source,0),saved);}
 assert.deepEqual(source,saved);assert.deepEqual(lineDrawGridStates(source,'proof'),grids);
 if(name==='maximum')assert.equal(source.durationTicks,LINE_MAX_TICKS);
});
test('geometric curve rounds zigzag corners',()=>{const s=createLineSource(curves.zigzag);let curved=false;for(let i=0;i<s.events.length-1;i++){const a=s.events[i].offsetTick/s.durationTicks,b=s.events[i+1].offsetTick/s.durationTicks;const ya=straightenedLinePoint(s,a).y,yb=straightenedLinePoint(s,b).y;const y=straightenedLinePoint(s,a+(b-a)*.25).y;if(Math.abs(y-(ya*.75+yb*.25))>1e-5)curved=true;}assert.ok(curved);});

test('Uncoil geometry ignores edited MIDI and frozen DrawGrid pitch metadata',()=>{
 const source=createLineSource(curves.zigzag),before=linePresentation(source,1);
 const edited={...source,events:source.events.map(e=>({...e,midi:e.midi+12})),visualEvents:source.events.map(e=>({...e,midi:48}))};
 const after=linePresentation(edited,1);
 assert.deepEqual(after.path,before.path);
 assert.deepEqual(after.events.map(e=>[e.x,e.y]),before.events.map(e=>[e.x,e.y]));
 assert.deepEqual(after.events.map(e=>e.midi),edited.events.map(e=>e.midi));
});
