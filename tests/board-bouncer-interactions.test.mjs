import test from 'node:test';
import assert from 'node:assert/strict';
import {installBoardBouncer} from '../src/board-bouncer.js';
import {createBoardPhysicalObjects} from '../src/board-physical-objects.js';

// Minimal event/DOM adapter exercises the actual interaction coordinator; no
// physics or gesture implementation is duplicated in the fixture.
class Node {
 constructor(tag='div'){this.tag=tag;this.children=[];this.listeners=new Map();this.dataset={};this.style={setProperty(){}};this.attributes={};this.className='';this.classList={add:(...names)=>{this.className+=' '+names.join(' ');},remove:name=>{this.className=this.className.split(' ').filter(n=>n!==name).join(' ');},toggle:(name,on)=>on?this.classList.add(name):this.classList.remove(name)};}
 append(...children){for(const child of children){this.children.push(child);child.parent=this;}}
 prepend(child){this.children.unshift(child);child.parent=this;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 setAttribute(key,value){this.attributes[key]=String(value);}
 getAttribute(key){return this.attributes[key]??null;}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 async dispatch(type,event){for(const fn of [...(this.listeners.get(type)||[])])await fn(event);}
 closest(selector){return selector.split(',').some(s=>s.startsWith('.')?this.className.split(' ').includes(s.slice(1)):this.tag===s)?this:null;}
 contains(){return true;} focus(){} setPointerCapture(){}
 getBoundingClientRect(){return {left:0,top:0,width:1000,height:800};}
}
function fixture(){
 const old={document:globalThis.document,window:globalThis.window,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
 const body=new Node(),world=new Node(),viewport=new Node(),win=new Node();
 globalThis.document={body,createElement:tag=>new Node(tag),createElementNS:(_,tag)=>new Node(tag),querySelectorAll:()=>[]};globalThis.window=win;globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 const objects=createBoardPhysicalObjects(),calls=[],handles=[];
 const controller={busy:()=>false,data:()=>null,handles:()=>handles,editHandle:(id,kind,p)=>{Object.assign(handles.find(h=>h.kind===kind),p);},ballView:b=>({position:b,trail:[]})};
 const board=installBoardBouncer({objects,controller,getWorld:()=>world,getViewport:()=>viewport,screenToWorld:e=>({x:e.clientX/2,y:e.clientY/2}),unlock(){},createCapture:async request=>{calls.push(request);handles.push({id:'capture:start',containerId:'capture',kind:'start',...request.launch},{id:'capture:target',containerId:'capture',kind:'target',...request.release});objects.update(request.ballId,{captureId:'capture'});}});
 const nodes=()=>world.children[0].children;
 const event=(target,x,y)=>({target,clientX:x,clientY:y,pointerId:1,button:0,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){this.stopped=true;}});
 async function dispatch(type,target,x,y){const e=event(target,x,y);await win.dispatch(type,e);if(!e.stopped)await target.dispatch(type,e);}
 const drag=async(target,a,b)=>{await dispatch('pointerdown',target,...a);await dispatch('pointermove',target,...b);await dispatch('pointerup',target,...b);};
 return {board,objects,calls,handles,nodes,world,drag,dispatch,dispose(){board.dispose();Object.assign(globalThis,old);}};
}
test('Ball mode only arms; valid release fires one ball, retains mode and board logical endpoints',async()=>{
 const f=fixture();try{f.board.arm({mode:'ball',seed:false});assert.equal(f.objects.list().length,0);
 await f.drag(f.world,[100,200],[300,200]);assert.equal(f.objects.list('ball').length,1);assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].launch,{x:50,y:100,vx:840,vy:0});assert.deepEqual(f.calls[0].release,{x:150,y:100});assert.ok(f.board.active);
 await f.drag(f.world,[500,400],[501,401]);assert.equal(f.objects.list('ball').length,1);
 }finally{f.dispose();}
});
test('Cube mode places repeatedly on empty taps and prioritizes dragging cubes and both launch handles',async()=>{
 const f=fixture();try{
 f.board.arm({mode:'ball',seed:false});await f.drag(f.world,[100,200],[300,200]);f.board.arm({mode:'cube',seed:false});assert.equal(f.objects.list('cube').length,0);
 await f.drag(f.world,[500,400],[500,400]);await f.drag(f.world,[600,400],[600,400]);assert.equal(f.objects.list('cube').length,2);
 const cube=f.objects.list('cube')[0],node=f.nodes().find(n=>n.id===cube.id);await f.drag(node,[500,400],[540,460]);assert.equal(f.objects.get(cube.id).x,270);assert.equal(f.objects.get(cube.id).y,230);
 for(const kind of ['start','target']){const handle=f.handles.find(h=>h.kind===kind),node=f.nodes().find(n=>n.id===handle.id),a=[handle.x*2,handle.y*2];await f.drag(node,a,[a[0]+40,a[1]+60]);assert.equal(handle.x,a[0]/2+20);assert.equal(handle.y,a[1]/2+30);}
 const control=new Node('button');await f.drag(control,[800,400],[800,400]);assert.equal(f.objects.list('cube').length,2);assert.ok(f.board.active);
 }finally{f.dispose();}
});

test('selecting another palette cancels creation mode',async()=>{const f=fixture();try{f.board.arm({mode:'cube',seed:false});const palette=new Node('button');palette.className='palette-handle';await f.dispatch('pointerdown',palette,0,0);assert.equal(f.board.active,false);await f.drag(f.world,[100,100],[100,100]);assert.equal(f.objects.list().length,0);}finally{f.dispose();}});
