import {DRAWGRID_POINTER_SCREEN_RADIUS} from './drawgrid/drawgrid-pointer-radius.js';
import {applyParticleDamping,particleHighlightAppearance} from './baseMusicToy/particles/particle-runtime.js';
import {instrumentColour} from './instrument-colours.js';

export const PAINT_PARTICLES = Object.freeze({radius:130, coreRadius:5, repulsionRadius:DRAWGRID_POINTER_SCREEN_RADIUS, repulsionAcceleration:1100, dampingPerFrame:.86, cap:224, coarseCap:112, reducedCap:24, releaseMs:1000, fadeNear:95, fadeFar:160, patchSize:520, maxSpeed:110});
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
 return calmParticleVisibility(distance);

}
const hotColours=new Map();
function hotCoreColour(colour,mix){
 if(!mix)return colour;const key=colour+':'+mix;if(hotColours.has(key))return hotColours.get(key);
 const result='color-mix(in oklab, '+colour+' '+((1-mix)*100)+'%, white '+(mix*100)+'%)';
 if(hotColours.size>=64)hotColours.clear();hotColours.set(key,result);return result;
}
// Current flow speed controls brightness; no independent post-contact heat.
export function paintParticleLighting(particle, reduced = false) {
 const speed=Math.hypot(particle.vx,particle.vy),velocityEnergy=reduced?0:smoothstep(speed/100);
 const highlight=velocityEnergy;
 const fade=particle.alpha>0?particle.opacity/particle.alpha:0;
 const whiteMix=reduced?0:Math.round(.28*highlight*32)/32;
 return {...particleHighlightAppearance(particle.alpha,highlight,fade),colour:particle.colour,
  coreColour:hotCoreColour(particle.colour,whiteMix),whiteMix,velocityEnergy,highlight,
  glow:reduced?1.25:7+highlight*5,
  streak:!reduced&&speed>75?Math.min(2,speed*.018):0};
}
// Damped rest field with spatial-hash pressure and neighbour velocity matching.
export function createPaintParticleModel({coarse=false,reduced=false,random=Math.random}={}) {
 const cap=reduced?PAINT_PARTICLES.reducedCap:coarse?PAINT_PARTICLES.coarseCap:PAINT_PARTICLES.cap;
 let particles=[],pointer=null,drawing=false,releasedAt=0,lastTime=0,colour='',speed=0,inputSpeed=0,recycled=0;
 const simulatedPointer={x:0,y:0};
 function stop(){particles=[];pointer=null;drawing=false;inputSpeed=speed=0;recycled=0;}
 function move(point,time,transform,instrument) {
  colour=instrumentColour(instrument);
  if(pointer){const dt=Math.max(.008,(time-pointer.time)/1000),distance=Math.hypot(point.x-pointer.x,point.y-pointer.y)*transform.scale;
   inputSpeed=inputSpeed*.35+Math.min(900,distance/dt)*.65;
  }
  pointer={x:point.x,y:point.y,time};
 }
 function place(p,index,time,transform) {
  // Balanced local distribution, including recycled entrances. No front bias.
  const angle=index*2.399963229728653+random()*.25;
  const radius=Math.sqrt((PAINT_PARTICLES.coreRadius+4)**2+(PAINT_PARTICLES.radius**2-(PAINT_PARTICLES.coreRadius+4)**2)*(index+.5)/cap);
  p.x=pointer.x+Math.cos(angle)*radius/transform.scale;p.y=pointer.y+Math.sin(angle)*radius/transform.scale;
  p.restX=p.x;p.restY=p.y;p.vx=p.vy=0;p.born=time;p.pushEnergy=0;p.alive=true;p.opacity=p.alpha;p.colour=colour;p.fallbackAngle=angle;
 }
 function begin(point,time,transform,instrument){
  stop();drawing=true;lastTime=time;move(point,time,transform,instrument);
  simulatedPointer.x=point.x;simulatedPointer.y=point.y;
  particles=Array.from({length:cap},(_,i)=>{const p={size:2.6+random()*.8,alpha:.48+random()*.12,lifetime:900+random()*600};place(p,i,time,transform);return p;});
 }

 let neighbourChecks=0;
 function release(time){drawing=false;releasedAt=time;}
 function step(time,transform,instrument){
  if(!pointer)return;
  colour=instrumentColour(instrument);const dt=clamp((time-lastTime)/1000,0,.033);lastTime=time;
  speed=drawing?inputSpeed*Math.exp(-Math.max(0,time-pointer.time)/120):0;
  const travel=Math.hypot(pointer.x-simulatedPointer.x,pointer.y-simulatedPointer.y)*transform.scale;
  const steps=Math.min(16,Math.max(1,Math.ceil(dt*120),Math.ceil(travel/6))),h=dt/steps;neighbourChecks=0;
  for(let j=0;j<steps;j++){
   const f=(j+1)/steps,cx=simulatedPointer.x+(pointer.x-simulatedPointer.x)*f,cy=simulatedPointer.y+(pointer.y-simulatedPointer.y)*f;
   const cells=new Map(),cellSize=25/transform.scale;
   for(const p of particles){const key=Math.floor(p.x/cellSize)+','+Math.floor(p.y/cellSize);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);p.oldVx=p.vx;p.oldVy=p.vy;}
   for(const p of particles){
    if(drawing){p.restX+=(pointer.x-simulatedPointer.x)/steps;p.restY+=(pointer.y-simulatedPointer.y)/steps;}
    let ax=(p.restX-p.x)*transform.scale*7,ay=(p.restY-p.y)*transform.scale*7,vx=0,vy=0,count=0;
    const gx=Math.floor(p.x/cellSize),gy=Math.floor(p.y/cellSize);
    for(let x=gx-1;x<=gx+1;x++)for(let y=gy-1;y<=gy+1;y++)for(const q of cells.get(x+','+y)||[]){
     if(q===p)continue;neighbourChecks++;
     const dx=(p.x-q.x)*transform.scale,dy=(p.y-q.y)*transform.scale,d=Math.hypot(dx,dy);
     if(d>=25||d<.001)continue;vx+=q.oldVx;vy+=q.oldVy;count++;
     const pressure=55*Math.max(0,1-d/13);ax+=dx/d*pressure;ay+=dy/d*pressure;
    }
    if(count){ax+=(vx/count-p.oldVx)*10;ay+=(vy/count-p.oldVy)*10;}
    if(drawing){const dx=(p.x-cx)*transform.scale,dy=(p.y-cy)*transform.scale,d=Math.hypot(dx,dy),r=PAINT_PARTICLES.repulsionRadius;
     if(d<r){const nx=d>.001?dx/d:Math.cos(p.fallbackAngle),ny=d>.001?dy/d:Math.sin(p.fallbackAngle),force=PAINT_PARTICLES.repulsionAcceleration*(1-d/r);ax+=nx*force;ay+=ny*force;}}
    if(!reduced){p.vx+=ax*h;p.vy+=ay*h;applyParticleDamping(p,PAINT_PARTICLES.dampingPerFrame,h);
     const v=Math.hypot(p.vx,p.vy);if(v>PAINT_PARTICLES.maxSpeed){p.vx*=PAINT_PARTICLES.maxSpeed/v;p.vy*=PAINT_PARTICLES.maxSpeed/v;}
     p.x+=p.vx*h/transform.scale;p.y+=p.vy*h/transform.scale;}
    // Exclusion displaces material without converting cursor speed into velocity.
    if(drawing&&!reduced){const dx=(p.x-cx)*transform.scale,dy=(p.y-cy)*transform.scale,d=Math.hypot(dx,dy),r=PAINT_PARTICLES.repulsionRadius;
     if(d<r){const nx=d>.001?dx/d:Math.cos(p.fallbackAngle),ny=d>.001?dy/d:Math.sin(p.fallbackAngle);p.x=cx+nx*r/transform.scale;p.y=cy+ny*r/transform.scale;
      const inward=p.vx*nx+p.vy*ny;if(inward<0){p.vx-=inward*nx;p.vy-=inward*ny;}}}
   }
  }
  for(let i=0;i<particles.length;i++){const p=particles[i];p.colour=colour;let distance=Math.hypot(p.x-pointer.x,p.y-pointer.y)*transform.scale;
   if(drawing&&distance>185){place(p,i,time,transform);recycled++;distance=Math.hypot(p.x-pointer.x,p.y-pointer.y)*transform.scale;}
   p.pushEnergy=0;p.opacity=p.alpha*calmParticleVisibility(distance)*(drawing?1:clamp(1-(time-releasedAt)/PAINT_PARTICLES.releaseMs,0,1));p.alive=drawing||time-releasedAt<PAINT_PARTICLES.releaseMs;
  }
  simulatedPointer.x=pointer.x;simulatedPointer.y=pointer.y;
 }
 const renderState=()=>({drawing,cap,reduced,colour,speed,recycled,neighbourChecks,pointer,particles});
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
 const timing={simulationMs:0,renderMs:0};
 const motion=win.matchMedia('(prefers-reduced-motion: reduce)'),coarse=win.matchMedia('(pointer: coarse)');
 const transform=()=>particleTransform(worldToScreen);
 function stop(){if(frame!==null)win.cancelAnimationFrame(frame);frame=null;model?.stop();canvas?.remove();canvas=ctx=null;}
 function tick(time){frame=null;if(!model?.active){stop();return;}if(doc.hidden){stop();return;}
  const started=performance.now(),t=transform();model.step(time,t,getInstrument());timing.simulationMs=performance.now()-started;const renderStarted=performance.now();const state=model.renderState();if(!model.active){stop();return;}if(!state.pointer){stop();return;}
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
  timing.renderMs=performance.now()-renderStarted;frame=win.requestAnimationFrame(tick);
 }
 function begin(point){stop();model=createPaintParticleModel({coarse:coarse.matches,reduced:motion.matches});canvas=doc.createElement('canvas');canvas.className='simple-paint-gesture-particles';canvas.setAttribute('aria-hidden','true');
  Object.assign(canvas.style,{position:'fixed',width:PAINT_PARTICLES.patchSize+'px',height:PAINT_PARTICLES.patchSize+'px',pointerEvents:'none',zIndex:'22'});doc.body.append(canvas);ctx=canvas.getContext('2d');if(!ctx){stop();return;}
  model.begin(point,win.performance.now(),transform(),getInstrument());frame=win.requestAnimationFrame(tick);
 }
 motion.addEventListener?.('change',stop);doc.addEventListener('visibilitychange',()=>{if(doc.hidden)stop();});
 return {begin,move:point=>{if(model?.drawing)model.move(point,win.performance.now(),transform(),getInstrument());},release:()=>model?.release(win.performance.now()),stop,
  getProof:()=>model?{...model.snapshot(),timing:{...timing}}:{drawing:false,particles:[]}};
}
