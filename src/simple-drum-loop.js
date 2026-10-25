import {quantizeForwardTick,ripplerEventsInWindow} from './ripplesynth-transport.js';
import {resolvePlayableActivation} from './board-object.js';
import {ensureTransportPlayingForSimpleAuthoring} from './simple-authoring-playback.js';

// Canonical DrawGrid authored notes are the only pattern authority. The shared
// application scheduler services this controller; presentation only reads phase.
export function createDrumLoopController({objects,getTransport,schedule,cancel=()=>{},release=cancel}){
 const admitted=new Map(),feedback=new Map(),sounds=new Map(),listeners=new Set(),cursors=new Map(),transports=new Map(),seekPending=new Set(),liveIds=new Set(objects.list().map(o=>o.id));let recording=false;
 const notify=e=>{for(const fn of listeners)fn(e);};
 const soundKey=e=>JSON.stringify([e.transportId,e.eventTick,e.sourceMidi,e.instrument]);
 function releaseSounds(id,futureOnly=false,transfer=true){
  const now=getTransport(id)?.currentTick??-1;
  for(const [key,e]of sounds)if(e.sourceId===id&&(!futureOnly||e.eventTick>now)){
   sounds.delete(key);
   if(transfer){const other=[...admitted.values()].find(candidate=>candidate.sourceId!==id&&candidate.eventTick>(getTransport(candidate.sourceId)?.currentTick??Infinity)&&!candidate.muted&&candidate.volume>0&&soundKey(candidate)===key);
    if(other){sounds.set(key,other);schedule(other);}
   }
  }
 }
 function clear(id,remove=false,transfer=true){cancel(id);for(const [key,e]of admitted)if(e.sourceId===id)admitted.delete(key);for(const [key,e]of feedback)if(e.sourceId===id)feedback.delete(key);releaseSounds(id,false,transfer);cursors.delete(id);if(remove)release(id);}
 function invalidateFuture(id){
  const t=getTransport(id),now=t?.currentTick??-1,transient=[...admitted.values()].filter(e=>e.sourceId===id&&e.eventTick>now&&e.activationSource==='trigger');
  cancel(id);
  for(const [key,e]of admitted)if(e.sourceId===id&&e.eventTick>now)admitted.delete(key);
  for(const [key,e]of feedback)if(e.sourceId===id&&e.eventTick>now)feedback.delete(key);
  releaseSounds(id,true);
  cursors.set(id,now+1);
  for(const e of transient)admit(id,e.eventTick,t,'trigger');
 }
 function admit(id,eventTick,t,activationSource){
  const o=objects.get(id),direct=resolvePlayableActivation(o,t.tickToAudioTime(eventTick));if(!direct)return null;
  const key=id+':'+eventTick;if(admitted.has(key)){const existing=admitted.get(key);if(activationSource==='manual')existing.activationSource='manual';return null;}
  const event={...direct,activationSource,eventTick,when:t.tickToAudioTime(eventTick),transportId:t.id};admitted.set(key,event);feedback.set(key,event);
  const voiceKey=soundKey(event);if(!event.muted&&event.volume>0&&!sounds.has(voiceKey)){sounds.set(voiceKey,event);schedule(event);}return event;
 }
 function recordManualHit(id,eventTick){
  const o=objects.get(id);if(!o)return null;
  const slot=(eventTick%(o.authoredState.periodLoops*384))/48;
  if(!o.authoredState.pattern.authoredNotes.some(n=>n.col===slot)){
   recording=true;try{objects.update(id,{pattern:{authoredNotes:[...o.authoredState.pattern.authoredNotes,{col:slot,sourceMidi:60}]}});}finally{recording=false;}
  }
 }
 function activateDrum({id,eventTick,transport:t,activationSource}){
  if(!['manual','trigger','loopPlayback'].includes(activationSource))throw new TypeError('Unknown Drum activation source');
  if(!objects.get(id))return null;
  if(activationSource==='manual')recordManualHit(id,eventTick);
  return admit(id,eventTick,t,activationSource);
 }
 async function activate(id){
  const t=getTransport(id);if(!t||!objects.get(id))return null;
  const eventTick=quantizeForwardTick(t.currentTick);recordManualHit(id,eventTick);
  const start=ensureTransportPlayingForSimpleAuthoring(t);if(start)await start;
  return activateDrum({id,eventTick,transport:t,activationSource:'manual'});
 }
 async function trigger(event){
  // External hits retain one-shot admission without starting the Drum's loop.
  const t=getTransport(event.receiverId);if(!t)return null;
  const tick=t.audioTimeToTick(event.when);
  return activateDrum({id:event.receiverId,eventTick:quantizeForwardTick(tick,0,2,{strict:false}),transport:t,activationSource:'trigger'});
 }
 function tick(){
  for(const o of objects.list()){
   const t=getTransport(o.id);if(!t){if(transports.has(o.id)){clear(o.id);transports.delete(o.id);}continue;}
   if(transports.has(o.id)&&transports.get(o.id)!==t)clear(o.id);transports.set(o.id,t);
   if(t.state!=='playing')continue;
   const now=t.currentTick,from=cursors.get(o.id)??now,to=t.audioTimeToTick(t.tickToAudioTime(now)+.15);
   const notes=o.authoredState.pattern.authoredNotes,steps=o.authoredState.periodLoops*8;
   const pattern=Array.from({length:steps},(_,i)=>notes.flatMap((n,index)=>n.col===i?[index]:[]));
   const events=ripplerEventsInWindow({instance:{active:true,startTick:0,sourcePhaseOriginTick:0,loopLengthTicks:steps*48},pattern,blocks:notes.map(()=>({active:true})),fromTick:Math.max(now-6,from),toTick:to});
   for(const e of events)activateDrum({id:o.id,eventTick:e.eventTick,transport:t,activationSource:'loopPlayback'});cursors.set(o.id,to);
  }
  for(const [key,event]of feedback){const t=getTransport(event.sourceId);if(!t){feedback.delete(key);continue;}if(t.state==='playing'&&t.currentTick>=event.eventTick){feedback.delete(key);notify(event);}}
  for(const [key,e]of admitted){const t=getTransport(e.sourceId);if(!t||t.currentTick>e.eventTick+1536)admitted.delete(key);}
  for(const [key,e]of sounds){const t=getTransport(e.sourceId);if(!t||t.currentTick>e.eventTick+1536)sounds.delete(key);}
 }
 function transportChanged(id,type,fromState){for(const o of objects.list())if(getTransport(o.id)?.id===id){
  clear(o.id,false,false);const t=getTransport(o.id);
  if(type==='seek'&&t.state!=='playing')seekPending.add(o.id);
  const includeBoundary=type==='seek'||(type==='play'&&(seekPending.has(o.id)||fromState!=='paused'));
  cursors.set(o.id,t.currentTick+(includeBoundary?0:1));if(type==='play')seekPending.delete(o.id);
 }if(type==='play'||type==='seek')tick();}
 function phase(id){const o=objects.get(id),t=getTransport(id);return o&&t?{tick:t.currentTick%(o.authoredState.periodLoops*384),running:t.state==='playing'}:{tick:0,running:false};}
 function removeHit(id,col){const o=objects.get(id);if(o)objects.update(id,{pattern:{authoredNotes:o.authoredState.pattern.authoredNotes.filter(n=>n.col!==col)}});}
 const off=objects.subscribe(e=>{
  if(e.type==='add')liveIds.add(e.object.id);
  if(e.type==='remove'){clear(e.object.id,true);liveIds.delete(e.object.id);transports.delete(e.object.id);seekPending.delete(e.object.id);}
  if(e.type==='restore'){for(const id of liveIds)clear(id,true,false);liveIds.clear();for(const o of objects.list())liveIds.add(o.id);cursors.clear();transports.clear();seekPending.clear();}
  if(e.type==='update'&&!recording){const o=e.object;const before=e.previous;if(!before||JSON.stringify(before.authoredState)!==JSON.stringify(o.authoredState))invalidateFuture(o.id);}
 });
 function clearPattern(id){if(objects.get(id))objects.update(id,{pattern:{authoredNotes:[]}});}
 return {activate,activateDrum,clearPattern,trigger,tick,phase,removeHit,transportChanged,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},destroy(){off();for(const o of objects.list())clear(o.id,true,false);listeners.clear();}};
}
