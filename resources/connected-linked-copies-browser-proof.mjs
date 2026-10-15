import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
const dir=new URL('./debug-output/',import.meta.url),files=readdirSync(dir).filter(f=>/^connected-linked-copies-20.*\.json$/.test(f)).sort(),file=files.at(-1),report=JSON.parse(readFileSync(new URL(file,dir)));
const full=report.actions.filter(a=>a.kind==='saved'&&a.snapshot.sharedToyDefinitions?.length===7&&a.panels.length===15&&a.unconnected.length===0);
assert.ok(full.length>=3,'connected first build, regeneration and reload');
const seedId='toy-definition:'+report.seed.id,seed=report.seed.state.nodes;
for(const a of full){
 assert.equal(a.snapshot.sharedSequenceDefinitions.length,1);assert.equal(a.snapshot.structureToys.filter(s=>s.sharedDefinitionId).length,2);assert.ok(a.snapshot.structureToys.filter(s=>s.sharedDefinitionId).every(s=>!s.collapsed));
 assert.ok(a.snapshot.toys.every(t=>!t.masterToyId&&!t.state),'views contain definition IDs, not canonical musical data');
 assert.deepEqual(a.snapshot.sharedToyDefinitions.find(d=>d.id===seedId).state.nodes,seed);
 assert.equal(a.snapshot.sharedToyDefinitions.filter(d=>d.state.musicalRole==='melody').length,4);
 for(const s of a.snapshot.structureToys.filter(s=>s.sharedDefinitionId)){const children=a.snapshot.connections.filter(e=>e.from.objectId===s.id);assert.equal(children.length,4);assert.ok(children.every(e=>a.panels.find(p=>p.id===e.to.objectId)?.controls>=4));}
 const reachable=new Set(['main-heartbeat']);let changed;do{changed=false;for(const e of a.snapshot.connections)if(reachable.has(e.from.objectId)&&!reachable.has(e.to.objectId)){reachable.add(e.to.objectId);changed=true;}}while(changed);assert.ok(a.snapshot.structureToys.every(s=>reachable.has(s.id)),'every structure connected');
}
const edited=report.actions.find(a=>a.kind==='edited-B-chunk-2');assert.ok(edited);const final=full.at(-1),melodies=final.snapshot.sharedToyDefinitions.filter(d=>d.state.musicalRole==='melody');assert.ok(melodies.some(d=>d.state.nodes.list.every(row=>row.length===1&&row[0]===3)),'edited chunk survives regeneration/deletion/reload');
assert.ok(final.panels.filter(p=>p.role==='accompaniment').every(p=>p.volume==='0.2'&&Math.abs(p.gain-.2)<1e-6),'shared volume from actual UI survives reload');
const beforeDelete=report.actions.find(a=>a.kind==='before-reload'&&a.snapshot.sharedToyDefinitions?.length===7),deleted=report.actions.find(a=>a.kind==='deleted-first-phrase');assert.ok(beforeDelete&&deleted);
assert.deepEqual(deleted.snapshot.sharedToyDefinitions.map(d=>d.id).sort(),beforeDelete.snapshot.sharedToyDefinitions.map(d=>d.id).sort());assert.equal(deleted.snapshot.sharedSequenceDefinitions[0].id,beforeDelete.snapshot.sharedSequenceDefinitions[0].id);
for(const d of final.snapshot.sharedToyDefinitions){const before=beforeDelete.snapshot.sharedToyDefinitions.find(p=>p.id===d.id);assert.equal(d.bus,before.bus);}
const chordNames=['C','Am','F','G','C','Am','F','G','F','G','Am','C','C','Am','F','G'];
for(let bar=0;bar<16;bar++){
 const events=report.events.filter(e=>Math.floor(e.pitchDecision.eventTick/384)===bar);assert.ok(events.length);assert.equal(new Set(events.map(e=>e.toyId)).size,bar<4||bar>=12?1:bar<8?3:4);
 for(const e of events){assert.equal(e.pitchDecision.transpose,0);const c=e.pitchDecision.resolvedChord;if(e.pitchDecision.role==='percussion')assert.equal(c,null);else assert.equal(c.root+(c.quality==='minor'?'m':''),chordNames[bar]);if(e.pitchDecision.role==='accompaniment')assert.equal(e.soundDecision.volume,.2);}
}
assert.ok(report.relationships.some(r=>r.flashed.length===2&&r.paths===1));assert.deepEqual(report.errors.filter(e=>!e.includes('[BV]')),[]);
const summary={file,seedPreserved:true,sharedToyDefinitions:7,connectedToyViews:15,connectedPhraseViews:2,melodyChunksPerPhrase:4,orphanViews:0,bars:16,sectionLayers:[1,3,4,1],actualNoteEvents:report.events.length,editedChunkPreserved:true,volume:.2,firstViewDeletionPreservesDefinitionsAndAudio:true,regenerationAndReload:true,legacyLinksAbsentFromNewSaves:true};
writeFileSync(new URL('connected-linked-copies-browser-proof.json',dir),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
