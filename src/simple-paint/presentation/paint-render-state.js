import {instrumentColour} from '../../instrument-colours.js';
import {particleTransform} from '../../simple-paint-particles.js';
import {DRAWGRID_POINTER_SCREEN_RADIUS} from '../../drawgrid/drawgrid-pointer-radius.js';

// Transient, world-coordinate visual input. No notes, scheduler, project or owner.
export function createPaintRenderState({worldToScreen,getInstrument,window:win}) {
 let pointer=null,path=[],drawing=false,releasedAt=null;
 return (event,point)=>{
  const time=win.performance.now(),transform=particleTransform(worldToScreen);
  const previous=pointer;
  if(event==='begin'){path=[];drawing=true;releasedAt=null;pointer=null;}
  let velocity={x:0,y:0};
  if(point){
   const dt=previous&&event!=='begin'?Math.max(.008,(time-previous.time)/1000):Infinity;
   velocity={x:(point.x-(previous?.x??point.x))/dt,y:(point.y-(previous?.y??point.y))/dt};
   pointer={x:point.x,y:point.y,time};path.push({x:point.x,y:point.y});
  }
  if(event==='release'){drawing=false;releasedAt=time;}
  if(event==='stop'){pointer=null;path=[];drawing=false;releasedAt=null;}
  const instrument=getInstrument();
  return {event,time,pointer:pointer&&{...pointer},velocity,path:path.slice(),drawing,releasedAt,
   instrument,colour:instrumentColour(instrument),tool:'draw',selected:false,transform,
   radius:DRAWGRID_POINTER_SCREEN_RADIUS,reduced:win.matchMedia('(prefers-reduced-motion: reduce)').matches};
 };
}
