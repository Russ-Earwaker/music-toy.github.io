import {BALL_GRAVITY,BALL_LAUNCH_SPEED,simulateThrow} from './simple-bouncer-physics.js';

// Presentation only. Choose a shallow ballistic aim toward the teaching target,
// then draw the real simulator's flight rather than an illustrative parabola.
export function gravityTeachingFlight(origin,end,scale=1){
 const start={x:origin.x*scale,y:origin.y*scale},dx=(end.x-origin.x)*scale,dy=(end.y-origin.y)*scale;
 const a=BALL_LAUNCH_SPEED**2+BALL_GRAVITY*dy,disc=a*a-BALL_GRAVITY**2*(dx*dx+dy*dy);
 const seconds=disc>=0&&a>0?Math.sqrt(2*(dx*dx+dy*dy)/(a+Math.sqrt(disc))):.6;
 const vx=seconds?dx/seconds:BALL_LAUNCH_SPEED,vy=seconds?(dy-.5*BALL_GRAVITY*seconds**2)/seconds:0;
 const length=Math.hypot(vx,vy)||1,launch={...start,vx:vx/length*BALL_LAUNCH_SPEED,vy:vy/length*BALL_LAUNCH_SPEED};
 const capture=simulateThrow({launch,cubes:[],ballMode:'gravity',bpm:120});
 const points=capture.trajectory.filter(p=>p.tick<=Math.min(1.2,seconds)*192).map(p=>({x:p.x/scale,y:p.y/scale}));
 const aim={x:origin.x+launch.vx/BALL_LAUNCH_SPEED*160,y:origin.y+launch.vy/BALL_LAUNCH_SPEED*160};
 return {points,aim};
}
