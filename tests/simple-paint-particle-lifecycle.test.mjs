import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {dom,Node,event} from './graph-ui-dom.mjs';
import {prepareBoardDrawing} from '../src/simple-draw-placement.js';
const source=readFileSync(new URL('../src/simple-draw-creation.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace('export function','function');
function fixture(){
 const {document,window}=dom(),board=new Node(),calls=[],commits=[];document.body.append(board);board.hasPointerCapture=()=>false;
 const particles=Object.fromEntries(['begin','move','release','stop'].map(k=>[k,(...args)=>calls.push([k,...args])]));
 const context={document,window,prepareBoardDrawing,createBoardInteractionHint:()=>({hide(){},dispose(){}})};vm.createContext(context);vm.runInContext(source+';globalThis.install=installSimpleDrawCreation;',context);
 const creation=context.install({getViewport:()=>board,getWorld:()=>board,screenToWorld:p=>({x:(p.x-40)/.5,y:(p.y-60)/.5}),particles,commit:async(p)=>{commits.push(p);}});
 const send=(type,x=100,y=100,target=board)=>window.dispatchEvent(event(type,x,y,{target,stopImmediatePropagation(){}}));
 return {creation,calls,commits,send,board};
}
test('real pointer lifecycle invokes effects only during drawing and commits identical source and bounds',()=>{
 const f=fixture();f.send('pointerdown');assert.equal(f.calls.length,0);f.creation.arm();assert.deepEqual(f.calls.map(c=>c[0]),['stop']);
 f.send('pointerdown',100,100);f.send('pointermove',200,180);f.send('pointerup',300,200);
 assert.deepEqual(f.calls.map(c=>c[0]),['stop','begin','move','move','release']);
 const expected=prepareBoardDrawing([{x:120,y:80},{x:320,y:240},{x:520,y:280}]);assert.deepEqual(f.commits[0],expected);assert.equal(f.creation.active,false);
});
test('UI/scissors pointer events cannot start the field; cancel, Clear, scene changes stop it',()=>{
 const f=fixture();f.creation.arm();const button=new Node('button');f.board.append(button);f.send('pointerdown',100,100,button);assert.equal(f.calls.some(c=>c[0]==='begin'),false);
 f.send('pointerdown');f.creation.cancel();assert.equal(f.calls.at(-1)[0],'stop');f.creation.arm();f.send('pointerdown');f.send('scene:new');assert.equal(f.calls.at(-1)[0],'stop');assert.equal(f.creation.active,false);
 f.creation.arm();f.send('pointerdown');f.creation.stopParticles();assert.equal(f.calls.at(-1)[0],'stop');f.creation.cancel();f.send('pointermove');assert.equal(f.calls.at(-1)[0],'stop');
});
