import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureTransportPlayingForSimpleAuthoring as ensurePlaying} from '../src/simple-authoring-playback.js';
import {createRippleObjects} from '../src/simple-ripple.js';
import {createLoopingRippleController} from '../src/simple-ripple-loop.js';

test('authoring starts once, leaves running transport phase/BPM untouched and shares concurrent starts',async()=>{
 let release,plays=0;const t={state:'stopped',currentTick:173,bpm:137,play(){plays++;return new Promise(r=>release=()=>{this.state='playing';r(true);});}};
 const first=ensurePlaying(t),second=ensurePlaying(t);assert.equal(first,second);assert.equal(plays,1);release();await first;
 assert.equal(ensurePlaying(t),false);assert.equal(plays,1);assert.equal(t.currentTick,173);assert.equal(t.bpm,137);
});
test('failed starts can be retried and paused authoring resumes without seeking',async()=>{
 let plays=0;const t={state:'paused',currentTick:211,bpm:93,async play(){if(++plays===1)throw Error('resume failed');this.state='playing';}};
 await assert.rejects(ensurePlaying(t),/resume failed/);await ensurePlaying(t);assert.equal(plays,2);assert.equal(t.currentTick,211);assert.equal(t.bpm,93);assert.equal(ensurePlaying(null),false);
});
test('creating a Ripple starts its ordinary transport once; repeat creation cannot restart it',async()=>{
 let plays=0,schedules=0;const t={state:'stopped',currentTick:96,bpm:120,tickToAudioTime:t=>t/192,audioTimeToTick:t=>t*192,async play(){plays++;this.state='playing';}};
 const objects=createRippleObjects(),controller=createLoopingRippleController({objects,getTransport:()=>t,getReceivers:()=>[],schedule:()=>schedules++});
 const a=objects.create({x:100,y:200});assert.equal(t.state,'stopped');await controller.emit(a.id);assert.equal(t.state,'playing');assert.equal(plays,1);assert.equal(controller.visibleWaves()[0].radius,180);
 await controller.emit(objects.create({x:400,y:500}).id);assert.equal(plays,1);assert.equal(t.currentTick,96);assert.equal(schedules,0);controller.destroy();
});
