import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionModel, HEARTBEAT_PORTS} from '../src/connections.js';
import {createStructureToyModel} from '../src/structure-toys.js';
import {createGraphPlacement} from '../src/graph-placement.js';
import {horizontalPhraseProjection} from '../src/horizontal-phrases.js';
import {createDrawGridPlaybackVisuals} from '../src/drawgrid/dg-playback-visuals.js';
import {drawGridPlaybackLoopInfo} from '../src/drawgrid/dg-playback-phase.js';
import {createTickTransport} from '../src/tick-transport.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {ensurePlaybackInstance, getPlaybackInstance, clearPlaybackInstancesForTests, getPlaybackOccurrences} from '../src/playback-instances.js';

const input=objectId=>({objectId,portId:'input'}), out=(objectId,portId='output')=>({objectId,portId});
test('Auto-Arrange phrase projects horizontally without changing explicit Sequences or saved edges',()=>{
  const model=createConnectionModel(), structures=createStructureToyModel(model);
  const phrase=structures.createStandalone('sequence',{x:0,y:0});
  structures.annotate(phrase.id,{autoArrangePhrase:{heartbeatId:'H'},outputCount:5});
  const rects=new Map([[phrase.id,{x:0,y:0,width:80,height:80}]]);
  for(let i=0;i<4;i++) {
    model.registerObject('D'+i); rects.set('D'+i,{x:400,y:i*540,width:680,height:480});
    assert.equal(model.connect('sequence',out(phrase.id,'child:'+i),input('D'+i)).ok,true);
  }
  const saved=JSON.stringify(model.list());
  const projection=horizontalPhraseProjection(model);
  assert.ok(projection.hidden.has(phrase.id));
  assert.deepEqual(projection.connections.map(c=>[c.from.objectId,c.to.objectId]),[['D0','D1'],['D1','D2'],['D2','D3']]);
  const placement=createGraphPlacement({model,getRect:id=>rects.get(id),setPosition:(id,x,y)=>Object.assign(rects.get(id),{x,y})});
  placement.arrangeSubgraph(phrase.id);
  for(let i=1;i<4;i++) {
    assert.equal(rects.get('D'+i).y,rects.get('D0').y);
    assert.ok(rects.get('D'+i).x>rects.get('D'+(i-1)).x+680);
  }
  assert.equal(JSON.stringify(model.list()),saved);
  const savedEdges=model.list();
  structures.restore(structures.list());
  savedEdges.forEach(e=>model.connect(e.kind,e.from,e.to));
  assert.deepEqual([...horizontalPhraseProjection(model).hidden],[phrase.id]);
  structures.annotate(phrase.id,{autoArrangePhrase:null});
  assert.equal(horizontalPhraseProjection(model).hidden.size,0);
  assert.equal(horizontalPhraseProjection(model).connections.length,4);
});

test('audio-admitted notes drain once per occurrence and row, independent of the shared editor',()=>{
  clearPlaybackInstancesForTests();
  const queue=createDrawGridPlaybackVisuals(), a=ensurePlaybackInstance('A'), b=ensurePlaybackInstance('B');
  const occurrence=i=>({occurrenceId:i.occurrenceId,generation:i.generation,identity:i.id});
  const events=[a,b].map(i=>({toyId:i.toyId,transportId:'H',eventTick:48,col:1,row:3,occurrence:occurrence(i)}));
  for(const e of events){queue.enqueue(e);queue.enqueue(e);}
  const transport={state:'playing',currentTick:47}, seen=[];
  queue.flush(()=>transport,e=>seen.push(e));assert.equal(seen.length,0);
  transport.currentTick=80;
  queue.flush(()=>transport,e=>seen.push(e));queue.flush(()=>transport,e=>seen.push(e));
  assert.deepEqual(seen.map(e=>e.toyId),['A','B']);
  queue.enqueue({...events[0],eventTick:96}); queue.clear('H');
  transport.currentTick=192;queue.flush(()=>transport,e=>seen.push(e));assert.equal(seen.length,2);
});

test('DrawGrid phase is tick-derived across zoom, resize, pause, tempo changes and missed frames',async()=>{
  clearPlaybackInstancesForTests();
  const ctx={currentTime:0,state:'running'}, transport=createTickTransport({id:'H',getContext:()=>ctx});
  const instance=ensurePlaybackInstance('D',{startTick:0,loopLengthTicks:384});
  instance.sourcePhaseOriginTick=48;
  const info=()=>drawGridPlaybackLoopInfo({currentTick:transport.currentTick,barLen:240/transport.bpm},instance);
  await transport.play();ctx.currentTime=.75;
  assert.equal(info().phase01,.25);
  for(const scale of [.25,2,.6]) for(const width of [640,1920]) {
    const before=info().phase01;instance.presentation={scale,width,dpr:2};assert.equal(info().phase01,before);
  }
  transport.setBpm(180);assert.equal(info().phase01,.25);
  ctx.currentTime+=.5;assert.equal(info().phase01,.625);
  transport.pause();ctx.currentTime+=100;assert.equal(info().phase01,.625);
  await transport.play();ctx.currentTime+=10;
  assert.equal(info().phase01,((transport.currentTick-48)%384)/384);
});

