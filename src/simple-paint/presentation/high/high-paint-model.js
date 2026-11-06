import {DRAWGRID_POINTER_SCREEN_RADIUS as pointerInteractionRadius} from '../../../drawgrid/drawgrid-pointer-radius.js';
import {createAdvectedDisturbance} from './high-disturbance-field.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const HIGH_PAINT=Object.freeze({count:1800,coarseCount:900,pointerInteractionRadius,fluidRepulsionRadiusWorld:pointerInteractionRadius,fieldRadiusWorld:145,recycleRadiusWorld:185,wakeLimitWorld:1100,releaseMs:6500,maxSpeed:105,cellSizeWorld:16,disturbanceDecaySeconds:1.05,activityThreshold:.018});

export function createHighPaintModel({coarse=false,random=Math.random}={}){
 const count=coarse?HIGH_PAINT.coarseCount:HIGH_PAINT.count;
 let particles=[],input=null,previous=null,lastTime=0,releaseAt=null,flowCells=0,recycled=0,seedSerial=0;
 let motionSpeed=0,motionX=0,motionY=0,lastMotionAt=0;
 let disturbance=createAdvectedDisturbance(count,{decaySeconds:HIGH_PAINT.disturbanceDecaySeconds});
 function seed(p,i,recycle=false){
  const angle=(i+(recycle?++seedSerial:0))*2.3999632297+random()*.5;
  // Recycled calm material enters outside the finger, so recycling cannot inject light.
  const inner=recycle?HIGH_PAINT.fluidRepulsionRadiusWorld+5:0;
  const r=Math.sqrt(inner*inner+(HIGH_PAINT.fieldRadiusWorld**2-inner*inner)*(i+.5)/count);
  p.restX=input.pointer.x+Math.cos(angle)*r;p.restY=input.pointer.y+Math.sin(angle)*r;
  p.x=p.restX;p.y=p.restY;p.vx=p.vy=0;p.energy=p.pressure=p.brightness=p.flow=0;p.opacity=1;p.size=1.1+random()*.8;
  disturbance.clear(i);
 }
 function consume(state){
  input=state;
  if(state.event==='stop'){stop();return;}
  if(state.event==='begin'){
   lastTime=state.time;previous={...state.pointer};releaseAt=null;recycled=seedSerial=0;
   motionSpeed=motionX=motionY=0;lastMotionAt=state.time;
   disturbance=createAdvectedDisturbance(count,{decaySeconds:HIGH_PAINT.disturbanceDecaySeconds});
   particles=Array.from({length:count},(_,i)=>{const p={};seed(p,i);return p;});
  }
  if(state.event==='release')releaseAt=state.time;
 }
 function stop(){particles=[];input=null;previous=null;releaseAt=null;}
 function step(time){
  if(!input||!particles.length)return;
  if(releaseAt!==null&&time-releaseAt>=HIGH_PAINT.releaseMs){stop();return;}
  const dt=clamp((time-lastTime)/1000,0,.033);lastTime=time;
  const dx=input.pointer.x-previous.x,dy=input.pointer.y-previous.y,travel=Math.hypot(dx,dy);
  if(travel>.0001&&dt>0){motionSpeed=Math.min(900,travel/dt);motionX=dx/travel;motionY=dy/travel;lastMotionAt=time;}
  const advancing=input.drawing?Math.min(1,motionSpeed/160)*Math.exp(-Math.max(0,time-lastMotionAt)/140):0;
  const steps=Math.min(12,Math.max(1,Math.ceil(dt*90),Math.ceil(travel/8))),h=dt/steps,cell=HIGH_PAINT.cellSizeWorld;
  for(let sub=0;sub<steps;sub++){
   const cx=previous.x+dx*(sub+1)/steps,cy=previous.y+dy*(sub+1)/steps;
   // Sparse fixed-world cells retain old wakes without clamping them into a cursor box.
   const baseX=Math.floor(cx/cell)*cell,baseY=Math.floor(cy/cell)*cell,cells=new Map();
   for(const p of particles){
    p.gx=Math.floor((p.x-baseX)/cell);p.gy=Math.floor((p.y-baseY)/cell);
    const key=p.gx+p.gy*4096;let c=cells.get(key);if(!c){c={n:0,vx:0,vy:0};cells.set(key,c);}c.n++;c.vx+=p.vx;c.vy+=p.vy;
   }
   flowCells=cells.size;disturbance.decay(h);
   for(let i=0;i<particles.length;i++){
    const p=particles[i];let ax=(p.restX-p.x)*18,ay=(p.restY-p.y)*18,sx=0,sy=0,n=0;
    const key=p.gx+p.gy*4096;
    for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){const c=cells.get(key+x+y*4096);if(c){sx+=c.vx;sy+=c.vy;n+=c.n;}}
    if(n){ax+=(sx/n-p.vx)*10;ay+=(sy/n-p.vy)*10;}
    const density=cells.get(key).n;
    ax+=((cells.get(key-1)?.n||0)-(cells.get(key+1)?.n||0))*3;
    ay+=((cells.get(key-4096)?.n||0)-(cells.get(key+4096)?.n||0))*3;
    const rx=p.x-cx,ry=p.y-cy,rd=Math.hypot(rx,ry),nx=rd>.001?rx/rd:1,ny=rd>.001?ry/rd:0,radius=HIGH_PAINT.fluidRepulsionRadiusWorld;
    const front=Math.max(0,nx*motionX+ny*motionY)*advancing*Math.max(0,1-Math.abs(rd-radius)/18);
    p.pressure=clamp((density-7)/16,0,1)*front;ax+=nx*p.pressure*28;ay+=ny*p.pressure*28;
    p.vx=(p.vx+ax*h)*Math.exp(-6*h);p.vy=(p.vy+ay*h)*Math.exp(-6*h);
    const speed=Math.hypot(p.vx,p.vy);if(speed>HIGH_PAINT.maxSpeed){p.vx*=HIGH_PAINT.maxSpeed/speed;p.vy*=HIGH_PAINT.maxSpeed/speed;}
    p.x+=p.vx*h;p.y+=p.vy*h;
    if(input.drawing){
     const px=p.x-cx,py=p.y-cy,d=Math.hypot(px,py);
     if(d<radius){
      const nx=d>.001?px/d:1,ny=d>.001?py/d:0,depth=radius-d;
      // Only actual moving contact injects disturbance; holding the finger does not.
      const approach=Math.max(0,nx*motionX+ny*motionY);
      disturbance.inject(i,depth*approach,travel>.0001?motionSpeed:0);
      p.x=cx+nx*radius;p.y=cy+ny*radius;
      const inward=p.vx*nx+p.vy*ny;if(inward<0){p.vx-=inward*nx;p.vy-=inward*ny;}
      // Small radial pressure acceleration, never a correction-derived launch velocity.
      if(travel>.0001){p.vx+=nx*Math.min(24,depth*3)*approach*h*8;p.vy+=ny*Math.min(24,depth*3)*approach*h*8;}
     }
    }
    const v=Math.hypot(p.vx,p.vy);if(v>HIGH_PAINT.maxSpeed){p.vx*=HIGH_PAINT.maxSpeed/v;p.vy*=HIGH_PAINT.maxSpeed/v;}
   }
  }
  let peak=0,maxVelocity=0;
  for(let i=0;i<particles.length;i++){
   const p=particles[i],d=Math.hypot(p.x-input.pointer.x,p.y-input.pointer.y);
   const energy=disturbance.values[i];
   if(input.drawing&&((d>HIGH_PAINT.recycleRadiusWorld&&energy<HIGH_PAINT.activityThreshold)||d>HIGH_PAINT.wakeLimitWorld)){seed(p,i,true);recycled++;}
   p.energy=disturbance.values[i];p.brightness=p.energy; // compatibility/diagnostics; velocity never reveals calm liquid.
   p.flow=Math.min(1,Math.hypot(p.vx,p.vy)/HIGH_PAINT.maxSpeed);
   p.opacity=releaseAt===null?1:clamp((HIGH_PAINT.releaseMs-(time-releaseAt))/500,0,1); // emergency cleanup only
   peak=Math.max(peak,p.energy);maxVelocity=Math.max(maxVelocity,Math.hypot(p.vx,p.vy));
  }
  previous={...input.pointer};
  if(releaseAt!==null&&time-releaseAt>200&&peak<HIGH_PAINT.activityThreshold&&maxVelocity<8)stop();
 }
 return {consume,step,stop,get active(){return particles.length>0;},state:()=>({particles,input,count,releaseAt,disturbance,flowCells,recycled})};
}
