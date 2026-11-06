import {splatVertex,splatFragment,screenVertex,blurFragment,shadeFragment} from './high-liquid-shaders.js';
// One transparent, input-free board surface; Paint supplies transient visual batches.
const surfaces=new WeakMap();
export function highLiquidBufferSize(width,height){
 // Approximately two world units per texel, independent of camera/DPR/viewport.
 const scale=Math.min(.5,512/Math.max(width,height));
 const bucket=size=>Math.min(512,2**Math.ceil(Math.log2(Math.max(1,size))));
 return [bucket(width*scale),bucket(height*scale)];
}
export function acquireHighQualityBoardRenderer({document:doc,window:win}){
 if(surfaces.has(doc))return surfaces.get(doc);
 const canvas=doc.createElement('canvas');canvas.className='high-quality-board-effects';canvas.setAttribute('aria-hidden','true');
 Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'22'});
 let gl,buffer,pointVao,screenVao,points,blur,shade,targets=[],fieldWidth=0,fieldHeight=0,closed=false;
 const effects=new Map(),colourCache=new Map(),resources=[];
 function own(handle,deleter){if(!handle)throw Error('High liquid WebGL allocation failed');resources.push([handle,deleter]);return handle;}
 function clearTargets(){for(const t of targets){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.framebuffer);}targets=[];}
 function cleanup(){
  if(closed)return;closed=true;
  if(gl){clearTargets();for(const [handle,deleter] of resources.reverse())gl[deleter](handle);gl.getExtension('WEBGL_lose_context')?.loseContext();}
  canvas.remove();surfaces.delete(doc);
 }
 function program(vertex,fragment,names){
  const shaders=[vertex,fragment].map((source,i)=>{const shader=own(gl.createShader(i?gl.FRAGMENT_SHADER:gl.VERTEX_SHADER),'deleteShader');gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;});
  const handle=own(gl.createProgram(),'deleteProgram');for(const s of shaders)gl.attachShader(handle,s);gl.linkProgram(handle);if(!gl.getProgramParameter(handle,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(handle));
  return {handle,u:Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(handle,n)]))};
 }
 function resizeTargets(w,h){
  // Grow in buckets, never churn textures as the wake bounds move a few world units.
  w=Math.max(w,fieldWidth);h=Math.max(h,fieldHeight);
  if(w===fieldWidth&&h===fieldHeight)return;
  clearTargets();fieldWidth=w;fieldHeight=h;
  for(let i=0;i<3;i++){
   const t={texture:null,framebuffer:null};targets.push(t);
   t.texture=gl.createTexture();if(!t.texture)throw Error('High liquid texture allocation failed');
   t.framebuffer=gl.createFramebuffer();if(!t.framebuffer)throw Error('High liquid framebuffer allocation failed');
   gl.bindTexture(gl.TEXTURE_2D,t.texture);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   // RGBA8 avoids optional floating-point-render/blend extensions. Dense peaks saturate gently.
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
   gl.bindFramebuffer(gl.FRAMEBUFFER,t.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t.texture,0);
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('High liquid framebuffer incomplete');
  }
 }
 try{
  gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false});if(!gl)throw Error('WebGL2 unavailable');
  points=program(splatVertex,splatFragment,['viewport','pixelScale','marker','colour']);
  blur=program(screenVertex,blurFragment,['field','axis']);shade=program(screenVertex,shadeFragment,['field','texel','colour','domain']);
  buffer=own(gl.createBuffer(),'deleteBuffer');pointVao=own(gl.createVertexArray(),'deleteVertexArray');screenVao=own(gl.createVertexArray(),'deleteVertexArray');
 }catch(error){cleanup();throw error;}
 const swatch=doc.createElement('canvas');swatch.width=swatch.height=1;const colourContext=swatch.getContext('2d',{willReadFrequently:true});
 if(!colourContext){cleanup();throw Error('Instrument colour conversion unavailable');}
 function rgb(value){
  if(!colourCache.has(value)){colourContext.clearRect(0,0,1,1);colourContext.fillStyle=value;colourContext.fillRect(0,0,1,1);colourCache.set(value,Array.from(colourContext.getImageData(0,0,1,1).data).slice(0,3).map(v=>v/255));}
  return colourCache.get(value);
 }
 function bindPoints(width,height,pixelScale,isMarker,pixelScaleY=pixelScale){
  gl.useProgram(points.handle);gl.bindVertexArray(pointVao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  const stride=isMarker?20:32;
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,4,gl.FLOAT,false,stride,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,1,gl.FLOAT,false,stride,16);
  if(isMarker)gl.disableVertexAttribArray(2);else{gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,3,gl.FLOAT,false,stride,20);}
  gl.uniform2f(points.u.viewport,width,height);gl.uniform2f(points.u.pixelScale,pixelScale,pixelScaleY);gl.uniform1i(points.u.marker,isMarker);
 }
 function screenPass(p,texture){
  gl.useProgram(p.handle);gl.bindVertexArray(screenVao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(p.u.field,0);
 }
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();for(const e of [...effects.values()])e.onFailure(Error('WebGL context lost'));});
 doc.body.append(canvas);
 const api={
  register(id,getBatch,onFailure){effects.set(id,{getBatch,onFailure});},
  unregister(id){effects.delete(id);if(!effects.size)cleanup();},
  render(){
   if(closed||gl.isContextLost())throw Error('WebGL context lost');
   const width=Math.max(1,win.innerWidth),height=Math.max(1,win.innerHeight),dpr=Math.max(1,Math.min(2,win.devicePixelRatio||1));
   const w=Math.round(width*dpr),h=Math.round(height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
   for(const effect of effects.values()){
    const batch=effect.getBatch();if(!batch||!batch.count)continue;
    const [requestedWidth,requestedHeight]=highLiquidBufferSize(batch.worldDomain.width,batch.worldDomain.height);resizeTargets(requestedWidth,requestedHeight);
    const fw=fieldWidth,fh=fieldHeight;
    const domain=batch.domain;
    // Density + activity accumulation, then separable blur. No particle-core pass.
    gl.bindFramebuffer(gl.FRAMEBUFFER,targets[0].framebuffer);gl.viewport(0,0,fw,fh);gl.clear(gl.COLOR_BUFFER_BIT);
    bindPoints(domain.width,domain.height,fw/domain.width,0,fh/domain.height);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
    gl.bufferData(gl.ARRAY_BUFFER,batch.data,gl.DYNAMIC_DRAW);gl.drawArrays(gl.POINTS,0,batch.count);
    gl.disable(gl.BLEND);
    const blurSize=batch.blurScreen??3;
    for(let axis=0;axis<2;axis++){
     gl.bindFramebuffer(gl.FRAMEBUFFER,targets[axis+1].framebuffer);screenPass(blur,targets[axis].texture);
     gl.uniform2f(blur.u.axis,axis?0:blurSize/domain.width,axis?blurSize/domain.height:0);gl.drawArrays(gl.TRIANGLES,0,3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);screenPass(shade,targets[2].texture);
    gl.uniform2f(shade.u.texel,1/fw,1/fh);gl.uniform3fv(shade.u.colour,rgb(batch.colour));
    gl.uniform4f(shade.u.domain,domain.left/width,(height-domain.top-domain.height)/height,domain.width/width,domain.height/height);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.drawArrays(gl.TRIANGLES,0,3);
    if(batch.marker){bindPoints(width,height,dpr,1);gl.uniform3fv(points.u.colour,rgb(batch.colour));gl.bufferData(gl.ARRAY_BUFFER,batch.marker,gl.DYNAMIC_DRAW);gl.drawArrays(gl.POINTS,0,batch.marker.length/5);}
   }
   return {framebuffer:[w,h],densityBuffer:[fieldWidth,fieldHeight],densityBytes:fieldWidth*fieldHeight*4*3,effects:effects.size,renderTechnique:'world density + advected disturbance + edge/flow shade'};
  },get canvas(){return canvas;}
 };
 surfaces.set(doc,api);return api;
}
