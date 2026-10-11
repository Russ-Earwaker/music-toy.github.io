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
window.__HARMONY_DEBUG=true;
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



import { DEFAULT_CHORDS } from '../src/chord-progression.js';
import { classifyMusicalRole, adaptNoteToHarmony, deriveProgressionScale, resolveMusicalPitch, noteMidi } from '../src/harmonic-adaptation.js';
const harmony={progressionId:'M',originTick:96,stepTicks:384,chords:DEFAULT_CHORDS};
const adapt=(sourcePitch,tick,role='melody',extra={})=>adaptNoteToHarmony({sourcePitch,eventTick:tick,harmony,role,...extra});
test('explicit capabilities, instrument bass hint and all current toy classifications',()=>{
 for(const toyType of ['drawgrid','bouncer','rippler'])assert.equal(classifyMusicalRole({toyType,instrument:'piano'}),'melody');
 assert.equal(classifyMusicalRole({toyType:'chordwheel',instrument:'piano',options:{musicalRole:'melody'}}),'harmony');
 assert.equal(classifyMusicalRole({toyType:'loopgrid-drum',instrument:'piano'}),'percussion');
 assert.equal(classifyMusicalRole({toyType:'drawgrid',instrument:'electric_bass'}),'accompaniment');
 assert.equal(classifyMusicalRole({instrument:'marimba'}),'melody');
 assert.equal(classifyMusicalRole({instrument:'bassoon'}),'melody');
 assert.equal(classifyMusicalRole({instrument:'piano',options:{musicalRole:'bass'}}),'accompaniment');
 assert.equal(classifyMusicalRole({instrument:'DRUM_KICK',options:{musicalRole:'bass'}}),'percussion');
});
test('progression-wide shared scale defaults naturally to C major and supports other keys',()=>{
 const c=deriveProgressionScale(DEFAULT_CHORDS);assert.equal(c.root,'C');assert.equal(c.quality,'major');assert.deepEqual(c.pitches,[0,2,4,5,7,9,11]);
 assert.equal(deriveProgressionScale([{root:'D',quality:'minor'}]).root,'D');
 assert.equal(deriveProgressionScale([{root:'F#',quality:'major'}]).root,'F#');
});
test('bass maps neutral home chord degrees to C/Am/F/G without flattening the motif',()=>{
 const motif=['C3','G3','E3','G3'];
 assert.deepEqual([96,480,864,1248].map(t=>motif.map(n=>adapt(n,t,'bass'))),[
 ['C3','G3','E3','G3'],['A2','E3','C3','E3'],['F3','C4','A3','C4'],['G2','D3','B2','D3']]);
 assert.equal(adapt('C3',480,'bass',{register:{minMidi:48,maxMidi:71}}),'A3');
 assert.equal(adapt(48,480,'bass'),45);
});
test('melody keeps scale tones, moves chromatic notes minimally and preserves monotone contour/repeats',()=>{
 for(const n of ['C4','D4','E4','F4','G4','A4','B4'])assert.equal(adapt(n,480),n);
 assert.equal(adapt('C#4',480),'C4');assert.equal(adapt('F#4',480),'F4');
 const source=['C4','C#4','D4','D#4','E4','F#4','G4'];
 const mapped=source.map(n=>noteMidi(adapt(n,480)));assert.ok(mapped.every((n,i)=>!i||n>=mapped[i-1]));
 assert.deepEqual(['G4','F#4','E4','D#4','C4'].map(n=>adapt(n,480)),['G4','F4','E4','D4','C4']);
 assert.equal(adapt('F#4',864),adapt('F#4',864));
 assert.equal(adapt('rest',480),'rest');assert.equal(adapt('C4',95),'C4');
});
test('harmony voices and percussion bypass adaptation; explicit Transpose follows the adapted bass pitch',()=>{
 assert.equal(adapt('F#4',480,'harmony'),'F#4');assert.equal(adapt('F#4',480,'percussion'),'F#4');
 const p=resolveMusicalPitch({sourcePitch:'C3',eventTick:480,context:{harmony,transposeSemitones:12},role:'bass'});
 assert.equal(p.adaptedNote,'A2');assert.equal(p.finalNote,'A3');assert.equal(p.resolvedChord.root,'A');
 assert.equal(resolveMusicalPitch({sourcePitch:'C3',eventTick:480,context:{harmony,transposeSemitones:12},role:'percussion'}).finalNote,'C3');
});
test('audible compact bass/melody/drum proof preserves source rhythm, rests, velocity and event boundaries',()=>{
 const h=harness(['drawgrid','drawgrid','loopgrid']);
 const patterns=[['C3','G3',null,'E3','G3',null,'C3',null],['C4','D4','E4',null,'G4','F#4','E4',null],['C4',null,'C4',null,'C4',null,'C4',null]];
 h.panels.forEach((p,i)=>{p.pattern=patterns[i];p.dataset.musicalRole=i===0?'bass':i===1?'melody':'percussion';
 p.__sequencerSchedule=function(column,when){const n=this.pattern[column];if(n)triggerInstrument('tone',n,when,this.id,{},.65);};});
 const source=structuredClone(patterns);
 h.adapter.runtime.defineStructure('band','together',h.panels.map(p=>child(p.id)));
 h.adapter.runtime.defineStructure('four','repeat',[ref('band')],0,{count:4});
 h.roots.push({headId:'song',type:'chord-progression',children:[ref('four')],members:['A','B','C']});h.sync();h.schedule(0,1536);
 assert.deepEqual(h.panels.map(p=>p.pattern),source);
 const bass=notes.filter(n=>n.toyId==='A'),melody=notes.filter(n=>n.toyId==='B'),drums=notes.filter(n=>n.toyId==='C');
 assert.deepEqual(bass.filter(n=>n.pitchDecision.eventTick%384===0).map(n=>n.note),['C3','A2','F3','G2']);
 assert.equal(melody.length,24);assert.equal(bass.length,20);assert.equal(drums.length,16);
 assert.ok(drums.every(n=>n.note==='C4'&&n.pitchDecision.role==='percussion'));
 for(let bar=0;bar<4;bar++)for(let i=0;i<3;i++){
 const played=notes.filter(n=>n.toyId===h.panels[i].id&&n.pitchDecision.eventTick>=bar*384&&n.pitchDecision.eventTick<(bar+1)*384);
 assert.deepEqual(played.map(n=>n.pitchDecision.eventTick-bar*384),source[i].flatMap((n,j)=>n?[j*48]:[]));
 }
 assert.ok(notes.every(n=>n.velocity===.65));assert.ok(melody.some(n=>n.pitchDecision.sourceNote==='D4'&&n.note==='D4'));
 assert.ok(melody.filter(n=>n.pitchDecision.sourceNote==='F#4').every(n=>n.note==='F4'));
 h.close();
});
for(const type of ['sequence','timeline'])test(type+' harmony resolves long-provider notes across boundaries without rewriting Bouncer/Rippler data',()=>{
 const h=harness(['bouncer','rippler']);const saved=[];
 for(const p of h.panels){p.dataset.musicalRole='bass';p.recorded=[{eventTick:0,note:'C3'},{eventTick:384,note:'C3'}];saved.push(structuredClone(p.recorded));
 p.__sequencerEventsInWindow=(from,to,instance)=>p.recorded.map((e,i)=>({...e,eventTick:instance.startTick+e.eventTick,eventKey:'hit:'+i})).filter(e=>e.eventTick>=from&&e.eventTick<to);
 p.__sequencerScheduleEvent=(e,when)=>triggerInstrument('tone',e.note,when,p.id);}
 h.adapter.runtime.defineStructure('section',type,h.panels.map(p=>({...child(p.id),durationTicks:768,offsetTick:0})));
 h.roots.push({headId:'song',type:'chord-progression',children:[ref('section')],members:['A','B']});h.sync();h.schedule(0,type==='timeline'?768:1536);
 assert.deepEqual(notes.filter(n=>n.toyId==='A').map(n=>n.note),['C3','A2']);assert.deepEqual(h.panels.map(p=>p.recorded),saved);h.close();
});
test('one source overlaps in two harmonies with separate audio pitches and stable live-edit identities',()=>{
 const h=harness();const p=h.panels[0];p.dataset.musicalRole='bass';p.sourceNote='C3';
 h.adapter.runtime.defineModifier('C','chord-progression',[{...child(),durationTicks:768}],0,{chords:[{root:'C',quality:'major'}]});
 h.adapter.runtime.defineModifier('Am','chord-progression',[{...child(),durationTicks:768}],0,{chords:[{root:'A',quality:'minor'}]});
 h.roots.push({headId:'song',type:'together',children:[ref('C'),ref('Am')],members:['A']});h.sync();h.schedule(0,192);
 assert.deepEqual(notes.filter(n=>n.pitchDecision.eventTick===0).map(n=>n.note),['C3','A2']);
 assert.equal(new Set(notes.map(n=>n.occurrenceId)).size,2);const before=h.adapter.turnsForLookahead(0,1).map(t=>t.playbackInstance);
 const committed=notes.slice();h.adapter.runtime.defineModifier('Am','chord-progression',[{...child(),durationTicks:768}],192,{chords:[{root:'F',quality:'major'}]});h.sync(192);h.schedule(192,384);
 assert.deepEqual(h.adapter.turnsForLookahead(192,193).map(t=>t.playbackInstance),before);
 assert.ok(notes.filter(n=>n.occurrenceId===before[1].occurrenceId&&n.pitchDecision.eventTick>=192).every(n=>n.note==='F3'));
 assert.ok(committed.filter(n=>n.occurrenceId===before[1].occurrenceId).every(n=>n.note==='A2'));
 assert.equal(p.sourceNote,'C3');h.close();
});
test('pitched samples include harmonic and transpose shifts once even with explicit playbackRate; drums remain untouched',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async url=>String(url).endsWith('.csv')?{ok:true,text:async()=> 'filename,instrument,instrument_type,instrument_id,base_note,music_behavior\nP.wav,piano,piano,follow_piano,C4,melodic\nD.wav,drum,percussion,follow_drum,C4,rhythmic'}:{arrayBuffer:async()=>new ArrayBuffer(8)};
 try{await initAudioAssets('http://localhost/follow.csv');notes.length=0;ctx.nodes.length=0;
 const options={eventTick:480,context:{harmony,transposeSemitones:12},musicalRole:'bass',playbackRate:1.5};
 triggerInstrument('follow_piano','C4',4,'sample',options,.7);triggerInstrument('follow_drum','C4',4,'sample',options,.7);
 assert.equal(notes[0].note,'A4');assert.ok(Math.abs(ctx.nodes[0].playbackRate.value-1.5*Math.pow(2,9/12))<1e-9);
 assert.equal(notes[1].note,'C4');assert.equal(ctx.nodes[1].playbackRate.value,1.5);assert.ok(notes.every(n=>n.when===4&&n.velocity===.7));
 }finally{globalThis.fetch=previous;}
});

