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


import { DEFAULT_CHORDS, CHORD_STEP_TICKS, normalizeChords, resolveChordAtTick, progressionLabel } from '../src/chord-progression.js';
import { composeContext, normalizeContext } from '../src/playback-context.js';
const chordAt=(context,tick)=>resolveChordAtTick(context,tick)?.root+(resolveChordAtTick(context,tick)?.quality==='minor'?'m':'');
const progression=(r,id,target,options={},tick=0)=>r.defineModifier(id,'chord-progression',[target],tick,{representationId:id,...options});

test('default chords, all presets, boundaries, wrap and normalized authored limits',()=>{
  assert.equal(progressionLabel(DEFAULT_CHORDS),'C | Am | F | G');
  assert.equal(normalizeChords([]).length,4);assert.equal(normalizeChords(Array(12).fill({root:'invalid',quality:'seventh'})).length,8);
  for(const stepTicks of CHORD_STEP_TICKS){
    const c=normalizeContext({harmony:{originTick:192,stepTicks,chords:DEFAULT_CHORDS}});
    assert.equal(resolveChordAtTick(c,191),null);
    assert.deepEqual(Array.from({length:8},(_,i)=>chordAt(c,192+i*stepTicks)),['C','Am','F','G','C','Am','F','G']);
    assert.equal(chordAt(c,192+stepTicks-1),'C');
  }
  assert.equal(resolveChordAtTick(normalizeContext(),384),null);
});
test('Chord Progression is a single-child modifier with a complete progression duration',()=>{
 const r=createStructureRuntime();assert.throws(()=>r.defineStructure('M','chord-progression',[child()]),/Structure/);
 assert.throws(()=>r.defineModifier('M','chord-progression',[child(),child('B')]),/at most one/);
 const m=progression(r,'M',child());assert.equal(m.durationTicks,1536);assert.equal(m.kind,'modifier');assert.equal(m.context.transposeSemitones,0);
});
test('compact Progression → Repeat four → Together Bass/Melody/Beat resolves all four bars',()=>{
 const r=createStructureRuntime();r.defineStructure('band','together',[child('Bass'),child('Melody'),child('Beat')]);
 r.defineStructure('repeat','repeat',[ref('band')],0,{count:4});progression(r,'M',ref('repeat'));
 r.startStructure('M',96,{quantize:false});const turns=r.turnsInWindow('M',96,1632);
 assert.equal(turns.length,12);assert.equal(new Set(turns.map(t=>t.occurrenceId)).size,12);
 assert.deepEqual(turns.map(t=>chordAt(t.context,t.startTick)),['C','C','C','Am','Am','Am','F','F','F','G','G','G']);
 assert.ok(turns.every(t=>t.context.harmony.originTick===96));
 assert.equal(r.getDefinition('repeat').context.harmony,null,'Repeat has no harmonic policy or counter');
 assert.deepEqual(r.turnsInWindow('M',1632,3200),[]);
});
for(const type of ['sequence','timeline'])test(type+' below progression uses event ticks including long and overlapping leaves',()=>{
 const r=createStructureRuntime();r.defineStructure('section',type,[{...child(),durationTicks:768,offsetTick:0},{...child('B'),durationTicks:768,offsetTick:384}]);
 progression(r,'M',ref('section'));r.startStructure('M',192,{quantize:false});
 const turns=r.turnsInWindow('M',192,192+1536);const first=turns[0];
 assert.equal(chordAt(first.context,192),'C');assert.equal(chordAt(first.context,576),'Am');
 const b=turns.find(t=>t.toyId==='B');assert.equal(chordAt(b.context,b.startTick),type==='sequence'?'F':'Am');
 assert.equal(b.context.harmony.originTick,192);
});
test('Sequence sections and repeated nested modifiers each have independent local origins',()=>{
 const r=createStructureRuntime();progression(r,'M', {...child(),durationTicks:768});
 r.defineStructure('sections','sequence',[{...ref('M'),entryId:'first'},{...ref('M'),entryId:'second'}]);
 r.startStructure('sections',96,{quantize:false});const ts=r.turnsInWindow('sections',96,3168);
 assert.deepEqual(ts.map(t=>t.context.harmony.originTick),[96,96,1632,1632]);
 assert.deepEqual(ts.map(t=>chordAt(t.context,t.startTick)),['C','F','C','F']);
 assert.equal(chordAt(ts[2].context,2016),'Am');
 r.defineStructure('repeat','repeat',[ref('M')],0,{count:2});r.startStructure('repeat',192,{quantize:false});
 assert.deepEqual(r.turnsInWindow('repeat',192,3264).map(t=>t.context.harmony.originTick),[192,192,1728,1728]);
});
test('child harmony overrides only its subtree, while Transpose adds and velocity multiplies',()=>{
 const r=createStructureRuntime();progression(r,'inner',child(),{chords:[{root:'D',quality:'minor'}]});
 r.defineModifier('transpose','transpose',[ref('inner')],0,{semitones:-2,context:{velocityScale:.8}});
 r.defineStructure('branches','together',[ref('transpose'),child('B')],0,{context:{transposeSemitones:5,velocityScale:.5}});
 progression(r,'outer',ref('branches'));r.startStructure('outer',96,{quantize:false});
 const ts=r.turnsInWindow('outer',96,480);
 assert.deepEqual(ts.map(t=>chordAt(t.context,96)),['Dm','C']);assert.deepEqual(ts.map(t=>t.context.transposeSemitones),[3,5]);
 assert.equal(ts[0].context.velocityScale,.4);assert.equal(ts[0].context.harmony.progressionId,'inner');
 assert.equal('chord' in ts[0].context,false);
});
test('live chord order and duration changes retain local origins, IDs, generation and submitted contexts',()=>{
 const r=createStructureRuntime();progression(r,'M',{...child(),durationTicks:1536});
 r.defineStructure('section','sequence',[child('intro'),ref('M')]);r.startStructure('section',96,{quantize:false});
 const before=r.turnsInWindow('section',480,481)[0],owner=r.getInstance('section');r.commitThrough('section',960);
 progression(r,'M',{...child(),durationTicks:1536},{chords:[DEFAULT_CHORDS[0],DEFAULT_CHORDS[2],DEFAULT_CHORDS[1],DEFAULT_CHORDS[3]]},720);
 let after=r.turnsInWindow('section',960,961)[0];
 assert.equal(after.id,before.id);assert.equal(after.context.harmony.originTick,480);assert.equal(chordAt(after.context,960),'F');
 assert.equal(chordAt(before.context,960),'Am','already captured metadata remains immutable');
 progression(r,'M',{...child(),durationTicks:1536},{chords:[{root:'G',quality:'minor'},{root:'D',quality:'major'}],stepTicks:192},960);
 assert.deepEqual(r.turnsInWindow('section',1152,2000),[]);
 assert.equal(before.context.harmony.originTick,480);
 assert.equal(r.getInstance('section'),owner);assert.equal(owner.generation,0);
});
for(const provider of [false,true])test('event metadata spans chord boundaries while compatible source melody pitches remain unchanged ('+(provider?'provider':'grid')+')',()=>{
 const h=harness();const toy=h.panels[0];
 if(provider){toy.__sequencerEventsInWindow=(from,to,instance)=>getPlaybackStepEvents(instance,from,to,8);toy.__sequencerScheduleEvent=(event,when)=>triggerInstrument('tone',toy.sourceNote,when,toy.id);}
 h.roots.push({headId:'song',type:'chord-progression',children:[{...child(),durationTicks:1536}],members:['A']});
 h.sync();let result=h.schedule(0,768);const original=getPlaybackInstance('A');
 assert.deepEqual(result.events.filter(e=>e.eventTick%384===0).map(e=>e.resolvedChord),DEFAULT_CHORDS.slice(0,2));
 assert.ok(notes.every(n=>n.note==='C4'));assert.ok(ctx.nodes.every(n=>n.frequency.value===noteToFreq('C4')));
 h.roots[0].chords=[DEFAULT_CHORDS[0],DEFAULT_CHORDS[2],DEFAULT_CHORDS[1],DEFAULT_CHORDS[3]];h.sync(768);
 h.scheduler.resetTimeline(768);result=h.schedule(768,960,90);
 assert.equal(getPlaybackInstance('A'),original);assert.equal(original.context.harmony.originTick,0);
 assert.equal(result.events[0].resolvedChord.root,'A');assert.equal(result.events[0].when,undefined);
 assert.ok(notes.filter(n=>n.when>=768/144).every(n=>n.note==='C4'));
 h.roots[0].stepTicks=192;h.sync(960);result=h.schedule(960,1152,90);
 assert.equal(result.scheduled,0);assert.equal(getPlaybackInstance('A'),original);
 assert.equal(h.schedule(960,1152,90).scheduled,0);h.close();
});
test('audible Transpose remains independent from harmony through the final synth boundary',()=>{
 const h=harness();h.modifier('shift',5);h.roots.push({headId:'song',type:'chord-progression',children:[ref('shift')],members:['A']});h.sync();
 const result=h.schedule(0,48);assert.equal(result.events[0].resolvedChord.root,'C');assert.equal(notes[0].note,'F4');h.close();
});

