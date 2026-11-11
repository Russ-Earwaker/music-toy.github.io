import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createBeatSwarmWeaponGateIntroRuntime } from '../src/beat-swarm/beat-swarm-weapon-gate-intro.js';
const source=readFileSync(new URL('../src/beat-swarm/beat-swarm-mode.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
const contract=JSON.parse(readFileSync(new URL('./fixtures/beat-swarm-control-baseline.json',import.meta.url),'utf8'));
for(const section of contract.sections)test('reverted baseline preserved: '+section.name,()=>{
 const content=section.file?readFileSync(new URL('../src/beat-swarm/'+section.file,import.meta.url),'utf8').replaceAll('\r\n','\n'):source;
 const start=content.indexOf(section.start),end=content.indexOf(section.end,start);assert.ok(start>=0&&end>start);
 assert.equal(createHash('sha256').update(content.slice(start,end)).digest('hex'),section.sha256);
});
test('stationary launch followed by forward-driven corridor and vertical steering',()=>{
 const oldDocument=globalThis.document,oldElement=globalThis.HTMLElement;
 class Element{innerHTML='';style={};dataset={};}
 globalThis.HTMLElement=Element;globalThis.document={getElementById:()=>new Element()};
 const make=()=>{let clock=10;const layer=new Element(),overlay=new Element();overlay.querySelector=()=>layer;
 const runtime=createBeatSwarmWeaponGateIntroRuntime({getOverlayEl:()=>overlay,getWeaponTransportTime:()=>clock,getWeaponTransportStep:()=>0,getWeaponStepSeconds:()=>.22,onSelection:()=>true});runtime.start({seed:'baseline'});return {runtime,tick(dt,x,y){clock+=dt;return runtime.update(dt,{x,y,mag:1},{sideDelta:y*300*dt});}};};
 try{const left=make(),right=make();left.tick(10,-1,0);right.tick(10,1,0);
 assert.equal(left.runtime.getState().phase,'prelaunch');assert.equal(left.runtime.getState().progress,-1120);
 assert.equal(left.runtime.launch({x:1,y:0}),true);assert.equal(right.runtime.launch({x:1,y:0}),true);
 const before=left.runtime.getState().progress;left.tick(.1,-1,-1);right.tick(.1,1,1);
 assert.ok(left.runtime.getState().progress>before);assert.equal(left.runtime.getState().progress,right.runtime.getState().progress);
 assert.ok(left.runtime.getState().y<right.runtime.getState().y);left.runtime.stop();right.runtime.stop();
 }finally{globalThis.document=oldDocument;globalThis.HTMLElement=oldElement;}
});

test('immediate restart restores corridor visibility and survives stale fade cleanup',async()=>{
 const oldDocument=globalThis.document,oldElement=globalThis.HTMLElement;
 class Element{innerHTML='';style={};dataset={};isConnected=true;}
 globalThis.HTMLElement=Element;globalThis.document={getElementById:()=>new Element()};
 const layer=new Element(),overlay=new Element();overlay.querySelector=()=>layer;
 const runtime=createBeatSwarmWeaponGateIntroRuntime({getOverlayEl:()=>overlay});
 try{runtime.start({seed:'reset'});runtime.stop();runtime.start({seed:'reset2'});
 assert.equal(layer.style.opacity,'');await new Promise(r=>setTimeout(r,500));
 assert.ok(layer.innerHTML.includes('beat-swarm-weapon-gate-gameplay'));assert.equal(runtime.getPhase(),'prelaunch');
 runtime.stop();layer.isConnected=false;
 }finally{globalThis.document=oldDocument;globalThis.HTMLElement=oldElement;}
});

for(const entry of contract.modules)test('original input module unchanged: '+entry.file,()=>{
 const content=readFileSync(new URL('../src/beat-swarm/'+entry.file,import.meta.url),'utf8').replaceAll('\r\n','\n');
 assert.equal(createHash('sha256').update(content).digest('hex'),entry.sha256);
});
