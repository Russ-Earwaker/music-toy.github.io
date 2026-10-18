import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {auditArrangementInputs,selectInputPlan,arrangementMaterial} from '../src/auto-arrange-inputs.js';
import {runInputCase,INPUT_MATRIX} from './helpers/arrangement-matrix.mjs';
import {ensureGeneratedRhythmAudible} from '../src/auto-arrange-extra-rhythm.js';
import {createAutoArranger} from '../src/auto-arrange.js';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createStructureToyModel} from '../src/structure-toys.js';
const panel=(id,kind,role,instrument='PIANO')=>({id,dataset:{toy:kind,instrument,...(role?{musicalRole:role}:{})}});

test('explicit roles win; missing roles use deterministic toy/percussion/bass heuristics',()=>{
 const inputs=[panel('a','drawgrid','accompaniment'),panel('b','bouncer',null,'RETRO BASS'),panel('c','rippler',null,'HI-HAT CLOSED'),panel('d','bouncer')];
 const rows=auditArrangementInputs(inputs);assert.deepEqual(rows.map(e=>e.role),['accompaniment','accompaniment','rhythm','melody']);
 const plan=selectInputPlan(inputs);assert.equal(plan.sources.accompaniment.id,'a');assert.equal(plan.sources.melody.id,'d');assert.equal(plan.sources.rhythm.id,'c');
 assert.deepEqual(selectInputPlan([...inputs].reverse()).sources,plan.sources);
});
test('one shared definition is used once, including when only a Linked Copy remains',()=>{
 const a=panel('a','rippler'),b=panel('b','rippler');a.dataset.sharedDefinitionId=b.dataset.sharedDefinitionId='shared';
 b.dataset.masterToyId='deleted';b.dataset.linkedView='1';
 assert.equal(selectInputPlan([b]).sources.melody,b);assert.equal(selectInputPlan([b,a]).textures.length,0);
});
test('a generated all-off rhythm is repaired through its normal update event without touching a nonempty rhythm',()=>{
 const previous=globalThis.CustomEvent;globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
 try{
  const events=[],p={__gridState:{steps:Array(8).fill(false)},dispatchEvent:e=>events.push(e)};
  ensureGeneratedRhythmAudible(p);assert.equal(events.length,1);assert.ok(events[0].detail.steps.some(Boolean));
  p.__gridState.steps[3]=true;ensureGeneratedRhythmAudible(p);assert.equal(events.length,1);
 }finally{if(previous)globalThis.CustomEvent=previous;else delete globalThis.CustomEvent;}
});
test('empty toys remain unused; sparse notes and learned/placed physics patterns stay usable',()=>{
 const a=panel('a','drawgrid');a.__drawToy={getState:()=>({nodes:{active:[false],list:[[]]}})};
 assert.equal(arrangementMaterial(a),false);assert.equal(selectInputPlan([a]).sources.melody,null);
 a.__drawToy.getState=()=>({nodes:{active:[true],list:[[11]],disabled:[[]]}});assert.equal(arrangementMaterial(a),true);
 assert.equal(auditArrangementInputs([panel('wheel','chordwheel')])[0].usable,false);
});
test('an all-empty board produces a clear result without generating or rewriting anything',async()=>{
 const model=createConnectionModel(),structures=createStructureToyModel(model),p=panel('empty','drawgrid','melody');
 const state={nodes:{active:[false],list:[[]]}};p.__drawToy={getState:()=>state};
 model.registerObject('H',{ports:HEARTBEAT_PORTS});model.registerObject(p.id);model.connect('transport',{objectId:'H',portId:'output'},{objectId:p.id,portId:'input'});
 const before=JSON.stringify(model.list()),arranger=createAutoArranger({model,structures,getPanels:()=>[p],createSource:()=>assert.fail('must not fill an empty authored toy')});
 try{await assert.rejects(arranger.arrange(),/Empty toys/);assert.equal(JSON.stringify(model.list()),before);assert.equal(structures.list().length,0);assert.equal(arranger.getDebugReport().inputs[0].empty,true);}finally{structures.dispose();}
});
test('structure-owned physics toys without legacy neighbour IDs wait for their turn instead of learning silently during Intro',()=>{
 for(const file of ['bouncer-render.js','ripplesynth-core.js']){
  const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
  const declarations=[...source.matchAll(/const isChained = ([^;]+);/g)];assert.ok(declarations.length);
  for(const [,expression] of declarations){
   assert.equal(vm.runInNewContext(expression,{panel:{__sequenceDefinitionId:'root',dataset:{}}}),true);
   assert.equal(vm.runInNewContext(expression,{panel:{dataset:{}}}),false);
  }
 }
});
for(const [index,spec] of INPUT_MATRIX.entries())test('input matrix '+(index+1)+': '+spec.map(s=>typeof s==='string'?s:s.kind+(s.empty?' empty':s.role?' '+s.role:' sparse')).join(' + '),async()=>{
 const result=await runInputCase(spec);assert.equal(result.durationTicks,6144);
 assert.ok(result.eventCount>0);assert.equal(result.arrangeAgain,true);
 if(spec.length===1&&['bouncer','rippler'].includes(spec[0]))assert.equal(result.generated.includes('melody'),false);
 if(spec.filter(s=>['loopgrid','loopgrid-drum'].includes(typeof s==='string'?s:s.kind)).length>=2)assert.equal(result.generated.includes('extraRhythm'),false);
 // Additional percussion takes turns in one lane, never a simultaneous pile.
 const percussion=result.song.events.filter(e=>e.role==='percussion'&&e.tick>=3072&&e.tick<4608),at=new Map();
 for(const event of percussion){const ids=at.get(event.tick)||new Set();ids.add(event.sourceId);at.set(event.tick,ids);}
 assert.ok([...at.values()].every(ids=>ids.size<=2));
});
