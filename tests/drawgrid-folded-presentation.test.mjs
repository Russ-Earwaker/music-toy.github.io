import test from 'node:test';
import assert from 'node:assert/strict';
import {createLineSource,linePitch,linePointAt,SAFE_LINE_MIDI,FREE_PLAY_PITCH_CLASSES} from '../src/free-play-line.js';
import {lineDrawGridStates,prepareFreePlayDrawGridState,drawGridLineSource} from '../src/free-play-drawgrid.js';
import {linePresentation,straightenedLinePoint,drawMusicalLine} from '../src/free-play-line-visual.js';
import {normalizeAuthoredState,restoreAuthoredNotes,syncAuthoredNotes,moveAuthoredNote,drawgridPatternFromState,sourceMidiToRow} from '../src/drawgrid/dg-authored-notes.js';
import {createDgNoteGrid,octaveOffsetMarker} from '../src/drawgrid/dg-note-grid.js';
import {buildPalette,midiToName} from '../src/note-helpers.js';
import {createDrawGridLogicalGeometry,getDrawGridLogicalNodeCenter} from '../src/drawgrid/drawgrid-viewport-space.js';
import {makeAuthoredStroke} from '../src/drawgrid/dg-authored-stroke.js';
const almost=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const empty=()=>Array.from({length:8},()=>[]);

test('nearest pentatonic generation leaves coiled sampled geometry exactly on the drawing',()=>{
 for(let i=0;i<=1000;i++){
  const y=i/1000,target=48+(1-y)*33,midi=linePitch(y);
  assert.ok(SAFE_LINE_MIDI.includes(midi));
  assert.equal(Math.abs(midi-target),Math.min(...SAFE_LINE_MIDI.map(n=>Math.abs(n-target))));
 }
 const s=createLineSource([{x:.1,y:.97},{x:.9,y:.03},{x:.1,y:.97},{x:.9,y:.03}]),saved=structuredClone(s);
 for(const e of s.events){const p=linePointAt(s.path,e.pathDistance);assert.equal(e.x,p.x);assert.equal(e.y,p.y);assert.ok(FREE_PLAY_PITCH_CLASSES.includes(e.midi%12));}
 assert.equal(linePresentation(s,0),s);for(const m of [0,.25,.75,1,0])linePresentation(s,m);assert.deepEqual(s,saved);
});

test('all generated pitches share normal 12-row geometry and match actual per-grid suggestion highlighting',()=>{
 const s=createLineSource(Array.from({length:9},(_,i)=>({x:i%2?.9:.1,y:i%2?.01:.99}))),states=lineDrawGridStates(s,'folded');
 assert.equal(states.length,4);
 for(const st of states){
  assert.deepEqual(st.pitchRange,{minMidi:48,maxMidi:59});assert.deepEqual(st.suggestedPitchClasses,[0,2,4,7,9]);
  const p={};restoreAuthoredNotes(p,st);const rects=[],ctx={save(){},restore(){},fillRect(x,y,w,h){rects.push({x,y,w,h});},strokeRect(){}};
  const grid=createDgNoteGrid({state:{panel:p,cols:8,rows:12,cw:92.5,ch:45,gridArea:{x:30,y:30},topPad:0,dragScaleHighlightCol:0,gridVisibilityAlpha:1},deps:{buildPalette,midiToName}});
  grid.renderDragScaleBlueHints(ctx);
  for(const n of st.authoredNotes){const row=sourceMidiToRow(n.sourceMidi);assert.ok(row>=0&&row<12);assert.ok(rects.some(r=>r.y===30+row*45));}
  assert.equal(rects.length,5);
 }
 // An ordinary grid retains its own minor policy.
 const p={};restoreAuthoredNotes(p,normalizeAuthoredState({nodes:{list:empty()}}));assert.deepEqual([...p.__dgSuggestedPitchClasses],[0,3,5,7,10]);
});

test('Uncoil preserves gesture heights independently of folded DrawGrid rows and never labels octaves',()=>{
 const s=createLineSource([{x:.1,y:.99},{x:.9,y:.01},{x:.2,y:.9}]),view=linePresentation(s,1),g=createDrawGridLogicalGeometry({rows:12});
 for(const [i,e] of s.events.entries()){
  const center=getDrawGridLogicalNodeCenter(g,i%8,sourceMidiToRow(e.midi)),curve=straightenedLinePoint(s,e.offsetTick/s.durationTicks);
  almost(view.events[i].y,e.y);almost(curve.y,e.y);assert.equal(view.events[i].midi,e.midi);
 }
 const texts=[],ctx=new Proxy({fillText(t){texts.push(t);}},{get:(o,k)=>o[k]??(()=>{})});
 drawMusicalLine(ctx,s,{width:800,height:600,morph:0});assert.deepEqual(texts,[]);
 drawMusicalLine(ctx,s,{width:800,height:600,morph:1});assert.deepEqual(texts,[]);
});

