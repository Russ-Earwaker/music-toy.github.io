import {resolveBoardInteraction} from './board-object.js';
import {projectSegment,worldSegment} from './receiver-surface.js';

export function waveReceiverContacts(origin,receiver){
 const segments=receiver.capabilities?.playable?.surface?.segments;
 if(!segments)return [{distance:waveReceiverDistance(origin,receiver),contact:{}}];
 return segments.map(s=>{const line=worldSegment(receiver,s),p=projectSegment(origin,line.a,line.b);return {distance:Math.max(0,p.distance-2),contact:{lane:s.lane,progress:p.progress,position:p.position}};});
}

// Logical distance to the nearest point on a receiver's authored bounds.
// This geometry is independent of toy kind, viewport scale, DPR and RAF cadence.
export function waveReceiverDistance(origin,receiver){
 if(receiver.capabilities?.playable?.surface?.segments)return Math.min(...waveReceiverContacts(origin,receiver).map(h=>h.distance));
 const t=receiver.transform,b=receiver.bounds||{};
 const dx=origin.x-t.x,dy=origin.y-t.y,angle=-(t.rotation||0);
 const x=dx*Math.cos(angle)-dy*Math.sin(angle),y=dx*Math.sin(angle)+dy*Math.cos(angle);
 if(Number.isFinite(b.radius))return Math.max(0,Math.hypot(x,y)-b.radius);
 return Math.hypot(Math.max(0,Math.abs(x)-(b.width||0)/2),Math.max(0,Math.abs(y)-(b.height||0)/2));
}

export function crossedWaveReceivers(wave,receivers,previousRadius,currentRadius){
 const events=[];
 for(const receiver of receivers){
  if(!receiver.capabilities?.triggerReceiver)continue;
  for(const {distance,contact}of waveReceiverContacts(wave.origin,receiver)){
  const key=contact.lane==null?receiver.id:receiver.id+':'+contact.lane;if(wave.triggeredReceiverIds.has(key))continue;
  if(!(previousRadius<distance&&currentRadius>=distance))continue;
  wave.triggeredReceiverIds.add(key);
  const event=resolveBoardInteraction(wave.emitter,receiver,distance/wave.speed,contact);
  if(event)events.push({...event,waveId:wave.id,distance});
  }
 }
 return events.sort((a,b)=>a.timeSeconds-b.timeSeconds||a.receiverId.localeCompare(b.receiverId));
}

// Manual events use the same 96 PPQ tick domain as captured/sequence events.
// Preserve exact arrival (fractional ticks), rather than moving sound off the ring.
export function boardInteractionPerformance(events,{audioTime,currentTick,bpm,ticksPerBeat=96}){
 const secondsPerTick=60/(bpm*ticksPerBeat);
 return events.map(event=>({...event,eventTick:currentTick+event.timeSeconds/secondsPerTick,when:audioTime+event.timeSeconds}));
}
