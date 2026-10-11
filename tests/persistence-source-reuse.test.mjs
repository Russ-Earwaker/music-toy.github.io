import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('scene import never assigns two authored source IDs to a reused panel with a stale previous-ID lookup',()=>{
 // Execute the production matching boundary; the factory/state UI outside it
 // is represented by plain panels so this reproduces the alias/data-loss case.
 const source=readFileSync(new URL('../src/persistence.js',import.meta.url),'utf8');
 const start=source.indexOf('      let panel = byId.get(t.id);'),end=source.indexOf('      if (!panel && factory',start);
 assert.ok(start>=0&&end>start);const match=new vm.Script(source.slice(start,end)+'\npanel;');
 const make=(id,type)=>({id,dataset:{toy:type},remove(){assert.fail('an already assigned source must not be destroyed');}});
 const originalMelody=make('melody','drawgrid'),panels=[originalMelody,make('rhythm','loopgrid')];
 const byId=new Map(panels.map(p=>[p.id,p])),usedPanels=new Set(),restored=[];
 const targets=[{id:'accompaniment',type:'drawgrid',notes:['C3']},{id:'melody',type:'drawgrid',notes:['E4','G4']},{id:'rhythm',type:'loopgrid',notes:['C4']}];
 for(const t of targets){
  let panel=match.runInNewContext({t,byId,usedPanels,panels,factory:{destroy(){assert.fail();}}});
  if(!panel){panel=make(t.id,t.type);panels.push(panel);}
  panel.id=t.id;panel.notes=[...t.notes];byId.set(t.id,panel);usedPanels.add(panel);restored.push(panel);
 }
 assert.equal(restored[0],originalMelody);assert.equal(new Set(restored).size,3);
 assert.deepEqual(restored.map(p=>({id:p.id,notes:p.notes})),targets.map(t=>({id:t.id,notes:t.notes})));
});
