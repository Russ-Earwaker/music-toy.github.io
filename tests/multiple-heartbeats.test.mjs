import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeartbeatModel } from '../src/heartbeats.js';
import { transportRegistry, MAIN_TRANSPORT_ID } from '../src/transport-registry.js';
import { ensureAudioContext } from '../src/audio-core.js';
import { createConnectionModel } from '../src/connections.js';
import { createConnectionAdapter } from '../src/connection-adapter.js';
import { createChainSequenceAdapter } from '../src/chain-sequence.js';
import { createStructureToyModel } from '../src/structure-toys.js';
import { createStructureRuntime } from '../src/structure-runtime.js';
import { createSequencerScheduler } from '../src/note-scheduler.js';
import { ensurePlaybackInstance, getPlaybackInstance, clearPlaybackInstancesForTests } from '../src/playback-instances.js';

globalThis.window = { AudioContext: class { currentTime=0; state='running'; resume(){return Promise.resolve();} } };
const out = (objectId, portId='output') => ({ objectId, portId });
const input = objectId => ({ objectId, portId:'input' });
function harness() {
  for (const {id} of transportRegistry.list()) transportRegistry.remove(id);
  const main=transportRegistry.get(MAIN_TRANSPORT_ID); main.pause(); main.setBpm(120); main.seekTick(0);
  ensureAudioContext().currentTime=0; clearPlaybackInstancesForTests();
  const model=createConnectionModel(), heartbeats=createHeartbeatModel({connections:model});
  const second=heartbeats.create({bpm:90,position:{x:300,y:200}});
  const panels=['A','B','C','D'].map(id=>({id,dataset:{toy:'loopgrid',steps:'8'},__seqRev:0,
    __sequencerSchedule(column,when,metadata){calls.push({toyId:id,column,when,...metadata});}}));
  const calls=[],cancelled=[]; panels.forEach(p=>ensurePlaybackInstance(p.id));
  const structures=createStructureToyModel(model), chainState=new Map();
  const sequence=createChainSequenceAdapter({connectionModel:model,getToy:id=>panels.find(p=>p.id===id),chainState,cancelToy:id=>cancelled.push(id)});
  const adapter=createConnectionAdapter(model,{onDetach:id=>cancelled.push(id),onSequenceChange:()=>sync()});
  function sync(){sequence.sync(panels,main.getState(),{connections:model.list('sequence'),structures:structures.list()});}
  adapter.sync(panels); sync();
  const edge=(from,to,port='output')=>model.connect('sequence',out(from,port),input(to));
  const root=(heartbeat,to)=>model.connect('transport',out(heartbeat),input(to));
  return {model,heartbeats,second,main,panels,calls,cancelled,structures,sequence,adapter,edge,root,sync};
}

test('second Heartbeat has an independent mapping, BPM, retained pause, and selected Return to Start',async()=>{
  const h=harness(),secondary=transportRegistry.get(h.second.transportId),ctx=ensureAudioContext();
  assert.notEqual(h.second.transportId,MAIN_TRANSPORT_ID);
  await h.main.play(); await secondary.play();ctx.currentTime=1;
  assert.equal(h.main.currentTick,192);assert.equal(secondary.currentTick,144);
  h.main.pause();ctx.currentTime=2;
  assert.equal(h.main.currentTick,192);assert.equal(secondary.currentTick,288);
  assert.equal(ctx.state,'running');await h.main.play();ctx.currentTime=3;
  assert.equal(h.main.currentTick,384);assert.equal(secondary.currentTick,432);
  secondary.setBpm(100);assert.equal(secondary.currentTick,432);assert.equal(h.main.bpm,120);
  h.heartbeats.select(h.second.id);h.heartbeats.transport().returnToStart();
  assert.equal(secondary.currentTick,0);assert.equal(h.main.currentTick,384);
  h.heartbeats.select(null);assert.strictEqual(h.heartbeats.transport(),h.main);
});

