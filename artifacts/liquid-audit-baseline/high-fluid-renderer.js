import {createFluidScene} from './fluid-scene.js';
import {particleTransform as boardTransform,particleScreenPoint as boardScreenPoint} from '../../../simple-paint-particles.js';
import {instrumentColour} from '../../../instrument-colours.js';
import {HIGH_FLUID} from './fluid-config.js';
import {createGPUFluid} from './gpu-fluid.js';
import {createFluidGPUTimer} from './fluid-gpu-timer.js';

// Same presentation/lifecycle contract, wholly separate simulation/rendering backend.
export function installHighFluidRenderer({worldToScreen,getInstrument=()=> 'PIANO',document:doc=globalThis.document,window:win=globalThis.window,onFailure=console.warn,createEngine=createGPUFluid,getBackgroundLayer}={}){
 let canvas=null,gl=null,engine=null,timer=null,frame=null,input=null,lastTime=0,releasedAt=null,lastCheck=0,lastMotionAt=0,dormant=false,renderOnly=false;
 const scene=createFluidScene({document:doc,window:win,getBackgroundLayer});
 let lastActivity={disturbance:0,speed:0},grid=null,colour='';
 const timing={simulationMs:0,renderMs:0,activityMs:0,gpuMs:null,gpuMeanMs:null,gpuSamples:0,framebuffer:[0,0]};
 const swatch=doc.createElement('canvas');swatch.width=swatch.height=1;let colourContext=null,cachedColour='',rgb=[0,0,0];
 function stop(){
  if(frame!==null)win.cancelAnimationFrame(frame);frame=null;
  timer?.destroy();timer=null;
  const current=engine;engine=null;current?.destroy();
  gl?.getExtension('WEBGL_lose_context')?.loseContext();gl=null;canvas?.remove();canvas=null;scene.destroy();input=null;dormant=renderOnly=false;
 }
 function fail(error){stop();onFailure(error);}
 function schedule(){if(frame===null&&engine)frame=win.requestAnimationFrame(tick);}
 function refresh(){if(engine){renderOnly=renderOnly||dormant;dormant=false;schedule();}}
 const viewEvents=['resize','board:scale','board:responsive-scale'];
 for(const event of viewEvents)win.addEventListener?.(event,refresh);
 function colourRGB(value){
  if(value!==cachedColour){
   colourContext??=swatch.getContext('2d',{willReadFrequently:true});if(!colourContext)throw Error('GPU fluid instrument colour conversion unavailable');
   colourContext.clearRect(0,0,1,1);colourContext.fillStyle=value;colourContext.fillRect(0,0,1,1);
   rgb=Array.from(colourContext.getImageData(0,0,1,1).data).slice(0,3).map(v=>v/255);cachedColour=value;
  }
  return rgb;
 }
 function tick(time){
  frame=null;if(!engine)return;if(doc.hidden){stop();return;}
  try{
   timer.begin();
   const elapsed=Math.max(0,(time-lastTime)/1000),refreshOnly=renderOnly;lastTime=time;renderOnly=false;
   const started=performance.now();if(!refreshOnly)engine.step(elapsed,input.pointer,input.drawing);timing.simulationMs=performance.now()-started;
   if(releasedAt!==null&&time-releasedAt>HIGH_FLUID.releaseCeilingMs){stop();return;}
   const renderStart=performance.now(),transform=boardTransform(worldToScreen);
   const width=Math.max(1,win.innerWidth),height=Math.max(1,win.innerHeight),dpr=Math.max(1,Math.min(2,win.devicePixelRatio||1));
   const w=Math.round(width*dpr),h=Math.round(height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
   const background=scene.capture({width,height,dpr,transform});
   colour=instrumentColour(getInstrument());
   engine.render({width,height,dpr,transform,background,colour:colourRGB(colour),cursor:boardScreenPoint(input.pointer,transform),drawing:input.drawing});
   timing.renderMs=performance.now()-renderStart;timing.framebuffer=[w,h];
   timer.end();timing.gpuMs=timer.gpuMs;timing.gpuMeanMs=timer.meanMs;timing.gpuSamples=timer.samples;
   if(refreshOnly){dormant=true;return;}
   // Readback is explicitly outside the timer interval: it can synchronize the
   // driver, so including its CPU wait would mislabel idle time as simulation work.
   if(time-lastCheck>=250){
    const checkStart=performance.now();lastActivity=engine.activity();timing.activityMs=performance.now()-checkStart;lastCheck=time;
    const quiet=lastActivity.disturbance<.012&&lastActivity.speed<3;
    if(releasedAt!==null&&quiet){stop();return;}
    dormant=quiet&&input.drawing&&time-lastMotionAt>600;
   }
   if(!dormant)schedule();
  }catch(error){fail(error);}
 }
 return {
  consume(state){
   if(state.event==='stop'){stop();return;}
   try{
    if(state.event==='begin'){
     stop();canvas=doc.createElement('canvas');canvas.className='high-fluid-board-effects';canvas.setAttribute('aria-hidden','true');
     Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'22'});
     const element=canvas;element.addEventListener('webglcontextlost',event=>{event.preventDefault();if(canvas===element&&engine)fail(Error('GPU fluid context lost'));});
     gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false});if(!gl)throw Error('WebGL2 unavailable');
     engine=createEngine(gl,{coarse:win.matchMedia('(pointer: coarse)').matches});timer=createFluidGPUTimer(gl);engine.reset(state.pointer);grid=engine.grid;
     doc.body.append(canvas);lastTime=lastCheck=lastMotionAt=state.time;releasedAt=null;lastActivity={disturbance:0,speed:0};
    }
    if(!engine)return;
    const moved=!input||Math.hypot(state.pointer.x-input.pointer.x,state.pointer.y-input.pointer.y)>.001;
    if(moved)lastMotionAt=state.time;
    if(dormant&&state.event==='move'&&!moved){input=state;return;}
    if(moved||state.event==='release')renderOnly=false;
    if(dormant)lastTime=Math.max(lastTime,state.time-33);
    input=state;dormant=false;if(state.event==='release')releasedAt=state.time;schedule();
   }catch(error){fail(error);}
  },stop,refresh,destroy(){stop();scene.destroy();for(const event of viewEvents)win.removeEventListener?.(event,refresh);},
  getProof:()=>({backend:'gpu-field',active:!!engine,drawing:!!engine&&!!input?.drawing,dormant,cellCount:engine?grid.width*grid.height:0,
   fieldResolution:grid?[grid.width,grid.height]:null,worldDomain:engine?{...engine.state.origin,width:grid.worldWidth,height:grid.worldHeight}:null,
   textureBytes:engine?.state.textureBytes??0,pressureIterations:HIGH_FLUID.pressureIterations,activity:{...lastActivity},colour,input,timing:{...timing}})
 };
}
// Adapter compatibility only; there is no particle implementation behind this name.
export {installHighFluidRenderer as installHighPaintRenderer};
