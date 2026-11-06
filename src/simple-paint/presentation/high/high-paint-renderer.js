import {particleTransform,particleScreenPoint} from '../../../simple-paint-particles.js';
import {instrumentColour} from '../../../instrument-colours.js';
import {createHighPaintModel,HIGH_PAINT} from './high-paint-model.js';
import {acquireHighQualityBoardRenderer} from './high-quality-board-renderer.js';
import {HIGH_LIQUID} from './high-liquid-shaders.js';

// Shared board transform is authoritative. The tiny floor is only for extreme zoom-out.
export const highPaintScreenSize=(worldSize,transform)=>Math.max(.15,worldSize*transform.scale);
export const highPaintBlurScreenSize=transform=>Math.max(.5,HIGH_LIQUID.blurWorld*transform.scale);
export function highPaintWorldDomain(particles){
 let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 for(const p of particles){left=Math.min(left,p.x);top=Math.min(top,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);}
 // World-aligned padding preserves splats and smoothing at wake edges.
 left=Math.floor((left-40)/16)*16;top=Math.floor((top-40)/16)*16;
 right=Math.ceil((right+40)/16)*16;bottom=Math.ceil((bottom+40)/16)*16;
 return {left,top,width:Math.max(16,right-left),height:Math.max(16,bottom-top)};
}
export function highPaintMarkers(pointer,transform){
 const center=particleScreenPoint(pointer,transform);
 return new Float32Array([
  center.x,center.y,HIGH_PAINT.fluidRepulsionRadiusWorld*transform.scale*2,0,0,
  center.x,center.y,7,0,.8
 ]);
}

export function installHighPaintRenderer({worldToScreen,getInstrument=()=> 'PIANO',document:doc=globalThis.document,window:win=globalThis.window,onFailure=console.warn,random=Math.random}){
 const model=createHighPaintModel({coarse:win.matchMedia('(pointer: coarse)').matches,random});
 const id=Symbol('paint');let surface=null,frame=null,lastFrame=0,input=null;
 const data=new Float32Array(HIGH_PAINT.count*8),metrics={simulationMs:0,renderMs:0,fps:0,framebuffer:[0,0]};
 let count=0,marker=null,colour='',blurScreen=3,domain=null,worldDomain=null;
 function stop(){if(frame!==null)win.cancelAnimationFrame(frame);frame=null;model.stop();surface?.unregister(id);surface=null;count=0;input=null;lastFrame=0;}
 function fail(error){stop();onFailure(error);}
 function tick(time){
  frame=null;if(doc.hidden||!model.active){stop();return;}
  try{
   const started=performance.now(),t=particleTransform(worldToScreen);
   model.step(time);metrics.simulationMs=performance.now()-started;
   if(!model.active){stop();return;}
   const state=model.state();count=state.particles.length;colour=instrumentColour(getInstrument());
   blurScreen=highPaintBlurScreenSize(t);
   worldDomain=highPaintWorldDomain(state.particles);
   const origin=particleScreenPoint({x:worldDomain.left,y:worldDomain.top},t);
   domain={left:origin.x,top:origin.y,width:worldDomain.width*t.scale,height:worldDomain.height*t.scale};
   for(let i=0;i<count;i++){const p=state.particles[i],at=particleScreenPoint(p,t),k=i*8;data[k]=at.x-domain.left;data[k+1]=at.y-domain.top;data[k+2]=highPaintScreenSize(p.size,t);data[k+3]=p.energy;data[k+4]=p.opacity;data[k+5]=p.vx;data[k+6]=p.vy;data[k+7]=p.pressure;}
   marker=state.input.drawing?highPaintMarkers(state.input.pointer,t):null;
   const renderStart=performance.now();Object.assign(metrics,surface.render());metrics.renderMs=performance.now()-renderStart;
   metrics.fps=lastFrame?1000/Math.max(1,time-lastFrame):0;lastFrame=time;
   frame=win.requestAnimationFrame(tick);
  }catch(error){fail(error);}
 }
 return {
  consume(state){
   if(state.event==='stop'){stop();return;}
   try{
    if(state.event==='begin'){
     stop();surface=acquireHighQualityBoardRenderer({document:doc,window:win});
     surface.register(id,()=>({data:data.subarray(0,count*8),count,marker,colour,blurScreen,domain,worldDomain}),fail);
    }
    input=state;model.consume(state);
    if(frame===null&&model.active)frame=win.requestAnimationFrame(tick);
   }catch(error){fail(error);}
  },stop,destroy:stop,
  getProof:()=>({drawing:model.state().input?.drawing??false,active:model.active,count:model.state().particles.length,particles:model.state().particles,
   fluidRepulsionRadiusWorld:HIGH_PAINT.fluidRepulsionRadiusWorld,pointerInteractionRadius:HIGH_PAINT.pointerInteractionRadius,
   colour,flowCells:model.state().flowCells,worldDomain,timing:{...metrics},input})
 };
}
