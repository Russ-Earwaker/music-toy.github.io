import {RIPPLER_LOOP_TICKS,ripplerCycleAtTick} from './ripplesynth-transport.js';
import {quantizeBouncerOffsetTick} from './bouncer-transport.js';
import {waveReceiverDistance} from './board-wave.js';
import {resolveBoardInteraction} from './board-object.js';
import {RIPPLE_RANGE} from './simple-ripple.js';

// Called by the shared audio scheduler. RAF only reads the current cycle.
export function createLoopingRippleController({objects,getReceivers,getTransport,schedule,cancel=()=>{},respond=()=>{}}){
 const states=new Map();
 function snapshot(o,start,duration,t){
  const origin={...o.transform},events=[],seen=new Set();
  for(const r of getReceivers()){
   if(!r.capabilities?.triggerReceiver||seen.has(r.id))continue;
   const distance=waveReceiverDistance(origin,r);
   if(distance>RIPPLE_RANGE)continue;
   const event=resolveBoardInteraction(o,r,0);if(!event)continue;seen.add(r.id);
   const intendedTick=start+distance/RIPPLE_RANGE*duration;
   const eventTick=start+quantizeBouncerOffsetTick(intendedTick,start,2,{loopLengthTicks:duration});
   events.push({...event,intendedTick,eventTick});
  }
  return {start,duration,origin,events:events.sort((a,b)=>a.eventTick-b.eventTick),scheduled:new Set(),transport:t};
 }
 function clear(id){cancel(id);states.delete(id);}
 function reconcile(o,t){
  if(!t){if(states.has(o.id))clear(o.id);return null;}
  const tick=t.currentTick;let s=states.get(o.id);
  if(!s&&t.state!=='playing')return null;
  if(!s||s.transport!==t||tick<s.lastTick){
   if(s)clear(o.id);
   const duration=o.authoredState.periodLoops*RIPPLER_LOOP_TICKS;
   const start=ripplerCycleAtTick({active:true,startTick:0,sourcePhaseOriginTick:0,loopLengthTicks:duration},tick).startTick;
   s={transport:t,cycle:snapshot(o,start,duration,t),lastTick:tick,floor:tick};states.set(o.id,s);
  }
  // Do not replay missed cycles after a blocked tab or reconnection.
  if(tick>=s.cycle.start+s.cycle.duration){
   let start=s.cycle.start+s.cycle.duration;
   const duration=o.authoredState.periodLoops*RIPPLER_LOOP_TICKS;
   start+=Math.floor((tick-start)/duration)*duration;
   s.cycle=snapshot(o,start,duration,t);s.floor=start;
  }
  s.lastTick=tick;return s;
 }
 function tick(){
  for(const o of objects.list()){
   const t=getTransport(o.id),s=reconcile(o,t);if(!s||t.state!=='playing')continue;
   const c=s.cycle,now=t.currentTick,end=Math.min(c.start+c.duration,t.audioTimeToTick(t.tickToAudioTime(now)+0.15));
   for(let i=0;i<c.events.length;i++){
    const e=c.events[i];if(c.scheduled.has(i)||e.eventTick<s.floor||e.eventTick>=end)continue;
    c.scheduled.add(i);
    // Timbre/volume remain live until this short lookahead commits the event.
    const event={...e,instrument:o.capabilities.instrumentSource.instrumentId,volume:o.authoredState.volume,muted:o.authoredState.muted,
     emitterId:o.id,cycleStart:c.start,transportId:t.id,when:t.tickToAudioTime(e.eventTick)};
    if(e.eventTick<now-12)continue;
    schedule(event);respond(event,t);
   }
  }
 }
 function transportChanged(id,type){
  for(const o of objects.list())if(getTransport(o.id)?.id===id){
   const s=states.get(o.id);cancel(o.id);
   if(type==='seek'){states.delete(o.id);continue;}
   if(s){s.floor=getTransport(o.id).currentTick+1;for(let i=0;i<s.cycle.events.length;i++)if(s.cycle.events[i].eventTick>=s.floor)s.cycle.scheduled.delete(i);}
  }
 }
 function visibleWaves(){
  const result=[];for(const o of objects.list()){
   const t=getTransport(o.id),s=states.get(o.id);if(!t)continue;
   const duration=o.authoredState.periodLoops*RIPPLER_LOOP_TICKS;
   const c=s?.cycle||{origin:o.transform,duration,start:Math.floor(t.currentTick/duration)*duration};
   const phase=Math.max(0,Math.min(1,(t.currentTick-c.start)/c.duration));
   if(phase<1)result.push({id:o.id,emitterId:o.id,origin:c.origin,radius:phase*RIPPLE_RANGE,maxRadius:RIPPLE_RANGE});
  }return result;
 }
 function reset(){for(const id of states.keys())cancel(id);states.clear();}
 const off=objects.subscribe(e=>{if(e.type==='remove')clear(e.object.id);if(e.type==='restore')reset();});
 return {tick,visibleWaves,transportChanged,reset,emit(){tick();return null;},destroy(){reset();off();}};
}
