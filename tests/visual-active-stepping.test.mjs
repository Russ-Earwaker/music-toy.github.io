import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {getVisualActiveToyIds} from '../src/graph-playback-state.js';
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
test('production visual loop steps standalone and chained Simple Rhythm once per column',()=>{
 const model=createConnectionModel(),instances=new Map(),counts=new Map();
 model.registerObject('H',{ports:HEARTBEAT_PORTS,transportId:'H'});
 const panel=id=>({id,dataset:{toy:'loopgrid',steps:'8'},__sequencerStep:()=>counts.set(id,(counts.get(id)||0)+1)});
 const a=panel('A'),b=panel('B'),loose=panel('loose'),inactive=panel('inactive');
 for(const p of [a,b,loose,inactive]){model.registerObject(p.id);instances.set(p.id,{active:p!==inactive});}
 const connect=(a,b,kind='sequence')=>model.connect(kind,{objectId:a,portId:'output'},{objectId:b,portId:'input'});
 connect('H','A','transport');connect('H','inactive','transport');
 const lastCol=new Map(),playing={state:'playing'},panels=[a,b,loose,inactive];
 const context={CHAIN_FEATURE_ENABLE_SCHEDULER:true,CHAIN_FEATURE_ENABLE_SEQUENCER:true,CHAIN_FEATURE_ENABLE_MARK_ACTIVE:false,
 transportRegistry:{list:()=>[{transport:playing}],get:()=>playing},hasChains:false,allowChainWork:true,
 g_sequenceChains:{updateCurrent(){}},info:{currentTick:0},__perfOn:false,window:{},getSequencedToys:()=>panels,
 getVisualActiveToyIds:(m,p,o)=>getVisualActiveToyIds(m,p,{...o,getInstance:id=>instances.get(id)}),connectionModel:model,
 getPanelTransport:()=>playing,debugFirstStep:()=>false,prevHadActiveToys:false,prevActiveToyIds:new Set(),CHAIN_DEBUG:false,
 document:{getElementById:id=>panels.find(p=>p.id===id)},transportLoopInfo:()=>({state:playing.state,phase01:0,currentTick:0}),
 ensureAudioContext:()=>({currentTime:0}),shouldRenderToyVisuals:()=>true,NUM_STEPS:8,
 getPlaybackInstance:id=>instances.get(id),getPlaybackColumnWithinTurn:()=>0,lastCol,console};
 const start=source.indexOf('    if (CHAIN_FEATURE_ENABLE_SCHEDULER && transportRegistry.list()'),end=source.indexOf('              // If this toy actually has notes',start);
 const script=source.slice(start,end)+'}}}}}';vm.createContext(context);
 vm.runInContext(script,context);vm.runInContext(script,context);assert.equal(counts.get('A'),1);assert.equal(counts.has('loose'),false);assert.equal(counts.has('inactive'),false);
 connect('A','B');context.hasChains=true;lastCol.clear();vm.runInContext(script,context);assert.equal(counts.get('A'),2);assert.equal(counts.get('B'),1);
 instances.get('A').active=false;lastCol.clear();vm.runInContext(script,context);assert.equal(counts.get('A'),2);
 playing.state='paused';lastCol.clear();vm.runInContext(script,context);assert.equal(counts.get('B'),2);
});
