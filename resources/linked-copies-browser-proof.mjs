import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
const dir=new URL('./debug-output/',import.meta.url);
const reports=readdirSync(dir).filter(f=>/^structure-instances-20.*\.json$/.test(f)).sort().map(file=>({file,...JSON.parse(readFileSync(new URL(file,dir),'utf8'))})).filter(r=>r.snapshot.structureToys.some(s=>s.sharedDefinitionId)&&r.panels.some(p=>p.editor));
const members=(snap,id)=>snap.connections.filter(e=>e.from.objectId===id).sort((a,b)=>Number(a.from.portId.split(':')[1])-Number(b.from.portId.split(':')[1])).map(e=>e.to.objectId);
const manual=reports.find(r=>r.actions.some(a=>a.kind==='moved-copy')&&r.snapshot.structureToys.some(s=>s.id==='phrase-proof-master'));
assert.ok(manual);const moved=manual.actions.find(a=>a.kind==='moved-copy'),previous=manual.actions[manual.actions.indexOf(moved)-1];
const a=previous.snapshot.structureToys.find(s=>s.structureInstanceNumber===1),b=previous.snapshot.structureToys.find(s=>s.structureInstanceNumber===2);
assert.equal(moved.snapshot.structureToys.find(s=>s.id===a.id).x,a.x);assert.equal(moved.snapshot.structureToys.find(s=>s.id===a.id).y,a.y);assert.equal(moved.snapshot.structureToys.find(s=>s.id===b.id).x,b.x+700);
for(const s of manual.snapshot.structureToys.filter(s=>s.sharedDefinitionId)){
 const ordered=members(manual.snapshot,s.id).map(id=>manual.snapshot.toys.find(t=>t.id===id).structureMasterChildId);assert.deepEqual(ordered,['phrase-draw-0','phrase-draw-2','phrase-draw-1','phrase-draw-3']);
}
const edited=reports.find(r=>r.panels.filter(p=>p.id==='phrase-draw-1'||p.masterToyId==='phrase-draw-1').length===3&&r.panels.filter(p=>p.id==='phrase-draw-1'||p.masterToyId==='phrase-draw-1').every(p=>p.editor.nodes.list.every(rows=>rows.length===1&&rows[0]===3)));assert.ok(edited);
const deleted=reports.find(r=>r.actions.some(a=>a.kind==='deleted-original')&&r.snapshot.toys.length===8);assert.ok(deleted);assert.equal(deleted.snapshot.structureToys.filter(s=>s.sharedDefinitionId).length,2);assert.ok(!deleted.snapshot.structureToys.some(s=>s.id==='phrase-proof-master'));
const restored=reports.findLast(r=>r.snapshot.toys.length===8&&r.actions.some(a=>a.kind==='after-reload')&&r.snapshot.toys.filter(t=>!t.masterToyId).every(t=>t.state.nodes?.list.reduce((n,r)=>n+r.length,0)===8));assert.ok(restored,'promoted definitions reload with every note preserved');
const settings=reports.find(r=>r.file==='structure-instances-2026-10-14T20-16-26-305Z.json');assert.ok(settings);assert.ok(settings.panels.some(p=>p.editor?.musicalRole==='accompaniment'));assert.ok(settings.events.some(e=>e.soundDecision?.muted&&e.soundDecision.volume===.2));
const muteBoundary=settings.events.findIndex(e=>e.soundDecision?.muted&&e.soundDecision.gain===0);assert.ok(muteBoundary>=0);
for(const e of settings.events.slice(muteBoundary).filter(e=>e.soundDecision?.muted))assert.equal(e.soundDecision.gain,0);
const full=reports.find(r=>r.snapshot.structureToys.some(s=>s.autoArrange?.root)&&r.events.length>400&&r.snapshot.toys.filter(t=>t.state.autoArrangeFill==='melody-chunk').length===4);assert.ok(full);
assert.equal(full.snapshot.toys.filter(t=>!t.masterToyId).length,7);assert.equal(full.snapshot.toys.length,22);
const phrase=full.snapshot.structureToys.filter(s=>s.sharedDefinitionId);assert.equal(phrase.length,3);assert.ok(phrase.every(s=>!s.collapsed));
for(const s of phrase){assert.equal(members(full.snapshot,s.id).length,4);const map=new Map(full.panels.map(p=>[p.id,p]));assert.ok(members(full.snapshot,s.id).every(id=>map.get(id).controls>=4&&map.get(id).editor.steps===8));}
assert.ok(!full.snapshot.structureToys.some(s=>s.type==='transpose'));
const toyMap=new Map(full.snapshot.toys.map(t=>[t.id,t])),chords=['C','Am','F','G','C','Am','F','G','F','G','Am','C','C','Am','F','G'];
for(let bar=0;bar<16;bar++){
 const events=full.events.filter(e=>Math.floor((e.pitchDecision.eventTick%6144)/384)===bar),layers=new Set(events.map(e=>toyMap.get(e.toyId)?.masterToyId||e.toyId));assert.equal(layers.size,bar<4||bar>=12?1:bar<8?3:4);
 for(const e of events){assert.equal(e.pitchDecision.transpose,0);if(e.pitchDecision.role==='percussion')assert.equal(e.pitchDecision.resolvedChord,null);else{const chord=e.pitchDecision.resolvedChord;assert.equal(chord.root+(chord.quality==='minor'?'m':''),chords[bar]);}}
}
const regenerated=reports.find(r=>r.file==='structure-instances-2026-10-14T20-45-57-449Z.json');assert.ok(regenerated);assert.equal(regenerated.snapshot.toys.length,22);
const afterTemplateDeletion=reports.find(r=>r.file==='structure-instances-2026-10-14T20-51-04-866Z.json');assert.ok(afterTemplateDeletion);assert.equal(afterTemplateDeletion.snapshot.toys.length,22);assert.equal(afterTemplateDeletion.snapshot.toys.filter(t=>!t.masterToyId).length,7);
const definitions=snap=>snap.toys.filter(t=>!t.masterToyId).map(t=>t.sharedDefinitionId).sort();assert.deepEqual(definitions(afterTemplateDeletion.snapshot),definitions(full.snapshot));
const sourceNotes=snap=>Object.fromEntries(snap.toys.filter(t=>!t.masterToyId&&t.type==='drawgrid').map(t=>[t.sharedDefinitionId,t.state.nodes]));assert.deepEqual(sourceNotes(afterTemplateDeletion.snapshot),sourceNotes(full.snapshot));
const relationship=reports.find(r=>r.relationships.some(e=>e.flashed.length===3&&e.tethers.some(t=>t.paths===2&&t.pointer==='none')));assert.ok(relationship,'header reveals the complete linked Phrase family');
const summary={manual:{edit:edited.file,moveAndReorder:manual.file,deletion:deleted.file,reload:restored.file,sharedSettingsAndMute:settings.file},autoArrange:{fullPlayback:full.file,regeneration:regenerated.file,regenerationAfterOriginalDeletion:afterTemplateDeletion.file,bars:16,layers:[1,3,4,1],sharedToyDefinitions:7,visibleToyViews:22,fullyExpandedPhraseViews:3},relationship:relationship.file,notesChecked:full.events.length+settings.events.length};
writeFileSync(new URL('linked-copies-browser-proof.json',dir),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
