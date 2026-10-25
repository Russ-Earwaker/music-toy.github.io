import {lineDrawGridStates,drawGridLineSource} from './free-play-drawgrid.js';
import {updateSilence} from './free-play-silence.js';
import {getPlaybackInstance,getPlaybackLocalTick} from './playback-instances.js';
import {clamp01} from './free-play-line.js';
import {ensureTransportPlayingForSimpleAuthoring} from './simple-authoring-playback.js';

// Each Container owns only drawing history. All playable notes/rests are read
// and edited on the same ordinary DrawGrid instances used by the board.
export function createSimpleDrawController({containers,model,getToy,createGrid,removeGrid,publish,cancelScheduled,getTransport,onChanged=()=>{},onPlay=()=>{},readAudioSettings=p=>({volume:Number(p.dataset.toyVolume??.65),muted:p.dataset.toyMuted==='1'}),applyAudioSettings=(p,s)=>Object.assign(p.dataset,{toyVolume:String(s.volume),toyMuted:s.muted?'1':'0'})}){
 const pending=new Map(),listeners=new Map();let serial=0;
 const empty=()=>({gesture:null,straightened:false,paint:[],surfacePaint:[],randomCutIds:[]});
 const panels=id=>(containers.get(id)?.internalToyIds||[]).map(getToy).filter(Boolean);
 const data=id=>containers.get(id)?.interactionData||empty();
 function setData(id,next){const c=containers.get(id);if(c)containers.setPresentation(id,{interactionData:{...data(id),...next}});}
 function clear(id){
  pending.delete(id);const first=panels(id)[0];
  if(first)containers.setPresentation(id,{state:{audioSettings:readAudioSettings(first)}});
  const result=containers.clear(id,{interactionData:empty()});
  if(result.ok){containers.resize(id,280,140);containers.setPresentation(id,{state:{open:false}});}
  onChanged();return result;
 }
 async function drawPrepared(id,{source,bounds,contentSpace}){
  const c=containers.get(id);if(!c)throw new Error('Simple Draw was deleted.');
  if(pending.has(id)||c.internalObjectIds.length||data(id).gesture){const error=new Error('Clear this Simple Draw before drawing a new line.');error.code='DRAWING_EXISTS';throw error;}
  containers.move(id,bounds.x,bounds.y);containers.resize(id,bounds.width,bounds.height);setData(id,{contentSpace});
  return draw(id,source);
 }
 function create(options={}){const c=containers.create({...options,presentationType:'simple-draw',interactionData:empty(),width:options.width||280,height:options.height||140});onChanged();return c;}
 async function draw(id,source){
  const token={},c=containers.get(id);if(!c)throw new Error('Simple Draw was deleted.');
  // Only explicit Clear permits another stroke, including while grids initialize.
  if(pending.has(id)||c.internalObjectIds.length||data(id).gesture){const error=new Error('Clear this Simple Draw before drawing a new line.');error.code='DRAWING_EXISTS';throw error;}
  pending.set(id,token);
  const strokeId=`simple-draw:${id}:${++serial}:${Date.now()}`,states=lineDrawGridStates(source,strokeId),initialPaint=structuredClone(states[0]?.freePlay.paint||[]),created=[];
  try{
   for(let i=0;i<states.length;i++){
    const st=states[i];st.freePlay={strokeId,bar:i,startTick:st.freePlay.startTick,durationTicks:st.freePlay.durationTicks,phraseDurationTicks:source.durationTicks,containerManaged:true};
    const p=await createGrid(st,{x:c.bounds.x+i*900,y:c.bounds.y+220});created.push(p);
    if(c.presentation.state.audioSettings)applyAudioSettings(p,c.presentation.state.audioSettings);
    if(pending.get(id)!==token||!containers.get(id)){const error=new Error('Drawing creation cancelled.');error.code='DRAWING_CANCELLED';throw error;}
   }
   const interactionData={...empty(),contentSpace:data(id).contentSpace,gesture:{path:structuredClone(source.path)},paint:initialPaint};
   model.transaction(()=>{
    for(let i=1;i<created.length;i++){const result=model.connect('sequence',{objectId:created[i-1].id,portId:'output'},{objectId:created[i].id,portId:'input'});if(!result.ok)throw new Error(result.reason);}
    const result=containers.attach(id,created.map(p=>p.id),{interactionData});if(!result.ok)throw new Error(result.reason);
   });
   pending.delete(id);created.forEach(p=>{p.classList?.remove('container-pending');publish(p,'simple-draw-created');});onChanged();
   const transport=getTransport(id);if(transport){await ensureTransportPlayingForSimpleAuthoring(transport);onPlay();}
   return {id};
  }catch(error){for(const p of created)if(!containers.owner(p.id))removeGrid(p);if(pending.get(id)===token)pending.delete(id);throw error;}
 }
 function line(id){
  const c=containers.get(id),d=data(id),ps=panels(id);if(!d.gesture||!ps.length)return null;
  const source=drawGridLineSource(ps,{...d.gesture,paint:d.paint});if(!source)return null;
  const transport=getTransport(id);
  // Parent Structure turns gate the display. Their musical origin is shared by
  // the canonical internal instances; context never comes from this surface.
  const active=transport?.state==='playing'?ps.map((p,i)=>({i,instance:getPlaybackInstance(p.id)})).find(({instance})=>instance?.active&&transport.currentTick>=instance.startTick&&transport.currentTick<(instance.endTick??Infinity)):null;
  const phase=active?clamp01((active.i*384+getPlaybackLocalTick(active.instance,transport.currentTick))/source.durationTicks):null;
  return {id,source,straightened:!!d.straightened,randomCutIds:d.randomCutIds||[],panelIds:ps.map(p=>p.id),phase};
 }
 function setSilence(id,changes){
  const {paint,randomCutIds,randomSeed}=changes,next={};if(paint)next.paint=paint;if(randomCutIds)next.randomCutIds=randomCutIds;if(randomSeed!=null)next.randomSeed=randomSeed;
  for(const p of panels(id)){if(updateSilence(p.__dgAuthoredNotes||[],changes)){cancelScheduled(p,getTransport(id)?.currentTick||0);publish(p,'simple-draw-silence');}}
  if(Object.keys(next).length)setData(id,next);else onChanged();
 }
 function onNote(id,listener){if(!listeners.has(id))listeners.set(id,new Set());listeners.get(id).add(listener);return ()=>listeners.get(id)?.delete(listener);}
 function notify(panel,event){const id=containers.owner(panel?.id);if(id){const nodeIndex=Number.isInteger(event.nodeIndex)?event.nodeIndex:panels(id).findIndex(p=>p.id===panel.id)*8+event.col;for(const listener of listeners.get(id)||[])listener(id,{...event,nodeIndex});}}
 function migrateLegacy(){
  const groups=new Map();for(const id of model.getObjectIds()){const p=getToy(id),meta=p?.__freePlayDrawGrid;if(!meta||meta.containerManaged)continue;const owner=containers.owner(id);if(owner&&containers.get(owner).presentation.type!=='collapsed-graph')continue;if(!groups.has(meta.strokeId))groups.set(meta.strokeId,[]);groups.get(meta.strokeId).push(p);}
  const results=[];for(const ps of groups.values()){
   ps.sort((a,b)=>a.__freePlayDrawGrid.bar-b.__freePlayDrawGrid.bar);const first=ps[0].__freePlayDrawGrid;if(!first.path)continue;
   const options={presentationType:'simple-draw',interactionData:{...empty(),gesture:{path:structuredClone(first.path)},straightened:!!first.straightened,paint:structuredClone(first.paint||[]),randomCutIds:first.randomCutIds||[],randomSeed:first.randomSeed}},owner=containers.owner(ps[0].id),existing=containers.get(owner);
   if(existing&&(existing.internalObjectIds.length!==ps.length||ps.some(p=>containers.owner(p.id)!==owner)))continue;
   const result=existing?{ok:true,container:containers.setPresentation(owner,{type:'simple-draw',interactionData:options.interactionData})}:containers.collapse(ps.map(p=>p.id),options);
   if(!result.ok){results.push(result);continue;}
   containers.resize(result.container.id,1100,760);
   for(const p of ps){const {path,visualEvents,paint,straightened,randomCutIds,randomSeed,...meta}=p.__freePlayDrawGrid;p.__freePlayDrawGrid={...meta,containerManaged:true};publish(p,'simple-draw-migration');}
   results.push(result);
  }return results;
 }
 return {create,draw,drawPrepared,clear,line,panels,setSilence,setData,data,onNote,notify,migrateLegacy,isPending:id=>pending.has(id),
  setStraightened:(id,value)=>setData(id,{straightened:!!value}),
  paintStore:id=>({get:()=>data(id).surfacePaint||[],set:value=>setData(id,{surfacePaint:structuredClone(value)})}),
  dispose:id=>{pending.delete(id);listeners.delete(id);},
 };
}
