import {DRAWGRID_POINTER_SCREEN_RADIUS} from './drawgrid/drawgrid-pointer-radius.js';
import {integrateParticleVelocity,applyParticleDamping,particleHighlightAppearance,radialParticleForce} from './baseMusicToy/particles/particle-runtime.js';
import {instrumentColour} from './instrument-colours.js';

export const PAINT_PARTICLES = Object.freeze({radius:130, coreRadius:5, repulsionRadius:DRAWGRID_POINTER_SCREEN_RADIUS, repulsionAcceleration:6000, speedStrengthBoost:.25, dampingPerFrame:.99, cap:96, coarseCap:48, reducedCap:8, releaseMs:420, pushHalfLifeMs:650, pushThreshold:6, minPushAcceleration:300, lifetimeExtensionMs:900, fadeNear:DRAWGRID_POINTER_SCREEN_RADIUS*1.5, fadeFar:160, patchSize:520, maxSpeed:900});
export function particleTransform(project) {
 const a=project({x:0,y:0}),b=project({x:1,y:0});
 return {x:a.x,y:a.y,scale:Math.max(.001,Math.abs(b.x-a.x))};
}
export const particleScreenPoint=(p,t)=>({x:p.x*t.scale+t.x,y:p.y*t.scale+t.y});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smoothstep=t=>{const x=clamp(t,0,1);return x*x*(3-2*x);};
export function calmParticleVisibility(distance) {
 return 1-smoothstep((distance-PAINT_PARTICLES.fadeNear)/(PAINT_PARTICLES.fadeFar-PAINT_PARTICLES.fadeNear));
}
export function paintParticleVisibility(distance,pushEnergy,reduced=false) {
 const calm=calmParticleVisibility(distance),wake=reduced?0:smoothstep(pushEnergy/.35);
 return calm+(1-calm)*wake;
}
const hotColours=new Map();
function hotCoreColour(colour,mix){
 if(!mix)return colour;const key=colour+':'+mix;if(hotColours.has(key))return hotColours.get(key);
 const result='color-mix(in oklab, '+colour+' '+((1-mix)*100)+'%, white '+(mix*100)+'%)';
 if(hotColours.size>=64)hotColours.clear();hotColours.set(key,result);return result;
}
// Actual particle speed and recent push energy are independent lighting inputs.
export function paintParticleLighting(particle, reduced = false) {
 const speed=Math.hypot(particle.vx,particle.vy),velocityEnergy=reduced?0:smoothstep(speed/320);
 const pushEnergy=reduced?0:clamp(particle.pushEnergy||0,0,1),highlight=Math.max(velocityEnergy,pushEnergy);
 const fade=particle.alpha>0?particle.opacity/particle.alpha:0;
 const whiteMix=reduced?0:Math.round(.85*smoothstep((pushEnergy-.15)/.85)*32)/32;
 return {...particleHighlightAppearance(particle.alpha,highlight,fade),colour:particle.colour,
  coreColour:hotCoreColour(particle.colour,whiteMix),whiteMix,velocityEnergy,highlight,
  glow:reduced?1.25:1.5+highlight*6,
  streak:!reduced&&speed>24?Math.min(12,speed*(.012+highlight*.018)):0};
}
// Meaningful impulse refreshes heat without resetting position or velocity.
export function registerParticlePush(particle,impulse,time,reduced=false) {
 if(impulse<PAINT_PARTICLES.pushThreshold)return false;
 const energy=reduced?.12:clamp(impulse/65,.12,1);
 particle.pushEnergy=Math.max(particle.pushEnergy||0,energy);
 particle.peakPushEnergy=Math.max(particle.peakPushEnergy||0,energy);
 if(particle.wakeAt===null)particle.wakeAt=time;
 const extension=reduced?100:PAINT_PARTICLES.lifetimeExtensionMs;
 const ceiling=particle.wakeAt+(reduced?180:particle.lifetime+extension*particle.peakPushEnergy);
 particle.wakeExpiresAt=Math.min(ceiling,Math.max(particle.wakeExpiresAt||0,time+(reduced?180:particle.lifetime+extension*energy)));
 return true;
}
// Presentation-only local medium: no front/rear targets, path steering or
// velocity-direction force. Only radial encounters, inertia and damping.
export function createPaintParticleModel({coarse=false,reduced=false,random=Math.random}={}) {
 const cap=reduced?PAINT_PARTICLES.reducedCap:coarse?PAINT_PARTICLES.coarseCap:PAINT_PARTICLES.cap;
 let particles=[],pointer=null,drawing=false,releasedAt=0,lastTime=0,colour='',speed=0,inputSpeed=0,recycled=0,populationTime=0;
 const simulatedPointer={x:0,y:0},force={x:0,y:0},integration={x:0,y:0,vx:0,vy:0};
 function stop(){particles=[];pointer=null;drawing=false;inputSpeed=speed=0;recycled=0;}
 function move(point,time,transform,instrument) {
  colour=instrumentColour(instrument);
  if(pointer){const dt=Math.max(.008,(time-pointer.time)/1000),distance=Math.hypot(point.x-pointer.x,point.y-pointer.y)*transform.scale;
   inputSpeed=inputSpeed*.35+Math.min(PAINT_PARTICLES.maxSpeed,distance/dt)*.65;
  }
  pointer={x:point.x,y:point.y,time};
 }
 function place(p,index,time,transform) {
  // Balanced local distribution, including recycled entrances. No front bias.
  const angle=index*2.399963229728653+random()*.25;
  const radius=Math.sqrt((PAINT_PARTICLES.coreRadius+4)**2+(PAINT_PARTICLES.radius**2-(PAINT_PARTICLES.coreRadius+4)**2)*(index+.5)/cap);
  p.x=pointer.x+Math.cos(angle)*radius/transform.scale;p.y=pointer.y+Math.sin(angle)*radius/transform.scale;
  p.vx=p.vy=0;p.born=time;p.wakeAt=null;p.wakeExpiresAt=null;p.pushEnergy=0;p.peakPushEnergy=0;p.pendingImpulse=0;p.releaseFadeMs=PAINT_PARTICLES.releaseMs;p.alive=true;p.opacity=p.alpha;p.colour=colour;p.fallbackAngle=angle;
 }
 function begin(point,time,transform,instrument){
  stop();drawing=true;lastTime=populationTime=time;move(point,time,transform,instrument);
  simulatedPointer.x=point.x;simulatedPointer.y=point.y;
  particles=Array.from({length:cap},(_,i)=>{const p={size:1.05+random()*.15,alpha:.62+random()*.12,lifetime:900+random()*600};place(p,i,time,transform);return p;});
 }
 function release(time){drawing=false;releasedAt=time;for(const p of particles)p.releaseFadeMs=PAINT_PARTICLES.releaseMs+(reduced?0:PAINT_PARTICLES.lifetimeExtensionMs*p.pushEnergy);}
 function step(time,transform,instrument){
  if(!pointer)return;
  colour=instrumentColour(instrument);const elapsed=Math.max(0,time-lastTime),dt=clamp(elapsed/1000,0,.033);lastTime=time;
  speed=drawing?inputSpeed*Math.exp(-Math.max(0,time-pointer.time)/120):0;
  const replenish=drawing&&speed>12&&pointer.time>populationTime;populationTime=pointer.time;
  const travel=Math.hypot(pointer.x-simulatedPointer.x,pointer.y-simulatedPointer.y)*transform.scale;
  // Interpolate only the current encounter, not a path-following field. Bounded
  // substeps keep a fast cursor from skipping straight into the safety core.
  const steps=Math.min(16,Math.max(1,Math.ceil(dt*120),Math.ceil(travel/3))),subdt=dt/steps;
  const acceleration=PAINT_PARTICLES.repulsionAcceleration*(1+PAINT_PARTICLES.speedStrengthBoost*speed/PAINT_PARTICLES.maxSpeed);
  for(let i=0;i<particles.length;i++){
   const p=particles[i];p.colour=colour;
   const distance=Math.hypot(p.x-pointer.x,p.y-pointer.y)*transform.scale;
   p.pushEnergy*=Math.pow(.5,elapsed/(reduced?90:PAINT_PARTICLES.pushHalfLifeMs));
   p.pendingImpulse*=Math.exp(-elapsed/80);
   const expired=p.wakeExpiresAt!==null&&time>=p.wakeExpiresAt;
   const released=!drawing&&time-releasedAt>=p.releaseFadeMs;
   const coldAndDistant=p.pushEnergy<.03&&distance>=PAINT_PARTICLES.fadeFar;
   if(!p.alive||coldAndDistant||expired||released){
    if(replenish){place(p,i,time,transform);recycled++;}
    else{p.alive=false;continue;}
   }
   let impulse=0;
   for(let j=0;j<steps;j++){
    const fraction=(j+.5)/steps,cx=simulatedPointer.x+(pointer.x-simulatedPointer.x)*fraction,cy=simulatedPointer.y+(pointer.y-simulatedPointer.y)*fraction;
    if(!reduced){
     if(drawing){
      radialParticleForce((p.x-cx)*transform.scale,(p.y-cy)*transform.scale,PAINT_PARTICLES.repulsionRadius,acceleration,force);
      p.vx+=force.x*subdt;p.vy+=force.y*subdt;
      const magnitude=Math.hypot(force.x,force.y);if(magnitude>=PAINT_PARTICLES.minPushAcceleration)impulse+=magnitude*subdt;
     }
     applyParticleDamping(p,PAINT_PARTICLES.dampingPerFrame,subdt);
     const v=Math.hypot(p.vx,p.vy);if(v>720){p.vx*=720/v;p.vy*=720/v;}
     integration.x=p.x;integration.y=p.y;integration.vx=p.vx/transform.scale;integration.vy=p.vy/transform.scale;integrateParticleVelocity(integration,subdt);p.x=integration.x;p.y=integration.y;
    }
    if(reduced&&drawing&&Math.hypot(p.x-cx,p.y-cy)*transform.scale<PAINT_PARTICLES.repulsionRadius)impulse=PAINT_PARTICLES.pushThreshold;
    if(drawing){
     const end=(j+1)/steps,ex=simulatedPointer.x+(pointer.x-simulatedPointer.x)*end,ey=simulatedPointer.y+(pointer.y-simulatedPointer.y)*end;
     const dx=(p.x-ex)*transform.scale,dy=(p.y-ey)*transform.scale,d=Math.hypot(dx,dy);
     if(d<PAINT_PARTICLES.coreRadius){
      const nx=d>1e-6?dx/d:Math.cos(p.fallbackAngle),ny=d>1e-6?dy/d:Math.sin(p.fallbackAngle);
      p.x=ex+nx*(PAINT_PARTICLES.coreRadius+.1)/transform.scale;p.y=ey+ny*(PAINT_PARTICLES.coreRadius+.1)/transform.scale;
      // Safety only: no forward impulse, artificial bounce or side kick.
      if(!reduced){const inward=p.vx*nx+p.vy*ny;if(inward<0){p.vx-=inward*nx;p.vy-=inward*ny;}}
     }
    }
   }
   p.pendingImpulse+=impulse;
   if(registerParticlePush(p,p.pendingImpulse,time,reduced))p.pendingImpulse=0;
   const ageFade=p.wakeExpiresAt===null?1:clamp((p.wakeExpiresAt-time)/(reduced?100:450),0,1);
   const finalDistance=Math.hypot(p.x-pointer.x,p.y-pointer.y)*transform.scale;
   p.opacity=p.alpha*paintParticleVisibility(finalDistance,p.pushEnergy,reduced)*ageFade*(drawing?1:clamp(1-(time-releasedAt)/p.releaseFadeMs,0,1));
   if(!drawing&&p.opacity<.001)p.alive=false;
  }
  simulatedPointer.x=pointer.x;simulatedPointer.y=pointer.y;
 }
 const renderState=()=>({drawing,cap,reduced,colour,speed,recycled,pointer,particles});
 return {begin,move,release,step,stop,renderState,get active(){return drawing||particles.some(p=>p.alive);},get drawing(){return drawing;},
  snapshot:()=>({...renderState(),pointer:pointer&&{...pointer},particles:particles.filter(p=>p.alive).map(p=>({...p,baseAlpha:p.alpha,alpha:p.opacity}))})};
}

