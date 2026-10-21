import {RIPPLER_LOOP_TICKS,ripplerCycleAtTick} from './ripplesynth-transport.js';
import {quantizeBouncerOffsetTick} from './bouncer-transport.js';
import {waveReceiverDistance} from './board-wave.js';
import {resolveBoardInteraction} from './board-object.js';
import {RIPPLE_RANGE} from './simple-ripple.js';

// Called by the shared audio scheduler. RAF only reads the current cycle.
export function createLoopingRippleController({objects,getReceivers,getTransport,isReceiverDragging=()=>false,schedule,cancel=()=>{},respond=()=>{}}){
 const states=new Map(),sounds=new Map();
 const soundKey=event=>JSON.stringify([event.transportId,event.eventTick,event.sourceMidi,event.instrument]);
 function cancelSource(id){
  cancel(id);
  for(const [key,sound]of sounds)if(sound.ownerId===id){
   sounds.delete(key);
   // Another emitter may have shared this voice. Allow its unstarted attack
   // to be admitted again when the owner disconnects or replans a drag.
   for(const [otherId,s]of states)if(otherId!==id){
    for(let i=0;i<s.cycle.events.length;i++){
     const e=s.cycle.events[i];
     if(e.eventTick>s.transport.currentTick&&soundKey({...e,transportId:s.transport.id,instrument:objects.get(otherId)?.capabilities.instrumentSource.instrumentId})===key)s.cycle.scheduled.delete(i);
    }
   }
  }
 }
 function receiverEvent(c,o,r,intendedTick){
  const event=resolveBoardInteraction(o,r,0);if(!event)return null;
  const eventTick=c.start+quantizeBouncerOffsetTick(intendedTick,c.start,2,{loopLengthTicks:c.duration});
  return {...event,intendedTick,eventTick};
 }
 function discoverReceivers(c,o,fromTick){
  const {origin,start,duration,events,seen}=c;
  for(const r of getReceivers()){
   if(!r.capabilities?.triggerReceiver||seen.has(r.id))continue;
   // Observe each identity once, including receivers already behind the wave.
   // Moving an existing receiver must not rewrite this cycle's geometry.
   seen.add(r.id);
   const distance=waveReceiverDistance(origin,r);
   if(distance>RIPPLE_RANGE)continue;
   const intendedTick=start+distance/RIPPLE_RANGE*duration;
   if(intendedTick<fromTick)continue;
   const event=receiverEvent(c,o,r,intendedTick);if(event)events.push(event);
  }
 }
 function snapshot(o,start,duration,t){
  const c={start,duration,origin:{...o.transform},events:[],seen:new Set(),scheduled:new Set(),dragTracks:new Map(),transport:t};
  discoverReceivers(c,o,-Infinity);c.events.sort((a,b)=>a.eventTick-b.eventTick);return c;
 }
 function clear(id){cancelSource(id);states.delete(id);}
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
 function followDraggedReceivers(c,o,now){
  let invalidate=false;
  for(const r of getReceivers()){
   if(!r.capabilities?.triggerReceiver)continue;
   const dragging=isReceiverDragging(r.id),track=c.dragTracks.get(r.id);
   if(!dragging&&!track)continue;
   const active=c.events.filter(e=>!e.disabled&&e.receiverId===r.id);
   // An arrival already reached (including a pending quantised attack) is latched.
   if(active.some(e=>e.intendedTick<=now||e.dragHit||(e.eventTick<=now&&c.scheduled.has(c.events.indexOf(e))))){c.dragTracks.delete(r.id);continue;}
   if(dragging&&!track){
    for(const e of active){e.disabled=true;if(c.scheduled.has(c.events.indexOf(e)))invalidate=true;}
   }
   const gap=waveReceiverDistance(c.origin,r)-(now-c.start)/c.duration*RIPPLE_RANGE;
   if((!track&&gap===0)||(track&&((track.gap>0&&gap<=0)||(track.gap<0&&gap>=0)))){
    const event=receiverEvent(c,o,r,now);
    if(event)c.events.push({...event,dragHit:true});
    c.dragTracks.delete(r.id);
   }else if(!dragging){
    const distance=waveReceiverDistance(c.origin,r);
    if(gap>=0&&distance<=RIPPLE_RANGE){const event=receiverEvent(c,o,r,c.start+distance/RIPPLE_RANGE*c.duration);if(event)c.events.push(event);}
    c.dragTracks.delete(r.id);
   }else c.dragTracks.set(r.id,{gap});
  }
  if(invalidate){
   cancelSource(o.id);
   // Audio is source-owned: cancel/rebuild all unstarted events for this emitter.
   for(let i=0;i<c.events.length;i++)if(c.events[i].eventTick>now)c.scheduled.delete(i);
  }
 }
 function tick(){
  for(const [key,sound]of sounds)if(sound.transport.currentTick>sound.eventTick+40)sounds.delete(key);
  for(const o of objects.list()){
   const t=getTransport(o.id),s=reconcile(o,t);if(!s||t.state!=='playing')continue;
   const c=s.cycle,now=t.currentTick,end=Math.min(c.start+c.duration,t.audioTimeToTick(t.tickToAudioTime(now)+0.15));
   discoverReceivers(c,o,now);
   followDraggedReceivers(c,o,now);
   for(let i=0;i<c.events.length;i++){
    const e=c.events[i];if(e.disabled||c.scheduled.has(i)||e.eventTick<s.floor||e.eventTick>=end)continue;
    c.scheduled.add(i);
    // Timbre/volume remain live until this short lookahead commits the event.
    const event={...e,instrument:o.capabilities.instrumentSource.instrumentId,volume:o.authoredState.volume,muted:o.authoredState.muted,
     emitterId:o.id,cycleStart:c.start,transportId:t.id,when:t.tickToAudioTime(e.eventTick)};
    if(e.eventTick<now-12)continue;
    const key=soundKey(event);
    if(!event.muted&&event.volume>0&&!sounds.has(key)){sounds.set(key,{ownerId:o.id,transport:t,eventTick:event.eventTick});schedule(event);}
    respond(event,t);
   }
  }
 }
 function transportChanged(id,type){
  for(const o of objects.list())if(getTransport(o.id)?.id===id){
   const s=states.get(o.id);cancelSource(o.id);
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
 function reset(){for(const id of states.keys())cancel(id);states.clear();sounds.clear();}
 const off=objects.subscribe(e=>{if(e.type==='remove')clear(e.object.id);if(e.type==='restore')reset();});
 return {tick,visibleWaves,transportChanged,reset,emit(){tick();return null;},destroy(){reset();off();}};
}
