import test from 'node:test';
import assert from 'node:assert/strict';
import { createStructureRuntime } from '../src/structure-runtime.js';
import { createChainSequenceAdapter } from '../src/chain-sequence.js';
import { createSequencerScheduler } from '../src/note-scheduler.js';
import { clearPlaybackInstancesForTests, getPlaybackInstance, getPlaybackStepEvents } from '../src/playback-instances.js';
import { ensureAudioContext } from '../src/audio-core.js';
import { transportRegistry, MAIN_TRANSPORT_ID } from '../src/transport-registry.js';
import { createConnectionModel, HEARTBEAT_PORTS } from '../src/connections.js';
import { createStructureToyModel } from '../src/structure-toys.js';
import { getActivationConnections } from '../src/graph-transition-feedback.js';
import { transposeNote, isPitchedEvent } from '../src/note-transpose.js';
import { noteToFreq } from '../src/audio-tones.js';

const param = () => ({ value: 1, setValueAtTime(value) { this.value = value; },
  exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
class AudioContext {
  currentTime = 0; state = 'running'; destination = {}; nodes = [];
  resume() { return Promise.resolve(); }
  createGain() { return { gain: param(), connect() { return this; } }; }
  createOscillator() { return this.node({ frequency: param() }); }
  createBufferSource() { return this.node({ playbackRate: param() }); }
  node(parameters) { const node = { ...parameters, stops: [], connect() { return this; },
    start(time) { this.startTime = time; }, stop(time) { this.stops.push(time); } }; this.nodes.push(node); return node; }
  async decodeAudioData() { return { duration: 1 }; }
}
const notes = [];
globalThis.window = { AudioContext, location: { href: 'http://localhost/' },
  dispatchEvent(event) { if (event.type === 'toy:note') notes.push(event.detail); } };
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
const { triggerInstrument, initAudioAssets } = await import('../src/audio-samples.js');
const ctx = ensureAudioContext();
const child = (toyId = 'A') => ({ toyId, entryId: toyId, durationTicks: 384 });
const ref = structureId => ({ structureId, entryId: structureId });
const input = objectId => ({ objectId, portId: 'input' });
const out = (objectId, portId = 'output') => ({ objectId, portId });
const state = tick => ({ currentTick: tick, state: 'paused' });
function harness(kinds = ['drawgrid']) {
  clearPlaybackInstancesForTests(); notes.length = 0; ctx.nodes.length = 0; ctx.currentTime = 0;
  const panels = kinds.map((toy, i) => ({ id: String.fromCharCode(65+i), dataset: { toy, steps: '8' },
    __seqRev: 0, sourceNote: i === 1 ? 'C3' : 'C4',
    __sequencerSchedule(column, when) { triggerInstrument('tone', this.sourceNote, when, this.id); } }));
  const adapter = createChainSequenceAdapter({ getToy: id => panels.find(p => p.id === id), chainState: new Map() });
  const scheduler = createSequencerScheduler();
  const roots = [];
  const sync = tick => adapter.sync(panels, state(tick || 0), { runtimeRoots: roots });
  const schedule = (from, to, bpm = 120) => scheduler.tick({ currentTick: from, lookaheadEndTick: to,
    playbackTurns: adapter.turnsForLookahead(from,to), getToy: id => panels.find(p => p.id === id),
    tickToAudioTime: tick => tick*60/(96*bpm) });
  const modifier = (id, semitones, target = child(), tick = 0) => adapter.runtime.defineModifier(id,'transpose',[target],tick,
    { semitones, representationId: id });
  const close = () => { scheduler.dispose(); adapter.reset(); };
  return { panels, adapter, scheduler, roots, sync, schedule, modifier, close };
}

test('Transpose stays separate from timing Structures and has one transparent child', () => {
  const r = createStructureRuntime();
  assert.throws(() => r.defineStructure('not-sequence','transpose',[child()]), /Structure/);
  assert.throws(() => r.defineModifier('bad','transpose',[child(),child('B')]), /at most one/);
  const m = r.defineModifier('M','transpose',[child()],0,{semitones:5});
  assert.equal(m.kind,'modifier'); assert.equal(m.type,'transpose'); assert.equal(m.durationTicks,384);
  assert.equal(m.context.transposeSemitones,5);
});

for (const semitones of [0,12,-12]) test(`final synth note boundary applies ${semitones} semitones with unchanged velocity and timing`, () => {
  notes.length = 0; ctx.nodes.length = 0;
  triggerInstrument('tone','C4',1,'pitched',{context:{transposeSemitones:semitones}},0.65);
  assert.equal(notes[0].note,semitones === 12 ? 'C5' : semitones === -12 ? 'C3' : 'C4');
  assert.equal(notes[0].velocity,0.65); assert.equal(notes[0].when,1);
  assert.ok(Math.abs(ctx.nodes[0].frequency.value-noteToFreq('C4')*Math.pow(2,semitones/12))<1e-9);
});

test('note conversion handles MIDI numbers, sharps, flats and octave boundaries without mutating notes', () => {
  assert.equal(transposeNote(60,12),72); assert.equal(noteToFreq(72),noteToFreq('C5'));
  assert.equal(transposeNote('B3',1),'C4'); assert.equal(transposeNote('Db4',-1),'C4');
  assert.equal(transposeNote('C4',-1),'B3'); assert.equal(transposeNote('C4',0),'C4');
  assert.equal(transposeNote('unpitched',7),'unpitched');
});

test('one source plays original/+5/+7 sequentially through real final audio scheduling', () => {
  const h = harness(); h.modifier('five',5); h.modifier('seven',7);
  h.roots.push({ headId:'song',type:'sequence',children:[child(),ref('five'),ref('seven')],members:['A'] }); h.sync();
  const result = h.schedule(0,1152);
  assert.equal(result.scheduled,24); assert.equal(new Set(result.events.map(e=>e.occurrenceId)).size,3);
  assert.deepEqual(notes.filter((n,i)=>i%8===0).map(n=>n.note),['C4','F4','G4']);
  assert.equal(h.panels.length,1); assert.equal(h.panels[0].sourceNote,'C4');
  assert.equal(h.schedule(0,1152).scheduled,0); h.close();
});

test('overlapping 0/+7 same-source occurrences sound together without dedupe or cancellation', () => {
  const h = harness(); h.modifier('zero',0); h.modifier('seven',7);
  h.roots.push({ headId:'song',type:'together',children:[ref('zero'),ref('seven')],members:['A'] }); h.sync();
  const result=h.schedule(0,48);
  assert.equal(result.scheduled,2); assert.notEqual(result.events[0].occurrenceId,result.events[1].occurrenceId);
  assert.deepEqual(notes.map(n=>n.note),['C4','G4']);
  assert.equal(ctx.nodes[0].startTime,ctx.nodes[1].startTime);
  assert.equal(ctx.nodes[0].stops.length,1); assert.equal(ctx.nodes[1].stops.length,1);
  h.close();
});

test('nested +5/-2 modifiers compose to +3 at the actual audio boundary', () => {
  const h=harness();h.modifier('minus',-2);h.modifier('plus',5,ref('minus'));
  h.roots.push({headId:'song',type:'transpose',semitones:0,children:[ref('plus')],members:['A']});h.sync();h.schedule(0,48);
  assert.equal(notes[0].note,'D#4'); assert.equal(notes[0].context.transposeSemitones,3);
  assert.equal(h.panels[0].sourceNote,'C4');h.close();
});

test('Transpose around Sequence shifts Melody and Bass while Drum Grid retains pitch and all timing', () => {
  const h=harness(['drawgrid','drawgrid','loopgrid-drum']);
  h.adapter.runtime.defineSequence('sequence',[child('A'),child('B'),child('C')]);
  h.roots.push({headId:'song',type:'transpose',semitones:5,children:[ref('sequence')],members:['A','B','C']});
  h.sync();h.schedule(0,1152);
  assert.deepEqual(notes.filter((n,i)=>i%8===0).map(n=>[n.toyId,n.note,n.when]),[['A','F4',0.001],['B','F3',2],['C','C4',4]]);
  assert.deepEqual(h.panels.map(p=>p.sourceNote),['C4','C3','C4']);h.close();
});

test('Chord Wheel, Rippler and Bouncer event-provider callback contracts receive pitched occurrence context', () => {
  const h=harness(['chordwheel','rippler','bouncer']);
  for(const panel of h.panels) {
    panel.__sequencerEventsInWindow=(from,to,instance)=>getPlaybackStepEvents(instance,from,to,8);
    panel.__sequencerScheduleEvent=(event,when)=>triggerInstrument('tone',panel.sourceNote,when,panel.id);
  }
  h.adapter.runtime.defineSequence('providers',[child('A'),child('B'),child('C')]);
  h.roots.push({headId:'song',type:'transpose',semitones:5,children:[ref('providers')],members:['A','B','C']});
  h.sync();assert.equal(h.schedule(0,1152).scheduled,24);
  assert.deepEqual(notes.filter((n,i)=>i%8===0).map(n=>n.note),['F4','F3','F4']);h.close();
});

test('percussion classification preserves drum hits but pitched mallets and explicit pitched instruments transpose', () => {
  for(const instrument of ['DRUM KICK','Djembe','DJIMBE','HI-HAT CLOSED','HAND CLAP','Cowbell']) {
    assert.equal(isPitchedEvent(instrument),false);
    notes.length=0;triggerInstrument(instrument,'C4',1,'drums',{context:{transposeSemitones:12}});
    assert.equal(notes[0].note,'C4');
  }
  for(const instrument of ['Kalimba','Marimba','Xylophone','tone','Piano','Bass Tone 1']) assert.equal(isPitchedEvent(instrument),true);
  assert.equal(isPitchedEvent('Djembe',null,{pitchShift:true}),true);
});

test('live modifier editing changes only unscheduled notes and keeps occurrence identity and start tick', () => {
  const h=harness();h.modifier('T',5);
  h.roots.push({headId:'song',type:'together',children:[ref('T')],members:['A']});h.sync();
  h.schedule(0,96);const original=getPlaybackInstance('A'), oldContext=notes[0].context;
  h.modifier('T',7,child(),48);h.schedule(48,192);
  assert.equal(getPlaybackInstance('A'),original);assert.equal(original.startTick,0);
  assert.deepEqual(notes.map(n=>n.note),['F4','F4','G4','G4']);
  assert.equal(oldContext.transposeSemitones,5);assert.equal(original.context.transposeSemitones,7);
  assert.equal(h.panels[0].sourceNote,'C4');h.close();
});

test('pause/resume and BPM change retain modifier context, occurrence identity and anchor', async () => {
  const transport=transportRegistry.get(MAIN_TRANSPORT_ID);transport.pause();transport.seekTick(0);transport.setBpm(120);
  const h=harness();h.modifier('T',5);h.roots.push({headId:'song',type:'together',children:[ref('T')],members:['A']});h.sync();
  await transport.play();h.schedule(0,96);ctx.currentTime=.25;transport.pause();
  const occurrence=getPlaybackInstance('A');ctx.currentTime=2;transport.setBpm(90);await transport.play();
  h.scheduler.resetTimeline(48,{includeBoundary:false});h.schedule(48,192,90);
  assert.equal(getPlaybackInstance('A'),occurrence);assert.equal(occurrence.startTick,0);assert.equal(occurrence.context.transposeSemitones,5);
  assert.ok(notes.every(n=>n.note==='F4'));transport.pause();h.close();ctx.currentTime=0;
});

function graph() {
  const model=createConnectionModel();for(const id of ['A','B'])model.registerObject(id);
  model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS,transportId:MAIN_TRANSPORT_ID});
  const structures=createStructureToyModel(model);model.connect('transport',out(MAIN_TRANSPORT_ID),input('A'));
  return {model,structures};
}

