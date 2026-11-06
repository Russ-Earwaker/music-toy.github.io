import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HIGH_FLUID,fluidGrid,fluidOrigin,fluidRecenter} from '../src/simple-paint/presentation/fluid/fluid-config.js';
import {createGPUFluid} from '../src/simple-paint/presentation/fluid/gpu-fluid.js';
import {installHighFluidRenderer} from '../src/simple-paint/presentation/fluid/high-fluid-renderer.js';
import {installPaintPresentation,resolveHighPaintBackend} from '../src/simple-paint/presentation/paint-presentation.js';
import {DRAWGRID_POINTER_SCREEN_RADIUS} from '../src/drawgrid/drawgrid-pointer-radius.js';
import {createFluidGPUTimer} from '../src/simple-paint/presentation/fluid/fluid-gpu-timer.js';

function gpuMock({supported=true,complete=true}={}){
 let serial=0,bound=null,unit=0,currentProgram=null;const live=new Set(),bindings=new Map(),attachments=new Map(),passes=[],uploads=new Map();
 const make=()=>{const h={id:++serial};live.add(h);return h;},drop=h=>live.delete(h);
 const gl={TEXTURE0:100,FRAMEBUFFER_COMPLETE:1,createShader:make,createProgram:make,createTexture:make,createFramebuffer:make,createVertexArray:make,
  uniform1f:(n,v)=>{assert.ok(Number.isFinite(v),'finite shader parameter '+n);uploads.set(n,v);},getExtension:name=>name==='EXT_color_buffer_float'&&supported?{}:null,getShaderParameter:()=>true,getProgramParameter:()=>true,getUniformLocation:(_,n)=>n,
  checkFramebufferStatus:()=>complete?1:0,isContextLost:()=>false,bindFramebuffer:(_,h)=>bound=h,activeTexture:u=>unit=u-100,bindTexture:(_,h)=>bindings.set(unit,h),framebufferTexture2D:(_,a,b,h)=>attachments.set(bound,h),
  useProgram:p=>currentProgram=p,uniform1i:(n,v)=>{if(n==='pass')passes.push(v);},readPixels:(x,y,w,h,f,t,a)=>a.fill(0)};
 for(const name of ['deleteShader','deleteProgram','deleteTexture','deleteFramebuffer','deleteVertexArray'])gl[name]=drop;
 for(const name of ['shaderSource','compileShader','attachShader','linkProgram','texParameteri','texImage2D','viewport','clearColor','clear','disable','bindVertexArray','uniform2f','uniform3f','uniform3fv'])gl[name]=()=>{};
 gl.drawArrays=()=>{if(bound&&attachments.get(bound))assert.ok(![...bindings.values()].includes(attachments.get(bound)),'no destination texture may be sampled');assert.ok(currentProgram);};
 return {gl,live,passes,uploads};
}
function environment(){
 let clock=0,id=0,scale=1,x=10,y=20;const frames=new Map(),canvases=[],calls=[],mock=gpuMock();
 const colourContext={clearRect(){},fillRect(){},getImageData:()=>({data:[60,140,220,255]})};
 const doc={hidden:false,addEventListener(){},removeEventListener(){},body:{append:c=>canvases.push(c)},createElement(){return {style:{},width:0,height:0,setAttribute(){},addEventListener(){},remove(){this.removed=true;},getContext:type=>type==='webgl2'?mock.gl:colourContext};}};
 const win={innerWidth:800,innerHeight:600,devicePixelRatio:1,performance:{now:()=>clock},matchMedia:()=>({matches:false,addEventListener(){}}),requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:n=>frames.delete(n)};
 const engine={grid:fluidGrid(),state:{origin:{x:-768,y:-512},textureBytes:1000},reset:p=>calls.push(['reset',{...p}]),step:(dt,p,drawing)=>calls.push(['step',dt,{...p},drawing]),render:args=>calls.push(['render',args]),activity:()=>({disturbance:0,speed:0}),destroy:()=>calls.push(['destroy'])};
 const options={document:doc,window:win,worldToScreen:p=>({x:p.x*scale+x,y:p.y*scale+y}),getInstrument:()=> 'PIANO',createEngine:()=>engine,onFailure:e=>{throw e;}};
 function tick(time){clock=time;const tasks=[...frames.values()];frames.clear();for(const fn of tasks)fn(time);}
 const state=(event,time,px=20,py=30)=>({event,time,pointer:{x:px,y:py,time},drawing:event!=='release'});
 return {doc,win,engine,options,frames,canvases,calls,mock,tick,state,camera(s,ox,oy){scale=s;x=ox;y=oy;}};
}

