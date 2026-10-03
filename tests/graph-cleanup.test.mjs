import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionModel} from '../src/connections.js';
import {createConnectionAdapter} from '../src/connection-adapter.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {createStructureToyModel} from '../src/structure-toys.js';
import {createStructureRuntime} from '../src/structure-runtime.js';
import {clearCreationGraph} from '../src/creation-graph.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {clearPlaybackInstancesForTests,ensurePlaybackInstance,getPlaybackInstance} from '../src/playback-instances.js';
import {MAIN_TRANSPORT_ID} from '../src/transport-registry.js';
const input=objectId=>({objectId,portId:'input'}),out=(objectId,portId='output')=>({objectId,portId});
function harness() {
  clearPlaybackInstancesForTests();
  let panels=['A','B','C'].map(id=>{
    const classes=new Set(['selected']);
    return {id,dataset:{toy:'loopgrid'},classes,classList:{
      contains(c){return classes.has(c);},
      toggle(c,on){on?classes.add(c):classes.delete(c);},remove(...cs){cs.forEach(c=>classes.delete(c));}}};
  });
  panels.forEach(p=>ensurePlaybackInstance(p.id,{loopLengthTicks:384}));
  const model=createConnectionModel(),structures=createStructureToyModel(model),chainState=new Map(),state={state:'playing',currentTick:0};
  state.state='stopped';
  const sequence=createChainSequenceAdapter({connectionModel:model,chainState,getToy:id=>panels.find(p=>p.id===id)});
  const adapter=createConnectionAdapter(model,{onSequenceChange:()=>sequence.sync(panels,state,{connections:model.list('sequence'),structures:structures.list()})});
  adapter.sync(panels);
  return {model,structures,sequence,adapter,state,chainState,panels,removePanels(){panels=[];},
    link:(a,b)=>model.connect('sequence',out(a),input(b))};
}
test('disconnect clears active borders immediately throughout a branch, preserving selection; Heartbeat reconnect restores activity',()=>{
  const h=harness(),edge=h.link('A','B').connection;h.link('B','C');
  h.state.currentTick=400;h.sequence.updateCurrent(400);h.adapter.projectActiveState();
  const b=h.panels[1];assert.ok(b.classes.has('toy-playing'));b.classes.add('toy-playing-pulse');
  h.model.disconnect(edge.id);
  for(const p of h.panels.slice(1)) {
    assert.equal(h.model.isRooted(p.id),false);assert.equal(getPlaybackInstance(p.id).active,false);
    assert.equal(p.dataset.chainActive,'false');assert.equal(p.classes.has('toy-playing'),false);
    assert.equal(p.classes.has('toy-playing-pulse'),false);assert.ok(p.classes.has('selected'));
  }
  assert.ok(h.sequence.turnsForLookahead(400,1600).every(t=>!['B','C'].includes(t.toyId)));
  h.model.connect('transport',out(MAIN_TRANSPORT_ID),input('B'));
  assert.ok(b.classes.has('toy-playing'));assert.equal(getPlaybackInstance('B').active,true);
});
for(const type of ['sequence','together']) test(`empty ${type} is zero duration, can be edited live, and cannot spin a zero-length scheduler loop`,()=>{
  const r=createStructureRuntime();r.defineStructure('empty',type,[]);
  assert.equal(r.getDefinition('empty').durationTicks,0);r.startSequence('empty',0,{quantize:false});
  assert.deepEqual(r.turnsInWindow('empty',0,10000),[]);
  r.defineStructure('empty',type,[{toyId:'B',durationTicks:384}],100);
  assert.deepEqual(r.turnsInWindow('empty',100,484).map(t=>[t.toyId,t.startTick]),[['B',100]]);
  r.defineStructure('empty',type,[],200);assert.deepEqual(r.turnsInWindow('empty',200,10000),[]);
});
for(const type of ['sequence','together']) test(`removing final ${type} child immediately removes the containing loop's ghost gap`,()=>{
  const h=harness(),s=h.structures.promote(h.link('A','B').connection.id,type);
  h.state.currentTick=100;h.sequence.turnsForLookahead(100,220);
  const obsolete=h.sequence.turnsForLookahead(220,600).filter(t=>t.toyId==='B');
  const root=h.sequence.runtime.getInstance('sequence:A');
  h.model.disconnect(h.model.getParent('B').id);
  assert.equal(h.sequence.runtime.getDefinition(s.definitionId).durationTicks,0);
  assert.equal(h.sequence.runtime.getDefinition('sequence:A').durationTicks,384);
  assert.deepEqual(h.sequence.turnsForLookahead(220,1536).map(t=>[t.toyId,t.startTick]),[['A',0],['A',384],['A',768],['A',1152]]);
  assert.strictEqual(h.sequence.runtime.getInstance('sequence:A'),root);
  assert.equal(getPlaybackInstance('B').active,false);
  assert.ok(obsolete.every(t=>!t.playbackInstance.active),'removed prepared child activations are revoked');
});
test('New Creation revokes prepared generations and clears all graph/runtime/compatibility state while preserving Heartbeat',()=>{
  const h=harness();h.structures.promote(h.link('A','B').connection.id,'together');
  const orphan=ensurePlaybackInstance('already-destroyed',{active:true});
  const prepared=h.sequence.turnsForLookahead(0,1600),root=h.sequence.runtime.getInstance('sequence:A'),generation=root.generation;
  const scheduler=createSequencerScheduler(),byId=new Map(h.panels.map(p=>[p.id,p]));
  for(const p of h.panels)p.__sequencerSchedule=()=>{};
  scheduler.tick({activeToyIds:new Set(),playbackTurns:prepared,getToy:id=>byId.get(id),
    currentTick:0,lookaheadEndTick:1600,tickToAudioTime:t=>t/192});
  const stateKey=`${prepared[0].toyId}|${prepared[0].playbackInstance.id}`;
  // Verify cache authority is revoked as well as the prepared instances.
  assert.ok(scheduler.getDebugState(stateKey));
  let cleared=false;h.removePanels();
  clearCreationGraph({...h,clearScheduled:()=>{cleared=true;scheduler.reset();}});
  assert.equal(scheduler.getDebugState(stateKey),null);
  assert.ok(cleared);assert.equal(root.active,false);assert.ok(root.generation>generation);
  assert.equal(orphan.active,false);assert.equal(getPlaybackInstance('already-destroyed'),null);
  assert.ok(prepared.every(t=>!t.playbackInstance.active));
  assert.deepEqual(h.model.getObjectIds(),[MAIN_TRANSPORT_ID]);assert.deepEqual(h.model.list(),[]);
  assert.deepEqual(h.structures.list(),[]);assert.equal(h.chainState.size,0);
  assert.deepEqual(h.sequence.runtime.debugSnapshot().definitions,[]);assert.deepEqual(h.sequence.runtime.debugSnapshot().instances,[]);
  assert.deepEqual(h.sequence.turnsForLookahead(0,10000),[]);
  for(const p of h.panels)assert.equal(getPlaybackInstance(p.id),null);
});
