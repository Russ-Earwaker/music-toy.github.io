import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {generatedMelody,seededRandom} from '../tests/helpers/generated-melody.mjs';
import {splitDrawgridPhrase,prepareDrawgridPhrase} from '../src/drawgrid/dg-phrase-chunks.js';
import {ARRANGEMENT_RECIPE} from '../src/auto-arrange.js';
import {resolveChordAtTick,CHORD_ROOTS,chordLabel} from '../src/chord-progression.js';
import {resolveMusicalPitch} from '../src/harmonic-adaptation.js';
import {createStructureRuntime} from '../src/structure-runtime.js';
import {midiToName} from '../src/note-helpers.js';
import {MELODY_CHORD_WEIGHTS} from '../src/drawgrid/dg-melody-harmony.js';

const harmony={originTick:0,stepTicks:384,chords:ARRANGEMENT_RECIPE.find(s=>s.name==='A').chords};
const chordTone=(pitch,chord)=>[0,chord.quality==='minor'?3:4,7].map(n=>(n+CHORD_ROOTS.indexOf(chord.root))%12).includes(pitch%12);
function sourceNotes(chunks){return chunks.flatMap((state,bar)=>state.nodes.list.flatMap((rows,col)=>state.nodes.active[col]===false?[]:rows
 .filter(row=>!state.nodes.disabled[col]?.includes(row)).map(row=>({tick:bar*384+col*48,pitch:59-row}))));}
