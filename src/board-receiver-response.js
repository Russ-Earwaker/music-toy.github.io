// Receiver feedback is expressed in the same canonical tick domain as sound.
export function receiverTriggerResponse({tick,intendedTick,eventTick}){
 return {pending:tick>=intendedTick&&tick<eventTick,flash:tick>=eventTick?Math.max(0,1-(tick-eventTick)/40):0};
}
export function createReceiverResponses(){
 const events=new Map();
 return {
  enqueue(event,transport){events.set(`${event.emitterId}:${event.cycleStart}:${event.receiverId}`,{event,transport});},
  clear(source){for(const [key,{event}]of events)if(event.emitterId===source)events.delete(key);},
  responses(){const result=new Map();for(const [key,{event:e,transport:t}]of events){
   const tick=t.currentTick;if(tick>e.eventTick+40){events.delete(key);continue;}
   const r=receiverTriggerResponse({tick,intendedTick:e.intendedTick,eventTick:e.eventTick}),old=result.get(e.receiverId);
   result.set(e.receiverId,{pending:r.pending||old?.pending||false,flash:Math.max(r.flash,old?.flash||0)});
  }return result;},
 };
}
