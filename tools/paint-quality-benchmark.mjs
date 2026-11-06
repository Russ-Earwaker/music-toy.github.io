import {createPaintParticleModel} from '../src/simple-paint-particles.js';
import {createHighPaintModel} from '../src/simple-paint/presentation/high/high-paint-model.js';
import {DRAWGRID_POINTER_SCREEN_RADIUS} from '../src/drawgrid/drawgrid-pointer-radius.js';
// CPU simulation only. Browser comparison separately measures render submission.
const transform={x:0,y:0,scale:1};
for(const quality of ['standard','particle-prototype']){
 const model=quality==='particle-prototype'?createHighPaintModel({random:()=>.37}):createPaintParticleModel({random:()=>.37});
 const samples=[];
 for(let frame=0;frame<720;frame++){
  const time=frame*1000/60,pointer={x:Math.sin(time*.0018)*100,y:Math.cos(time*.0018)*85};
  if(quality==='particle-prototype')model.consume({event:frame?'move':'begin',pointer,time,drawing:true,transform,radius:DRAWGRID_POINTER_SCREEN_RADIUS});
  else model[frame?'move':'begin'](pointer,time,transform,'PIANO');
  const start=performance.now();model.step(time,transform,'PIANO');if(frame>=120)samples.push(performance.now()-start);
 }
 samples.sort((a,b)=>a-b);
 console.log(JSON.stringify({quality,count:quality==='particle-prototype'?model.state().particles.length:model.renderState().particles.length,frames:samples.length,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,medianMs:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)]}));
}
