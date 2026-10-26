import test from 'node:test';
import assert from 'node:assert/strict';
import {calmParticleVisibility,paintParticleVisibility,registerParticlePush,paintParticleRenderBounds,paintParticleLighting,createPaintParticleModel,installPaintGestureParticles,particleTransform,particleScreenPoint,PAINT_PARTICLES} from '../src/simple-paint-particles.js';
import {seededRandomFactory} from '../src/baseMusicToy/particles/particle-density.js';
import {particleHighlightAppearance,radialParticleForce} from '../src/baseMusicToy/particles/particle-runtime.js';
import {DRAWGRID_POINTER_SCREEN_RADIUS,drawGridPointerRadius} from '../src/drawgrid/drawgrid-pointer-radius.js';
import {createDGTuning} from '../src/drawgrid/dg-tuning.js';
import {instrumentColour} from '../src/instrument-colours.js';
const identity={x:0,y:0,scale:1};
const model=options=>createPaintParticleModel({random:()=>.37,...options});
test('idle has no field; begin fills a bounded local cloud; release expires completely',()=>{
 const m=model();assert.equal(m.active,false);m.step(100,identity,'PIANO');assert.equal(m.snapshot().particles.length,0);
 m.begin({x:200,y:200},100,identity,'PIANO');
 for(let i=1;i<9000;i++){m.move({x:200+i*.1,y:200+Math.sin(i)*20},100+i*16,identity,'PIANO');m.step(100+i*16,identity,'PIANO');const s=m.snapshot();assert.ok(s.particles.length<=PAINT_PARTICLES.cap);assert.equal('recent' in s,false);}
 assert.equal(m.snapshot().particles.length,PAINT_PARTICLES.cap);m.release(144100);m.step(144200,identity,'PIANO');assert.equal(m.snapshot().drawing,false);m.step(145500,identity,'PIANO');assert.equal(m.active,false);assert.deepEqual(m.snapshot().particles,[]);
});
test('current shared instrument colour is used for new particles; inputs remain untouched',()=>{
 const m=model(),point=Object.freeze({x:4,y:7}),t=Object.freeze({...identity});m.begin(point,0,t,'PIANO');m.step(16,t,'PIANO');m.move(point,20,t,'BELL');m.step(32,t,'BELL');
 assert.equal(m.snapshot().colour,instrumentColour('BELL'));assert.ok(m.snapshot().particles.some(p=>p.colour===instrumentColour('BELL')));assert.deepEqual(point,{x:4,y:7});
 const copy=m.snapshot();copy.particles[0].x=999;assert.notEqual(m.snapshot().particles[0].x,999);
});
test('coarse cap is smaller; reduced motion uses sparse static particles',()=>{
 for(const [options,cap] of [[{coarse:true},PAINT_PARTICLES.coarseCap],[{reduced:true},8]]){const m=model(options);m.begin({x:0,y:0},0,identity,'PIANO');for(let i=1;i<20;i++)m.step(i*16,identity,'PIANO');assert.ok(m.snapshot().particles.length<=cap);if(options.reduced){const a=m.snapshot().particles.map(p=>({x:p.x,y:p.y}));m.move({x:3,y:3},320,identity,'PIANO');m.step(336,identity,'PIANO');assert.deepEqual(m.snapshot().particles.map(p=>({x:p.x,y:p.y})),a);}}
});
test('screen radius remains local across zoom; DPR does not enter model coordinates',()=>{
 for(const zoom of [.25,.75,1,2,4]){const t=particleTransform(p=>({x:p.x*zoom+80,y:p.y*zoom-20})),m=model();const point={x:200,y:300};m.begin(point,0,t,'PIANO');m.step(0,t,'PIANO');const center=particleScreenPoint(point,t);for(const p of m.snapshot().particles){const s=particleScreenPoint(p,t);assert.ok(Math.hypot(s.x-center.x,s.y-center.y)<=PAINT_PARTICLES.radius+.001);}}
});
test('Clear/cancel stop empties all transient history and allows a clean redraw',()=>{
 const m=model();m.begin({x:0,y:0},0,identity,'PIANO');m.step(16,identity,'PIANO');m.stop();assert.equal(m.active,false);assert.equal('recent' in m.snapshot(),false);assert.deepEqual(m.snapshot().particles,[]);m.begin({x:90,y:20},30,identity,'BELL');m.step(46,identity,'BELL');assert.equal(m.snapshot().particles.length,PAINT_PARTICLES.cap);
});
function fixture({reduced=false,dpr=1}={}) {
 let next=0;const frames=new Map(),listeners={},canvases=[],transforms=[],draws=[],arcs=[];
 const ctx={setTransform(...args){transforms.push(args);},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(x,y,r){arcs.push(r);},fill(){draws.push({fill:this.fillStyle,stroke:this.strokeStyle,glow:this.shadowColor});}};
 const doc={hidden:false,body:{append(c){canvases.push(c);}},createElement(){return {style:{},setAttribute(k,v){this[k]=v;},getContext:()=>ctx,remove(){this.removed=true;}};},addEventListener(k,fn){listeners[k]=fn;}};
 const win={devicePixelRatio:dpr,performance:{now:()=>0},matchMedia:q=>({matches:q.includes('reduced')&&reduced,addEventListener(){}}),requestAnimationFrame(fn){frames.set(++next,fn);return next;},cancelAnimationFrame(id){frames.delete(id);}};
 const effect=installPaintGestureParticles({worldToScreen:p=>({x:p.x*.5+40,y:p.y*.5+90}),document:doc,window:win});
 return {effect,frames,canvases,transforms,draws,arcs,doc,listeners,tick(time){const all=[...frames.values()];frames.clear();for(const fn of all)fn(time);}};
}
test('renderer is a pointer-transparent local patch, scales DPR and stops scheduling after release',()=>{
 const f=fixture({dpr:2});assert.equal(f.frames.size,0);f.effect.begin({x:100,y:100});f.tick(16);const c=f.canvases[0];assert.equal(c.style.pointerEvents,'none');assert.equal(c['aria-hidden'],'true');assert.equal(c.width,PAINT_PARTICLES.patchSize*2);assert.equal(c.style.left,(90-PAINT_PARTICLES.patchSize/2)+'px');assert.deepEqual(f.transforms[0],[2,0,0,2,0,0]);
 f.effect.release();f.tick(1500);assert.equal(f.frames.size,0);assert.ok(c.removed);
});
test('cancellation and hidden document remove the layer and cancel all animation work',()=>{
 const f=fixture();f.effect.begin({x:0,y:0});f.effect.stop();assert.equal(f.frames.size,0);assert.ok(f.canvases[0].removed);f.effect.begin({x:10,y:10});f.doc.hidden=true;f.listeners.visibilitychange();assert.equal(f.frames.size,0);assert.equal(f.effect.getProof().particles.length,0);
});

