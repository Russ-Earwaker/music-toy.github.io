import test from 'node:test';
import assert from 'node:assert/strict';
import {createLineSource} from '../src/free-play-line.js';
import {lineDrawGridStates,prepareFreePlayDrawGridState} from '../src/free-play-drawgrid.js';
import {straightenedLinePoint} from '../src/free-play-line-visual.js';
import {sourceMidiToRow,rowToSourceMidi,restoreAuthoredNotes,moveAuthoredNote,drawgridPatternFromState,authoredNoteAt,authoredPerformanceOptions} from '../src/drawgrid/dg-authored-notes.js';
import {createDrawGridLogicalGeometry,getDrawGridLogicalNodeCenter,drawGridLogicalRowFromPoint} from '../src/drawgrid/drawgrid-viewport-space.js';
import {resolveMusicalPitch,noteMidi} from '../src/harmonic-adaptation.js';
import {readToySoundState,restoreToySoundState} from '../src/instrument-state.js';
export const gestures={
 rise:[{x:.1,y:.99},{x:.9,y:.01}],
 fall:[{x:.1,y:.01},{x:.9,y:.99}],
 zigzag:Array.from({length:5},(_,i)=>({x:.1+i*.2,y:i%2?.01:.99})),
 spiral:Array.from({length:241},(_,i)=>{const a=i/240*8*Math.PI,r=.48-i/240*.1;return{x:.5+Math.cos(a)*r,y:.5+Math.sin(a)*r};}),
 abrupt:Array.from({length:21},(_,i)=>({x:.5,y:i%2?0:1})),
 maximum:Array.from({length:81},(_,i)=>({x:i%2?.9:.1,y:i%2?.01:.99}))
};
for(const[name,points]of Object.entries(gestures))test(name+': extreme canonical nodes, curve, range, preview/schedule and reload',()=>{
 const source=createLineSource(points),original=structuredClone(source),states=lineDrawGridStates(source,name);
 let count=0;
 for(const state of states){
  const p={};restoreAuthoredNotes(p,state);const pattern=drawgridPatternFromState(state),g=createDrawGridLogicalGeometry({rows:12});
  for(const n of state.authoredNotes){
   count++;const row=sourceMidiToRow(n.sourceMidi,state.pitchRange),pos=getDrawGridLogicalNodeCenter(g,n.col,row);
   assert.equal(Math.floor(n.sourceMidi/12)*12+rowToSourceMidi(drawGridLogicalRowFromPoint(g,pos),state.pitchRange)%12,n.sourceMidi);
   const scheduled=pattern.cols[n.col].notes.find(x=>x.id===n.id),preview=authoredNoteAt(p,n.col,row);
   assert.equal(scheduled.sourceMidi,preview.sourceMidi);assert.deepEqual(authoredPerformanceOptions(p,scheduled),authoredPerformanceOptions(p,preview));
   assert.ok(pos.y>30&&pos.y<570);assert.ok(state.strokes[0].ptsN.some(pt=>Math.abs(pt.ny-(row+.5)/12)<1e-9&&Math.abs(pt.nx-(n.col+.5)/8)<1e-9));
   const t=(state.freePlay.startTick+n.col*48)/source.durationTicks,fp=straightenedLinePoint(source,t);
   assert.ok(Math.abs(fp.y-source.events.find(e=>e.offsetTick===state.freePlay.startTick+n.col*48).y)<1e-8);
  }
  assert.ok(state.strokes[0].ptsN.every(p=>p.ny>=0&&p.ny<=1&&p.nx>=0&&p.nx<=1));
  assert.deepEqual(prepareFreePlayDrawGridState(JSON.parse(JSON.stringify(state))),state);
 }
 assert.equal(count,source.events.length);assert.deepEqual(source,original);
 if(name==='maximum')assert.equal(source.durationTicks,1536);
 if(name==='spiral')assert.ok(states.length>1);
});
test('three octaves fold onto 12 rows without losing source identity on chromatic edits',()=>{
 const range={minMidi:48,maxMidi:59},g=createDrawGridLogicalGeometry({rows:12});
 for(let midi=48;midi<=83;midi++){
  const row=sourceMidiToRow(midi,range),pos=getDrawGridLogicalNodeCenter(g,0,row);
  assert.equal(Math.floor(midi/12)*12+rowToSourceMidi(drawGridLogicalRowFromPoint(g,pos),range)%12,midi);
 }
 for(const sequence of [[69,71,72,74],[74,72,71,69]]){
  const ys=sequence.map(m=>getDrawGridLogicalNodeCenter(g,0,sourceMidiToRow(m,range)).y);
  assert.deepEqual(ys,sequence.map(m=>30+(11-m%12+.5)*45));
 }
 const p={__dgAuthoredNotes:[{id:'C5',col:0,sourceMidi:72}],__dgPitchRange:range};
 for(const midi of [73,72,83,72]){const n=p.__dgAuthoredNotes[0];moveAuthoredNote(p,0,sourceMidiToRow(n.sourceMidi,range),sourceMidiToRow(midi,range));assert.equal(n.sourceMidi,midi);assert.equal(n.id,'C5');}
});
test('Register +/-1 +/-2 and zero preserves intervals, source identity and sound-state persistence',()=>{
 const old=globalThis.CustomEvent;globalThis.CustomEvent=class{constructor(type){this.type=type;}};
 try{
  const p={dataset:{toy:'drawgrid',instrument:'PIANO'},dispatchEvent(){}},source=[48,71,72,81],before=structuredClone(source);
  for(const registerOctaves of [0,1,-1,2,-2,0]){
   restoreToySoundState(p,{registerOctaves});
   assert.equal(readToySoundState(p).registerOctaves,registerOctaves);
   const restored={dataset:{toy:'drawgrid'},dispatchEvent(){}};restoreToySoundState(restored,JSON.parse(JSON.stringify(readToySoundState(p))));assert.equal(restored.dataset.registerOctaves,String(registerOctaves));
   const final=source.map(sourcePitch=>noteMidi(resolveMusicalPitch({sourcePitch,registerOctaves:p.dataset.registerOctaves}).finalNote));
   assert.deepEqual(final,source.map(n=>n+12*registerOctaves));assert.deepEqual(source,before);
  }
  assert.equal(noteMidi(resolveMusicalPitch({sourcePitch:'C5',registerOctaves:1}).finalNote),84);
  assert.equal(noteMidi(resolveMusicalPitch({sourcePitch:'C#5',registerOctaves:1}).finalNote),85);
  assert.equal(noteMidi(resolveMusicalPitch({sourcePitch:'C5',registerOctaves:1,localTranspose:2,context:{transposeSemitones:3}}).finalNote),89);
  assert.equal(noteMidi(resolveMusicalPitch({sourcePitch:'C5',registerOctaves:2,role:'percussion'}).finalNote),72);
 }finally{globalThis.CustomEvent=old;}
});

test('consecutive-step extremes across chunks and partial bar keep canonical pitches and smooth ink',()=>{
 for(const durationTicks of [1100,1536]){
  const midi=Array.from({length:Math.ceil(durationTicks/48)},(_,i)=>i%2?81:48);
  const source={instrument:'PIANO',events:midi.map((m,i)=>({midi:m,offsetTick:i*48})),durationTicks,path:{points:[],distances:[],totalLength:0}};
  const states=lineDrawGridStates(source,'abrupt-fixture');
  assert.deepEqual(states.flatMap(s=>s.authoredNotes.map(n=>n.sourceMidi)),midi);
  assert.equal(states.at(-1).freePlay.durationTicks,durationTicks%384||384);
  for(const s of states){assert.deepEqual(prepareFreePlayDrawGridState(JSON.parse(JSON.stringify(s))),s);assert.ok(s.strokes[0].ptsN.every(p=>p.ny>=0&&p.ny<=1));}
 }
});
