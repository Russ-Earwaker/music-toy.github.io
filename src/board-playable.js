import {resolvePlayableActivation} from './board-object.js';

// No toy-kind checks, beat mapping, quantization or debounce.
export function createBoardPlayableController({objects,getTime,perform,release=()=>{}}){
 const liveIds=new Set(objects.list().map(o=>o.id));
 const unsubscribe=objects.subscribe(event=>{
  if(event.type==='remove'){release(event.object.id);liveIds.delete(event.object.id);}
  if(event.type==='add')liveIds.add(event.object.id);
  if(event.type==='restore'){
   for(const id of liveIds)release(id);liveIds.clear();for(const o of objects.list())liveIds.add(o.id);
  }
 });
 function activate(id){const event=resolvePlayableActivation(objects.get(id),getTime());if(event)perform(event);return event;}
 return {activate,destroy(){unsubscribe();for(const id of liveIds)release(id);liveIds.clear();}};
}
