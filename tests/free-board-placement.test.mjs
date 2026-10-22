import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
test('free Drum and Ripple additions never queue automatic topology layout',()=>{
 let queued=0;const context={g_layoutRestoring:false,connectionModel:{getEditing:()=>null,getParent:()=>null},containerToyModel:{owner:()=>null,get:()=>null,isVisible:()=>true},drumObjects:{get:id=>id==='drum'},rippleObjects:{get:id=>id==='ripple'},g_layoutPending:new Set(),g_layoutConnections:new Set(),g_layoutQueued:false,queueMicrotask:()=>queued++};
 vm.createContext(context);const source=main.slice(main.indexOf('function requestGraphLayout('),main.indexOf('function isActivelyEditingToy('));vm.runInContext(source,context);
 context.requestGraphLayout('drum');context.requestGraphLayout('ripple');assert.equal(queued,0);assert.equal(context.g_layoutPending.size,0);
 context.requestGraphLayout('ordinary');assert.equal(queued,1);assert.ok(context.g_layoutPending.has('ordinary'));
});
test('graph positioning cannot overwrite free instrument DOM independently of authored state',()=>{
 let writes=0;const context={drumObjects:{get:id=>id==='drum'},rippleObjects:{get:id=>id==='ripple'},containerToyModel:{get:()=>{writes++;throw Error('Unexpected layout write');}}};vm.createContext(context);
 const config=main.slice(main.indexOf('const g_graphPlacement = createGraphPlacement('),main.indexOf('const g_branchDrag ='));
 const body=config.slice(config.indexOf('  setPosition: (id,x,y) => {')+'  setPosition: '.length,config.lastIndexOf('},')+1);
 const setPosition=vm.runInContext('('+body+')',context);setPosition('drum',10,20);setPosition('ripple',30,40);assert.equal(writes,0);
});
