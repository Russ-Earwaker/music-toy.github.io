import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/toy-spawner.js',import.meta.url),'utf8');
// Exercise the actual shared drop finalizer with an Art drop rejection, which
// previously restored the drag-start coordinates even for top-level Art Toys.
const finalize=source.slice(source.indexOf('function resolveRemoveHandler('),source.indexOf('\nfunction configure(',source.indexOf('function endPanelDrag(')));
function fixture(kind){
 const panel={classList:{contains:name=>name===kind},style:{left:'450px',top:'320px'}};
 let probes=0;
 const context={state:{panelDrag:{panel,startPositions:[{panel,left:10,top:20}]},configArt:{remove:()=>true}},window:{__mtArtToys:{clearDropHover(){},tryPlaceChainFromPanel(){probes++;return {rejected:true};}}},console,
  ensureDock(){},isPointOverTrash:()=>false,setTrashHover(){},setPanelDragActive(){},setTrashArmed(){}};
 vm.createContext(context);vm.runInContext(finalize,context);
 return {panel,end:options=>context.endPanelDrag(options),probes:()=>probes};
}
test('Art Toy release never enters music drop rollback, including near another Art Toy',()=>{
 for(let i=0;i<3;i++){const f=fixture('art-toy-panel');f.end({clientX:500,clientY:400,pointerId:i});assert.equal(f.probes(),0);assert.deepEqual(f.panel.style,{left:'450px',top:'320px'});}
});
test('music toy rejected drop retains its intentional rollback',()=>{
 const f=fixture('toy-panel');f.end({clientX:500,clientY:400});assert.equal(f.probes(),1);assert.deepEqual(f.panel.style,{left:'10px',top:'20px'});
});

test('Art UI snapshot and restore preserve canonical outer position and manual placement independently of internal coordinates',()=>{
 const persistence=readFileSync(new URL('../src/persistence.js',import.meta.url),'utf8');
 const read=persistence.slice(persistence.indexOf('function readArtToyUI('),persistence.indexOf('\nfunction readOwnedToyUI('));
 const apply=persistence.slice(persistence.indexOf('function applyArtToyUI('),persistence.indexOf('\nfunction ensureArtInternalHostForRestore('));
 const context={getComputedStyle:p=>p.style,readNumber:(v,f)=>Number.isFinite(parseFloat(v))?parseFloat(v):f};vm.createContext(context);vm.runInContext(read+apply,context);
 const panel={dataset:{positionSource:'manual',internalHomeX:'9999',internalHomeY:'8888'},style:{left:'450.25px',top:'320.75px',width:'220px',height:'220px'}};
 const snapshot=JSON.parse(JSON.stringify(context.readArtToyUI(panel)));
 const restored={dataset:{},style:{}};context.applyArtToyUI(restored,snapshot);
 assert.equal(restored.style.left,'450.25px');assert.equal(restored.style.top,'320.75px');assert.equal(restored.dataset.positionSource,'manual');
 context.applyArtToyUI(restored,{left:'75px',top:'80px'});assert.equal(restored.dataset.positionSource,'manual');
});

test('shared manual drag tracking commits Art position before refresh and cancels layout animation',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const tracking=main.slice(main.indexOf('// Position provenance follows an actual drag'),main.indexOf('\nwindow.arrangeSubgraph ='));
 const handlers={},calls=[];
 const panel={id:'art',dataset:{positionSource:'auto'},style:{left:'10px',top:'20px'},classList:{contains:n=>n==='art-toy-panel'}};
 const target={closest:selector=>selector==='.toy-panel, .art-toy-panel'?panel:selector==='.art-toy-drag-btn'||selector.includes('[role="button"]')?{}:null};
 const context={document:{addEventListener:(name,fn)=>handlers[name]=fn,getElementById:()=>null,body:{classList:{contains:()=>false}}},window:{Persistence:{markDirty:()=>calls.push('dirty')}},isFocusEditingEnabled:()=>false,isActivelyEditingToy:()=>false,takeLayoutDrag:id=>calls.push('cancel:'+id),g_branchDrag:{end(){}},g_layoutManualDrag:null,syncOverviewPosition:p=>calls.push('overview:'+p.style.left),persistToyPosition:p=>calls.push('persist:'+p.style.left)};
 vm.createContext(context);vm.runInContext(tracking,context);
 handlers.pointerdown({target,pointerId:1,button:0});panel.style.left='450px';panel.style.top='320px';handlers.pointerup({pointerId:1});
 assert.equal(panel.dataset.positionSource,'manual');assert.deepEqual(calls,['cancel:art','overview:450px','persist:450px','dirty']);
});
