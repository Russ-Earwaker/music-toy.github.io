import {simulateThrow,trajectoryPoint,clampBars,boardLaunch} from './simple-bouncer-physics.js';
import {normalizeAuthoredState} from './drawgrid/dg-authored-notes.js';
import {getPlaybackInstance,getPlaybackLocalTick} from './playback-instances.js';
import {boardPhysicalObjects} from './board-physical-objects.js';

export function bouncerGridState(capture,id){
 const steps=capture.durationTicks>384?32:8;
 return normalizeAuthoredState({steps,instrument:capture.collisions[0]?.instrument||'KALIMBA',preserveSourceRegister:true,authoredDurationTicks:capture.durationTicks,
  authoredNotes:capture.collisions.map((e,i)=>({id:`${id}:hit:${i}`,col:((e.tick+(capture.phaseOffsetTick||0))%capture.durationTicks)/48,sourceMidi:e.sourceMidi,instrument:e.instrument,cubeId:e.cubeId,collisionTimeSeconds:e.timeSeconds})),
  nodes:{active:Array(steps).fill(true)},strokes:[],meta:{preserveNodesOverStrokes:true}});
}
// Captures own ordinary musical toys, and reference independent physical IDs.
export function createSimpleBouncerController({containers,objects=boardPhysicalObjects,getToy,createGrid,applyGrid,removeGrid,publish,getTransport,onChanged=()=>{},onPlay=()=>{}}){
 const throws=new Map(),pending=new Map();
 const empty=()=>({version:2,bars:1,cubeIds:[],ballId:null,launch:null,capture:null,stale:false,brokenReferences:[]});
 const data=id=>containers.get(id)?.interactionData;
 const panels=id=>(containers.get(id)?.internalToyIds||[]).map(getToy).filter(Boolean);
 const setData=(id,d)=>containers.setPresentation(id,{interactionData:d});
 const create=(options={})=>containers.create({...options,width:options.width||520,height:options.height||360,presentationType:'simple-bouncer',interactionData:empty()});
 function recording(id){
  if(pending.has(id))return true;const session=throws.get(id);if(!session)return false;
  const transport=getTransport(id),tick=transport?.currentTick;
  if(!transport||tick<session.createdTick||tick-session.start>=session.duration){throws.delete(id);return false;}return true;
 }
 const busy=()=>[...new Set([...throws.keys(),...pending.keys()])].some(recording);
 function setBars(id,bars){if(recording(id))return false;const d=data(id),next=clampBars(bars);if(d.bars===next)return true;d.bars=next;d.stale=!!d.capture;setData(id,d);return true;}
 function clear(id){
  pending.delete(id);throws.delete(id);const previous=data(id),ball=objects.get(previous?.ballId);
  if(ball?.captureId===id)objects.update(ball.id,{captureId:null,captureToyId:null,motion:{vx:0,vy:0}});
  const result=containers.clear(id,{interactionData:{...empty(),bars:previous?.bars||1,ballId:previous?.ballId||null,launch:previous?.launch||null}});onChanged();return result;
 }
 async function throwBall(id,{ballId=data(id)?.ballId,launch=data(id)?.launch}={}){
  if(busy())return false;
  const d=data(id);if(!d||!objects.get(ballId)||!launch)return false;
  if(![launch.x,launch.y,launch.vx,launch.vy].every(Number.isFinite))throw Error('Invalid throw');
  const token={};pending.set(id,token);
  const transport=getTransport(id),capture=simulateThrow({cubes:objects.list('cube'),launch,bars:d.bars,bpm:transport?.bpm||120});
  // Rotate authored columns onto the shared clock rather than resetting source
  // phase. A running transport gets one slot of preparation time before launch.
  const createdTick=transport?.currentTick||0,startTick=Math.ceil(createdTick/48)*48+(transport?.state==='playing'?48:0);
  capture.phaseOffsetTick=startTick%capture.durationTicks;
  const state=bouncerGridState(capture,id);let panel=panels(id)[0],created=false;
  try{
   if(panel)await applyGrid(panel,state);
   else{const c=containers.get(id);panel=await createGrid(state,{x:c.bounds.x,y:c.bounds.y+220});created=true;}
   if(pending.get(id)!==token||!containers.get(id)){if(created)removeGrid(panel);return false;}
   Object.assign(d,{version:2,ballId,launch:structuredClone(launch),cubeIds:[...new Set(capture.collisions.map(e=>e.cubeId))],capture:{durationTicks:capture.durationTicks,phaseOffsetTick:capture.phaseOffsetTick,bpm:capture.bpm,trajectory:capture.trajectory},stale:false,brokenReferences:[]});
   if(created){const result=containers.attach(id,[panel.id],{interactionData:d});if(!result.ok)throw Error(result.reason);}else setData(id,d);
   objects.update(ballId,{x:launch.x,y:launch.y,motion:{vx:launch.vx,vy:launch.vy},captureId:id,captureToyId:panel.id});
   panel.classList?.remove('container-pending');publish(panel,'simple-bouncer-capture');onChanged();
   if(transport){await transport.play();throws.set(id,{createdTick,start:startTick,duration:capture.durationTicks});onPlay();}
   return true;
  }catch(error){if(created&&panel&&!containers.owner(panel.id))removeGrid(panel);throw error;}
  finally{if(pending.get(id)===token)pending.delete(id);}
 }
 function view(id){
  const d=data(id),p=panels(id)[0],transport=getTransport(id),instance=p&&getPlaybackInstance(p.id);
  const active=instance?.active&&transport&&transport.currentTick>=instance.startTick&&transport.currentTick<(instance.endTick??Infinity);
  const sourceTick=active?getPlaybackLocalTick(instance,transport.currentTick):transport&&transport.state!=='playing'&&d?.capture?transport.currentTick:null;
  const session=throws.get(id),beforeLaunch=session&&transport&&transport.currentTick<session.start;
  const tick=sourceTick===null?null:beforeLaunch?0:((sourceTick-(d?.capture?.phaseOffsetTick||0))%d.capture.durationTicks+d.capture.durationTicks)%d.capture.durationTicks;
  return {data:d,recording:recording(id),tick,ball:d?.capture&&tick!==null?trajectoryPoint(d.capture.trajectory,tick):null};
 }
 function ballView(ball){
  const d=data(ball.captureId);if(!d?.capture)return {position:{x:ball.x,y:ball.y},trail:[]};
  const v=view(ball.captureId),tick=v.tick;
  return {position:v.ball||{x:ball.x,y:ball.y},trail:tick===null?[]:d.capture.trajectory.filter(p=>p.tick<=tick&&p.tick>tick-72)};
 }
 const unsubscribe=objects.subscribe(event=>{
  if(event.type==='restore'||event.type==='add')return;
  for(const c of containers.list().filter(c=>c.presentation.type==='simple-bouncer')){
   const d=c.interactionData;if(!d?.capture)continue;
   const cubeChange=event.object.kind==='cube'&&d.cubeIds?.includes(event.object.id),ballDeleted=event.object.kind==='ball'&&event.type==='remove'&&d.ballId===event.object.id;
   if(!cubeChange&&!ballDeleted)continue;
   if(event.type==='update'&&['x','y','width','height','sourceMidi','instrument'].every(k=>event.object[k]===event.previous[k]))continue;
   d.stale=true;d.brokenReferences=[...(d.cubeIds||[]),d.ballId].filter(id=>id&&!objects.get(id));setData(c.id,d);
  }
 });
 function migrateLegacy(){
  for(const c of containers.list().filter(c=>c.presentation.type==='simple-bouncer'&&c.interactionData?.version!==2)){
   const old=c.interactionData,dx=c.bounds.x+16,dy=c.bounds.y+126,ids=new Map();
   for(const cube of old.cubes||[]){const next=objects.addCube(cube.x+dx,cube.y+dy,{sourceMidi:cube.sourceMidi,instrument:cube.instrument});ids.set(cube.id,next.id);}
   const capture=structuredClone(old.capture);if(capture)for(const p of capture.trajectory){p.x+=dx;p.y+=dy;}
   const first=capture?.trajectory[0]||{x:dx+40,y:dy+100},ball=objects.addBall(first.x,first.y),ps=panels(c.id);
   for(const p of ps){for(const n of p.__dgAuthoredNotes||[])if(ids.has(n.cubeId))n.cubeId=ids.get(n.cubeId);publish(p,'simple-bouncer-board-migration');}
   const notes=ps.flatMap(p=>p.__dgAuthoredNotes||[]),d={...empty(),bars:old.bars||1,cubeIds:[...new Set(notes.map(n=>n.cubeId).filter(Boolean))],ballId:ball.id,launch:boardLaunch(first,{x:first.x+100,y:first.y}),capture,stale:!!old.stale};
   setData(c.id,d);objects.update(ball.id,{captureId:c.id,captureToyId:ps[0]?.id||null});containers.resize(c.id,520,360);
  }
 }
 return {create,data,panels,objects,recording,busy,setBars,clear,throwBall,view,ballView,migrateLegacy,resetSessions:()=>{pending.clear();throws.clear();},dispose:id=>{pending.delete(id);throws.delete(id);},destroy:unsubscribe};
}