test('Piano to Marimba changes timbre without changing melody adaptation or source pitches',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async url=>String(url).endsWith('.csv')?{ok:true,text:async()=> 'filename,instrument,instrument_type,instrument_id,base_note,music_behavior\nP.wav,piano,piano,role_piano,C4,melodic\nM.wav,marimba,percussion,role_marimba,C4,melodic'}:{arrayBuffer:async()=>new ArrayBuffer(8)};
 try{await initAudioAssets('http://localhost/roles.csv');notes.length=0;ctx.nodes.length=0;
 for(const instrument of ['role_piano','role_marimba'])triggerInstrument(instrument,'F#4',4,'sample',{eventTick:480,context:{harmony}},.6);
 assert.deepEqual(notes.map(n=>[n.pitchDecision.sourceNote,n.pitchDecision.role,n.note]),[['F#4','melody','F4'],['F#4','melody','F4']]);
 assert.equal(ctx.nodes[0].playbackRate.value,ctx.nodes[1].playbackRate.value);
 }finally{globalThis.fetch=previous;}
});
async function boardGraph(nesting = [], withRepeat = true) {
 const previousFetch=globalThis.fetch;
 globalThis.fetch=async url=>String(url).endsWith('.csv')?{ok:true,text:async()=>await (await import('node:fs/promises')).readFile(new URL('../samples.csv',import.meta.url),'utf8')}:{arrayBuffer:async()=>new ArrayBuffer(8)};
 try{await initAudioAssets('http://localhost/board.csv');}finally{globalThis.fetch=previousFetch;}
 const h=harness(['drawgrid','drawgrid','loopgrid']);
 h.adapter.reset();
 const model=createConnectionModel();
 model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS});
 const patterns=[['C3',null,'C3',null,'C3',null,'C3',null],['E4','G4','A4','G4','E4','F#4','D4','C4'],['C4',null,'C4',null,'C4',null,'C4',null]];
 h.panels.forEach((p,i)=>{model.registerObject(p.id);p.pattern=patterns[i];p.dataset.musicalRole=i===0?'bass':i===1?'melody':'percussion';
 p.__sequencerSchedule=function(column,when){if(this.pattern[column])triggerInstrument(i===0?'BASS GUITAR SLAP':'tone',this.pattern[column],when,this.id,{},.65);};});
 const structures=createStructureToyModel(model);
 const connect=(kind,from,to)=>assert.equal(model.connect(kind,from,to).ok,true);
 const band=structures.createStandalone('together'),repeat=withRepeat?structures.createStandalone('repeat'):null,chords=structures.createStandalone('chord-progression');
 if(repeat)structures.setCount(repeat.id,4);
 h.panels.forEach((p,i)=>connect('sequence',out(band.id,'child:'+i),input(p.id)));
 if(repeat)connect('sequence',out(repeat.id,'child:0'),input(band.id));
 connect('sequence',out(chords.id,'child:0'),input(repeat?.id||band.id));
 connect('transport',out(MAIN_TRANSPORT_ID),input(chords.id));
 let transpose;
 if(nesting.length){transpose=structures.promote(model.getParent(nesting[0]==='transpose'?chords.id:(repeat?.id||band.id)).id,'transpose');structures.setSemitones(transpose.id,12);}
 const adapter=createChainSequenceAdapter({connectionModel:model,getToy:id=>h.panels.find(p=>p.id===id),chainState:new Map()});
 const sync=tick=>adapter.sync(h.panels,state(tick||0),{connections:model.list('sequence'),structures:structures.list()});
 const schedule=(from,to,bpm=120)=>h.scheduler.tick({currentTick:from,lookaheadEndTick:to,playbackTurns:adapter.turnsForLookahead(from,to),getToy:id=>h.panels.find(p=>p.id===id),tickToAudioTime:tick=>tick*60/(96*bpm)});
 const close=()=>{h.scheduler.dispose();adapter.reset();structures.dispose();};
 return {...h,adapter,model,structures,band,repeat,chords,transpose,sync,schedule,close};
}
for(const nesting of [[],['transpose','chords'],['chords','transpose']])test('normal connection graph plays bass, melody and drums: '+(nesting.join(' → ')||'harmony only'),async()=>{
 const h=await boardGraph(nesting),source=structuredClone(h.panels.map(p=>p.pattern));h.sync();h.schedule(0,1536);
 const bass=notes.filter(n=>n.toyId==='A'),melody=notes.filter(n=>n.toyId==='B'),drums=notes.filter(n=>n.toyId==='C');
 const shift=nesting.length?12:0;
 assert.deepEqual(bass.filter(n=>n.pitchDecision.eventTick%384===0).map(n=>n.pitchDecision.adaptedNote),['C3','A2','F3','G2']);
 assert.ok(bass.every(n=>n.pitchDecision.role==='accompaniment'&&n.note===transposeNote(n.pitchDecision.adaptedNote,shift)));
 assert.equal(melody.length,32);assert.ok(melody.every(n=>n.pitchDecision.adaptedNote===(n.pitchDecision.sourceNote==='F#4'?'F4':n.pitchDecision.sourceNote)&&n.note===transposeNote(n.pitchDecision.adaptedNote,shift)));
 assert.equal(drums.length,16);assert.ok(drums.every(n=>n.note==='C4'&&n.pitchDecision.role==='percussion'));
 assert.deepEqual(h.panels.map(p=>p.pattern),source);
 const turns=h.adapter.turnsForLookahead(0,1);
 assert.ok(getActivationConnections(h.model,turns[0]).some(c=>c.to.objectId===h.chords.id));
 const before=turns.map(t=>t.playbackInstance);
 h.structures.setCollapsed(h.chords.id,true);h.structures.setCollapsed(h.band.id,true);h.sync();
 assert.deepEqual(h.adapter.turnsForLookahead(0,1).map(t=>t.playbackInstance),before);
 h.close();
});
test('normal graph live chord/source edits and restored graph retain authored state and playback decisions',async()=>{
 const h=await boardGraph();h.sync();h.schedule(0,384);const committed=structuredClone(notes);
 const first=h.adapter.turnsForLookahead(384,385).map(t=>t.playbackInstance);
 h.structures.setProgression(h.chords.id,{chords:[{root:'C',quality:'major'},{root:'D',quality:'minor'},{root:'F',quality:'major'},{root:'G',quality:'major'}]});
 h.sync(384);h.schedule(384,768,90);
 assert.ok(notes.filter(n=>n.toyId==='A'&&n.pitchDecision.eventTick>=384).every(n=>n.note==='D3'));
 assert.deepEqual(notes.slice(0,committed.length),committed);
 assert.deepEqual(h.adapter.turnsForLookahead(384,385).map(t=>t.playbackInstance),first);
 h.panels[1].pattern[0]='D4';h.panels[1].__seqRev++;h.sync(768);h.schedule(768,1152,90);
 assert.equal(notes.find(n=>n.toyId==='B'&&n.pitchDecision.eventTick===768).pitchDecision.sourceNote,'D4');
 h.structures.setCollapsed(h.chords.id,true);
 const saved=JSON.parse(JSON.stringify({nodes:h.structures.list(),edges:h.model.list(),sources:h.panels.map(p=>p.pattern)}));
 const expected=notes.filter(n=>n.pitchDecision.eventTick>=384&&n.pitchDecision.eventTick<768).map(n=>[n.toyId,n.note,n.pitchDecision.resolvedChord]);
 h.close();
 const restored=await boardGraph();restored.adapter.reset();restored.structures.suspend(()=>{restored.model.list().forEach(c=>restored.model.disconnect(c.id));restored.structures.restore(saved.nodes);saved.edges.forEach(c=>assert.equal(restored.model.connect(c.kind,c.from,c.to,{id:c.id}).ok,true));});
 restored.panels.forEach((p,i)=>p.pattern=saved.sources[i]);restored.sync();restored.schedule(384,768,90);
 assert.deepEqual(notes.map(n=>[n.toyId,n.note,n.pitchDecision.resolvedChord]),expected.map((n,i)=>i===4?[n[0],'D4',n[2]]:n));
 assert.equal(restored.structures.get(h.chords.id).collapsed,true);
 assert.deepEqual(restored.panels.map(p=>p.pattern),saved.sources);restored.close();
});

