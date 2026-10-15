import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
const dir=new URL('./debug-output/',import.meta.url);
const reports=readdirSync(dir).filter(f=>/^structure-instances-20.*\.json$/.test(f)).sort().map(file=>({file,...JSON.parse(readFileSync(new URL(file,dir),'utf8'))}));
const children=(snap,id)=>snap.connections.filter(e=>e.from.objectId===id).sort((a,b)=>Number(a.from.portId.split(':')[1])-Number(b.from.portId.split(':')[1])).map(e=>e.to.objectId);
const copies=snap=>snap.structureToys.filter(s=>s.masterStructureId);
const manual=reports.filter(r=>r.snapshot.structureToys.some(s=>s.id==='phrase-proof-master'));
const edited=manual.findLast(r=>copies(r.snapshot).length===2&&r.actions.some(a=>a.kind==='after-reload'));
assert.ok(edited,'manual graph reloaded with both copies');
const toyMap=new Map(edited.snapshot.toys.map(t=>[t.id,t]));
const masterOrder=children(edited.snapshot,'phrase-proof-master');assert.deepEqual(masterOrder,[0,2,1,3].map(n=>'phrase-draw-'+n));
for(const copy of copies(edited.snapshot)){
 const ids=children(edited.snapshot,copy.id);assert.equal(ids.length,4);
 assert.deepEqual(ids.map(id=>toyMap.get(id).masterToyId),masterOrder);
 assert.ok(ids.every(id=>toyMap.get(id).structureInstanceId===copy.id&&Object.keys(toyMap.get(id).state).length===0));
 const c=ids.find(id=>toyMap.get(id).masterToyId==='phrase-draw-2');
 assert.ok(edited.events.some(e=>e.toyId===c&&e.pitchDecision?.sourceNote==='G#4'),'source edit reaches each copy');
 assert.ok(edited.events.some(e=>e.toyId===c&&e.soundDecision?.volume===.2),'Master volume reaches both copies');
}
assert.equal(new Set(edited.events.map(e=>e.context?.harmony?.progressionId)).size,2);
assert.ok(edited.events.every(e=>e.step===Math.floor(e.pitchDecision.eventTick/48)%8));
const beforeReload=edited.actions.findLast(a=>a.kind==='before-reload').snapshot,afterReload=edited.actions.findLast(a=>a.kind==='after-reload').snapshot;
assert.deepEqual(afterReload.toys.map(t=>t.id).sort(),beforeReload.toys.map(t=>t.id).sort());
assert.deepEqual(copies(afterReload).map(s=>[s.id,s.masterStructureId,s.structureInstanceNumber]),copies(beforeReload).map(s=>[s.id,s.masterStructureId,s.structureInstanceNumber]));
const deleted=manual.findLast(r=>copies(r.snapshot).length===1&&r.snapshot.toys.filter(t=>t.masterToyId).length===4);assert.ok(deleted);
assert.equal(deleted.snapshot.toys.filter(t=>!t.masterToyId).length,4);assert.equal(copies(deleted.snapshot)[0].structureInstanceNumber,2);

const arranged=reports.filter(r=>r.snapshot.structureToys.some(s=>s.autoArrange?.root));
const root=r=>r.snapshot.structureToys.find(s=>s.autoArrange?.root);
const full=arranged.find(r=>r.events.length>700);
assert.ok(full);const chunks=full.snapshot.toys.filter(t=>t.state.autoArrangeFill==='melody-chunk');assert.equal(chunks.length,4);assert.ok(chunks.every(t=>t.state.steps===8&&t.state.nodes.list.length===8&&t.state.strokes.length));
assert.equal(full.snapshot.toys.filter(t=>!t.masterToyId).length,7);assert.equal(copies(full.snapshot).length,2);
assert.ok(!full.snapshot.structureToys.some(s=>s.type==='transpose'||s.type==='timeline'));
assert.equal(new Set(chunks.map(t=>JSON.stringify(t.state.nodes.list))).size>=3,true);
const map=new Map(full.snapshot.toys.map(t=>[t.id,t])),expectedChords=['C','Am','F','G','C','Am','F','G','F','G','Am','C','C','Am','F','G'];
for(let bar=0;bar<16;bar++){
 const events=full.events.filter(e=>Math.floor((e.pitchDecision.eventTick%6144)/384)===bar);
 const layers=new Set(events.map(e=>map.get(e.toyId).masterToyId));assert.equal(layers.size,bar<4||bar>=12?1:bar<8?3:4,'section density bar '+bar);
 for(const e of events){
  const p=e.pitchDecision;assert.equal(p.transpose,0);assert.equal(p.finalNote,p.adaptedNote);
  if(p.role==='percussion')assert.equal(p.resolvedChord,null);else assert.equal(p.resolvedChord.root+(p.resolvedChord.quality==='minor'?'m':''),expectedChords[bar]);
 }
}
const changed=arranged.find(r=>r.file==='structure-instances-2026-10-14T19-12-48-259Z.json');assert.ok(changed);
const regenerated=arranged.find(r=>root(r).autoArrange.owner!==root(changed).autoArrange.owner&&root(r).autoArrange.sourceIds.melody===root(changed).autoArrange.sourceIds.melody);assert.ok(regenerated);
assert.deepEqual(regenerated.snapshot.toys.filter(t=>!t.masterToyId).map(t=>t.id),changed.snapshot.toys.filter(t=>!t.masterToyId).map(t=>t.id));
for(const toy of changed.snapshot.toys.filter(t=>!t.masterToyId))assert.deepEqual(regenerated.snapshot.toys.find(t=>t.id===toy.id).state,toy.state);
assert.equal(copies(regenerated.snapshot).length,2);assert.ok(copies(changed.snapshot).every(old=>!regenerated.snapshot.structureToys.some(s=>s.id===old.id)&&!regenerated.snapshot.toys.some(t=>t.structureInstanceId===old.id)));
const muted=arranged.findLast(r=>r.events.some(e=>e.soundDecision?.muted));assert.ok(muted);
for(const e of muted.events.filter(e=>e.soundDecision?.muted))assert.equal(e.soundDecision.gain,0);
const reloaded=arranged.findLast(r=>r.actions.some(a=>a.kind==='after-reload'&&a.snapshot.structureToys.some(s=>s.autoArrange?.root)));assert.ok(reloaded);
const cleared=reports.find(r=>r.snapshot.toys.length===0&&r.snapshot.structureToys.length===0&&r.snapshot.connections.length===0);assert.ok(cleared,'New Creation clears the entire linked graph in one confirmed action');
const relationship=reports.findLast(r=>r.relationships.some(e=>e.flashed.length===2&&e.tethers.some(t=>t.paths===1&&t.pointer==='none')));assert.ok(relationship,'linked Structure header reveals both nodes with an inert background tether');
const summary={manual:{proof:edited.file,deletionProof:deleted.file,copies:2,visibleChildrenPerCopy:4,sourceEdit:'G#4 in both copies',independentHarmony:true,sourcePhase:true,reloadIdentity:true},autoArrange:{proof:full.file,regenerationProof:regenerated.file,muteProof:muted.file,reloadProof:reloaded.file,chunkMasters:4,phraseMasters:1,copies:2,durationBars:16,layers:[1,3,4,1],masterEditsPreserved:true,sourceBusMute:true},clearCreationProof:cleared.file,relationshipProof:relationship?.file,notesChecked:full.events.length+edited.events.length};
writeFileSync(new URL('structure-instances-browser-proof.json',dir),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
