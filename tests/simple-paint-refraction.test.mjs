import test from 'node:test';
import assert from 'node:assert/strict';
import {createFluidScene} from '../src/simple-paint/presentation/fluid/fluid-scene.js';

test('scene copies visible art in screen coordinates, excludes hidden layers and releases backing memory',()=>{
 const calls=[],ctx={setTransform:(...a)=>calls.push(['transform',...a]),clearRect(){},fillRect(){},save(){},restore(){},drawImage:(...a)=>calls.push(['image',...a])};
 const target={getContext:()=>ctx};
 const layer=(visible=true)=>({width:400,height:200,visible,getBoundingClientRect:()=>({left:30,top:40,width:200,height:100})});
 const paint=layer(),hidden=layer(false),future=layer();
 const doc={body:{},createElement:()=>target,querySelector:()=>null,querySelectorAll:selector=>selector.includes('canvas')?[paint,hidden]:[]};
 const win={getComputedStyle:l=>({backgroundColor:'#123456',visibility:l.visible===false?'hidden':'visible',opacity:'.8'})};
 const scene=createFluidScene({document:doc,window:win,getBackgroundLayer:()=>future});
 assert.equal(scene.capture({width:800,height:600,dpr:2,transform:{x:0,y:0,scale:1}}),target);
 assert.equal(target.width,800);assert.equal(target.height,600);
 assert.deepEqual(calls.filter(c=>c[0]==='image'),[['image',paint,30,40,200,100],['image',future,30,40,200,100]]);
 scene.destroy();assert.equal(target.width,1);assert.equal(target.height,1);
});

test('scene provider does not double composite a registered painted background',()=>{
 let draws=0;const ctx={setTransform(){},clearRect(){},fillRect(){},save(){},restore(){},drawImage(){draws++;}};
 const layer={width:100,height:100,getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})};
 const doc={body:{},createElement:()=>({getContext:()=>ctx}),querySelector:()=>null,querySelectorAll:s=>s.includes('canvas')?[layer]:[]};
 createFluidScene({document:doc,window:{},getBackgroundLayer:()=>layer}).capture({width:100,height:100,dpr:1,transform:{x:0,y:0,scale:1}});
 assert.equal(draws,1);
});
