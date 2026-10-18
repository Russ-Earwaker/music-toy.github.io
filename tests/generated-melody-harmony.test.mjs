import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chooseGeneratedMelodyPitch,guideGeneratedDrawgridPhrase} from '../src/drawgrid/dg-melody-harmony.js';
import {prepareDrawgridPhrase,splitDrawgridPhrase} from '../src/drawgrid/dg-phrase-chunks.js';
import {DEFAULT_CHORDS} from '../src/chord-progression.js';
import {resolveMusicalPitch} from '../src/harmonic-adaptation.js';
import {generatedMelody,seededRandom} from './helpers/generated-melody.mjs';
const harmony={originTick:0,stepTicks:384,chords:DEFAULT_CHORDS};

test('strong/boundary notes favour chord tones more often than passing notes without forcing every strong note',()=>{
 const rates={};
 for(const [name,tick] of [['boundary',0],['strong',96],['weak',48]]){
  const random=seededRandom(1024);let chord=0;
  for(let i=0;i<5000;i++)chord+=chooseGeneratedMelodyPitch({candidate:50,tick,harmony,random}).chordTone;
  rates[name]=chord/5000;
 }
 assert.ok(rates.boundary>rates.strong);assert.ok(rates.strong>rates.weak+.3);
 assert.ok(rates.boundary<1);assert.ok(rates.weak<.6);
});

test('new chord boundaries and held notes crossing a change use the correct event-time harmony',()=>{
 const am=chooseGeneratedMelodyPitch({candidate:50,tick:384,harmony,random:()=>0});
 assert.equal(am.chord,'Am');assert.ok([0,4,9].includes(am.pitch%12));
 const crossing=chooseGeneratedMelodyPitch({candidate:52,tick:360,durationTicks:96,harmony,random:()=>0});
 assert.equal(crossing.importance,'long');assert.equal(crossing.crossesChordBoundary,true);
 assert.ok([0,4].includes(crossing.pitch%12));
});

test('production line generation stays in register/scale, retains rhythm/contour and is deterministic',()=>{
 for(let seed=1;seed<=60;seed++){
  const baseline=splitDrawgridPhrase(generatedMelody(seed)),before=structuredClone(baseline),diagnostics=[];
  const options={harmony,random:seededRandom(seed),diagnostics};
  const guided=guideGeneratedDrawgridPhrase(baseline,options);
  assert.deepEqual(guided,guideGeneratedDrawgridPhrase(baseline,{harmony,random:seededRandom(seed)}));
  assert.deepEqual(baseline,before);
  for(const d of diagnostics){assert.ok(d.pitch>=48&&d.pitch<=59);assert.ok([0,2,4,5,7,9,11].includes(d.pitch%12));assert.ok(Math.abs(d.pitch-d.candidate)<=3);}
  for(let bar=0;bar<4;bar++){
   assert.deepEqual(guided[bar].nodes.active,baseline[bar].nodes.active);
   assert.equal(guided[bar].instrument,baseline[bar].instrument);
   assert.equal(guided[bar].localTranspose,baseline[bar].localTranspose);
   assert.ok(guided[bar].strokes.length);assert.equal(guided[bar].meta.preserveNodesOverStrokes,true);
  }
  for(let i=1;i<diagnostics.length;i++){
   const a=diagnostics[i-1],b=diagnostics[i],original=b.candidate-a.candidate,final=b.pitch-a.pitch;
   assert.ok(Math.abs(final)<=Math.max(5,Math.abs(original)+1));
   if(Math.abs(original)>=2)assert.ok(original*final>=0);
  }
 }
});

test('Auto-Arrange guidance preserves authored chunks and touches only generated continuations',async()=>{
 const chunks=splitDrawgridPhrase(generatedMelody(11)),authored=chunks[0],before=structuredClone(authored),diagnostics=[];
 const generated=await prepareDrawgridPhrase(authored,()=>assert.fail(),{harmony,random:seededRandom(9),diagnostics});
 assert.deepEqual(authored,before);assert.deepEqual(generated[0],before);
 assert.ok(diagnostics.length);assert.ok(diagnostics.every(d=>d.bar>=1&&d.bar<=3));
 const full=generatedMelody(4),untouched=await prepareDrawgridPhrase(full,()=>assert.fail(),{harmony,random:seededRandom(4)});
 assert.deepEqual(untouched,splitDrawgridPhrase(full),'long authored material must not be regenerated');
 const empty=await prepareDrawgridPhrase(null,()=>generatedMelody(8),{harmony,random:seededRandom(8)});
 assert.equal(empty.length,4);assert.ok(empty.every(c=>c.nodes.list.some(rows=>rows.length)));
});

test('production wiring passes the A recipe to generation; A/B reuse and runtime role policies stay independent',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(main,/harmony:\{originTick:0,stepTicks:384,chords:ARRANGEMENT_RECIPE.find\(section=>section.name==='A'\)/);
 const source=52,context={harmony};
 assert.equal(resolveMusicalPitch({sourcePitch:source,eventTick:384,context,role:'melody'}).finalNote,source);
 assert.equal(resolveMusicalPitch({sourcePitch:48,eventTick:384,context,role:'accompaniment'}).finalNote,45);
 assert.equal(resolveMusicalPitch({sourcePitch:48,eventTick:384,context,role:'percussion'}).finalNote,48);
});

test('guidance preserves rests, disabled notes, voice count and source settings',()=>{
 const chunks=splitDrawgridPhrase(generatedMelody(42));
 chunks[1].nodes.list[0]=[3,5,7];chunks[1].nodes.disabled[0]=[5];
 chunks[1].nodes.groups[0]=[[3,'line-a'],[5,'line-b'],[7,'line-c']];
 chunks[1].manualOverrides[0]=[3,5,7];chunks[1].nodes.active[1]=false;
 const before=structuredClone(chunks),result=guideGeneratedDrawgridPhrase(chunks,{harmony,random:seededRandom(42),preserveChunks:1});
 assert.deepEqual(chunks,before);assert.equal(new Set(result[1].nodes.list[0]).size,3);
 assert.deepEqual(result[1].nodes.disabled[0],[5]);assert.ok(result[1].nodes.list[0].includes(5));
 assert.deepEqual(result[1].nodes.list[1],before[1].nodes.list[1]);
 assert.equal(result[1].nodes.groups[0].length,3);assert.equal(result[1].manualOverrides[0].length,3);
});
