// Recheck observations captured through the normal browser UI.
// Run: node resources/compact-reuse-browser-proof.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {noteMidi} from '../src/harmonic-adaptation.js';
const dir=new URL('./debug-output/',import.meta.url);
const files={added:'12-32-25-750',removed:'12-34-31-905',focused:'12-34-52-083',reloaded:'12-41-15-022'};
const reports=Object.fromEntries(Object.entries(files).map(([k,t])=>[k,JSON.parse(fs.readFileSync(new URL(`harmony-graph-2026-10-11T${t}Z.json`,dir)))]));
for(const [key,r] of Object.entries(reports)){
 const p=r.diagnostics.sourceUsePresentation;
 assert.equal(r.snapshot.toys.length,3);assert.equal(r.snapshot.structureToys.length,7);
 assert.equal(p.extraSockets,0);assert.equal(p.dottedCables,0);
 assert.equal(p.chips,key==='added'?9:8);
 assert.equal(r.snapshot.connections.filter(c=>c.to.portId==='pattern').length,p.chips);
 assert.equal(p.visibleCables,key==='focused'?8:7);
 assert.deepEqual(p.sourcePositions,reports.added.diagnostics.sourceUsePresentation.sourcePositions);
 const bounds=p.nodeBounds.map(b=>Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(b[k])])));
 assert.ok(Math.max(...bounds.map(b=>b.y+b.height))-Math.min(...bounds.map(b=>b.y))<1600);
 for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){
  const a=bounds[i],b=bounds[j];assert.ok(!(a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height));
 }
}
assert.deepEqual(reports.focused.diagnostics.sourceUsePresentation.highlightedSources,['proof-melody']);
const edges=r=>[...r.snapshot.connections].sort((a,b)=>a.id.localeCompare(b.id));
assert.deepEqual(edges(reports.reloaded),edges(reports.removed));
const canonical=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='number'?Math.round(v*1e12)/1e12:v));
for(const source of reports.added.snapshot.toys){
 for(const key of ['removed','focused','reloaded'])assert.deepEqual(canonical(reports[key].snapshot.toys.find(t=>t.id===source.id).state),canonical(source.state));
}
const chords=new Set(),roles=new Set();
for(const event of reports.reloaded.events){
 const p=event.pitchDecision;roles.add(p.role);
 if(p.role==='percussion'){assert.equal(p.resolvedChord,null);assert.equal(p.finalNote,p.sourceNote);continue;}
 chords.add(p.resolvedChord.root);
 if(p.role==='accompaniment')assert.equal(p.finalNote,{C:'C3',A:'A2',F:'F3',G:'G2'}[p.resolvedChord.root]);
 if(p.role==='melody')assert.ok(Math.abs(noteMidi(p.finalNote)-noteMidi(p.sourceNote))<=1);
}
assert.deepEqual([...chords].sort(),['A','C','F','G']);
assert.deepEqual([...roles].sort(),['accompaniment','melody','percussion']);
const summary={passed:true,files,sourceCount:3,structureCount:7,restoredUses:8,permanentCables:7,extraSockets:0,dottedCables:0,scheduledEvents:reports.reloaded.events.length,checks:['manual reuse','delete one use','source focus','solid relationship reveal','stable source positions','non-overlapping compact layout','source data preserved','reload','production harmony playback']};
fs.writeFileSync(new URL('compact-reuse-browser-proof.json',dir),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
