import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ensureMasterName,nextInstanceNumber,migrateSourceUses,attachInstancePlayback,validateInstanceLinks} from '../src/toy-instances.js';
import {withPlaybackOccurrence,getCurrentPlaybackOccurrence} from '../src/playback-context.js';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createStructureToyModel} from '../src/structure-toys.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {createSequencerScheduler} from '../src/note-scheduler.js';
import {ensurePlaybackInstance,clearPlaybackInstancesForTests} from '../src/playback-instances.js';

test('neutral family names ignore role/instrument and retain authored names',()=>{
 const a={id:'a',dataset:{toy:'drawgrid',musicalRole:'accompaniment',instrument:'bass'}},b={id:'b',dataset:{toy:'drawgrid',musicalRole:'melody'}};
 assert.equal(ensureMasterName(a,[a,b]),'Draw 1');assert.equal(ensureMasterName(b,[a,b]),'Draw 2');
 a.dataset.instrument='PIANO';a.dataset.musicalRole='melody';assert.equal(ensureMasterName(a,[a,b]),'Draw 1');
 a.dataset.toyName='My Guitar';assert.equal(ensureMasterName(a,[a,b]),'My Guitar');
 assert.equal(ensureMasterName({dataset:{toy:'loopgrid'}},[]),'Rhythm 1');
});
test('Instance suffixes remain unique after deletion and reload without renumbering',()=>{
 const master={id:'a',dataset:{}},panels=[];assert.equal(nextInstanceNumber(master,panels),1);
 panels.push({dataset:{masterToyId:'a',instanceNumber:'1'}});assert.equal(nextInstanceNumber(master,panels),2);
 panels.length=0;assert.equal(nextInstanceNumber(master,panels),3);
 const restored=structuredClone(master);assert.equal(nextInstanceNumber(restored,panels),4);
});
const oldScene=()=>({toys:[{id:'master',type:'drawgrid',state:{notes:['C3','E3'],instrument:'PIANO',musicalRole:'bass'},ui:{left:'10px'}}],structureToys:[{id:'A',x:600,y:0,autoArrange:{owner:'arrangement:1'}},{id:'B',x:600,y:400}],connections:[{id:'use1',kind:'sequence',from:{objectId:'A',portId:'child:0'},to:{objectId:'master',portId:'pattern'}},{id:'use2',kind:'sequence',from:{objectId:'B',portId:'child:0'},to:{objectId:'master',portId:'pattern'}}]});
test('legacy uses migrate once into distinct ordinary Instances without copying Master data',()=>{
 const old=oldScene(),before=structuredClone(old),snap=migrateSourceUses(old);
 assert.deepEqual(old,before);assert.equal(snap.toys.length,3);assert.deepEqual(snap.toys[0].state,old.toys[0].state);
 const instances=snap.toys.filter(t=>t.masterToyId);assert.deepEqual(instances.map(t=>t.instanceNumber),[1,2]);assert.ok(instances.every(t=>t.masterToyId==='master'&&Object.keys(t.state).length===0));
 assert.equal(instances[0].autoArrangeOwner,'arrangement:1');assert.equal(instances[1].autoArrangeOwner,undefined);
 assert.ok(snap.connections.every(c=>c.to.portId==='input'));assert.equal(new Set(snap.connections.map(c=>c.to.objectId)).size,2);
 assert.equal(migrateSourceUses(snap),snap);assert.deepEqual(JSON.parse(JSON.stringify(snap)),snap);
});
test('migration rejects missing sources instead of silently orphaning Instances',()=>{
 const snap=oldScene();snap.toys=[];assert.throws(()=>migrateSourceUses(snap),/Missing Master/);
});
test('scene validation rejects orphan links, linked Masters and duplicate suffixes before restore',()=>{
 const snap=migrateSourceUses(oldScene());assert.equal(validateInstanceLinks(snap),snap);
 snap.toys[2].instanceNumber=1;assert.throws(()=>validateInstanceLinks(snap),/number/);
 snap.toys[2].instanceNumber=2;snap.toys[0].masterToyId='missing';assert.throws(()=>validateInstanceLinks(snap),/Master/);
});
test('Instance scheduling reads live source and restores occurrence scope without source mutation',()=>{
 const master={id:'master',__seqRev:1,__seqPattern:{notes:['C3']},__sequencerSchedule:()=>({note:master.__seqPattern.notes[0],occurrence:getCurrentPlaybackOccurrence()})};
 const a={id:'a'},b={id:'b'};attachInstancePlayback(a,master);attachInstancePlayback(b,master);
 const source=structuredClone(master.__seqPattern);
 const result=withPlaybackOccurrence({occurrenceId:'turn:a',generation:0,context:{transposeSemitones:5}},()=>a.__sequencerSchedule(0,1));
 assert.equal(result.note,'C3');assert.equal(result.occurrence.instanceToyId,'a');assert.equal(result.occurrence.masterToyId,'master');assert.equal(result.occurrence.context.transposeSemitones,5);assert.equal(getCurrentPlaybackOccurrence(),null);
 assert.deepEqual(master.__seqPattern,source);master.__seqPattern={notes:['D3']};master.__seqRev++;
 assert.equal(a.__seqRev,2);assert.equal(b.__seqPattern,master.__seqPattern);assert.equal(b.__sequencerSchedule(0,2).note,'D3');
});
test('simultaneous Instances have separate production turns and future edits affect both',()=>{
 clearPlaybackInstancesForTests();const calls=[],master={id:'master',__seqRev:1,__seqPattern:{notes:['C3']},__sequencerSchedule:()=>calls.push({note:master.__seqPattern.notes[0],...getCurrentPlaybackOccurrence()})};
 const model=createConnectionModel();model.registerObject('H',{ports:HEARTBEAT_PORTS,transportId:'main'});
 const panels=['a','b'].map(id=>{const p={id,dataset:{toy:'drawgrid',steps:'8'},__sequencerStep(){}};attachInstancePlayback(p,master);model.registerObject(id);ensurePlaybackInstance(id,{loopLengthTicks:384});return p;});
 const structures=createStructureToyModel(model),together=structures.createStandalone('together');model.connect('transport',{objectId:'H',portId:'output'},{objectId:together.id,portId:'input'});
 panels.forEach((p,i)=>model.connect('sequence',{objectId:together.id,portId:'child:'+i},{objectId:p.id,portId:'input'}));
 const adapter=createChainSequenceAdapter({connectionModel:model,getToy:id=>panels.find(p=>p.id===id),chainState:new Map()}),scheduler=createSequencerScheduler();
 const sync=()=>adapter.sync(panels,{state:'paused',currentTick:0},{connections:model.list('sequence'),structures:structures.list()});sync();
 const schedule=(from,to)=>scheduler.tick({currentTick:from,lookaheadEndTick:to,playbackTurns:adapter.turnsForLookahead(from,to),getToy:id=>panels.find(p=>p.id===id),tickToAudioTime:t=>t/192});schedule(0,96);
 assert.deepEqual(calls.map(c=>c.instanceToyId).sort(),['a','a','b','b']);assert.equal(new Set(calls.map(c=>c.occurrenceId)).size,2);
 master.__seqPattern.notes[0]='E3';master.__seqRev++;schedule(96,144);assert.deepEqual(calls.slice(-2).map(c=>c.note),['E3','E3']);
 model.removeObject('a');sync();assert.ok(model.getObject('b'));assert.ok(adapter.turnsForLookahead(144,192).every(t=>t.toyId==='b'));
 scheduler.dispose();adapter.reset();structures.dispose();
});
test('Instance persistence stores links only and source edit controls stay on Masters',()=>{
 const persistence=readFileSync(new URL('../src/persistence.js',import.meta.url),'utf8'),view=readFileSync(new URL('../src/connection-view.js',import.meta.url),'utf8');
 assert.match(persistence,/if\(panel.dataset.masterToyId\)return .*state:\{\}/);assert.ok(!view.includes('source-use'));assert.ok(!view.includes('Use existing toy'));
});
