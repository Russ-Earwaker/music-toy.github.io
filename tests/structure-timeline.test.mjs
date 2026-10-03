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
import {snapTimelineOffset} from '../src/timeline-offsets.js';
const toy=(toyId,offsetTick=0,durationTicks=384)=>({toyId,offsetTick,durationTicks}),ref=(structureId,offsetTick=0)=>({structureId,offsetTick});
const turns=(r,id,from,to)=>r.turnsInWindow(id,from,to).map(t=>[t.toyId,t.startTick,t.endTick]);
test('Timeline stores explicit relative offsets and overlaps, and duration is the maximum end',()=>{
  const r=createStructureRuntime();r.defineStructure('T','timeline',[toy('A',0,768),toy('B',384,384),toy('C',768,192)]);
  assert.equal(r.getDefinition('T').durationTicks,960);assert.deepEqual(r.getDefinition('T').children.map(c=>[c.childId,c.offsetTick]),[['A',0],['B',384],['C',768]]);
  r.startSequence('T',96,{quantize:false});assert.deepEqual(turns(r,'T',96,1056),[['A',96,864],['B',480,864],['C',864,1056]]);
  assert.deepEqual(turns(r,'T',600,601).map(t=>t[0]),['A','B']);
});
test('Sequence and Repeat can be Timeline children, and Timeline offsets repeat relative to each activation',()=>{
  const r=createStructureRuntime();r.defineSequence('S',[toy('A',0,96),toy('B',0,192)]);
  r.defineStructure('R','repeat',[toy('C',0,96)],0,{count:3});
  r.defineStructure('T','timeline',[ref('S',96),ref('R',192)],0,{representationId:'T'});
  assert.equal(r.getDefinition('T').durationTicks,480);
  r.defineStructure('outer','repeat',[ref('T')],0,{count:2});r.startSequence('outer',100,{quantize:false});
  assert.deepEqual(turns(r,'outer',100,1060),[['A',196,292],['B',292,484],['C',292,388],['C',388,484],['C',484,580],
    ['A',676,772],['B',772,964],['C',772,868],['C',868,964],['C',964,1060]]);
  assert.equal(r.getDefinition('outer').durationTicks,960);
  assert.equal(r.turnsInWindow('outer',676,677)[0].structureContexts.find(c=>c.definitionId==='T').startTick,580);
});
test('nested Timeline and childId definitions share the same runtime and reject cycles',()=>{
  assert.throws(()=>createStructureRuntime().defineStructure('self','timeline',[{childId:'self',offsetTick:0}]),/Cyclic/);
  const r=createStructureRuntime();r.defineStructure('inner','timeline',[{childId:'A',offsetTick:96,durationTicks:96}]);
  r.defineStructure('outer','timeline',[{childId:'inner',offsetTick:192}]);r.startSequence('outer',0,{quantize:false});
  assert.deepEqual(turns(r,'outer',0,384),[['A',288,384]]);assert.throws(()=>r.defineStructure('inner','timeline',[ref('outer')]),/Cyclic/);
});
test('an unreached entry moves at the existing anchor without rewriting submitted events',()=>{
  const r=createStructureRuntime();r.defineStructure('T','timeline',[toy('A'),toy('B',768)]);const root=r.startSequence('T',0,{quantize:false});
  const before=turns(r,'T',0,120);r.commitThrough('T',120);r.defineStructure('T','timeline',[toy('A'),toy('B',384)],100);
  assert.deepEqual(turns(r,'T',0,120),before);assert.deepEqual(turns(r,'T',120,768),[['A',0,384],['B',384,768]]);
  assert.strictEqual(r.getInstance('T'),root);assert.equal(root.startTick,0);
});
test('moving an already active or submitted entry keeps this occurrence and changes its next activation',()=>{
  const r=createStructureRuntime();r.defineStructure('T','timeline',[toy('A',0,192),toy('B',192,192)]);r.startSequence('T',0,{quantize:false});
  const before=turns(r,'T',0,240);r.commitThrough('T',240);r.defineStructure('T','timeline',[toy('A',96,192),toy('B',384,192)],200);
  assert.deepEqual(turns(r,'T',0,240),before);assert.deepEqual(turns(r,'T',240,960),[['B',192,384],['A',480,672],['B',768,960]]);
});
test('an unreached entry moved behind lookahead waits for the next activation',()=>{
  const r=createStructureRuntime();r.defineStructure('T','timeline',[toy('A',0,192),toy('B',384,192)]);r.startSequence('T',0,{quantize:false});r.commitThrough('T',120);
  r.defineStructure('T','timeline',[toy('A',0,192),toy('B',0,192)],100);
  assert.deepEqual(turns(r,'T',120,576),[['A',0,192]]);assert.deepEqual(turns(r,'T',576,768),[['A',576,768],['B',576,768]]);
});
test('empty Timeline has no silent bar, including nested inside Repeat',()=>{
  const r=createStructureRuntime();r.defineStructure('T','timeline',[]);r.defineStructure('R','repeat',[ref('T')],0,{count:4});
  assert.equal(r.getDefinition('T').durationTicks,0);assert.equal(r.getDefinition('R').durationTicks,0);r.startSequence('R',0,{quantize:false});assert.deepEqual(turns(r,'R',0,10000),[]);
});
function graph(lengths={}) {
  clearPlaybackInstancesForTests();globalThis.window=globalThis.window||{};window.__TOY_AUDIO_GEN=Object.create(null);
  const calls=[],panels=['A','B','C','D'].map(id=>({id,dataset:{toy:'loopgrid',steps:'8'},__seqPattern:{},__seqRev:0,
    __sequencerSchedule(step,time,metadata){calls.push({toyId:id,...metadata});}}));
  for(const p of panels)ensurePlaybackInstance(p.id,{loopLengthTicks:lengths[p.id]||384});
  const model=createConnectionModel(),structures=createStructureToyModel(model),chainState=new Map(),state={state:'stopped',currentTick:0};
  const sequence=createChainSequenceAdapter({connectionModel:model,chainState,getToy:id=>panels.find(p=>p.id===id)});
  structures.configure({onRemove:s=>sequence.terminateStructure(s.definitionId)});
  const adapter=createConnectionAdapter(model,{onSequenceChange:()=>sequence.sync(panels,state,{connections:model.list('sequence'),structures:structures.list()})});adapter.sync(panels);
  const edge=(a,b,portId='output')=>model.connect('sequence',{objectId:a,portId},{objectId:b,portId:'input'});
  return {model,structures,sequence,state,adapter,panels,edge,calls};
}
test('Timeline midpoint promotion and new children have sequential defaults from actual child duration',()=>{
  const h=graph({B:240,C:576}),edge=h.edge('A','B').connection,root=h.sequence.runtime.getInstance('sequence:A'),s=h.structures.promote(edge.id,'timeline');
  h.edge(s.id,'C','child:1');h.edge(s.id,'D','child:2');
  assert.deepEqual(h.structures.get(s.id).entries.map(e=>[e.childId,e.offsetTick]),[['B',0],['C',240],['D',816]]);
  assert.equal(h.sequence.runtime.getDefinition(s.definitionId).durationTicks,1200);assert.equal(h.model.get(edge.id).from.objectId,s.id);
  assert.strictEqual(h.sequence.runtime.getInstance('sequence:A'),root);assert.equal(root.startTick,0);
  h.structures.setOffset(s.id,'child:1',143);assert.equal(h.structures.get(s.id).entries[1].offsetTick,96);
  assert.equal(snapTimelineOffset(145),192);assert.equal(snapTimelineOffset(-10),0);
  assert.equal(h.model.getTransportId('C'),MAIN_TRANSPORT_ID);assert.equal(h.model.list('transport').some(c=>c.to.objectId==='C'),false);
});
for(const type of ['sequence','together'])test(`${type} to Timeline preserves initial timing and stable ordering`,()=>{
  const h=graph({B:240,C:576}),s=h.structures.promote(h.edge('A','B').connection.id,type);h.edge(s.id,'C','child:1');
  const before=h.sequence.turnsForLookahead(0,1200).map(t=>[t.toyId,t.startTick,t.endTick]);h.structures.setType(s.id,'timeline');
  assert.deepEqual(h.sequence.turnsForLookahead(0,1200).map(t=>[t.toyId,t.startTick,t.endTick]),before);
  assert.deepEqual(h.structures.get(s.id).entries.map(e=>e.offsetTick),type==='sequence'?[0,240]:[0,0]);
});
test('lossy conversions are gated and confirmed Sequence ordering follows offsets without dropping connections',()=>{
  const h=graph(),s=h.structures.promote(h.edge('A','B').connection.id,'timeline');h.edge(s.id,'C','child:1');
  h.structures.setOffset(s.id,'child:0',384);h.structures.setOffset(s.id,'child:1',0);
  assert.equal(h.structures.conversion(s.id,'sequence').lossy,false,'offset-sorted contiguous rows can convert without loss');
  h.structures.setOffset(s.id,'child:0',96);const before=h.model.list();
  assert.equal(h.structures.setType(s.id,'sequence'),null);assert.deepEqual(h.model.list(),before);assert.equal(h.structures.get(s.id).type,'timeline');
  const bId=h.model.getParent('B').id,cId=h.model.getParent('C').id;h.structures.setType(s.id,'sequence',{allowLossy:true});
  assert.equal(h.model.get(cId).from.portId,'child:0');assert.equal(h.model.get(bId).from.portId,'child:1');
  h.structures.setType(s.id,'timeline');assert.equal(h.structures.setType(s.id,'together'),null);h.structures.setType(s.id,'together',{allowLossy:true});assert.equal(h.structures.get(s.id).type,'together');
});
test('Repeat to Timeline and Timeline to Repeat preserve nested meaning through wrapping',()=>{
  const h=graph(),s=h.structures.promote(h.edge('A','B').connection.id,'repeat');h.structures.setCount(s.id,3);
  h.structures.setType(s.id,'timeline');const inner=h.structures.get(h.structures.get(s.id).entries[0].childId);
  assert.equal(inner.type,'repeat');assert.equal(inner.count,3);assert.equal(h.structures.durationOf(s.id),1152);
  h.structures.setOffset(s.id,'child:0',96);h.structures.setType(s.id,'repeat');
  const wrapped=h.structures.get(h.model.list('sequence').find(c=>c.from.objectId===s.id).to.objectId);
  assert.equal(wrapped.type,'timeline');assert.equal(wrapped.entries[0].offsetTick,96);assert.equal(h.structures.durationOf(s.id),(1152+96)*3);
});
test('entry reconnection preserves its offset; removal/persistence/cycle/deletion use shared graph authority',()=>{
  const h=graph(),s=h.structures.promote(h.edge('A','B').connection.id,'timeline');h.structures.setOffset(s.id,'child:0',192);
  const id=h.model.getParent('B').id;h.model.beginDrag({objectId:'B',portId:'input'},{connectionId:id,end:'to'});h.model.drop({objectId:'C',portId:'input'});
  assert.deepEqual(h.structures.get(s.id).entries.map(e=>[e.childId,e.offsetTick]),[['C',192]]);assert.equal(h.model.getParent('B'),null);
  assert.equal(h.edge('C',s.id).reason,'cycle');
  const saved=JSON.parse(JSON.stringify({structures:h.structures.list(),connections:h.model.list()}));h.structures.suspend(()=>{h.structures.restore(saved.structures);h.adapter.restore(saved.connections,h.panels);});
  assert.equal(h.structures.get(s.id).entries[0].offsetTick,192);const prepared=h.sequence.turnsForLookahead(0,2000);
  h.model.disconnect(id);assert.deepEqual(h.structures.get(s.id).entries,[]);assert.equal(h.sequence.runtime.getDefinition(s.definitionId).durationTicks,0);
  assert.ok(prepared.filter(t=>t.toyId==='C').every(t=>!t.playbackInstance.active));assert.equal(getPlaybackInstance('C').active,false);
  h.structures.remove(s.id);assert.equal(h.sequence.runtime.getDefinition(s.definitionId),null);assert.ok(h.sequence.turnsForLookahead(2000,4000).every(t=>t.toyId!=='C'));
});
test('overlap uses existing scheduler once and active state includes both children',()=>{
  const h=graph(),s=h.structures.promote(h.edge('A','B').connection.id,'timeline');h.edge(s.id,'C','child:1');h.structures.setOffset(s.id,'child:1',96);
  const scheduler=createSequencerScheduler(),poll=()=>scheduler.tick({activeToyIds:new Set(),playbackTurns:h.sequence.turnsForLookahead(0,864),getToy:id=>h.panels.find(p=>p.id===id),currentTick:0,lookaheadEndTick:864,tickToAudioTime:t=>t/192});poll();poll();
  assert.equal(h.calls.filter(c=>c.toyId==='B').length,8);assert.equal(h.calls.filter(c=>c.toyId==='C').length,8);
  assert.equal(new Set(h.calls.map(c=>c.identity)).size,h.calls.length);h.sequence.updateCurrent(600);
  assert.ok(h.sequence.getActiveToyIds().has('B'));assert.ok(h.sequence.getActiveToyIds().has('C'));
});
test('real transport BPM changes and pause/resume preserve Timeline and overlapping child anchors',async()=>{
  const h=graph(),s=h.structures.promote(h.edge('A','B').connection.id,'timeline');h.edge(s.id,'C','child:1');h.structures.setOffset(s.id,'child:1',96);
  window.AudioContext=class {currentTime=0;state='running';resume(){return Promise.resolve();}suspend(){return Promise.resolve();}};
  const transport=transportRegistry.get(MAIN_TRANSPORT_ID),ctx=ensureAudioContext();await transport.play();ctx.currentTime=600/192;h.sequence.updateCurrent(600);
  const root=h.sequence.runtime.getInstance('sequence:A'),timeline=h.sequence.runtime.getInstance(s.definitionId),b=getPlaybackInstance('B'),c=getPlaybackInstance('C');
  const before=[root.id,root.startTick,timeline.id,timeline.startTick,b.id,b.startTick,c.id,c.startTick];
  transport.pause();const paused=transport.currentTick;ctx.currentTime+=5;setBpm(180);assert.equal(transport.currentTick,paused);await transport.play();
  h.sequence.sync(h.panels,transport.getState(),{connections:h.model.list('sequence'),structures:h.structures.list()});assert.equal(transport.currentTick,paused);
  assert.deepEqual([root.id,root.startTick,timeline.id,timeline.startTick,getPlaybackInstance('B').id,getPlaybackInstance('B').startTick,getPlaybackInstance('C').id,getPlaybackInstance('C').startTick],before);
  transport.pause();setBpm(120);transport.returnToStart();
});
