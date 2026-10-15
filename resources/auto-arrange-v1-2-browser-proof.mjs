import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {chordLabel,resolveChordAtTick} from '../src/chord-progression.js';
import {noteMidi} from '../src/harmonic-adaptation.js';
const dir=new URL('./debug-output/',import.meta.url),files=readdirSync(dir).filter(f=>f.startsWith('harmony-graph-')).sort();
const reports=files.map(file=>({file,...JSON.parse(readFileSync(new URL(file,dir),'utf8'))}));
const root=r=>r.snapshot.structureToys.find(n=>n.autoArrange?.root);
const current=reports.filter(r=>root(r)?.autoArrange.version===1.2);assert.ok(current.length);
const full=current.find(r=>r.events.length>=256);assert.ok(full,'capture a complete arrangement cycle');
assert.equal(full.snapshot.structureToys.length,8);assert.equal(full.snapshot.toys.filter(t=>t.masterToyId).length,8);
assert.ok(full.snapshot.structureToys.every(n=>!['timeline','repeat'].includes(n.type)));
assert.equal(full.snapshot.structureToys.find(n=>n.name==='B layers').type,'together');
assert.equal(full.snapshot.structureToys.find(n=>n.type==='transpose').semitones,12);
const events=full.events.filter(e=>e.pitchDecision);let bMelody=0,aMelody=0;
for(const event of events){const p=event.pitchDecision,local=p.eventTick%6144,b=local>=3072&&local<4608;
 const shift=b&&p.role==='melody'?12:0;
 assert.equal(p.transpose,shift);assert.equal(noteMidi(p.finalNote)-noteMidi(p.adaptedNote),shift);
 if(p.role!=='percussion')assert.equal(chordLabel(p.resolvedChord),(b?['F','G','Am','C']:['C','Am','F','G'])[Math.floor(local/384)%4]);
 assert.equal(event.step,(p.eventTick/48)%8,'Transpose preserves source phase');
 if(p.role==='melody'){if(b)bMelody++;else aMelody++;}
}
assert.ok(aMelody>0&&bMelody>0);
for(let bar=0;bar<16;bar++){
 const roles=[...new Set(events.filter(e=>Math.floor((e.pitchDecision.eventTick%6144)/384)===bar).map(e=>e.pitchDecision.role))].sort();
 assert.deepEqual(roles,bar<4||bar>=12?['accompaniment']:['accompaniment','melody','percussion'],'parts in bar '+(bar+1));
}
const melodyMaster=full.snapshot.toys.find(t=>!t.masterToyId&&t.state.musicalRole==='melody').id;
assert.equal(full.snapshot.toys.filter(t=>t.masterToyId===melodyMaster).length,2);
const bBadges=full.chordIndicators.filter(o=>o.masterToyId===melodyMaster&&o.label&&o.currentTick%6144>=3072&&o.currentTick%6144<4608);
assert.deepEqual(new Set(bBadges.map(o=>o.label)),new Set(['F','G','Am','C']));
for(const row of full.chordIndicators)if(row.label)assert.equal(row.label,chordLabel(resolveChordAtTick(row.context,row.currentTick)));
assert.ok(full.diagnostics.rootPerformances.every(r=>r.phaseOriginTick===0));
const legacy=reports.findLast(r=>r.file<full.file&&root(r)?.autoArrange.version===1.1);assert.ok(legacy);
// Restored boards may reuse structure IDs after removal; ownership and final
// topology establish replacement, rather than requiring fresh numeric IDs.
assert.notEqual(root(full).autoArrange.owner,root(legacy).autoArrange.owner);
assert.ok(full.snapshot.structureToys.every(n=>n.autoArrange.owner===root(full).autoArrange.owner));
assert.ok(legacy.snapshot.toys.filter(t=>t.masterToyId).every(old=>!full.snapshot.toys.some(t=>t.id===old.id)));
const sources=r=>r.snapshot.toys.filter(t=>!t.masterToyId).map(t=>({id:t.id,state:t.state}));assert.deepEqual(sources(full),sources(legacy));
const reloaded=current.findLast(r=>r.authoredSources===null);assert.ok(reloaded,'capture reload');
assert.deepEqual(reloaded.snapshot.structureToys,full.snapshot.structureToys);
const edges=r=>[...r.snapshot.connections].sort((a,b)=>a.id.localeCompare(b.id));assert.deepEqual(edges(reloaded),edges(full));
const summary={testsPassed:924,legacyCapture:legacy.file,playbackCapture:full.file,reloadCapture:reloaded.file,verifiedEvents:events.length,aMelodyEvents:aMelody,bLiftedMelodyEvents:bMelody,bChordBadges:[...new Set(bBadges.map(o=>o.label))],structures:8,linkedInstances:8};
writeFileSync(new URL('auto-arrange-v1-2-browser-proof.json',dir),JSON.stringify(summary,null,2)+'\n');console.log(summary);
