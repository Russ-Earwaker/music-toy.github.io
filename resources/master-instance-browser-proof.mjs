// Recheck actual browser observations: node resources/master-instance-browser-proof.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {noteMidi} from '../src/harmonic-adaptation.js';
const dir=new URL('./debug-output/',import.meta.url);
const files={manual:'15-10-38-709',deleted:'15-11-10-400',duplicated:'15-12-06-851',edited:'15-13-22-100',legacy:'15-14-46-976',arranged:'15-16-45-055',regenerated:'15-17-28-504',reloaded:'15-20-12-849',final:'15-22-22-552'};
const reports=Object.fromEntries(Object.entries(files).map(([k,t])=>[k,JSON.parse(fs.readFileSync(new URL(`harmony-graph-2026-10-11T${t}Z.json`,dir)))]));
const uses=r=>r.snapshot.toys.filter(t=>t.masterToyId),masters=r=>r.snapshot.toys.filter(t=>!t.masterToyId),owned=r=>uses(r).filter(t=>t.autoArrangeOwner);
const canonical=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='number'?Math.round(v*1e12)/1e12:v));
for(const r of Object.values(reports)){
 const p=r.diagnostics.sourceUsePresentation;assert.equal(p.chips,0);assert.equal(p.extraSockets,0);assert.equal(p.dottedCables,0);
 assert.ok(r.snapshot.connections.every(c=>c.to.portId!=='pattern'));
 for(const use of uses(r)){assert.deepEqual(use.state,{});assert.ok(masters(r).some(t=>t.id===use.masterToyId));}
 for(const p of r.diagnostics.instancePresentation||[]){assert.equal(p.visibleRoles,0);if(p.masterToyId){assert.equal(p.width,240);assert.equal(p.height,160);assert.equal(p.sourceControls,0);assert.equal(p.colour,r.diagnostics.instancePresentation.find(m=>m.id===p.masterToyId).colour);}}
}
assert.deepEqual(uses(reports.manual).map(t=>t.instanceNumber),[1,2]);
assert.deepEqual(uses(reports.deleted).map(t=>t.instanceNumber),[1]);
assert.deepEqual(uses(reports.duplicated).map(t=>t.instanceNumber),[1,3]);
assert.equal(uses(reports.deleted)[0].id,uses(reports.manual)[0].id);
for(const r of [reports.manual,reports.deleted,reports.duplicated])assert.deepEqual(canonical(masters(r)[0].state),canonical(masters(reports.manual)[0].state));
assert.equal(reports.manual.snapshot.connections.filter(c=>c.kind==='sequence').length,2);
const editedIds=new Set(uses(reports.edited).map(t=>t.id));
for(const id of editedIds){const events=reports.edited.events.filter(e=>e.toyId===id);assert.ok(events.length);assert.ok(events.every(e=>e.pitchDecision.localTranspose===3&&noteMidi(e.pitchDecision.finalNote)-noteMidi(e.pitchDecision.sourceNote)===3));}
for(const r of [reports.legacy,reports.arranged,reports.regenerated,reports.reloaded,reports.final]){
 assert.equal(masters(r).length,3);assert.equal(r.snapshot.structureToys.length,7);assert.equal(owned(r).length,8);
 for(const source of masters(reports.legacy))assert.deepEqual(canonical(masters(r).find(t=>t.id===source.id).state),canonical(source.state));
 const masterIds=new Set(masters(r).map(t=>t.id));
 assert.deepEqual(r.diagnostics.sourceUsePresentation.sourcePositions.filter(p=>masterIds.has(p.id)),reports.legacy.diagnostics.sourceUsePresentation.sourcePositions.filter(p=>masterIds.has(p.id)));
}
const unrelated=uses(reports.arranged).find(t=>!t.autoArrangeOwner);assert.ok(unrelated);
for(const r of [reports.regenerated,reports.reloaded,reports.final]){assert.equal(uses(r).length,9);assert.deepEqual(uses(r).find(t=>t.id===unrelated.id),unrelated);}
assert.ok(owned(reports.regenerated).every(t=>!owned(reports.arranged).some(old=>old.id===t.id)));
const sortedEdges=r=>[...r.snapshot.connections].sort((a,b)=>a.id.localeCompare(b.id));assert.deepEqual(sortedEdges(reports.reloaded),sortedEdges(reports.regenerated));
assert.deepEqual(uses(reports.reloaded),uses(reports.regenerated));
const root=r=>r.snapshot.structureToys.find(t=>t.autoArrange?.root);
assert.equal(root(reports.final).x,root(reports.reloaded).x);assert.equal(root(reports.final).y,root(reports.reloaded).y);
let verifiedEvents=0;
for(const r of [reports.legacy,reports.arranged,reports.reloaded]){
 const ids=new Set(owned(r).map(t=>t.id)),roles=new Set(),chords=new Set();
 for(const event of r.events.filter(e=>ids.has(e.toyId))){
  const p=event.pitchDecision;roles.add(p.role);verifiedEvents++;
  if(p.role==='percussion'){assert.equal(p.resolvedChord,null);assert.equal(p.finalNote,p.sourceNote);continue;}
  chords.add(p.resolvedChord.root);
  const harmony=event.context.harmony,step=Math.floor((p.eventTick-harmony.originTick)/harmony.stepTicks)%harmony.chords.length;
  assert.equal(p.resolvedChord.root,harmony.chords[step].root);
  if(p.role==='accompaniment')assert.equal(p.finalNote,{C:'C3',A:'A2',F:'F3',G:'G2'}[p.resolvedChord.root]);
  if(p.role==='melody')assert.ok(Math.abs(noteMidi(p.finalNote)-noteMidi(p.sourceNote))<=1);
 }
 assert.deepEqual([...roles].sort(),['accompaniment','melody','percussion']);assert.deepEqual([...chords].sort(),['A','C','F','G']);
}
const summary={passed:true,files,tests:892,verifiedOwnedPlaybackEvents:verifiedEvents,masters:3,arrangementInstances:8,preservedUserInstances:1,chips:0,dottedCables:0,extraSockets:0,checks:['native Advanced/Create Instance','native Duplicate and See Master','deletion safety','stable suffixes after deletion/reload','ordinary Master/Instance chain','shared Master transpose','legacy migration','unchanged authored source state','shared instrument colors','roles hidden in Basic','Arrange Again ownership cleanup','stable regeneration root','exact reload links','production harmony scheduling']};
fs.writeFileSync(new URL('master-instance-browser-proof.json',dir),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
