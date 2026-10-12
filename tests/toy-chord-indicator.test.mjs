import test from 'node:test';
import assert from 'node:assert/strict';
import {activeToyChord,createToyChordIndicator} from '../src/toy-chord-indicator.js';
import {normalizeContext} from '../src/playback-context.js';
import {createTickTransport} from '../src/tick-transport.js';
import {classifyMusicalRole} from '../src/harmonic-adaptation.js';

const context=normalizeContext({harmony:{originTick:0,stepTicks:384,chords:[{root:'C',quality:'major'},{root:'A',quality:'minor'},{root:'F',quality:'major'},{root:'G',quality:'major'}]}});
const instance=(extra={})=>({active:true,startTick:0,endTick:1536,context,...extra});
const chord=(currentTick,extra={})=>activeToyChord({instance:instance(),currentTick,playing:true,role:'melody',...extra});

test('badge resolves current event tick, never the lookahead boundary',()=>{
  assert.equal(chord(383.99),'C');assert.equal(chord(384),'Am');
  assert.equal(chord(768),'F');assert.equal(chord(1152),'G');assert.equal(chord(1536),null);
  assert.equal(chord(1536,{instance:instance({endTick:3072})}),'C');
});
test('inactive, future, disconnected and percussion playback stays clean',()=>{
  assert.equal(chord(384,{instance:null}),null);
  assert.equal(chord(384,{instance:instance({active:false})}),null);
  assert.equal(chord(384,{instance:instance({startTick:480})}),null);
  assert.equal(chord(384,{instance:instance({context:normalizeContext()})}),null);
  for(const role of ['percussion','harmony'])assert.equal(chord(384,{role}),null);
  assert.equal(classifyMusicalRole({toyType:'loopgrid',instrument:'PIANO',options:{musicalRole:'melody'}}),'percussion');
});
test('Instance and Master context state is independent even with shared source notes',()=>{
  const other=instance({context:normalizeContext({harmony:{originTick:0,stepTicks:384,chords:[{root:'F',quality:'major'}]}})});
  assert.equal(chord(384),'Am');assert.equal(chord(384,{instance:other}),'F');
  assert.equal(chord(384,{instance:instance({context:normalizeContext()})}),null);
});
test('real transport pause, resume, BPM, seek and Return to Start use retained tick position',async()=>{
  const ctx={state:'running',currentTime:0},transport=createTickTransport({id:'test',getContext:()=>ctx,positionTick:384});
  const read=()=>chord(transport.currentTick,{playing:transport.state==='playing'});
  await transport.play();assert.equal(read(),'Am');transport.pause();assert.equal(read(),null);
  ctx.currentTime=10;transport.setBpm(180);await transport.play();assert.equal(read(),'Am');
  transport.seekTick(768);assert.equal(read(),'F');transport.returnToStart();assert.equal(read(),'C');transport.pause();
});
test('DOM badge updates only on chord changes, hides and reappears without changing name or geometry',()=>{
  const old=globalThis.document;let writes=0;
  const node=()=>({isConnected:true,hidden:false,_text:'',className:'',children:[],classList:{add(){},remove(){}},setAttribute(k,v){this[k]=v;},get textContent(){return this._text;},set textContent(v){writes++;this._text=v;},append(n){this.children.push(n);},get offsetWidth(){return 30;}});
  globalThis.document={createElement:node};
  const name={textContent:'Draw 2.1',closest:()=>null,before(n){this.anchor=n;}};
  const panel={querySelector:()=>name},update=createToyChordIndicator(),state={instance:instance(),currentTick:0,playing:true,role:'accompaniment'};
  try{
    update(panel,state);const badge=name.anchor.children[1];assert.equal(badge.textContent,'C');assert.equal(name.textContent,'Draw 2.1');
    update(panel,{...state,currentTick:100});assert.equal(writes,1);
    update(panel,{...state,currentTick:384});assert.equal(badge.textContent,'Am');assert.equal(badge['aria-label'],'Current chord: Am');
    update(panel,{...state,playing:false});assert.equal(badge.hidden,true);
    update(panel,{...state,currentTick:768});assert.equal(badge.hidden,false);assert.equal(badge.textContent,'F');assert.equal(name.anchor.children.length,2);
    update(panel,{...state,role:'percussion'});assert.equal(badge.hidden,true);
  }finally{globalThis.document=old;}
});
