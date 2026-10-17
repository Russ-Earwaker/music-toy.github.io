import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import {patternLearningStartTick} from '../src/pattern-learning-anchor.js';
import {createScheduler} from '../src/ripplesynth-scheduler.js';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createStructureToyModel} from '../src/structure-toys.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {bouncerEventsInWindow,bouncerTurnProgress} from '../src/bouncer-transport.js';
import {ripplerEventsInWindow} from '../src/ripplesynth-transport.js';
import {clearPlaybackInstancesForTests,ensurePlaybackInstance} from '../src/playback-instances.js';
import {createPlaybackVisualQueue} from '../src/playback-visual-events.js';
import {MAIN_TRANSPORT_ID as H} from '../src/transport-registry.js';
const input=objectId=>({objectId,portId:'input'}),out=(objectId,portId='output')=>({objectId,portId});
const proof=[];
test.after(()=>{
 if(process.env.TIMING_STRESS_PROOF==='1')writeFileSync(new URL('../resources/debug-output/timing-stress-events.json',import.meta.url),JSON.stringify({
  kind:'deterministic production scheduler with simulated audio sink; not browser or audible proof',runs:proof},null,2));
});

test('Bouncer progress line follows its assigned turn, never a stale ghost or creation time',()=>{
 const source=readFileSync(new URL('../src/bouncer-render.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('    // Draw life line bar'),source.indexOf('    // Draw ball'));
 const panel={id:'B',__sequenceDefinitionId:'root',dataset:{prevToyId:'A',chainActive:'false'}};
 const instance={active:true,structureTurnId:'B-turn',startTick:768,endTick:1152};
 const lines=[];let tick=500;
 const context=vm.createContext({panel,bouncerTurnProgress,getPlaybackInstance:()=>instance,
  getTransportState:()=>({currentTick:tick}),isRunning:()=>true,
  getBall:()=>({spawnTime:0,flightEnd:100}),ensureAudioContext:()=>({currentTime:50}),
  lastLifeProgress:0,EDGE:4,w:300,ctx:{beginPath(){},moveTo(){},lineTo:(x,y)=>lines.push([x,y]),stroke(){}}});
 vm.runInContext(code,context);assert.equal(lines.length,0);
 panel.dataset.chainActive='true';vm.runInContext(code,context);assert.equal(lines.length,0,'future turn');
 tick=960;vm.runInContext(code,context);assert.deepEqual(lines,[[150,8]],'halfway through the assigned one-bar turn');
 tick=1152;vm.runInContext(code,context);assert.equal(lines.length,1,'finished turn has no lingering line');
});

test('learning selects the current assigned turn, future turn when inactive, and never a connection-time anchor',()=>{
 const panel={__sequenceDefinitionId:'sequence',__getSequenceNextTurn:()=>({startTick:1536})};
 const instance={active:true,structureTurnId:'turn',startTick:384,endTick:768};
 assert.equal(patternLearningStartTick(panel,instance,386,768),384);
 assert.equal(patternLearningStartTick(panel,instance,768,1152),1536);
 assert.equal(patternLearningStartTick({},instance,386,768),768);
});

test('production Rippler learning retains structure occurrence identity and begins at its assigned tick',()=>{
 const source=readFileSync(new URL('../src/ripplesynth-core.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('  const beginRecordingPass ='),source.indexOf('  const scheduler = createScheduler'));
 const instance={active:true,structureTurnId:'turn',startTick:384,endTick:768};
 const context=vm.createContext({patternLearningStartTick,panel:{__sequenceDefinitionId:'sequence'},
  getTransportState:()=>({state:'playing',currentTick:386}),nextRipplerRecordingStartTick:()=>768,
  getPlaybackInstance:()=>instance,activatePlaybackInstance:()=>assert.fail('learning replaced the assigned occurrence'),
  pattern:[new Set()],patternOffsets:[new Map()],touchPattern(){},TICKS_PER_BAR:384,
  tickToAudioTime:t=>t/192,stepSeconds:()=>.25,ripples:[],generator:{placed:true},
  spawnRipple:(_manual,time)=>assert.equal(time,2),bumpToyAudioGen:()=>assert.fail('learning invalidated scheduled audio')});
 vm.runInContext(code+'\nresult=beginRecordingPass();',context);
 assert.equal(context.result,instance);
});

test('production Bouncer learning does not postpone a current turn or invalidate its identity',()=>{
 const source=readFileSync(new URL('../src/bouncer.main.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('  function onNewBar('),source.indexOf('  // Spawn debounce'));
 const instance={active:true,structureTurnId:'turn',startTick:384,endTick:768};
 const loopRec={signature:'old',pattern:[],trajectory:[]};
 const context=vm.createContext({patternLearningStartTick,panel:{id:'bouncer',__sequenceDefinitionId:'sequence',__getSequenceNextTurn:()=>({startTick:1920})},
  getPlaybackInstance:()=>instance,getTransportState:()=>({currentTick:386}),visQ:{loopRec},
  nextBouncerRecordingStartTick:()=>768,stateSignature:()=> 'changed',DBG_RESPAWN:()=>false,
  TICKS_PER_BAR:384,activatePlaybackInstance:()=>assert.fail('replaced a structure-owned occurrence'),
  tickToAudioTime:t=>t/192,lastLaunch:{},window:{},console});
 vm.runInContext(code+'\nonNewBar({},0);',context);
 assert.equal(loopRec.recordingStartTick,384);assert.equal(context.nextLaunchAt,2);
});

test('Rippler collision discovery ignores future and expired learning rings',()=>{
 const source=readFileSync(new URL('../src/ripplesynth-core.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('  function handleRingHits('),source.indexOf('  function springBlocks('));
 const context=vm.createContext({playbackMuted:false,ripples:[{startAT:10}],generator:{placed:true},barSec:()=>2});
 vm.runInContext(code+'\nhandleRingHits(9);handleRingHits(13);',context);
 assert.equal(context.ripples[0].hit,undefined,'neither historical nor premature collisions were processed');
});

test('a long blocked frame advances Rippler directly to the present bar, with no historical ring series',()=>{
 const state={barStartAT:0,recording:true},spawns=[],clock={currentTime:21.25};
 const scheduler=createScheduler({panel:{dataset:{}},ac:clock,state,barSec:()=>2,
  generator:{placed:true},isPlaybackMuted:()=>false,spawnRipple:()=>spawns.push(state.barStartAT),
  sharedReplay:true,pattern:[],getPositionAtAudioTime:t=>t*192});
 scheduler.tick();assert.equal(state.barStartAT,20);assert.deepEqual(spawns,[20]);
 for(let frame=0;frame<60;frame++)scheduler.tick();
 assert.deepEqual(spawns,[20]);assert.equal(state.recording,false);
});

test('Rippler learning clock survives a long pause and repeated BPM rebases without ending its bar early',()=>{
 let bpm=120,nowTick=96,anchorAT=50;const state={barStartAT:0,barStartTick:0,recording:true},rings=[];
 const toTime=t=>anchorAT+(t-nowTick)*60/(bpm*96);
 const scheduler=createScheduler({panel:{dataset:{}},ac:{get currentTime(){return anchorAT;}},state,
  getTransportState:()=>({currentTick:nowTick}),tickToAudioTime:toTime,barSec:()=>240/bpm,
  generator:{placed:true},isPlaybackMuted:()=>false,spawnRipple:()=>rings.push(nowTick),
  sharedReplay:true,pattern:[],getPositionAtAudioTime:()=>nowTick});
 for(bpm of [73,153,90,120]){anchorAT+=20;scheduler.tick();assert.equal(state.recording,true);assert.equal(state.barStartAT,toTime(0));}
 assert.deepEqual(rings,[]);nowTick=384;scheduler.tick();assert.equal(state.recording,false);assert.deepEqual(rings,[384]);
});

function graph(types,{repeat=false}={}) {
 clearPlaybackInstancesForTests();
 const model=createConnectionModel(),structures=createStructureToyModel(model),clock={state:'paused',currentTick:0};
 model.registerObject(H,{ports:HEARTBEAT_PORTS,transportId:H});
 const audio=[],visual=[],queue=createPlaybackVisualQueue({getTransport:()=>clock});
 const panels=types.map((type,index)=>{
  const p={id:'toy-'+index,dataset:{toy:type,steps:'4'},__seqRev:1};
  model.registerObject(p.id);ensurePlaybackInstance(p.id);
  if(type==='drawgrid')p.__sequencerSchedule=(step,when,metadata)=>admit(p,{eventTick:metadata.eventTick,eventKey:'step:'+step},metadata,when);
  else {
   p.__sequencerEventsInWindow=(fromTick,toTick,instance)=>type==='bouncer'
    ?bouncerEventsInWindow({instance,pattern:[{offsetTick:0,note:'C4'},{offsetTick:96,note:'D4'},{offsetTick:192,note:'E4'},{offsetTick:288,note:'G4'}],fromTick,toTick})
    :ripplerEventsInWindow({instance,pattern:[[0],[1],[2],[3]],patternOffsets:[0,96,192,288].map(t=>new Map([[t/96,t]])),blocks:Array.from({length:4},()=>({active:true})),fromTick,toTick});
   p.__sequencerScheduleEvent=(event,when,metadata)=>admit(p,event,metadata,when);
  }
  return p;
 });
 function admit(p,event,metadata,when){
  audio.push({toyId:p.id,type:p.dataset.toy,eventTick:event.eventTick,when,occurrenceId:metadata.occurrenceId,
   audioDispatchTick:clock.currentTick,naturalDurationTicks:384,structureStartTick:Math.floor(event.eventTick/384)*384});
  queue.enqueue({toyId:p.id,transportId:H,dueTick:event.eventTick,eventTick:event.eventTick,eventKey:event.eventKey,occurrence:metadata});
 }
 const root=structures.createStandalone(repeat?'repeat':'sequence');if(repeat)structures.setCount(root.id,4);
 panels.forEach((p,i)=>assert.equal(model.connect('sequence',out(root.id,'child:'+i),input(p.id)).ok,true));
 assert.equal(model.connect('transport',out(H),input(root.id)).ok,true);
 const getToy=id=>panels.find(p=>p.id===id),adapter=createChainSequenceAdapter({connectionModel:model,getToy,chainState:new Map()}),scheduler=createSequencerScheduler();
 const sync=()=>adapter.sync(panels,clock,{connections:model.list('sequence'),structures:structures.list()});sync();clock.state='playing';
 const poll=(tick,end=tick+48,bpm=120)=>{
  clock.currentTick=tick;
  const turns=adapter.turnsForLookahead(tick,end,H);
  const result=scheduler.tick({transportId:H,currentTick:tick,lookaheadEndTick:end,playbackTurns:turns,getToy,tickToAudioTime:t=>t*60/(bpm*96)});
  queue.flush(()=>clock,e=>visual.push({toyId:e.toyId,eventTick:e.eventTick,visualDispatchTick:clock.currentTick}));return {turns,result};
 };
 return {model,root,structures,panels,adapter,scheduler,audio,visual,clock,poll,sync,
  close(){scheduler.dispose();adapter.reset();queue.dispose();structures.dispose();}};
}

test('appending an empty Bouncer after the first has looped resumes A immediately after B, without a realignment rest',()=>{
 const h=graph(['bouncer','bouncer']);try{
  h.model.disconnect(h.model.getParent('toy-1').id);h.clock.state='paused';h.sync();h.clock.state='playing';
  h.panels[1].__sequencerEventsInWindow=()=>null; // A newly created, empty learning recorder.
  for(let tick=0;tick<=492;tick+=12)h.poll(tick);
  h.clock.currentTick=500;
  assert.equal(h.model.connect('sequence',out(h.root.id,'child:1'),input('toy-1')).ok,true);h.sync();
  const turns=h.adapter.runtime.turnsInWindow(h.root.definitionId,500,2304);
  assert.deepEqual(turns.map(t=>[t.toyId,t.startTick,t.endTick]),[
   ['toy-0',384,768],['toy-1',768,1152],['toy-0',1152,1536],['toy-1',1536,1920],['toy-0',1920,2304]]);
  for(let tick=504;tick<1536;tick+=12)h.poll(tick,Math.min(1536,tick+48));
  assert.equal(h.audio.find(e=>e.eventTick>=768).eventTick,1152);
  assert.ok(h.audio.every(e=>e.toyId==='toy-0'));
  assert.equal(h.adapter.runtime.getInstance(h.root.definitionId).phaseOriginTick,0);
 }finally{h.close();}
});

for(const types of [...[1,2,3,4].map(n=>Array(n).fill('bouncer')),...[1,2,3,4].map(n=>Array(n).fill('rippler')),['drawgrid','bouncer','rippler','drawgrid'],['bouncer','drawgrid','rippler']]){
 test(types.join(' → ')+': cumulative boundaries, exact long-run audio/visual counts at every zoom',()=>{
  let reference;
  for(const scale of [1,.5,.25,.075]){
   const h=graph(types);try{
    const duration=types.length*384,cycles=25;
    const turns=h.adapter.turnsForLookahead(0,duration,H);
    assert.deepEqual(turns.map(t=>[t.toyId,t.startTick,t.endTick]),types.map((_,i)=>['toy-'+i,i*384,(i+1)*384]));
    for(let tick=0;tick<duration*cycles;tick+=12){
     h.panels.forEach(p=>p.presentation={scale});h.poll(tick,Math.min(duration*cycles,tick+48),tick%240<120?73:153);
    }
    assert.equal(h.audio.length,types.length*4*cycles);assert.equal(h.visual.length,h.audio.length);
    assert.deepEqual(h.audio.map(e=>[e.toyId,e.eventTick]),h.visual.map(e=>[e.toyId,e.eventTick]));
    const ticks=h.audio.map(e=>e.eventTick);assert.deepEqual(ticks,Array.from({length:types.length*4*cycles},(_,i)=>i*96));
    if(reference)assert.deepEqual(ticks,reference);else reference=ticks;
    proof.push({types,scale,cycles,expected:types.length*4*cycles,audio:h.audio,visual:h.visual});
   }finally{h.close();}
  }
 });
}

for(const type of ['bouncer','rippler'])test(type+' Repeat ×4 preserves exact anchors through reset and pause between events',()=>{
 const h=graph([type],{repeat:true});try{
  assert.deepEqual(h.adapter.turnsForLookahead(0,1536,H).map(t=>t.startTick),[0,384,768,1152]);
  h.poll(0);h.poll(60,108);assert.deepEqual(h.audio.map(e=>e.eventTick),[0,96]);
  h.clock.state='paused';const count=h.audio.length;
  h.scheduler.resetTimeline(60,{includeBoundary:false});h.clock.state='playing';h.poll(60,144,73);
  // The fake audio sink cannot cancel the already-submitted 96 event. In the
  // real app transport invalidation cancels it before the replacement is sent.
  assert.equal(h.audio.at(-1).eventTick,96);assert.equal(h.audio.length,count+1);
  h.adapter.seekTransport(H,{state:'paused',currentTick:0});h.scheduler.resetTimeline(0);h.audio.length=0;h.visual.length=0;
  h.poll(0);h.poll(1);assert.deepEqual(h.audio.map(e=>e.eventTick),[0]);
  for(let tick=12;tick<1536*25;tick+=12)h.poll(tick,Math.min(1536*25,tick+48));
  assert.equal(h.audio.length,400);assert.equal(h.visual.length,400);
  assert.deepEqual(h.audio.map(e=>e.eventTick),Array.from({length:400},(_,i)=>i*96));
  proof.push({types:[type],repeat:4,cycles:25,expected:400,audio:h.audio,visual:h.visual});
 }finally{h.close();}
});

test('a fresh late-joining Rippler skips the historical notes even with a stale recording cursor',()=>{
 clearPlaybackInstancesForTests();const audio=[];
 const instance=ensurePlaybackInstance('fresh',{startTick:288});
 const p={dataset:{toy:'rippler'},__sequencerWindowStartTick:0,__forceSchedulerReset:true,
  __sequencerEventsInWindow:(fromTick,toTick,instance)=>ripplerEventsInWindow({instance,pattern:[[0,1,2,3]],patternOffsets:[new Map([[0,0],[1,96],[2,192],[3,288]])],blocks:Array.from({length:4},()=>({active:true})),fromTick,toTick}),
  __sequencerScheduleEvent:e=>audio.push(e.eventTick)};
 const scheduler=createSequencerScheduler();try{
  scheduler.tick({activeToyIds:new Set(['fresh']),currentTick:280,lookaheadEndTick:400,getToy:()=>p,tickToAudioTime:t=>t});
  assert.deepEqual(audio,[288,384]);assert.equal(instance.startTick,288);
 }finally{scheduler.dispose();}
});

for(const type of ['bouncer','rippler'])test('inserting, removing and reordering '+type+' preserves committed starts and skips past events',()=>{
 const h=graph([type,type,type,type]);try{
  const edges=()=>h.model.list('sequence').filter(e=>e.from.objectId===h.root.id);
  h.model.transaction(()=>edges().filter(e=>Number(e.from.portId.split(':')[1])>=2).forEach(e=>h.model.disconnect(e.id)));
  h.clock.state='paused';h.sync();h.clock.state='playing';h.poll(0,48);
  h.clock.currentTick=120;
  for(let i=2;i<4;i++)assert.equal(h.model.connect('sequence',out(h.root.id,'child:'+i),input('toy-'+i)).ok,true);
  h.sync();
  assert.deepEqual(h.adapter.runtime.turnsInWindow(h.root.definitionId,120,1536).map(t=>[t.toyId,t.startTick]),[['toy-0',0],['toy-1',384],['toy-2',768],['toy-3',1152]]);
  const before=h.audio.length;h.poll(120,240);
  assert.ok(h.audio.slice(before).every(e=>e.eventTick>=120));
  h.model.transaction(()=>{
   edges().filter(e=>Number(e.from.portId.split(':')[1])>=1).forEach(e=>h.model.disconnect(e.id));
   ['toy-3','toy-1'].forEach((id,i)=>assert.equal(h.model.connect('sequence',out(h.root.id,'child:'+(i+1)),input(id)).ok,true));
  });h.sync();
  const turns=h.adapter.runtime.turnsInWindow(h.root.definitionId,120,1152);
  assert.deepEqual(turns.map(t=>[t.toyId,t.startTick]),[['toy-0',0],['toy-3',384],['toy-1',768]]);
  const count=h.audio.length;h.poll(240,1152);
  assert.ok(h.audio.slice(count).every(e=>e.eventTick>=240));assert.equal(h.clock.currentTick,240);
 }finally{h.close();}
});
