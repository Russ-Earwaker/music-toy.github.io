import {CONNECTION_FLASH_DURATION,STRUCTURE_FLASH_DURATION,structureFlashStrength} from '../src/graph-visuals.js';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createStructureToyModel} from '../src/structure-toys.js';
import {createChainSequenceAdapter} from '../src/chain-sequence.js';
import {getActivationConnections} from '../src/graph-transition-feedback.js';
import {MAIN_TRANSPORT_ID} from '../src/transport-registry.js';
import {ensurePlaybackInstance,clearPlaybackInstancesForTests,getPlaybackInstance} from '../src/playback-instances.js';
const input=objectId=>({objectId,portId:'input'}),out=(objectId,portId='output')=>({objectId,portId});
for(const type of ['sequence','together','repeat','timeline']){
 test(type+' root promotion keeps original branch and one transport parent',()=>{
  const model=createConnectionModel();model.registerObject('H',{ports:HEARTBEAT_PORTS,transportId:'independent'});model.registerObject('A');model.registerObject('B');
  model.connect('sequence',out('A'),input('B'));const edge=model.connect('transport',out('H'),input('A')).connection;
  const structures=createStructureToyModel(model),events=[];model.subscribe(e=>events.push(e));
  const s=structures.promote(edge.id,type);assert.equal(s.type,type);assert.equal(model.getParent(s.id).kind,'transport');assert.equal(model.getParent('A').kind,'sequence');
  assert.equal(model.getParent('A').from.objectId,s.id);assert.equal(model.getTransportId('B'),'independent');
  assert.equal(model.list('transport').length,1);assert.equal(model.list().some(c=>c.from.objectId==='H'&&c.to.objectId==='A'),false);assert.equal(events.length,1);
  assert.equal(events[0].batch,true);structures.dispose();
 });
 test(type+' standalone is persisted and inactive until rooted',()=>{
  clearPlaybackInstancesForTests();const model=createConnectionModel();model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS,transportId:MAIN_TRANSPORT_ID});model.registerObject('A');
  const structures=createStructureToyModel(model),s=structures.createStandalone(type,{x:900,y:450,artOwnerId:'art'});
  assert.equal(model.list().length,0);assert.equal(model.getObject(s.id).structure.definitionId,s.definitionId);assert.equal(model.isRooted(s.id),false);
  assert.equal(s.outputCount,type==='repeat'?1:2);assert.equal(s.x,900);assert.equal(s.y,450);
  const panels=[{id:'A',dataset:{toy:'loopgrid'}}];ensurePlaybackInstance('A');model.connect('sequence',out(s.id,'child:0'),input('A'));
  const chain=createChainSequenceAdapter({connectionModel:model,getToy:id=>panels.find(p=>p.id===id),chainState:new Map()});
  const sync=()=>chain.sync(panels,{currentTick:0,state:'stopped'},{connections:model.list('sequence'),structures:structures.list()});sync();
  assert.equal(chain.runtime.getInstance(s.definitionId).active,false);assert.equal(getPlaybackInstance('A').active,false);
  model.connect('transport',out(MAIN_TRANSPORT_ID),input(s.id));sync();assert.equal(chain.runtime.getInstance(s.definitionId).active,true);assert.equal(getPlaybackInstance('A').active,true);
  const saved=structures.list();structures.restore(saved);assert.equal(structures.get(s.id).artOwnerId,'art');assert.equal(structures.get(s.id).x,900);chain.reset();structures.dispose();
 });
}
test('runtime turns select exact toy, nested Structure and root activation edges without repeated ancestor flashes',()=>{
 clearPlaybackInstancesForTests();const model=createConnectionModel();model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS,transportId:MAIN_TRANSPORT_ID});
 const panels=['A','B','C'].map(id=>({id,dataset:{toy:'loopgrid'}}));for(const p of panels){model.registerObject(p.id);ensurePlaybackInstance(p.id);}
 const structures=createStructureToyModel(model),outer=structures.createStandalone('sequence'),inner=structures.createStandalone('sequence');
 model.connect('transport',out(MAIN_TRANSPORT_ID),input('A'));model.connect('sequence',out('A'),input(outer.id));model.connect('sequence',out(outer.id,'child:0'),input(inner.id));model.connect('sequence',out(inner.id,'child:0'),input('B'));model.connect('sequence',out(inner.id,'child:1'),input('C'));
 const seen=[];const chain=createChainSequenceAdapter({connectionModel:model,getToy:id=>panels.find(p=>p.id===id),chainState:new Map(),onTurn:(turn,previous)=>seen.push(getActivationConnections(model,turn,previous).map(c=>[c.from.objectId,c.to.objectId]))});
 chain.sync(panels,{currentTick:0,state:'stopped'},{connections:model.list('sequence'),structures:structures.list()});
 assert.deepEqual(seen[0],[[MAIN_TRANSPORT_ID,'A']]);chain.updateCurrent(384);
 assert.deepEqual(seen.at(-1),[[inner.id,'B'],[outer.id,inner.id],['A',outer.id]]);
 chain.updateCurrent(768);assert.deepEqual(seen.at(-1),[[inner.id,'C']]);const count=seen.length;chain.updateCurrent(769);assert.equal(seen.length,count);
 model.disconnect(model.getParent('C').id);assert.deepEqual(getActivationConnections(model,{toyId:'C'}),[]);chain.reset();structures.dispose();
});
test('toy-to-toy runtime transition selects its real cable',()=>{
 const model=createConnectionModel();model.registerObject('H',{ports:HEARTBEAT_PORTS,transportId:'H'});model.registerObject('A');model.registerObject('B');model.connect('transport',out('H'),input('A'));const edge=model.connect('sequence',out('A'),input('B')).connection;
 assert.deepEqual(getActivationConnections(model,{toyId:'B',structureContexts:[]},{toyId:'A'}),[edge]);
});

