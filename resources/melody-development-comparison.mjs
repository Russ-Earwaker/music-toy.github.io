import {mkdir,writeFile} from 'node:fs/promises';
import {generatedMelody,seededRandom} from '../tests/helpers/generated-melody.mjs';
import {prepareDrawgridPhrase,splitDrawgridPhrase} from '../src/drawgrid/dg-phrase-chunks.js';
import {DEFAULT_CHORDS} from '../src/chord-progression.js';
import {arrangement,wav,metric,plot} from './chord-aware-melody-comparison.mjs';

const harmony={originTick:0,stepTicks:384,chords:DEFAULT_CHORDS};
const output=new URL('./debug-output/melody-development/',import.meta.url);
await mkdir(output,{recursive:true});
const comparisons=[];
for(const [index,seed] of [1,7,19,42,73,101,313,1024].entries()){
 const source=generatedMelody(seed),authored=index>=6?splitDrawgridPhrase(source)[0]:null;
 const before=await prepareDrawgridPhrase(authored,()=>source,{harmony,random:seededRandom(seed),development:false});
 const diagnostics=[],after=await prepareDrawgridPhrase(authored,()=>source,{harmony,random:seededRandom(seed),diagnostics});
 if(JSON.stringify(before[0])!==JSON.stringify(after[0]))throw Error('Statement changed between comparison versions');
 const songs=[arrangement(before),arrangement(after)];
 if(songs.some(s=>s.durationTicks!==6144))throw Error('Expected sixteen bars');
 await Promise.all(songs.map((song,i)=>writeFile(new URL(`seed-${seed}-${i?'after':'before'}.wav`,output),wav(song))));
 comparisons.push({seed,kind:authored?'supplied motif':'generated motif',before,after,diagnostics,
  metrics:songs.map(song=>({A:metric(song,1536,3072),B:metric(song,3072,4608)}))});
}
await writeFile(new URL('comparison.json',output),JSON.stringify({policy:'Statement → close variation → development → return/resolution; unchanged A-first harmony guidance and shared B reuse.',comparisons},null,2));
const percent=value=>(value*100).toFixed(1)+'%';
await writeFile(new URL('index.html',output),`<!doctype html><meta charset="utf-8"><title>Melody development comparison</title>
<style>body{background:#101722;color:#e2e8f0;font:16px system-ui;max-width:1050px;margin:30px auto;padding:16px}section{border-top:1px solid #475569;padding:18px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}audio,svg{width:100%}small{color:#b6c4d7}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style>
<h1>Melody development — same-seed listening comparisons</h1>
<p>Before = previous chord-aware generation. After = statement / close variation / development / return, still chord-aware. Both versions have the exact same first chunk, source seed, progression and mix.</p>
<p>Each file plays the complete 16-bar Intro → A → B → Outro arrangement, using the production Structure runtime and pitch resolver with simple offline preview timbres. Melody enters in A after four bars (8 seconds). B begins at 16 seconds. These are not browser recordings.</p>
<p>Green source notes are chord tones under A; amber notes are non-chord tones. A and B retain their existing different progressions and conservative shared-phrase adaptation. No subjective listening verdict is claimed.</p>
${comparisons.map(row=>`<section><h2>Seed ${row.seed} — ${row.kind}</h2><div class="pair">${['before','after'].map((version,i)=>`<div><h3>${i?'After: motif development':'Before: chord-aware baseline'}</h3><audio controls preload="none" src="seed-${row.seed}-${version}.wav"></audio>${plot(row[version])}<p><small>Bars: ${i?'Statement · Close variation · Development · Return':'Previous four-bar phrase'}</small></p><p>A strong chord tones: ${percent(row.metrics[i].A.strongChordRate)}; B: ${percent(row.metrics[i].B.strongChordRate)}.<br>A mean leap: ${row.metrics[i].A.meanLeap.toFixed(2)} semitones.</p></div>`).join('')}</div></section>`).join('')}`);
console.log('Exported eight same-seed pairs (six generated statements, two supplied motifs).');