test('High defaults to a GPU field; the successful particle prototype is an explicit comparison backend',()=>{
 for(const value of [undefined,null,'fluid','invalid'])assert.equal(resolveHighPaintBackend(value),'fluid');assert.equal(resolveHighPaintBackend('particles'),'particles');
 const source=readFileSync(new URL('../src/simple-paint/presentation/paint-presentation.js',import.meta.url),'utf8');assert.match(source,/fluid\/high-fluid-renderer/);
 for(const file of ['fluid-config.js','gpu-fluid.js','fluid-shaders.js','high-fluid-renderer.js']){
  const s=readFileSync(new URL('../src/simple-paint/presentation/fluid/'+file,import.meta.url),'utf8');assert.doesNotMatch(s,/high-paint-model|high-disturbance-field|high-quality-board-renderer|createPaintParticleModel|restX|restY/);
 }
});
test('fixed world grid and origin scrolling are independent of the camera',()=>{
 const g=fluidGrid();assert.deepEqual([g.width,g.height,g.cellSize],[256,160,8]);assert.equal(HIGH_FLUID.radiusWorld,DRAWGRID_POINTER_SCREEN_RADIUS);
 const p={x:10,y:20},o=fluidOrigin(p,g);assert.equal(fluidRecenter(p,o,g),o);
 const shifted=fluidRecenter({x:1800,y:20},o,g);assert.notDeepEqual(shifted,o);assert.equal(Math.abs(shifted.x%(g.cellSize*8)),0);
 assert.equal(fluidGrid(true).width,192);assert.ok(fluidGrid(true).worldWidth>=g.worldWidth);
 const edgePoint={x:o.x+g.worldWidth-g.cellSize*24+1,y:20};
 const scroll=fluidRecenter(edgePoint,o,g);
 assert.equal(scroll.x-o.x,g.cellSize*8,'scroll one bucket rather than discard half the wake');assert.equal(scroll.y,o.y);
});
test('GPU fields dispatch projection/transport without feedback and release every GL allocation',()=>{
 const {gl,live,passes,uploads}=gpuMock(),fluid=createGPUFluid(gl);fluid.reset({x:0,y:0});
 fluid.step(1/60,{x:8,y:0},true);assert.ok([0,1,2,3,4,5,6].every(n=>passes.includes(n)));assert.ok(passes.filter(n=>n===2).length>=HIGH_FLUID.pressureIterations);
 for(const name of ['restDepth','pressRate','closureDiffusion','lateLevelingDiffusion'])assert.equal(uploads.get(name),HIGH_FLUID[name],'upload '+name);
 assert.equal(fluid.state.backend,'gpu-field');assert.equal(fluid.state.restDepth,HIGH_FLUID.restDepth);assert.ok(fluid.state.textureBytes<4*1024*1024);
 const count=fluid.state.steps;fluid.step(0,{x:8,y:0});assert.equal(fluid.state.steps,count);
 fluid.render({width:800,height:600,dpr:2,transform:{x:10,y:20,scale:.5},colour:[.2,.5,1],cursor:{x:14,y:20},drawing:true});fluid.activity();
 fluid.destroy();fluid.destroy();assert.equal(live.size,0);
});
test('missing float targets or failed allocations reject cleanly for Standard fallback',()=>{
 assert.throws(()=>createGPUFluid(gpuMock({supported:false}).gl),/EXT_color_buffer_float/);
 const {gl,live}=gpuMock({complete:false});assert.throws(()=>createGPUFluid(gl),/framebuffer unavailable/);assert.equal(live.size,0);
});
test('renderer creates lazily, transforms only presentation, sleeps/resumes, and destroys after quiet release',()=>{
 const e=environment(),r=installHighFluidRenderer(e.options);assert.equal(e.calls.length,0);assert.equal(e.frames.size,0);
 r.consume(e.state('begin',0));e.tick(16);assert.equal(e.calls.filter(c=>c[0]==='reset').length,1);
 e.camera(.5,40,-20);e.win.devicePixelRatio=2;e.tick(16);
 const render=e.calls.filter(c=>c[0]==='render').at(-1)[1];assert.deepEqual(render.transform,{x:40,y:-20,scale:.5});assert.deepEqual(render.cursor,{x:50,y:-5});assert.equal(e.canvases[0].width,1600);
 assert.equal(e.calls.filter(c=>c[0]==='reset').length,1);assert.equal(r.getProof().backend,'gpu-field');
 e.tick(750);assert.equal(r.getProof().dormant,true);assert.equal(e.frames.size,0);
 r.consume(e.state('move',770));assert.equal(e.frames.size,0);
 const stepsBefore=e.calls.filter(c=>c[0]==='step').length;e.camera(2,0,0);r.refresh();r.refresh();e.tick(780);
 assert.equal(e.calls.filter(c=>c[0]==='step').length,stepsBefore);assert.equal(r.getProof().dormant,true);assert.equal(e.frames.size,0);
 r.refresh();r.consume(e.state('move',800,30,40));assert.equal(e.frames.size,1);e.tick(816);assert.equal(e.calls.filter(c=>c[0]==='step').length,stepsBefore+1);
 r.consume(e.state('release',820,30,40));e.tick(1100);assert.equal(e.frames.size,0);assert.equal(r.getProof().active,false);assert.equal(e.canvases[0].removed,true);assert.equal(e.calls.filter(c=>c[0]==='destroy').length,1);
});
test('hidden/cancelled fields stop all work',()=>{
 const e=environment(),r=installHighFluidRenderer(e.options);r.consume(e.state('begin',0));e.doc.hidden=true;e.tick(16);assert.equal(e.frames.size,0);assert.equal(r.getProof().active,false);
 e.doc.hidden=false;r.consume(e.state('begin',30));r.consume(e.state('stop',40));assert.equal(e.frames.size,0);assert.equal(r.getProof().active,false);
});
test('default GPU backend falls back to Standard when float support is missing',async()=>{
 const e=environment();e.mock.gl.getExtension=()=>null;const calls=[],warnings=[];
 const r=installPaintPresentation({...e.options,quality:'high',createEngine:undefined},{standard:()=>({begin:p=>calls.push({...p}),stop(){}}),warn:(...args)=>warnings.push(args)});
 r.begin({x:12,y:34});await r.ready;assert.equal(r.getProof().effectiveQuality,'standard');assert.equal(warnings.length,1);assert.equal(calls[0].x,12);assert.equal(e.frames.size,0);
});
test('optional GPU timing remains asynchronous, bounded and disposable',()=>{
 let ready=false,serial=0;const live=new Set(),ext={TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2};
 const gl={QUERY_RESULT_AVAILABLE:3,QUERY_RESULT:4,getExtension:()=>ext,createQuery(){const q=++serial;live.add(q);return q;},beginQuery(){},endQuery(){},getQueryParameter:(_,which)=>which===3?ready:2e6,getParameter:()=>false,deleteQuery:q=>live.delete(q)};
 const timer=createFluidGPUTimer(gl);for(let i=0;i<8;i++){timer.begin();timer.end();}assert.equal(live.size,3);assert.equal(timer.gpuMs,null);
 ready=true;timer.begin();assert.equal(timer.gpuMs,2);assert.equal(timer.samples,3);assert.equal(live.size,1);timer.end();timer.destroy();assert.equal(live.size,0);
});
test('GPU timing is optional and never blocks an unsupported device',()=>{
 const timer=createFluidGPUTimer({getExtension:()=>null});timer.begin();timer.end();timer.destroy();assert.equal(timer.supported,false);assert.equal(timer.gpuMs,null);
});