test('one scheduler drives both trees and reparenting invalidates old occurrences at the destination next beat',async()=>{
  const h=harness(),secondary=transportRegistry.get(h.second.transportId),ctx=ensureAudioContext();
  h.edge('A','B');h.edge('C','D');h.root(h.second.id,'C');
  await h.main.play();await secondary.play();h.sync();
  const scheduler=createSequencerScheduler();
  function poll(id,from,to){const t=transportRegistry.get(id);scheduler.tick({transportId:id,activeToyIds:new Set(),
    playbackTurns:h.sequence.turnsForLookahead(from,to,id),getToy:id=>h.panels.find(p=>p.id===id),
    currentTick:from,lookaheadEndTick:to,tickToAudioTime:t.tickToAudioTime,audioTimeToTick:t.audioTimeToTick});}
  poll(MAIN_TRANSPORT_ID,0,200);poll(h.second.transportId,0,200);poll(MAIN_TRANSPORT_ID,0,200);poll(h.second.transportId,0,200);
  assert.equal(h.calls.filter(c=>c.toyId==='A'&&c.eventTick===48)[0].when,.25);
  assert.equal(h.calls.filter(c=>c.toyId==='C'&&c.eventTick===48)[0].when,1/3);
  assert.equal(new Set(h.calls.map(c=>c.identity)).size,h.calls.length);
  const old=h.sequence.turnsForLookahead(0,800,MAIN_TRANSPORT_ID);
  ctx.currentTime=.75;h.root(h.second.id,'A');
  assert.equal(h.model.getTransportId('B'),h.second.transportId);
  assert.ok(old.every(t=>!t.playbackInstance.active));
  const performance=h.sequence.runtime.getInstance('sequence:A');
  assert.equal(performance.transportId,h.second.transportId);assert.equal(performance.startTick,192);
  assert.ok(h.cancelled.includes('A')&&h.cancelled.includes('B'));
  assert.equal(h.sequence.turnsForLookahead(144,500,MAIN_TRANSPORT_ID).length,0);
  const turns=h.sequence.turnsForLookahead(108,800,h.second.transportId);
  assert.ok(turns.filter(t=>['A','B'].includes(t.toyId)).every(t=>t.transportId===h.second.transportId));
  poll(h.second.transportId,108,800);const count=h.calls.length;poll(h.second.transportId,108,800);assert.equal(h.calls.length,count);
});

test('nested Structures inherit one domain; a whole nested branch moves together; mixed definitions reject',()=>{
  const h=harness();const s=h.structures.promote(h.edge('A','B').connection.id,'together');h.edge(s.id,'C','child:1');
  const nested=h.structures.promote(h.model.getParent('B').id,'repeat');
  h.root(h.second.id,'A');
  for(const id of ['A','B','C',s.id,nested.id])assert.equal(h.model.getTransportId(id),h.second.transportId);
  assert.equal(h.structures.get(s.id).transportId,h.second.transportId);
  assert.equal(h.structures.get(nested.id).transportId,h.second.transportId);
  for(const d of h.sequence.runtime.debugSnapshot().definitions)assert.equal(d.transportId,h.second.transportId);
  const runtime=createStructureRuntime();runtime.defineStructure('foreign','repeat',[{toyId:'x',durationTicks:384}],0,{transportId:'foreign'});
  assert.throws(()=>runtime.defineStructure('mixed','sequence',[{structureId:'foreign'}],0,{transportId:MAIN_TRANSPORT_ID}),/Mixed transport/);
  assert.throws(()=>runtime.defineStructure('mixed-leaf','together',[{toyId:'x',transportId:'foreign'}]),/Mixed transport/);
});

test('deleting secondary leaves descendants inactive and Main is permanent',()=>{
  const h=harness();h.edge('A','B');h.root(h.second.id,'A');
  assert.equal(h.heartbeats.remove(MAIN_TRANSPORT_ID),false);assert.equal(transportRegistry.remove(MAIN_TRANSPORT_ID),false);
  assert.equal(h.heartbeats.remove(h.second.id),true);
  for(const id of ['A','B']){assert.equal(h.model.getTransportId(id),null);assert.equal(getPlaybackInstance(id).active,false);}
  assert.equal(h.sequence.turnsForLookahead(0,2000).filter(t=>['A','B'].includes(t.toyId)).length,0);
  h.adapter.sync(h.panels);assert.equal(h.model.getParent('A'),null);
});

test('Heartbeat, domain, retained position and root topology round trip; old scenes migrate to Main',()=>{
  const h=harness();h.edge('A','B');h.root(h.second.id,'A');
  const secondary=transportRegistry.get(h.second.transportId);secondary.seekTick(700);
  const saved=JSON.parse(JSON.stringify({heartbeats:h.heartbeats.snapshot(),connections:h.model.list()}));
  h.heartbeats.restore(saved.heartbeats);h.adapter.restore(saved.connections,h.panels);
  assert.equal(h.model.getTransportId('B'),h.second.transportId);assert.equal(transportRegistry.get(h.second.transportId).bpm,90);
  assert.equal(transportRegistry.get(h.second.transportId).positionTick,700);assert.notEqual(transportRegistry.get(h.second.transportId).state,'playing');
  assert.deepEqual(h.heartbeats.get(h.second.id).position,{x:300,y:200});
  h.heartbeats.restore(undefined,137);assert.equal(h.heartbeats.list().length,1);assert.equal(h.main.bpm,137);assert.equal(h.main.currentTick,0);
});
