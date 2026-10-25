import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/container-volume.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function','function');
function fixture({paint=false}={}){
 const listeners=new Map(),values=new Map([['audio-A',{volume:.65,muted:false}],['audio-B',{volume:.8,muted:false}]]),children=new Map(['A','B'].map(id=>[id,{id,__audioToyId:'audio-'+id,dataset:{}}]));
 let owned=['A','B'],mounts=0,lastUI,dirty=0;
 const panel={id:'container',dataset:{}},controls=[{},{}],host={querySelectorAll:()=>controls};
 const window={addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);},dispatchEvent(event){const child=children.get(event.detail.toyId);if(child){const st=values.get(child.__audioToyId);if(event.type==='toy-volume')st.volume=event.detail.value;else st.muted=event.detail.muted;}for(const fn of listeners.get(event.type)||[])fn(event);},Persistence:{markDirty(){dirty++;}}};
 const context={window,CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},installVolumeUI(){mounts++;},syncVolumeUI(p,state){lastUI={...state};},getToyVolumeRaw:id=>values.get(id)?.volume??1,isToyMuted:id=>!!values.get(id)?.muted};
 vm.createContext(context);vm.runInContext(source,context);
 const presentation={type:paint?'simple-draw':'collapsed-graph',state:{}};
 const options={containers:{get:()=>({internalToyIds:owned,presentation}),setPresentation(id,{state}){Object.assign(presentation.state,state);}},getToy:id=>children.get(id)};
 const mount=()=>context.installContainerVolumeUI(host,panel,options),ui=mount();
 const change=(type,detail)=>window.dispatchEvent({type,detail:{toyId:panel.id,...detail}});
 return {ui,panel,controls,values,children,change,mount,presentation,owned:v=>owned=v,getUI:()=>lastUI,mounts:()=>mounts,dirty:()=>dirty};
}
test('shared container volume projects first canonical child and updates every owned audio bus',()=>{
 const f=fixture();assert.equal(f.panel.__audioToyId,'audio-A');assert.equal(f.getUI().volume,.65);
 f.change('toy-volume',{value:.37});assert.deepEqual([...f.values.values()].map(v=>v.volume),[.37,.37]);assert.ok(f.dirty());
 f.change('toy-mute',{muted:true});assert.ok([...f.values.values()].every(v=>v.muted));
 f.change('toy-mute',{muted:false});assert.ok([...f.values.values()].every(v=>!v.muted));assert.ok([...f.values.values()].every(v=>v.volume===.37));
});
test('read-only chrome refresh and volume restore leave canonical audio untouched',()=>{
 const f=fixture();f.change('toy-volume',{value:.42});const saved=JSON.stringify([...f.values]);
 f.ui.sync();f.ui.sync();assert.equal(JSON.stringify([...f.values]),saved);assert.equal(f.mounts(),1);
 f.ui.dispose();const restored=JSON.parse(saved);f.values.clear();for(const [id,value]of restored)f.values.set(id,value);
 const reloaded=f.mount();assert.equal(f.getUI().volume,.42);assert.equal(f.panel.dataset.toyVolume,'0.42');reloaded.dispose();
});
test('empty container disables shared audio controls and detached children are not affected',()=>{
 const f=fixture();f.owned([]);f.ui.sync();assert.ok(f.controls.every(c=>c.disabled));
 f.change('toy-volume',{value:.2});assert.equal(f.values.get('audio-A').volume,.65);
 f.owned(['B']);f.ui.sync();assert.equal(f.panel.__audioToyId,'audio-B');assert.ok(f.controls.every(c=>!c.disabled));f.change('toy-volume',{value:.2});assert.equal(f.values.get('audio-A').volume,.65);assert.equal(f.values.get('audio-B').volume,.2);
 f.ui.dispose();f.change('toy-volume',{value:.9});assert.equal(f.values.get('audio-B').volume,.2);
});
test('empty Paint retains editable toy-level volume and mute without changing detached grids',()=>{
 const f=fixture({paint:true});f.change('toy-volume',{value:.31});f.change('toy-mute',{muted:true});
 f.owned([]);f.ui.sync();assert.equal(f.getUI().volume,.31);assert.equal(f.getUI().muted,true);assert.ok(f.controls.every(c=>!c.disabled));
 f.change('toy-volume',{value:.44});f.change('toy-mute',{muted:false});f.ui.sync();
 assert.equal(f.getUI().volume,.44);assert.equal(f.getUI().muted,false);assert.equal(f.presentation.state.audioSettings.volume,.44);
 assert.equal(f.values.get('audio-A').volume,.31);assert.equal(f.values.get('audio-A').muted,true);
 f.ui.dispose();const reloaded=f.mount();assert.equal(f.getUI().volume,.44);assert.equal(f.getUI().muted,false);reloaded.dispose();
});
