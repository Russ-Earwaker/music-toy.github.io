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
  exponentialRampToValueAtTime() {}, linearRampToValueAtTime(value) { this.value = value; }, cancelScheduledValues(){}, setTargetAtTime(){} });
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

import { createHarmonyLabModel, LAB_PRESETS, parseLabNotes } from '../src/harmony-lab-model.js';
const { createHarmonyLabPlayback } = await import('../src/harmony-lab-playback.js');
import { resolveChordAtTick } from '../src/chord-progression.js';
test('lab presets parse deterministically, validate edits and reset every authored setting',()=>{
 const m=createHarmonyLabModel(),defaults=m.getState();
 assert.deepEqual(defaults.bassNotes,['C3','G3','E3','G3']);assert.deepEqual(defaults.melodyNotes,['E4','G4','A4','G4','E4','F#4','D4','C4']);
 assert.deepEqual(parseLabNotes('C | Bb3 F# -',4),['C4','Bb3','F#4',null]);
 assert.throws(()=>m.setNotes('bass','C nope'),/Use notes/);assert.equal(m.getState(),defaults);
 for(const id of Object.keys(LAB_PRESETS)){m.loadPreset(id);const first=m.getState();m.loadPreset(id);assert.deepEqual(m.getState(),first);}
 m.setMode('follow');m.setRole('bass','melody');m.setRole('melody','bass');m.setTranspose(12);m.setBpm(73);m.setProgression({chords:[{root:'D',quality:'minor'}],stepTicks:96});
 assert.deepEqual(m.reset(),defaults);assert.ok(Object.isFrozen(m.getState().bassNotes));
});
let active;
const dispatch=window.dispatchEvent;window.dispatchEvent=e=>{dispatch(e);if(e.type==='toy:note')active?.record(e.detail);};
function setup(){ctx.currentTime=0;ctx.nodes.length=0;notes.length=0;const lab=createHarmonyLabPlayback();active=lab;return lab;}
const advance=(lab,tick)=>{ctx.currentTime=lab.transport.tickToAudioTime(tick);return lab.tick();};
const partNotes=(lab,part)=>notes.filter(n=>n.toyId===lab.panels.find(p=>p.part===part).id);
test('Original bypasses harmony, Follow uses production adaptation, toggling preserves time and source',async()=>{
 const lab=setup(),source=lab.model.getState().bassNotes;
 try{await lab.play();advance(lab,384);assert.equal(partNotes(lab,'bass').at(-1).note,'C3');
 const before=lab.adapter.turnsForLookahead(384,385).map(t=>[t.occurrenceId,t.startTick]);
 lab.edit(m=>m.setMode('follow'));assert.equal(lab.transport.currentTick,384);
 advance(lab,768);assert.equal(partNotes(lab,'bass').at(-1).note,'F3');
 assert.equal(partNotes(lab,'bass').at(-1).pitchDecision.resolvedChord.root,'F');
 assert.deepEqual(lab.adapter.turnsForLookahead(768,769).map(t=>[t.occurrenceId,t.startTick]),before);
 lab.edit(m=>m.setMode('original'));advance(lab,1152);assert.equal(partNotes(lab,'bass').at(-1).note,'C3');
 assert.equal(lab.model.getState().bassNotes,source);
 }finally{lab.dispose();active=null;}
});
test('role controls and Transpose go through the production explicit role and context paths',async()=>{
 const lab=setup();try{lab.edit(m=>{m.setMode('follow');m.setTranspose(12);});await lab.play();
 advance(lab,384);let n=partNotes(lab,'bass').at(-1);
 assert.deepEqual([n.pitchDecision.role,n.pitchDecision.adaptedNote,n.pitchDecision.transpose,n.note],['bass','A2',12,'A3']);
 lab.edit(m=>m.setRole('bass','melody'));advance(lab,768);n=partNotes(lab,'bass').at(-1);
 assert.deepEqual([n.pitchDecision.role,n.pitchDecision.adaptedNote,n.note],['melody','C3','C4']);
 }finally{lab.dispose();active=null;}
});
test('current chord and sounding readout use the actual resolver and do not expose lookahead early',async()=>{
 const lab=setup();try{lab.edit(m=>m.setMode('follow'));await lab.play();
 assert.equal(lab.inspect().latest,null,'scheduled note at .001 is not yet sounding');
 ctx.currentTime=.005;let view=lab.tick();assert.ok(view.latest);assert.equal(view.latest.eventTick,0);
 const pendingBefore=view.latest;advance(lab,90);assert.equal(lab.inspect().latest.eventTick,0,'beat 96 remains in lookahead until sounding');
 advance(lab,96);ctx.currentTime+=.005;view=lab.tick();assert.equal(view.latest.eventTick,96);
 const note=notes.findLast(n=>n.pitchDecision.eventTick===96&&n.pitchDecision.role!=='percussion');
 assert.deepEqual([view.latest.sourceNote,view.latest.adaptedNote,view.latest.finalNote],[note.pitchDecision.sourceNote,note.pitchDecision.adaptedNote,note.note]);
 advance(lab,384);view=lab.inspect();const turn=lab.adapter.turnsForLookahead(384,385)[0];
 assert.deepEqual(view.chord,resolveChordAtTick(turn.context,384));assert.equal(view.chord.root,'A');
 }finally{lab.dispose();active=null;}
});
test('drum instrument, pitch, rhythm and velocity are identical in both A/B modes',async()=>{
 const results=[];
 for(const mode of ['original','follow']){const lab=setup();try{lab.edit(m=>m.setMode(mode));await lab.play();for(let t=48;t<384;t+=48)advance(lab,t);
 results.push(partNotes(lab,'drums').map(n=>[n.instrument,n.note,n.velocity,n.pitchDecision.eventTick,n.pitchDecision.transpose]));
 }finally{lab.dispose();active=null;}}
 assert.deepEqual(results[0],results[1]);assert.equal(results[0].length,12);
});
test('progression and source edits affect unscheduled events only, keeping origins and captured notes',async()=>{
 const lab=setup();try{lab.edit(m=>m.setMode('follow'));await lab.play();advance(lab,384);
 const committed=partNotes(lab,'bass').at(-1);assert.equal(committed.note,'A2');
 const instance=lab.adapter.turnsForLookahead(384,385)[0].playbackInstance;
 lab.edit(m=>{m.setProgression({chords:[{root:'D',quality:'minor'}]});m.setNotes('bass','C - E G');});
 assert.equal(instance.context.harmony.originTick,0);
 advance(lab,480);assert.equal(partNotes(lab,'bass').at(-1),committed,'new rest does not generate an event');
 advance(lab,576);assert.equal(partNotes(lab,'bass').at(-1).note,'F3');
 assert.equal(committed.note,'A2');assert.equal(committed.pitchDecision.resolvedChord.root,'A');
 assert.equal(lab.adapter.turnsForLookahead(576,577)[0].playbackInstance,instance);
 }finally{lab.dispose();active=null;}
});
test('pause/resume, BPM changes, Return to Start and reset remain lab-local and bound event history',async()=>{
 const lab=setup();try{lab.edit(m=>m.setMode('follow'));await lab.play();advance(lab,384);
 lab.pause();const retained=lab.transport.currentTick;ctx.currentTime+=10;assert.equal(lab.transport.currentTick,retained);
 lab.setBpm(73);await lab.play();assert.equal(lab.transport.currentTick,retained);
 assert.equal(lab.inspect().chord.root,'A');assert.equal(lab.inspect().transport.bpm,73);
 for(let t=480;t<4000;t+=96){advance(lab,t);ctx.currentTime+=.01;lab.tick();}
 assert.equal(lab.inspect().events.length,24);assert.ok(lab.inspect().pendingCount<=64);
 lab.returnToStart();assert.equal(lab.transport.currentTick,0);assert.equal(lab.inspect().latest,null);
 lab.edit(m=>{m.setTranspose(7);m.loadPreset('C');});lab.reset();
 assert.equal(lab.transport.currentTick,0);assert.equal(lab.transport.state,'paused');assert.deepEqual(lab.model.getState(),createHarmonyLabModel().getState());
 assert.equal(lab.inspect().events.length,0);
 }finally{lab.dispose();active=null;}
});

