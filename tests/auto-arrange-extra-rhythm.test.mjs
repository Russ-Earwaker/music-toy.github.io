import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeExtraRhythm} from '../src/auto-arrange-extra-rhythm.js';

test('extra fill is repeatable, audible and distinct for every eight-step main pattern, without editing it',()=>{
 const saved=globalThis.CustomEvent;globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
 try{
  const create=()=>({__gridState:{steps:Array(8).fill(false)},dispatchEvent(e){
   if(e.type==='toy-random')this.__gridState.steps=this.__gridState.steps.map(()=>e.detail.random()<.5);
   if(e.type==='loopgrid:update')this.__gridState.steps=e.detail.steps;
  }});
  for(let mask=0;mask<256;mask++){
   const main={__gridState:{steps:Array.from({length:8},(_,i)=>!!(mask&(1<<i)))}},before=structuredClone(main),a=create(),b=create();
   const pattern=initializeExtraRhythm(a,main);assert.notDeepEqual(pattern,main.__gridState.steps);assert.ok(pattern.some(Boolean));
   assert.deepEqual(initializeExtraRhythm(b,main),pattern);assert.deepEqual(main,before);
  }
 }finally{globalThis.CustomEvent=saved;}
});
