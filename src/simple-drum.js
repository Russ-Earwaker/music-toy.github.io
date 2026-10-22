import {normalizeAuthoredState} from './drawgrid/dg-authored-notes.js';
import {createBoardObject,createBoardObjectId} from './board-object.js';
export const DRUM_SIZE=104,DEFAULT_DRUM_INSTRUMENT='DRUM KICK';

export function createDrumObjects(){
 const records=new Map(),listeners=new Set();
 const get=id=>records.has(id)?structuredClone(records.get(id)):null;
 const list=()=>[...records.values()].map(o=>structuredClone(o));
 const notify=event=>{for(const fn of listeners)fn(event);};
 function authored({id,transform,authoredState={}}){
  if(!transform||![transform.x,transform.y].every(Number.isFinite))throw Error('Invalid Drum position');
  const {instrument=DEFAULT_DRUM_INSTRUMENT,volume=1,muted=false,periodLoops=1,label='DRUM'}=authoredState;
  if(!Number.isInteger(periodLoops)||periodLoops<1||periodLoops>4)throw Error('Invalid Drum period');
  const notes=authoredState.pattern?.authoredNotes||[];
  if(!Array.isArray(notes)||notes.some(n=>!Number.isInteger(n.col)||n.col<0||n.col>=32))throw Error('Invalid Drum pattern');
  const unique=[...new Set(notes.map(n=>n.col))].filter(col=>col<periodLoops*8).sort((a,b)=>a-b);
  const pattern=normalizeAuthoredState({version:3,steps:periodLoops*8,instrument,authoredDurationTicks:periodLoops*384,preserveSourceRegister:true,authoredNotes:unique.map(col=>({id:id+':slot:'+col,col,sourceMidi:60})),nodes:{active:Array(periodLoops*8).fill(true)},strokes:[]});
  if(typeof instrument!=='string'||!instrument.trim()||!Number.isFinite(volume)||volume<0||volume>1||typeof muted!=='boolean')throw Error('Invalid Drum sound state');
  return createBoardObject('drum',{id,transform:{x:transform.x,y:transform.y,rotation:0},bounds:{radius:DRUM_SIZE/2},appearance:{variant:'pad'},authoredState:{instrument,volume,muted,pitch:60,periodLoops,pattern,label:String(label)}});
 }
 function create({x=0,y=0,instrument=DEFAULT_DRUM_INSTRUMENT,volume=1,periodLoops=1,label='DRUM'}={}){
  const o=authored({id:createBoardObjectId('drum-'),transform:{x,y},authoredState:{instrument,volume,periodLoops,label}});records.set(o.id,o);notify({type:'add',object:get(o.id)});return get(o.id);
 }
 function update(id,{x,y,instrument,volume,muted,periodLoops,pattern}={}){
  const old=get(id);if(!old)return null;
  const o=authored({id,transform:{x:x??old.transform.x,y:y??old.transform.y},authoredState:{...old.authoredState,instrument:instrument??old.authoredState.instrument,volume:volume??old.authoredState.volume,muted:muted??old.authoredState.muted,periodLoops:periodLoops??old.authoredState.periodLoops,pattern:pattern??old.authoredState.pattern}});
  records.set(id,o);notify({type:'update',object:get(id),previous:old});return get(id);
 }
 function remove(id){const o=get(id);if(!o)return false;records.delete(id);notify({type:'remove',object:o});return true;}
 function restore(saved=[]){
  if(!Array.isArray(saved))throw Error('Invalid Drum objects');
  const next=new Map();for(const o of saved){if(o?.kind!=='drum'||o.version!==1||typeof o.id!=='string'||!o.id||next.has(o.id))throw Error('Invalid Drum object');next.set(o.id,authored(o));}
  records.clear();for(const [id,o]of next)records.set(id,o);notify({type:'restore'});
 }
 return {get,list,create,update,remove,restore,snapshot:list,clear:()=>restore([]),subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}};
}
export const drumObjects=createDrumObjects();
