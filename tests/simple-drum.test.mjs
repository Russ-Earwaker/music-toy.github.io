import test from 'node:test';
import assert from 'node:assert/strict';
import {createDrumObjects} from '../src/simple-drum.js';
import {createBoardObject,resolveBoardInteraction,resolvePlayableActivation} from '../src/board-object.js';
import {createBoardPlayableController} from '../src/board-playable.js';
import {installTapOrDrag} from '../src/tap-or-drag.js';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Node,dom,event} from './graph-ui-dom.mjs';
import {createBoardObjectLayer} from '../src/board-object-layer.js';
import {createBoardPhysicalObjects} from '../src/board-physical-objects.js';
import {setToyVolume,getToyVolumeRaw,getToyGain,releaseToyAudioBus} from '../src/audio-core.js';

test('Drum registers as a playable receiver and loop source without becoming an emitter',()=>{
 const drums=createDrumObjects(),objects=createBoardPhysicalObjects(),layer=createBoardObjectLayer({objects,drums,containers:{get:()=>null,list:()=>[]}});
 const drum=layer.create('drum',{x:120,y:80});assert.equal(drum.kind,'drum');assert.deepEqual(Object.keys(drum.capabilities),['draggable','playable','instrumentSource','triggerReceiver','loopSource']);
 assert.equal(drum.capabilities.instrumentSource.instrumentId,'DRUM KICK');assert.equal(drum.capabilities.playable.midi,60);assert.deepEqual(drum.owns,[]);
 assert.equal(resolveBoardInteraction(drum,objects.addCube(0,0).boardObject,0),null);
 layer.move(drum.id,180,200);assert.equal(layer.get(drum.id).transform.x,180);layer.remove(drum.id);assert.equal(drums.get(drum.id),null);assert.equal(objects.list().length,1);
});

test('direct performance resolver accepts capabilities independently of kind and ignores decorative Art',()=>{
 const object=createBoardObject('decorative-art',{capabilities:{playable:{},instrumentSource:{instrumentId:'PIANO'}},authoredState:{volume:0.4}});
 assert.deepEqual(resolvePlayableActivation(object,1.2),{sourceId:object.id,instrument:'PIANO',sourceMidi:60,volume:0.4,muted:false,timeSeconds:1.2});
 assert.equal(resolvePlayableActivation(createBoardObject('decorative-art'),1),null);
 assert.equal(resolvePlayableActivation({capabilities:{playable:{}}},1),null);
 assert.equal(resolvePlayableActivation(object,NaN),null);
});

test('rapid activations work stopped and running without changing transport, settings affect subsequent events',()=>{
 const objects=createDrumObjects(),drum=objects.create(),performed=[],transport={state:'stopped',tick:42};let time=10;
 const controller=createBoardPlayableController({objects,getTime:()=>time,perform:e=>performed.push(e)});
 for(const state of ['stopped','playing']){transport.state=state;const before={...transport};for(let i=0;i<20;i++){time+=0.01;controller.activate(drum.id);}assert.deepEqual(transport,before);}
 assert.equal(performed.length,40);assert.equal(performed[0].timeSeconds,10.01);
 objects.update(drum.id,{instrument:'DRUM SNARE 1',volume:0.25});controller.activate(drum.id);assert.equal(performed.at(-1).instrument,'DRUM SNARE 1');assert.equal(performed.at(-1).volume,0.25);controller.destroy();
});

for(const pointerType of ['mouse','touch'])test(`${pointerType}: tap produces one event, duplicate click is ignored, drag moves without sound`,()=>{
 const objects=createDrumObjects(),drum=objects.create({x:30,y:40}),performed=[],panel=new Node('button'),drag=[];
 const controller=createBoardPlayableController({objects,getTime:()=>0,perform:e=>performed.push(e)});
 const off=installTapOrDrag(panel,{getPosition:()=>objects.get(drum.id).transform,screenToWorld:p=>({x:p.x/2,y:p.y/2}),move:(x,y)=>objects.update(drum.id,{x,y}),onTap:()=>controller.activate(drum.id),onDragStart:()=>drag.push('start'),onDragEnd:(e,cancelled)=>drag.push(cancelled?'cancel':'end')});
 const send=(type,x,y,extra={})=>panel.dispatchEvent(event(type,x,y,{pointerType,...extra}));
 for(let i=0;i<10;i++){send('pointerdown',100,100);send('pointerup',101,101);send('click',101,101,{detail:1});}
 assert.equal(performed.length,10);assert.equal(objects.get(drum.id).transform.x,30);
 send('pointerdown',100,100);send('pointermove',160,120);send('pointerup',180,140);send('click',180,140,{detail:1});
 assert.equal(performed.length,10);assert.deepEqual(objects.get(drum.id).transform,{x:70,y:60,rotation:0});assert.deepEqual(drag,['start','end']);
 send('pointerdown',100,100);send('pointercancel',100,100);assert.equal(performed.length,10);
 send('click',100,100,{detail:0,pointerType:''});assert.equal(performed.length,11);off();controller.destroy();
});

