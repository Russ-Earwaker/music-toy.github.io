import test from 'node:test';
import assert from 'node:assert/strict';
import {createStructureRuntime} from '../src/structure-runtime.js';
import {DEFAULT_CHORDS,progressionDurationTicks,resolveChordAtTick} from '../src/chord-progression.js';
import {createConnectionModel} from '../src/connections.js';
import {createStructureToyModel} from '../src/structure-toys.js';
const toy=(durationTicks=384)=>({toyId:'source',durationTicks,entryId:'source-slot'});
const ref=structureId=>({structureId,entryId:structureId});
function setup(child=toy(),options={}) {
 const runtime=createStructureRuntime();runtime.defineModifier('chords','chord-progression',[child],0,options);
 runtime.startStructure('chords',0,{quantize:false});return runtime;
}
test('progression duration contract is independent of child duration, including empty material',()=>{
 assert.equal(progressionDurationTicks(DEFAULT_CHORDS,384),1536);
 assert.equal(progressionDurationTicks(DEFAULT_CHORDS,192),768);
 assert.equal(progressionDurationTicks(DEFAULT_CHORDS.slice(0,3),768),2304);
 const r=setup(toy(3072));assert.equal(r.getDefinition('chords').durationTicks,1536);
 r.defineModifier('empty','chord-progression',[]);assert.equal(r.getDefinition('empty').durationTicks,1536);
 const model=createConnectionModel(),structures=createStructureToyModel(model);
 try{const s=structures.createStandalone('chord-progression');assert.equal(structures.durationOf(s.id),1536);
 structures.setProgression(s.id,{chords:DEFAULT_CHORDS.slice(0,3),stepTicks:768});assert.equal(structures.durationOf(s.id),2304);
 const restored=createStructureToyModel(createConnectionModel());try{restored.restore(JSON.parse(JSON.stringify(structures.list())));assert.equal(restored.durationOf(s.id),2304);}finally{restored.dispose();}
 }finally{structures.dispose();}
});
for(const [length,starts,ends] of [[384,[0,384,768,1152],[384,768,1152,1536]],[768,[0,768],[768,1536]],[1152,[0,1152],[1152,1536]],[3072,[0],[1536]]])test('child length '+length+' fills exactly one section without changing source tempo',()=>{
 const child=toy(length),before=JSON.stringify(child),r=setup(child),turns=r.turnsInWindow('chords',0,10000);
 assert.deepEqual(turns.map(t=>t.startTick),starts);assert.deepEqual(turns.map(t=>t.endTick),ends);
 assert.ok(turns.every(t=>t.durationTicks===length));assert.equal(new Set(turns.map(t=>t.occurrenceId)).size,turns.length);
 assert.ok(turns.every(t=>t.toyId==='source'&&t.context.harmony.originTick===0));assert.equal(JSON.stringify(child),before);
 assert.deepEqual(r.turnsInWindow('chords',1536,10000),[]);
});
test('two-bar occurrences resolve each event across chord boundaries',()=>{
 const r=setup(toy(768)),turns=r.turnsInWindow('chords',0,1536);
 assert.deepEqual([0,384,768,1152].map(t=>resolveChordAtTick(turns.find(n=>n.startTick<=t&&n.endTick>t).context,t).root),['C','A','F','G']);
});
for(const type of ['sequence','timeline','together'])test('refills the whole '+type+' subtree, including offsets and silence',()=>{
 const r=createStructureRuntime();r.defineStructure('material',type,[{toyId:'A',durationTicks:384,entryId:'a',offsetTick:0},{toyId:'B',durationTicks:384,entryId:'b',offsetTick:192}]);
 r.defineModifier('chords','chord-progression',[ref('material')]);r.startStructure('chords',0,{quantize:false});
 const turns=r.turnsInWindow('chords',0,4000),length=r.getDefinition('material').durationTicks;
 assert.equal(turns.filter(t=>t.toyId==='A').length,Math.ceil(1536/length));assert.ok(turns.every(t=>t.endTick<=1536));
 assert.equal(new Set(turns.map(t=>t.id)).size,turns.length);assert.ok(turns.every(t=>t.context.harmony.originTick===0));
 if(type==='timeline')assert.deepEqual(turns.filter(t=>t.toyId==='B').map(t=>t.startTick),[192,768,1344]);
});
test('Repeat outside repeats whole progressions; an old inner Repeat remains bounded',()=>{
 const r=setup();r.defineStructure('twice','repeat',[ref('chords')],0,{count:2});r.startStructure('twice',0,{quantize:false});
 const turns=r.turnsInWindow('twice',0,10000);assert.equal(turns.length,8);assert.deepEqual(turns.map(t=>resolveChordAtTick(t.context,t.startTick).root),['C','A','F','G','C','A','F','G']);
 assert.deepEqual(turns.map(t=>t.context.harmony.originTick),[0,0,0,0,1536,1536,1536,1536]);assert.equal(r.getDefinition('twice').durationTicks,3072);
 r.defineStructure('old-repeat','repeat',[toy()],0,{count:8});r.defineModifier('old-chords','chord-progression',[ref('old-repeat')]);r.startStructure('old-chords',0,{quantize:false});
 assert.equal(r.getDefinition('old-repeat').count,8);assert.equal(r.turnsInWindow('old-chords',0,10000).length,4);
});
test('live edits preserve origin and current occurrence identity while updating future boundaries',()=>{
 const r=setup(),instance=r.getInstance('chords'),before=r.turnsInWindow('chords',384,385)[0];r.commitThrough('chords',480);
 r.defineModifier('chords','chord-progression',[toy()],480,{chords:[DEFAULT_CHORDS[0],DEFAULT_CHORDS[2],DEFAULT_CHORDS[1],DEFAULT_CHORDS[3]],stepTicks:768});
 const after=r.turnsInWindow('chords',480,481)[0];assert.equal(after.id,before.id);assert.equal(after.context.harmony.originTick,0);assert.equal(r.getInstance('chords'),instance);
 assert.equal(r.getDefinition('chords').durationTicks,3072);assert.equal(r.turnsInWindow('chords',0,4000).at(-1).endTick,3072);
 r.defineModifier('chords','chord-progression',[toy()],600,{chords:[DEFAULT_CHORDS[0],DEFAULT_CHORDS[1],DEFAULT_CHORDS[2]],stepTicks:192});
 assert.equal(r.getDefinition('chords').durationTicks,576);assert.deepEqual(r.turnsInWindow('chords',600,4000),[]);
 assert.equal(r.getInstance('chords'),instance);assert.equal(instance.startTick,0);assert.equal(instance.generation,0);
 assert.equal(before.context.harmony.stepTicks,384,'already committed context stays immutable');
});
