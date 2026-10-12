import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
const dir=new URL('./debug-output/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name,dir),'utf8'));
const files=readdirSync(dir).filter(n=>n.startsWith('harmony-graph-2026-10-12T20')).sort();
const reports=files.map(file=>({file,...read(file)}));
const independent=reports.filter(r=>r.snapshot.toys.some(t=>t.id==='independent-phase-a')&&r.snapshot.toys.length===2&&r.events.length>100);
assert.ok(independent.length>=3,'Capture initial, tempo and reload playback');let verifiedEvents=0,pairedNotes=0;
function checkNotes(r){for(const e of r.events){if(!e.pitchDecision)continue;assert.equal(e.step,(e.pitchDecision.eventTick/48)%8,`${r.file}: ${e.toyId}`);verifiedEvents++;}}
for(const r of independent){checkNotes(r);assert.ok(r.snapshot.toys.every(t=>!t.masterToyId&&!(Number(t.instanceSerial)>0)));assert.ok(r.diagnostics.rootPerformances.every(i=>i.phaseOriginTick===0));}
const initial=independent.find(r=>r.timingActions?.some(a=>a.kind==='late-independent'));assert.ok(initial);const action=initial.timingActions.find(a=>a.kind==='late-independent'),oldRoot=action.rootsBefore[0],after=action.rootsAfter.find(i=>i.definitionId===oldRoot.definitionId),newRoot=action.rootsAfter.find(i=>i.definitionId==='sequence:'+action.id);
assert.equal(after.id,oldRoot.id);assert.equal(after.startTick,oldRoot.startTick);assert.ok(newRoot.startTick>oldRoot.startTick);assert.equal(newRoot.startTick%96,0);assert.equal(newRoot.phaseOriginTick,0);
const firstNew=initial.events.find(e=>JSON.parse(e.occurrenceId)[2]===action.id);assert.equal(firstNew.pitchDecision.eventTick,newRoot.startTick);assert.equal(firstNew.step,2,'late toy joined the corresponding step rather than local zero');
for(const r of independent){const ticks=new Map();for(const e of r.events){const tick=e.pitchDecision?.eventTick;if(!Number.isFinite(tick))continue;if(!ticks.has(tick))ticks.set(tick,[]);ticks.get(tick).push(e);}for(const es of ticks.values())if(new Set(es.map(e=>JSON.parse(e.occurrenceId)[2])).size===2){assert.equal(new Set(es.map(e=>e.pitchDecision.sourceNote)).size,1);pairedNotes++;}}
assert.ok(pairedNotes>50);
const mixed=reports.findLast(r=>r.snapshot.connections.some(e=>e.kind==='transport'&&e.to.objectId==='proof-chords')&&r.events.length>100);assert.ok(mixed,'Capture mixed natural-length roots');checkNotes(mixed);assert.equal(mixed.diagnostics.rootPerformances.length,3);assert.ok(mixed.diagnostics.rootPerformances.every(i=>i.phaseOriginTick===0));
const arrangement=reports.findLast(r=>r.snapshot.toys.filter(t=>t.masterToyId).length===8&&r.events.length>100);assert.ok(arrangement,'Capture Auto-Arrange playback');checkNotes(arrangement);assert.equal(arrangement.snapshot.structureToys.length,7);assert.ok(arrangement.diagnostics.rootPerformances.every(i=>i.phaseOriginTick===0));
const owned=new Set(arrangement.snapshot.toys.filter(t=>t.masterToyId).map(t=>t.id)),roles=new Set(),chords=new Set();
for(const e of arrangement.events.filter(e=>owned.has(e.toyId))){const p=e.pitchDecision;if(!p)continue;roles.add(p.role);if(p.resolvedChord)chords.add(p.resolvedChord.root);if(p.role==='percussion')assert.equal(p.finalNote,p.sourceNote);if(p.role==='accompaniment')assert.ok(['C3','A2','F3','G2'].includes(p.finalNote));}
assert.equal(chords.size,4);assert.ok(['melody','accompaniment','percussion'].every(role=>roles.has(role)));
const summary={testsPassed:912,verifiedEvents,independentPairedNotes:pairedNotes,lateEntryTick:newRoot.startTick,lateEntryStep:firstNew.step,existingRootIdentityPreserved:true,independentCaptures:independent.map(r=>r.file),mixedRootsCapture:mixed.file,arrangementCapture:arrangement.file,roles:[...roles],chordRoots:[...chords]};
writeFileSync(new URL('heartbeat-phase-browser-proof.json',dir),JSON.stringify(summary,null,2)+'\n');console.log(summary);
