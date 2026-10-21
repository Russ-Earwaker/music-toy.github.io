import {createBoardObject,createBoardObjectId} from './board-object.js';
import {crossedWaveReceivers,boardInteractionPerformance} from './board-wave.js';

export const RIPPLE_SPEED=360,RIPPLE_RANGE=720,RIPPLE_SIZE=76;
export function createRippleObjects(){
 const records=new Map(),listeners=new Set();
 const notify=event=>{for(const fn of listeners)fn(event);};
 const get=id=>records.has(id)?structuredClone(records.get(id)):null;
 function authored({id,transform,authoredState}={}){
  if(!transform||![transform.x,transform.y].every(Number.isFinite))throw Error('Invalid Ripple position');
  const instrument=authoredState?.instrument??'PIANO';
  if(typeof instrument!=='string'||!instrument.trim())throw Error('Invalid Ripple instrument');
  const periodLoops=authoredState?.periodLoops??1;
  if(!Number.isInteger(periodLoops)||periodLoops<1||periodLoops>4)throw Error('Invalid Ripple period');
  const volume=authoredState?.volume??1,muted=authoredState?.muted??false;
  if(!Number.isFinite(volume)||volume<0||volume>1||typeof muted!=='boolean')throw Error('Invalid Ripple volume');
  return createBoardObject('ripple',{id,transform:{x:transform.x,y:transform.y,rotation:0},bounds:{radius:RIPPLE_SIZE/2},authoredState:{instrument,volume,muted,periodLoops,maxRadius:RIPPLE_RANGE}});
 }
 function create({x=0,y=0,instrument='PIANO',periodLoops=1}={}){const o=authored({id:createBoardObjectId('ripple-'),transform:{x,y},authoredState:{instrument,periodLoops}});records.set(o.id,o);notify({type:'add',object:get(o.id)});return get(o.id);}
 function update(id,{x,y,instrument,volume,muted,periodLoops}={}){const old=get(id);if(!old)return null;const o=authored({id,transform:{x:x??old.transform.x,y:y??old.transform.y},authoredState:{...old.authoredState,instrument:instrument??old.authoredState.instrument,volume:volume??old.authoredState.volume,muted:muted??old.authoredState.muted,periodLoops:periodLoops??old.authoredState.periodLoops}});records.set(id,o);notify({type:'update',object:get(id)});return get(id);}
 function remove(id){const o=get(id);if(!o)return false;records.delete(id);notify({type:'remove',object:o});return true;}
 const snapshot=()=>[...records.values()].map(o=>structuredClone(o));
 function restore(saved=[]){
  if(!Array.isArray(saved))throw Error('Invalid Ripple objects');
  const next=new Map();for(const raw of saved){if(raw?.version!==1||raw.kind!=='ripple'||typeof raw.id!=='string'||!raw.id||next.has(raw.id))throw Error('Invalid Ripple object');next.set(raw.id,authored(raw));}
  records.clear();for(const [id,o]of next)records.set(id,o);notify({type:'restore'});
 }
 return {get,list:snapshot,snapshot,create,update,remove,restore,clear:()=>restore([]),subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}};
}
export const rippleObjects=createRippleObjects();

// One manual emission, no looping pattern and no RAF-driven musical scheduler.
// Receiver geometry/pitch and emitter timbre latch at emission, like a throw.
export function createSimpleRippleController({objects=rippleObjects,getReceivers,getClock,schedule,cancel=()=>{}}){
 const waves=new Map();let serial=0;
 function emit(id){
  const emitter=objects.get(id);if(!emitter)return null;
  const clock=getClock(),wave={id:`${id}:wave:${++serial}`,emitterId:id,emitter,origin:{...emitter.transform},speed:RIPPLE_SPEED,maxRadius:RIPPLE_RANGE,startedAt:clock.audioTime,triggeredReceiverIds:new Set()};
  const events=boardInteractionPerformance(crossedWaveReceivers(wave,getReceivers(),-Number.EPSILON,RIPPLE_RANGE),clock);
  for(const event of events)schedule(event);
  waves.set(wave.id,wave);return {id:wave.id,events};
 }
 function reset(){for(const o of objects.list())cancel(o.id);waves.clear();}
 const unsubscribe=objects.subscribe(event=>{
  if(event.type==='restore'){for(const wave of waves.values())cancel(wave.emitterId);reset();}
  if(event.type==='remove'){cancel(event.object.id);for(const [id,w]of waves)if(w.emitterId===event.object.id)waves.delete(id);}
 });
 function visibleWaves(now=getClock().audioTime){
  const visible=[];for(const [id,w]of waves){const radius=Math.max(0,(now-w.startedAt)*w.speed);if(radius>w.maxRadius){waves.delete(id);continue;}visible.push({id,emitterId:w.emitterId,origin:{...w.origin},radius,maxRadius:w.maxRadius});}return visible;
 }
 return {emit,visibleWaves,reset,destroy(){reset();unsubscribe();}};
}
