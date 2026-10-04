import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createConnectionModel} from '../src/connections.js';

test('production layout subscriber ignores loose/cancelled edges and repairs both parents only after drop',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),start=source.indexOf('connectionModel.subscribe(event => {'),end=source.indexOf('const g_sequenceChains =',start);
 const model=createConnectionModel();for(const id of ['A','B','C'])model.registerObject(id);
 const out=id=>({objectId:id,portId:'output'}),input=id=>({objectId:id,portId:'input'});
 const edge=model.connect('sequence',out('A'),input('B')).connection,repairs=[];
 const context={connectionModel:model,g_layoutRestoring:false,g_layoutParents:new Map([['B',out('A')]]),g_layoutAttached:new Set(),g_layoutSizes:new Map(),g_layoutAnimation:{cancel(){}},structureToyModel:{list:()=>[]},requestGraphLayout:id=>repairs.push(id),window:{Persistence:{markDirty(){}}}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 model.beginDrag(out('A'),model.socketDragIntent(out('A')));model.detachDrag();assert.deepEqual(repairs,[]);model.cancelDrag();assert.deepEqual(repairs,[]);
 model.beginDrag(out('A'),model.socketDragIntent(out('A')));model.detachDrag();assert.deepEqual(repairs,[]);model.drop(out('C'));assert.ok(repairs.includes('A'));assert.ok(repairs.includes('C'));assert.equal(model.get(edge.id).from.objectId,'C');
 repairs.length=0;model.beginDrag(input('B'),model.socketDragIntent(input('B')));model.detachDrag();assert.deepEqual(repairs,[]);model.drop(null);assert.deepEqual(repairs,['C']);
});
