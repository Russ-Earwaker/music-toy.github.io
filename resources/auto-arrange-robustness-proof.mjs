import {mkdir,writeFile} from 'node:fs/promises';
import {INPUT_MATRIX,runInputCase} from '../tests/helpers/arrangement-matrix.mjs';
import {wav} from './chord-aware-melody-comparison.mjs';
const output=new URL('./debug-output/auto-arrange-robustness/',import.meta.url);await mkdir(output,{recursive:true});
const report=[];
for(const [i,spec] of INPUT_MATRIX.entries()){
 const result=await runInputCase(spec);
 if([0,1,2,3,10,13,16,18].includes(i))await writeFile(new URL(`case-${i+1}.wav`,output),wav(result.song));
 report.push({...result,song:undefined,playbackEvents:result.song.events});
}
await writeFile(new URL('matrix.json',output),JSON.stringify({kind:'Production Auto-Arrange compiler/scheduler with deterministic source fixtures; audio uses simple offline preview timbres.',cases:report},null,2));
const label=spec=>spec.map(s=>typeof s==='string'?s:s.kind+(s.empty?' (empty)':s.role?' / '+s.role:s.sparse?' (sparse)':'')).join(' + ');
await writeFile(new URL('index.html',output),`<!doctype html><meta charset="utf-8"><title>Auto-Arrange input matrix</title>
<style>body{font:15px system-ui;max-width:1200px;margin:30px auto;padding:16px;background:#111827;color:#e5e7eb}table{border-collapse:collapse;width:100%}td,th{padding:10px;border:1px solid #475569;text-align:left}audio{width:240px}</style>
<h1>Auto-Arrange input robustness</h1><p>23 deterministic cases. Each compiled result lasts sixteen bars, retains usable input patterns, contains pitched melody, harmonic support and percussion, and passes reset, graph reload and Arrange Again checks. Event logs are in <a href="matrix.json">matrix.json</a>.</p><p>Audio examples use the production pitch resolver with simple offline timbres, not browser captures. No subjective musical-quality verdict is claimed. Empty inputs are left unchanged; sources inside unrelated manual graphs are reserved.</p>
<table><tr><th>Case / inputs</th><th>Assigned sources</th><th>Generated missing roles</th><th>User sources heard</th><th>Preview</th></tr>${report.map((r,i)=>`<tr><td>${i+1}: ${label(r.input)}</td><td>${Object.entries(r.assigned).map(([k,v])=>k+' = '+v).join('<br>')}</td><td>${r.generated.join(', ')||'none'}</td><td>${r.heardUserSources.join(', ')}<br>${r.eventCount} events; 16 bars</td><td>${[0,1,2,3,10,13,16,18].includes(i)?`<audio controls preload="none" src="case-${i+1}.wav"></audio>`:'—'}</td></tr>`).join('')}</table>`);
console.log('23 matrix cases passed; exported eight full-arrangement audio previews.');
