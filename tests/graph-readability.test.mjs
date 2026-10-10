import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLogicalToyMetricsReader} from '../src/logical-toy-anchor.js';
import {MIN_CONNECTION_CORRIDOR,MIN_SIBLING_GAP_Y} from '../src/graph-placement.js';
import {GRAPH_ENDPOINT_HIT_DIAMETER,GRAPH_MIDPOINT_HIT_DIAMETER} from '../src/graph-visuals.js';
test('shared spacing leaves endpoint and midpoint hit controls separated',()=>{
 assert.ok(MIN_CONNECTION_CORRIDOR >= GRAPH_ENDPOINT_HIT_DIAMETER+GRAPH_MIDPOINT_HIT_DIAMETER+32);
 assert.ok(MIN_SIBLING_GAP_Y>=GRAPH_ENDPOINT_HIT_DIAMETER);
});
test('logical socket offsets are cached independently of camera and invalidate on toy/body/header resize',()=>{
 let callback,reads=0;class Observer{constructor(cb){callback=cb;}observe(){}}
 const body={offsetTop:70,offsetHeight:200},header={},panel={clientTop:1,get offsetWidth(){reads++;return 300;},get offsetHeight(){reads++;return 270;},getBoundingClientRect(){throw Error('client rect must never be used');},querySelector:q=>q.includes('body')?body:header};
 const reader=createLogicalToyMetricsReader(Observer);assert.deepEqual(reader(panel),{width:300,height:270,localY:171});
 const count=reads;for(let i=0;i<100;i++)reader(panel);assert.equal(reads,count);
 body.offsetHeight=300;callback([{target:body}]);assert.equal(reader(panel).localY,221);assert.ok(reads>count);
});
test('instrument header blend derives colour while bounding luminance for extreme configurable colours',()=>{
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');assert.match(css,/background: color-mix\(in srgb, var\(--instrument-colour\) 25%, #101725 75%\)/);
 const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
 const luminance=rgb=>rgb.map(linear).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),foreground=luminance([244,247,255]);
 for(const colour of [[255,255,255],[0,0,0],[255,255,0],[0,255,255],[255,0,255],[255,0,0],[0,255,0],[0,0,255]]){
  const background=colour.map((v,i)=>.25*v+.75*[16,23,37][i]);assert.ok((foreground+.05)/(luminance(background)+.05)>7);
 }
});

test('Heartbeat core lives in the world view and follows authoritative phase, leaving the screen anchor to draw background effects',()=>{
 const view=readFileSync(new URL('../src/heartbeat-view.js',import.meta.url),'utf8'),anchor=readFileSync(new URL('../src/board-anchor.js',import.meta.url),'utf8');
 assert.match(view,/canvas.className='heartbeat-core'/);assert.match(view,/getHeartbeatVisualPhase\(transport.getState\(\)\)/);assert.match(view,/world.append\(el\)/);
 assert.doesNotMatch(anchor,/drawAnchorParticles\(/);
});
