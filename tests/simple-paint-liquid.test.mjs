import test from 'node:test';
import assert from 'node:assert/strict';
import {createHighPaintModel,HIGH_PAINT} from '../src/simple-paint/presentation/high/high-paint-model.js';
import {highLiquidBufferSize} from '../src/simple-paint/presentation/high/high-quality-board-renderer.js';
import {HIGH_LIQUID} from '../src/simple-paint/presentation/high/high-liquid-shaders.js';
const state=(event,time,x=0)=>({event,time,pointer:{x,y:0},drawing:event!=='release'});
const mean=(particles,key)=>particles.reduce((sum,p)=>sum+p[key],0)/particles.length;

test('proximity alone does not light the undisturbed medium',()=>{
 const m=createHighPaintModel({random:()=>.37});m.consume(state('begin',0));m.step(16);
 const outer=m.state().particles.filter(p=>Math.hypot(p.x,p.y)>85);
 assert.ok(outer.length>500);assert.ok(outer.every(p=>p.energy===0&&p.brightness===0));
 assert.ok(HIGH_LIQUID.calmOpacity<=.005);
});
test('movement lights flowing material; pause dims it without changing the particle population',()=>{
 const m=createHighPaintModel({random:()=>.37});m.consume(state('begin',0));
 for(let i=1;i<=120;i++){m.consume(state('move',i*16,i*2));m.step(i*16);}
 const pool=m.state().particles,lit=mean(pool,'brightness');assert.ok(lit>0);assert.ok(pool.filter(p=>p.energy>.1).length>100);
 for(let i=121;i<=500;i++)m.step(i*16);
 assert.equal(m.state().particles,pool);assert.equal(pool.length,1800);assert.ok(mean(pool,'brightness')<lit*.1);assert.ok(Math.max(...pool.map(p=>p.pressure))<1e-6);
 assert.ok(pool.every(p=>Math.hypot(p.vx,p.vy)<=HIGH_PAINT.maxSpeed+.001));
});
test('compressed pressure front follows motion and never creates a stationary spotlight',()=>{
 const m=createHighPaintModel({random:()=>.37});m.consume(state('begin',0));
 for(let i=1;i<=120;i++){m.consume(state('move',i*16,i*2));m.step(i*16);}
 const p=m.state().particles,front=p.filter(p=>p.x>240&&Math.hypot(p.x-240,p.y)<80),back=p.filter(p=>p.x<240&&Math.hypot(p.x-240,p.y)<80);
 assert.ok(mean(front,'pressure')>.005);assert.ok(mean(back,'pressure')<1e-5);
 m.consume(state('release',1920,240));m.step(1936);assert.ok(p.every(p=>p.pressure===0));
});
test('recent displacement decays continuously rather than flashing off on a particle lifetime',()=>{
 const m=createHighPaintModel({random:()=>.37});m.consume(state('begin',0));m.consume(state('move',16,10));m.step(16);
 const p=m.state().particles.find(p=>p.energy>.3);assert.ok(p);const energy=p.energy;
 // Released particles cannot receive another boundary displacement.
 m.consume(state('release',16,10));for(let i=1;i<=20;i++)m.step(16+i*16);
 assert.ok(p.energy>0&&p.energy<energy);assert.ok(Math.abs(p.energy-energy*Math.exp(-.32/HIGH_PAINT.disturbanceDecaySeconds))<2e-6);
 assert.equal(m.state().particles.length,1800);m.step(8000);assert.equal(m.active,false);
});
test('world-domain texture buckets remain bounded and ignore DPR',()=>{
 assert.deepEqual(highLiquidBufferSize(800,600,1),[512,512]);assert.deepEqual(highLiquidBufferSize(800,600,2),[512,512]);
 assert.deepEqual(highLiquidBufferSize(3840,2160,2),[512,512]);
 assert.deepEqual(highLiquidBufferSize(1,1,1),[1,1]);
 assert.ok(512*512*4*3<=3*1024*1024);
});
