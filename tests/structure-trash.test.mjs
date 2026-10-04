import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createConnectionModel} from '../src/connections.js';
import {createStructureToyModel} from '../src/structure-toys.js';

test('existing trash drag lifecycle removes Structures and cancels cleanly',()=>{
 const source=readFileSync(new URL('../src/toy-spawner.js',import.meta.url),'utf8');
 const model=createConnectionModel(),structures=createStructureToyModel(model);structures.restore([{id:'S',type:'sequence'}]);model.registerObject('B');model.connect('sequence',{objectId:'S',portId:'child:0'},{objectId:'B',portId:'input'});
 const flags=new Map(),classes={toggle:(k,v)=>flags.set(k,v)};
 const state={dock:{classList:classes},trash:{dataset:{},classList:classes,getBoundingClientRect:()=>({left:0,right:40,top:0,bottom:40})}};
 let artDrops=0,removed=0;const context={state,ensureDock(){},window:{__mtArtToys:{tryPlaceChainFromPanel(){artDrops++;},probeDropForPanel(){artDrops++;}}},console};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function setTrashHover('),source.indexOf('function configure(options)')),context);
 const start=()=>context.beginPanelDrag({panel:{id:'S'},pointerId:1,remove:()=>{removed++;structures.remove('S');return true;}});
 try{
  start();context.updatePanelDrag({clientX:20,clientY:20});assert.equal(state.trash.dataset.hover,'true');assert.equal(flags.get('is-armed'),true);
  assert.equal(context.endPanelDrag({clientX:20,clientY:20,canceled:true}),false);assert.ok(structures.get('S'));
  start();assert.equal(context.endPanelDrag({clientX:200,clientY:200}),false);assert.ok(structures.get('S'));assert.equal(artDrops,0);
  start();assert.equal(context.endPanelDrag({clientX:20,clientY:20}),true);assert.equal(removed,1);assert.equal(structures.get('S'),null);assert.equal(model.list().length,0);assert.equal(flags.get('is-armed'),false);assert.equal(state.panelDrag,null);
 }finally{structures.dispose();}
});