test('scene restoration discards old occurrences and scheduler cursors when modifier nesting changes',async()=>{
 const h=await boardGraph(['transpose','chords']);h.sync();h.schedule(0,1536);h.sync(3072);h.schedule(3072,3840);
 const source=structuredClone(h.panels.map(p=>p.pattern));
 const nodes=JSON.parse(JSON.stringify(h.structures.list())),edges=JSON.parse(JSON.stringify(h.model.list()));
 // Saved replacement scene: Chords → Transpose → Repeat instead of Transpose → Chords.
 edges.find(c=>c.kind==='transport').to=input(h.chords.id);
 edges.find(c=>c.from.objectId===h.transpose.id).to=input(h.repeat.id);
 edges.find(c=>c.from.objectId===h.chords.id).to=input(h.transpose.id);
 h.structures.suspend(()=>{
  h.structures.restore(nodes);
  h.adapter.reset();h.scheduler.reset();
  h.model.list().forEach(c=>h.model.disconnect(c.id));
  edges.forEach(c=>assert.equal(h.model.connect(c.kind,c.from,c.to,{id:c.id}).ok,true));
 });
 notes.length=0;h.sync(0);h.schedule(0,1536);
 assert.deepEqual(notes.filter(n=>n.pitchDecision.role==='accompaniment'&&n.pitchDecision.eventTick%384===0).map(n=>n.note),['C4','A3','F4','G3']);
 assert.ok(notes.every(n=>n.pitchDecision.eventTick<1536));
 assert.deepEqual(h.panels.map(p=>p.pattern),source);h.close();
});

