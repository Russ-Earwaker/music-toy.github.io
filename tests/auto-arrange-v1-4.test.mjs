import test from 'node:test';
import assert from 'node:assert/strict';
import {createLongPhraseContour,createRandomLineStroke} from '../src/drawgrid/dg-randomizers.js';
import {drawgridLoopLengthTicks,toyLoopLengthTicks} from '../src/drawgrid/dg-pattern-length.js';
import {attachInstancePlayback} from '../src/toy-instances.js';
import {getCurrentPlaybackOccurrence,withPlaybackOccurrence} from '../src/playback-context.js';
import {playbackAudioBusId} from '../src/toy-audio-routing.js';
import {getToyGain,setToyVolume,setToyMuted} from '../src/audio-core.js';
import {createDgSetState} from '../src/drawgrid/dg-set-state.js';

test('32-step normal DrawGrid option is four bars while legacy timing is unchanged',()=>{
 assert.equal(drawgridLoopLengthTicks(8),384);assert.equal(drawgridLoopLengthTicks(16),384);assert.equal(drawgridLoopLengthTicks(32),1536);
 assert.equal(toyLoopLengthTicks({dataset:{toy:'drawgrid',steps:'32'}},{loopLengthTicks:384}),1536,'old occurrence timing cannot override authored long duration');
 assert.equal(toyLoopLengthTicks({dataset:{toy:'drawgrid',steps:'8'},__drawGridPlayer:true},{loopLengthTicks:1536}),384,'a deliberate shorter author setting replaces stale long occurrence timing');
});
test('normal DrawGrid state application can be awaited before generation, avoiding a later empty hydration overwrite',async()=>{
 const old=globalThis.requestAnimationFrame,frames=[];globalThis.requestAnimationFrame=fn=>frames.push(fn);
 const state={panel:{isConnected:true,dataset:{},querySelector(){return null;}},cols:8,currentCols:8,strokes:[],currentMap:{active:[],nodes:[],disabled:[]}};
 try{
  const api=createDgSetState({state,deps:{captureState:()=>({steps:state.cols})}}),pending=api.setState({steps:32,nodes:{active:Array(32).fill(false),list:Array.from({length:32},()=>[]),disabled:Array.from({length:32},()=>[])}});
  assert.ok(pending instanceof Promise);assert.equal(state.cols,8);frames.shift()();assert.equal(state.cols,8);frames.shift()();
  assert.equal(await pending,true);assert.equal(state.cols,32);assert.equal(state.currentMap.nodes.length,32);
 }finally{globalThis.requestAnimationFrame=old;}
});
test('long normal randomisation develops one bounded motif rather than four independent bars',()=>{
 const contour=createLongPhraseContour(32,()=>.6);
 assert.equal(contour.length,32);assert.ok(contour.every(y=>y>=.1&&y<=.9));
 for(let i=0;i<8;i++){assert.ok(Math.abs(contour[i+8]-contour[i]-.16)<1e-8);assert.ok(Math.abs(contour[i+16]-contour[i]+.12)<1e-8);}
 const stroke=createRandomLineStroke({cols:32,rows:12,gridArea:{x:0,y:0,w:640,h:240},cw:20,ch:20,topPad:0},()=>.6);
 assert.equal(stroke.generatorId,1);assert.ok(stroke.pts.length>32);assert.equal(stroke.coordinateSpace,'drawgrid-logical-v1');
});
test('linked instances share current source gain/mute, not a default or copied Instance gain',()=>{
 const oldWindow=globalThis.window;
 class Context{constructor(){this.currentTime=0;this.destination={};}createGain(){return{gain:{value:1,cancelScheduledValues(){},setTargetAtTime(v){this.value=v;},setValueAtTime(v){this.value=v;}},connect(){}};}}
 globalThis.window={AudioContext:Context};
 const master={id:'volume-master',__audioToyId:'volume-master-audio',dataset:{},__sequencerSchedule(){const occurrence=getCurrentPlaybackOccurrence();return{owner:occurrence.instanceToyId,bus:getToyGain(playbackAudioBusId(this.__audioToyId,occurrence)),occurrence};}},a={id:'volume-a'},b={id:'volume-b'};
 attachInstancePlayback(a,master);attachInstancePlayback(b,master);
 try{
  for(const volume of [.35,.02,.8]){
   setToyVolume(master.__audioToyId,volume);setToyVolume(a.id,1);setToyVolume(b.id,1);
   const play=panel=>withPlaybackOccurrence({occurrenceId:panel.id,generation:0,context:{harmony:null}},()=>panel.__sequencerSchedule(0,0));
   const aa=play(a),bb=play(b);assert.equal(aa.bus,bb.bus);assert.equal(aa.bus.gain.value,volume);assert.notEqual(aa.owner,bb.owner);
  }
  setToyMuted(master.__audioToyId,true);assert.equal(getToyGain(master.__audioToyId).gain.value,0);setToyMuted(master.__audioToyId,false);assert.equal(getToyGain(master.__audioToyId).gain.value,.8);
  assert.equal(playbackAudioBusId('standalone',null),'standalone');
 }finally{globalThis.window=oldWindow;}
});