for(const provider of [false,true])for(const durationTicks of [1152,3072])test('production '+(provider?'provider':'grid')+' clips '+durationTicks+' tick child without compressing its notes',()=>{
 const h=harness(),toy=h.panels[0];
 if(provider){toy.__sequencerEventsInWindow=(from,to,instance)=>getPlaybackStepEvents(instance,from,to,8);toy.__sequencerScheduleEvent=(event,when)=>triggerInstrument('tone',toy.sourceNote,when,toy.id);}
 h.roots.push({headId:'song',type:'chord-progression',children:[{...child(),durationTicks}],members:['A']});
 try {
  h.sync();const result=h.schedule(0,5000),ticks=result.events.map(e=>e.eventTick);
  assert.deepEqual(ticks,durationTicks===1152?[0,144,288,432,576,720,864,1008,1152,1296,1440]:[0,384,768,1152]);
  assert.equal(notes.length,ticks.length);assert.ok(ticks.every(t=>t<1536));assert.equal(toy.sourceNote,'C4');
  assert.equal(h.schedule(1536,5000).scheduled,0);
 }finally{h.close();}
});
for(const kind of ['sequence','transport'])test(kind+' promotion, persistence and activation use the shared modifier graph',()=>{
 clearPlaybackInstancesForTests();
 const model=createConnectionModel();model.registerObject('A');model.registerObject('B');model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS});
 const structures=createStructureToyModel(model);model.connect('transport',out(MAIN_TRANSPORT_ID),input('A'));
 const edge=kind==='sequence'?model.connect('sequence',out('A'),input('B')).connection:model.getParent('A');
 const m=structures.promote(edge.id,'chord-progression');structures.setProgression(m.id,{chords:[{root:'F#',quality:'minor'},{root:'D',quality:'major'}],stepTicks:768});
 structures.move(m.id,320,240);structures.setCollapsed(m.id,true);
 assert.equal(model.get(edge.id).from.objectId,m.id);assert.equal(model.getTransportId(m.id),MAIN_TRANSPORT_ID);
 assert.equal(model.getObject(m.id).ports['child:1'],undefined);
 const saved=JSON.parse(JSON.stringify({nodes:structures.list(),edges:model.list()}));assert.doesNotMatch(JSON.stringify(saved),/harmony|originTick|occurrenceId/);
 const restored=createConnectionModel();restored.registerObject('A');restored.registerObject('B');restored.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS});
 const nodes=createStructureToyModel(restored);nodes.restore(saved.nodes);
 for(const c of saved.edges)assert.equal(restored.connect(c.kind,c.from,c.to,{id:c.id}).ok,true);
 assert.deepEqual(nodes.get(m.id),structures.get(m.id));
 const adapter=createChainSequenceAdapter({connectionModel:restored,getToy:id=>({id,dataset:{}}),chainState:new Map()});
 adapter.sync(['A','B'].map(id=>({id,dataset:{}})),state(0),{connections:restored.list('sequence'),structures:nodes.list()});
 const turn=adapter.turnsForLookahead(0,769).find(t=>t.toyId===model.get(edge.id).to.objectId);
 assert.equal(chordAt(turn.context,turn.startTick),'F#m');assert.equal(turn.context.harmony.originTick,kind==='sequence'?384:0);
 assert.ok(getActivationConnections(restored,turn).some(c=>c.from.objectId===m.id));
 assert.equal(getActivationConnections(restored,turn,turn).some(c=>c.to.objectId===m.id),false,'chord changes do not reactivate the modifier');
 adapter.reset();structures.dispose();nodes.dispose();
});

