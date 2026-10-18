import test from 'node:test';
import assert from 'node:assert/strict';
import {dom,event,walk} from './graph-ui-dom.mjs';
import {arrangementPresentation,createArrangementReveal} from '../src/arrangement-reveal.js';
import {relationshipTargets,createRelationshipReveal} from '../src/toy-relationship-reveal.js';
import {installAutoArrangeUI} from '../src/auto-arrange-ui.js';
import {createConnectionView} from '../src/connection-view.js';
import {createConnectionModel} from '../src/connections.js';
import {createStructureToyModel} from '../src/structure-toys.js';

const fixture=env=>{
 const panels=['a','b','fill','unrelated'].map(id=>{const p=env.document.createElement('div');p.id=id;p.dataset={sharedDefinitionId:id==='b'?'a':id,instrument:'PIANO'};env.document.body.append(p);return p;});
 return {panels,result:{created:['a','b','fill'],inputReport:{authoredSourceIds:['a'],generated:['rhythm']}}};
};
test('provenance highlights every visible use of an authored family, counting ideas once',()=>{
 const env=dom(),{panels,result}=fixture(env);
 assert.deepEqual(arrangementPresentation(result,panels),{authoredIds:['a','b'],usedCount:1,addedCount:1});
});
test('Arrange reveal distinguishes support, restarts, and Show my parts excludes support and unrelated toys',()=>{
 const env=dom(),old=globalThis.document;globalThis.document=env.document;let reveal;
 try{const {panels,result}=fixture(env);reveal=createArrangementReveal({getPanels:()=>panels});
  reveal.show(result);assert.equal(panels[0].classList.contains('arrange-authored'),true);assert.equal(panels[2].classList.contains('arrange-added'),true);assert.equal(panels[3].className,'');
  reveal.show(result,{onlyAuthored:true});assert.equal(panels[1].classList.contains('arrange-authored'),true);assert.equal(panels[2].className,'');
  reveal.clear();assert.ok(panels.every(p=>p.className===''));
 }finally{reveal?.clear();globalThis.document=old;}
});
test('equal-status inspection works when a former source was deleted; repeated taps restart and temporary tethers clear',()=>{
 const env=dom(),old=globalThis.document;globalThis.document=env.document;let reveal;
 try{const {panels}=fixture(env);panels[1].dataset.masterToyId='deleted';
  assert.deepEqual(relationshipTargets(panels[1],panels,()=>null),panels.slice(0,2));
  env.document.body.prepend=n=>{env.document.body.append(n);};
  reveal=createRelationshipReveal({getPanels:()=>panels,getMaster:()=>null,getHost:()=>env.document.body,getCentre:()=>({x:0,y:0})});
  panels[1].className='toy-panel';const header=env.document.createElement('div');header.className='toy-header';panels[1].append(header);
  env.document.dispatchEvent(event('click',10,10,{target:header,detail:0}));assert.ok(env.document.querySelector('.relationship-tethers'));reveal.clear();
  env.document.dispatchEvent(event('pointerdown',10,10,{target:header}));env.document.dispatchEvent(event('pointerup',10,10,{target:header}));
  const first=env.document.querySelector('.relationship-tethers');assert.ok(first);assert.equal(first.children.length,1);
  reveal.show(panels[1]);assert.notEqual(env.document.querySelector('.relationship-tethers'),first);
  reveal.clear();assert.equal(env.document.querySelector('.relationship-tethers'),null);
  env.document.dispatchEvent(event('pointerdown',10,10,{target:header}));env.document.dispatchEvent(event('pointerup',40,10,{target:header}));env.document.dispatchEvent(event('click',40,10,{target:header}));assert.equal(env.document.querySelector('.relationship-tethers'),null);
 }finally{reveal?.clear();globalThis.document=old;}
});
test('completion explains counts and offers a transient Show my parts action',async()=>{
 const env=dom(),old={document:globalThis.document,window:globalThis.window};Object.assign(globalThis,env);
 try{const {panels,result}=fixture(env),calls=[];const ui=installAutoArrangeUI({arrange:async()=>result,play:()=>{},edit:()=>{},describe:r=>arrangementPresentation(r,panels),reveal:(...args)=>calls.push(args)});
  await ui.run();const panel=env.document.querySelector('.arrangement-result');assert.match(panel.children[0].textContent,/Used 1 of your toys\nAdded 1 supporting part/);
  const button=walk(panel,n=>n.textContent==='Show my parts')[0];assert.equal(button.hidden,false);button.dispatchEvent(event('click'));assert.deepEqual(calls.at(-1),[result,{onlyAuthored:true}]);
 }finally{Object.assign(globalThis,old);}
});

test('linked structures carry header markers across restore; a remaining singleton is unmarked',()=>{
 const env=dom(),old=Object.fromEntries(['document','window','requestAnimationFrame','cancelAnimationFrame'].map(k=>[k,globalThis[k]]));Object.assign(globalThis,env,{requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
 let structures,view;
 try{const model=createConnectionModel();structures=createStructureToyModel(model);
  const a=structures.createStandalone('sequence',{name:'Phrase 1.1'}),b=structures.createStandalone('sequence',{name:'Phrase 1.2'});structures.createStandalone('repeat');
  structures.createStandalone('chord-progression',{name:'Intro',autoArrange:{owner:'arrange'}});
  for(const s of [a,b])structures.annotate(s.id,{sharedDefinitionId:'phrase'});
  view=createConnectionView({model,structureToys:structures,getPanels:()=>[],getContext:()=>({viewportEl:env.document.body,worldEl:env.document.body,transform:{scale:.1,tx:0,ty:0}}),getHeartbeatPoint:()=>({x:0,y:0})});view.render();
  assert.equal(walk(env.document,n=>n.textContent==='Intro')[0].getAttribute('font-size'),'120');
  const markers=()=>walk(env.document,n=>n.getAttribute('aria-label')==='Linked Copy');assert.equal(markers().length,2);assert.ok(markers().every(n=>n.textContent==='⧉'));
  const saved=JSON.parse(JSON.stringify(structures.list()));structures.restore(saved);view.render();assert.equal(markers().length,2);
  structures.remove(b.id);view.render();assert.equal(markers().length,0);
 }finally{view?.dispose();structures?.dispose();Object.assign(globalThis,old);}
});
