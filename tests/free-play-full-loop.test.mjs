import test from 'node:test';
import assert from 'node:assert/strict';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {clearPlaybackInstancesForTests,ensurePlaybackInstance,getPlaybackInstance,getPlaybackColumn} from '../src/playback-instances.js';
import {MAIN_TRANSPORT_ID} from '../src/transport-registry.js';
import {createLineSource} from '../src/free-play-line.js';
import {lineDrawGridStates,applyFreePlayDrawGrid,strokePhase,prepareFreePlayDrawGridState} from '../src/free-play-drawgrid.js';
import {drawgridPatternFromState} from '../src/drawgrid/dg-authored-notes.js';
import {toyLoopLengthTicks,restoreDrawgridDuration} from '../src/drawgrid/dg-pattern-length.js';

for(const points of [
 [{x:0,y:.5},{x:.5,y:.5}],
 [{x:0,y:.5},{x:1,y:.5},{x:.5,y:.5}],
 [{x:0,y:.1},{x:1,y:.9},{x:.2,y:.2}],
 [{x:0,y:.5},{x:1,y:.5},{x:0,y:.5},{x:.5,y:.5}],
 [{x:0,y:.5},{x:1,y:.5},{x:0,y:.5},{x:1,y:.5},{x:0,y:.5}],
]){
 const source=createLineSource(points);
 test(`${source.durationTicks}-tick drawing respects full toy loops and trailing rests over 12 repeats`,()=>{
  const results=[];
  for(const mode of ['normal','generated','legacy']){
   clearPlaybackInstancesForTests();
   const calls=[],states=lineDrawGridStates(source,'gesture').map(st=>mode==='legacy'?prepareFreePlayDrawGridState({...st,authoredDurationTicks:st.freePlay.durationTicks}):st);
   const panels=states.map((st,i)=>{
    const p={id:`g${i}`,__seqRev:0,dataset:{toy:'drawgrid',steps:'8',...(i?{prevToyId:`g${i-1}`} :{}),...(i<states.length-1?{nextToyId:`g${i+1}`}:{})},
     __sequencerSchedule(col,time,meta){if(st.nodes.active[col])calls.push({grid:i,col,tick:meta.eventTick,midi:st.authoredNotes.find(n=>n.col===col).sourceMidi});}};
    restoreDrawgridDuration(p,st);ensurePlaybackInstance(p.id,{loopLengthTicks:toyLoopLengthTicks(p)});
    if(mode!=='normal')applyFreePlayDrawGrid(p,st.freePlay);return p;
   });
   const getToy=id=>panels.find(p=>p.id===id),adapter=createChainSequenceAdapter({getToy,chainState:new Map()}),scheduler=createSequencerScheduler(),duration=states.length*384;
   const standalone=panels.length===1;
   adapter.sync(panels,{currentTick:0,state:'stopped'});
   try{
    for(let now=0;now<duration*12;now+=13){
     const end=Math.min(now+121,duration*12);
     const poll=()=>scheduler.tick({transportId:MAIN_TRANSPORT_ID,activeToyIds:standalone?new Set(['g0']):undefined,playbackTurns:adapter.turnsForLookahead(now,end),getToy,currentTick:now,lookaheadEndTick:end,tickToAudioTime:t=>t});
     poll();poll();
     const grid=Math.floor((now%duration)/384),instance=getPlaybackInstance(`g${grid}`);
     assert.equal(getPlaybackColumn(instance,now,8),Math.floor((now%384)/48));
     if(now%duration>=source.durationTicks)assert.equal(strokePhase(source,now,duration),1);
    }
    const expected=Array.from({length:12},(_,cycle)=>source.events.map(e=>({grid:Math.floor(e.offsetTick/384),col:(e.offsetTick%384)/48,tick:cycle*duration+e.offsetTick,midi:e.midi}))).flat();
    assert.deepEqual(calls,expected);
    for(const event of calls)assert.equal(strokePhase(source,event.tick,duration),(event.tick%duration)/source.durationTicks);
    assert.equal(strokePhase(source,duration,duration),0);
    assert.deepEqual(states.map(st=>drawgridPatternFromState(st)),lineDrawGridStates(source,'gesture').map(st=>drawgridPatternFromState(st)));
    results.push(calls);
   }finally{scheduler.dispose();adapter.reset();clearPlaybackInstancesForTests();}
  }
  assert.deepEqual(results[0],results[1]);assert.deepEqual(results[0],results[2]);
 });
}
