import test from 'node:test';
import assert from 'node:assert/strict';
import {dom,walk,event} from './graph-ui-dom.mjs';
import {installAutoArrangeUI} from '../src/auto-arrange-ui.js';

test('Arrange completion offers normal Play/Edit, gates duplicate requests, and clears stale results on scene load',async()=>{
 const env=dom(),old={document:globalThis.document,window:globalThis.window};Object.assign(globalThis,env);
 try{
  let finish,calls=0,played=null,edited=null;
  const entry=env.document.createElement('button');entry.className='toy-spawner-arrange';env.document.body.append(entry);
  const ui=installAutoArrangeUI({arrange:()=>{calls++;return new Promise(resolve=>finish=resolve);},play:r=>played=r,edit:r=>edited=r});
  const pending=ui.run();await ui.run();assert.equal(calls,1);assert.equal(entry.disabled,true);
  const panel=env.document.querySelector('.arrangement-result'),button=name=>walk(panel,n=>n.tagName==='button'&&n.textContent===name)[0];
  assert.equal(button('Play').disabled,true);const result={rootId:'arrangement'};finish(result);await pending;
  assert.equal(panel.hidden,false);assert.equal(entry.disabled,false);button('Play').dispatchEvent(event('click'));button('Edit Arrangement').dispatchEvent(event('click'));
  assert.equal(played,result);assert.equal(edited,result);button('Close').dispatchEvent(event('click'));assert.equal(panel.hidden,true);
  env.window.dispatchEvent(event('scene:load'));assert.equal(panel.hidden,true);
 }finally{Object.assign(globalThis,old);}
});

test('zero-source failure displays the actionable message without exposing stale playback actions',async()=>{
 const env=dom(),old={document:globalThis.document,window:globalThis.window};Object.assign(globalThis,env);
 try{
  const ui=installAutoArrangeUI({arrange:async()=>{throw new Error('Make a musical idea first, then press Arrange.');},play:()=>assert.fail(),edit:()=>assert.fail()});
  await ui.run();const panel=env.document.querySelector('.arrangement-result');
  assert.equal(panel.children[0].textContent,'Make a musical idea first, then press Arrange.');
  assert.ok(walk(panel,n=>['Play','Edit Arrangement'].includes(n.textContent)).every(b=>b.disabled));
 }finally{Object.assign(globalThis,old);}
});
