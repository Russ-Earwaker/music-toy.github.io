import { onPlaybackOccurrenceInvalidated, getPlaybackInstance } from './playback-instances.js';
import { transportRegistry } from './transport-registry.js';

// One queue for admitted audio events. A frame may service this queue, but only
// the owning transport decides whether an event is due. No visible-instance gate:
// simultaneous occurrences and late frames must retain their own note events.
export function createPlaybackVisualQueue({getTransport=id=>transportRegistry.get(id)} = {}) {
  const pending=new Map();
  const stop=onPlaybackOccurrenceInvalidated(id=>{
    for(const [key,e] of pending)if(e.occurrence?.occurrenceId===id){
      // Cancelling an old turn stops future voices, not notes already heard.
      // Preserve those visual occurrences even after a long blocked frame.
      if((getTransport(e.transportId)?.currentTick??-1)<e.dueTick)pending.delete(key);
    }
  });
  return {
    enqueue(event) {
      const key=JSON.stringify([event.toyId,event.occurrence?.identity,event.eventTick,event.eventKey]);
      if(!pending.has(key))pending.set(key,event);
    },
    clearToy(toyId) {for(const [key,event] of pending)if(event.toyId===toyId)pending.delete(key);},
    clear(transportId) {for(const [key,e] of pending)if(e.transportId===transportId)pending.delete(key);},
    flush(getTransport,emit) {
      for(const [key,event] of pending){
        const t=getTransport(event.transportId);
        if(!t){pending.delete(key);continue;}
        if(t.state!=='playing'||t.currentTick<event.dueTick)continue;
        pending.delete(key);emit(event);
      }
    },
    dispose(){stop();pending.clear();},
  };
}
export const playbackVisualEvents=createPlaybackVisualQueue();
export function admittedToyVisual(panel,event,admission,toTick) {
  const occurrence=admission.occurrence;
  const transportId=occurrence?.transportId||getPlaybackInstance(panel.id)?.transportId;
  const dueTick=transportRegistry.get(transportId)?.audioTimeToTick(admission.when)??toTick(admission.when);
  playbackVisualEvents.enqueue({...event,toyId:occurrence?.instanceToyId||occurrence?.toyId||panel.id,
    transportId,eventTick:occurrence?.eventTick??dueTick,
    eventKey:occurrence?.eventKey??event.eventId??`block:${event.blockIndex}:${admission.when}`,occurrence,when:admission.when,note:admission.note,dueTick});
}
