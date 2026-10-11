import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeToyMusicalRole,restoreToyMusicalRole,setToyMusicalRole} from '../src/musical-role.js';
import {applyToyInstrument,readToySoundState,restoreToySoundState} from '../src/instrument-state.js';
import {classifyMusicalRole,resolveMusicalPitch} from '../src/harmonic-adaptation.js';
import {restoreToyLocalTranspose} from '../src/toy-local-transpose.js';
import {createDgStateIo} from '../src/drawgrid/dg-state-io.js';
const panel=toy=>({dataset:{toy},dispatchEvent(){}});
const role=p=>classifyMusicalRole({toyType:p.dataset.toy,instrument:p.dataset.instrument,options:{toyMusicalRole:p.dataset.musicalRole}});
test('new source defaults and DrawGrid role selection',()=>{
 const d=panel('drawgrid'),r=panel('loopgrid');initializeToyMusicalRole(d);initializeToyMusicalRole(r);
 assert.equal(d.dataset.musicalRole,'melody');assert.equal(r.dataset.musicalRole,'percussion');
 assert.equal(setToyMusicalRole(d,'accompaniment'),true);assert.equal(role(d),'accompaniment');
 assert.equal(setToyMusicalRole(d,'percussion'),false);assert.equal(setToyMusicalRole(r,'melody'),false);
});
test('explicit source role survives instrument switches and sound-state copy/reload',()=>{
 const d=panel('drawgrid');initializeToyMusicalRole(d);setToyMusicalRole(d,'accompaniment');
 for(const instrument of ['RETRO TRIANGLE','PIANO']){applyToyInstrument(d,{value:instrument,octave:3,pitchShift:true});assert.equal(role(d),'accompaniment');}
 const saved=JSON.parse(JSON.stringify(readToySoundState(d))),copy=panel('drawgrid');restoreToySoundState(copy,saved);
 assert.deepEqual(readToySoundState(copy),saved);assert.equal(role(copy),'accompaniment');
 setToyMusicalRole(copy,'melody');applyToyInstrument(copy,'BASS GUITAR SLAP');assert.equal(role(copy),'melody');
});
test('legacy restoration retains centralized inference until explicitly authored',()=>{
 const d=panel('drawgrid');initializeToyMusicalRole(d);restoreToySoundState(d,{instrument:'BASS GUITAR SLAP'});initializeToyMusicalRole(d);
 assert.equal(d.dataset.musicalRole,undefined);assert.equal(role(d),'accompaniment');assert.equal(readToySoundState(d).musicalRole,'accompaniment');
 setToyMusicalRole(d,'melody');assert.equal(role(d),'melody');
 const r=panel('loopgrid');restoreToyMusicalRole(r,{});assert.equal(role(r),'percussion');
});
test('real graph fixture owns roles on two DrawGrids and Simple Rhythm, without Drum Kit',async()=>{
 const scene=JSON.parse(await readFile(new URL('../resources/harmony-integration.scene.json',import.meta.url)));
 assert.deepEqual(scene.payload.toys.map(t=>[t.type,t.state.musicalRole]),[['drawgrid','accompaniment'],['drawgrid','melody'],['loopgrid','percussion']]);
 assert.deepEqual(scene.payload.structureToys.map(t=>t.type),['chord-progression','together']);
});

test('authored Bass and Melody select different harmony decisions independently of timbre',()=>{
 const harmony={originTick:0,stepTicks:384,chords:[{root:'C',quality:'major'},{root:'A',quality:'minor'},{root:'F',quality:'major'},{root:'G',quality:'major'}]};
 for(const [authored,instrument,expected] of [['accompaniment','PIANO',['C3','A2','F3','G2']],['melody','BASS GUITAR SLAP',['C3','C3','C3','C3']],['percussion','PIANO',['C3','C3','C3','C3']]]){
  const p=panel(authored==='percussion'?'loopgrid':'drawgrid');Object.assign(p.dataset,{musicalRole:authored,instrument});
  assert.deepEqual([0,384,768,1152].map(eventTick=>resolveMusicalPitch({sourcePitch:'C3',eventTick,context:{harmony},role:role(p)}).finalNote),expected);
 }
});

test('legacy bass migrates to Accompaniment and percussion cannot inherit a pitched role',()=>{
 const d=panel('drawgrid');restoreToySoundState(d,{instrument:'PIANO',musicalRole:'bass',localTranspose:3});
 assert.equal(d.dataset.musicalRole,'accompaniment');assert.equal(role(d),'accompaniment');
 const saved=createDgStateIo({state:{panel:d,cols:8}}).captureState();
 assert.equal(saved.musicalRole,'accompaniment');assert.equal(saved.localTranspose,3);
 const duplicate=panel('drawgrid');restoreToySoundState(duplicate,JSON.parse(JSON.stringify(saved)));
 assert.equal(duplicate.dataset.musicalRole,'accompaniment');assert.equal(duplicate.dataset.localTranspose,'3');
 restoreToySoundState(duplicate,{instrument:'PIANO',musicalRole:'bass'});
 assert.equal(duplicate.dataset.localTranspose,'0','older scenes without a local offset must not inherit one');
 const r=panel('loopgrid');restoreToySoundState(r,{musicalRole:'bass',localTranspose:12});assert.equal(r.dataset.musicalRole,'percussion');assert.equal(r.dataset.localTranspose,undefined);
});

test('local transpose composes after harmony with graph transpose without changing source or context',()=>{
 const source={note:'C3'},context={transposeSemitones:5,harmony:{originTick:0,stepTicks:384,chords:[{root:'A',quality:'minor'}]}};
 const before=JSON.stringify([source,context]);
 const result=resolveMusicalPitch({sourcePitch:source.note,eventTick:0,context,role:'accompaniment',localTranspose:3});
 assert.deepEqual([result.adaptedNote,result.localTranspose,result.graphTranspose,result.transpose,result.finalNote],['A2',3,5,8,'F3']);
 assert.equal(JSON.stringify([source,context]),before);
 assert.equal(resolveMusicalPitch({sourcePitch:'C3',context:{transposeSemitones:5},localTranspose:3}).finalNote,'G#3');
 assert.equal(resolveMusicalPitch({sourcePitch:'C3',context,role:'percussion',localTranspose:3}).finalNote,'C3');
 const d=panel('drawgrid');restoreToyLocalTranspose(d,{localTranspose:99});assert.equal(d.dataset.localTranspose,'12');restoreToyLocalTranspose(d,{});assert.equal(d.dataset.localTranspose,'0');
});
