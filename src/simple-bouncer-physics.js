import {SAFE_LINE_MIDI} from './free-play-line.js';
export const BOUNCER_INSTRUMENTS=Object.freeze(['KALIMBA','PIANO','pluck']);
export const BOUNCER_STEP=48,BOUNCER_BAR=384,CUBE_SIZE=58,BALL_RADIUS=13;
export const clampBars=value=>Math.max(1,Math.min(4,Math.round(Number(value)||1)));
export function makeCube(serial,x,y){return {id:`cube:${serial}`,x,y,size:CUBE_SIZE,sourceMidi:SAFE_LINE_MIDI[5+(serial-1)%5],instrument:BOUNCER_INSTRUMENTS[(serial-1)%BOUNCER_INSTRUMENTS.length]};}
// Simulation time is seconds, sampled at a fixed integration interval, never RAF
// count. A throw is evaluated once; no physics runs in the audio playback path.
export function simulateThrow({cubes,launch,bars=1,bpm=120}){
 const durationTicks=clampBars(bars)*BOUNCER_BAR,seconds=durationTicks*60/(bpm*96),dt=1/240;
 const ball={...launch};
 const trajectory=[{tick:0,x:ball.x,y:ball.y}],collisions=[],lastHit=new Map();
 let previousTick=-BOUNCER_STEP;
 for(let time=0;time<seconds;){
  const step=Math.min(dt,seconds-time);time+=step;ball.x+=ball.vx*step;ball.y+=ball.vy*step;
  const rawTick=time*bpm*96/60;
  for(const cube of cubes){
   const hx=(cube.width||cube.size)/2+BALL_RADIUS,hy=(cube.height||cube.size)/2+BALL_RADIUS,dx=ball.x-cube.x,dy=ball.y-cube.y;
   if(Math.abs(dx)>=hx||Math.abs(dy)>=hy)continue;
   if(hx-Math.abs(dx)<hy-Math.abs(dy)){ball.x=cube.x+Math.sign(dx||1)*hx;ball.vx=Math.sign(dx||1)*Math.abs(ball.vx);}
   else{ball.y=cube.y+Math.sign(dy||1)*hy;ball.vy=Math.sign(dy||1)*Math.abs(ball.vy);}
   if(rawTick-(lastHit.get(cube.id)??-Infinity)<BOUNCER_STEP)continue;
   lastHit.set(cube.id,rawTick);
   const tick=Math.max(previousTick+BOUNCER_STEP,Math.round(rawTick/BOUNCER_STEP)*BOUNCER_STEP);
   if(tick>=durationTicks)continue;
   collisions.push({tick,timeSeconds:time,cubeId:cube.id,sourceMidi:cube.sourceMidi,instrument:cube.instrument});previousTick=tick;
  }
  if(rawTick-trajectory.at(-1).tick>=4||time>=seconds)trajectory.push({tick:Math.min(durationTicks,rawTick),x:ball.x,y:ball.y});
 }
 return {durationTicks,bpm,trajectory,collisions};
}
// Match normal Bouncer: drag direction supplies the launch direction. A fixed
// logical speed avoids viewport/DPR-dependent impulses or unbounded drag speeds.
export function boardLaunch(start,end){const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);return {x:start.x,y:start.y,vx:length<3?0:dx/length*420,vy:length<3?-420:dy/length*420};}
export function trajectoryPoint(trajectory,tick){
 if(!trajectory?.length)return null;
 const end=trajectory.at(-1).tick,local=((tick%end)+end)%end;
 let lo=0,hi=trajectory.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(trajectory[mid].tick<=local)lo=mid;else hi=mid;}
 const a=trajectory[lo],b=trajectory[hi],t=(local-a.tick)/(b.tick-a.tick||1);
 return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
}
