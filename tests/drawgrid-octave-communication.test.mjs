import test from 'node:test';
import assert from 'node:assert/strict';
import {createDgNoteGrid,drawGridReferenceOctave,octaveOffsetMarker} from '../src/drawgrid/dg-note-grid.js';
import {buildPalette,midiToName} from '../src/note-helpers.js';
import {createDgInputHandlers} from '../src/drawgrid/dg-input-handlers.js';
import {createLineSource} from '../src/free-play-line.js';
import {lineDrawGridStates,drawGridLineSource} from '../src/free-play-drawgrid.js';
import {linePresentation} from '../src/free-play-line-visual.js';
import {restoreAuthoredNotes,sourceMidiToRow} from '../src/drawgrid/dg-authored-notes.js';

test('reference is stable view midpoint; every chromatic pitch gets its real octave offset',()=>{
 const ref=drawGridReferenceOctave({minMidi:48,maxMidi:83});assert.equal(ref,4);
 for(let midi=48;midi<=83;midi++)assert.equal(octaveOffsetMarker(midi,ref),midi<60?'-1':midi<72?'':'+1');
 assert.equal(drawGridReferenceOctave({minMidi:48,maxMidi:59}),3);
 assert.equal(octaveOffsetMarker(96,4),'+3');assert.equal(octaveOffsetMarker(24,4),'-3');
});

test('markers survive grid fade, label every node outside reference and exact pitch appears only during drag',()=>{
 const panel={__dgPitchRange:{minMidi:48,maxMidi:59},__dgAuthoredNotes:[{id:'low',col:0,sourceMidi:49},{id:'home',col:1,sourceMidi:61},{id:'high',col:1,sourceMidi:73}]};
 const nodes=[new Set([10]),new Set([10])],s={panel,cols:2,rows:12,gridArea:{x:30,y:30},topPad:0,cw:92.5,ch:15,cssH:600,gridVisibilityAlpha:0};
 const text=[],ctx={save(){},restore(){},fillText(t,x,y){text.push({t,x,y});}};
 const grid=createDgNoteGrid({state:s,deps:{buildPalette,midiToName,__dgWithLogicalSpace:(_c,fn)=>fn()}});
 grid.drawNoteLabelsTo(ctx,nodes);assert.deepEqual(text.map(x=>x.t),['+1/+2','Ref C3–B3']);
 s.draggedNode={col:1,row:10};text.length=0;grid.drawNoteLabelsTo(ctx,nodes);assert.equal(text.at(-1).t,'C#4/C#5');
 s.draggedNode=null;text.length=0;grid.drawNoteLabelsTo(ctx,nodes);assert.ok(!text.some(x=>x.t==='C#5'));
});

test('actual chromatic drag leaves authored stroke and static Straighten curve unchanged, including after reload',()=>{
 const source=createLineSource([{x:.1,y:.8},{x:.8,y:.1},{x:.3,y:.85}]),states=lineDrawGridStates(source,'static');
 const panels=states.map((st,i)=>{const p={id:'p'+i,dataset:{},__freePlayDrawGrid:st.freePlay,dispatchEvent(){}};restoreAuthoredNotes(p,st);p.__seqPattern={cols:st.nodes.list.map((nodes,col)=>({nodes,active:true,disabled:[]}))};return p;});
 const p=panels[0],st=states[0],row=sourceMidiToRow(p.__dgAuthoredNotes[0].sourceMidi,st.pitchRange),savedStroke=structuredClone(st.strokes);
 const before=linePresentation(drawGridLineSource(panels),1),originalPath=structuredClone(st.freePlay.path);
 const s={panel:p,currentMap:{nodes:st.nodes.list.map(rs=>new Set(rs))},strokes:st.strokes,draggedNode:{col:0,row,moved:false},drawing:true,pctx:{},paint:{style:{}},nodeGroupMap:[],manualOverrides:[],gridArea:{x:30,y:30},cw:92.5,ch:15,topPad:0};
 const noop=()=>{},oldRAF=globalThis.requestAnimationFrame;let frame;
 globalThis.requestAnimationFrame=fn=>(frame=fn,1);
 const d={pointerToPaintLogical:e=>e,pointerToDrawGridStrokeLogical:e=>e,dgPointerTrace:{onPointerMove:noop,onPointerUp:noop},dgInputTrace:noop,dgPaintTrace:noop,logicalRowFromPoint:(_g,p)=>p.row,markStaticDirty:noop,ensureRenderLoopRunning:noop,resumeTutorialHighlightAfterDraw:noop,emitDrawgridUpdate:noop,setDragScaleHighlight:noop,setDrawingState:noop};
 const input=createDgInputHandlers({state:s,deps:d});
 try{for(const midi of [49,59,48,50,54]){input.onPointerMove({row:11-midi%12});frame();assert.equal(p.__dgAuthoredNotes[0].sourceMidi,midi);}
  input.onPointerUp({});
 }finally{globalThis.requestAnimationFrame=oldRAF;}
 assert.deepEqual(st.strokes,savedStroke);assert.deepEqual(st.freePlay.path,originalPath);
 panels[0].__seqPattern.cols[0].nodes=[11-54%12];
 const afterSource=drawGridLineSource(panels),after=linePresentation(afterSource,1);
 assert.equal(afterSource.events[0].midi,54);assert.deepEqual(after.path,before.path);assert.equal(after.events[0].y,before.events[0].y);
 const reloaded=linePresentation(JSON.parse(JSON.stringify(afterSource)),1);assert.deepEqual(reloaded.path,before.path);
 // Prototype saves without a frozen contour derive it from the original gesture.
 delete panels[0].__freePlayDrawGrid.visualEvents;
 assert.deepEqual(linePresentation(drawGridLineSource(panels),1).path,before.path);
});