test('Return to Start resets nested occurrences/chords and lookahead while preserving play state and authored graph',async()=>{
  clearPlaybackInstancesForTests();
  const model=createConnectionModel(), structures=createStructureToyModel(model);
  model.registerObject('main-heartbeat',{ports:HEARTBEAT_PORTS,transportId:'main-heartbeat'});
  const panels=['A','B'].map(id=>({id,dataset:{toy:'drawgrid',steps:'8'},__seqRev:0,__seqPattern:{},__sequencerSchedule(){}}));
  for(const p of panels){model.registerObject(p.id);ensurePlaybackInstance(p.id,{transportId:'main-heartbeat'});}
  const root=structures.createStandalone('sequence'), repeat=structures.createStandalone('repeat'), chords=structures.createStandalone('chord-progression');
  structures.setProgression(chords.id,{chords:[{root:'C',quality:'major'},{root:'F',quality:'major'}],stepTicks:384});
  for(const [from,port,to,kind] of [['main-heartbeat','output',root.id,'transport'],[root.id,'child:0',repeat.id],[repeat.id,'child:0',chords.id],[chords.id,'child:0','A'],[root.id,'child:1','B']])
    assert.equal(model.connect(kind||'sequence',out(from,port),input(to)).ok,true);
  const chain=createChainSequenceAdapter({connectionModel:model,getToy:id=>panels.find(p=>p.id===id),chainState:new Map()});
  const scheduler=createSequencerScheduler(),ctx={currentTime:0,state:'running'};
  const transport=createTickTransport({id:'main-heartbeat',getContext:()=>ctx,emit:detail=>{
    if(detail.type==='seek'){scheduler.resetTimeline(0);chain.seekTransport('main-heartbeat',transport.getState());}
  }});
  // Register the test clock in the same registry the adapter uses.

  chain.sync(panels,transport.getState(),{connections:model.list('sequence'),structures:structures.list()});
  const authored=JSON.stringify([model.list(),structures.list()]);
  await transport.play();ctx.currentTime=6;
  chain.turnsForLookahead(transport.currentTick,transport.currentTick+700,'main-heartbeat');
  const oldIds=new Set(getPlaybackOccurrences().map(i=>i.occurrenceId));
  transport.returnToStart();assert.equal(transport.currentTick,0);assert.equal(transport.state,'playing');
  const turns=chain.turnsForLookahead(0,100,'main-heartbeat');assert.equal(turns[0].toyId,'A');
  assert.equal(turns[0].context.harmony.originTick,0);
  assert.equal(chain.runtime.resolveChordsAtTick(root.definitionId,0)[0].chord.root,'C');
  assert.ok(!oldIds.has(turns[0].playbackInstance.occurrenceId));
  const group={activeToyIds:new Set(['A']),getToy:id=>panels.find(p=>p.id===id),currentTick:0,lookaheadEndTick:100,playbackTurns:turns,tickToAudioTime:t=>t,transportId:'main-heartbeat'};
  const first=scheduler.tick(group), second=scheduler.tick(group);
  assert.ok(first.scheduled>0);assert.equal(second.scheduled,0);
  transport.pause();transport.returnToStart();assert.equal(transport.state,'paused');assert.equal(transport.currentTick,0);
  assert.equal(JSON.stringify([model.list(),structures.list()]),authored);
  chain.reset();
});

test('seek cursor survives creation of fresh occurrence scheduler state and includes tick zero once',()=>{
  clearPlaybackInstancesForTests();
  const calls=[], toy={dataset:{toy:'drawgrid',steps:'8'},__sequencerSchedule:(col,_when,event)=>calls.push(event.eventTick)};
  const instance=ensurePlaybackInstance('D');
  const scheduler=createSequencerScheduler({lateGraceTicks:16});
  scheduler.resetToyTimeline('D',0);
  const group={currentTick:3,lookaheadEndTick:50,transportId:instance.transportId,getToy:()=>toy,tickToAudioTime:t=>t,
    playbackTurns:[{toyId:'D',startTick:0,endTick:384,playbackInstance:instance}]};
  scheduler.tick(group);scheduler.tick(group);
  assert.deepEqual(calls,[0,48]);
  scheduler.clearToy('D');scheduler.resetToyTimeline('D',48,{includeBoundary:false});
  scheduler.tick({...group,currentTick:48,lookaheadEndTick:100});
  assert.deepEqual(calls,[0,48,96]);scheduler.dispose();
});