function travel(speed,frames=300){const m=createPaintParticleModel({random:seededRandomFactory('radial')});m.begin({x:0,y:0},0,identity,'PIANO');for(let i=1;i<=frames;i++){m.move({x:speed*i/60,y:0},i*1000/60,identity,'PIANO');m.step(i*1000/60,identity,'PIANO');}return m;}
function oneParticle(x,y,vx=0,vy=0){const m=model();m.begin({x:0,y:0},0,identity,'PIANO');const pool=m.renderState().particles;for(const p of pool)p.alive=false;const p=pool[0];Object.assign(p,{x,y,vx,vy,alive:true});return {m,p};}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8, a+' ~= '+b);
test('DrawGrid radial force is outward, rotation invariant and smoothly fades to zero at its edge',()=>{
 const r=22,strength=16000;
 for(let i=0;i<24;i++){const angle=i*Math.PI/12,dx=Math.cos(angle)*12,dy=Math.sin(angle)*12,f=radialParticleForce(dx,dy,r,strength);near(dx*f.y-dy*f.x,0);assert.ok(dx*f.x+dy*f.y>0);near(Math.hypot(f.x,f.y),strength*(1-12/r)**3);}
 const magnitudes=[5,8,12,16,21,22,23].map(d=>radialParticleForce(d,0,r,strength).x);for(let i=1;i<magnitudes.length;i++)assert.ok(magnitudes[i]<=magnitudes[i-1]);
 assert.equal(magnitudes.at(-1),0);assert.ok(radialParticleForce(r-.001,0,r,strength).x<1e-6);assert.deepEqual(radialParticleForce(0,0,r,strength),{x:0,y:0});
});
test('particles on opposite sides receive corresponding radial deflection without a directional bow',()=>{
 const positions=[[10,0],[-10,0],[0,10],[0,-10],[8,8],[-8,8]];
 const results=positions.map(([x,y])=>{const {m,p}=oneParticle(x,y);m.step(16,identity,'PIANO');assert.ok(p.vx*x+p.vy*y>0);near(p.vx*y-p.vy*x,0);return {vx:p.vx,vy:p.vy};});
 near(results[0].vx,-results[1].vx);near(results[0].vx,results[2].vy);near(results[2].vy,-results[3].vy);near(results[4].vx,-results[5].vx);near(results[4].vy,results[5].vy);
});
test('pointer velocity scales magnitude modestly without rotating the radial force or adding a forward wedge',()=>{
 function run(start,position){const m=model();m.begin(start,0,identity,'PIANO');m.move({x:0,y:0},16,identity,'PIANO');m.step(16,identity,'PIANO');const p=m.renderState().particles[0];Object.assign(p,{x:position.x,y:position.y,vx:0,vy:0,wakeAt:null,alive:true});m.step(32,identity,'PIANO');return p;}
 const right=run({x:-12,y:0},{x:0,y:10}),down=run({x:0,y:-12},{x:0,y:10});near(right.vx,0);near(down.vx,0);near(right.vy,down.vy);
 const untouched=run({x:-12,y:0},{x:60,y:0});near(untouched.vx,0);near(untouched.vy,0);
 const resting=oneParticle(0,10);resting.m.step(16,identity,'PIANO');assert.ok(right.vy>=resting.p.vy);assert.ok(right.vy<=resting.p.vy*1.25);
});
test('the fixed radial field retains momentum outside its radius, including through a turn',()=>{
 const {m,p}=oneParticle(60,0,120,-40);m.step(16,identity,'PIANO');near(p.vx,120*Math.pow(.99,.96));near(p.vy,-40*Math.pow(.99,.96));
 const oldX=p.vx,oldY=p.vy;m.move({x:0,y:8},32,identity,'PIANO');m.step(32,identity,'PIANO');near(p.vx,oldX*Math.pow(.99,.96));near(p.vy,oldY*Math.pow(.99,.96));assert.ok(p.vx>115&&p.vy< -38);
});
test('stationary pointer has no front/rear steering and does not emit replacement particles',()=>{
 const m=createPaintParticleModel({random:seededRandomFactory('rest')});m.begin({x:0,y:0},0,identity,'PIANO');const first=m.snapshot(),pool=m.renderState().particles.slice();assert.equal(first.particles.length,96);assert.ok(first.particles.filter(p=>p.x>0).length>=44);assert.ok(first.particles.filter(p=>p.x<0).length>=44);
 for(let i=1;i<=240;i++)m.step(i*16,identity,'PIANO');const end=m.snapshot();assert.equal(end.speed,0);assert.equal(end.recycled,0);assert.ok(end.particles.every(p=>p.born===0));assert.ok(m.renderState().particles.every((p,i)=>p===pool[i]));assert.equal('recent' in end,false);assert.equal('direction' in end,false);
});
test('particle pool reuses objects over long travel and remains bounded without path history',()=>{
 const m=travel(600,1),pool=m.renderState().particles.slice();for(let i=2;i<2000;i++){m.move({x:i*10,y:Math.sin(i/20)*40},i*16,identity,'PIANO');m.step(i*16,identity,'PIANO');assert.ok(m.snapshot().particles.length<=96);}
 assert.ok(m.renderState().particles.every((p,i)=>p===pool[i]));assert.ok(m.snapshot().recycled>100);for(const p of m.snapshot().particles)assert.ok(p.lifetime>=900&&p.lifetime<=1500);
});
test('hard core is tiny and safety-only; the effective radial radius remains fixed under speed and zoom',()=>{
 assert.equal(PAINT_PARTICLES.coreRadius,5);near(PAINT_PARTICLES.repulsionRadius,DRAWGRID_POINTER_SCREEN_RADIUS);assert.equal(PAINT_PARTICLES.cap,96);assert.equal(PAINT_PARTICLES.coarseCap,48);
 for(const speed of [60,180,600,2000]){const s=travel(speed,120).snapshot();assert.ok(s.speed<=900);for(const p of s.particles)assert.ok(Math.hypot(p.x-s.pointer.x,p.y)>=5-.001);}
 const {m,p}=oneParticle(3,0);m.step(0,identity,'PIANO');near(p.x,5.1);near(p.vx,0);near(p.vy,0);
 const edge=PAINT_PARTICLES.repulsionRadius,soft=oneParticle(edge-.01,0);soft.m.step(16,identity,'PIANO');assert.ok(soft.p.x>edge-.01&&soft.p.x<edge);assert.ok(soft.p.vx>0&&soft.p.vx<.001);
 for(const scale of [.25,.75,2,4]){const {m,p}=oneParticle(3/scale,0);m.step(0,{...identity,scale},'PIANO');near(p.x*scale,5.1);}
});
test('particle lighting follows individual velocity, retains hue and keeps calm medium visible',()=>{
 const p={vx:0,vy:0,alpha:.68,opacity:.68,colour:instrumentColour('BELL')},a=paintParticleLighting(p),b=paintParticleLighting({...p,vx:160}),c=paintParticleLighting({...p,vx:320}),clamped=paintParticleLighting({...p,vx:9000});
 assert.ok(a.alpha>=.6);assert.ok(a.glow<b.glow&&b.glow<c.glow);assert.ok(a.alpha<b.alpha&&b.alpha<=c.alpha);assert.ok(a.radiusScale<b.radiusScale&&b.radiusScale<c.radiusScale);assert.equal(a.colour,p.colour);assert.equal(c.colour,p.colour);assert.equal(clamped.glow,c.glow);assert.ok(c.streak<=12);assert.equal(a.streak,0);
 assert.deepEqual(particleHighlightAppearance(.3,.5,.8),{alpha:.48,radiusScale:1.125});
 assert.equal(paintParticleLighting({...p,vx:320},true).glow,1.25);assert.equal(paintParticleLighting({...p,vx:320},true).streak,0);assert.equal(paintParticleLighting({...p,vx:320},true).alpha,a.alpha);
});
test('release wake remains velocity-lit and dims with slowing particles until lifetime cleanup',()=>{
 const m=model();m.begin({x:0,y:0},0,identity,'PIANO');const p=m.renderState().particles[0];p.x=-30;p.y=10;p.vx=400;p.vy=0;m.step(0,identity,'PIANO');p.vx=240;
 const before=paintParticleLighting(p);m.release(0);m.step(16,identity,'PIANO');const coasting=paintParticleLighting(p);assert.ok(coasting.highlight>before.highlight*.95);assert.ok(coasting.glow>before.glow*.95);assert.ok(coasting.alpha>0);
 for(let i=2;i<=20;i++)m.step(i*16,identity,'PIANO');const slow=paintParticleLighting(p);assert.ok(slow.glow<coasting.glow);assert.ok(slow.alpha<coasting.alpha);m.step(500,identity,'PIANO');assert.equal(m.active,false);
});

