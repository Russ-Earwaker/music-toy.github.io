import fs from 'node:fs';
import {resolveMusicalPitch,noteMidi} from '../../../src/harmonic-adaptation.js';
import {midiToName} from '../../../src/note-helpers.js';
const read=name=>JSON.parse(fs.readFileSync(new URL(name+'.json',import.meta.url)));
const names=['closed','open','close','expanded'],captures=names.map(read);
const first=captures[0].containers[0].internalToyIds[0];
let timingMismatches=0,pitchMismatches=0,duplicates=0,restMismatches=0,contextMismatches=0;
const stages=captures.map((p,i)=>{
 const all=p.admitted.filter(e=>e.toyId===first&&e.context.harmony);
 const end=Math.floor(Math.max(...all.map(e=>e.eventTick))/384)*384;
 const lower=i===1?Math.max(...captures[0].admitted.map(e=>e.eventTick))+384:i===2?Math.max(...captures[1].admitted.map(e=>e.eventTick))+384:end-2304;
 const events=all.filter(e=>e.eventTick>=Math.ceil(lower/384)*384&&e.eventTick<end);
 const seen=new Set(),bars=new Map();
 for(const e of events){
  if(e.eventTick%384!==e.col*48)timingMismatches++;
  const authored=p.toys.find(t=>t.id===first).notes.find(n=>n.col===e.col);
  const expected=resolveMusicalPitch({sourcePitch:midiToName(e.sourceMidi),eventTick:e.eventTick,context:e.context,role:'melody'}).finalNote;
  if(e.sourceMidi!==authored.sourceMidi||noteMidi(e.note)!==noteMidi(expected))pitchMismatches++;
  if(!e.context.harmony||e.context.transposeSemitones!==0)contextMismatches++;
  const key=e.eventTick+':'+e.col;if(seen.has(key))duplicates++;seen.add(key);
  const bar=Math.floor(e.eventTick/384);if(!bars.has(bar))bars.set(bar,[]);bars.get(bar).push(e.col);
 }
 for(const cols of bars.values())if(JSON.stringify(cols.sort((a,b)=>a-b))!=='[0,1,2,3,4,5]')restMismatches++;
 if(!events.length)throw new Error('No complete stage capture: '+names[i]);
 return {stage:names[i],events:events.length,completeBars:bars.size,browserErrors:p.errors};
});
const norm=notes=>notes.map(n=>({...n,scissorMuted:!!n.scissorMuted,paintCovered:!!n.paintCovered}));
const reloaded=read('reload');
const reloadPreservesCanonical=captures[2].toys.every(t=>{const r=reloaded.toys.find(p=>p.id===t.id);return JSON.stringify(norm(t.notes))===JSON.stringify(norm(r.notes))&&JSON.stringify(t.strokes)===JSON.stringify(r.strokes);});
const result={stages,timingMismatches,pitchMismatches,duplicates,restMismatches,contextMismatches,reloadPreservesCanonical};
fs.writeFileSync(new URL('results.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(timingMismatches+pitchMismatches+duplicates+restMismatches+contextMismatches||!reloadPreservesCanonical)process.exitCode=1;
