import {simulateThrow,trajectoryPoint,clampBars,boardLaunch} from './simple-bouncer-physics.js';
import {normalizeAuthoredState,restoreAuthoredNotes,drawgridPatternFromState} from './drawgrid/dg-authored-notes.js';
import {getPlaybackInstance,getPlaybackLocalTick,getPlaybackOccurrence} from './playback-instances.js';
import {boardPhysicalObjects} from './board-physical-objects.js';
import {patternOriginTick} from './source-phase.js';

export function bouncerGridState(capture,id){
 const steps=capture.durationTicks>384?32:8;
 return normalizeAuthoredState({steps,instrument:capture.collisions[0]?.instrument||'KALIMBA',preserveSourceRegister:true,authoredDurationTicks:capture.durationTicks,
  authoredNotes:capture.collisions.map((e,i)=>({id:`${id}:hit:${i}`,col:((e.tick+(capture.phaseOffsetTick||0))%capture.durationTicks)/48,sourceMidi:e.sourceMidi,instrument:e.instrument,cubeId:e.cubeId,collisionTimeSeconds:e.timeSeconds})),
  nodes:{active:Array(steps).fill(true)},strokes:[],meta:{preserveNodesOverStrokes:true}});
}
// Captures own ordinary musical toys, and reference independent physical IDs.
export function createSimpleBouncerController({containers,objects=boardPhysicalObjects,getToy,createGrid,applyGrid,removeGrid,publish,getTransport,cancelScheduled=()=>{},onChanged=()=>{},onPlay=()=>{}}){
 const throws=new Map(),pending=new Map();
 const empty=()=>({version:2,bars:1,cubeIds:[],ballId:null,launch:null,startPosition:null,targetPosition:null,capture:null,stale:false,brokenReferences:[]});
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
  const result=containers.clear(id,{interactionData:{...empty(),bars:previous?.bars||1,ballId:previous?.ballId||null,launch:previous?.launch||null,startPosition:previous?.startPosition||null,targetPosition:previous?.targetPosition||null}});onChanged();return result;
 }
 async function throwBall(id,{ballId=null,launch=null,targetPosition=null}={}){
  if(busy())return false;
  const d=data(id);if(!d)return false;
  ballId??=d.ballId;
  if(!launch){targetPosition??=d.targetPosition;launch=d.startPosition&&d.targetPosition?boardLaunch(d.startPosition,d.targetPosition):d.launch;}
  if(!objects.get(ballId)||!launch)return false;
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
   flights.delete(id);previews.delete(id);
   Object.assign(d,{version:2,ballId,launch:structuredClone(launch),startPosition:{x:launch.x,y:launch.y},targetPosition:targetPosition||{x:launch.x+launch.vx,y:launch.y+launch.vy},cubeIds:[...new Set(capture.collisions.map(e=>e.cubeId))],capture:{durationTicks:capture.durationTicks,phaseOffsetTick:capture.phaseOffsetTick,bpm:capture.bpm,trajectory:capture.trajectory},stale:false,brokenReferences:[]});
   if(created){const result=containers.attach(id,[panel.id],{interactionData:d});if(!result.ok)throw Error(result.reason);}else setData(id,d);
   objects.update(ballId,{x:launch.x,y:launch.y,motion:{vx:launch.vx,vy:launch.vy},captureId:id,captureToyId:panel.id});
   panel.classList?.remove('container-pending');publish(panel,'simple-bouncer-capture');onChanged();
   if(transport){await transport.play();throws.set(id,{createdTick,start:startTick,duration:capture.durationTicks});onPlay();}
   return true;
  }catch(error){if(created&&panel&&!containers.owner(panel.id))removeGrid(panel);throw error;}
  finally{if(pending.get(id)===token)pending.delete(id);}
 }
 // Audio lookahead and visuals share immutable snapshots for each flight.
 // Publish the active flight as ordinary authored music at its loop boundary.
 const previews=new Map(),flights=new Map(),hooks=new Map();
 function geometryKey(d,launch,cubes){return JSON.stringify([launch,d.capture.durationTicks,d.capture.bpm,cubes.map(c=>[c.id,c.x,c.y,c.width,c.height,c.size,c.sourceMidi,c.instrument])]);}
 function flightAt(id,d,cycle){
  let cycles=flights.get(id);if(!cycles){cycles=new Map();flights.set(id,cycles);}
  if(cycles.has(cycle))return cycles.get(cycle);
  const cubes=objects.list('cube'),launch=d.stale&&d.startPosition&&d.targetPosition?boardLaunch(d.startPosition,d.targetPosition):d.launch;
  const key=geometryKey(d,launch,cubes),phase=d.capture.phaseOffsetTick||0;
  const capture=d.stale?{...simulateThrow({launch,cubes,bars:d.capture.durationTicks/384,bpm:d.capture.bpm}),phaseOffsetTick:phase}:{...d.capture,collisions:(panels(id)[0]?.__dgAuthoredNotes||[]).map(n=>({tick:((n.col*48-phase)%d.capture.durationTicks+d.capture.durationTicks)%d.capture.durationTicks,timeSeconds:n.collisionTimeSeconds,cubeId:n.cubeId,sourceMidi:n.sourceMidi,instrument:n.instrument}))};
  const state=bouncerGridState(capture,id),flight={cycle,key,launch,capture,state,pattern:drawgridPatternFromState(state),changed:d.stale,committed:false};cycles.set(cycle,flight);
  for(const tick of cycles.keys())if(tick<cycle-d.capture.durationTicks*2)cycles.delete(tick);
  return flight;
 }
 function commitFlight(id,d,flight){
  if(!flight.changed||flight.committed)return;flight.committed=true;
  const panel=panels(id)[0];if(!panel)return;
  if(panel.__drawToy?.setAuthoredState)panel.__drawToy.setAuthoredState(flight.state);else restoreAuthoredNotes(panel,flight.state);panel.__seqPattern=flight.pattern;panel.dataset.instrument=flight.state.instrument;
  d.capture={durationTicks:flight.capture.durationTicks,phaseOffsetTick:flight.capture.phaseOffsetTick,bpm:flight.capture.bpm,trajectory:flight.capture.trajectory};
  d.cubeIds=[...new Set(flight.capture.collisions.map(e=>e.cubeId))];
  const authored=d.startPosition&&d.targetPosition?boardLaunch(d.startPosition,d.targetPosition):d.launch;
  d.stale=geometryKey(d,authored,objects.list('cube'))!==flight.key;d.brokenReferences=[];
  setData(id,d);publish(panel,'simple-bouncer-flight');onChanged();
 }
 function syncHooks(){
  const owned=new Set();
  for(const c of containers.list().filter(c=>c.presentation.type==='simple-bouncer'))for(const panel of panels(c.id)){
   owned.add(panel.id);if(hooks.has(panel.id)||typeof panel.__sequencerSchedule!=='function')continue;
   const original=panel.__sequencerPatternAtTick;
   const provider=(eventTick,metadata)=>{
    const d=data(c.id);if(!d?.capture||!Number.isFinite(eventTick))return original?.(eventTick,metadata);
    const instance=getPlaybackOccurrence(metadata?.occurrenceId)||getPlaybackInstance(panel.id),origin=patternOriginTick(instance||{})+(d.capture.phaseOffsetTick||0),cycle=origin+Math.floor((eventTick-origin)/d.capture.durationTicks)*d.capture.durationTicks;
    return flightAt(c.id,d,cycle).pattern;
   };
   panel.__sequencerPatternAtTick=provider;panel.__simpleBouncerLive=true;hooks.set(panel.id,{panel,original,provider});
  }
  for(const [id,h]of hooks)if(!owned.has(id)){if(h.panel.__sequencerPatternAtTick===h.provider)h.panel.__sequencerPatternAtTick=h.original;delete h.panel.__simpleBouncerLive;hooks.delete(id);}
 }
 const unsubscribeHooks=containers.subscribe(syncHooks);
 function previewPath(id,d,{playing=false,cycle=0}={}){
  if(!d?.capture)return null;
  if(playing){const flight=flightAt(id,d,cycle);if(cycle!==null)commitFlight(id,d,flight);return flight.capture.trajectory;}
  if(!d.stale||!d.startPosition||!d.targetPosition)return d.capture.trajectory;
  const launch=boardLaunch(d.startPosition,d.targetPosition),cubes=objects.list('cube'),key=geometryKey(d,launch,cubes);
  let preview=previews.get(id);
  if(preview?.key!==key){preview={key,trajectory:simulateThrow({launch,cubes,bars:d.capture.durationTicks/384,bpm:d.capture.bpm}).trajectory};previews.set(id,preview);}
  return preview.trajectory;
 }
 function view(id){
  syncHooks();
  const d=data(id),p=panels(id)[0],transport=getTransport(id),instance=p&&getPlaybackInstance(p.id);
  const active=instance?.active&&transport&&transport.currentTick>=instance.startTick&&transport.currentTick<(instance.endTick??Infinity);
  const sourceTick=active?getPlaybackLocalTick(instance,transport.currentTick):transport&&transport.state!=='playing'&&d?.capture?transport.currentTick:null;
  const session=throws.get(id),beforeLaunch=session&&transport&&transport.currentTick<session.start;
  const tick=sourceTick===null?null:beforeLaunch?0:((sourceTick-(d?.capture?.phaseOffsetTick||0))%d.capture.durationTicks+d.capture.durationTicks)%d.capture.durationTicks;
  const cycle=tick===null?null:Math.round((transport.currentTick-tick)*1e6)/1e6;
  const trajectory=previewPath(id,d,{playing:transport?.state==='playing',cycle}),point=trajectory&&tick!==null?trajectoryPoint(trajectory,tick):null;
  return {data:d,recording:recording(id),tick,trajectory,ball:point};
 }
 function ballView(ball){
  const d=data(ball.captureId);if(!d?.capture)return {position:{x:ball.x,y:ball.y},trail:[]};
  const v=view(ball.captureId),tick=v.tick;
  return {position:v.ball||{x:ball.x,y:ball.y},trail:tick===null?[]:v.trajectory.filter(p=>p.tick<=tick&&p.tick>tick-72)};
 }
 const unsubscribe=objects.subscribe(event=>{
  if(event.type==='restore'){previews.clear();flights.clear();return;}
  for(const c of containers.list().filter(c=>c.presentation.type==='simple-bouncer')){
   const d=c.interactionData;if(!d?.capture||d.version!==2)continue;
   const geometryChange=event.type!=='update'||['x','y','width','height'].some(k=>event.object[k]!==event.previous[k]);
   const cubeChange=event.object.kind==='cube'&&(geometryChange||d.cubeIds?.includes(event.object.id)),ballDeleted=event.object.kind==='ball'&&event.type==='remove'&&d.ballId===event.object.id;
   if(!cubeChange&&!ballDeleted)continue;
   if(event.type==='update'&&['x','y','width','height','sourceMidi','instrument'].every(k=>event.object[k]===event.previous[k]))continue;
   const transport=getTransport(c.id);
   if(cubeChange&&transport?.state==='playing')flightAt(c.id,d,currentCycle(c.id,d,transport));
   d.stale=true;d.brokenReferences=[...(d.cubeIds||[]),d.ballId].filter(id=>id&&!objects.get(id));setData(c.id,d);
   if(cubeChange)invalidateUpcoming(c.id);
  }
 });
 function currentCycle(id,d,transport){
  const instance=getPlaybackInstance(panels(id)[0]?.id),origin=patternOriginTick(instance||{})+(d.capture.phaseOffsetTick||0);
  return origin+Math.floor((transport.currentTick-origin)/d.capture.durationTicks)*d.capture.durationTicks;
 }
 function invalidateUpcoming(id){
  const transport=getTransport(id),panel=panels(id)[0];if(!panel||transport?.state!=='playing')return;
  const d=data(id);if(!d?.capture)return;
  const cycle=currentCycle(id,d,transport);
  const cycles=flights.get(id);if(cycles)for(const start of cycles.keys())if(start>cycle)cycles.delete(start);
  // Cancel only unstarted audio, then rebuild lookahead from the same current
  // flight and the latest next-flight setup. Sounding notes remain untouched.
  cancelScheduled(panel,transport.currentTick);onPlay();
 }
 function editHandle(id,kind,point){
  if(busy()||!['start','target'].includes(kind)||![point?.x,point?.y].every(Number.isFinite))return false;const d=data(id);if(!d?.startPosition)return false;
  view(id); // Snapshot the in-flight launch before editing the next one.
  if(kind==='start'){const c=containers.get(id);containers.move(id,c.bounds.x+point.x-d.startPosition.x,c.bounds.y+point.y-d.startPosition.y);}
  else{d.targetPosition={...point};d.launch=boardLaunch(d.startPosition,d.targetPosition);d.stale=!!d.capture;setData(id,d);invalidateUpcoming(id);}return true;
 }
 const unsubscribeContainers=containers.subscribeMoves(({id,dx,dy})=>{
  const d=data(id);if(!d?.startPosition||(!dx&&!dy))return;
  view(id);
  for(const key of ['startPosition','targetPosition'])d[key]={x:d[key].x+dx,y:d[key].y+dy};
  d.launch=boardLaunch(d.startPosition,d.targetPosition);d.stale=!!d.capture;setData(id,d);
  if(objects.get(d.ballId))objects.update(d.ballId,{x:d.startPosition.x,y:d.startPosition.y});
  invalidateUpcoming(id);
 });
 const handles=()=>containers.list().filter(c=>c.presentation.type==='simple-bouncer'&&c.interactionData?.startPosition).flatMap(c=>['start','target'].map(kind=>({id:c.id+':'+kind,containerId:c.id,kind,...c.interactionData[kind+'Position']})));
 function migrateLegacy(){
  for(const c of containers.list().filter(c=>c.presentation.type==='simple-bouncer'&&c.interactionData?.version===2)){
   const d=c.interactionData;if(d.launch&&!d.startPosition){d.startPosition={x:d.launch.x,y:d.launch.y};d.targetPosition={x:d.launch.x+d.launch.vx,y:d.launch.y+d.launch.vy};setData(c.id,d);}
  }

  for(const c of containers.list().filter(c=>c.presentation.type==='simple-bouncer'&&c.interactionData?.version!==2)){
   const old=c.interactionData,dx=c.bounds.x+16,dy=c.bounds.y+126,ids=new Map();
   for(const cube of old.cubes||[]){const next=objects.addCube(cube.x+dx,cube.y+dy,{sourceMidi:cube.sourceMidi,instrument:cube.instrument});ids.set(cube.id,next.id);}
   const capture=structuredClone(old.capture);if(capture)for(const p of capture.trajectory){p.x+=dx;p.y+=dy;}
   const first=capture?.trajectory[0]||{x:dx+40,y:dy+100},ball=objects.addBall(first.x,first.y),ps=panels(c.id);
   for(const p of ps){for(const n of p.__dgAuthoredNotes||[])if(ids.has(n.cubeId))n.cubeId=ids.get(n.cubeId);publish(p,'simple-bouncer-board-migration');}
   const notes=ps.flatMap(p=>p.__dgAuthoredNotes||[]),d={...empty(),bars:old.bars||1,cubeIds:[...new Set(notes.map(n=>n.cubeId).filter(Boolean))],ballId:ball.id,launch:boardLaunch(first,{x:first.x+100,y:first.y}),capture,stale:!!old.stale};
   d.startPosition={x:first.x,y:first.y};d.targetPosition={x:first.x+100,y:first.y};setData(c.id,d);objects.update(ball.id,{captureId:c.id,captureToyId:ps[0]?.id||null});containers.resize(c.id,520,360);
  }
 }
 return {subscribe:fn=>containers.subscribe(fn),handles,editHandle,create,data,panels,objects,recording,busy,setBars,clear,throwBall,view,ballView,migrateLegacy,resetSessions:()=>{pending.clear();throws.clear();previews.clear();flights.clear();syncHooks();},dispose:id=>{pending.delete(id);throws.delete(id);previews.delete(id);flights.delete(id);},destroy:()=>{unsubscribe();unsubscribeContainers();unsubscribeHooks();for(const h of hooks.values()){if(h.panel.__sequencerPatternAtTick===h.provider)h.panel.__sequencerPatternAtTick=h.original;delete h.panel.__simpleBouncerLive;}hooks.clear();}};
}
