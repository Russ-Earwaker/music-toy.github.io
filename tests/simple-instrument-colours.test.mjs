import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {instrumentColour,applyInstrumentColour,setInstrumentColour} from '../src/instrument-colours.js';
import {createDrumObjects} from '../src/simple-drum.js';
import {createDrumSet} from '../src/simple-drum-set.js';
import {createRippleObjects} from '../src/simple-ripple.js';
import {createStringSurfaces} from '../src/string-surface.js';

const element=()=>({dataset:{},style:{setProperty(k,v){this[k]=v;}}});
test('all presentation owners share canonical palette identity and live updates',()=>{
 const old=globalThis.document;
 const owners=['Paint','Cannon','Ball','Gravity Ball','Ripple','Drum','String','Strum'].map(()=>element());
 const other=element();applyInstrumentColour(other,'KALIMBA');
 owners.forEach(e=>applyInstrumentColour(e,' PIANO '));
 globalThis.document={querySelectorAll:()=>[...owners,other]};
 try{
  const before=other.dataset.instrumentColour;
  assert.ok(setInstrumentColour('piano','#8040cc'));
  for(const owner of owners)assert.equal(owner.style['--instrument-colour'],'#8040cc');
  assert.equal(other.dataset.instrumentColour,before);
  assert.equal(instrumentColour('HI_HAT-CLOSED'),instrumentColour('hi hat closed'));
 }finally{globalThis.document=old;}
});

test('restored owners resolve current shared override without duplicated colour state; kit members stay independent',()=>{
 const drums=createDrumObjects(),ripples=createRippleObjects(),strings=createStringSurfaces();
 drums.create({instrument:'PIANO'});ripples.create({instrument:'PIANO'});
 for(const kind of ['string','strum'])strings.create({kind,start:{x:0,y:0},end:{x:200,y:0},instrument:'PIANO'});
 for(const store of [drums,ripples,strings]){
  const saved=JSON.stringify(store.snapshot());assert.doesNotMatch(saved,/colou?r/i);
  store.restore(JSON.parse(saved));setInstrumentColour('PIANO','#3278ab');
  for(const o of store.list()){const node=element();applyInstrumentColour(node,o.authoredState.instrument);assert.equal(node.dataset.instrumentColour,'#3278ab');}
 }
 const kit=createDrumSet(createDrumObjects(),{x:500,y:500});
 assert.ok(new Set(kit.map(o=>instrumentColour(o.authoredState.instrument))).size>1);
});

test('renderers resolve their own instrument and leave Cube feedback independent',()=>{
 for(const file of ['simple-drum-board','string-surface-board','simple-ripple-board']){
  const source=readFileSync(new URL('../src/'+file+'.js',import.meta.url),'utf8');
  assert.match(source,/applyInstrumentColour\(card,o.authoredState.instrument\)/);
 }
 const paint=readFileSync(new URL('../src/simple-draw-surface.js',import.meta.url),'utf8');
 assert.match(paint,/color:applyInstrumentColour\(/);assert.match(paint,/instrumentTint:true/);
 const ball=readFileSync(new URL('../src/board-bouncer.js',import.meta.url),'utf8');
 assert.match(ball,/applyInstrumentColour\(node,instrument\)/);
 assert.match(ball,/response.pending\?BOUNCER_IMPACT_ORANGE:BOUNCER_BASE_ORANGE/);
 const css=readFileSync(new URL('../string-surface.css',import.meta.url),'utf8');
 assert.match(css,/\.surface-cell.is-sounding\{fill:var\(--instrument-colour\)\}/);
});
