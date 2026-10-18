import test from 'node:test';
import assert from 'node:assert/strict';
import {developDrawgridMotif,prepareDrawgridPhrase,splitDrawgridPhrase,singleGeneratedDrawgridLine} from '../src/drawgrid/dg-phrase-chunks.js';
import {DEFAULT_CHORDS} from '../src/chord-progression.js';
import {generatedMelody,seededRandom} from './helpers/generated-melody.mjs';
const harmony={originTick:0,stepTicks:384,chords:DEFAULT_CHORDS};

test('statement, close variation, development and return derive from one motif without mutating it',()=>{
 const statement=splitDrawgridPhrase(generatedMelody(42))[0],before=structuredClone(statement);
 const bars=developDrawgridMotif(statement,{random:seededRandom(42)});
 assert.deepEqual(statement,before);assert.deepEqual(bars[0],before);
 assert.deepEqual(bars[1].nodes.active,statement.nodes.active);
 assert.ok(bars[1].nodes.list.filter((rows,i)=>JSON.stringify(rows)!==JSON.stringify(statement.nodes.list[i])).length<=1);
 assert.deepEqual(bars[2].nodes.list.slice(0,4),statement.nodes.list.slice(4));
 assert.deepEqual(bars[2].nodes.active,[...statement.nodes.active.slice(4),...statement.nodes.active.slice(0,4)]);
 assert.deepEqual(bars[3].nodes.list.slice(0,7),statement.nodes.list.slice(0,7));
 for(const bar of bars){assert.equal(bar.instrument,statement.instrument);assert.equal(bar.steps,8);assert.equal(bar.strokes.length,1);}
 bars[2].nodes.list[0][0]=0;assert.deepEqual(statement,before);
});

test('same-seed generated statements are unchanged while later bars develop that statement with chord guidance',async()=>{
 let differences=0;
 for(let seed=1;seed<=30;seed++){
  const source=generatedMelody(seed),before=structuredClone(source);
  const old=await prepareDrawgridPhrase(null,()=>source,{harmony,random:seededRandom(seed),development:false});
  const diagnostics=[],next=await prepareDrawgridPhrase(null,()=>source,{harmony,random:seededRandom(seed),diagnostics});
  assert.deepEqual(next[0],old[0]);assert.deepEqual(source,before);
  assert.deepEqual(next,await prepareDrawgridPhrase(null,()=>source,{harmony,random:seededRandom(seed)}));
  assert.equal(next.length,4);assert.equal(diagnostics.length,32);
  assert.ok(next.every(bar=>bar.strokes.length===1),'every generated chunk has one continuous path');
  assert.ok(diagnostics.filter(d=>d.bar>0).every(d=>d.chord&&d.pitch>=48&&d.pitch<=59));
  assert.deepEqual(next[1].nodes.active,next[0].nodes.active);
  assert.deepEqual(next[3].nodes.active,next[0].nodes.active);
  differences+=JSON.stringify(next.slice(1).map(c=>c.nodes.list))!==JSON.stringify(old.slice(1).map(c=>c.nodes.list));
 }
 assert.ok(differences>=25);
});

test('joining generated fragments preserves every point and all notes without changing authored states',async()=>{
 const seed=splitDrawgridPhrase(generatedMelody(17))[0];seed.strokes=[{ptsN:[{nx:0,ny:.3},{nx:.5,ny:.7}],color:'#abc'},{ptsN:[{nx:.5,ny:.2},{nx:1,ny:.4}],color:'#def'}];
 const before=structuredClone(seed),single=singleGeneratedDrawgridLine(seed);
 assert.deepEqual(single.nodes,seed.nodes);assert.equal(single.strokes.length,1);assert.deepEqual(single.strokes[0].ptsN,seed.strokes.flatMap(s=>s.ptsN));assert.deepEqual(seed,before);
 const next=await prepareDrawgridPhrase(seed,()=>assert.fail(),{harmony,random:seededRandom(17)});
 assert.deepEqual(next[0],before);assert.ok(next.slice(1).every(bar=>bar.strokes.length===1));assert.deepEqual(seed,before);
});

test('authored statement and longer authored material survive; each variation remains an independent editable toy state',async()=>{
 const statement=splitDrawgridPhrase(generatedMelody(7))[0],original=structuredClone(statement);
 const next=await prepareDrawgridPhrase(statement,()=>assert.fail(),{harmony,random:seededRandom(7)});
 assert.deepEqual(next[0],original);assert.deepEqual(statement,original);
 next[1].nodes.list[0]=[11];assert.deepEqual(next[0],original);assert.notDeepEqual(next[2].nodes.list[0],[11]);
 const long=generatedMelody(9),result=await prepareDrawgridPhrase(long,()=>assert.fail(),{harmony});
 assert.deepEqual(result,splitDrawgridPhrase(long));
});