test('Paint radius comes from actual DrawGrid tuning and remains the same CSS size across zoom/DPR',()=>{
 const size={w:800,h:600},base=createDGTuning(size).ghostRadiusToy(size);near(base,32.4);near(drawGridPointerRadius(base,150),48.6);near(PAINT_PARTICLES.repulsionRadius,48.6);
 for(const scale of [.25,.5,1,2,4])for(const dpr of [1,2,3]){const {m,p}=oneParticle(0,DRAWGRID_POINTER_SCREEN_RADIUS/scale);m.step(16,{...identity,scale},'PIANO');near(p.vy,0);assert.equal(PAINT_PARTICLES.repulsionRadius,DRAWGRID_POINTER_SCREEN_RADIUS);}
});
test('calm visibility fades smoothly with distance while a pushed wake resists distance fade',()=>{
 const a=PAINT_PARTICLES.fadeNear,b=PAINT_PARTICLES.fadeFar;assert.equal(calmParticleVisibility(a),1);assert.equal(calmParticleVisibility(b),0);near(calmParticleVisibility((a+b)/2),.5);
 for(let d=a;d<b;d+=2)assert.ok(calmParticleVisibility(d+2)<=calmParticleVisibility(d));
 assert.ok(paintParticleVisibility(400,.8)>.99);assert.ok(paintParticleVisibility(400,.1)<paintParticleVisibility(400,.3));assert.equal(paintParticleVisibility(400,0),0);assert.equal(paintParticleVisibility(400,1,true),0);
});
test('only meaningful push impulses create energy and extend lifetime without resetting motion',()=>{
 const p={x:12,y:10,vx:20,vy:-8,pushEnergy:0,wakeAt:null,wakeExpiresAt:null,lifetime:1200};assert.equal(registerParticlePush(p,5,0),false);assert.equal(p.pushEnergy,0);assert.equal(p.wakeAt,null);
 registerParticlePush(p,65,100);assert.equal(p.pushEnergy,1);assert.equal(p.wakeExpiresAt,2200);assert.deepEqual([p.x,p.y,p.vx,p.vy],[12,10,20,-8]);
 for(let i=0;i<1000;i++)registerParticlePush(p,6,100+i*10);assert.equal(p.wakeExpiresAt,2200);assert.ok(p.pushEnergy<=1);
 const weak={pushEnergy:0,wakeAt:null,wakeExpiresAt:null,lifetime:1200};for(let i=0;i<100;i++)registerParticlePush(weak,6,i*10);assert.ok(weak.wakeExpiresAt<1400,'repeated weak contacts cannot earn the maximum extension');
});
test('force impulses heat particles, heat cools over time, and distant hot wake is protected from recycling',()=>{
 const {m,p}=oneParticle(15,0);m.step(16,identity,'PIANO');assert.ok(p.pushEnergy>0);assert.ok(p.wakeExpiresAt>p.wakeAt+p.lifetime);
 const heat=p.pushEnergy;Object.assign(p,{x:220,y:0,vx:0,vy:0,pushEnergy:.8});m.step(32,identity,'PIANO');assert.ok(p.alive);assert.ok(p.opacity>.3);assert.ok(p.pushEnergy<.8);
 const before=p.pushEnergy;m.step(682,identity,'PIANO');near(p.pushEnergy,before/2);assert.ok(p.alive);assert.ok(p.opacity>0);
});
test('hot cores trend to tinted white while glow and streak retain the instrument colour',()=>{
 const p={vx:0,vy:0,alpha:.7,opacity:.7,colour:instrumentColour('BELL'),pushEnergy:0};const calm=paintParticleLighting(p),warm=paintParticleLighting({...p,pushEnergy:.5}),hot=paintParticleLighting({...p,pushEnergy:1});
 assert.equal(calm.coreColour,p.colour);assert.ok(warm.whiteMix>0&&warm.whiteMix<hot.whiteMix);assert.ok(hot.whiteMix>.8&&hot.whiteMix<1);assert.match(hot.coreColour,/white/);assert.equal(hot.colour,p.colour);assert.equal(hot.highlight,1);assert.ok(hot.glow>calm.glow);
 const reduced=paintParticleLighting({...p,vx:400,pushEnergy:1},true);assert.equal(reduced.whiteMix,0);assert.equal(reduced.streak,0);assert.equal(reduced.coreColour,p.colour);
});
test('calm distant particles recycle before a hot distant wake; wake render bounds extend without clipping to old patch',()=>{
 const m=model();m.begin({x:0,y:0},0,identity,'PIANO');const pool=m.renderState().particles,cold=pool[0],hot=pool[1];Object.assign(cold,{x:-190,y:0});Object.assign(hot,{x:-400,y:0,pushEnergy:1,wakeAt:0,wakeExpiresAt:2400});
 m.move({x:5,y:0},16,identity,'PIANO');m.step(16,identity,'PIANO');assert.ok(cold.born>0);assert.equal(hot.born,0);assert.ok(hot.alive);assert.ok(hot.opacity>0);
 const bounds=paintParticleRenderBounds(m.renderState(),identity);assert.ok(bounds.left<=hot.x-20);
 m.release(16);m.step(600,identity,'PIANO');assert.ok(hot.alive,'hot wake outlives the ordinary 420ms release fade');m.step(1600,identity,'PIANO');assert.equal(m.active,false);
});

test('renderer uses a white-tinted hot core with base-colour glow/streak and a DrawGrid-sized outline',()=>{
 const f=fixture();f.effect.begin({x:100,y:100});for(let i=1;i<=4;i++)f.tick(i*16);const hot=f.draws.find(d=>d.fill.includes('color-mix'));
 assert.ok(hot);assert.equal(hot.stroke,instrumentColour('PIANO'));assert.equal(hot.glow,instrumentColour('PIANO'));assert.ok(f.arcs.some(r=>Math.abs(r-DRAWGRID_POINTER_SCREEN_RADIUS)<1e-8));f.effect.stop();
});
