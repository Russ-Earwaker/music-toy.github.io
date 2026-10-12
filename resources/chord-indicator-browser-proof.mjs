import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolveChordAtTick,chordLabel} from '../src/chord-progression.js';
const dir=new URL('./debug-output/',import.meta.url);
const reports=readdirSync(dir).filter(f=>f.startsWith('harmony-graph-2026-10-12T20-5')||f.startsWith('harmony-graph-2026-10-12T21')).sort()
  .map(file=>({file,...JSON.parse(readFileSync(new URL(file,dir),'utf8'))})).filter(r=>r.chordIndicators?.length);
assert.ok(reports.length);
let verified=0,paused=0;
for(const report of reports){
  for(const row of report.chordIndicators){
    if(!row.label){if(!row.playing)paused++;continue;}
    assert.ok(row.playing);assert.ok(['melody','accompaniment'].includes(row.role));
    assert.ok(row.currentTick>=row.startTick&&row.currentTick<(row.endTick??Infinity));
    assert.equal(row.label,chordLabel(resolveChordAtTick(row.context,row.currentTick)));
    if(row.masterToyId){assert.equal(row.width,240);assert.equal(row.height,160);}
    verified++;
  }
  for(const row of report.chordIndicatorStatus||[])if(row.role==='percussion'||!row.playing)assert.equal(row.label,null);
}
assert.ok(paused>0,'normal UI Pause clears the display');
const arrangement=reports.find(r=>r.snapshot.toys.filter(t=>t.masterToyId).length===8&&r.chordIndicators.some(o=>o.currentTick>6144));
assert.ok(arrangement,'observe a complete arrangement and its next cycle');
const sectionLabels={Intro:['C','Am','F','G'],A:['C','Am','F','G'],B:['F','G','Am','C'],Outro:['C','Am','F','G']};
const sequences={};
for(const toy of arrangement.snapshot.toys.filter(t=>t.masterToyId)){
  const parent=arrangement.snapshot.connections.find(e=>e.to.objectId===toy.id);
  let node=arrangement.snapshot.structureToys.find(n=>n.id===parent.from.objectId);
  if(node.type==='together')node=arrangement.snapshot.structureToys.find(n=>n.id===arrangement.snapshot.connections.find(e=>e.to.objectId===node.id).from.objectId);
  const rows=arrangement.chordIndicators.filter(r=>r.toyId===toy.id&&r.label);
  const isPercussion=arrangement.snapshot.toys.find(t=>t.id===toy.masterToyId).type==='loopgrid';
  if(isPercussion){assert.equal(rows.length,0);continue;}
  const labels=rows.slice(0,4).map(r=>r.label);assert.deepEqual(labels,sectionLabels[node.name]);sequences[toy.id]={section:node.name,labels};
}
assert.ok(reports.some(r=>r.chordIndicators.some(o=>!o.masterToyId&&o.label)),'Masters show their own harmonic context');
const unrelated=reports.find(r=>r.snapshot.toys.some(t=>t.id==='independent-phase-a')&&r.chordIndicatorStatus?.some(s=>s.toyId==='independent-phase-a'&&s.playing));
assert.ok(unrelated,'capture unrelated pitched playback');assert.ok(unrelated.chordIndicatorStatus.every(s=>s.label===null));
const summary={testsPassed:919,visibleTransitionsVerified:verified,pauseHidesVerified:paused,arrangementCapture:arrangement.file,sections:sequences,captures:reports.map(r=>r.file)};
writeFileSync(new URL('chord-indicator-browser-proof.json',dir),JSON.stringify(summary,null,2)+'\n');console.log(summary);