test('normal graph pause/resume and BPM change preserve harmony origin and occurrences',async()=>{
 const h=await boardGraph(),transport=transportRegistry.get(MAIN_TRANSPORT_ID);
 transport.pause();transport.setBpm(120);transport.seekTick(0);h.sync();
 try{
  await transport.play();ctx.currentTime=2.25;const tick=transport.currentTick;
  assert.equal(tick,432);
  const before=h.adapter.turnsForLookahead(tick,tick+1).map(t=>t.playbackInstance);
  transport.pause();ctx.currentTime+=10;assert.equal(transport.currentTick,tick);
  transport.setBpm(73);await transport.play();
  h.adapter.sync(h.panels,transport.getState(),{connections:h.model.list('sequence'),structures:h.structures.list()});
  assert.deepEqual(h.adapter.turnsForLookahead(tick,tick+1).map(t=>t.playbackInstance),before);
  assert.ok(before.every(p=>p.context.harmony.originTick===0));
  const result=h.scheduler.tick({transportId:MAIN_TRANSPORT_ID,currentTick:tick,lookaheadEndTick:960,playbackTurns:h.adapter.turnsForLookahead(tick,960,MAIN_TRANSPORT_ID),getToy:id=>h.panels.find(p=>p.id===id),tickToAudioTime:transport.tickToAudioTime});
  assert.ok(result.scheduled>0);
  assert.deepEqual(notes.filter(n=>n.toyId==='A'&&n.pitchDecision.eventTick%384===0).map(n=>n.note),['F3']);
  assert.ok(notes.every(n=>Math.abs(n.when-Math.max(ctx.currentTime+.001,transport.tickToAudioTime(n.pitchDecision.eventTick)))<1e-9));
 }finally{transport.pause();h.close();}
});