export function paintParticleRenderBounds(state,transform,viewport={}) {
 const center=particleScreenPoint(state.pointer,transform),half=PAINT_PARTICLES.patchSize/2;
 let left=center.x-half,top=center.y-half,right=center.x+half,bottom=center.y+half;
 for(const p of state.particles)if(p.alive&&p.opacity>.02&&p.pushEnergy>.02){const at=particleScreenPoint(p,transform);left=Math.min(left,at.x-20);right=Math.max(right,at.x+20);top=Math.min(top,at.y-20);bottom=Math.max(bottom,at.y+20);}
 if(Number.isFinite(viewport.width)){left=clamp(left,0,viewport.width);right=clamp(right,0,viewport.width);}
 if(Number.isFinite(viewport.height)){top=clamp(top,0,viewport.height);bottom=clamp(bottom,0,viewport.height);}
 const roundSize=size=>size>PAINT_PARTICLES.patchSize?Math.ceil(size/32)*32:Math.max(1,size);
 return {left,top,width:roundSize(right-left),height:roundSize(bottom-top)};
}

export function installPaintGestureParticles({worldToScreen,getInstrument=()=> 'PIANO',document:doc=globalThis.document,window:win=globalThis.window}={}) {
 let model=null,canvas=null,ctx=null,frame=null;
 const motion=win.matchMedia('(prefers-reduced-motion: reduce)'),coarse=win.matchMedia('(pointer: coarse)');
 const transform=()=>particleTransform(worldToScreen);
 function stop(){if(frame!==null)win.cancelAnimationFrame(frame);frame=null;model?.stop();canvas?.remove();canvas=ctx=null;}
 function tick(time){frame=null;if(!model?.active){stop();return;}if(doc.hidden){stop();return;}
  const t=transform();model.step(time,t,getInstrument());const state=model.renderState();if(!model.active){stop();return;}if(!state.pointer){stop();return;}
  const center=particleScreenPoint(state.pointer,t),bounds=paintParticleRenderBounds(state,t,{width:win.innerWidth,height:win.innerHeight}),{left,top,width,height}=bounds,dpr=Math.max(1,Math.min(2,win.devicePixelRatio||1));
  canvas.style.left=left+'px';canvas.style.top=top+'px';canvas.style.width=width+'px';canvas.style.height=height+'px';
  const w=Math.round(width*dpr),h=Math.round(height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  for(const p of state.particles){if(!p.alive)continue;const at=particleScreenPoint(p,t),light=paintParticleLighting(p,state.reduced);
   ctx.globalAlpha=light.alpha;ctx.fillStyle=light.coreColour;ctx.strokeStyle=light.colour;ctx.lineWidth=p.size;ctx.shadowColor=light.colour;ctx.shadowBlur=light.glow;
   if(light.streak){const speed=Math.hypot(p.vx,p.vy);ctx.beginPath();ctx.moveTo(at.x-left-p.vx/speed*light.streak,at.y-top-p.vy/speed*light.streak);ctx.lineTo(at.x-left,at.y-top);ctx.stroke();}
   ctx.beginPath();ctx.arc(at.x-left,at.y-top,p.size*light.radiusScale,0,Math.PI*2);ctx.fill();}
  // A tiny anchor locates the input point without filling its clear void.
  ctx.shadowBlur=0;
  if(state.drawing){ctx.globalAlpha=.10;ctx.strokeStyle=state.colour;ctx.lineWidth=1;ctx.beginPath();ctx.arc(center.x-left,center.y-top,PAINT_PARTICLES.repulsionRadius,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=.62;ctx.strokeStyle=state.colour;ctx.lineWidth=1;ctx.beginPath();ctx.arc(center.x-left,center.y-top,3.5,0,Math.PI*2);ctx.stroke();}
  frame=win.requestAnimationFrame(tick);
 }
 function begin(point){stop();model=createPaintParticleModel({coarse:coarse.matches,reduced:motion.matches});canvas=doc.createElement('canvas');canvas.className='simple-paint-gesture-particles';canvas.setAttribute('aria-hidden','true');
  Object.assign(canvas.style,{position:'fixed',width:PAINT_PARTICLES.patchSize+'px',height:PAINT_PARTICLES.patchSize+'px',pointerEvents:'none',zIndex:'22'});doc.body.append(canvas);ctx=canvas.getContext('2d');if(!ctx){stop();return;}
  model.begin(point,win.performance.now(),transform(),getInstrument());frame=win.requestAnimationFrame(tick);
 }
 motion.addEventListener?.('change',stop);doc.addEventListener('visibilitychange',()=>{if(doc.hidden)stop();});
 return {begin,move:point=>{if(model?.drawing)model.move(point,win.performance.now(),transform(),getInstrument());},release:()=>model?.release(win.performance.now()),stop,
  getProof:()=>model?.snapshot()||{drawing:false,particles:[]}};
}