export function arrangement(chunks){
 const runtime=createStructureRuntime();
 runtime.defineSequence('phrase',chunks.map((_,i)=>({toyId:'chunk-'+i,durationTicks:384})));
 for(const role of ['accompaniment','rhythm','extraRhythm'])runtime.defineStructure(role+'4','repeat',[{toyId:role,durationTicks:384}],0,{count:4});
 for(const section of ARRANGEMENT_RECIPE){
  const children=section.roles.map(role=>({structureId:role==='melody'?'phrase':role+'4'}));
  runtime.defineStructure(section.name+'Band','together',children);
  runtime.defineModifier(section.name,'chord-progression',[{structureId:section.name+'Band'}],0,{chords:section.chords,stepTicks:384});
 }
 runtime.defineSequence('song',ARRANGEMENT_RECIPE.map(s=>({structureId:s.name})));
 runtime.startSequence('song',0,{quantize:false,loop:false});
 const durationTicks=runtime.getDefinition('song').durationTicks,events=[];
 for(const turn of runtime.turnsInWindow('song',0,durationTicks)){
  const chunk=turn.toyId.startsWith('chunk-')?Number(turn.toyId.split('-')[1]):null;
  const notes=chunk===null?Array.from({length:turn.toyId==='extraRhythm'?8:4},(_,i)=>({tick:i*(turn.toyId==='extraRhythm'?48:96),pitch:48}))
   :sourceNotes([chunks[chunk]]);
  for(const note of notes){
   const eventTick=turn.startTick+note.tick;if(eventTick>=turn.endTick)continue;
   const role=chunk===null?(turn.toyId==='accompaniment'?'accompaniment':'percussion'):'melody';
   const decision=resolveMusicalPitch({sourcePitch:note.pitch,eventTick,context:turn.context,role});
   const chord=resolveChordAtTick(turn.context,eventTick);
   events.push({tick:eventTick,source:note.pitch,pitch:decision.finalNote,role,part:turn.toyId,
    chord:chordLabel(chord),chordTone:chordTone(decision.finalNote,chord),strong:eventTick%96===0});
  }
 }
 return {durationTicks,events:events.sort((a,b)=>a.tick-b.tick)};
}
export function wav(song){
 const rate=12000,seconds=song.durationTicks/192+.4,samples=new Float64Array(Math.ceil(seconds*rate));
 const noise=seededRandom(65536);
 for(const event of song.events){
  const start=Math.round(event.tick/192*rate),percussion=event.role==='percussion';
  const duration=percussion?.12:event.role==='melody'?.3:.4;
  const frequency=440*2**((event.pitch-69)/12),gain=percussion?(event.part==='extraRhythm'?.035:.06):event.role==='melody'?.27:.16;
  for(let i=0;i<duration*rate&&start+i<samples.length;i++){
   const t=i/rate,envelope=Math.min(1,t/.004)*Math.exp(-t/(percussion?.022:.1));
   const phase=2*Math.PI*frequency*t;
   const wave=percussion?noise()*2-1:(Math.sin(phase)+.22*Math.sin(phase*2)+.1*Math.sin(phase*3))/1.32;
   samples[start+i]+=gain*wave*envelope;
  }
 }
 const buffer=Buffer.alloc(44+samples.length*2);buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);
 buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);
 buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(samples.length*2,40);
 samples.forEach((n,i)=>buffer.writeInt16LE(Math.round(Math.max(-1,Math.min(1,n))*.9*32767),44+i*2));return buffer;
}
export function metric(song,from=0,to=Infinity){
 const melody=song.events.filter(e=>e.role==='melody'&&e.tick>=from&&e.tick<to);
 const fraction=notes=>notes.filter(e=>e.chordTone).length/Math.max(1,notes.length);
 return {strongChordRate:fraction(melody.filter(e=>e.strong)),weakChordRate:fraction(melody.filter(e=>!e.strong)),
  meanLeap:melody.slice(1).reduce((sum,n,i)=>sum+Math.abs(n.pitch-melody[i].pitch),0)/Math.max(1,melody.length-1),
  repeatedPitchRate:melody.slice(1).filter((n,i)=>n.pitch===melody[i].pitch).length/Math.max(1,melody.length-1)};
}
export function plot(chunks){
 const notes=sourceNotes(chunks);
 return `<svg viewBox="0 0 820 145" role="img" aria-label="Four-bar melody source notes"><rect width="820" height="145" fill="#18202e"/>${harmony.chords.map((c,i)=>`<text x="${i*200+20}" y="18" fill="white">${chordLabel(c)}</text><path d="M${i*200+10},24v110" stroke="#64748b"/>`).join('')}${notes.map(n=>`<circle cx="${20+n.tick/1536*780}" cy="${132-(n.pitch-48)*9}" r="4" fill="${chordTone(n.pitch,resolveChordAtTick({harmony},n.tick))?'#7de3a7':'#ffca80'}"><title>${n.tick}: ${midiToName(n.pitch)}</title></circle>`).join('')}</svg>`;
}
async function run(){
 const output=new URL('./debug-output/chord-aware-melody/',import.meta.url);await mkdir(output,{recursive:true});
 const comparisons=[];
 for(const seed of [1,7,19,42,73,101,313,1024]){
  const source=generatedMelody(seed),old=splitDrawgridPhrase(source),diagnostics=[];
  const guided=await prepareDrawgridPhrase(null,()=>source,{harmony,random:seededRandom(seed),diagnostics});
  const before=arrangement(old),after=arrangement(guided);
  if(before.durationTicks!==6144||after.durationTicks!==6144)throw Error('Expected sixteen bars');
  const row={seed,before:metric(before),after:metric(after),sections:{A:{before:metric(before,1536,3072),after:metric(after,1536,3072)},B:{before:metric(before,3072,4608),after:metric(after,3072,4608)}},diagnostics,oldSource:old,newSource:guided,oldEvents:before.events,newEvents:after.events};
  comparisons.push(row);
  await Promise.all(['old','new'].map((name,i)=>writeFile(new URL(`seed-${seed}-${name}.wav`,output),wav(i?after:before))));
 }
 await writeFile(new URL('comparison.json',output),JSON.stringify({policy:'Generate against A; reuse the same phrase under B with unchanged production adaptation.',weights:MELODY_CHORD_WEIGHTS,comparisons},null,2));
 await writeFile(new URL('../chord-aware-melody-summary.json',output),JSON.stringify(comparisons.map(({seed,before,after,sections})=>({seed,before,after,sections})),null,2));
 const percent=n=>(n*100).toFixed(1)+'%';
 await writeFile(new URL('index.html',output),`<!doctype html><meta charset="utf-8"><title>Chord-aware melody comparisons</title><style>body{background:#101722;color:#e2e8f0;font:16px system-ui;max-width:1000px;margin:32px auto;padding:16px}section{border-top:1px solid #475569;padding:20px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}svg,audio{width:100%}small{color:#b6c4d7}</style><h1>Eight seeded melody comparisons</h1><p>Each audio file is the full 16-bar Intro → A → B → Outro recipe, compiled with the production Structure runtime and pitch resolver. Simple preview timbres replace production samples. Melody is generated against C / Am / F / G and reused under F / G / Am / C. Green notes are source chord tones; amber notes are passing/non-chord tones.</p><p>These are offline previews, not browser audio captures. No subjective listening verdict is claimed.</p>${comparisons.map(r=>`<section><h2>Seed ${r.seed}</h2><div class="pair">${['old','new'].map((name,i)=>{const m=i?r.after:r.before;return `<div><h3>${i?'Chord-aware':'Previous generator'}</h3><audio controls preload="none" src="seed-${r.seed}-${name}.wav"></audio><p>A strong chord tones: ${percent(r.sections.A[i?'after':'before'].strongChordRate)}; B strong chord tones: ${percent(r.sections.B[i?'after':'before'].strongChordRate)}.</p><p>Combined strong chord tones after playback adaptation: ${percent(m.strongChordRate)}; weak: ${percent(m.weakChordRate)}.<br>Mean leap: ${m.meanLeap.toFixed(2)} semitones; repeated pitch: ${percent(m.repeatedPitchRate)}.</p>${plot(i?r.newSource:r.oldSource)}</div>`;}).join('')}</div></section>`).join('')}`);
 console.log(JSON.stringify(comparisons.map(({seed,before,after})=>({seed,before,after})),null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await run();