test('editing the visible modifier definition updates future child notes without a retrigger or activation flash',()=>{
  const h=harness(['loopgrid','drawgrid']),{model,structures}=graph();
  const edge=model.connect('sequence',out('A'),input('B')).connection,m=structures.promote(edge.id,'transpose');
  structures.setSemitones(m.id,5);
  const cancellations=[],activations=[];
  const adapter=createChainSequenceAdapter({connectionModel:model,getToy:id=>h.panels.find(p=>p.id===id),chainState:new Map(),
    cancelToy:id=>cancellations.push(id),onTurn:turn=>activations.push(turn)});
  const sync=tick=>adapter.sync(h.panels,state(tick),{connections:model.list('sequence'),structures:structures.list()});
  const schedule=(from,to)=>h.scheduler.tick({currentTick:from,lookaheadEndTick:to,
    playbackTurns:adapter.turnsForLookahead(from,to),getToy:id=>h.panels.find(p=>p.id===id),tickToAudioTime:tick=>tick/192});
  sync(0);schedule(384,480);const original=getPlaybackInstance('B');
  cancellations.length=0;activations.length=0;structures.setSemitones(m.id,7);sync(432);schedule(432,576);
  assert.equal(getPlaybackInstance('B'),original);assert.equal(original.startTick,384);
  assert.deepEqual(notes.map(n=>n.note),['F3','F3','G3','G3']);
  assert.equal(cancellations.length,0);assert.equal(activations.length,0);
  adapter.reset();structures.dispose();h.close();
});
for(const kind of ['sequence','transport'])test(`${kind} midpoint insertion keeps the downstream edge and inherited Heartbeat`,()=>{
  const {model,structures}=graph();
  const edge=kind==='sequence'?model.connect('sequence',out('A'),input('B')).connection:model.getParent('A');
  const node=structures.promote(edge.id,'transpose');
  assert.equal(node.kind,'modifier');assert.equal(node.semitones,0);assert.equal(node.outputCount,1);
  assert.equal(model.get(edge.id).from.objectId,node.id);assert.equal(model.get(edge.id).to.objectId,kind==='sequence'?'B':'A');
  assert.equal(model.getTransportId(node.id),MAIN_TRANSPORT_ID);assert.equal(model.getTransportId(kind==='sequence'?'B':'A'),MAIN_TRANSPORT_ID);
  assert.equal(model.getObject(node.id).ports['child:1'],undefined);
  const adapter=createChainSequenceAdapter({connectionModel:model,getToy:id=>({id,dataset:{}}),chainState:new Map()});
  adapter.sync(['A','B'].map(id=>({id,dataset:{}})),state(0),{connections:model.list('sequence'),structures:structures.list()});
  assert.equal(adapter.runtime.getDefinition(node.definitionId).kind,'modifier');
  const turn=adapter.turnsForLookahead(0,769).find(t=>t.toyId===model.get(edge.id).to.objectId);
  const activated=getActivationConnections(model,turn);
  assert.ok(activated.some(c=>c.from.objectId===node.id),'the outgoing modifier cable participates in traversal feedback');
  adapter.reset();structures.dispose();
});

