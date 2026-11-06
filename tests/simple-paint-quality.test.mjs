import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveRenderQuality,resolvePreset,PRESETS} from '../src/runtime-config.js';
import {installPaintPresentation} from '../src/simple-paint/presentation/paint-presentation.js';
import {createHighPaintModel,HIGH_PAINT} from '../src/simple-paint/presentation/high/high-paint-model.js';
import {installHighPaintRenderer} from '../src/simple-paint/presentation/high/high-paint-renderer.js';
import {createPaintRenderState} from '../src/simple-paint/presentation/paint-render-state.js';
import {DRAWGRID_POINTER_SCREEN_RADIUS} from '../src/drawgrid/drawgrid-pointer-radius.js';
import {instrumentColour} from '../src/instrument-colours.js';
import {particleScreenPoint} from '../src/simple-paint-particles.js';

function environment(){
 let clock=0,serial=0;const callbacks=new Map(),canvases=[];
 const doc={hidden:false,addEventListener(){},removeEventListener(){},body:{append(c){canvases.push(c);}},createElement(){return {style:{},setAttribute(){},getContext:()=>null,remove(){this.removed=true;}};}};
 const win={innerWidth:800,innerHeight:600,devicePixelRatio:2,performance:{now:()=>clock},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),requestAnimationFrame(fn){callbacks.set(++serial,fn);return serial;},cancelAnimationFrame(id){callbacks.delete(id);}};
 return {doc,win,callbacks,canvases,time(t){clock=t;},options:{document:doc,window:win,worldToScreen:p=>({x:p.x*2+40,y:p.y*2-10}),getInstrument:()=> 'BELL'}};
}
test('quality parsing defaults safely and is independent of preset',()=>{
 for(const search of ['', '?quality=standard','?quality=invalid','?quality=HIGH'])assert.equal(resolveRenderQuality(search),'standard');
 assert.equal(resolveRenderQuality('?preset=simple-playtest&quality=high'),'high');
 assert.equal(resolvePreset('?preset=simple-playtest&quality=high'),PRESETS.simplePlaytest);
 assert.equal(Object.hasOwn(PRESETS.simplePlaytest,'renderQuality'),false);
});
test('Standard stays synchronous and never imports High; both receive identical pointer input',async()=>{
 const inputs=[];
 for(const quality of ['standard','high']){
  const e=environment(),events=[];let imports=0;
  const standard=()=>Object.fromEntries(['begin','move','release','stop'].map(k=>[k,p=>events.push([k,p&&{x:p.x,y:p.y}])]));
  const high=()=>({consume:s=>events.push([s.event,s.pointer&&['begin','move'].includes(s.event)?{x:s.pointer.x,y:s.pointer.y}:undefined]),stop(){}});
  const effect=installPaintPresentation({...e.options,quality},{standard,loadHigh:async()=>{imports++;return {installHighPaintRenderer:high};}});
  const p=Object.freeze({x:12,y:18});effect.begin(p);e.time(16);effect.move({x:22,y:21});e.time(32);effect.release();await effect.ready;
  assert.equal(imports,quality==='high'?1:0);inputs.push(events);
  const state=effect.getProof().presentation;assert.equal(state.colour,instrumentColour('BELL'));assert.equal(state.radius,DRAWGRID_POINTER_SCREEN_RADIUS);assert.deepEqual(state.transform,{x:40,y:-10,scale:2});assert.equal(state.drawing,false);
 }
 assert.deepEqual(inputs[0],inputs[1]);
});
test('failed import or unavailable WebGL2 falls back without losing drawing input',async()=>{
 for(const unavailable of ['import','context']){
  const e=environment(),events=[],warnings=[];
  const effect=installPaintPresentation({...e.options,quality:'high'},{standard:()=>({begin:p=>events.push(['begin',p.x,p.y]),move:p=>events.push(['move',p.x,p.y]),release:()=>events.push(['release']),stop(){}}),
   loadHigh:async()=>{if(unavailable==='import')throw Error('module failed');return {installHighPaintRenderer};},warn:(...args)=>warnings.push(args)});
  effect.begin({x:2,y:3});effect.move({x:5,y:7});effect.release();await effect.ready;
  assert.equal(effect.getProof().effectiveQuality,'standard');assert.equal(warnings.length,1);assert.ok(events.some(e=>e[0]==='begin'));assert.equal(events.at(-1)[0],'release');assert.equal(e.callbacks.size,0);
 }
});
test('cancel during lazy load cannot resurrect an effect',async()=>{
 const e=environment();let resolve,consumed=0;
 const effect=installPaintPresentation({...e.options,quality:'high'},{loadHigh:()=>new Promise(r=>resolve=r)});
 effect.begin({x:0,y:0});effect.stop();resolve({installHighPaintRenderer:()=>({consume(){consumed++;}})});await effect.ready;assert.equal(consumed,0);assert.equal(e.callbacks.size,0);
});
test('a runtime framebuffer failure falls back to Standard without replaying musical input',async()=>{
 const e=environment(),events=[],warnings=[];let fail,stopped=0;
 const effect=installPaintPresentation({...e.options,quality:'high'},{
  standard:()=>({begin:p=>events.push(['begin',p.x,p.y]),move(){},release(){},stop(){}}),
  loadHigh:async()=>({installHighPaintRenderer:options=>{fail=options.onFailure;return {consume(){},stop(){stopped++;}};}}),warn:(...args)=>warnings.push(args)
 });
 effect.begin({x:10,y:20});await effect.ready;effect.move({x:30,y:40});fail(Error('High liquid framebuffer incomplete'));
 assert.equal(effect.getProof().effectiveQuality,'standard');assert.deepEqual(events,[['begin',30,40]]);assert.equal(stopped,1);assert.equal(warnings.length,1);
});
test('reduced motion uses Standard without loading High',()=>{
 const e=environment();e.win.matchMedia=()=>({matches:true,addEventListener(){}});let loaded=false,begun=false;
 const effect=installPaintPresentation({...e.options,quality:'high'},{standard:()=>({begin(){begun=true;}}),loadHigh:()=>{loaded=true;}});effect.begin({x:0,y:0});assert.equal(loaded,false);assert.equal(begun,true);assert.equal(effect.getProof().effectiveQuality,'standard');
});
test('High model is dense, bounded, clears on release; world radius projects with zoom and pan',()=>{
 for(const scale of [.5,1,2]){
  const e=environment();e.options.worldToScreen=p=>({x:p.x*scale+80,y:p.y*scale-30});
  const capture=createPaintRenderState(e.options),m=createHighPaintModel({random:()=>.37});m.consume(capture('begin',{x:10,y:20}));
  for(let i=1;i<=120;i++){e.time(i*16);m.consume(capture('move',{x:10+i,y:20+Math.sin(i/10)*12}));m.step(i*16,{x:80,y:-30,scale});}
  const s=m.state(),t={x:80,y:-30,scale},center=particleScreenPoint(s.input.pointer,t);
  assert.equal(s.particles.length,1800);assert.equal(HIGH_PAINT.fluidRepulsionRadiusWorld,DRAWGRID_POINTER_SCREEN_RADIUS);
  for(const p of s.particles){const at=particleScreenPoint(p,t);assert.ok(Math.hypot(at.x-center.x,at.y-center.y)>=HIGH_PAINT.fluidRepulsionRadiusWorld*scale-.001);assert.ok(Math.hypot(p.vx,p.vy)<=105.001);}
  e.time(1920);m.consume(capture('release'));m.step(9000,t);assert.equal(m.active,false);assert.equal(m.state().particles.length,0);
 }
});
test('High pause settles around the finger and release gently fills the final channel',()=>{
 const m=createHighPaintModel({random:()=>.37}),transform={x:0,y:0,scale:1};
 const state={event:'begin',time:0,drawing:true,pointer:{x:0,y:0},transform};m.consume(state);
 for(let i=1;i<=180;i++)m.step(i*16,transform);
 assert.equal(m.state().particles.filter(p=>Math.hypot(p.x,p.y)<48).length,0);
 m.consume({...state,event:'release',time:2880,drawing:false});
 for(let i=1;i<=40;i++)m.step(2880+i*16,transform);
 assert.ok(m.state().particles.filter(p=>Math.hypot(p.x,p.y)<48).length>100);
 assert.ok(m.state().particles.every(p=>p.opacity===1));
 m.step(10000,transform);assert.equal(m.active,false);
});
test('presentation modules have no project/audio writes; actual drawing commit remains upstream',()=>{
 const source=readFileSync(new URL('../src/simple-draw-creation.js',import.meta.url),'utf8');
 assert.match(source,/const prepared=prepareBoardDrawing\(points\);particles.release\(\)/);
 for(const file of ['paint-presentation.js','paint-render-state.js','high/high-paint-renderer.js','high/high-paint-model.js']){
  const text=readFileSync(new URL('../src/simple-paint/presentation/'+file,import.meta.url),'utf8');
  assert.doesNotMatch(text,/localStorage|sessionStorage|\.commit\(|quantis|audio-scheduler|BoardObject/);
 }
});

test('High renderer aligns marker, resizes framebuffer, shares surface and releases idle resources',()=>{
 const e=environment(),uploads=[],viewports=[],deleted=[],releasedTargets=[];
 const gl={createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),createVertexArray:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getUniformLocation:()=>({}),isContextLost:()=>false,getExtension:()=>null,createTexture:()=>({}),createFramebuffer:()=>({}),FRAMEBUFFER_COMPLETE:true,checkFramebufferStatus:()=>true,deleteTexture:t=>releasedTargets.push(t),deleteFramebuffer:f=>releasedTargets.push(f),
  bufferData:(target,data)=>uploads.push([...data]),viewport:(...v)=>viewports.push(v),deleteBuffer:b=>deleted.push(b),deleteVertexArray:b=>deleted.push(b),deleteProgram:b=>deleted.push(b),deleteShader:b=>deleted.push(b)};
 for(const method of ['shaderSource','compileShader','attachShader','linkProgram','clearColor','clear','useProgram','bindVertexArray','bindBuffer','enableVertexAttribArray','vertexAttribPointer','uniform2f','uniform1f','enable','blendFuncSeparate','uniform3fv','uniform1i','drawArrays','bindTexture','texParameteri','texImage2D','bindFramebuffer','framebufferTexture2D','disable','blendFunc','activeTexture','disableVertexAttribArray','uniform4f'])gl[method]=()=>{};
 const colourContext={clearRect(){},fillRect(){},getImageData:()=>({data:[120,180,240,255]})};
 e.doc.createElement=()=>({style:{},setAttribute(){},addEventListener(){},remove(){this.removed=true;},getContext:type=>type==='webgl2'?gl:colourContext});
 const a=installHighPaintRenderer({...e.options,onFailure:error=>{throw error;}}),b=installHighPaintRenderer({...e.options,onFailure:error=>{throw error;}});
 const capture=createPaintRenderState(e.options),state=capture('begin',{x:10,y:20});a.consume(state);b.consume(state);
 assert.equal(e.canvases.length,1);assert.equal(e.callbacks.size,2);
 {const tasks=[...e.callbacks.values()];e.callbacks.clear();for(const fn of tasks)fn(16);}
 assert.equal(uploads[0][2],Math.fround(a.getProof().particles[0].size*2));
 assert.deepEqual(uploads.at(-1).slice(0,5),[60,30,Math.fround(HIGH_PAINT.fluidRepulsionRadiusWorld*4),0,0]);
 assert.deepEqual(uploads.at(-1).slice(5),[60,30,7,0,Math.fround(.8)]);
 assert.deepEqual(viewports.at(-1),[0,0,1600,1200]);
 e.win.innerWidth=1000;e.win.devicePixelRatio=1;a.consume({...state,event:'move'});
 {const tasks=[...e.callbacks.values()];e.callbacks.clear();for(const fn of tasks)fn(32);}assert.deepEqual(viewports.at(-1),[0,0,1000,600]);
 a.stop();assert.equal(e.canvases[0].removed,undefined);b.stop();assert.equal(e.canvases[0].removed,true);assert.equal(e.callbacks.size,0);assert.equal(deleted.length,12);assert.equal(releasedTargets.length,6);
 a.consume(state);a.consume({...state,event:'release',drawing:false,time:40});
 {const tasks=[...e.callbacks.values()];e.callbacks.clear();for(const fn of tasks)fn(1500);}assert.equal(a.getProof().active,false);assert.equal(e.callbacks.size,0);
 gl.checkFramebufferStatus=()=>false;a.consume(state);
 {const tasks=[...e.callbacks.values()];e.callbacks.clear();assert.throws(()=>tasks[0](16),/framebuffer incomplete/);}
 assert.equal(e.callbacks.size,0);assert.equal(e.canvases.at(-1).removed,true);assert.equal(releasedTargets.length,8);
});

