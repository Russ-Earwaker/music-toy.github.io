import test from 'node:test';
import assert from 'node:assert/strict';
import {createGraphLayoutAnimation, GRAPH_REPAIR_DURATION_MS} from '../src/graph-layout-animation.js';
const setup=()=>{let time=0,reduced=false;const frames=new Map();const a=createGraphLayoutAnimation({now:()=>time,reducedMotion:()=>reduced,render:(id,p,target)=>frames.set(id,{p,target})});return {a,frames,setTime:t=>time=t,reduce:()=>reduced=true};};
test('interpolates moved branch coherently, leaves unaffected nodes alone, finishes exactly',()=>{
 const {a,frames,setTime}=setup();a.move('a',{x:0,y:0},{x:100,y:50});a.move('b',{x:20,y:30},{x:120,y:80});
 a.move('still',{x:2,y:3},{x:2.1,y:3});assert.equal(a.has('still'),false);
 setTime(100);a.tick();assert.deepEqual(frames.get('a').p,{x:87.5,y:43.75});assert.equal(frames.get('b').p.x-frames.get('a').p.x,20);
 setTime(GRAPH_REPAIR_DURATION_MS);a.tick();assert.deepEqual(frames.get('a').p,{x:100,y:50});assert.equal(a.has('a'),false);
});
test('retarget starts at current display, never old origin',()=>{
 const {a,setTime,frames}=setup();a.move('a',{x:100,y:0},{x:300,y:0});setTime(100);a.tick();a.move('a',{x:300,y:0},{x:420,y:0});assert.equal(frames.get('a').p.x,275);setTime(300);a.tick();assert.equal(frames.get('a').p.x,420);
});
test('drag cancellation returns current position and releases presentation',()=>{
 const {a,setTime,frames}=setup();a.move('a',{x:0,y:0},{x:100,y:0});setTime(100);a.tick();assert.equal(a.cancel('a').x,87.5);assert.equal(a.has('a'),false);assert.equal(frames.get('a').p.x,100);
});
test('logical target is unchanged and available for persistence during interpolation',()=>{
 const {a,setTime}=setup(),target={x:100,y:200,startTick:960};a.move('a',{x:0,y:0},target);setTime(50);a.tick();assert.notEqual(a.position('a',target).x,target.x);assert.deepEqual(target,{x:100,y:200,startTick:960});
});
test('reduced motion snaps both new and running movements',()=>{
 const {a,reduce,frames}=setup();a.move('a',{x:0,y:0},{x:100,y:0});reduce();a.tick();assert.equal(a.has('a'),false);assert.equal(frames.get('a').p.x,100);a.move('b',{x:0,y:0},{x:200,y:0});assert.equal(a.has('b'),false);assert.equal(frames.get('b').p.x,200);
});
test('creation reset clears every transient offset',()=>{const {a,frames}=setup();a.move('a',{x:0,y:0},{x:100,y:0});a.clear();assert.equal(a.has('a'),false);assert.deepEqual(frames.get('a').p,{x:100,y:0});});

test('one layout batch gives every descendant the same animation start time',()=>{
 let time=0;const a=createGraphLayoutAnimation({now:()=>time++});a.batch(()=>{a.move('a',{x:0,y:0},{x:100,y:0});a.move('b',{x:20,y:0},{x:120,y:0});});a.tick(100);assert.equal(a.position('b',{}).x-a.position('a',{}).x,20);
});

test('interpolated coordinates cannot carry stale Structure presentation or definition fields',()=>{
 const {a}=setup();a.move('S',{x:0,y:0,collapsed:false,type:'timeline',count:2},{x:100,y:50});assert.deepEqual(a.position('S',{}),{x:0,y:0});
});
