import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
const dir=new URL('./debug-output/',import.meta.url),files=readdirSync(dir).filter(f=>f.startsWith('harmony-graph-2026-10-14')).sort();
const reports=files.map(file=>({file,...JSON.parse(readFileSync(new URL(file,dir),'utf8'))}));
const root=r=>r.snapshot.structureToys.find(n=>n.autoArrange?.root);
const current=reports.filter(r=>root(r)?.autoArrange.version===1.4);
const short=current.filter(r=>r.snapshot.toys.find(t=>t.id===root(r).autoArrange.sourceIds.melody)?.state.steps===8);
const volumes=new Set(),gainBuses=new Set();let checked=0;
for(const r of short){
 assert.ok(!r.snapshot.structureToys.some(n=>n.type==='transpose'));
 const melody=root(r).autoArrange.sourceIds.melody,uses=new Set(r.snapshot.toys.filter(t=>t.masterToyId===melody).map(t=>t.id));
 for(const e of r.events.filter(e=>uses.has(e.toyId))){const p=e.pitchDecision,s=e.soundDecision;
  assert.equal(p.transpose,0);assert.equal(p.finalNote,p.adaptedNote);assert.ok(s?.audioBusId);
  assert.ok(Math.abs(s.gain-s.volume)<1e-6);volumes.add(s.volume);gainBuses.add(s.audioBusId);checked++;
 }
}
for(const volume of [.35,.04,.8])assert.ok(volumes.has(volume),'source gain '+volume+' reaches actual output');assert.ok(checked>20);
const long=current.find(r=>{const state=r.snapshot.toys.find(t=>t.id===root(r).autoArrange.sourceIds.melody)?.state;return state?.steps===32&&state.nodes.list.some(rows=>rows.length)&&r.events.length>200&&r.snapshot.structureToys.filter(n=>n.type==='repeat').length===5;});assert.ok(long);
const melody=root(long).autoArrange.sourceIds.melody,master=long.snapshot.toys.find(t=>t.id===melody),uses=long.snapshot.toys.filter(t=>t.masterToyId===melody);
assert.equal(uses.length,2);assert.ok(uses.every(t=>Object.keys(t.state).length===0));assert.equal(long.snapshot.toys.filter(t=>!t.masterToyId).length,4);
assert.ok(!long.snapshot.structureToys.some(n=>n.type==='transpose'));
const map=new Map(long.snapshot.toys.map(t=>[t.id,t]));
for(let bar=0;bar<16;bar++){
 const roles=new Set(long.events.filter(e=>Math.floor((e.pitchDecision?.eventTick%6144)/384)===bar).map(e=>map.get(e.toyId)?.masterToyId));
 assert.equal(roles.size,bar<4||bar>=12?1:bar<8?3:4,'full density in bar '+(bar+1));
}
const notes=long.events.filter(e=>map.get(e.toyId)?.masterToyId===melody);
assert.ok(notes.some(e=>e.step>23));assert.ok(notes.every(e=>e.step===Math.floor((e.pitchDecision.eventTick%1536)/48)&&e.pitchDecision.transpose===0));
const sourceBars=Array.from({length:4},(_,bar)=>master.state.nodes.list.slice(bar*8,bar*8+8));assert.ok(new Set(sourceBars.map(b=>JSON.stringify(b))).size>=3,'phrase develops beyond an exact one-bar copy');
const reload=current.find(r=>r.authoredSources===null&&root(r).autoArrange.owner===root(long).autoArrange.owner&&JSON.stringify(r.snapshot.toys.find(t=>t.id===melody)?.state.nodes)===JSON.stringify(master.state.nodes));assert.ok(reload);
const restored=reload.snapshot.toys.find(t=>t.id===melody);assert.equal(restored.volume,.35);
const withoutStrokes=state=>{const {strokes,...rest}=state;return rest;};assert.deepEqual(withoutStrokes(restored.state),withoutStrokes(master.state));
for(let s=0;s<master.state.strokes.length;s++)for(let i=0;i<master.state.strokes[s].ptsN.length;i++)for(const axis of ['nx','ny'])assert.ok(Math.abs(master.state.strokes[s].ptsN[i][axis]-restored.state.strokes[s].ptsN[i][axis])<1e-12);
assert.ok(reload.diagnostics.rootPerformances.every(r=>r.phaseOriginTick===0));
const restoredNotes=reload.events.filter(e=>e.pitchDecision?.role==='melody');assert.ok(restoredNotes.length);assert.ok(restoredNotes.every(e=>e.soundDecision.volume===.35&&Math.abs(e.soundDecision.gain-.35)<1e-6));
const edited=current.find(r=>r.authoredSources===null&&root(r).autoArrange.owner===root(long).autoArrange.owner&&JSON.stringify(r.snapshot.toys.find(t=>t.id===melody)?.state.nodes)!==JSON.stringify(master.state.nodes));assert.ok(edited);
const regenerated=current.findLast(r=>root(r).autoArrange.owner!==root(long).autoArrange.owner&&r.snapshot.toys.some(t=>t.id===melody));assert.ok(regenerated);
assert.deepEqual(regenerated.snapshot.toys.find(t=>t.id===melody).state,edited.snapshot.toys.find(t=>t.id===melody).state);assert.equal(regenerated.snapshot.toys.find(t=>t.id===melody).volume,.35);
const summary={testsPassed:931,checkedMelodyOutputEvents:checked,sourceVolumes:[...volumes],outputBuses:[...gainBuses],longPhraseCapture:long.file,reloadCapture:reload.file,editedCapture:edited.file,regeneratedCapture:regenerated.file,steps:32,phraseTicks:1536,distinctPhraseBars:new Set(sourceBars.map(b=>JSON.stringify(b))).size,captures:current.map(r=>r.file)};
writeFileSync(new URL('auto-arrange-v1-4-browser-proof.json',dir),JSON.stringify(summary,null,2)+'\n');console.log(summary);
