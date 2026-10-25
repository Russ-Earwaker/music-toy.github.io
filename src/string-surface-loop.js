import {createBoardObjectId,resolvePlayableActivation} from './board-object.js';
import {ensureTransportPlayingForSimpleAuthoring} from './simple-authoring-playback.js';
import {surfaceAnchor,surfaceOffset} from './surface-timing.js';
import {surfaceRegionIndex} from './receiver-surface.js';

// One admission path for both toys. Only manual performance writes recordedEvents.
export function createStringSurfaceLoop({objects,getTransport,getTriggerTransport=()=>null,schedule,cancel=()=>{},release=cancel}){
 const admitted=new Map(),feedback=new Map(),cursors=new Map(),listeners=new Set();let recording=false;
 function clear(id){cancel(id);for(const [key,e]of admitted)if(e.sourceId===id)admitted.delete(key);for(const [key,e]of feedback)if(e.event.sourceId===id)feedback.delete(key);cursors.delete(id);}
 function admit(id,hit,eventTick,t,activationSource){
  const o=objects.get(id);if(!o||!t)return null;const voice=resolvePlayableActivation(o,t.tickToAudioTime(eventTick),hit);if(!voice)return null;
  const key=[id,t.id,eventTick,voice.lane,voice.region].join(':');if(admitted.has(key)){const old=admitted.get(key);if(activationSource==='manual'){old.activationSource='manual';return old;}return null;}
  const event={...voice,activationSource,eventTick,when:t.tickToAudioTime(eventTick),transportId:t.id};admitted.set(key,event);feedback.set(key,{event,transport:t});
  if(!event.muted&&event.volume>0)schedule(event);return event;
 }
 async function perform(id,hits,{gesture={}}={}){
  const o=objects.get(id),t=getTransport(id);if(!o||!t||!hits.length)return [];
  if(gesture.anchorTick==null){gesture.anchorTick=surfaceAnchor(gesture.startTick??t.currentTick);gesture.bpm??=t.bpm;gesture.id=createBoardObjectId('strum-');gesture.order=0;}
  const planned=hits.map(hit=>({hit,eventTick:gesture.anchorTick+surfaceOffset(hit.offsetTicks??(hit.delayMs||0)*gesture.bpm*96/60000),order:gesture.order++}));
  const notes=[...o.authoredState.recordedEvents],period=o.authoredState.periodLoops*384;
  for(const {hit,eventTick,order}of planned){const progress=Math.max(0,Math.min(1,hit.progress)),region=surfaceRegionIndex(o.capabilities.playable.surface,progress),offsetTick=eventTick%period;
   if(!notes.some(n=>n.offsetTick===offsetTick&&n.lane===hit.lane&&surfaceRegionIndex(o.capabilities.playable.surface,n.progress)===region))notes.push({id:createBoardObjectId('pluck-'),offsetTick,lane:hit.lane,progress,gestureId:gesture.id,order});
  }
  recording=true;try{objects.update(id,{recordedEvents:notes.sort((a,b)=>a.offsetTick-b.offsetTick||(a.gestureId===b.gestureId?a.order-b.order:a.lane-b.lane))});}finally{recording=false;}
  const starting=ensureTransportPlayingForSimpleAuthoring(t);if(starting)await starting;
  return planned.map(({hit,eventTick})=>admit(id,hit,eventTick,t,'manual')).filter(Boolean);
 }
 function trigger(event){
  const t=getTriggerTransport(event.transportId)||getTransport(event.receiverId);if(!t)return null;
  const at=event.surfaceTiming?event.eventTick:surfaceAnchor(event.eventTick??t.audioTimeToTick(event.when),{strict:false});
  return admit(event.receiverId,event,at,t,'trigger');
 }
 function tick(){
  for(const o of objects.list()){
   const t=getTransport(o.id);if(!t||t.state!=='playing')continue;
   const now=t.currentTick,to=t.audioTimeToTick(t.tickToAudioTime(now)+.15),from=Math.max(now-6,cursors.get(o.id)??now),duration=o.authoredState.periodLoops*384;
   for(let cycle=Math.floor(from/duration)*duration;cycle<to;cycle+=duration)for(const n of o.authoredState.recordedEvents){const at=cycle+n.offsetTick;if(at>=from&&at<to)admit(o.id,n,at,t,'loopPlayback');}
   cursors.set(o.id,to);
  }
  for(const [key,{event,transport:t}]of feedback){if(t.state==='playing'&&t.currentTick>=event.eventTick){feedback.delete(key);for(const fn of listeners)fn(event);}}
  for(const [key,e]of admitted){const t=getTriggerTransport(e.transportId)||getTransport(e.sourceId);if(!t||t.currentTick>e.eventTick+1536)admitted.delete(key);}
 }
 function transportChanged(id,type,fromState){for(const o of objects.list())if(getTransport(o.id)?.id===id){clear(o.id);const t=getTransport(o.id);cursors.set(o.id,t.currentTick+(type==='play'&&fromState==='paused'?1:0));}if(type==='play'||type==='seek')tick();}
 const off=objects.subscribe(e=>{if(e.type==='restore'){for(const event of admitted.values())cancel(event.sourceId);admitted.clear();feedback.clear();cursors.clear();}else if(e.type==='remove'){clear(e.object.id);release(e.object.id);}else if(e.type==='update'&&!recording){
  // Keep trigger timing/contact authority through receiver edits. Cancel the old
  // lookahead voices once, then resolve their sound from current receiver data.
  const pending=[...admitted.values()].filter(event=>{const t=getTriggerTransport(event.transportId)||getTransport(event.sourceId);return event.sourceId===e.object.id&&event.activationSource==='trigger'&&t?.state==='playing'&&event.eventTick>t.currentTick;});
  clear(e.object.id);for(const event of pending){const t=getTriggerTransport(event.transportId)||getTransport(event.sourceId);admit(e.object.id,event,event.eventTick,t,'trigger');}
 }
});
 return {beginGesture:(id,{elapsedMs=0}={})=>{const t=getTransport(id);return t?{startTick:Math.max(0,t.currentTick-(t.state==='playing'?elapsedMs*t.bpm*96/60000:0)),bpm:t.bpm}:{};},perform,trigger,tick,transportChanged,clearPattern:id=>objects.update(id,{recordedEvents:[]}),subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},phase:id=>{const o=objects.get(id),t=getTransport(id);return {tick:o&&t?t.currentTick%(o.authoredState.periodLoops*384):0,running:t?.state==='playing'};},destroy(){off();for(const o of objects.list())clear(o.id);listeners.clear();}};
}
