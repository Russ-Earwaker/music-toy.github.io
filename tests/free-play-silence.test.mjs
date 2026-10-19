import test from 'node:test';
import assert from 'node:assert/strict';
import {createLineSource} from '../src/free-play-line.js';
import {lineDrawGridStates,prepareFreePlayDrawGridState,drawGridLineSource,applyFreePlayDrawGrid} from '../src/free-play-drawgrid.js';
import {drawgridPatternFromState,restoreAuthoredNotes} from '../src/drawgrid/dg-authored-notes.js';
import {eventMuted,updateSilence,pointSegmentDistance,splatDroplets,splatCovers,paintCoverage} from '../src/free-play-silence.js';
import {linePresentation,stringSegments,stringPoint,cutEnds,drawMusicalLine} from '../src/free-play-line-visual.js';
import {toyLoopLengthTicks} from '../src/drawgrid/dg-pattern-length.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {surfacePaint,restoreSurfacePaint} from '../src/free-play-surface-paint.js';
import {createPlaybackVisualQueue} from '../src/playback-visual-events.js';
import {createDrawGridPlaybackVisuals} from '../src/drawgrid/dg-playback-visuals.js';
const source=()=>createLineSource([{x:.05,y:.9},{x:.9,y:.1},{x:.1,y:.9},{x:.9,y:.2}]);
function panels(states){return states.map(st=>{const p={dataset:{toy:'drawgrid',instrument:'PIANO',steps:8,authoredDurationTicks:st.authoredDurationTicks},__seqPattern:drawgridPatternFromState(st)};restoreAuthoredNotes(p,st);applyFreePlayDrawGrid(p,st.freePlay);return p;});}

test('cuts and paint independently preserve stable authored notes, pitches, ticks and normal duration through JSON reload',()=>{
 const s=source();s.events[1].scissorMuted=true;s.events[2].paintCovered=true;s.events[3].scissorMuted=true;s.events[3].paintCovered=true;
 s.paint=[{id:'ink',seed:7,progress:.2,dx:0,dy:0,radius:.065,notes:['silence:note:2','silence:note:3']}];
 const states=lineDrawGridStates(s,'silence'),loaded=states.map(st=>prepareFreePlayDrawGridState(JSON.parse(JSON.stringify(st)))),ps=panels(loaded),restored=drawGridLineSource(ps);
 assert.deepEqual(restored.events.map(e=>[e.midi,e.offsetTick]),s.events.map(e=>[e.midi,e.offsetTick]));
 assert.deepEqual(restored.events.map(eventMuted),s.events.map(eventMuted));assert.deepEqual(restored.paint,s.paint);
 assert.deepEqual(restored.path,s.path);assert.equal(ps.reduce((n,p)=>n+toyLoopLengthTicks(p),0),Math.ceil(s.durationTicks/384)*384);
 for(const st of loaded)assert.deepEqual(prepareFreePlayDrawGridState(st),st);
});

test('wash removes paint reasons without mending any independent scissor cut',()=>{
 const notes=[{id:'a',scissorMuted:true,paintCovered:true},{id:'b',paintCovered:true},{id:'c'}];
 const paint=[{notes:['a','b']}];updateSilence(notes,{paint});
 assert.deepEqual(notes.map(eventMuted),[true,true,false]);
 updateSilence(notes,{paint:[]});
 assert.deepEqual(notes.map(eventMuted),[true,false,false]);updateSilence(notes,{cuts:{a:false}});assert.deepEqual(notes.map(eventMuted),[false,false,false]);
});

test('forgiving scissors hit the entire swipe segment, not just pointer samples',()=>{
 assert.equal(pointSegmentDistance({x:50,y:20},{x:0,y:0},{x:100,y:0}),20);
 assert.equal(pointSegmentDistance({x:0,y:0},{x:0,y:0},{x:0,y:0}),0);
 assert.ok(pointSegmentDistance({x:50,y:24},{x:0,y:0},{x:100,y:0})>23);
});

test('paint droplets are deterministic, cover nearby notes and leave distant neighbors active',()=>{
 const p={seed:42,radius:.065};assert.deepEqual(splatDroplets(p),splatDroplets(JSON.parse(JSON.stringify(p))));
 assert.equal(splatCovers(p,{x:100,y:100},{x:100,y:100},800,600),true);
 assert.equal(splatCovers(p,{x:125,y:100},{x:100,y:100},800,600),true);
 assert.equal(splatCovers(p,{x:250,y:100},{x:100,y:100},800,600),false);
});