test('overlapping uses of one progression definition retain independent harmonic origins',()=>{
 const r=createStructureRuntime();progression(r,'M',{...child(),durationTicks:1536});
 r.defineStructure('overlap','timeline',[{...ref('M'),entryId:'early',offsetTick:0},{...ref('M'),entryId:'late',offsetTick:384}]);
 r.startStructure('overlap',96,{quantize:false});const turns=r.turnsInWindow('overlap',864,865);
 assert.deepEqual(turns.map(t=>t.context.harmony.originTick),[96,480]);
 assert.deepEqual(turns.map(t=>chordAt(t.context,864)),['F','Am']);
 assert.deepEqual(r.resolveChordsAtTick('overlap',864).map(x=>x.chord.root),['F','A']);
});
test('real inherited transport pause, resume and BPM changes preserve harmony and occurrence identity',async()=>{
 const transport=transportRegistry.get(MAIN_TRANSPORT_ID);transport.pause();transport.setBpm(120);transport.seekTick(0);
 const h=harness();h.roots.push({headId:'song',type:'chord-progression',children:[{...child(),durationTicks:1536}],members:['A']});h.sync();
 try {
 await transport.play();ctx.currentTime=2.25;const tick=transport.currentTick;assert.equal(tick,432);
 const before=h.adapter.turnsForLookahead(tick,433)[0].playbackInstance;assert.equal(chordAt(before.context,tick),'Am');
 transport.pause();ctx.currentTime+=10;
 h.adapter.sync(h.panels,transport.getState(),{runtimeRoots:h.roots});assert.equal(transport.currentTick,tick);
 transport.setBpm(73);await transport.play();h.scheduler.resetTimeline(tick,{includeBoundary:false});
 const result=h.scheduler.tick({transportId:MAIN_TRANSPORT_ID,currentTick:tick,lookaheadEndTick:960,
 playbackTurns:h.adapter.turnsForLookahead(tick,960,MAIN_TRANSPORT_ID),getToy:()=>h.panels[0],tickToAudioTime:transport.tickToAudioTime});
 const after=h.adapter.turnsForLookahead(tick,433)[0].playbackInstance;
 assert.equal(after,before);assert.equal(after.context.harmony.originTick,0);assert.equal(after.startTick,0);
 assert.deepEqual(result.events.map(e=>e.resolvedChord.root),['A','F']);
 assert.ok(notes.every(n=>n.note==='C4'));
 assert.deepEqual(notes.map(n=>n.when),result.events.map(e=>transport.tickToAudioTime(e.eventTick)));
 }finally{transport.pause();h.close();}
});

test('live insertion above an existing modifier does not reuse its nested definition as the new root',()=>{
 const model=createConnectionModel();model.registerObject('A');model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS});
 const structures=createStructureToyModel(model);model.connect('transport',out(MAIN_TRANSPORT_ID),input('A'));
 const first=structures.promote(model.getParent('A').id,'transpose');structures.setSemitones(first.id,5);
 const adapter=createChainSequenceAdapter({connectionModel:model,getToy:id=>({id,dataset:{}}),chainState:new Map()});
 const sync=()=>adapter.sync([{id:'A',dataset:{}}],state(0),{connections:model.list('sequence'),structures:structures.list()});
 sync();const second=structures.promote(model.getParent(first.id).id,'chord-progression');
 assert.doesNotThrow(sync);const turn=adapter.turnsForLookahead(0,48)[0];
 assert.equal(turn.context.harmony.progressionId,second.definitionId);assert.equal(turn.context.transposeSemitones,5);
 assert.equal(turn.definitionId,second.definitionId);assert.equal(model.list('transport').length,1);
 assert.equal(adapter.runtime.debugSnapshot(0).instances.find(i=>i.definitionId===second.definitionId).harmonicOccurrences[0].resolvedChord.root,'C');
 adapter.reset();structures.dispose();
});
