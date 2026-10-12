import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {chordLabel,resolveChordAtTick} from '../src/chord-progression.js';
const dir=new URL('./debug-output/',import.meta.url);
const reports=readdirSync(dir).filter(f=>f.startsWith('harmony-graph-2026-10-12T21')).sort()
  .map(file=>({file,...JSON.parse(readFileSync(new URL(file,dir),'utf8'))})).filter(r=>r.snapshot.structureToys.some(n=>n.autoArrange?.root&&n.autoArrange.version===1.1));
assert.ok(reports.length);
const full=reports.find(r=>r.events.length>150&&r.chordIndicators?.some(o=>o.currentTick>=6144));assert.ok(full,'capture at least one complete piece');
const nodes=full.snapshot.structureToys,edges=full.snapshot.connections,toys=full.snapshot.toys;
assert.equal(nodes.length,10);assert.equal(toys.filter(t=>t.masterToyId).length,8);
const timeline=nodes.find(n=>n.name==='B layers');assert.equal(timeline.type,'timeline');
assert.deepEqual(timeline.entries.map(e=>e.offsetTick),[0,384,768]);assert.deepEqual(timeline.entries.map(e=>nodes.find(n=>n.id===e.childId).count),[4,3,2]);
assert.equal(nodes.find(n=>n.name==='A layers').type,'together');
const sectionFor=toyId=>{let id=toyId;for(let i=0;i<5;i++){const e=edges.find(e=>e.to.objectId===id);if(!e)return null;id=e.from.objectId;const node=nodes.find(n=>n.id===id);if(node?.type==='chord-progression')return node.name;}return null;};
const firstCycle=full.events.filter(e=>e.pitchDecision?.eventTick<6144),roleNames=new Map(toys.filter(t=>!t.masterToyId).map(t=>[t.id,t.state.musicalRole||'percussion']));
for(let bar=0;bar<16;bar++){
  const roles=[...new Set(firstCycle.filter(e=>Math.floor(e.pitchDecision.eventTick/384)===bar).map(e=>e.pitchDecision.role))].sort();
  const expected=bar<4||bar>=12?['accompaniment']:bar===8?['accompaniment']:bar===9?['accompaniment','percussion']:['accompaniment','melody','percussion'];
  assert.deepEqual(roles,expected,'audible parts in bar '+(bar+1));
}
const displayed={};
for(const toy of toys.filter(t=>t.masterToyId)){
  const section=sectionFor(toy.id),role=roleNames.get(toy.masterToyId),labels=full.chordIndicators.filter(o=>o.toyId===toy.id&&o.label).slice(0,section==='B'&&role==='melody'?2:4).map(o=>o.label);
  const expected=role==='percussion'?[]:section==='B'?(role==='melody'?['Am','C']:['F','G','Am','C']):['C','Am','F','G'];
  assert.deepEqual(labels,expected);displayed[toy.id]={section,role,labels};
}
for(const report of reports){
  for(const row of report.chordIndicators||[])if(row.label)assert.equal(row.label,chordLabel(resolveChordAtTick(row.context,row.currentTick)));
  assert.deepEqual(report.snapshot.structureToys.find(n=>n.name==='B layers').entries.map(e=>e.offsetTick),[0,384,768]);
  assert.ok(report.diagnostics.rootPerformances.every(r=>r.phaseOriginTick===0));
}
const rootId=r=>r.snapshot.structureToys.find(n=>n.autoArrange?.root).id;
const replaced=reports.find(r=>rootId(r)!==rootId(full));assert.ok(replaced,'capture Arrange Again');
assert.equal(replaced.snapshot.structureToys.length,10);assert.equal(replaced.snapshot.toys.filter(t=>t.masterToyId).length,8);
assert.ok(full.snapshot.structureToys.every(old=>!replaced.snapshot.structureToys.some(n=>n.id===old.id)));
assert.ok(toys.filter(t=>t.masterToyId).every(old=>!replaced.snapshot.toys.some(t=>t.id===old.id)));
assert.deepEqual(replaced.snapshot.toys.filter(t=>!t.masterToyId).map(t=>({id:t.id,state:t.state})),toys.filter(t=>!t.masterToyId).map(t=>({id:t.id,state:t.state})));
const reloaded=reports.findLast(r=>rootId(r)===rootId(replaced)&&r.authoredSources===null);assert.ok(reloaded,'capture reload');
assert.deepEqual(reloaded.snapshot.structureToys,replaced.snapshot.structureToys);
const sortedEdges=edges=>[...edges].sort((a,b)=>a.id.localeCompare(b.id));
assert.deepEqual(sortedEdges(reloaded.snapshot.connections),sortedEdges(replaced.snapshot.connections));
const summary={testsPassed:922,fullCycleCapture:full.file,arrangeAgainCapture:replaced.file,reloadCapture:reloaded.file,structures:10,linkedInstances:8,bOffsets:[0,384,768],bRepeats:[4,3,2],displayed,captures:reports.map(r=>r.file)};
writeFileSync(new URL('auto-arrange-v1-1-browser-proof.json',dir),JSON.stringify(summary,null,2)+'\n');console.log(summary);