test('modifier parameters, board position, collapse and topology round trip without runtime contexts',()=>{
  const {model,structures}=graph();const edge=model.getParent('A'),m=structures.promote(edge.id,'transpose');
  structures.setSemitones(m.id,7);structures.move(m.id,320,240);structures.setCollapsed(m.id,true);
  const saved=JSON.parse(JSON.stringify({structureToys:structures.list(),connections:model.snapshot().connections}));
  assert.doesNotMatch(JSON.stringify(saved),/occurrenceId|context|scheduledUntilTick/);
  const restored=graph();restored.structures.restore(saved.structureToys);
  for(const c of restored.model.list())restored.model.disconnect(c.id);
  for(const c of saved.connections)assert.equal(restored.model.connect(c.kind,c.from,c.to,{id:c.id}).ok,true);
  assert.deepEqual(restored.structures.get(m.id),structures.get(m.id));
  restored.structures.remove(m.id);
  assert.ok(restored.model.getObject('A'),'trash keeps the child toy');
  assert.equal(restored.model.getParent('A'),null,'normal node deletion leaves the child detached');
  assert.equal(restored.model.isRooted('A'),false);
  structures.dispose();restored.structures.dispose();
});

test('nested visible modifiers publish both traversed outgoing cables for activation feedback',()=>{
  const {model,structures}=graph();
  const outer=structures.promote(model.getParent('A').id,'transpose');structures.setSemitones(outer.id,5);
  const inner=structures.promote(model.getParent('A').id,'transpose');structures.setSemitones(inner.id,-2);
  assert.equal(model.getObject(outer.id).modifier.type,'transpose');
  assert.equal(model.getObject(outer.id).structure,null);
  const adapter=createChainSequenceAdapter({connectionModel:model,getToy:id=>({id,dataset:{}}),chainState:new Map()});
  adapter.sync([{id:'A',dataset:{}}],state(0),{connections:model.list('sequence'),structures:structures.list()});
  const turn=adapter.turnsForLookahead(0,48)[0];
  assert.equal(turn.context.transposeSemitones,3);
  const edges=getActivationConnections(model,turn);
  assert.ok(edges.some(c=>c.from.objectId===outer.id));assert.ok(edges.some(c=>c.from.objectId===inner.id));
  adapter.reset();structures.dispose();
});