test('pitch inspection is opt-in developer metadata and adds no permanent player UI',()=>{
 window.__HARMONY_DEBUG=false;notes.length=0;triggerInstrument('tone','C3',4,'test',{eventTick:480,context:{harmony},musicalRole:'bass'});
 assert.equal(notes[0].note,'A2');assert.equal('pitchDecision' in notes[0],false);
 window.__HARMONY_DEBUG=true;triggerInstrument('tone','C3',4,'test',{eventTick:480,context:{harmony},musicalRole:'bass'});
 assert.deepEqual([notes[1].pitchDecision.sourceNote,notes[1].pitchDecision.role,notes[1].pitchDecision.resolvedChord.root,notes[1].pitchDecision.adaptedNote,notes[1].pitchDecision.transpose,notes[1].pitchDecision.finalNote],['C3','accompaniment','A','A2',0,'A2']);
});

test('production scheduling reads local transpose live and composes with graph context',()=>{
 const h=harness(),p=h.panels[0];p.dataset.musicalRole='accompaniment';p.dataset.localTranspose='3';p.sourceNote='C3';
 globalThis.document={getElementById:id=>h.panels.find(p=>p.id===id),querySelector:()=>p};
 try {
  triggerInstrument('tone',p.sourceNote,1,p.id,{eventTick:480,context:{harmony,transposeSemitones:5}});
  assert.deepEqual([notes[0].pitchDecision.role,notes[0].pitchDecision.transpose,notes[0].note],['accompaniment',8,'F3']);
  p.dataset.localTranspose='0';triggerInstrument('tone',p.sourceNote,2,p.id,{eventTick:480,context:{harmony,transposeSemitones:5}});
  assert.equal(notes[1].note,'D3');assert.equal(p.sourceNote,'C3');
 } finally {delete globalThis.document;h.close();}
});

