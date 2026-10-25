import {quantizeBouncerOffsetTick} from './bouncer-transport.js';
import {SAFE_LINE_MIDI} from './free-play-line.js';
import {sweepCapsule,surfaceContact} from './receiver-surface.js';
export const CANNON_SIZE=80,CANNON_BARREL_LENGTH=96,DEFAULT_CANNON_INSTRUMENT='KALIMBA';
export const aimDirection=(start,end)=>{const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);return length<3?{x:0,y:-1}:{x:dx/length,y:dy/length};};
export const BOUNCER_STEP=48,BOUNCER_BAR=384,CUBE_SIZE=58,BALL_RADIUS=13;
export const BALL_LAUNCH_SPEED=840;
export const BALL_GRAVITY=720,GRAVITY_BOUNCE_RETENTION=.82,GRAVITY_MAX_SECONDS=8,GRAVITY_MAX_FALL=5000;
export const ballMode=mode=>mode==='gravity'?'gravity':'normal';
export const clampBars=value=>Math.max(1,Math.min(4,Math.round(Number(value)||1)));
export function makeCube(serial,x,y){return {id:`cube:${serial}`,x,y,size:CUBE_SIZE,sourceMidi:SAFE_LINE_MIDI[5+(serial-1)%5]};}
// Simulation time is seconds, sampled at a fixed integration interval, never RAF
// count. A throw is evaluated once; no physics runs in the audio playback path.
export function simulateThrow({cubes,launch,bars=1,bpm=120,startTick=0,priorCollisions=[],ballMode:mode='normal'}){
 const durationTicks=clampBars(bars)*BOUNCER_BAR,seconds=durationTicks*60/(bpm*96),dt=1/240;
 const gravity=mode==='gravity'?BALL_GRAVITY:0,retention=gravity?GRAVITY_BOUNCE_RETENTION:1,limit=gravity?Math.min(seconds,GRAVITY_MAX_SECONDS):seconds;let termination=null,impactCount=priorCollisions.length;
 const ball={...launch};
 const trajectory=[{tick:startTick,x:ball.x,y:ball.y,vx:ball.vx,vy:ball.vy}],collisions=[],lastHit=new Map(priorCollisions.map(e=>[e.cubeId,e.tick]));
 for(let time=startTick*60/(bpm*96);time<limit;){
  const step=Math.min(dt,limit-time);let remaining=step,elapsed=0;ball.vy+=gravity*step/2;
  // Sweep the ball center through each radius-expanded cube. Resolve the
  // earliest contact, then sweep the remaining time along the reflected path.
  for(let contacts=0;remaining>1e-10&&contacts<32;contacts++){
   let hit=null;
   for(const cube of cubes){
    if(cube.segments){for(const segment of cube.segments){const candidate=sweepCapsule(ball,{x:ball.vx,y:ball.vy},segment,BALL_RADIUS+(cube.surfaceRadius||0),remaining);if(candidate&&(!hit||candidate.time<hit.time))hit={...candidate,cube,circle:true};}continue;}
    if(Number.isFinite(cube.radius)){
     const dx=ball.x-cube.x,dy=ball.y-cube.y,r=cube.radius+BALL_RADIUS,a=ball.vx**2+ball.vy**2,b=dx*ball.vx+dy*ball.vy,c=dx*dx+dy*dy-r*r;
     const disc=b*b-a*c,time=c<0?0:a&&disc>=0?(-b-Math.sqrt(disc))/a:Infinity;
     if(time>=-1e-10&&time<=remaining&&(!hit||time<hit.time)){
      const x=dx+ball.vx*Math.max(0,time),y=dy+ball.vy*Math.max(0,time),length=Math.hypot(x,y);
      if(c<0||b<0)hit={cube,time:Math.max(0,time),circle:true,nx:length?x/length:-(ball.vx/Math.sqrt(a)||1),ny:length?y/length:-(ball.vy/Math.sqrt(a)||0),overlap:Math.max(0,r-Math.hypot(dx,dy))};
     }
     continue;
    }
    const hx=(cube.width||cube.size)/2+BALL_RADIUS,hy=(cube.height||cube.size)/2+BALL_RADIUS;
    let enter=-Infinity,exit=Infinity,axis=null,normal=0;
    if(Math.abs(ball.x-cube.x)<hx-1e-8&&Math.abs(ball.y-cube.y)<hy-1e-8){
     const axis=hx-Math.abs(ball.x-cube.x)<hy-Math.abs(ball.y-cube.y)?'x':'y',half=axis==='x'?hx:hy;
     const normal=Math.sign(ball[axis]-cube[axis])||-(Math.sign(ball[axis==='x'?'vx':'vy'])||1);
     hit={cube,time:0,axis,normal,overlap:half-Math.abs(ball[axis]-cube[axis])};break;
    }
    for(const [key,half,velocity]of [['x',hx,ball.vx],['y',hy,ball.vy]]){
     const delta=ball[key]-cube[key];
     if(!velocity){if(Math.abs(delta)>=half){exit=-Infinity;break;}continue;}
     const t1=(-half-delta)/velocity,t2=(half-delta)/velocity,near=Math.min(t1,t2);
     if(near>enter){enter=near;axis=key;normal=velocity>0?-1:1;}exit=Math.min(exit,Math.max(t1,t2));
    }
    if(enter>=-1e-10&&enter<=remaining&&exit>=Math.max(0,enter)&&(!hit||enter<hit.time))hit={cube,time:Math.max(0,enter),axis,normal};
   }
   const travel=hit?hit.time:remaining;ball.x+=ball.vx*travel;ball.y+=ball.vy*travel;elapsed+=travel;remaining-=travel;
   if(!hit)break;
   // Musical contact is the impact center projected onto the receiver lanes,
   // before overlap correction pushes the physical ball out of a shared band.
   const impactPosition={x:ball.x,y:ball.y};
   if(hit.circle){const dot=ball.vx*hit.nx+ball.vy*hit.ny;ball.vx-=2*dot*hit.nx;ball.vy-=2*dot*hit.ny;ball.x+=hit.nx*((hit.overlap||0)+1e-7);ball.y+=hit.ny*((hit.overlap||0)+1e-7);}
   else{const velocity=hit.axis==='x'?'vx':'vy';ball[velocity]=hit.normal*Math.abs(ball[velocity]);ball[hit.axis]+=hit.normal*((hit.overlap||0)+1e-7);}
   ball.vx*=retention;ball.vy*=retention;impactCount++;
   if(gravity&&(Math.hypot(ball.vx,ball.vy)<40||impactCount>=128)){termination=impactCount>=128?'contact-limit':'settled';remaining=0;}
   const rawTick=(time+elapsed)*bpm*96/60,cube=hit.cube;
   trajectory.push({tick:rawTick,x:ball.x,y:ball.y,vx:ball.vx,vy:ball.vy});
   if(rawTick<(lastHit.get(cube.id)??-Infinity))continue;
   const snapped=quantizeBouncerOffsetTick(rawTick,0,2,{loopLengthTicks:durationTicks});
   const tick=snapped===durationTicks-1?durationTicks:snapped;
   lastHit.set(cube.id,tick);
   const contact=cube.boardObject?surfaceContact(cube.boardObject,{position:impactPosition}):{};
   collisions.push({tick,timeSeconds:time+elapsed,cubeId:cube.id,sourceMidi:cube.sourceMidi,contact,receiverCapabilities:structuredClone(cube.boardObject?.capabilities||{triggerReceiver:{},pitchSource:{midi:cube.sourceMidi}})});
  }
  ball.vy+=gravity*step/2;time+=step;const rawTick=time*bpm*96/60;
  if(gravity&&(ball.y-launch.y>GRAVITY_MAX_FALL||Math.abs(ball.x-launch.x)>8000))termination='bounds';
  if(rawTick-trajectory.at(-1).tick>=4||time>=limit||termination)trajectory.push({tick:Math.min(durationTicks,rawTick),x:ball.x,y:ball.y,vx:ball.vx,vy:ball.vy});
  if(termination)break;
 }
 return {durationTicks,bpm,trajectory,collisions,...(gravity?{ballMode:'gravity',endTick:trajectory.at(-1).tick,termination:termination||(seconds>limit?'lifetime':'phrase')}: {})};
}
// Match normal Bouncer: drag direction supplies the launch direction. A fixed
// logical speed avoids viewport/DPR-dependent impulses or unbounded drag speeds.
export function boardLaunch(start,end){const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);return {x:start.x,y:start.y,vx:length<3?0:dx/length*BALL_LAUNCH_SPEED,vy:length<3?-BALL_LAUNCH_SPEED:dy/length*BALL_LAUNCH_SPEED};}
// Both initial creation and authored Cannon aiming use the real swept flight.
export function predictCannonTrajectory(options){return simulateThrow(options).trajectory;}
export function trajectoryPoint(trajectory,tick){
 if(!trajectory?.length)return null;
 const end=trajectory.at(-1).tick,local=((tick%end)+end)%end;
 let lo=0,hi=trajectory.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(trajectory[mid].tick<=local)lo=mid;else hi=mid;}
 const a=trajectory[lo],b=trajectory[hi],t=(local-a.tick)/(b.tick-a.tick||1);
 return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
}

export function trajectoryState(trajectory,tick,bpm=120,gravity=0){
 const point=trajectoryPoint(trajectory,tick);if(!point)return null;
 let index=0;while(index+1<trajectory.length&&trajectory[index+1].tick<=tick)index++;
 const a=trajectory[index],b=trajectory[index+1]||a,seconds=(b.tick-a.tick)*60/(bpm*96);
 return {...point,vx:a.vx??(seconds?(b.x-a.x)/seconds:0),vy:a.vy!=null?a.vy+gravity*(tick-a.tick)*60/(bpm*96):(seconds?(b.y-a.y)/seconds:0)};
}
