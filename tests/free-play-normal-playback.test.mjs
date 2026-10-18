import test from 'node:test';
import assert from 'node:assert/strict';
import {createLineSource} from '../src/free-play-line.js';
import {lineDrawGridStates,applyFreePlayDrawGrid,strokePhase,prepareFreePlayDrawGridState} from '../src/free-play-drawgrid.js';
import {drawgridLoopLengthTicks,toyLoopLengthTicks} from '../src/drawgrid/dg-pattern-length.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {createStructureRuntime} from '../src/structure-runtime.js';
import {createTickTransport} from '../src/tick-transport.js';
import {getPlaybackColumn,getPlaybackStepEvents,createPlaybackInstanceForStructureTurn} from '../src/playback-instances.js';

const sourceFor=length=>createLineSource([{x:0,y:.5},{x:length,y:.5}]);
const fullWithNotes=count=>{const s=sourceFor(1);s.events=s.events.slice(0,count);return lineDrawGridStates(s,'full');};
function schedule(states,{generated=true,loops=3,from=0,addedTailNote=false}={}){
 const calls=[],panels=states.map((st,i)=>{
  const p={id:'grid'+i,dataset:{toy:'drawgrid',steps:st.steps,...(st.authoredDurationTicks?{authoredDurationTicks:String(st.authoredDurationTicks)}:{})},__seqRev:1,__sequencerSchedule(col,time){if(st.nodes.active[col]||(addedTailNote&&col===7))calls.push({grid:i,col,tick:time});}};
  if(generated)applyFreePlayDrawGrid(p,st.freePlay);
  assert.equal(p.__sequencerEventsInWindow,undefined);assert.equal(p.__sequencerScheduleEvent,undefined);return p;
 });
 const scheduler=createSequencerScheduler(),duration=panels.reduce((n,p)=>n+toyLoopLengthTicks(p),0);
 try{for(let loop=0;loop<loops;loop++)for(const [i,p]of panels.entries()){
  const start=loop*duration+panels.slice(0,i).reduce((n,p)=>n+toyLoopLengthTicks(p),0),end=start+toyLoopLengthTicks(p);
  if(end<=from)continue;
  const instance={id:p.id,occurrenceId:`${loop}:${i}`,transportId:'main',active:true,startTick:Math.max(from,start),endTick:end,loopLengthTicks:toyLoopLengthTicks(p),generation:0,definitionRevisionSeen:-1};
  scheduler.tick({transportId:'main',playbackTurns:[{toyId:p.id,startTick:instance.startTick,endTick:end,playbackInstance:instance}],getToy:id=>panels.find(p=>p.id===id),currentTick:instance.startTick,lookaheadEndTick:end,tickToAudioTime:t=>t});
 }}finally{scheduler.dispose();}
 return calls;
}

test('generated grid metadata never overrides normal 8/16/32-step natural duration',()=>{
 for(const steps of [8,16,32])for(const durationTicks of [1,24,192,384,9999]){
  const normal={dataset:{toy:'drawgrid',steps}},generated={dataset:{toy:'drawgrid',steps}};
  applyFreePlayDrawGrid(generated,{strokeId:'saved',durationTicks,phraseDurationTicks:17,startTick:123});
  assert.equal(toyLoopLengthTicks(generated,{loopLengthTicks:17}),drawgridLoopLengthTicks(steps));
  assert.equal(toyLoopLengthTicks(generated),toyLoopLengthTicks(normal));
 }
});

test('four notes in an eight-step grid leave trailing silence and restart only at the bar boundary',()=>{
 const states=fullWithNotes(4);assert.equal(states[0].authoredNotes.length,4);
 const generated=schedule(states),normal=schedule(states,{generated:false});assert.deepEqual(generated,normal);
 assert.deepEqual(generated.map(c=>c.tick),[0,48,96,144,384,432,480,528,768,816,864,912]);
});

test('multi-grid phrase keeps its last partial drawing but uses its explicit authored ending like a normal chain',()=>{
 const s=createLineSource([{x:0,y:.5},{x:1,y:.5},{x:.5,y:.5}]),states=lineDrawGridStates(s,'chain');
 assert.equal(s.durationTicks,576);assert.equal(states[1].freePlay.durationTicks,192);
 const before=structuredClone(states),generated=schedule(states,{loops:8});
 assert.deepEqual(generated,schedule(states,{generated:false,loops:8}));
 assert.deepEqual(generated.map(c=>c.tick),Array.from({length:8},(_,loop)=>Array.from({length:12},(_,i)=>loop*576+i*48)).flat());
 assert.deepEqual(states,before);
});

test('ordinary scheduling plays newly authored tail notes past the old stroke endpoint',()=>{
 const states=lineDrawGridStates(sourceFor(.25),'tail');states[0].authoredDurationTicks=0;
 const calls=schedule(states,{addedTailNote:true,loops:2});
 assert.deepEqual(calls.map(c=>c.tick),[0,48,336,384,432,720]);
});