test('pitched samples use existing rate adjustment, including explicit playbackRate, while drum samples ignore transpose',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>String(url).endsWith('.csv')?{ok:true,text:async()=>
    'filename,instrument,instrument_type,instrument_id,base_note,music_behavior\nP.wav,piano,piano,test_piano,C4,melodic\nD.wav,drum,percussion,test_drum,C4,rhythmic'}
    :{arrayBuffer:async()=>new ArrayBuffer(8)};
  try {
    await initAudioAssets('http://localhost/transpose-test.csv');notes.length=0;ctx.nodes.length=0;
    for(const shift of [0,12,-12])triggerInstrument('test_piano','C4',4,'sample',{context:{transposeSemitones:shift}},.7);
    triggerInstrument('test_piano','C4',4,'sample',{context:{transposeSemitones:12},playbackRate:1.5,env:{decaySec:.4}},.7);
    triggerInstrument('test_drum','C4',4,'sample',{context:{transposeSemitones:12}},.7);
    assert.deepEqual(ctx.nodes.map(n=>n.playbackRate.value),[1,2,.5,3,1]);
    assert.ok(notes.every(n=>n.velocity===.7&&n.when===4));
    assert.deepEqual(notes.map(n=>n.instrument),['test_piano','test_piano','test_piano','test_piano','test_drum']);
  } finally {globalThis.fetch=originalFetch;}
});
