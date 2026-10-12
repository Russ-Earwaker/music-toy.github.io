import test from 'node:test';
import assert from 'node:assert/strict';
import {applySourcePhase} from '../src/source-phase.js';
import {relationshipTargets,createRelationshipReveal} from '../src/toy-relationship-reveal.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {ensurePlaybackInstance,clearPlaybackInstancesForTests,rebasePlaybackTransport,activatePlaybackInstance,getPlaybackColumn,createPlaybackInstanceForStructureTurn} from '../src/playback-instances.js';
import {createStructureRuntime} from '../src/structure-runtime.js';
import {bouncerEventsInWindow} from '../src/bouncer-transport.js';
import {ripplerEventsInWindow} from '../src/ripplesynth-transport.js';
import {createTickTransport} from '../src/tick-transport.js';
const make=()=>{
 clearPlaybackInstancesForTests();const calls=[];
 const master={id:'m',dataset:{toy:'drawgrid',steps:'4',instanceSerial:'2'},__seqRev:1,__sequencerSchedule:(step,time,meta)=>calls.push({step,time,...meta})};
 const panels=[master,...['a','b'].map(id=>({id,dataset:{toy:'drawgrid',steps:'4',masterToyId:'m'},__seqRev:1,__sequencerSchedule:master.__sequencerSchedule}))];
 const getToy=id=>panels.find(p=>p.id===id);
 panels.forEach((p,i)=>ensurePlaybackInstance(p.id,{startTick:i*96,transportId:'h'}));
 const scheduler=createSequencerScheduler();
 const schedule=(from,to,timing=t=>t/192)=>scheduler.tick({transportId:'h',activeToyIds:new Set(panels.map(p=>p.id)),getToy,currentTick:from,lookaheadEndTick:to,tickToAudioTime:timing});
 return {panels,getToy,calls,scheduler,schedule};
};
test('staggered activation shares source steps and never schedules before its gate',()=>{
 const f=make();f.schedule(0,768);
 for(const id of ['m','a','b'])assert.ok(f.calls.filter(c=>c.toyId===id).every(c=>c.step===(c.eventTick/96)%4));
 assert.equal(f.calls.filter(c=>c.toyId==='b')[0].eventTick,192);f.scheduler.dispose();
});
test('reconnect, pause/resume, BPM conversion and source edit preserve tick phase',()=>{
 const f=make();f.schedule(0,384);activatePlaybackInstance('a',407,{retrigger:true});rebasePlaybackTransport('a','h',480);
 f.panels[0].__seqRev++;f.schedule(480,768,t=>t/96); // no calls during paused interval; BPM only changes conversion
 for(const c of f.calls.filter(c=>c.eventTick>=480))assert.equal(c.step,(c.eventTick/96)%4);
 assert.ok(f.calls.some(c=>c.toyId==='a'&&c.eventTick===480&&c.step===1));f.scheduler.dispose();
});
test('loop-length changes remap from transport zero and reconstructed save state needs no runtime anchor',()=>{
 const f=make();f.schedule(0,384);for(const p of f.panels)ensurePlaybackInstance(p.id,{loopLengthTicks:768});f.schedule(480,768);
 const future=f.calls.filter(c=>c.eventTick>=480);assert.ok(future.length);assert.ok(future.every(c=>c.eventTick===576&&c.step===3));
 const restored={active:true,startTick:500,loopLengthTicks:768,transportId:'h'};applySourcePhase(restored,f.panels[1],f.getToy);assert.equal(getPlaybackColumn(restored,576,4),3);f.scheduler.dispose();
});
test('nested explicit Timeline offsets survive while occurrence activation does not become phase',()=>{
 const f=make(),r=createStructureRuntime();r.defineStructure('T','timeline',[{toyId:'a',offsetTick:0,durationTicks:384},{toyId:'b',offsetTick:192,durationTicks:384}]);r.defineStructure('S','sequence',[{structureId:'T'}]);r.startSequence('S',96,{quantize:false});
 const turns=r.turnsInWindow('S',300,301);assert.equal(turns.length,2);
 const positions=turns.map(t=>{const i=createPlaybackInstanceForStructureTurn(t);applySourcePhase(i,f.getToy(t.toyId),f.getToy);return getPlaybackColumn(i,384,4);});assert.deepEqual(positions,[0,2]);f.scheduler.dispose();
});
test('different transport domains use their own tick clocks, without cross-domain rebase',()=>{
 const f=make(),a=ensurePlaybackInstance('a'),b=rebasePlaybackTransport('b','other',96);applySourcePhase(a,f.panels[1],f.getToy);applySourcePhase(b,f.panels[2],f.getToy);
 assert.equal(getPlaybackColumn(a,384,4),0);assert.equal(getPlaybackColumn(b,192,4),2);assert.equal(b.transportId,'other');f.scheduler.dispose();
});
test('Sequence controls activation without introducing a pattern phase offset',()=>{
 const f=make(),r=createStructureRuntime();r.defineStructure('S','sequence',[{toyId:'m',durationTicks:192},{toyId:'a',durationTicks:384}]);r.startSequence('S',96,{quantize:false});
 const turn=r.turnsInWindow('S',384,385)[0],i=createPlaybackInstanceForStructureTurn(turn);applySourcePhase(i,f.getToy('a'),f.getToy);assert.equal(getPlaybackColumn(i,384,4),0);
 r.defineStructure('S','sequence',[{toyId:'m',durationTicks:384},{toyId:'a',durationTicks:384}]);r.startSequence('S',96,{quantize:false});const aligned=createPlaybackInstanceForStructureTurn(r.turnsInWindow('S',576,577)[0]);applySourcePhase(aligned,f.getToy('a'),f.getToy);assert.equal(getPlaybackColumn(aligned,576,4),2);f.scheduler.dispose();
});
test('irregular Bouncer and Rippler providers honor shared phase and activation gate',()=>{
 const instance={active:true,startTick:192,sourcePhaseOriginTick:0,loopLengthTicks:384};
 assert.deepEqual(bouncerEventsInWindow({instance,pattern:[{note:'C3',offsetTick:0}],fromTick:0,toTick:768}).map(e=>e.eventTick),[384]);
 assert.deepEqual(ripplerEventsInWindow({instance,pattern:[[0]],blocks:[{active:true}],fromTick:0,toTick:768}).map(e=>e.eventTick),[384]);
});
test('relationship inspection targets one pair or the Master family, independently of graph topology',()=>{
 const f=make();assert.deepEqual(relationshipTargets(f.panels[1],f.panels,f.getToy).map(p=>p.id),['m','a']);assert.deepEqual(relationshipTargets(f.panels[0],f.panels,f.getToy).map(p=>p.id),['m','a','b']);f.scheduler.dispose();
});
test('real transport pause, tempo rebase and saved tick restore preserve the source clock',async()=>{
 const f=make(),ctx={state:'running',currentTime:0},transport=createTickTransport({id:'h',getContext:()=>ctx,positionTick:960});
 const instance=ensurePlaybackInstance('a');applySourcePhase(instance,f.panels[1],f.getToy);await transport.play();ctx.currentTime=1;
 assert.equal(transport.currentTick,1152);assert.equal(getPlaybackColumn(instance,transport.currentTick,4),0);transport.pause();ctx.currentTime=20;transport.setBpm(180);assert.equal(transport.currentTick,1152);
 await transport.play();ctx.currentTime=21;assert.equal(transport.currentTick,1440);assert.equal(getPlaybackColumn(instance,transport.currentTick,4),3);
 const saved=transport.getState(),restored=createTickTransport({id:'h',getContext:()=>ctx,bpm:saved.bpm,positionTick:saved.positionTick});assert.equal(getPlaybackColumn(instance,restored.currentTick,4),3);f.scheduler.dispose();
});
test('header taps and shared reveal flash the family with capped, inert background tethers; drags do not',()=>{
 const saved={document:globalThis.document,innerWidth:globalThis.innerWidth,innerHeight:globalThis.innerHeight};
 const node=()=>({children:[],style:{values:{},setProperty(k,v){this.values[k]=v;}},classList:{values:new Set(),add(k){this.values.add(k);},remove(k){this.values.delete(k);}},listeners:{},addEventListener(k,fn){this.listeners[k]=fn;},setAttribute(k,v){this[k]=v;},append(n){this.children.push(n);},remove(){this.removed=true;}});
 const doc=node();doc.createElementNS=()=>node();globalThis.document=doc;globalThis.innerWidth=1000;globalThis.innerHeight=1000;
 const host={prepend(n){this.layer=n;}},panels=Array.from({length:15},(_,n)=>Object.assign(node(),{id:n?'i'+n:'m',dataset:n?{masterToyId:'m'}:{instrument:'PIANO'},header:node(),parentElement:host,offsetLeft:n*20,offsetTop:100,offsetWidth:100,offsetHeight:100,getBoundingClientRect:()=>({width:100,height:100,left:1,top:1,right:101,bottom:101}),querySelector(){return this.header;}}));
 const getMaster=id=>panels.find(p=>p.id===id),reveal=createRelationshipReveal({getPanels:()=>panels,getMaster});
 try{
  reveal.prepare();const target={closest:()=>null};panels[1].header.listeners.pointerdown({target,pointerId:1,clientX:50,clientY:50});doc.listeners.pointerup({pointerId:1,clientX:50,clientY:50});
  assert.ok(panels[0].classList.values.has('relationship-flash'));assert.ok(panels[1].classList.values.has('relationship-flash'));assert.ok(!panels[2].classList.values.has('relationship-flash'));assert.equal(host.layer.children.length,1);assert.equal(host.layer['aria-hidden'],'true');assert.equal(host.layer.style.values['--relationship-colour'],panels[0].style.values['--relationship-colour']);assert.equal(host.layer.children[0].children.length,0);
  const firstLayer=host.layer;let animationRestarts=0;
  Object.defineProperty(panels[1],'offsetWidth',{configurable:true,get(){if(!panels[1].classList.values.has('relationship-flash'))animationRestarts++;return 100;}});
  for(let tap=0;tap<3;tap++){
   const previousLayer=host.layer;
   panels[1].header.listeners.pointerdown({target,pointerId:1,clientX:50,clientY:50});doc.listeners.pointerup({pointerId:1,clientX:50,clientY:50});
   assert.ok(previousLayer.removed);assert.notEqual(host.layer,previousLayer);assert.equal(host.layer.children.length,1);assert.ok(panels[1].classList.values.has('relationship-flash'));
  }
  assert.ok(firstLayer.removed);assert.equal(animationRestarts,3);
  Object.defineProperty(panels[1],'offsetWidth',{value:100});
  reveal.show(panels[0]);assert.equal(host.layer.children.length,12);assert.ok(panels.every(p=>p.classList.values.has('relationship-flash')));
  reveal.clear();panels[1].header.listeners.pointerdown({target,pointerId:2,clientX:50,clientY:50});doc.listeners.pointerup({pointerId:2,clientX:75,clientY:50});assert.ok(!panels[1].classList.values.has('relationship-flash'));
 }finally{reveal.clear();Object.assign(globalThis,saved);}
});
