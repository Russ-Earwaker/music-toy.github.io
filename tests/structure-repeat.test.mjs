import test from 'node:test';
import assert from 'node:assert/strict';
import {createStructureRuntime} from '../src/structure-runtime.js';
import {createConnectionModel} from '../src/connections.js';
import {createConnectionAdapter} from '../src/connection-adapter.js';
import {createStructureToyModel} from '../src/structure-toys.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {ensurePlaybackInstance,getPlaybackInstance,clearPlaybackInstancesForTests} from '../src/playback-instances.js';
import {MAIN_TRANSPORT_ID,transportRegistry} from '../src/transport-registry.js';
import {ensureAudioContext,setBpm} from '../src/audio-core.js';
import {MAX_REPEAT_COUNT} from '../src/structure-types.js';
const toy=(toyId,durationTicks=384)=>({toyId,durationTicks}),ref=structureId=>({structureId});
const turns=(r,id,from,to)=>r.turnsInWindow(id,from,to).map(t=>[t.toyId,t.startTick,t.endTick]);
for(const count of [2,4])test(`Repeat toy ×${count} keeps one child and uses its exact duration`,()=>{
  const r=createStructureRuntime();r.defineStructure('R','repeat',[toy('B',240)],0,{count});
  assert.equal(r.getDefinition('R').children.length,1);assert.equal(r.getDefinition('R').durationTicks,240*count);
  r.defineSequence('S',[toy('A',96),ref('R'),toy('C',96)]);r.startSequence('S',0,{quantize:false});
  assert.deepEqual(turns(r,'S',0,192+count*240),[['A',0,96],...Array.from({length:count},(_,i)=>['B',96+i*240,96+(i+1)*240]),['C',96+count*240,192+count*240]]);
  assert.deepEqual(turns(r,'S',335,337),[['B',96,336],['B',336,576]]);
});
for(const type of ['sequence','together'])test(`${type} inside Repeat inherits ticks and nested activation contexts`,()=>{
  const r=createStructureRuntime();r.defineStructure('child',type,[toy('A',96),toy('B',192)],0,{representationId:'child'});
  r.defineStructure('R','repeat',[ref('child')],0,{count:2,representationId:'R'});r.startSequence('R',100,{quantize:false});
  const d=type==='sequence'?288:192;assert.equal(r.getDefinition('R').durationTicks,d*2);
  assert.deepEqual(turns(r,'R',100,100+d*2),type==='sequence'?[['A',100,196],['B',196,388],['A',388,484],['B',484,676]]:[['A',100,196],['B',100,292],['A',292,388],['B',292,484]]);
  const second=r.turnsInWindow('R',100+d,101+d)[0];
  assert.equal(second.transportId,MAIN_TRANSPORT_ID);assert.equal(second.structureContexts.find(c=>c.definitionId==='child').startTick,100+d);
});
test('nested Repeat multiplies duration without duplicating child definitions',()=>{
  const r=createStructureRuntime();r.defineStructure('inner','repeat',[toy('B',96)],0,{count:3});
  r.defineStructure('outer','repeat',[ref('inner')],0,{count:4});r.startSequence('outer',0,{quantize:false});
  assert.equal(r.getDefinition('outer').durationTicks,1152);assert.equal(r.debugSnapshot().definitions.length,2);
  assert.deepEqual(turns(r,'outer',0,1152),Array.from({length:12},(_,i)=>['B',96*i,96*(i+1)]));
});
test('live single-child conversion preserves the current turn without duplicate activation contexts',()=>{
  const r=createStructureRuntime();r.defineStructure('R','sequence',[toy('B',96)],0,{representationId:'R'});
  r.startSequence('R',0,{quantize:false});r.commitThrough('R',48);
  r.defineStructure('R','repeat',[toy('B',96)],40,{count:2,representationId:'R'});
  assert.deepEqual(turns(r,'R',48,192),[['B',0,96],['B',96,192]]);
  assert.ok(r.turnsInWindow('R',48,192).every(t=>t.structureContexts.filter(c=>c.definitionId==='R').length===1));
});
for(const count of [1,4])test(`live count change to ${count} preserves a committed iteration and parent start`,()=>{
  const r=createStructureRuntime();r.defineStructure('R','repeat',[toy('B',96)],0,{count:2});
  r.defineSequence('S',[ref('R'),toy('C',96)]);const instance=r.startSequence('S',0,{quantize:false});
  const before=r.turnsInWindow('S',0,120).map(t=>[t.id,t.startTick,t.endTick]);r.commitThrough('S',120);
  r.defineStructure('R','repeat',[toy('B',96)],100,{count});
  assert.deepEqual(r.turnsInWindow('S',0,120).map(t=>[t.id,t.startTick,t.endTick]),before);
  assert.strictEqual(r.getInstance('S'),instance);assert.equal(instance.startTick,0);
  assert.deepEqual(turns(r,'S',120,count===4?480:288),count===4?[['B',96,192],['B',192,288],['B',288,384],['C',384,480]]:[['B',96,192],['C',192,288]]);
});
test('live nested child duration edit uses its latest definition on unscheduled repetitions',()=>{
  const r=createStructureRuntime();r.defineSequence('child',[toy('B',96)]);
  r.defineStructure('R','repeat',[ref('child')],0,{count:3});r.defineSequence('S',[ref('R'),toy('C',96)]);const root=r.startSequence('S',0,{quantize:false});
  r.commitThrough('S',48);r.defineSequence('child',[toy('B',192)],40);
  assert.equal(r.getDefinition('R').durationTicks,576);
  assert.deepEqual(turns(r,'S',48,576),[['B',0,96],['B',96,288],['B',288,480],['C',480,576]]);
  assert.strictEqual(r.getInstance('S'),root);
});
test('child edits never extend completed iterations retroactively',()=>{
  const r=createStructureRuntime();r.defineSequence('child',[toy('B',96)]);
  r.defineStructure('R','repeat',[ref('child')],0,{count:3});r.defineSequence('S',[ref('R'),toy('D',96)]);
  r.startSequence('S',0,{quantize:false});r.commitThrough('S',150);
  r.defineSequence('child',[toy('B',96),toy('C',96)],140);
  assert.deepEqual(turns(r,'S',150,576),[['B',96,192],['C',192,288],['B',288,384],['C',384,480],['D',480,576]]);
});
test('editing a Repeat already completed within its parent affects its next activation only',()=>{
  const r=createStructureRuntime();r.defineStructure('R','repeat',[toy('B',48)],0,{count:2});
  r.defineSequence('S',[ref('R'),toy('C',192)]);r.startSequence('S',0,{quantize:false});r.commitThrough('S',150);
  r.defineStructure('R','repeat',[toy('B',48)],140,{count:4});
  assert.deepEqual(turns(r,'S',150,288),[['C',96,288]]);
  assert.deepEqual(turns(r,'S',288,672),[['B',288,336],['B',336,384],['B',384,432],['B',432,480],['C',480,672]]);
});
test('empty Repeat, including an empty nested child, is zero duration and inert',()=>{
  const r=createStructureRuntime();r.defineStructure('R','repeat',[],0,{count:4});assert.equal(r.getDefinition('R').durationTicks,0);
  r.startSequence('R',0,{quantize:false});assert.deepEqual(turns(r,'R',0,10000),[]);
  r.defineSequence('empty',[]);r.defineStructure('R','repeat',[ref('empty')],20,{count:4});assert.equal(r.getDefinition('R').durationTicks,0);
  assert.deepEqual(turns(r,'R',20,10000),[]);assert.throws(()=>r.defineSequence('empty',[ref('R')]),/Cyclic/);
});
test('emptying a nested child during a later committed repetition removes all ghost duration',()=>{
  const r=createStructureRuntime();r.defineSequence('child',[toy('B',96)]);
  r.defineStructure('R','repeat',[ref('child')],0,{count:4});r.defineSequence('S',[toy('A',96),ref('R')]);
  r.startSequence('S',0,{quantize:false});r.commitThrough('S',350);r.defineSequence('child',[],340);
  assert.equal(r.getDefinition('R').durationTicks,0);assert.equal(r.getDefinition('S').durationTicks,96);
  assert.deepEqual(turns(r,'S',350,480),[['A',288,384],['A',384,480]]);
});
function graph() {
  clearPlaybackInstancesForTests();globalThis.window=globalThis.window||{};window.__TOY_AUDIO_GEN=Object.create(null);
  const calls=[],panels=['A','B','C'].map(id=>({id,dataset:{toy:'loopgrid',steps:'8'},__seqPattern:{},__seqRev:0,
    __sequencerSchedule(step,time,metadata){calls.push({toyId:id,...metadata});}}));
  for(const p of panels)ensurePlaybackInstance(p.id,{loopLengthTicks:384});
  const model=createConnectionModel(),structures=createStructureToyModel(model),chainState=new Map(),state={state:'stopped',currentTick:0};
  const sequence=createChainSequenceAdapter({connectionModel:model,chainState,getToy:id=>panels.find(p=>p.id===id)});
  structures.configure({onRemove:s=>sequence.terminateStructure(s.definitionId)});
  const adapter=createConnectionAdapter(model,{onSequenceChange:()=>sequence.sync(panels,state,{connections:model.list('sequence'),structures:structures.list()})});adapter.sync(panels);
  const edge=(a,b,portId='output')=>model.connect('sequence',{objectId:a,portId},{objectId:b,portId:'input'});
  return {model,structures,sequence,state,adapter,panels,edge,calls};
}
test('midpoint Repeat promotion preserves connection, parent anchor and transport; pause/BPM/resume do not change ticks',()=>{
  const h=graph(),edge=h.edge('A','B').connection,root=h.sequence.runtime.getInstance('sequence:A');
  const s=h.structures.promote(edge.id,'repeat');
  assert.equal(s.count,2);assert.equal(s.outputCount,1);assert.equal(s.provenance,'explicit');
  assert.equal(h.model.get(edge.id).from.objectId,s.id);assert.equal(h.model.get(edge.id).to.objectId,'B');
  assert.equal(h.model.getParent(s.id).from.objectId,'A');assert.equal(h.model.getTransportId('B'),MAIN_TRANSPORT_ID);
  assert.equal(h.model.getPort({objectId:s.id,portId:'child:1'}),null);
  const before=h.sequence.turnsForLookahead(0,1152).map(t=>[t.id,t.toyId,t.startTick]);
  h.state.state='paused';h.adapter.applyOwnership();h.state.bpm=180;h.state.state='playing';
  h.sequence.sync(h.panels,h.state,{connections:h.model.list('sequence'),structures:h.structures.list()});
  assert.deepEqual(h.sequence.turnsForLookahead(0,1152).map(t=>[t.id,t.toyId,t.startTick]),before);
  assert.deepEqual(before.map(([,id,t])=>[id,t]),[['A',0],['B',384],['B',768]]);
  assert.strictEqual(h.sequence.runtime.getInstance('sequence:A'),root);assert.equal(root.startTick,0);
});
test('multi-child type conversion wraps the existing topology; nesting cycles and child replacement are centrally validated',()=>{
  const h=graph(),edge=h.edge('A','B').connection,s=h.structures.promote(edge.id,'sequence');h.edge(s.id,'C','child:1');
  const bEdge=h.model.getParent('B').id,cEdge=h.model.getParent('C').id;
  h.structures.setType(s.id,'repeat');const inner=h.structures.get(h.model.list('sequence').find(c=>c.from.objectId===s.id).to.objectId);
  assert.equal(inner.type,'sequence');assert.equal(h.model.get(bEdge).from.objectId,inner.id);assert.equal(h.model.get(cEdge).from.objectId,inner.id);
  assert.equal(h.model.getTransportId(inner.id),MAIN_TRANSPORT_ID);assert.equal(h.model.getTransportId('C'),MAIN_TRANSPORT_ID);
  assert.equal(h.model.list('transport').filter(c=>c.to.objectId===inner.id||c.to.objectId===s.id).length,0);
  assert.deepEqual(h.sequence.turnsForLookahead(0,1920).map(t=>[t.toyId,t.startTick]),[['A',0],['B',384],['C',768],['B',1152],['C',1536]]);
  assert.equal(h.edge(inner.id,s.id,'child:2').reason,'cycle');assert.equal(h.edge(s.id,s.id,'child:0').reason,'self-connection');
  assert.ok(h.edge(s.id,'C','child:0').ok);assert.equal(h.model.getParent(inner.id),null);
  assert.equal(h.model.list('sequence').filter(c=>c.from.objectId===s.id).length,1);
});
test('Repeat count persistence, bounds, deletion and scheduler event identities',()=>{
  const h=graph(),s=h.structures.promote(h.edge('A','B').connection.id,'repeat');h.structures.setCount(s.id,4);
  const prepared=h.sequence.turnsForLookahead(0,1920),scheduler=createSequencerScheduler();
  const poll=()=>scheduler.tick({activeToyIds:new Set(),playbackTurns:prepared,getToy:id=>h.panels.find(p=>p.id===id),currentTick:0,lookaheadEndTick:1920,tickToAudioTime:t=>t/192});poll();poll();
  assert.equal(h.calls.filter(c=>c.toyId==='B').length,32);assert.equal(new Set(h.calls.map(c=>c.identity)).size,h.calls.length);
  const saved=JSON.parse(JSON.stringify({structures:h.structures.list(),connections:h.model.list()}));
  h.structures.remove(s.id);assert.ok(prepared.filter(t=>t.toyId==='B').every(t=>!t.playbackInstance.active));
  assert.ok(h.sequence.turnsForLookahead(1920,4000).every(t=>t.toyId!=='B'));assert.equal(getPlaybackInstance('B').active,false);
  h.structures.suspend(()=>{h.structures.restore(saved.structures);h.adapter.restore(saved.connections,h.panels);});assert.equal(h.structures.get(s.id).count,4);
  h.structures.setCount(s.id,100000);assert.equal(h.structures.get(s.id).count,MAX_REPEAT_COUNT);
  h.structures.setCount(s.id,-5);assert.equal(h.structures.get(s.id).count,1);
  h.structures.setCount(s.id,0);assert.equal(h.structures.get(s.id).count,1);
});
test('Repeat retains parent and child activation anchors across real transport pause/resume and BPM changes',async()=>{
  const h=graph(),s=h.structures.promote(h.edge('A','B').connection.id,'repeat');
  window.AudioContext=class {currentTime=0;state='running';resume(){return Promise.resolve();}suspend(){return Promise.resolve();}};
  const transport=transportRegistry.get(MAIN_TRANSPORT_ID),ctx=ensureAudioContext();await transport.play();
  ctx.currentTime=450/192;h.sequence.updateCurrent(450);
  const root=h.sequence.runtime.getInstance('sequence:A'),child=h.sequence.runtime.getInstance(s.definitionId);
  const anchors=[root.id,root.startTick,root.generation,child.id,child.startTick,child.transportId];
  transport.pause();const pausedTick=transport.currentTick;ctx.currentTime+=5;setBpm(180);
  assert.equal(transport.currentTick,pausedTick);await transport.play();
  h.sequence.sync(h.panels,transport.getState(),{connections:h.model.list('sequence'),structures:h.structures.list()});
  assert.equal(transport.currentTick,pausedTick);
  assert.deepEqual([root.id,root.startTick,root.generation,child.id,child.startTick,child.transportId],anchors);
  assert.equal(getPlaybackInstance('B').startTick,384);
  transport.pause();setBpm(120);transport.returnToStart();
});
test('edits to a repeated musical toy are read by future iterations through the existing note scheduler',()=>{
  const h=graph(),s=h.structures.promote(h.edge('A','B').connection.id,'repeat'),b=h.panels.find(p=>p.id==='B'),notes=[];
  b.__sequencerSchedule=(step,time,metadata)=>notes.push({...metadata,revision:b.__seqRev});
  const scheduler=createSequencerScheduler(),poll=(from,to)=>scheduler.tick({activeToyIds:new Set(),
    playbackTurns:h.sequence.turnsForLookahead(from,to),getToy:id=>h.panels.find(p=>p.id===id),
    currentTick:from,lookaheadEndTick:to,tickToAudioTime:t=>t/192});
  poll(0,768);const committed=notes.slice();b.__seqRev=1;poll(768,1152);poll(768,1152);
  assert.deepEqual(notes.slice(0,committed.length),committed);
  assert.equal(notes.find(n=>n.eventTick===384).revision,0);assert.equal(notes.find(n=>n.eventTick===768).revision,1);
  assert.equal(notes.length,16);assert.equal(new Set(notes.map(n=>n.identity)).size,16);
  assert.equal(h.sequence.runtime.getInstance(s.definitionId).transportId,MAIN_TRANSPORT_ID);
});
