import test from 'node:test';
import assert from 'node:assert/strict';
import {createHighPaintModel,HIGH_PAINT} from '../src/simple-paint/presentation/high/high-paint-model.js';
import {highPaintScreenSize,highPaintMarkers,highPaintBlurScreenSize,highPaintWorldDomain} from '../src/simple-paint/presentation/high/high-paint-renderer.js';
import {HIGH_LIQUID} from '../src/simple-paint/presentation/high/high-liquid-shaders.js';
import {particleScreenPoint} from '../src/simple-paint-particles.js';
import {createPaintRenderState} from '../src/simple-paint/presentation/paint-render-state.js';
import {DRAWGRID_POINTER_SCREEN_RADIUS} from '../src/drawgrid/drawgrid-pointer-radius.js';
import {prepareBoardDrawing} from '../src/simple-draw-placement.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<.0001,`${a} ≈ ${b}`);
const camera=scale=>({x:80,y:-30,scale});
const input=(event,time,pointer,transform)=>({event,time,pointer,transform,drawing:event!=='release'});

test('seeded domain and particle budgets are world-relative at every zoom',()=>{
 let reference;
 for(const scale of [.5,1,2]){
  const m=createHighPaintModel({random:()=>.37});m.consume(input('begin',0,{x:20,y:30},camera(scale)));
  const particles=m.state().particles;assert.equal(particles.length,1800);
  assert.ok(particles.every(p=>Math.hypot(p.x-20,p.y-30)<=145));
  if(reference)assert.deepEqual(particles,reference);else reference=structuredClone(particles);
 }
 const coarse=createHighPaintModel({coarse:true});coarse.consume(input('begin',0,{x:0,y:0},camera(.5)));assert.equal(coarse.state().particles.length,900);
 assert.equal(HIGH_PAINT.cellSizeWorld,16);
});

test('same world gesture, pause and release yield identical physics through camera changes',()=>{
 function run(changingCamera){
  const m=createHighPaintModel({random:()=>.37});m.consume(input('begin',0,{x:0,y:0},camera(1)));const pool=m.state().particles,first=pool[0];
  for(let frame=1;frame<=220;frame++){
   const t=changingCamera?{x:frame*3,y:-frame*2,scale:[.5,1,2][frame%3]}:camera(1);
   const p={x:Math.min(frame,110)*1.4,y:Math.sin(Math.min(frame,110)/15)*45};
   if(frame<=110)m.consume(input('move',frame*16,p,t));
   if(frame===170)m.consume(input('release',frame*16,p,t));
   m.step(frame*16,t);
   assert.equal(m.state().particles,pool);assert.equal(pool[0],first);
  }
  return structuredClone(pool);
 }
 assert.deepEqual(run(true),run(false));
});

test('zoom/pan at a frozen instant changes only projection, not simulation or pointer',()=>{
 const m=createHighPaintModel({random:()=>.37});const pointer={x:25,y:40};m.consume(input('begin',0,pointer,camera(1)));
 for(let frame=1;frame<=60;frame++)m.step(frame*16);
 const particles=m.state().particles,before=structuredClone(particles);
 for(const scale of [.5,1,2]){
  m.step(960,camera(scale));
  for(let i=0;i<particles.length;i++){near(particles[i].x,before[i].x);near(particles[i].y,before[i].y);near(particles[i].vx,before[i].vx);near(particles[i].vy,before[i].vy);}
  const p=particles[900],projected=particleScreenPoint(p,camera(scale));near(projected.x,80+p.x*scale);near(projected.y,-30+p.y*scale);
  const markers=highPaintMarkers(pointer,camera(scale));near(markers[0],80+25*scale);near(markers[1],-30+40*scale);
  near(markers[2]/2,DRAWGRID_POINTER_SCREEN_RADIUS*scale);assert.equal(markers[7],7);
 }
 const p=particles[900],a=particleScreenPoint(p,camera(1)),b=particleScreenPoint(p,{x:120,y:20,scale:1});near(b.x-a.x,40);near(b.y-a.y,50);
});

test('repulsion, wake domain, density splats and blur scale together; only tiny cursor stays screen-sized',()=>{
 assert.equal(HIGH_PAINT.fluidRepulsionRadiusWorld,DRAWGRID_POINTER_SCREEN_RADIUS);
 const pointer={x:0,y:0},domain=highPaintWorldDomain([{x:-400,y:-80},{x:150,y:80}]);
 for(const scale of [.5,1,2]){
  const t=camera(scale),center=particleScreenPoint(pointer,t),fadeEdge=particleScreenPoint({x:domain.width,y:0},t);
  near(fadeEdge.x-center.x,domain.width*scale);assert.equal(HIGH_LIQUID.calmOpacity,0);
  const size=highPaintScreenSize(1.5,t);near(size,1.5*scale);near(size*HIGH_LIQUID.splatDiameter,27*scale);near(highPaintBlurScreenSize(t),3*scale);
  near(highPaintMarkers(pointer,t)[2],97.2*scale);
 }
 assert.equal(highPaintScreenSize(1.5,camera(.001)),.15);
});

test('camera metadata does not alter shared world velocity or authored Paint path',()=>{
 function pathWithZoom(changing){
  let clock=0,scale=1,offset=0;
  const capture=createPaintRenderState({worldToScreen:p=>({x:p.x*scale+offset,y:p.y*scale}),getInstrument:()=> 'PIANO',window:{performance:{now:()=>clock},matchMedia:()=>({matches:false})}});
  let state;
  for(let i=0;i<40;i++){
   clock=i*16;scale=changing?[.5,1,2][i%3]:1;offset=changing?i*4:0;
   state=capture(i?'move':'begin',{x:i*4,y:Math.sin(i/7)*40});
   if(i)near(state.velocity.x,250);
  }
  return {path:state.path,authored:prepareBoardDrawing(state.path)};
 }
 assert.deepEqual(pathWithZoom(true),pathWithZoom(false));
});
