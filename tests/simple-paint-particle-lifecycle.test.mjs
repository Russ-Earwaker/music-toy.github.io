import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {dom,Node,event} from './graph-ui-dom.mjs';
import {prepareBoardDrawing} from '../src/simple-draw-placement.js';
import {installPaintPresentation} from '../src/simple-paint/presentation/paint-presentation.js';
const source=readFileSync(new URL('../src/simple-draw-creation.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace('export function','function');
function fixture(quality,camera={scale:.5,x:40,y:60}){
 const {document,window}=dom(),board=new Node(),calls=[],commits=[];document.body.append(board);board.hasPointerCapture=()=>false;
 let particles=Object.fromEntries(['begin','move','release','stop'].map(k=>[k,(...args)=>calls.push([k,...args])]));
 if(quality){
  window.performance={now:()=>0};window.matchMedia=()=>({matches:false,addEventListener(){}});
  const spy=particles;
  particles=installPaintPresentation({quality,document,window,worldToScreen:p=>({x:p.x*camera.scale+camera.x,y:p.y*camera.scale+camera.y}),getInstrument:()=> 'PIANO'},
   {standard:()=>spy,loadHigh:async()=>({installHighPaintRenderer:()=>({consume(){},stop(){}})})});
 }
 const context={document,window,prepareBoardDrawing,createBoardInteractionHint:()=>({hide(){},dispose(){}})};vm.createContext(context);vm.runInContext(source+';globalThis.install=installSimpleDrawCreation;',context);
 const creation=context.install({getViewport:()=>board,getWorld:()=>board,screenToWorld:p=>({x:(p.x-camera.x)/camera.scale,y:(p.y-camera.y)/camera.scale}),particles,commit:async(p)=>{commits.push(p);}});
 const send=(type,x=100,y=100,target=board)=>window.dispatchEvent(event(type,x,y,{target,stopImmediatePropagation(){}}));
 return {creation,calls,commits,send,board};
}
test('real pointer lifecycle invokes effects only during drawing and commits identical source and bounds',()=>{
 const f=fixture();f.send('pointerdown');assert.equal(f.calls.length,0);f.creation.arm();assert.deepEqual(f.calls.map(c=>c[0]),['stop']);
 f.send('pointerdown',100,100);f.send('pointermove',200,180);f.send('pointerup',300,200);
 assert.deepEqual(f.calls.map(c=>c[0]),['stop','begin','move','move','release']);
 const expected=prepareBoardDrawing([{x:120,y:80},{x:320,y:240},{x:520,y:280}]);assert.deepEqual(f.commits[0],expected);assert.equal(f.creation.active,false);
});

test('actual drawing commits identical authored data and save-shaped payload in Standard and High',()=>{
 const results=[];
 for(const quality of ['standard','high']){
  const f=fixture(quality);f.creation.arm();f.send('pointerdown',100,100);f.send('pointermove',170,125);f.send('pointermove',240,190);f.send('pointerup',300,200);
  assert.equal(f.commits.length,1);results.push(JSON.stringify(f.commits[0]));
 }
 assert.equal(results[0],results[1]);assert.doesNotMatch(results[0],/renderQuality|effectiveQuality|framebuffer|particles/);
});

test('zooming and panning during actual High input preserves the authored world path',()=>{
 const points=[{x:120,y:80},{x:200,y:140},{x:260,y:100},{x:340,y:200}];
 const camera={scale:1,x:40,y:60},f=fixture('high',camera);f.creation.arm();
 for(let i=0;i<points.length;i++){
  camera.scale=[1,.5,2,1][i];camera.x=40+i*20;camera.y=60-i*10;
  const p=points[i];f.send(i===0?'pointerdown':i===points.length-1?'pointerup':'pointermove',p.x*camera.scale+camera.x,p.y*camera.scale+camera.y);
 }
 assert.deepEqual(f.commits,[prepareBoardDrawing(points)]);
});
test('UI/scissors pointer events cannot start the field; cancel, Clear, scene changes stop it',()=>{
 const f=fixture();f.creation.arm();const button=new Node('button');f.board.append(button);f.send('pointerdown',100,100,button);assert.equal(f.calls.some(c=>c[0]==='begin'),false);
 f.send('pointerdown');f.creation.cancel();assert.equal(f.calls.at(-1)[0],'stop');f.creation.arm();f.send('pointerdown');f.send('scene:new');assert.equal(f.calls.at(-1)[0],'stop');assert.equal(f.creation.active,false);
 f.creation.arm();f.send('pointerdown');f.creation.stopParticles();assert.equal(f.calls.at(-1)[0],'stop');f.creation.cancel();f.send('pointermove');assert.equal(f.calls.at(-1)[0],'stop');
});
