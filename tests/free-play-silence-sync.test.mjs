import test from 'node:test';
import assert from 'node:assert/strict';
import {createLineSource} from '../src/free-play-line.js';
import {lineDrawGridStates,drawGridLineSource,prepareFreePlayDrawGridState,applyFreePlayDrawGrid} from '../src/free-play-drawgrid.js';
import {drawgridPatternFromState,restoreAuthoredNotes,sourceMidiToRow} from '../src/drawgrid/dg-authored-notes.js';
import {healLineCuts,wipeLinePaint} from '../src/free-play-silence-reset.js';
import {updateSilence,eventMuted} from '../src/free-play-silence.js';
import {authoredCellSilent} from '../src/drawgrid/dg-note-silence.js';
import {evaluateScenePaint,paintOwnerAt} from '../src/free-play-paint.js';
import {toyLoopLengthTicks} from '../src/drawgrid/dg-pattern-length.js';
const make=()=>lineDrawGridStates(createLineSource([{x:0,y:.8},{x:1,y:.8},{x:0,y:.4}]),'sync');
function source(states){return drawGridLineSource(states.map(st=>{const p={dataset:{instrument:'PIANO'},__seqPattern:drawgridPatternFromState(st)};restoreAuthoredNotes(p,st);applyFreePlayDrawGrid(p,st.freePlay);return p;}));}

test('Heal all is line-local, clears manual/random cuts, and leaves paint/source/geometry intact',()=>{
 const a={id:'a',source:source(make())},b=structuredClone(a);b.id='unrelated';
 a.source.events.forEach((n,i)=>{n.scissorMuted=i%2===0;n.paintCovered=i%3===0;});const saved=structuredClone(a),untouched=structuredClone(b);
 const patch=healLineCuts(a);assert.deepEqual(patch.randomCutIds,[]);updateSilence(a.source.events,patch);
 assert.ok(a.source.events.every(n=>!n.scissorMuted));assert.deepEqual(a.source.events.map(n=>n.paintCovered),saved.source.events.map(n=>n.paintCovered));
 assert.deepEqual(a.source.path,saved.source.path);assert.deepEqual(a.source.events.map(n=>[n.id,n.midi,n.offsetTick]),saved.source.events.map(n=>[n.id,n.midi,n.offsetTick]));assert.deepEqual(b,untouched);
});

test('Wipe all removes a line’s overlapping manual/random paint and preserves other owners and cuts',()=>{
 const a={id:'a',source:source(make()),straightened:false},node=a.source.events[2],paint=[{id:'one',owner:'a',x:node.x,y:node.y,seed:1,radius:.065,space:'surface-v2'},{id:'two',owner:'a',x:node.x,y:node.y,seed:2,radius:.065,space:'surface-v2',randomTool:'paint'},{id:'other',owner:'b',x:.99,y:.01,seed:3,radius:.02,space:'surface-v2'}];
 a.source.events[2].scissorMuted=true;const before=structuredClone(paint),result=wipeLinePaint(paint,'a');
 assert.equal(result.removed.length,2);assert.deepEqual(result.remaining,[paint[2]]);assert.deepEqual(paint,before);
 updateSilence(a.source.events,{coveredIds:evaluateScenePaint([a],result.remaining).coveredIds});
 assert.equal(a.source.events[2].paintCovered,false);assert.equal(eventMuted(a.source.events[2]),true);
 assert.deepEqual(wipeLinePaint([{...paint[0],owner:null}],null).remaining,[]);
});

test('manual paint belongs to its nearest line so local wiping preserves an unrelated line’s paint',()=>{
 const a={id:'a',source:source(make()),straightened:false},b={...a,id:'b',source:{...a.source,events:a.source.events.map(e=>({...e,id:'other-'+e.id,y:.02}))}};
 assert.equal(paintOwnerAt([a,b],{x:b.source.events[2].x,y:.02}),'b');assert.equal(paintOwnerAt([],{x:.5,y:.5}),null);
 const paint=[{id:'a-ink',owner:'a'},{id:'b-ink',owner:'b'}];assert.deepEqual(wipeLinePaint(paint,'b').remaining,[paint[0]]);
});

test('canonical rests survive board round-trip/JSON and bulk resets retain IDs, MIDI, ticks, stroke and durations',()=>{
 const states=make(),saved=structuredClone(states),notes=states.flatMap(s=>s.authoredNotes);
 notes[1].scissorMuted=true;notes[3].paintCovered=true;notes[5].scissorMuted=true;notes[5].paintCovered=true;
 states[0].freePlay.paint=[{id:'ink',owner:'sync',seed:7,x:.3,y:.8,radius:.065,space:'surface-v2',notes:[notes[3].id,notes[5].id]}];
 const loaded=states.map(s=>prepareFreePlayDrawGridState(JSON.parse(JSON.stringify(s)))),line=source(loaded);
 assert.deepEqual(line.events.map(eventMuted),notes.map(eventMuted));assert.deepEqual(line.paint,states[0].freePlay.paint);
 for(const [i,st]of loaded.entries()){
  assert.deepEqual(st.strokes,saved[i].strokes);assert.deepEqual(st.authoredNotes.map(n=>[n.id,n.sourceMidi,n.col]),saved[i].authoredNotes.map(n=>[n.id,n.sourceMidi,n.col]));
  assert.equal(toyLoopLengthTicks({dataset:{toy:'drawgrid',steps:st.steps,authoredDurationTicks:st.authoredDurationTicks}}),toyLoopLengthTicks({dataset:{toy:'drawgrid',steps:saved[i].steps,authoredDurationTicks:saved[i].authoredDurationTicks}}));
 }
 const heal=healLineCuts({source:line});for(const st of loaded)updateSilence(st.authoredNotes,heal);
 assert.equal(source(loaded).events.filter(eventMuted).length,2);
 loaded[0].freePlay.paint=[];for(const st of loaded)updateSilence(st.authoredNotes,{coveredIds:[]});
 assert.ok(source(loaded.map(st=>prepareFreePlayDrawGridState(JSON.parse(JSON.stringify(st))))).events.every(n=>!eventMuted(n)));
});

test('board uses the existing dim-cell state, including cache-safe changes and co-located active voices',()=>{
 const note={id:'note',sourceMidi:81,col:0,scissorMuted:true},panel={__dgAuthoredNotes:[note]},row=sourceMidiToRow(81);
 assert.equal(authoredCellSilent(panel,0,row),true);note.scissorMuted=false;note.paintCovered=true;assert.equal(authoredCellSilent(panel,0,row),true);
 panel.__dgAuthoredNotes.push({id:'other',sourceMidi:69,col:0});assert.equal(authoredCellSilent(panel,0,row),false);
 panel.__dgAuthoredNotes[1].paintCovered=true;assert.equal(authoredCellSilent(panel,0,row),true);assert.equal(authoredCellSilent(panel,7,row),false);
});