test('joining a running transport does not backfill old notes or restart early',()=>{
 const states=fullWithNotes(4),calls=schedule(states,{from:100});
 assert.deepEqual(calls,schedule(states,{generated:false,from:100}));
 assert.deepEqual(calls.map(c=>c.tick),[144,384,432,480,528,768,816,864,912]);
});

test('saved visual duration stays visual after reload and does not install a phrase provider',()=>{
 const st=fullWithNotes(4)[0],loaded=prepareFreePlayDrawGridState(JSON.parse(JSON.stringify(st))),p={dataset:{toy:'drawgrid',steps:8}};
 applyFreePlayDrawGrid(p,loaded.freePlay);assert.equal(toyLoopLengthTicks(p),384);assert.deepEqual(loaded.strokes,st.strokes);assert.deepEqual(loaded.authoredNotes,st.authoredNotes);
 const normalProvider=()=>{},normalSchedule=()=>{};p.__sequencerEventsInWindow=normalProvider;p.__sequencerScheduleEvent=normalSchedule;
 applyFreePlayDrawGrid(p,loaded.freePlay);assert.equal(p.__sequencerEventsInWindow,normalProvider);assert.equal(p.__sequencerScheduleEvent,normalSchedule);
});

test('Free Play illumination holds through normal trailing rests instead of looping on the endpoint',()=>{
 const s=sourceFor(.5);assert.equal(s.durationTicks,192);
 for(const tick of [192,240,336,383])assert.equal(strokePhase(s,tick,384),1);
 assert.equal(strokePhase(s,384,384),0);assert.equal(strokePhase(s,432,384),.25);
 const multi={durationTicks:576};assert.equal(strokePhase(multi,767,768),1);assert.equal(strokePhase(multi,768,768),0);
});

test('one-note full grid still lasts 384 ticks and matches a manual grid',()=>{
 const states=fullWithNotes(1);assert.deepEqual(schedule(states),schedule(states,{generated:false}));assert.deepEqual(schedule(states).map(n=>n.tick),[0,384,768]);
});

test('2.5-bar source uses normal Sequence composition: 384 + 384 + 192 = 960',()=>{
 const source=createLineSource([{x:0,y:.5},{x:1,y:.5},{x:0,y:.5},{x:.5,y:.5}]),states=lineDrawGridStates(source,'partial');
 const lengths=states.map(st=>toyLoopLengthTicks({dataset:{toy:'drawgrid',steps:8,authoredDurationTicks:st.authoredDurationTicks}}));assert.deepEqual(lengths,[384,384,192]);
 const runtime=createStructureRuntime();runtime.defineSequence('S',lengths.map((durationTicks,i)=>({toyId:'g'+i,durationTicks})));runtime.startSequence('S',0,{quantize:false,loop:true});
 const turns=runtime.turnsInWindow('S',0,1920);assert.deepEqual(turns.map(t=>[t.toyId,t.startTick,t.endTick]),[['g0',0,384],['g1',384,768],['g2',768,960],['g0',960,1344],['g1',1344,1728],['g2',1728,1920]]);
 const last=createPlaybackInstanceForStructureTurn(turns[2]);last.patternLengthTicks=384;assert.deepEqual(getPlaybackStepEvents(last,768,960,8).map(e=>e.eventTick),[768,816,864,912]);assert.equal(getPlaybackColumn(last,864,8),2);
 assert.equal(strokePhase(source,960,960),0);assert.ok(strokePhase(source,959,960)>.99);
});

test('tempo, Pause/Resume and Return to Start preserve one transport and one phrase phase',async()=>{
 const ctx={currentTime:0,state:'running'},t=createTickTransport({id:'main',getContext:()=>ctx}),source={durationTicks:960};await t.play();
 ctx.currentTime=1;assert.equal(t.currentTick,192);const phase=strokePhase(source,t.currentTick,960);t.setBpm(60);assert.equal(t.currentTick,192);assert.equal(strokePhase(source,t.currentTick,960),phase);
 ctx.currentTime=2;assert.equal(t.currentTick,288);t.pause();ctx.currentTime=20;assert.equal(t.currentTick,288);await t.play();assert.equal(t.currentTick,288);
 ctx.currentTime=21;assert.equal(t.currentTick,384);t.pause();t.returnToStart();assert.equal(t.currentTick,0);assert.equal(strokePhase(source,t.currentTick,960),0);
});

test('legacy partial endings migrate once; explicit normal full duration wins over provenance',()=>{
 const old=lineDrawGridStates(sourceFor(.5),'legacy')[0];delete old.authoredDurationTicks;const migrated=prepareFreePlayDrawGridState(old);assert.equal(migrated.authoredDurationTicks,192);
 const full=prepareFreePlayDrawGridState({...migrated,authoredDurationTicks:0});assert.equal(full.authoredDurationTicks,0);const p={dataset:{toy:'drawgrid',steps:8}};applyFreePlayDrawGrid(p,full.freePlay);assert.equal(toyLoopLengthTicks(p),384);
 assert.deepEqual(prepareFreePlayDrawGridState(JSON.parse(JSON.stringify(full))),full);
});