test('three independent Drums retain settings and deletion releases only the deleted sound',()=>{
 const objects=createDrumObjects(),a=objects.create(),b=objects.create({instrument:'DRUM SNARE 1',volume:0.5}),c=objects.create({instrument:'PIANO',volume:0.3}),performed=[],released=[];
 const controller=createBoardPlayableController({objects,getTime:()=>1,perform:e=>performed.push(e),release:id=>released.push(id)});
 for(const id of [a.id,b.id,c.id,a.id,b.id,c.id])controller.activate(id);assert.deepEqual(performed.map(e=>e.instrument),['DRUM KICK','DRUM SNARE 1','PIANO','DRUM KICK','DRUM SNARE 1','PIANO']);
 objects.update(a.id,{x:300});assert.equal(objects.get(b.id).transform.x,0);assert.equal(objects.get(c.id).transform.x,0);
 objects.remove(b.id);assert.deepEqual(released,[b.id]);assert.ok(objects.get(a.id));assert.ok(objects.get(c.id));assert.equal(controller.activate(b.id),null);controller.destroy();
});

test('authored Drum state reloads without hit/runtime data; old scenes may have no drums',()=>{
 const objects=createDrumObjects(),o=objects.create({x:25,y:75,instrument:'PIANO',volume:0.4});objects.update(o.id,{muted:true});
 const saved=JSON.parse(JSON.stringify(objects.snapshot()));saved[0].hitAnimation=123;saved[0].authoredState.hover=true;
 objects.restore(saved);const result=objects.get(o.id);assert.equal(result.id,o.id);assert.equal(result.authoredState.volume,0.4);assert.equal(result.authoredState.muted,true);assert.equal(result.hitAnimation,undefined);assert.equal(result.authoredState.hover,undefined);
 assert.equal(resolvePlayableActivation(result,0).instrument,'PIANO');assert.throws(()=>objects.restore([{...result,transform:{x:NaN,y:0}}]));assert.ok(objects.get(o.id));objects.restore();assert.equal(objects.list().length,0);
});

test('Drum creation works on LAN HTTP without randomUUID',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');try{Object.defineProperty(globalThis,'crypto',{configurable:true,value:{}});const objects=createDrumObjects();assert.notEqual(objects.create().id,objects.create().id);}finally{if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);else delete globalThis.crypto;}
});

test('placement arms without creating, persists for repeated empty-space taps, and excludes controls',()=>{
 const old={document:globalThis.document,window:globalThis.window},environment=dom();Object.assign(globalThis,environment);
 try{
  const viewport=new Node(),world=new Node();viewport.append(world);environment.document.body.append(viewport);const created=[];
  const objects={list:()=>[],get:()=>null,subscribe:()=>()=>{},create:p=>created.push(p)};
  const context={...environment,DRUM_SIZE:104};vm.createContext(context);
  const source=readFileSync(new URL('../src/simple-drum-board.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace('export function installSimpleDrumBoard','function installSimpleDrumBoard');
  const install=vm.runInContext(source+';installSimpleDrumBoard',context);
  const board=install({objects,controller:{activate:()=>{}},getWorld:()=>world,getViewport:()=>viewport,screenToWorld:p=>({x:p.x/2,y:p.y/2}),unlock:()=>{}});
  const send=(type,target,x,y)=>environment.window.dispatchEvent(event(type,x,y,{target,stopImmediatePropagation(){}}));
  board.arm();assert.equal(board.active,true);assert.equal(created.length,0);
  for(const [x,y]of [[100,200],[300,400],[500,600]]){send('pointerdown',world,x,y);send('pointerup',world,x,y);}
  assert.deepEqual(created,[{x:50,y:100},{x:150,y:200},{x:250,y:300}]);assert.equal(board.active,true);
  const button=new Node('button');viewport.append(button);send('pointerdown',button,100,100);send('pointerup',button,100,100);assert.equal(created.length,3);
  send('pointerdown',world,100,100);send('pointerup',world,180,100);assert.equal(created.length,3);
  board.cancel();send('pointerdown',world,100,100);send('pointerup',world,100,100);assert.equal(created.length,3);board.dispose();
 }finally{Object.assign(globalThis,old);}
});

test('shared audio-bus release drops only the deleted object gain/settings',()=>{
 const oldWindow=globalThis.window;
 class Context{constructor(){this.currentTime=0;this.destination={};}createGain(){return {gain:{value:1,setValueAtTime(v){this.value=v;},cancelScheduledValues(){}},connect(){},disconnect(){this.disconnected=true;}};}}
 globalThis.window={AudioContext:Context};
 try{setToyVolume('delete-drum',0.2);setToyVolume('keep-drum',0.8);const gain=getToyGain('delete-drum'),master=getToyGain('master');releaseToyAudioBus('delete-drum');assert.equal(gain.disconnected,true);assert.equal(getToyVolumeRaw('delete-drum'),1);assert.equal(getToyVolumeRaw('keep-drum'),0.8);releaseToyAudioBus('master');assert.equal(master.disconnected,undefined);releaseToyAudioBus('keep-drum');}finally{globalThis.window=oldWindow;}
});