test('lab-only audio IDs are safe in the real browser DOM lookup and seeking while playing restarts harmony at zero',async()=>{
 const previous=globalThis.document;globalThis.document={getElementById:()=>null,querySelector:selector=>{assert.match(selector,/#harmony-lab-\d+-(bass|melody|drums)$/);return null;}};
 const lab=setup();try{await lab.play();assert.ok(partNotes(lab,'bass').length>0);advance(lab,384);lab.returnToStart();
 const turns=lab.adapter.turnsForLookahead(0,1);assert.equal(turns.length,3);assert.ok(turns.every(t=>t.startTick===0&&t.context.harmony.originTick===0));
 assert.equal(lab.inspect().chord.root,'C');advance(lab,384);assert.equal(lab.inspect().chord.root,'A');
 }finally{lab.dispose();active=null;if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
test('Harmony Lab is inactive on ordinary hosted URLs unless debug mode is explicitly enabled',async()=>{
 const {isHarmonyLabEnabled}=await import('../src/harmony-lab-model.js');
 assert.equal(isHarmonyLabEnabled('https://music-toy.github.io/harmony-lab/'),false);
 assert.equal(isHarmonyLabEnabled('https://music-toy.github.io/harmony-lab/?debug=1'),true);
 assert.equal(isHarmonyLabEnabled('http://localhost:4173/harmony-lab/'),true);
 assert.equal(isHarmonyLabEnabled('http://127.0.0.1:4173/harmony-lab/'),true);
});

test('constant C3 bass follows all four production chord contexts; Original remains C3',async()=>{
 const expected=['C3','A2','F3','G2'],roots=['C','A','F','G'];
 for(const mode of ['follow','original']){
  const lab=setup();
  try{
   lab.edit(m=>{m.setNotes('bass','C C C C');m.setMode(mode);});
   await lab.play();
   for(let tick=96;tick<1536;tick+=96)advance(lab,tick);
   ctx.currentTime+=.01;lab.tick();
   const bass=partNotes(lab,'bass');
   assert.equal(bass.length,16);
   for(let bar=0;bar<4;bar++){
    const events=bass.filter(n=>Math.floor(n.pitchDecision.eventTick/384)===bar);
    assert.equal(events.length,4);
    for(const n of events){
     assert.equal(n.pitchDecision.sourceNote,'C3');
     assert.equal(n.pitchDecision.role,'bass');
     assert.equal(n.pitchDecision.transpose,0);
     assert.equal(n.pitchDecision.resolvedChord?.root??null,mode==='follow'?roots[bar]:null);
     assert.equal(n.pitchDecision.adaptedNote,mode==='follow'?expected[bar]:'C3');
     assert.equal(n.note,mode==='follow'?expected[bar]:'C3');
     assert.ok(ctx.nodes.some(node=>node.frequency?.value===noteToFreq(n.note)),'final pitch reaches oscillator scheduling');
    }
   }
   assert.ok(lab.inspect().events.every(e=>e.mode===mode),'history mode comes from the production decision');
   assert.equal(lab.inspect().runtimeError,null);
  }finally{lab.dispose();active=null;}
 }
});

test('live toggles affect the next unscheduled event without rewriting committed decisions or restarting',async()=>{
 const lab=setup();
 try{
  lab.edit(m=>m.setNotes('bass','C C C C'));await lab.play();
  advance(lab,370); // The first Am beat has already been committed in Original.
  const committed=partNotes(lab,'bass').find(n=>n.pitchDecision.eventTick===384);
  assert.ok(committed);assert.equal(committed.note,'C3');
  const identity=lab.adapter.turnsForLookahead(384,385).map(t=>t.occurrenceId);
  lab.edit(m=>m.setMode('follow'));
  assert.equal(lab.transport.currentTick,370);assert.equal(lab.transport.state,'playing');
  advance(lab,480);
  const follow=partNotes(lab,'bass').at(-1);
  assert.equal(follow.pitchDecision.eventTick,480);assert.equal(follow.note,'A2');
  assert.equal(follow.pitchDecision.resolvedChord.root,'A');
  assert.equal(committed.note,'C3');assert.equal(committed.pitchDecision.resolvedChord,null);
  lab.edit(m=>m.setMode('original'));advance(lab,576);
  assert.equal(partNotes(lab,'bass').at(-1).note,'C3');
  assert.equal(partNotes(lab,'bass').at(-1).pitchDecision.resolvedChord,null);
  assert.deepEqual(lab.adapter.turnsForLookahead(576,577).map(t=>t.occurrenceId),identity);
 }finally{lab.dispose();active=null;}
});

test('Follow rejects missing scheduling context visibly instead of silently falling back to Original',()=>{
 const lab=setup(),logged=[],originalError=console.error;
 console.error=message=>logged.push(message);
 try{
  lab.edit(m=>m.setMode('follow'));
  const bass=lab.panels.find(p=>p.part==='bass');
  bass.__sequencerScheduleEvent({eventTick:384,note:'C3'},0,{eventTick:384,context:{harmony:null}});
  assert.equal(notes.length,0,'bypassed event must not reach audio');
  assert.match(lab.inspect().runtimeError,/HARMONY LAB ERROR: UI is Follow Chords but playback event is using Original mode/);
  assert.equal(logged.length,1);
  // Also detect a production decision losing harmony after the scheduling guard.
  lab.record({toyId:bass.id,when:0,pitchDecision:{role:'bass',sourceNote:'C3',resolvedChord:null,adaptedNote:'C3',finalNote:'C3',eventTick:384,transpose:0}});
  assert.equal(logged.length,2);assert.equal(lab.inspect().pendingCount,0);
  lab.reset();assert.equal(lab.inspect().runtimeError,null);
  assert.throws(()=>lab.model.setMode('Follow Chords'),/Unknown Harmony Lab mode/);
  assert.equal(lab.model.getState().mode,'original');
 }finally{console.error=originalError;lab.dispose();active=null;}
});

test('listening mix isolates real audio buses, survives A/B and pause/resume, and restores defaults',async()=>{
 const {getToyGain}=await import('../src/audio-core.js');
 const lab=setup(),bus=part=>getToyGain(lab.panels.find(p=>p.part===part).id).gain;
 try{
  lab.edit(m=>m.setSolo(null));await lab.play();
  assert.equal(bus('bass').value,.6);assert.equal(bus('melody').value,1);assert.equal(bus('drums').value,.45);
  const ids=lab.adapter.turnsForLookahead(0,1).map(t=>t.occurrenceId);
  lab.edit(m=>m.setSolo('bass'));
  assert.equal(bus('bass').value,.6);assert.equal(bus('melody').value,0);assert.equal(bus('drums').value,0);
  advance(lab,96);ctx.currentTime+=.01;lab.tick();assert.equal(lab.inspect().latest.part,'bass','solo also focuses the sounding readout');const tick=lab.transport.currentTick;
  lab.edit(m=>{m.setMode('follow');m.setMix('bass',{volume:.7});});
  assert.equal(bus('bass').value,.7);assert.equal(lab.model.getState().soloPart,'bass');
  assert.equal(lab.transport.currentTick,tick);assert.deepEqual(lab.adapter.turnsForLookahead(0,1).map(t=>t.occurrenceId),ids);
  lab.pause();assert.equal(bus('bass').value,0);
  await lab.play();assert.equal(bus('bass').value,.7);assert.equal(bus('drums').value,0);
  lab.setBpm(90);lab.returnToStart();assert.equal(bus('bass').value,.7);assert.equal(bus('melody').value,0);
  lab.edit(m=>m.setMix('bass',{muted:true}));assert.equal(bus('bass').value,0);
  lab.edit(m=>{m.setSolo(null);m.setMode('original');});assert.equal(bus('bass').value,0);assert.equal(bus('melody').value,1);
  lab.reset();await lab.play();
  assert.equal(bus('bass').value,0);assert.equal(bus('melody').value,1);assert.equal(bus('drums').value,0);
  assert.equal(lab.model.getState().soloPart,'melody');assert.equal(lab.model.getState().bassInstrument,'retro-triangle');
 }finally{lab.dispose();active=null;}
});

test('bass tone selector reaches real oscillator waveform with identical pitch decisions in either mode',async()=>{
 for(const [tone,wave] of [['retro-triangle','triangle'],['retro-square','square'],['sine','sine']]){
  for(const mode of ['original','follow']){
   const lab=setup();
   try{
    lab.edit(m=>{m.setBassInstrument(tone);m.setMode(mode);m.setNotes('bass','C C C C');m.setSolo('bass');});
    await lab.play();advance(lab,384);
    const bass=partNotes(lab,'bass').at(-1);
    assert.equal(bass.instrument,tone);
    assert.equal(bass.note,mode==='follow'?'A2':'C3');
    assert.ok(ctx.nodes.some(node=>node.frequency?.value===noteToFreq(bass.note)&&node.type===wave),'selected waveform must reach audio, without generic envelope overriding it');
   }finally{lab.dispose();active=null;}
  }
 }
});

test('melody pass and statistics capture real sounding decisions and reset on authoring changes',async()=>{
 const lab=setup();
 try{
  lab.edit(m=>m.loadPreset('D'));const source=lab.model.getState().melodyNotes;
  await lab.playFromStart('follow');
  for(let tick=96;tick<768;tick+=96){advance(lab,tick);ctx.currentTime+=.005;lab.tick();}
  const actual=partNotes(lab,'melody').map(n=>n.pitchDecision);
  const evaluated=lab.inspect().evaluation;
  assert.equal(evaluated.stats.played,actual.length);
  assert.equal(evaluated.stats.changed,actual.filter(n=>n.adaptedNote!==n.sourceNote).length);
  assert.deepEqual(evaluated.events.map(n=>n.adaptedNote),actual.map(n=>n.adaptedNote));
  assert.equal(lab.model.getState().melodyNotes,source);assert.ok(evaluated.stats.changed>0);
  lab.edit(m=>m.setProgression({chords:[{root:'D',quality:'minor'}]}));
  assert.equal(lab.inspect().evaluation.stats.played,0);
  advance(lab,864);ctx.currentTime+=.005;lab.tick();assert.ok(lab.inspect().evaluation.stats.played>0);
  lab.edit(m=>m.setNotes('melody','C D E -'));assert.equal(lab.inspect().evaluation.stats.played,0);
  lab.edit(m=>m.loadPreset('C'));assert.equal(lab.inspect().evaluation.latest,null);
  lab.resetEvaluation();assert.equal(lab.inspect().evaluation.stats.played,0);
 }finally{lab.dispose();active=null;}
});
test('one-click A/B schedules identical authored cycles Original then Follow with no overlap or restart at handoff',async()=>{
 const lab=setup();
 try{
  lab.edit(m=>m.loadPreset('D'));const source=lab.model.getState().melodyNotes,chords=lab.model.getState().chords;
  await lab.playFromStart('ab');const cycle=lab.inspect().comparison.cycleTicks;
  for(let tick=48;tick<=cycle*2;tick+=48)advance(lab,tick);
  const melody=partNotes(lab,'melody');
  const original=melody.filter(n=>n.pitchDecision.eventTick<cycle),follow=melody.filter(n=>n.pitchDecision.eventTick>=cycle);
  assert.equal(original.length,14);assert.equal(follow.length,14);
  assert.deepEqual(original.map(n=>[n.pitchDecision.sourceNote,n.instrument,n.velocity]),follow.map(n=>[n.pitchDecision.sourceNote,n.instrument,n.velocity]));
  assert.ok(original.every(n=>n.pitchDecision.resolvedChord===null));
  assert.ok(follow.every(n=>n.pitchDecision.resolvedChord!==null));
  assert.deepEqual(original.map(n=>n.pitchDecision.eventTick),follow.map(n=>n.pitchDecision.eventTick-cycle));
  assert.ok(original.at(-1).when<follow[0].when);
  assert.equal(lab.model.getState().melodyNotes,source);assert.equal(lab.model.getState().chords,chords);
  assert.equal(lab.transport.state,'paused');assert.equal(lab.inspect().comparison,null);
  assert.equal(lab.inspect().evaluation.stats.played,14);
  await lab.playFromStart('original');assert.equal(lab.transport.currentTick,0);assert.equal(lab.model.getState().mode,'original');
  await lab.playFromStart('follow');assert.equal(lab.transport.currentTick,0);assert.equal(lab.model.getState().mode,'follow');
 }finally{lab.dispose();active=null;}
});

test('comparison reset ignores old committed diagnostics while their audio may finish',async()=>{
 const lab=setup();
 try{
  await lab.playFromStart('follow');advance(lab,90);
  assert.ok(partNotes(lab,'melody').some(n=>n.pitchDecision.eventTick===96));
  lab.resetEvaluation();assert.equal(lab.inspect().evaluation.stats.played,0);
  advance(lab,96);ctx.currentTime+=.005;lab.tick();
  assert.equal(lab.inspect().evaluation.stats.played,0,'already committed beat belongs to the old evaluation');
  advance(lab,192);ctx.currentTime+=.005;lab.tick();assert.equal(lab.inspect().evaluation.stats.played,1);
  assert.equal(lab.transport.state,'playing');
 }finally{lab.dispose();active=null;}
});

test('A/B handoff preserves its first Follow note when the browser poll arrives just after the boundary',async()=>{
 const lab=setup();
 try{
  await lab.playFromStart('ab');const cycle=lab.inspect().comparison.cycleTicks;
  for(let tick=48;tick<cycle;tick+=48)advance(lab,tick);
  advance(lab,cycle+7);
  const first=partNotes(lab,'melody').find(n=>n.pitchDecision.eventTick===cycle);
  assert.ok(first,'boundary event must not be lost to zero late grace');
  assert.ok(first.pitchDecision.resolvedChord);assert.equal(lab.transport.currentTick,cycle+7);
  for(let tick=cycle+48;tick<=cycle*2;tick+=48)advance(lab,tick);
  assert.equal(partNotes(lab,'melody').filter(n=>n.pitchDecision.eventTick>=cycle).length,16);
 }finally{lab.dispose();active=null;}
});

test('file log retains full A/B decisions beyond the visible table and resets with the comparison',async()=>{
 const lab=setup();
 try{
  await lab.playFromStart('ab');const cycle=lab.inspect().comparison.cycleTicks;
  for(let tick=48;tick<=cycle*2;tick+=48)advance(lab,tick);
  const view=lab.inspect();assert.equal(view.events.length,24);assert.equal(view.logEvents.length,32);
  assert.equal(view.logEvents[0].eventTick,0);assert.equal(view.logEvents[0].mode,'original');
  assert.equal(view.logEvents.at(-1).mode,'follow');assert.equal(view.logDropped,0);
  assert.ok(view.logEvents.every(e=>e.instrument==='pluck'&&e.part==='melody'));
  assert.equal(view.logEvents.at(-1).adaptedNote,view.evaluation.latest.adaptedNote);
  lab.resetEvaluation();assert.equal(lab.inspect().logEvents.length,0);
 }finally{lab.dispose();active=null;}
});
