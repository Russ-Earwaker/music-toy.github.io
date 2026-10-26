import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS,resolvePreset,canCreateToy,canCreateBackingToy,canUsePalette} from '../src/runtime-config.js';
import {createUIMode,UI_MODE_KEY} from '../src/ui-mode.js';
test('normal defaults and unknown presets fall back atomically',()=>{
 assert.equal(resolvePreset(),PRESETS.normal);assert.equal(resolvePreset('?preset=normal'),PRESETS.normal);
 const warnings=[];assert.equal(resolvePreset('?preset=banana',s=>warnings.push(s)),PRESETS.normal);assert.equal(warnings.length,1);
 assert.equal(PRESETS.normal.interface.modeSwitcher,true);assert.equal(PRESETS.normal.interface.advanced,true);
 assert.ok(canUsePalette('art',PRESETS.normal));assert.ok(canCreateToy('drawgrid',PRESETS.normal));
});
test('runtime restrictions preserve preference and ordinary URL restores full interface',()=>{
 const saved=new Map([[UI_MODE_KEY,'advanced']]);const storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};
 const config=resolvePreset('?preset=simple-playtest');
 const mode=createUIMode({storage,config});mode.set('advanced');mode.set('simple');
 assert.equal(mode.get(),'simple');assert.equal(saved.get(UI_MODE_KEY),'advanced');
 assert.equal(createUIMode({storage,config:resolvePreset('')}).get(),'advanced');
 assert.equal(createUIMode({storage,config}).get(),'simple');
 assert.equal(config.interface.modeSwitcher,false);assert.equal(config.systems.art,false);
 assert.equal(config.systems.paintPalette,true);assert.equal(config.systems.guide,true);
 assert.equal(Object.keys(config.simpleToys).length,9);
 for(const type of Object.keys(config.simpleToys)) assert.ok(canCreateToy(type,config));
 for(const type of ['drawgrid','simple-rhythm','simple-bouncer','heartbeat']) assert.equal(canCreateToy(type,config),false);
 for(const palette of ['art','game','logic']) assert.equal(canUsePalette(palette,config),false);
 assert.ok(Object.isFrozen(config.simpleToys));
});

test('Paint can create its hidden DrawGrid backing without exposing legacy DrawGrid creation',()=>{
 const config=PRESETS.simplePlaytest;
 assert.equal(canCreateToy('drawgrid',config),false);
 assert.equal(canCreateBackingToy('drawgrid','simple-draw',config),true);
 assert.equal(canCreateBackingToy('loopgrid','simple-draw',config),false);
 assert.equal(canCreateBackingToy('drawgrid','simple-rhythm',config),false);
 assert.equal(canCreateBackingToy('drawgrid','simple-draw',{...config,simpleToys:{...config.simpleToys,'simple-draw':false}}),false);
});