test('A4/A5/A6 on one row retain all IDs, source pitches, markers and scheduled voices',()=>{
 const state=normalizeAuthoredState({steps:8,preserveSourceRegister:true,pitchRange:{minMidi:48,maxMidi:83},authoredNotes:[69,81,93].map((sourceMidi,i)=>({id:'a'+i,col:0,sourceMidi})),nodes:{list:[[14,2,-10],...empty().slice(1)],active:[true],disabled:empty()}}),p={};
 restoreAuthoredNotes(p,state);const map={nodes:state.nodes.list.map(rs=>new Set(rs))};
 assert.deepEqual(syncAuthoredNotes(p,map).map(n=>n.sourceMidi),[69,81,93]);assert.deepEqual(state.nodes.list[0],[2]);
 assert.deepEqual(drawgridPatternFromState(state).cols[0].notes.map(n=>n.sourceMidi),[69,81,93]);
 assert.deepEqual(state.authoredNotes.map(n=>octaveOffsetMarker(n.sourceMidi,3)),['+1','+2','+3']);
 moveAuthoredNote(p,0,2,1);assert.deepEqual(p.__dgAuthoredNotes.map(n=>n.sourceMidi),[70,82,94]);assert.deepEqual(p.__dgAuthoredNotes.map(n=>n.id),['a0','a1','a2']);
});

test('folded row editing stays chromatic in the existing source octave; static ink and reload stay exact',()=>{
 const source=createLineSource([{x:.1,y:.01},{x:.9,y:.99}]),st=lineDrawGridStates(source,'edit')[0],p={};restoreAuthoredNotes(p,st);
 const ink=structuredClone(st.strokes),original=structuredClone(st.freePlay.path),note=p.__dgAuthoredNotes[0],id=note.id;
 assert.equal(note.sourceMidi,81);moveAuthoredNote(p,0,2,5);assert.equal(note.sourceMidi,78);assert.ok(!FREE_PLAY_PITCH_CLASSES.includes(note.sourceMidi%12));assert.equal(note.id,id);
 const edited=normalizeAuthoredState({...st,authoredNotes:p.__dgAuthoredNotes});
 const saved=prepareFreePlayDrawGridState(JSON.parse(JSON.stringify(edited)));
 assert.equal(saved.authoredNotes[0].sourceMidi,78);assert.deepEqual(saved.strokes,ink);assert.deepEqual(saved.freePlay.path,original);assert.deepEqual(saved.suggestedPitchClasses,st.suggestedPitchClasses);
});

test('old absolute-height saves migrate frozen ink and disabled rows once without changing edited source pitches',()=>{
 const points=Array.from({length:257},(_,i)=>({nx:.0625+i/256*.25,ny:(83-(48+i/256*12)+.5)/36}));
 const old={steps:8,pitchRange:{minMidi:48,maxMidi:83},preserveSourceRegister:true,authoredNotes:[{id:'edited',col:0,sourceMidi:73}],nodes:{list:[[10],...empty().slice(1)],active:[true],disabled:[[10],...empty().slice(1)]},freePlay:{strokeId:'old',bar:0,startTick:0,durationTicks:96,phraseDurationTicks:96,path:{points:[{x:0,y:1},{x:1,y:0}],distances:[0,1.4],totalLength:1.4}},strokes:[{ptsN:points,noteDriven:true,color:'#fff'}]};
 const migrated=prepareFreePlayDrawGridState(old);assert.equal(migrated.authoredNotes[0].sourceMidi,73);assert.equal(migrated.authoredNotes[0].id,'edited');assert.deepEqual(migrated.nodes.disabled[0],[10]);assert.deepEqual(migrated.pitchRange,{minMidi:48,maxMidi:59});
 almost(migrated.strokes[0].ptsN[0].ny,11.5/12); // frozen C3, not edited C#5
 assert.deepEqual(prepareFreePlayDrawGridState(JSON.parse(JSON.stringify(migrated))),migrated);
});
