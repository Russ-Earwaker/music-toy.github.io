import {makeCube,BALL_RADIUS} from './simple-bouncer-physics.js';
const CUBE_COLOUR='#829cab';
const pitchSurface=record=>{delete record.instrument;record.color=CUBE_COLOUR;return record;};

// Spatial scene objects, deliberately absent from the musical graph and its
// ownership/layout models. Captures reference IDs; they never own these objects.
export function createBoardPhysicalObjects(){
 let serial=1;const records=new Map(),listeners=new Set();
 const emit=event=>{for(const fn of listeners)fn(event);};
 const get=id=>records.has(id)?structuredClone(records.get(id)):null;
 const list=kind=>[...records.values()].filter(o=>!kind||o.kind===kind).map(o=>structuredClone(o));
 function allocate(kind){serial++;let id;do{id=`physical-${kind}:${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${serial}-${Math.random().toString(36).slice(2)}`}`;}while(records.has(id));return id;}
 function cube(x,y,{scatter=false,...options}={}){
  const id=allocate('cube'),defaults=makeCube(serial-1,x,y);
  const record={...defaults,...options,id,sequence:serial-1,kind:'cube',x,y,width:options.width||58,height:options.height||58};
  pitchSurface(record);records.set(id,record);emit({type:'add',object:get(id),scatter});return get(id);
 }
 function ball(x,y,options={}){const id=allocate('ball');records.set(id,{...options,id,sequence:serial-1,kind:'ball',x,y,radius:BALL_RADIUS,motion:{vx:0,vy:0},captureId:null,captureToyId:null});emit({type:'add',object:get(id)});return get(id);}
 function update(id,changes){const old=records.get(id);if(!old)return null;
  if(['x','y','width','height','radius','sourceMidi'].some(k=>k in changes&&!Number.isFinite(changes[k])))throw Error('Invalid physical object geometry or note.');
  if(['width','height','radius'].some(k=>k in changes&&changes[k]<=0))throw Error('Physical object dimensions must be positive.');
  const safe={...changes};delete safe.id;delete safe.kind;
  const next={...old,...structuredClone(safe)};if(next.kind==='cube')pitchSurface(next);
  records.set(id,next);emit({type:'update',object:get(id),previous:structuredClone(old)});return get(id);
 }
 function remove(id){const old=get(id);if(!old)return false;records.delete(id);emit({type:'remove',object:old});return true;}
 function restore(saved=[]){
  if(!Array.isArray(saved))throw Error('Invalid physical objects');const next=new Map();
  for(const o of saved){if(!o||typeof o.id!=='string'||next.has(o.id)||!['cube','ball'].includes(o.kind)||![o.x,o.y].every(Number.isFinite))throw Error('Invalid physical object');
   if(o.kind==='cube'&&(![o.width,o.height,o.sourceMidi].every(Number.isFinite)||o.width<=0||o.height<=0))throw Error('Invalid physical cube');
   if(o.kind==='ball'&&(!Number.isFinite(o.radius)||o.radius<=0))throw Error('Invalid physical ball');next.set(o.id,o.kind==='cube'?pitchSurface(structuredClone(o)):structuredClone(o));
  }
  records.clear();for(const [id,o]of next){records.set(id,o);if(Number.isFinite(o.sequence))serial=Math.max(serial,o.sequence+1);}emit({type:'restore'});
 }
 return {get,list,addCube:cube,addBall:ball,update,remove,restore,snapshot:()=>list(),clear:()=>restore([]),near:(point,radius=650)=>list('cube').filter(o=>Math.hypot(o.x-point.x,o.y-point.y)<=radius),subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}};
}
export const boardPhysicalObjects=createBoardPhysicalObjects();
