import test from 'node:test';
import assert from 'node:assert/strict';
import {createMelodyEvaluation,comparisonCycleTicks} from '../src/harmony-lab-evaluation.js';
import {createHarmonyLabModel,LAB_PRESETS,LAB_PROGRESSIONS} from '../src/harmony-lab-model.js';
const decision=(sourceNote,adaptedNote,eventTick,extra={})=>({part:'melody',mode:'follow',sourceNote,adaptedNote,eventTick,finalNote:adaptedNote,resolvedChord:{root:'C',quality:'major'},...extra});
test('Differences use signed harmony movement and kept notes count without Transpose contamination',()=>{
 const e=createMelodyEvaluation(),source=['F#4','G4','C4'];
 e.record(decision('F#4','F4',0),source);e.record(decision('G4','G4',96,{finalNote:'G5'}),source);e.record(decision('C4','D4',192),source);
 const v=e.inspect();assert.deepEqual(v.events.map(n=>[n.changed,n.movement]),[[true,-1],[false,0],[true,2]]);
 assert.equal(v.stats.played,3);assert.equal(v.stats.changed,2);assert.equal(v.stats.averageMovement,1.5);assert.equal(v.stats.largestMovement,2);assert.equal(v.stats.changeRate,200/3);
 assert.deepEqual(v.pass,['F4','G4','D4']);assert.deepEqual(source,['F#4','G4','C4']);
});
test('motif indicators count repeated relationships, interval directions and introduced leaps separately',()=>{
 const e=createMelodyEvaluation(),source=['C4','C4','D4','E4','F4'],adapted=['C4','C4','D4','C5','C5'];
 source.forEach((n,i)=>e.record(decision(n,adapted[i],i*96),source));
 const s=e.inspect().stats;assert.deepEqual([s.repeatedPreserved,s.repeatedTotal],[1,1]);assert.deepEqual([s.contourPreserved,s.contourTotal],[2,3]);assert.equal(s.newLeaps,1);
 assert.equal(e.inspect().latest.contour,'up → repeat');assert.equal(e.inspect().latest.previousAdaptedNote,'C5');
});
test('rests break relationships; Original supplies inspection without diluting Follow statistics; reset clears all',()=>{
 const e=createMelodyEvaluation(),source=['C4',null,'D4','D4'];
 e.record(decision('C4','C4',0),source);e.record(decision('D4','D4',192),source);e.record(decision('D4','E4',288),source);
 assert.equal(e.inspect().stats.repeatedTotal,1);assert.equal(e.inspect().stats.repeatedPreserved,0);assert.equal(e.inspect().stats.contourTotal,0);
 assert.deepEqual(e.inspect().pass,['C4','—','D4','E4']);
 e.record(decision('C4','C4',384,{mode:'original',resolvedChord:null}),source);
 assert.equal(e.inspect().stats.played,3);assert.equal(e.inspect().latest.mode,'original');
 e.reset();assert.equal(e.inspect().stats.played,0);assert.equal(e.inspect().latest,null);assert.deepEqual(e.inspect().pass,[]);
});
test('deterministic melody and progression presets share complete source/progression cycles',()=>{
 const m=createHarmonyLabModel();
 assert.equal(m.getState().soloPart,'melody');assert.match(LAB_PRESETS.C.name,/Repeated/);assert.match(LAB_PRESETS.D.name,/Chromatic/);
 assert.deepEqual(LAB_PROGRESSIONS.map(p=>p.label),['C | Am | F | G','C | F | G | C','Am | F | C | G','C | G | Am | F']);
 for(const id of Object.keys(LAB_PRESETS)){m.loadPreset(id);for(let i=0;i<4;i++){m.loadProgression(i);assert.equal(comparisonCycleTicks(m.getState()),1536);}}
});