test('real graph Progression → Together cycles all four chords without Repeat or source mutation',async()=>{
 const h=await boardGraph([],false),source=structuredClone(h.panels.map(p=>p.pattern));
 try {
  h.sync();h.schedule(0,3072);
  const bass=notes.filter(n=>n.toyId==='A'),melody=notes.filter(n=>n.toyId==='B'),drums=notes.filter(n=>n.toyId==='C');
  assert.deepEqual(bass.filter(n=>n.pitchDecision.eventTick%384===0).map(n=>n.note),['C3','A2','F3','G2','C3','A2','F3','G2']);
  assert.equal(bass.length,32);assert.equal(melody.length,64);assert.equal(drums.length,32);
  assert.ok(melody.every(n=>n.pitchDecision.adaptedNote===(n.pitchDecision.sourceNote==='F#4'?'F4':n.pitchDecision.sourceNote)));
  assert.ok(drums.every(n=>n.note==='C4'&&n.pitchDecision.role==='percussion'));
  assert.ok(notes.every(n=>n.pitchDecision.eventTick<3072));assert.ok(h.adapter.turnsForLookahead(1536,1537).length>0);
  assert.deepEqual(h.panels.map(p=>p.pattern),source);assert.deepEqual(h.structures.list().map(s=>s.type),['together','chord-progression']);
 }finally{h.close();}
});

