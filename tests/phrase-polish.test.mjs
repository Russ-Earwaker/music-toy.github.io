import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {phraseChunkWithSeedSettings,splitDrawgridPhrase} from '../src/drawgrid/dg-phrase-chunks.js';
import {composeEffectiveBoardScale,worldToScreenPoint,screenToWorldPoint,screenDeltaToWorldDelta} from '../src/board-responsive-scale.js';

test('continuations keep generated notes but inherit seed instrument and ordinary settings without mutating seed',()=>{
 const seed={steps:8,instrument:'RETRO TRIANGLE',autotune:false,musicalRole:'melody',localTranspose:7,instrumentOctave:'5',instrumentPitchShift:'1',nodes:{list:[[9]]},strokes:[],manualOverrides:[[9]]};
 const before=structuredClone(seed),generated={steps:32,instrument:'PIANO',autotune:true,nodes:{list:Array.from({length:32},(_,i)=>[i])},strokes:[],manualOverrides:Array.from({length:32},(_,i)=>[i])};
 const chunks=splitDrawgridPhrase(generated).map(c=>phraseChunkWithSeedSettings(c,seed));
 for(const [i,c] of chunks.entries()){
  for(const key of ['instrument','autotune','musicalRole','localTranspose','instrumentOctave','instrumentPitchShift'])assert.equal(c[key],seed[key]);
  assert.equal(c.steps,8);assert.deepEqual(c.nodes.list,generated.nodes.list.slice(i*8,i*8+8));
 }
 chunks[2].instrument='PIANO';assert.equal(chunks[0].instrument,seed.instrument);assert.deepEqual(seed,before);
});

test('viewport doubles overview range, clamps both ends and preserves effective-scale coordinate inversion',()=>{
 const source=readFileSync(new URL('../src/board-viewport.js',import.meta.url),'utf8');
 const min=Number(source.match(/const SCALE_MIN = ([\d.]+)/)[1]),max=Number(source.match(/const SCALE_MAX = ([\d.]+)/)[1]);
 assert.equal(min,.15);assert.equal(max,1);
 const body=source.match(/function clampScale\(v\) \{([\s\S]*?)\n  \}/)[1];
 const clamp=vm.runInNewContext(`(v)=>{${body}}`,{SCALE_MIN:min,SCALE_MAX:max});
 assert.equal(clamp(.01),min);assert.equal(clamp(2),max);assert.equal(clamp(.2),.2);
 for(const base of [.5,.8,1]){
  const scale=composeEffectiveBoardScale(min,base),t={effectiveBoardScale:scale,x:131,y:-54},p={x:3520,y:480};
  const back=screenToWorldPoint(worldToScreenPoint(p,t),t);
  assert.ok(Math.abs(back.x-p.x)<1e-8);assert.ok(Math.abs(back.y-p.y)<1e-8);
  assert.deepEqual(screenDeltaToWorldDelta({x:scale*100,y:scale*40},scale),{x:100,y:40});
 }
});
