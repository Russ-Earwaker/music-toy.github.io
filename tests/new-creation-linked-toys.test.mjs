import test from 'node:test';
import assert from 'node:assert/strict';
import {orderCreationPanelRemoval,clearCreationGraph} from '../src/creation-graph.js';
import {createToyInstanceController} from '../src/toy-instances.js';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createStructureToyModel} from '../src/structure-toys.js';
import {MAIN_TRANSPORT_ID} from '../src/transport-registry.js';

test('one New Creation removal pass clears three Masters, eight Instances and their graph without bypassing deletion safety',()=>{
  const originalDocument=globalThis.document;
  globalThis.document={addEventListener(){}};
  const masters=['bass','melody','rhythm'].map(id=>({id,dataset:{}}));
  const instances=Array.from({length:8},(_,i)=>({id:'instance-'+i,dataset:{masterToyId:masters[i%3].id}}));
  const domOrder=[...masters,...instances],panels=[...domOrder],removed=[];
  const controller=createToyInstanceController({getPanels:()=>panels,getMaster:id=>panels.find(p=>p.id===id)});
  const model=createConnectionModel();model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS,transportId:MAIN_TRANSPORT_ID});
  const structures=createStructureToyModel(model),together=structures.createStandalone('together');
  model.connect('transport',{objectId:MAIN_TRANSPORT_ID,portId:'output'},{objectId:together.id,portId:'input'});
  for(const panel of panels){model.registerObject(panel.id);model.connect('transport',{objectId:MAIN_TRANSPORT_ID,portId:'output'},{objectId:panel.id,portId:'input'});}
  try{
    assert.ok(masters.every(p=>!controller.canDelete(p)),'individual Master deletion remains protected');
    for(const panel of orderCreationPanelRemoval(domOrder)){
      assert.ok(controller.canDelete(panel),`normal deletion allowed for ${panel.id}`);
      panels.splice(panels.indexOf(panel),1);model.removeObject(panel.id);removed.push(panel.id);
    }
    assert.deepEqual(removed.slice(0,8),instances.map(p=>p.id));assert.equal(panels.length,0);
    assert.deepEqual(domOrder,[...masters,...instances],'ordering does not mutate the captured panel list');
    clearCreationGraph({model,structures,sequence:{reset(){}},adapter:{sync(){}}});
    assert.equal(model.list().length,0);assert.equal(structures.list().length,0);assert.deepEqual(model.getObjectIds(),[MAIN_TRANSPORT_ID]);
  }finally{structures.dispose();globalThis.document=originalDocument;}
});