for(const nesting of [['transpose','chords'],['chords','transpose']])test('toy offset survives graph nesting '+nesting.join(' → '),async()=>{
 const h=await boardGraph(nesting),p=h.panels[0],source=structuredClone(p.pattern);
 p.dataset.localTranspose='3';h.structures.setSemitones(h.transpose.id,5);
 globalThis.document={getElementById:id=>h.panels.find(p=>p.id===id),querySelector:()=>null};
 try {
  h.sync();h.schedule(0,1536);
  const own=notes.filter(n=>n.toyId===p.id);assert.equal(own.length,16);
  assert.ok(own.every(n=>n.pitchDecision.localTranspose===3&&n.pitchDecision.graphTranspose===5&&n.pitchDecision.transpose===8&&n.note===transposeNote(n.pitchDecision.adaptedNote,8)));
  assert.ok(notes.filter(n=>n.toyId==='B').every(n=>n.pitchDecision.transpose===5));
  assert.ok(notes.filter(n=>n.toyId==='C').every(n=>n.pitchDecision.transpose===0));
  assert.deepEqual(p.pattern,source);assert.equal(p.dataset.localTranspose,'3');
  // Reparent this same source into a new group outside graph modifiers.
  const edge=h.model.getParent(p.id);h.model.disconnect(edge.id);
  const group=h.structures.createStandalone('together');
  assert.equal(h.model.connect('transport',out(MAIN_TRANSPORT_ID),input(group.id)).ok,true);
  assert.equal(h.model.connect('sequence',out(group.id,'child:0'),input(p.id)).ok,true);
  notes.length=0;h.sync(1536);h.schedule(1536,1920);
  const moved=notes.filter(n=>n.toyId===p.id);assert.ok(moved.length>0);
  assert.ok(moved.every(n=>n.pitchDecision.localTranspose===3&&n.pitchDecision.graphTranspose===0&&n.pitchDecision.role==='accompaniment'));
  assert.deepEqual(p.pattern,source);
 } finally {delete globalThis.document;h.close();}
});
