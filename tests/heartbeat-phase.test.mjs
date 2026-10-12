import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createStructureToyModel} from '../src/structure-toys.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {ensurePlaybackInstance,clearPlaybackInstancesForTests,getPlaybackColumn} from '../src/playback-instances.js';
import {resolveChordAtTick} from '../src/chord-progression.js';
import {bouncerEventsInWindow,interpolateBouncerTrajectory} from '../src/bouncer-transport.js';
import {ripplerEventsInWindow} from '../src/ripplesynth-transport.js';
import {createTickTransport} from '../src/tick-transport.js';
import {MAIN_TRANSPORT_ID} from '../src/transport-registry.js';
const out=(id,portId='output')=>({objectId:id,portId}),input=id=>({objectId:id,portId:'input'});
function harness(lengths={A:384,B:384}){
 clearPlaybackInstancesForTests();const model=createConnectionModel(),calls=[];model.registerObject('H',{ports:HEARTBEAT_PORTS,transportId:MAIN_TRANSPORT_ID});
 const panels=Object.entries(lengths).map(([id,length])=>{model.registerObject(id);ensurePlaybackInstance(id,{loopLengthTicks:length});return{id,dataset:{toy:'drawgrid',steps:'4'},__seqRev:1,__seqPattern:{},__sequencerSchedule:(step,time,metadata)=>calls.push({step,time,...metadata})};});
 const getToy=id=>panels.find(p=>p.id===id),structures=createStructureToyModel(model),state={state:'stopped',currentTick:0};
 const adapter=createChainSequenceAdapter({connectionModel:model,getToy,chainState:new Map()}),scheduler=createSequencerScheduler();
 const sync=()=>adapter.sync(panels,state,{connections:model.list('sequence'),structures:structures.list()});
 const root=id=>model.connect('transport',out('H'),input(id)).connection;
 const child=(s,id,n=0)=>model.connect('sequence',out(s.id,'child:'+n),input(id));
 const schedule=(from,to)=>scheduler.tick({currentTick:from,lookaheadEndTick:to,playbackTurns:adapter.turnsForLookahead(from,to),getToy,tickToAudioTime:t=>t/192});
 return {model,panels,calls,state,structures,adapter,scheduler,sync,root,child,schedule,close(){scheduler.dispose();adapter.reset();structures.dispose();}};
}
test('unrelated direct toys join at next beat with matching Heartbeat phase, without Master metadata',()=>{
 const h=harness();try{h.root('A');h.sync();h.state.state='playing';h.state.currentTick=130;h.root('B');h.sync();h.schedule(192,288);
 assert.deepEqual(h.calls.map(e=>[e.toyId,e.eventTick,e.step]),[['A',192,2],['B',192,2]]);
 assert.equal(h.adapter.runtime.getInstance('sequence:B').startTick,192);assert.equal(h.adapter.runtime.getInstance('sequence:B').phaseOriginTick,0);
 assert.ok(h.panels.every(p=>!p.dataset.masterToyId&&!p.dataset.instanceSerial));}finally{h.close();}
});
test('late 1-bar and 2-bar roots retain a shared origin and natural cycle lengths',()=>{
 const h=harness({A:384,B:384});try{h.root('A');h.sync();const repeat=h.structures.createStandalone('repeat');h.structures.setCount(repeat.id,2);h.child(repeat,'B');h.state.state='playing';h.state.currentTick=400;h.root(repeat.id);h.sync();
 const turns=h.adapter.turnsForLookahead(480,1600).filter(t=>t.toyId==='B');assert.equal(turns[0].startTick,480);assert.equal(turns[0].endTick,768);assert.deepEqual([...new Set(turns.map(t=>t.rootCycleStartTick))],[0,768,1536]);assert.ok(turns.every(t=>t.playbackInstance.sourcePhaseOriginTick===0));}finally{h.close();}
});
test('Together joins current phase, Sequence gates child entry, Repeat stays tick-anchored',()=>{
 const h=harness({A:192,B:384});try{const seq=h.structures.createStandalone('sequence'),repeat=h.structures.createStandalone('repeat');h.child(seq,'A');h.child(seq,'B',1);h.child(repeat,seq.id);h.structures.setCount(repeat.id,2);h.root(repeat.id);h.sync();h.schedule(192,288);
 assert.deepEqual(h.calls.map(e=>[e.toyId,e.eventTick,e.step]),[['B',192,2]]);assert.equal(h.adapter.runtime.getInstance(repeat.definitionId).phaseOriginTick,0);
 assert.deepEqual(h.adapter.turnsForLookahead(1152,1153).map(t=>t.rootCycleStartTick),[1152]);
 const group=h.structures.createStandalone('together');h.child(group,'A');h.child(group,'B',1);h.state.state='playing';h.state.currentTick=130;h.root(group.id);h.sync();const turns=h.adapter.turnsForLookahead(192,193);assert.ok(turns.filter(t=>t.definitionId===group.definitionId).every(t=>t.playbackInstance.sourcePhaseOriginTick===0));}finally{h.close();}
});
test('Timeline +2 beats shifts both activation and source phase while Sequence does not',()=>{
 const h=harness();try{const timeline=h.structures.createStandalone('timeline');h.child(timeline,'A');h.child(timeline,'B',1);h.structures.setOffset(timeline.id,'child:1',192);h.root(timeline.id);h.sync();h.schedule(192,288);
 assert.deepEqual(h.calls.map(e=>[e.toyId,e.eventTick,e.step]),[['A',192,2],['B',192,0]]);
 const saved=JSON.parse(JSON.stringify({nodes:h.structures.list(),edges:h.model.list()}));assert.doesNotMatch(JSON.stringify(saved),/phaseOrigin|scheduledUntil|rootCycle/);assert.equal(saved.nodes[0].entries.find(e=>e.portId==='child:1').offsetTick,192);}finally{h.close();}
});
test('reconnection stops disconnected scheduling and rejoins the lattice without stale offset',()=>{
 const h=harness();try{h.root('A');const edge=h.root('B');h.sync();h.model.disconnect(edge.id);h.state.state='playing';h.state.currentTick=400;h.sync();assert.ok(h.adapter.turnsForLookahead(400,1000).every(t=>t.toyId!=='B'));
 h.root('B');h.sync();const turns=h.adapter.turnsForLookahead(480,1200).filter(t=>t.toyId==='B');assert.deepEqual(turns.map(t=>[t.startTick,t.endTick]),[[480,768],[768,1152],[1152,1536]]);assert.equal(getPlaybackColumn(turns[0].playbackInstance,480,4),1);}finally{h.close();}
});
test('uncommitted edits before late activation take effect, and seek selects the shared structural position',()=>{
 const h=harness();try{const s=h.structures.createStandalone('sequence');h.child(s,'A');h.child(s,'B',1);h.state.state='playing';h.state.currentTick=500;h.root(s.id);h.sync();
 h.state.currentTick=520;h.model.disconnect(h.model.getParent('A').id);h.model.disconnect(h.model.getParent('B').id);h.child(s,'B');h.child(s,'A',1);h.sync();
 assert.equal(h.adapter.turnsForLookahead(576,577)[0].toyId,'A');
 h.adapter.retrigger(s.id,{state:'playing',currentTick:0},{quantize:false});assert.equal(h.adapter.turnsForLookahead(0,1)[0].toyId,'B');
 h.adapter.retrigger(s.id,{state:'playing',currentTick:600},{quantize:false});const turn=h.adapter.turnsForLookahead(600,601)[0];assert.equal(turn.toyId,'A');assert.equal(turn.rootCycleStartTick,0);assert.equal(getPlaybackColumn(turn.playbackInstance,600,4),2);
 }finally{h.close();}
});
test('late progression joins the current chord; re-entry and Repeat use anchored event ticks',()=>{
 const h=harness();try{const p=h.structures.createStandalone('chord-progression');h.child(p,'A');h.state.state='playing';h.state.currentTick=500;h.root(p.id);h.sync();const turns=h.adapter.turnsForLookahead(576,1700).filter(t=>t.toyId==='A');assert.deepEqual(turns.map(t=>resolveChordAtTick(t.context,t.startTick).root),['A','F','G','C']);assert.equal(turns[0].rootCycleStartTick,0);assert.equal(getPlaybackColumn(turns[0].playbackInstance,576,4),2);}finally{h.close();}
});
test('1 bar and 3 beat loops form deterministic polymeter from one origin',()=>{
 const h=harness({A:384,B:288});try{h.root('A');h.state.state='playing';h.state.currentTick=130;h.root('B');h.sync();h.schedule(192,1153);
 assert.ok(h.calls.filter(e=>e.toyId==='A').every(e=>e.step===(e.eventTick/96)%4));assert.ok(h.calls.filter(e=>e.toyId==='B').every(e=>e.step===(e.eventTick/72)%4));assert.ok(h.calls.filter(e=>e.eventTick===1152).every(e=>e.step===0));}finally{h.close();}
});
test('recorded irregular notes and Bouncer trajectory preserve authored offsets on shared replay',()=>{
 clearPlaybackInstancesForTests();const a=ensurePlaybackInstance('bouncer',{startTick:192}),b=ensurePlaybackInstance('rippler',{startTick:288}),trajectory=[{offsetTick:0,x:10,y:30},{offsetTick:192,x:50,y:60}],before=structuredClone(trajectory);
 assert.deepEqual(bouncerEventsInWindow({instance:a,pattern:[{offsetTick:24,note:'C4'}],fromTick:192,toTick:1100}).map(e=>e.eventTick),[408,792]);assert.deepEqual(ripplerEventsInWindow({instance:b,pattern:[[0]],patternOffsets:[new Map([[0,24]])],blocks:[{active:true}],fromTick:288,toTick:1100}).map(e=>e.eventTick),[408,792]);
 assert.deepEqual(interpolateBouncerTrajectory(trajectory,96),interpolateBouncerTrajectory(trajectory,480));assert.deepEqual(trajectory,before);
});
test('Heartbeat phase survives real pause/BPM, Return to Start, arbitrary seek and tick reload',async()=>{
 clearPlaybackInstancesForTests();const ctx={currentTime:0,state:'running'},clock=createTickTransport({id:'H',getContext:()=>ctx}),a=ensurePlaybackInstance('A',{startTick:0}),b=ensurePlaybackInstance('B',{startTick:192});await clock.play();ctx.currentTime=2;
 clock.pause();clock.setBpm(73);ctx.currentTime=10;await clock.play();assert.equal(getPlaybackColumn(a,clock.currentTick,4),getPlaybackColumn(b,clock.currentTick,4));clock.seekTick(600);assert.equal(getPlaybackColumn(b,600,4),2);clock.returnToStart();assert.equal(clock.currentTick,0);
 const restored=createTickTransport({id:'H',getContext:()=>ctx,positionTick:600,bpm:73});assert.equal(restored.heartbeatPhaseOriginTick,0);assert.equal(getPlaybackColumn(a,restored.currentTick,4),2);
});
