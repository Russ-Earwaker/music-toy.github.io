import {createBoardObject,createBoardObjectId} from './board-object.js';
import {SAFE_LINE_MIDI} from './free-play-line.js';
import {projectSegment,worldSegment,surfaceRegions} from './receiver-surface.js';
// Accept the first prototype's six-tick saves; new events use surface-timing's 48/12 policy.
const SAVED_EVENT_GRANULARITY=6;
export const STRING_LANE_GAP=22,STRING_TUNING=Object.freeze([60,64,67,72]);
export const STRING_SCALE=Object.freeze(SAFE_LINE_MIDI.map(n=>n+12));
export function stringSegments(object){return object.capabilities.playable.surface.segments.map(s=>worldSegment(object,s));}
export function createStringSurfaces(){
 const records=new Map(),listeners=new Set(),clone=o=>structuredClone(o),notify=e=>{for(const fn of listeners)fn(e);};
 function build({id,kind,transform,bounds,authoredState={}}){
  if(!['string','strum'].includes(kind)||!id||![transform?.x,transform?.y,transform?.rotation,bounds?.length].every(Number.isFinite)||bounds.length<60||bounds.length>2400)throw Error('Invalid string geometry');
  const {instrument='UKULELE',volume=.7,muted=false,periodLoops=1,mode='note',recordedEvents=[]}=authoredState;
  if(typeof instrument!=='string'||!instrument.trim()||!Number.isFinite(volume)||volume<0||volume>1||typeof muted!=='boolean'||![1,2,3,4].includes(periodLoops)||!['note','chord'].includes(mode)||!Array.isArray(recordedEvents))throw Error('Invalid string settings');
  const lanes=kind==='strum'?4:1,length=bounds.length,segments=Array.from({length:lanes},(_,lane)=>({lane,a:{x:-length/2,y:(lane-(lanes-1)/2)*STRING_LANE_GAP},b:{x:length/2,y:(lane-(lanes-1)/2)*STRING_LANE_GAP}}));
  const regions=surfaceRegions(),voices=segments.map((s,lane)=>regions.map(({index:i})=>kind==='strum'?[STRING_SCALE[i+[0,2,3,5][lane]]]:mode==='chord'?[STRING_SCALE[i],STRING_SCALE[i+2],STRING_SCALE[i+4]]:[STRING_SCALE[i]]));
  const seen=new Set();for(const e of recordedEvents){if(typeof e.id!=='string'||seen.has(e.id)||!Number.isInteger(e.offsetTick)||e.offsetTick<0||e.offsetTick>=periodLoops*384||e.offsetTick%SAVED_EVENT_GRANULARITY||(e.gestureId!=null&&typeof e.gestureId!=='string')||(e.order!=null&&(!Number.isInteger(e.order)||e.order<0))||!Number.isInteger(e.lane)||e.lane<0||e.lane>=lanes||!Number.isFinite(e.progress)||e.progress<0||e.progress>1)throw Error('Invalid recorded pluck');seen.add(e.id);}
  return createBoardObject(kind,{id,transform,bounds:{length,width:length,height:(lanes-1)*STRING_LANE_GAP+32},authoredState:{instrument,volume,muted,periodLoops,mode,recordedEvents:clone(recordedEvents)},capabilities:{draggable:{},playable:{surface:{segments,voices,regions,timing:{anchorTicks:48,offsetTicks:12}}},triggerReceiver:{soundSource:'receiver'},instrumentSource:{instrumentId:instrument},pitchSource:{surface:true},loopSource:{},physicsBody:{shape:'segments',radius:lanes===1?2:(lanes-1)*STRING_LANE_GAP/2+2,segments:[{a:{x:-length/2,y:0},b:{x:length/2,y:0}}]}}});
 }
 const get=id=>records.has(id)?clone(records.get(id)):null,list=()=>[...records.values()].map(clone);
 function create({kind='string',start,end,...settings}){const length=Math.hypot(end.x-start.x,end.y-start.y),id=createBoardObjectId('surface-'),object=build({id,kind,transform:{x:(start.x+end.x)/2,y:(start.y+end.y)/2,rotation:Math.atan2(end.y-start.y,end.x-start.x)},bounds:{length},authoredState:settings});records.set(id,object);notify({type:'add',object:get(id)});return get(id);}
 function update(id,changes){const old=get(id);if(!old)return null;const period=changes.periodLoops??old.authoredState.periodLoops;const next=build({...old,transform:{...old.transform,x:changes.x??old.transform.x,y:changes.y??old.transform.y},authoredState:{...old.authoredState,...changes,recordedEvents:(changes.recordedEvents??old.authoredState.recordedEvents).filter(e=>e.offsetTick<period*384)}});records.set(id,next);notify({type:'update',object:get(id),previous:old});return get(id);}
 function remove(id){const object=get(id);if(!object)return false;records.delete(id);notify({type:'remove',object});return true;}
 function restore(saved=[]){if(!Array.isArray(saved))throw Error('Invalid string surfaces');const next=new Map();for(const raw of saved){if(raw?.version!==1||next.has(raw.id))throw Error('Invalid string save');next.set(raw.id,build(raw));}records.clear();for(const [id,o]of next)records.set(id,o);notify({type:'restore'});}
 return {get,list,create,update,remove,restore,snapshot:list,clear:()=>restore([]),subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}};
}
export const stringSurfaces=createStringSurfaces();
export function stringTap(object,point,radius=14){return stringSegments(object).map(s=>({...projectSegment(point,s.a,s.b),lane:s.lane})).filter(h=>h.distance<=radius).sort((a,b)=>a.distance-b.distance||a.lane-b.lane)[0]||null;}
export function stringCrossings(object,a,b){
 const hits=[],dx=b.x-a.x,dy=b.y-a.y;
 for(const s of stringSegments(object)){const sx=s.b.x-s.a.x,sy=s.b.y-s.a.y,den=dx*sy-dy*sx;if(Math.abs(den)<1e-9)continue;const qx=s.a.x-a.x,qy=s.a.y-a.y,t=(qx*sy-qy*sx)/den,u=(qx*dy-qy*dx)/den;if(t>=0&&t<=1&&u>=0&&u<=1)hits.push({lane:s.lane,progress:u,t});}
 return hits.sort((a,b)=>a.t-b.t||a.lane-b.lane);
}