test('production pulse authority holds simultaneous Together edges separately and expires after 150 ms',()=>{
 const model=createConnectionModel();model.registerObject('B');model.registerObject('C');const structures=createStructureToyModel(model),s=structures.createStandalone('together');
 const b=model.connect('sequence',out(s.id,'child:0'),input('B')).connection,c=model.connect('sequence',out(s.id,'child:1'),input('C')).connection;
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),start=source.indexOf('function triggerConnectorPulse('),end=source.indexOf('\n}',start)+2;
 let now=1000;const pulses=new Map(),context={CONNECTION_FLASH_DURATION,STRUCTURE_FLASH_DURATION,connectionModel:model,g_pulsingConnectors:pulses,document:{getElementById:()=>null},performance:{now:()=>now},g_edgesByToyId:new Map(),CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW:false};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);context.triggerConnectorPulse(s.id,'B',0);now=1001;context.triggerConnectorPulse(s.id,'C',0);
 assert.equal(pulses.size,2);assert.equal(pulses.get(b.id).until,1150);assert.equal(pulses.get(c.id).until,1151);assert.equal(pulses.get(b.id).structureUntil,pulses.get(c.id).structureUntil);
 const a=source.indexOf('  getPulse: connection => {'),z=source.indexOf('  onFrame:',a);vm.runInContext('var getPulse='+source.slice(a+'  getPulse: '.length,z).trim().replace(/,$/,''),context);
 assert.equal(context.getPulse(b),true);assert.equal(context.getPulse(c),true);now=1152;assert.equal(context.getPulse(b),false);assert.equal(context.getPulse(c),false);assert.equal(structureFlashStrength(pulses,s.id,now)>0,true);now=1321;context.getPulse(b);context.getPulse(c);assert.equal(pulses.size,0);structures.dispose();
});

for(const type of ['sequence','together','repeat','timeline'])test(type+' runtime handoffs illuminate the source border and only traversed wires',()=>{
 clearPlaybackInstancesForTests();const model=createConnectionModel();model.registerObject('H',{ports:HEARTBEAT_PORTS,transportId:'H'});
 const panels=['A','B'].map(id=>({id,dataset:{toy:'loopgrid'}}));for(const p of panels){model.registerObject(p.id);ensurePlaybackInstance(p.id);}
 const structures=createStructureToyModel(model),s=structures.createStandalone(type),root=model.connect('transport',out('H'),input(s.id)).connection;
 model.connect('sequence',out(s.id,'child:0'),input('A'));if(type!=='repeat')model.connect('sequence',out(s.id,'child:1'),input('B'));
 if(type==='repeat')structures.setCount(s.id,3);
 const turns=[];const chain=createChainSequenceAdapter({connectionModel:model,getToy:id=>panels.find(p=>p.id===id),chainState:new Map(),onTurn:(turn,previous)=>turns.push({tick:turn.startTick,edges:getActivationConnections(model,turn,previous)})});
 chain.sync(panels,{currentTick:0,state:'stopped'},{connections:model.list('sequence'),structures:structures.list()});
 for(const tick of [1,384,768])chain.updateCurrent(tick);
 const handoffs=turns.filter(t=>t.edges.some(e=>e.from.objectId===s.id));assert.ok(handoffs.length>= (type==='repeat'?3:1));
 for(const t of handoffs)assert.ok(t.edges.every(e=>model.get(e.id)===e));
 const before=turns.length;chain.updateCurrent(769);assert.equal(turns.length,before,'no beat-wide false traversal');
 if(type==='together')assert.equal(new Set(handoffs.filter(t=>t.tick===0).map(t=>t.tick)).size,1);
 assert.ok(turns.some(t=>t.edges.includes(root)));chain.reset();structures.dispose();
});
