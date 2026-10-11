// Recheck captured normal-browser scheduling and persistence, without a second
// playback engine. Run: node resources/auto-arrange-browser-proof.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {noteMidi} from '../src/harmonic-adaptation.js';
const files={
 three:'harmony-graph-2026-10-11T11-20-57-218Z.json',
 loops:'harmony-graph-2026-10-11T11-18-27-707Z.json',
 restoredThree:'harmony-graph-2026-10-11T11-21-43-184Z.json',
 filled:'harmony-graph-2026-10-11T11-23-38-752Z.json',
 edited:'harmony-graph-2026-10-11T11-25-35-200Z.json',
 regenerated:'harmony-graph-2026-10-11T11-25-59-634Z.json',
 restoredFilled:'harmony-graph-2026-10-11T11-27-10-116Z.json',
};
const dir=new URL('./debug-output/',import.meta.url),reports=Object.fromEntries(Object.entries(files).map(([key,name])=>[key,JSON.parse(fs.readFileSync(new URL(name,dir)))]));
const root=r=>r.snapshot.structureToys.find(s=>s.autoArrange?.root);
for(const r of Object.values(reports)){
 assert.equal(r.snapshot.toys.length,3);assert.equal(r.snapshot.structureToys.length,7);
 assert.equal(r.snapshot.connections.filter(e=>e.to.portId==='pattern').length,8);
 assert.equal(r.snapshot.connections.filter(e=>e.kind==='transport').length,1);
 assert.equal(root(r).name,'Arrangement');
}
function sourceUnchanged(before,after){
 for(const key of ['steps','strokes','notes','noteIndices','musicalRole','localTranspose','instrumentPitchShift'])if(before.state[key]!==undefined)assert.deepEqual(after.state[key],before.state[key]);
 if(before.state.nodes)for(const key of ['active','list','disabled'])assert.deepEqual(after.state.nodes[key],before.state.nodes[key]);
}
for(const before of reports.three.authoredSources)sourceUnchanged(before,reports.three.snapshot.toys.find(t=>t.id===before.id));
for(const before of reports.filled.authoredSources)sourceUnchanged(before,reports.filled.snapshot.toys.find(t=>t.id===before.id));
const expected=['C','A','F','G','C','A','F','G','F','G','A','C','C','A','F','G'];
const rolesByBar=Array.from({length:16},()=>new Set());
for(const e of reports.loops.events){
 const p=e.pitchDecision,bar=Math.floor((p.eventTick%6144)/384);rolesByBar[bar].add(p.role);
 if(p.role==='percussion'){assert.equal(p.resolvedChord,null);assert.equal(p.finalNote,p.sourceNote);}
 else{
  assert.equal(p.resolvedChord.root,expected[bar]);assert.equal(p.transpose,0);
  if(p.role==='accompaniment')assert.equal(p.finalNote,{C:'C3',A:'A2',F:'F3',G:'G2'}[expected[bar]]);
  if(p.role==='melody')assert.ok(Math.abs(noteMidi(p.finalNote)-noteMidi(p.sourceNote))<=1);
 }
}
rolesByBar.forEach((roles,i)=>assert.deepEqual([...roles].sort(),i>=4&&i<12?['accompaniment','melody','percussion']:['accompaniment']));
assert.ok(Math.max(...reports.loops.events.map(e=>e.pitchDecision.eventTick))>12288);
assert.deepEqual(reports.restoredThree.snapshot.structureToys.map(s=>s.id),reports.three.snapshot.structureToys.map(s=>s.id));
assert.ok(reports.restoredThree.events.length>0);
const fill=reports.edited.snapshot.toys.find(t=>t.type==='drawgrid'&&t.state.autoArrangeOrigin==='filled');
assert.equal(fill.state.localTranspose,3);
assert.notDeepEqual(fill.state.nodes,reports.filled.snapshot.toys.find(t=>t.id===fill.id).state.nodes);
assert.notEqual(root(reports.edited).id,root(reports.regenerated).id);
const stableState=state=>({...state,strokes:state.strokes&&JSON.parse(JSON.stringify(state.strokes,(_,v)=>typeof v==='number'?Math.round(v*1e12)/1e12:v))});
for(const r of [reports.regenerated,reports.restoredFilled])for(const t of reports.edited.snapshot.toys)assert.deepEqual(stableState(r.snapshot.toys.find(s=>s.id===t.id).state),stableState(t.state));
assert.deepEqual(reports.restoredFilled.snapshot.structureToys.map(s=>s.id),reports.regenerated.snapshot.structureToys.map(s=>s.id));
assert.ok(reports.restoredFilled.events.some(e=>e.pitchDecision.role==='accompaniment'&&e.pitchDecision.localTranspose===3));
const proof={passed:true,files,scheduledEvents:Object.fromEntries(Object.entries(reports).map(([key,r])=>[key,r.events.length])),rolesByBar:rolesByBar.map(s=>[...s].sort()),accompanimentByBar:expected.map(c=>({C:'C3',A:'A2',F:'F3',G:'G2'}[c])),checks:['authored source patterns unchanged','production harmony decisions','16-bar layering and whole-piece cycling','ordinary persistence and resumed audio','edited fill notes/transpose survive regeneration and reload']};
fs.writeFileSync(new URL('auto-arrange-browser-proof.json',dir),JSON.stringify(proof,null,2)+'\n');
for(const [key,name] of [['three','auto-arrange-three.scene.json'],['regenerated','auto-arrange-filled.scene.json']]){
 const payload=structuredClone(reports[key].snapshot);payload.heartbeats.forEach(h=>{h.positionTick=0;h.state='paused';});
 fs.writeFileSync(new URL(name,import.meta.url),JSON.stringify({type:'music-toys-scene',schemaVersion:1,displayName:key==='three'?'Auto-Arrange: three authored ideas':'Auto-Arrange: melody plus edited fill parts',payload},null,2)+'\n');
}
console.log('Browser proof passed; examples and resources/debug-output/auto-arrange-browser-proof.json written.');
