import test from 'node:test';
import assert from 'node:assert/strict';
import {createTickTransport} from '../src/tick-transport.js';
import {createUIMode} from '../src/ui-mode.js';
import {installSimplePlayback} from '../src/simple-playback.js';

function fixture({advanced=false,suspended=false}={}){
 const document=new EventTarget(),window=new class{handlers=new Map();addEventListener(t,fn){if(!this.handlers.has(t))this.handlers.set(t,new Set());this.handlers.get(t).add(fn);}removeEventListener(t,fn){this.handlers.get(t)?.delete(fn);}dispatchEvent(e){for(const fn of this.handlers.get(e.type)||[])fn(e);}}(),ctx={currentTime:0,state:suspended?'suspended':'running',resumes:0,resume(){this.resumes++;this.state='running';return Promise.resolve();}};
 const uiMode=createUIMode({storage:{getItem:()=>advanced?'advanced':'simple'}}),events=[],listeners=new Set(),records=[];
 const emit=detail=>{events.push(detail);const event=new Event('transport:change');event.detail=detail;document.dispatchEvent(event);};
 const create=id=>{const transport=createTickTransport({id,getContext:()=>ctx,emit});records.push({id,transport});for(const fn of listeners)fn();return transport;};
 const transport=create('main'),registry={list:()=>records,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
 const policy=installSimplePlayback({uiMode,registry,document,window,unlock:()=>ctx.resume()});
 return {uiMode,transport,ctx,events,create,document,window,policy,flush:()=>new Promise(r=>queueMicrotask(r))};
}

test('Simple starts logically before browser unlock, and first real input unlocks the same clock',async()=>{
 const f=fixture({suspended:true});try{
  assert.equal(f.transport.state,'playing');assert.equal(f.ctx.state,'suspended');assert.equal(f.ctx.resumes,0);
  f.window.dispatchEvent({type:'pointerdown',isTrusted:false,button:0});assert.equal(f.ctx.resumes,0);
  f.window.dispatchEvent({type:'pointerdown',isTrusted:true,button:0});assert.equal(f.ctx.state,'running');assert.equal(f.ctx.resumes,1);f.ctx.currentTime=1;assert.equal(f.transport.currentTick,192);
  assert.equal(f.events.filter(e=>e.type==='play').length,1);
 }finally{f.policy.dispose();}
});
test('Advanced stopped to Simple starts at retained position; a playing mode switch preserves origin',async()=>{
 const f=fixture({advanced:true});try{
  f.transport.seekTick(217);assert.equal(f.transport.state,'stopped');f.uiMode.set('simple');assert.equal(f.transport.state,'playing');assert.equal(f.transport.currentTick,217);
  f.ctx.currentTime=1;const tick=f.transport.currentTick,origin=f.transport.originAudioTime;
  f.uiMode.set('advanced');assert.equal(f.transport.state,'playing');f.uiMode.set('simple');assert.equal(f.transport.currentTick,tick);assert.equal(f.transport.originAudioTime,origin);
  assert.equal(f.events.filter(e=>e.type==='play').length,1);
  f.uiMode.set('advanced');f.transport.pause();await f.flush();assert.equal(f.transport.state,'paused');f.uiMode.set('simple');assert.equal(f.transport.state,'playing');assert.equal(f.transport.currentTick,tick);
 }finally{f.policy.dispose();}
});
test('Simple reconciles pauses and new Heartbeats, while Return to Start keeps playing',async()=>{
 const f=fixture();try{
  f.ctx.currentTime=2;f.transport.pause();const tick=f.transport.currentTick;await f.flush();assert.equal(f.transport.state,'playing');assert.equal(f.transport.currentTick,tick);
  const second=f.create('secondary');await f.flush();assert.equal(second.state,'playing');
  f.transport.returnToStart();assert.equal(f.transport.currentTick,0);assert.equal(f.transport.state,'playing');
  f.uiMode.set('advanced');second.pause();await f.flush();assert.equal(second.state,'paused');assert.equal(f.transport.state,'playing');
 }finally{f.policy.dispose();}
});
test('default Advanced play still waits for audio resume; Simple logical play can supersede it safely',async()=>{
 let resolve;const ctx={state:'suspended',currentTime:0,resume:()=>new Promise(r=>resolve=r)},events=[];
 const t=createTickTransport({id:'test',getContext:()=>ctx,positionTick:123,emit:e=>events.push(e)});
 const pending=t.play();assert.equal(t.state,'stopped');await t.play({resumeAudio:false});assert.equal(t.state,'playing');assert.equal(t.currentTick,123);
 resolve();await pending;assert.equal(t.currentTick,123);assert.equal(events.filter(e=>e.type==='play').length,1);
});
