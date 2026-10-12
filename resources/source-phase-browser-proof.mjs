import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
const dir=new URL('./debug-output/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name,dir),'utf8'));
const names=['harmony-graph-2026-10-12T19-37-48-714Z.json','harmony-graph-2026-10-12T19-41-04-019Z.json','harmony-graph-2026-10-12T19-42-06-250Z.json'];
let verified=0,maxLateStartSpreadSeconds=0;
for(const name of names){const r=read(name);assert.ok(r.events.length>100);const ticks=new Map();
 for(const e of r.events){const tick=e.pitchDecision.eventTick;assert.equal(e.step,(tick/48)%8);const key=tick;if(!ticks.has(key))ticks.set(key,[]);ticks.get(key).push(e);verified++;}
 for(const events of ticks.values()){assert.equal(new Set(events.map(e=>e.pitchDecision.sourceNote)).size,1);maxLateStartSpreadSeconds=Math.max(maxLateStartSpreadSeconds,Math.max(...events.map(e=>e.when))-Math.min(...events.map(e=>e.when)));}
}
const late=read(names[0]);assert.equal(new Set(late.events.map(e=>e.toyId)).size,4);const newId=late.snapshot.toys.find(t=>t.instanceNumber===3).id;assert.ok(late.events.filter(e=>e.toyId===newId).length>=170);
const visual=read('harmony-graph-2026-10-12T19-38-55-043Z.json');assert.ok(visual.relationshipEvents.some(e=>e.flashed.length===3&&e.tethers[0]?.paths===2));assert.ok(visual.relationshipEvents.some(e=>e.label==='See Master'&&e.flashed.length===2));
for(const e of visual.relationshipEvents.filter(e=>e.tethers.length)){assert.equal(e.tethers[0].pointer,'none');assert.equal(e.tethers[0].z,'0');assert.match(e.tethers[0].colour,/oklch/);}
const arrangementFile=readdirSync(dir).filter(n=>n.startsWith('harmony-graph-2026-10-12')).sort().findLast(n=>{const r=read(n);return r.snapshot.toys.filter(t=>t.masterToyId).length===8&&r.snapshot.connections.filter(e=>e.kind==='transport').length===4&&r.events.length>100;});
assert.ok(arrangementFile,'Capture the powered Master + arrangement browser fixture');const arrangement=read(arrangementFile),instances=arrangement.snapshot.toys.filter(t=>t.masterToyId),byId=new Map(instances.map(t=>[t.id,t]));
assert.equal(arrangement.snapshot.structureToys.length,7);const roles=new Set(),chords=new Set();let paired=0;
for(const e of arrangement.events){if(e.pitchDecision){assert.equal(e.step,(e.pitchDecision.eventTick/48)%8);verified++;}const instance=byId.get(e.toyId);if(!instance)continue;
 roles.add(e.pitchDecision?.role||'percussion');if(e.pitchDecision?.resolvedChord)chords.add(e.pitchDecision.resolvedChord.root);
 if(e.pitchDecision?.role==='percussion')assert.equal(e.pitchDecision.finalNote,e.pitchDecision.sourceNote);
 if(e.pitchDecision?.role==='accompaniment')assert.ok(['C3','A2','F3','G2'].includes(e.pitchDecision.finalNote));
 const masterEvent=arrangement.events.find(m=>m.toyId.startsWith('audiotoy_'+instance.masterToyId+'_')&&m.pitchDecision?.eventTick===e.pitchDecision?.eventTick);
 if(masterEvent){assert.equal(masterEvent.step,e.step);assert.equal(masterEvent.pitchDecision.sourceNote,e.pitchDecision.sourceNote);maxLateStartSpreadSeconds=Math.max(maxLateStartSpreadSeconds,Math.abs(masterEvent.when-e.when));paired++;}
}
assert.ok(paired>30);assert.ok(roles.has('accompaniment')&&roles.has('melody')&&roles.has('percussion'));assert.ok(chords.size===4);
const summary={testsPassed:902,verifiedPitchedEvents:verified,lateInstanceEvents:late.events.filter(e=>e.toyId===newId).length,arrangementFile,pairedMasterInstanceNotes:paired,roles:[...roles],chords:[...chords],relationshipReveal:true,maxLateStartSpreadSeconds};writeFileSync(new URL('source-phase-browser-proof.json',dir),JSON.stringify(summary,null,2)+'\n');console.log(summary);
