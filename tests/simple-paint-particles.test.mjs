import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaintParticleModel,installPaintGestureParticles,paintParticleLighting,paintParticleVisibility,PAINT_PARTICLES} from '../src/simple-paint-particles.js';
const identity={x:0,y:0,scale:1};
const model=options=>createPaintParticleModel({random:()=>.37,...options});
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

test('dense field stays local, speed limited and has no push persistence through fast curves',()=>{
 const m=model();m.begin({x:0,y:0},0,identity,'PIANO');
 for(let i=1;i<=240;i++){const p={x:i*5,y:Math.sin(i/12)*80};m.move(p,i*16,identity,'PIANO');m.step(i*16,identity,'PIANO');const s=m.snapshot();assert.equal(s.particles.length,224);for(const q of s.particles){assert.ok(Math.hypot(q.vx,q.vy)<=110.001);assert.ok(Math.hypot(q.x-p.x,q.y-p.y)<=185.001);assert.equal(q.pushEnergy,0);}}
 assert.ok(m.snapshot().neighbourChecks<224*224*16);
});
test('stationary finger excludes particles and settles; release closes void without a burst',()=>{
 const m=model();m.begin({x:0,y:0},0,identity,'PIANO');for(let i=1;i<=300;i++)m.step(i*16,identity,'PIANO');
 const before=m.snapshot();assert.ok(before.particles.every(p=>Math.hypot(p.x,p.y)>=48.6-.001));assert.ok(Math.max(...before.particles.map(p=>Math.hypot(p.vx,p.vy)))<5);
 m.release(4800);for(let i=1;i<=30;i++)m.step(4800+i*16,identity,'PIANO');assert.ok(m.snapshot().particles.some(p=>Math.hypot(p.x,p.y)<47));m.step(5900,identity,'PIANO');assert.equal(m.active,false);
});
test('lighting follows current speed; fade cannot be bypassed by historic heat',()=>{
 const p={vx:0,vy:0,pushEnergy:1,alpha:.6,opacity:.6,colour:'#4488ff'};assert.equal(paintParticleLighting(p).highlight,0);p.vx=110;const light=paintParticleLighting(p);assert.ok(light.whiteMix<=.29);assert.ok(light.streak<=2);assert.equal(paintParticleVisibility(180,1),0);
});
test('coarse/reduced pools remain bounded and zoom preserves finger size',()=>{
 for(const [opts,cap] of [[{coarse:true},112],[{reduced:true},24],[{},224]])for(const scale of [.25,1,4]){const m=model(opts),t={...identity,scale};m.begin({x:0,y:0},0,t,'PIANO');m.step(16,t,'PIANO');assert.equal(m.snapshot().particles.length,cap);if(!opts.reduced)assert.ok(m.snapshot().particles.every(p=>Math.hypot(p.x,p.y)*scale>=48.599));m.stop();assert.equal(m.active,false);}
});
