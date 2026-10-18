import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAuthoredState,restoreAuthoredNotes,syncAuthoredNotes,moveAuthoredNote,authoredNoteAt,sourceMidiToRow,rowToSourceMidi,authoredPerformanceOptions,drawgridPatternFromState} from '../src/drawgrid/dg-authored-notes.js';
import {createDrawGridLogicalGeometry,getDrawGridLogicalNodeCenter,drawGridLogicalRowFromPoint} from '../src/drawgrid/drawgrid-viewport-space.js';
import {lineDrawGridStates,prepareFreePlayDrawGridState} from '../src/free-play-drawgrid.js';
import {createLineSource,LINE_STEP_TICKS} from '../src/free-play-line.js';
import {straightenedLinePoint} from '../src/free-play-line-visual.js';
import {upgradeDrawGridStroke} from '../src/drawgrid/drawgrid-stroke-persistence.js';
import {DRAWGRID_VISIBLE_RANGE} from '../src/drawgrid/dg-pitch-presentation.js';
const empty=()=>Array.from({length:8},()=>[]);
const mapFor=st=>({nodes:st.nodes.list.map(rows=>new Set(rows))});
const almost=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
for(const midi of [48,60,69,81])test(`MIDI ${midi}: stable ID, no-op drag, adjacent semitone and exact restore`,()=>{
 const source={events:[{midi,offsetTick:0}],durationTicks:96,path:{points:[{x:0,y:0}],distances:[0],totalLength:0}},state=lineDrawGridStates(source,'stroke')[0],panel={};restoreAuthoredNotes(panel,state);const note=panel.__dgAuthoredNotes[0],id=note.id,row=sourceMidiToRow(midi,state.pitchRange),g=createDrawGridLogicalGeometry({rows:12});
 const position=getDrawGridLogicalNodeCenter(g,0,row);assert.equal(drawGridLogicalRowFromPoint(g,position),row);assert.equal(Math.floor(midi/12)*12+rowToSourceMidi(row,state.pitchRange)%12,midi);
 moveAuthoredNote(panel,0,row,row);assert.deepEqual(panel.__dgAuthoredNotes[0],{id,col:0,sourceMidi:midi});
 moveAuthoredNote(panel,0,row,row-1);assert.equal(note.sourceMidi,midi+1);assert.equal(note.id,id);
 moveAuthoredNote(panel,0,row-1,row);assert.equal(note.sourceMidi,midi);assert.equal(note.id,id);
 const snapshot=normalizeAuthoredState({...state,authoredNotes:panel.__dgAuthoredNotes});assert.equal(snapshot.authoredNotes[0].id,id);assert.equal(snapshot.authoredNotes[0].sourceMidi,midi);
 assert.deepEqual(authoredPerformanceOptions(panel,note),{pitchShift:true,octave:Math.floor(midi/12)-1});
});
test('legacy row-based saves infer source MIDI and preserve legacy instrument policy and node masks',()=>{
 const st=normalizeAuthoredState({steps:8,instrument:'PIANO',nodes:{list:[[0],[2],[11],...empty().slice(3)],active:[true,false,true],disabled:[[],[2],...empty().slice(2)]},strokes:[]});
 assert.deepEqual(st.authoredNotes.map(n=>n.sourceMidi),[59,57,48]);assert.deepEqual(st.pitchRange,{minMidi:48,maxMidi:59});assert.equal(st.preserveSourceRegister,false);assert.deepEqual(st.nodes.list.slice(0,3),[[0],[2],[11]]);assert.deepEqual(st.nodes.disabled[1],[2]);const p={};restoreAuthoredNotes(p,st);assert.deepEqual(authoredPerformanceOptions(p,st.authoredNotes[0]),{});
 assert.deepEqual(normalizeAuthoredState(st),st);
});
test('old Free Play coordinate lookup migrates once into source notes, full-range rows and normal stroke data',()=>{
 const st=prepareFreePlayDrawGridState({steps:8,strokes:[],nodes:{list:[[2],...empty().slice(1)],active:[true],disabled:empty()},freePlay:{strokeId:'old',bar:0,startTick:0,durationTicks:154,phraseDurationTicks:154,midi:{'0:2':81}}});
 assert.equal(st.authoredNotes[0].sourceMidi,81);assert.equal(st.nodes.list[0][0],2);assert.ok(!('midi' in st.freePlay));assert.ok(st.strokes[0].ptsN.length>200);assert.deepEqual(prepareFreePlayDrawGridState(st),st);
});
test('changing an editor coordinate retains note ID and publishes source pitches to the ordinary pattern',()=>{
 const st=normalizeAuthoredState({steps:8,nodes:{list:[[2],...empty().slice(1)],active:[true],disabled:empty()},authoredNotes:[{id:'stable',col:0,sourceMidi:81}],pitchRange:DRAWGRID_VISIBLE_RANGE,preserveSourceRegister:true});const p={};restoreAuthoredNotes(p,st);const map=mapFor(st);moveAuthoredNote(p,0,2,1);map.nodes[0]=new Set([1]);syncAuthoredNotes(p,map);
 const edited={...st,authoredNotes:p.__dgAuthoredNotes,nodes:{...st.nodes,list:[[1],...empty().slice(1)]}},pat=drawgridPatternFromState(edited);assert.equal(pat.cols[0].notes[0].id,'stable');assert.equal(pat.cols[0].notes[0].sourceMidi,82);assert.equal(authoredNoteAt(p,0,1).sourceMidi,82);
});
test('source preview and scheduled note snapshots use identical authored pitches and performance options',()=>{
 const st=lineDrawGridStates(createLineSource([{x:.1,y:.02},{x:.6,y:.02}]),'a')[0],p={};restoreAuthoredNotes(p,st);const pat=drawgridPatternFromState(st);for(const n of pat.cols[0].notes){const preview=authoredNoteAt(p,n.col,n.row);assert.equal(preview.sourceMidi,n.sourceMidi);assert.deepEqual(authoredPerformanceOptions(p,preview),authoredPerformanceOptions(p,n));}
});
test('smooth stroke is persisted in normal ptsN format, passes through nodes, and preserves the partial endpoint',()=>{
 const points=[{x:0,y:.8},{x:1,y:.2},{x:0,y:.7},{x:.4,y:.3}],source=createLineSource(points),before=structuredClone(source),states=lineDrawGridStates(source,'curve');
 for(const [bar,st]of states.entries()){
  assert.ok(st.strokes[0].noteDriven);assert.ok(!('midi' in st.freePlay));const stroke=upgradeDrawGridStroke(st.strokes[0]);assert.ok(stroke.pts.length>200);
  for(const note of st.authoredNotes){const globalTick=bar*384+note.col*LINE_STEP_TICKS,nodeY=(11-note.sourceMidi%12+.5)/12;assert.ok(st.strokes[0].ptsN.some(p=>Math.abs(p.nx-(note.col+.5)/8)<1e-8&&Math.abs(p.ny-nodeY)<1e-8));const fp=straightenedLinePoint(source,globalTick/source.durationTicks);almost(fp.y,source.events.find(e=>e.offsetTick===globalTick).y);}
  if(st.freePlay.durationTicks<336){almost(st.strokes[0].ptsN.at(-1).nx,.0625+st.freePlay.durationTicks/384);assert.ok(st.strokes[0].ptsN.at(-1).nx<1);}
  const reloaded=prepareFreePlayDrawGridState(JSON.parse(JSON.stringify(st)));assert.deepEqual(reloaded,st);
 }
 assert.deepEqual(source,before);assert.equal(states.reduce((n,s)=>n+s.authoredNotes.length,0),source.events.length);
});

test('existing row-based programmatic edits of captured ordinary states retain their authored recipe',()=>{
 const initial=normalizeAuthoredState({steps:8,strokes:[],nodes:{list:[[2],[5],[],[],[],[],[],[]],active:[true,true],disabled:empty()}});
 const external={...initial,nodes:{...initial.nodes,list:[[4],[1],[],[],[],[],[],[]]}};
 const changed=normalizeAuthoredState(external);assert.deepEqual(changed.authoredNotes.map(n=>n.sourceMidi),[55,58]);assert.deepEqual(changed.nodes.list,external.nodes.list);
 const pitchOnly={...initial,authoredNotes:initial.authoredNotes.map(n=>({...n,sourceMidi:n.sourceMidi+1}))};const canonical=normalizeAuthoredState(pitchOnly);assert.deepEqual(canonical.authoredNotes.map(n=>n.sourceMidi),[58,55]);assert.deepEqual(canonical.nodes.list.slice(0,2),[[1],[4]]);
});
