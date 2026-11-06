import {HIGH_FLUID,fluidGrid,fluidOrigin,fluidRecenter} from './fluid-config.js';
import {fieldVertex,solverFragment,compositeFragment,reductionFragment} from './fluid-shaders.js';

// Eulerian GPU fields only. No CPU particles, rest targets or neighbour simulation.
// A caller supplies the GL context, allowing this effect to join a board layer later.
export function createGPUFluid(gl,{coarse=false}={}){
 const grid=fluidGrid(coarse),owned=[],targets=[];let disposed=false;
 let origin={x:0,y:0},previous={x:0,y:0},vi=0,mi=0,pi=0,stepsRun=0;
 function own(value,method){if(!value)throw Error('GPU fluid allocation failed');owned.push([value,method]);return value;}
 function program(fragment,names){
  const shaders=[fieldVertex,fragment].map((source,i)=>{
   const s=own(gl.createShader(i?gl.FRAGMENT_SHADER:gl.VERTEX_SHADER),'deleteShader');gl.shaderSource(s,source);gl.compileShader(s);
   if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('GPU fluid shader: '+gl.getShaderInfoLog(s));return s;
  });
  const handle=own(gl.createProgram(),'deleteProgram');for(const s of shaders)gl.attachShader(handle,s);gl.linkProgram(handle);
  if(!gl.getProgramParameter(handle,gl.LINK_STATUS))throw Error('GPU fluid link: '+gl.getProgramInfoLog(handle));
  return {handle,u:Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(handle,n)]))};
 }
 function target(width,height,packed=false){
  const texture=own(gl.createTexture(),'deleteTexture'),framebuffer=own(gl.createFramebuffer(),'deleteFramebuffer');
  gl.bindTexture(gl.TEXTURE_2D,texture);
  for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.NEAREST);
  for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,packed?gl.RGBA8:gl.RGBA16F,width,height,0,gl.RGBA,packed?gl.UNSIGNED_BYTE:gl.HALF_FLOAT,null);
  gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('GPU fluid floating-point framebuffer unavailable');
  const t={texture,framebuffer,width,height,bytes:width*height*(packed?4:8)};targets.push(t);return t;
 }
 function destroy(){if(disposed)return;disposed=true;for(const [value,method] of owned.reverse())gl[method](value);}
 let solve,composite,reduce,vao,velocity,material,pressure,divergence,zero,packed,pyramid,sceneTexture;
 try{
  if(!gl.getExtension('EXT_color_buffer_float'))throw Error('GPU fluid requires EXT_color_buffer_float');
  solve=program(solverFragment,['velocity','material','pressure','divergence','pass','extent','origin','shift','pointer','pointerVelocity','radius','brushActive','dt','cell','maxSpeed','viscosity','densityDiffusion','velocityDecay','disturbanceDecay','heightRecovery','heightSmoothing','surfaceDepth','strokeStart','wakeDiffusion']);
  composite=program(compositeFragment,['material','velocity','pressure','viewport','camera','origin','extent','colour','cursor','drawing','background','hasBackground','domainFadeWorld','debugView']);
  reduce=program(reductionFragment,['source','velocity','first']);vao=own(gl.createVertexArray(),'deleteVertexArray');
  sceneTexture=own(gl.createTexture(),'deleteTexture');gl.bindTexture(gl.TEXTURE_2D,sceneTexture);
  for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);
  for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
  const full=()=>target(grid.width,grid.height);
  velocity=[full(),full()];material=[full(),full()];pressure=[full(),full()];divergence=full();
  zero=target(1,1,true);packed=target(1,1,true);pyramid=[];
  let w=grid.width,h=grid.height;
  while(w>1||h>1){w=Math.ceil(w/2);h=Math.ceil(h/2);pyramid.push(target(w,h));}
 }catch(error){destroy();throw error;}
 function bind(t){gl.bindFramebuffer(gl.FRAMEBUFFER,t?.framebuffer??null);if(t)gl.viewport(0,0,t.width,t.height);}
 function clear(t,r=0,g=0,b=0,a=0){bind(t);gl.clearColor(r,g,b,a);gl.clear(gl.COLOR_BUFFER_BIT);}
 function texture(unit,t,uniform){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t.texture);gl.uniform1i(uniform,unit);}
 function draw(t,pass){
  bind(t);gl.uniform1i(solve.u.pass,pass);
  // All samplers are statically active in the multi-pass program. Never bind its
  // destination as a source, even for a branch that does not sample that channel.
  const sources=[velocity[vi],material[mi],pressure[pi],divergence];
  ['velocity','material','pressure','divergence'].forEach((n,i)=>texture(i,sources[i]===t?zero:sources[i],solve.u[n]));
  gl.drawArrays(gl.TRIANGLES,0,3);
 }
 function reset(point){
  origin=fluidOrigin(point,grid);previous={x:point.x,y:point.y};vi=mi=pi=stepsRun=0;
  gl.disable(gl.BLEND);gl.bindVertexArray(vao);
  for(const t of targets)clear(t);for(const t of material)clear(t,1,0,0,8);
 }
 function step(elapsed,pointer,drawing=true){
  if(disposed)throw Error('GPU fluid disposed');if(gl.isContextLost())throw Error('GPU fluid context lost');
  const dt=Math.max(0,Math.min(HIGH_FLUID.maxDt,elapsed));if(!dt)return;
  const nextOrigin=fluidRecenter(pointer,origin,grid),shift={x:nextOrigin.x-origin.x,y:nextOrigin.y-origin.y};origin=nextOrigin;
  const dx=pointer.x-previous.x,dy=pointer.y-previous.y,travel=Math.hypot(dx,dy);
  const speed=drawing?Math.min(HIGH_FLUID.maxSpeed,travel/Math.max(elapsed,.001)):0;
  const vx=travel?dx/travel*speed:0,vy=travel?dy/travel*speed:0;
  const count=Math.max(1,Math.min(16,Math.max(Math.ceil(dt/HIGH_FLUID.substep),Math.ceil(travel/(HIGH_FLUID.radiusWorld*.25))))),h=dt/count;
  gl.disable(gl.BLEND);gl.bindVertexArray(vao);gl.useProgram(solve.handle);
  gl.uniform2f(solve.u.extent,grid.worldWidth,grid.worldHeight);gl.uniform2f(solve.u.origin,origin.x,origin.y);
  gl.uniform2f(solve.u.pointerVelocity,vx,vy);gl.uniform1f(solve.u.radius,HIGH_FLUID.radiusWorld);gl.uniform1f(solve.u.brushActive,drawing?1:0);
  for(const key of ['maxSpeed','viscosity','densityDiffusion','velocityDecay','disturbanceDecay','heightRecovery','heightSmoothing','surfaceDepth','wakeDiffusion'])gl.uniform1f(solve.u[key],HIGH_FLUID[key]);
  gl.uniform1f(solve.u.cell,grid.cellSize);gl.uniform1f(solve.u.dt,h);
  for(let sub=0;sub<count;sub++){
   gl.uniform2f(solve.u.shift,sub?0:shift.x,sub?0:shift.y);
   gl.uniform2f(solve.u.strokeStart,previous.x+dx*sub/count,previous.y+dy*sub/count);
   gl.uniform2f(solve.u.pointer,previous.x+dx*(sub+1)/count,previous.y+dy*(sub+1)/count);
   draw(velocity[1-vi],0);vi=1-vi;draw(divergence,1);
   clear(pressure[0]);pi=0;
   for(let j=0;j<HIGH_FLUID.pressureIterations;j++){draw(pressure[1-pi],2);pi=1-pi;}
   draw(velocity[1-vi],3);vi=1-vi;
   draw(material[1-mi],4);mi=1-mi;stepsRun++;
  }
  previous={x:pointer.x,y:pointer.y};
 }
 function render({width,height,dpr=1,transform,colour,cursor,drawing,background=null,debugView=0}){
  if(disposed||gl.isContextLost())throw Error('GPU fluid context lost');
  bind(null);gl.viewport(0,0,Math.round(width*dpr),Math.round(height*dpr));gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.BLEND);gl.bindVertexArray(vao);gl.useProgram(composite.handle);
  texture(0,material[mi],composite.u.material);texture(1,velocity[vi],composite.u.velocity);texture(2,pressure[pi],composite.u.pressure);
  texture(3,{texture:sceneTexture},composite.u.background);
  if(background)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,background);
  gl.uniform1f(composite.u.hasBackground,background?1:0);
  gl.uniform1f(composite.u.domainFadeWorld,HIGH_FLUID.domainFadeWorld);gl.uniform1i(composite.u.debugView,debugView);
  gl.uniform2f(composite.u.viewport,width,height);gl.uniform3f(composite.u.camera,transform.x,transform.y,transform.scale);
  gl.uniform2f(composite.u.origin,origin.x,origin.y);gl.uniform2f(composite.u.extent,grid.worldWidth,grid.worldHeight);
  gl.uniform3fv(composite.u.colour,colour);gl.uniform2f(composite.u.cursor,cursor.x,cursor.y);gl.uniform1f(composite.u.drawing,drawing?1:0);
  gl.drawArrays(gl.TRIANGLES,0,3);
 }
 function activity(){
  gl.disable(gl.BLEND);gl.bindVertexArray(vao);gl.useProgram(reduce.handle);let source=material[mi];
  for(let i=0;i<pyramid.length;i++){
   bind(pyramid[i]);texture(0,source,reduce.u.source);texture(1,velocity[vi],reduce.u.velocity);gl.uniform1i(reduce.u.first,i?0:1);gl.drawArrays(gl.TRIANGLES,0,3);source=pyramid[i];
  }
  bind(packed);texture(0,source,reduce.u.source);gl.uniform1i(reduce.u.first,2);gl.drawArrays(gl.TRIANGLES,0,3);
  const bytes=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
  return {disturbance:bytes[0]/255,speed:bytes[1]/255*HIGH_FLUID.maxSpeed};
 }
 // Explicit diagnostics for GPU fixtures only; production uses the 1-pixel reduction.
 function debugRead(name='material'){
  const t=name==='velocity'?velocity[vi]:name==='divergence'?divergence:material[mi];bind(t);
  const data=new Float32Array(t.width*t.height*4);gl.readPixels(0,0,t.width,t.height,gl.RGBA,gl.FLOAT,data);return data;
 }
 // Synthetic field fixtures only, for reconstruction and domain-edge tests.
 function debugWriteMaterial(data){
  if(data.length!==grid.width*grid.height*4)throw Error('Invalid material fixture size');
  gl.bindTexture(gl.TEXTURE_2D,material[mi].texture);
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,grid.width,grid.height,gl.RGBA,gl.FLOAT,data);
 }
 return {reset,step,render,activity,debugRead,debugWriteMaterial,destroy,grid,
  get state(){return {origin:{...origin},steps:stepsRun,textureBytes:targets.reduce((n,t)=>n+t.bytes,0),backend:'gpu-field',pressureIterations:HIGH_FLUID.pressureIterations};}};
}
