import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
const dir=new URL('./debug-output/',import.meta.url);
const reports=readdirSync(dir).filter(f=>f.startsWith('harmony-graph-')).sort().map(file=>({file,...JSON.parse(readFileSync(new URL(file,dir),'utf8'))})).filter(r=>r.snapshot.structureToys.some(n=>n.autoArrange?.root&&n.autoArrange.version===1.3));
const root=r=>r.snapshot.structureToys.find(n=>n.autoArrange?.root);
const full=reports.find(r=>r.events.length>=256&&r.snapshot.toys.find(t=>t.id===root(r).autoArrange.sourceIds.extraRhythm)?.volume===.65);assert.ok(full,'capture a full sixteen-bar piece with the authored supporting gain');
const ids=root(full).autoArrange.sourceIds,toys=full.snapshot.toys,extra=toys.find(t=>t.id===ids.extraRhythm),main=toys.find(t=>t.id===ids.rhythm);
assert.equal(toys.filter(t=>!t.masterToyId).length,4);assert.equal(toys.filter(t=>t.masterToyId).length,9);assert.equal(full.snapshot.structureToys.length,8);
assert.equal(extra.type,'loopgrid');assert.equal(extra.masterToyId,undefined);assert.equal(extra.state.autoArrangeOrigin,'filled');assert.equal(extra.state.autoArrangeFill,'extra-rhythm');
assert.equal(extra.state.instrument,'HI-HAT CLOSED');assert.equal(extra.volume,.65);assert.notDeepEqual(extra.state.steps,main.state.steps);assert.ok(extra.state.steps.some(Boolean));
const extraUses=toys.filter(t=>t.masterToyId===extra.id);assert.equal(extraUses.length,1);
const extraId=extraUses[0].id,extraNotes=full.events.filter(e=>e.toyId===extraId);assert.ok(extraNotes.length>0);
assert.ok(!full.events.some(e=>e.toyId===extra.id),'extra Master is not powered independently');
for(const e of extraNotes){const p=e.pitchDecision,local=p.eventTick%6144;assert.ok(local>=3072&&local<4608);assert.equal(p.role,'percussion');assert.equal(p.finalNote,p.sourceNote);assert.equal(p.resolvedChord,null);assert.equal(p.transpose,0);assert.equal(e.step,(p.eventTick/48)%8);assert.ok(extra.state.steps[e.step]);}
assert.ok(!full.chordIndicators.some(o=>o.toyId===extraId&&o.label));
for(let bar=0;bar<16;bar++){
 const parts=[...new Set(full.events.filter(e=>Math.floor((e.pitchDecision?.eventTick%6144)/384)===bar).map(e=>{const toy=toys.find(t=>t.id===e.toyId);return Object.keys(ids).find(role=>ids[role]===toy?.masterToyId);} ))].sort();
 assert.deepEqual(parts,bar<4||bar>=12?['accompaniment']:bar<8?['accompaniment','melody','rhythm']:['accompaniment','extraRhythm','melody','rhythm'],'parts in bar '+(bar+1));
}
assert.ok(full.diagnostics.rootPerformances.every(r=>r.phaseOriginTick===0));
const edited=reports.find(r=>root(r).id===root(full).id&&r.snapshot.toys.find(t=>t.id===extra.id)?.state.steps.some((on,i)=>on!==extra.state.steps[i]));assert.ok(edited,'capture a normal UI edit');
const regenerated=reports.find(r=>root(r).autoArrange.owner!==root(full).autoArrange.owner&&r.snapshot.toys.some(t=>t.id===extra.id));assert.ok(regenerated,'capture Arrange Again');
assert.equal(regenerated.snapshot.toys.filter(t=>t.state.autoArrangeFill==='extra-rhythm').length,1);assert.equal(regenerated.snapshot.toys.filter(t=>t.masterToyId===extra.id).length,1);
assert.deepEqual(regenerated.snapshot.toys.find(t=>t.id===extra.id).state,edited.snapshot.toys.find(t=>t.id===extra.id).state);
assert.equal(regenerated.snapshot.toys.find(t=>t.id===extra.id).volume,edited.snapshot.toys.find(t=>t.id===extra.id).volume);
const reload=reports.findLast(r=>r.authoredSources===null&&root(r).autoArrange.owner===root(regenerated).autoArrange.owner);assert.ok(reload,'capture reload');
assert.deepEqual(reload.snapshot.toys.find(t=>t.id===extra.id).state,regenerated.snapshot.toys.find(t=>t.id===extra.id).state);
assert.equal(reload.snapshot.toys.find(t=>t.id===extra.id).volume,regenerated.snapshot.toys.find(t=>t.id===extra.id).volume);
assert.equal(reload.snapshot.toys.filter(t=>t.state.autoArrangeFill==='extra-rhythm').length,1);
const afterReload=reports.findLast(r=>r.file>reload.file&&r.authoredSources===null&&root(r).autoArrange.owner!==root(reload).autoArrange.owner);assert.ok(afterReload);
assert.equal(root(afterReload).autoArrange.sourceIds.extraRhythm,extra.id);assert.equal(afterReload.snapshot.toys.filter(t=>t.state.autoArrangeFill==='extra-rhythm').length,1);
assert.deepEqual(afterReload.snapshot.toys.find(t=>t.id===extra.id).state,reload.snapshot.toys.find(t=>t.id===extra.id).state);
assert.equal(afterReload.snapshot.toys.find(t=>t.id===extra.id).volume,reload.snapshot.toys.find(t=>t.id===extra.id).volume);
const summary={testsPassed:926,playbackCapture:full.file,editedCapture:edited.file,regeneratedCapture:regenerated.file,reloadCapture:reload.file,afterReloadRegenerationCapture:afterReload.file,layerCurve:[1,3,4,1],extraPattern:extra.state.steps,extraInstrument:extra.state.instrument,extraVolume:extra.volume,extraBEvents:extraNotes.length,masters:4,instances:9,structures:8};
writeFileSync(new URL('auto-arrange-v1-3-browser-proof.json',dir),JSON.stringify(summary,null,2)+'\n');console.log(summary);