test('empty-page paint is serializable and inherited coverage resolves to newly generated stable note IDs',()=>{
 const ink={id:'blank',seed:9,x:.5,y:.5,radius:.065};restoreSurfacePaint([ink]);
 const saved=JSON.parse(JSON.stringify(surfacePaint()));restoreSurfacePaint(saved);assert.deepEqual(surfacePaint(),[ink]);
 const s=source();s.events[2].paintCovered=true;s.paint=[{...ink,progress:.2,dx:0,dy:0,eventIndices:[2],notes:[]}];
 const generated=lineDrawGridStates(s,'new');assert.deepEqual(generated[0].freePlay.paint[0].notes,['new:note:2']);
 assert.equal(generated[0].freePlay.paint[0].eventIndices,undefined);assert.equal(generated[0].authoredNotes[2].paintCovered,true);
 restoreSurfacePaint([]);assert.deepEqual(surfacePaint(),[]);
});

test('editing silence removes canceled future visual events only for the edited toy',()=>{
 const queue=createPlaybackVisualQueue(),grid=createDrawGridPlaybackVisuals(),seen=[];
 queue.enqueue({toyId:'edited',transportId:'main',eventTick:48,dueTick:48});queue.enqueue({toyId:'other',transportId:'main',eventTick:48,dueTick:48});
 queue.clearToy('edited');queue.flush(()=>({state:'playing',currentTick:96}),e=>seen.push(e.toyId));assert.deepEqual(seen,['other']);queue.dispose();
 grid.enqueue({toyId:'edited',transportId:'main',eventTick:48});grid.clearToy('edited');grid.flush(()=>({state:'playing',currentTick:96}),()=>assert.fail('canceled cut flashed'));
});

test('independent gaps sag locally in both views and mending restores exact base geometry without drift',()=>{
 const s=drawGridLineSource(panels(lineDrawGridStates(source(),'cuts'))),saved=structuredClone(s);
 for(const morph of [0,.5,1]){
  const before=stringSegments(s,morph,600);s.events[2].scissorMuted=true;s.events[7].scissorMuted=true;
  const segments=stringSegments(s,morph,600);assert.ok(segments.length>=3);
  const e=s.events[2],progress=e.pathDistance/s.path.totalLength,ends=cutEnds(s,e,morph,800,600);
  assert.equal(ends.length,2);assert.ok(ends.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  const sag=stringPoint(s,progress+.012,morph,600),base=stringPoint(saved,progress+.012,morph,600);assert.ok(sag.y>base.y);
  assert.deepEqual(stringPoint(s,1,morph,600),stringPoint(saved,1,morph,600));
  s.events[2].scissorMuted=false;assert.equal(eventMuted(s.events[7]),true);s.events[7].scissorMuted=false;
  assert.deepEqual(stringSegments(s,morph,600),before);
  assert.deepEqual(linePresentation(s,morph).events.map(e=>[e.x,e.y]),linePresentation(saved,morph).events.map(e=>[e.x,e.y]));
 }
 assert.deepEqual(s.path,saved.path);
});

test('muted points remain identifiable without an active flash or octave labels',()=>{
 const s=source();s.events.forEach(e=>e.scissorMuted=true);const calls=[];let text=0;
 const ctx=new Proxy({arc(...args){calls.push(args);},fillText(){text++;}},{get:(o,k)=>o[k]??(()=>{})});
 drawMusicalLine(ctx,s,{width:800,height:600,phase:.6,morph:1,flashes:new Map([[0,100]]),now:100});
 const flashed=structuredClone(calls);assert.ok(calls.length>0);calls.length=0;
 drawMusicalLine(ctx,s,{width:800,height:600,phase:.6,morph:1,now:100});
 assert.deepEqual(calls,flashed);assert.equal(text,0);
});
test('silence keeps later scheduler ticks, full bars and trailing rests; mid-play edits do not duplicate events',()=>{
 const st=lineDrawGridStates(createLineSource([{x:0,y:.5},{x:1,y:.5}]),'timing')[0];
 st.authoredNotes[1].scissorMuted=true;st.authoredNotes[7].paintCovered=true;
 const calls=[],p={id:'p',dataset:{toy:'drawgrid',steps:8},__seqRev:1,__sequencerSchedule(col,tick){for(const note of st.authoredNotes.filter(n=>n.col===col&&!eventMuted(n)))calls.push([note.id,tick]);}};
 const scheduler=createSequencerScheduler(),tick=(from,to)=>scheduler.tick({playbackTurns:[{toyId:'p',startTick:0,endTick:768,playbackInstance:{active:true,startTick:0,endTick:768,loopLengthTicks:384,definitionRevisionSeen:1,occurrenceId:'silence-test'}}],getToy:()=>p,currentTick:from,lookaheadEndTick:to,tickToAudioTime:t=>t});
 try{
  tick(0,100);st.authoredNotes[2].scissorMuted=true;p.__seqRev++;scheduler.resetToyTimeline('p',100,{includeBoundary:false});tick(100,384);tick(384,768);
  assert.deepEqual(calls.map(c=>c[1]),[0,96,144,192,240,288,384,528,576,624,672]);
  assert.equal(new Set(calls.map(c=>JSON.stringify(c))).size,calls.length);
  assert.equal(toyLoopLengthTicks(p),384);
 }finally{scheduler.dispose();}
});
