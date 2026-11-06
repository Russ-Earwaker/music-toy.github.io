import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdvectedDisturbance} from '../src/simple-paint/presentation/high/high-disturbance-field.js';
import {createHighPaintModel,HIGH_PAINT} from '../src/simple-paint/presentation/high/high-paint-model.js';
import {highPaintWorldDomain,highPaintMarkers} from '../src/simple-paint/presentation/high/high-paint-renderer.js';
import {highLiquidBufferSize} from '../src/simple-paint/presentation/high/high-quality-board-renderer.js';
const state=(event,time,x=0,y=0)=>({event,time,pointer:{x,y},drawing:event!=='release'});
function straight(){
 const m=createHighPaintModel({random:()=>.37});m.consume(state('begin',0));
 for(let i=1;i<=120;i++){m.consume(state('move',i*16,i*8));m.step(i*16);}
 return m;
}
test('separate disturbance requires moving contact and advects at material positions',()=>{
 const f=createAdvectedDisturbance(2),p={x:10,y:20,vx:30,vy:-10};
 f.inject(0,20,0);f.inject(1,0,500);assert.deepEqual([...f.values],[0,0]);
 f.inject(0,5,150);const initial=f.site(0,p);assert.ok(initial.energy>0);
 p.x+=p.vx*.25;p.y+=p.vy*.25;f.decay(.25);const moved=f.site(0,p);
 assert.equal(moved.x-initial.x,7.5);assert.equal(moved.y-initial.y,-2.5);
 assert.ok(Math.abs(moved.energy-initial.energy*Math.exp(-.25/1.05))<1e-6);
 assert.equal(f.values[1],0);assert.equal(p.vx,30);
});
test('holding a finger in calm moving liquid cannot create disturbance or a large halo',()=>{
 const m=createHighPaintModel({random:()=>.37});m.consume(state('begin',0));
 for(let i=1;i<=90;i++)m.step(i*16);
 assert.ok(m.state().particles.every(p=>p.energy===0&&p.brightness===0));
 const markers=highPaintMarkers({x:0,y:0},{x:0,y:0,scale:2});assert.equal(markers[4],0);assert.equal(markers[7],7);
});
test('old disturbed parcels keep their world rest positions and are not dragged with the pointer',()=>{
 const m=createHighPaintModel({random:()=>.37});m.consume(state('begin',0));m.consume(state('move',16,12));m.step(16);
 const parcel=m.state().particles.find(p=>p.energy>.3);assert.ok(parcel);
 const rest={x:parcel.restX,y:parcel.restY};
 for(let i=2;i<=40;i++){m.consume(state('move',i*16,i*8));m.step(i*16);}
 assert.equal(parcel.restX,rest.x);assert.equal(parcel.restY,rest.y);assert.ok(parcel.energy>.018);assert.ok(parcel.x<100);
});
test('visible wake survives several finger diameters behind the pointer without distance fading',()=>{
 const m=straight(),p=m.state().particles;
 const wake=p.filter(p=>p.x<960-HIGH_PAINT.fluidRepulsionRadiusWorld*6&&p.energy>.12);
 assert.ok(wake.length>200);assert.ok(wake.every(p=>p.opacity===1));
 assert.ok(p.every(p=>Math.hypot(p.vx,p.vy)<=105.001));assert.equal(p.length,1800);
 const domain=highPaintWorldDomain(p);assert.ok(domain.width>600);
});
test('the channel heals through inward material movement while its disturbance is still visible',()=>{
 const m=straight(),p=m.state().particles;
 const inChannel=()=>p.filter(q=>Math.abs(q.x-650)<50&&Math.abs(q.y)<30);
 const before=inChannel().length;
 m.consume(state('release',1920,960));for(let i=1;i<=60;i++)m.step(1920+i*16);
 assert.equal(m.state().particles,p);assert.ok(inChannel().length>before*1.3);
 assert.ok(p.some(q=>Math.abs(q.x-650)<70&&q.energy>.1));assert.ok(p.every(q=>q.opacity===1));
});
test('release preserves the wake, injects no energy and shuts down after activity settles',()=>{
 const m=straight();const peak=m.state().disturbance.peak;m.consume(state('release',1920,960));
 for(let i=1;i<=30;i++)m.step(1920+i*16);
 assert.equal(m.active,true);assert.ok(m.state().disturbance.peak<peak);assert.ok(m.state().disturbance.peak>.1);
 let age=480;while(m.active&&age<=7000){age+=16;m.step(1920+age);}
 assert.equal(m.active,false);assert.ok(age>1000&&age<=HIGH_PAINT.releaseMs+16);
});
test('wake raster budget derives from world extent and is independent of viewport/DPR',()=>{
 const domain=highPaintWorldDomain(straight().state().particles);
 const resolution=highLiquidBufferSize(domain.width,domain.height,1);
 assert.deepEqual(highLiquidBufferSize(domain.width,domain.height,2),resolution);
 assert.ok(resolution.every(n=>n<=512));assert.ok(resolution[0]*resolution[1]*12<=3*1024*1024);
});
