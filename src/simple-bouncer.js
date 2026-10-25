import {receiverTriggerResponse} from './board-receiver-response.js';
import {createBoardObject,resolveBoardInteraction} from './board-object.js';
import {predictCannonTrajectory,simulateThrow,trajectoryPoint,trajectoryState,clampBars,boardLaunch,aimDirection,CANNON_SIZE,CANNON_BARREL_LENGTH,DEFAULT_CANNON_INSTRUMENT,ballMode,BALL_GRAVITY,GRAVITY_BOUNCE_RETENTION} from './simple-bouncer-physics.js';
import {normalizeAuthoredState,restoreAuthoredNotes,drawgridPatternFromState} from './drawgrid/dg-authored-notes.js';
import {getPlaybackInstance,getPlaybackLocalTick,getPlaybackOccurrence} from './playback-instances.js';
import {boardPhysicalObjects} from './board-physical-objects.js';
import {quantizeBouncerOffsetTick} from './bouncer-transport.js';
import {ensureTransportPlayingForSimpleAuthoring} from './simple-authoring-playback.js';
import {patternOriginTick} from './source-phase.js';

export function bouncerGridState(capture,id,instrument=DEFAULT_CANNON_INSTRUMENT,getReceiver=()=>null){
 const steps=capture.durationTicks>384?32:8;
 const emitter=createBoardObject('cannon',{id,authoredState:{instrument}});
 const authoredNotes=capture.collisions.flatMap((contact,index)=>{
  // Pre-foundation saves have only pitch; migrate that receiver snapshot here.
  const live=getReceiver(contact.cubeId),receiver=live?.capabilities?.triggerReceiver?.soundSource==='receiver'?live:{id:contact.cubeId,capabilities:contact.receiverCapabilities??{triggerReceiver:{},pitchSource:{midi:contact.sourceMidi}}};
  const event=resolveBoardInteraction(emitter,receiver,contact.timeSeconds,contact.contact);
  if(!event||event.soundSource==='receiver')return [];
  return [{id:`${id}:hit:${index}`,col:((contact.tick+(capture.phaseOffsetTick||0))%capture.durationTicks)/48,
   sourceMidi:event.sourceMidi,cubeId:event.receiverId,collisionTimeSeconds:event.timeSeconds}];
 });
 return normalizeAuthoredState({steps,instrument,preserveSourceRegister:true,authoredDurationTicks:capture.durationTicks,
  authoredNotes,nodes:{active:Array(steps).fill(true)},strokes:[],meta:{preserveNodesOverStrokes:true}});
}
// Captures own ordinary musical toys, and reference independent physical IDs.
export function createSimpleBouncerController({containers,objects=boardPhysicalObjects,getCollisionObjects=()=>objects.list('cube'),subscribeReceivers=()=>()=>{},onReceiverTrigger=()=>{},getToy,createGrid,applyGrid,removeGrid,publish,getTransport,cancelScheduled=()=>{},onChanged=()=>{},onPlay=()=>{}}){
 const throws=new Map(),pending=new Map();
 const receiverAdmissions=new Map();
 const receiverMap=()=>new Map(getCollisionObjects().map(body=>[body.id,body.boardObject||(body.capabilities?body:null)]));
 const gridState=(capture,id,instrument)=>{const receivers=receiverMap();return bouncerGridState(capture,id,instrument,id=>receivers.get(id));};
 function collisionContact(hit,capture){
  const contact=hit.contact?.contact||hit.contact||{},point=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y);if(point(contact.localPosition)||point(contact.position)||(Number.isFinite(contact.progress)&&Number.isInteger(contact.lane)))return contact;
  const tick=hit.timeSeconds*capture.bpm*96/60,last=capture.trajectory?.at(-1);const recovered=last&&tick>=last.tick?last:trajectoryState(capture.trajectory,tick,capture.bpm);
  return recovered?{position:{x:recovered.x,y:recovered.y}}:{};
 }

 function scheduleReceiverHits(){
  const receivers=receiverMap();
  for(const c of containers.list().filter(c=>c.presentation.type==='simple-bouncer')){
   const d=c.interactionData,t=getTransport(c.id);if(!d?.capture||t?.state!=='playing')continue;
   const from=t.currentTick,to=t.audioTimeToTick(t.tickToAudioTime(from)+.15),duration=d.capture.durationTicks;
   for(let cycle=currentCycle(c.id,d,t);cycle<to;cycle+=duration){
    const capture=flightAt(c.id,d,cycle).capture;for(const hit of capture.collisions){
     const eventTick=cycle+hit.tick;if(eventTick<from-6||eventTick>=to||eventTick<(throws.get(c.id)?.start||0))continue;
     // Admit receiver-owned rhythm only after physical contact, so editing an
     // untravelled flight cannot record a collision that never happened.
     if(from<cycle+hit.timeSeconds*d.capture.bpm*96/60)continue;
     const receiver=receivers.get(hit.cubeId);if(!receiver)continue;const emitter=createBoardObject('cannon',{id:c.id,authoredState:{instrument:d.instrument}});
     const event=resolveBoardInteraction(emitter,receiver,hit.timeSeconds,collisionContact(hit,capture));if(event?.soundSource!=='receiver')continue;
     const key=c.id+':'+hit.cubeId+':'+(event.lane??'')+':'+(event.region??'')+':'+eventTick;if(receiverAdmissions.has(key))continue;
     receiverAdmissions.set(key,{eventTick,transport:t});onReceiverTrigger({...event,eventTick,when:t.tickToAudioTime(eventTick),transportId:t.id},t);
    }
   }
  }
  for(const [key,e]of receiverAdmissions)if(e.transport.currentTick>e.eventTick+1536)receiverAdmissions.delete(key);
 }
 const empty=(mode='normal')=>({version:3,ballMode:ballMode(mode),bars:1,instrument:DEFAULT_CANNON_INSTRUMENT,direction:{x:1,y:0},cubeIds:[],ballId:null,launch:null,capture:null,stale:false,brokenReferences:[]});
 const data=id=>containers.get(id)?.interactionData;
 const panels=id=>(containers.get(id)?.internalToyIds||[]).map(getToy).filter(Boolean);
 const setData=(id,d)=>containers.setPresentation(id,{interactionData:d});
 const create=(options={})=>containers.create({...options,width:CANNON_SIZE,height:CANNON_SIZE,presentationType:'simple-bouncer',interactionData:empty(options.ballMode)});
 function recording(id){
  if(pending.has(id))return true;const session=throws.get(id);if(!session)return false;
  const transport=getTransport(id),tick=transport?.currentTick;
  if(!transport||tick<session.createdTick||tick-session.start>=session.duration){throws.delete(id);return false;}return true;
 }
 const busy=()=>[...new Set([...throws.keys(),...pending.keys()])].some(recording);
 function cannon(id){const c=containers.get(id),d=c?.interactionData;if(!d)return null;const direction=d.direction||{x:1,y:0};return {x:c.bounds.x,y:c.bounds.y,direction,endpoint:{x:c.bounds.x+direction.x*CANNON_BARREL_LENGTH,y:c.bounds.y+direction.y*CANNON_BARREL_LENGTH}};}
 function authoredLaunch(id,d=data(id)){const c=containers.get(id);return boardLaunch(c.bounds,{x:c.bounds.x+(d.direction?.x??1)*CANNON_BARREL_LENGTH,y:c.bounds.y+(d.direction?.y??0)*CANNON_BARREL_LENGTH});}
 function writeMusic(panel,state){if(panel.__drawToy?.setAuthoredState)panel.__drawToy.setAuthoredState(state);else restoreAuthoredNotes(panel,state);panel.__seqPattern=drawgridPatternFromState(state);panel.dataset.instrument=state.instrument;}
 function setInstrument(id,instrument){
  const d=data(id);if(!d||typeof instrument!=='string'||!instrument.trim())return false;d.instrument=instrument;setData(id,d);
  const panel=panels(id)[0];if(panel){const notes=(panel.__dgAuthoredNotes||[]).map(({instrument:legacy,...note})=>note),steps=Number(panel.dataset.steps)||8;
   const state=normalizeAuthoredState({steps,instrument,preserveSourceRegister:true,authoredDurationTicks:d.capture?.durationTicks||d.bars*384,authoredNotes:notes,nodes:{active:Array(steps).fill(true)},strokes:[],meta:{preserveNodesOverStrokes:true}});
   writeMusic(panel,state);publish(panel,'simple-bouncer-instrument');
   const t=getTransport(id);cancelScheduled(panel,t?.currentTick||0);
  }
  if(objects.get(d.ballId))objects.update(d.ballId,{instrument});onChanged();onPlay();return true;
 }
 function setBars(id,bars){const d=data(id);if(!d)return false;const next=clampBars(bars);if(d.bars===next)return true;d.bars=next;d.stale=!!d.capture;setData(id,d);return true;}
 function clear(id){
  pending.delete(id);throws.delete(id);const previous=data(id),ball=objects.get(previous?.ballId);
  if(ball?.captureId===id)objects.update(ball.id,{captureId:null,captureToyId:null,motion:{vx:0,vy:0}});
  const result=containers.clear(id,{interactionData:{...empty(previous?.ballMode),bars:previous?.bars||1,ballId:previous?.ballId||null,launch:previous?.launch||null,direction:previous?.direction||{x:1,y:0},instrument:previous?.instrument||DEFAULT_CANNON_INSTRUMENT}});onChanged();return result;
 }
 async function throwBall(id,{ballId=null,launch=null,targetPosition=null}={}){
  if(pending.has(id))return false;
  const d=data(id);if(!d)return false;
  ballId??=d.ballId;
  if(!launch)launch=authoredLaunch(id,d);
  if(!objects.get(ballId)||!launch)return false;
  if(![launch.x,launch.y,launch.vx,launch.vy].every(Number.isFinite))throw Error('Invalid throw');
  const token={};pending.set(id,token);
  const transport=getTransport(id),capture=simulateThrow({cubes:getCollisionObjects(),launch,bars:d.bars,bpm:transport?.bpm||120,ballMode:d.ballMode});
  // Rotate authored columns onto the shared clock rather than resetting source
  // phase. A running transport gets one slot of preparation time before launch.
  const createdTick=transport?.currentTick||0,startTick=Math.ceil(createdTick/48)*48+(transport?.state==='playing'?48:0);
  capture.phaseOffsetTick=startTick%capture.durationTicks;capture.firstLaunchTick=startTick;
  const state=gridState(capture,id,d.instrument);let panel=panels(id)[0],created=false;
  // Author ownership before asynchronous grid creation, so deleting a new
  // cannon also deletes its ball and cancels the pending musical child.
  Object.assign(d,{ballId,launch:structuredClone(launch),direction:aimDirection(launch,targetPosition||{x:launch.x+launch.vx,y:launch.y+launch.vy})});
  setData(id,d);objects.update(ballId,{captureId:id,instrument:d.instrument,ballMode:ballMode(d.ballMode)});
  try{
   if(panel)await applyGrid(panel,state);
   else{const c=containers.get(id);panel=await createGrid(state,{x:c.bounds.x,y:c.bounds.y+220});created=true;}
   if(pending.get(id)!==token||!containers.get(id)){if(created)removeGrid(panel);return false;}
   d.instrument=data(id).instrument;
   if(state.instrument!==d.instrument)writeMusic(panel,{...state,instrument:d.instrument});
   containers.move(id,launch.x,launch.y);
   flights.delete(id);previews.delete(id);
   Object.assign(d,{version:3,ballId,launch:structuredClone(launch),direction:aimDirection(launch,targetPosition||{x:launch.x+launch.vx,y:launch.y+launch.vy}),cubeIds:[...new Set(capture.collisions.map(e=>e.cubeId))],capture:{durationTicks:capture.durationTicks,phaseOffsetTick:capture.phaseOffsetTick,bpm:capture.bpm,trajectory:capture.trajectory,collisions:capture.collisions,firstLaunchTick:capture.firstLaunchTick},stale:false,brokenReferences:[]});
   if(created){const result=containers.attach(id,[panel.id],{interactionData:d});if(!result.ok)throw Error(result.reason);}else setData(id,d);
   objects.update(ballId,{x:launch.x,y:launch.y,motion:{vx:launch.vx,vy:launch.vy},ballMode:ballMode(d.ballMode),captureId:id,captureToyId:panel.id,instrument:d.instrument});
   panel.classList?.remove('container-pending');publish(panel,'simple-bouncer-capture');onChanged();
   if(transport){await ensureTransportPlayingForSimpleAuthoring(transport);throws.set(id,{createdTick,start:startTick,duration:capture.durationTicks});onPlay();}
   return true;
  }catch(error){if(created&&panel&&!containers.owner(panel.id))removeGrid(panel);throw error;}
  finally{if(pending.get(id)===token)pending.delete(id);}
 }
 // Audio lookahead and visuals share each flight. Cannon edits latch at launch;
 // cube edits replace only its remaining path and unsounded impact notes.
 // An edited flight remains live; publish its settled replacement next loop.
 const previews=new Map(),flights=new Map(),hooks=new Map();
 function geometryKey(d,launch,cubes){return JSON.stringify([ballMode(d.ballMode),launch,d.capture.durationTicks,d.capture.bpm,cubes.map(c=>[c.id,c.x,c.y,c.width,c.height,c.radius,c.size,c.sourceMidi,c.segments,c.surfaceRadius])]);}
 function flightAt(id,d,cycle){
  let cycles=flights.get(id);if(!cycles){cycles=new Map();flights.set(id,cycles);}
  if(cycles.has(cycle))return cycles.get(cycle);
  const cubes=getCollisionObjects(),launch=d.stale?authoredLaunch(id,d):d.launch;
  const key=geometryKey(d,launch,cubes),phase=d.capture.phaseOffsetTick||0;
  const capture=d.stale?{...simulateThrow({launch,cubes,bars:d.capture.durationTicks/384,bpm:d.capture.bpm,ballMode:d.ballMode}),phaseOffsetTick:phase}:{...d.capture,collisions:d.capture.collisions||(panels(id)[0]?.__dgAuthoredNotes||[]).map(n=>({tick:((n.col*48-phase)%d.capture.durationTicks+d.capture.durationTicks)%d.capture.durationTicks,timeSeconds:n.collisionTimeSeconds,cubeId:n.cubeId,sourceMidi:n.sourceMidi}))};
  // End-cell hits sound on the following launch, never before their impact.
  const priorFlight=cycles.get(cycle-capture.durationTicks),session=throws.get(id);
  const previous=priorFlight?.capture||(cycle>(session?.start??d.capture.firstLaunchTick??d.capture.phaseOffsetTick??0)?d.capture:null);
  const carry=(previous?.collisions||[]).filter(e=>e.tick>=capture.durationTicks).map(e=>({...e,tick:0,timeSeconds:e.timeSeconds-capture.durationTicks*60/(capture.bpm*96)}));
  capture.collisions=[...carry,...capture.collisions.filter(e=>!(e.timeSeconds<0))];
  const state=gridState({...capture,collisions:capture.collisions.filter(e=>e.tick<capture.durationTicks)},id,d.instrument),flight={cycle,key,launch,capture,state,pattern:drawgridPatternFromState(state),changed:d.stale,committed:false};cycles.set(cycle,flight);
  for(const tick of cycles.keys())if(tick<cycle-d.capture.durationTicks*2)cycles.delete(tick);
  return flight;
 }
 function commitFlight(id,d,flight){
  if(!flight.changed||flight.committed||flight.liveEdited)return;flight.committed=true;
  const panel=panels(id)[0];if(!panel)return;
  writeMusic(panel,gridState({...flight.capture,collisions:flight.capture.collisions.filter(e=>!(e.timeSeconds<0))},id,d.instrument));
  d.capture={durationTicks:flight.capture.durationTicks,phaseOffsetTick:flight.capture.phaseOffsetTick,bpm:flight.capture.bpm,trajectory:flight.capture.trajectory,collisions:flight.capture.collisions,firstLaunchTick:d.capture.firstLaunchTick};
  d.cubeIds=[...new Set(flight.capture.collisions.map(e=>e.cubeId))];
  const authored=authoredLaunch(id,d);
  d.stale=!!flight.liveEdited||geometryKey(d,authored,getCollisionObjects())!==flight.key;d.brokenReferences=[];
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
    return {...flightAt(c.id,d,cycle).pattern,instrument:d.instrument};
   };
   panel.__sequencerPatternAtTick=provider;panel.__simpleBouncerLive=true;hooks.set(panel.id,{panel,original,provider});
  }
  for(const [id,h]of hooks)if(!owned.has(id)){if(h.panel.__sequencerPatternAtTick===h.provider)h.panel.__sequencerPatternAtTick=h.original;delete h.panel.__simpleBouncerLive;hooks.delete(id);}
 }
 const unsubscribeHooks=containers.subscribe(syncHooks);
 function previewPath(id,d,{playing=false,cycle=0}={}){
  if(!d?.capture)return null;
  if(playing){const flight=flightAt(id,d,cycle);if(cycle!==null)commitFlight(id,d,flight);return flight.capture.trajectory;}
  if(!d.stale||!d.direction)return d.capture.trajectory;
  const launch=authoredLaunch(id,d),cubes=getCollisionObjects(),key=geometryKey(d,launch,cubes);
  let preview=previews.get(id);
  if(preview?.key!==key){preview={key,trajectory:simulateThrow({launch,cubes,bars:d.capture.durationTicks/384,bpm:d.capture.bpm,ballMode:d.ballMode}).trajectory};previews.set(id,preview);}
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
  const trajectory=previewPath(id,d,{playing:transport?.state==='playing',cycle}),point=trajectory&&tick!==null&&!(d.ballMode==='gravity'&&tick>=trajectory.at(-1).tick)?trajectoryPoint(trajectory,tick):null;
  return {data:d,recording:recording(id),tick,trajectory,ball:point};
 }
 function ballView(ball){
  const d=data(ball.captureId);if(!d?.capture)return {position:{x:ball.x,y:ball.y},trail:[]};
  const v=view(ball.captureId),tick=v.tick;
  return {hidden:d.ballMode==='gravity'&&v.tick!==null&&!v.ball,position:v.ball||{x:ball.x,y:ball.y},trail:tick===null?[]:v.trajectory.filter(p=>p.tick<=tick&&p.tick>tick-72)};
 }
 const receiversChanged=event=>{
  if(event.type==='restore'){previews.clear();flights.clear();return;}
  for(const c of containers.list().filter(c=>c.presentation.type==='simple-bouncer')){
   const d=c.interactionData;if(!d?.capture||d.version!==3)continue;
   const geometryChange=event.type!=='update'||['x','y','width','height','segments','surfaceRadius'].some(k=>JSON.stringify(event.object[k])!==JSON.stringify(event.previous[k]));
   const cubeChange=!!event.object.boardObject?.capabilities.triggerReceiver&&(geometryChange||d.cubeIds?.includes(event.object.id)),ballDeleted=event.object.kind==='ball'&&event.type==='remove'&&d.ballId===event.object.id;
   if(!cubeChange&&!ballDeleted)continue;
   if(event.type==='update'&&['x','y','width','height','sourceMidi','segments','surfaceRadius'].every(k=>JSON.stringify(event.object[k])===JSON.stringify(event.previous[k])))continue;
   const transport=getTransport(c.id);
   if(cubeChange&&transport?.state==='playing')reviseFlight(c.id,d,transport,event);
   d.stale=true;d.brokenReferences=[...(d.cubeIds||[]),d.ballId].filter(id=>id&&!objects.get(id)&&!getCollisionObjects().some(o=>o.id===id));setData(c.id,d);
   if(cubeChange)invalidateUpcoming(c.id);
  }
 };
 const unsubscribe=objects.subscribe(receiversChanged),offReceivers=subscribeReceivers(receiversChanged);
 // Cube edits affect only the untravelled part; cannon edits remain latched.
 function reviseFlight(id,d,transport,event){
  if(throws.get(id)?.start>transport.currentTick)return;
  const cycle=currentCycle(id,d,transport),tick=transport.currentTick-cycle;
  if(tick<0||tick>=d.capture.durationTicks)return;
  const flight=flightAt(id,d,cycle),capture=flight.capture;
  if(d.ballMode==='gravity'&&tick>=capture.trajectory.at(-1).tick)return;
  const launch=trajectoryState(capture.trajectory,tick,capture.bpm,d.ballMode==='gravity'?BALL_GRAVITY:0);if(!launch)return;
  const prior=capture.collisions.filter(e=>e.timeSeconds*capture.bpm*96/60<=tick+1e-6);
  // Pointer events can move a cube completely across the ball between frames.
  // Sweep that movement too, so a fast drag cannot silently tunnel through it.
  if(event.type==='update'&&event.previous&&!event.object.segments){
   const cube=event.object,old=event.previous;let enter=0,exit=1,axis=null;
   for(const key of ['x','y']){
    const half=(cube[key==='x'?'width':'height']||cube.size)/2+13,delta=old[key]-launch[key],velocity=cube[key]-old[key];
    if(!velocity){if(Math.abs(delta)>half){exit=-1;break;}continue;}
    const a=(-half-delta)/velocity,b=(half-delta)/velocity,near=Math.min(a,b);
    if(near>enter){enter=near;axis=key;}exit=Math.min(exit,Math.max(a,b));
   }
   if(axis&&enter<=exit&&exit>=0&&enter<=1&&!prior.some(e=>e.cubeId===cube.id&&e.tick>=tick)){
    const snapped=quantizeBouncerOffsetTick(tick,0,2,{loopLengthTicks:capture.durationTicks});
    prior.push({tick:snapped===capture.durationTicks-1?capture.durationTicks:snapped,timeSeconds:tick*60/(capture.bpm*96),cubeId:cube.id,sourceMidi:cube.sourceMidi});
    const velocity=axis==='x'?'vx':'vy';launch[velocity]=Math.sign(cube[axis]-old[axis])*Math.abs(launch[velocity]);if(d.ballMode==='gravity'){launch.vx*=GRAVITY_BOUNCE_RETENTION;launch.vy*=GRAVITY_BOUNCE_RETENTION;}
   }
  }
  const remainder=simulateThrow({launch,cubes:getCollisionObjects(),bars:capture.durationTicks/384,bpm:capture.bpm,startTick:tick,priorCollisions:prior,ballMode:d.ballMode});
  flight.capture={...capture,trajectory:[...capture.trajectory.filter(p=>p.tick<tick),...remainder.trajectory],collisions:[...prior,...remainder.collisions]};
  flight.key=geometryKey(d,flight.launch,getCollisionObjects());
  flight.state=gridState({...flight.capture,collisions:flight.capture.collisions.filter(e=>e.tick<flight.capture.durationTicks)},id,d.instrument);flight.pattern=drawgridPatternFromState(flight.state);
  flight.changed=true;flight.liveEdited=true;flight.committed=false;
 }
 function prediction(id){
  const d=data(id);if(!d?.capture)return [];
  const launch=authoredLaunch(id,d),cubes=getCollisionObjects(),bpm=getTransport(id)?.bpm||120,key=JSON.stringify([geometryKey(d,launch,cubes),d.bars,bpm]);
  let cached=previews.get(id);if(cached?.key!==key){cached={key,trajectory:predictCannonTrajectory({launch,cubes,bars:d.bars,bpm,ballMode:d.ballMode})};previews.set(id,cached);}
  return cached.trajectory;
 }
 function cubeResponses(){
  const responses=new Map();
  for(const c of containers.list().filter(c=>c.presentation.type==='simple-bouncer')){
   const d=c.interactionData,t=getTransport(c.id);if(!d?.capture||t?.state!=='playing')continue;
   const instance=getPlaybackInstance(panels(c.id)[0]?.id);if(!instance?.active)continue;
   const cycle=currentCycle(c.id,d,t),tick=t.currentTick-cycle;
   for(const hit of flightAt(c.id,d,cycle).capture.collisions){
    const impact=hit.timeSeconds*d.capture.bpm*96/60;
    const {pending,flash}=receiverTriggerResponse({tick,intendedTick:impact,eventTick:hit.tick});
    const previous=responses.get(hit.cubeId)||{pending:false,flash:0};
    responses.set(hit.cubeId,{pending:previous.pending||pending,flash:Math.max(previous.flash,flash)});
   }
  }
  return responses;
 }
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
 function setAim(id,point){
  if(![point?.x,point?.y].every(Number.isFinite))return false;
  const d=data(id);if(!d)return false;view(id);d.direction=aimDirection(containers.get(id).bounds,point);d.launch=authoredLaunch(id,d);d.stale=!!d.capture;setData(id,d);invalidateUpcoming(id);return true;
 }
 // Compatibility for integrations that previously addressed Start/Target.
 function editHandle(id,kind,point){if(kind==='target'||kind==='aim')return setAim(id,point);if(kind!=='start')return false;return !!containers.move(id,point.x,point.y);}
 const unsubscribeContainers=containers.subscribeMoves(({id,dx,dy})=>{
  const d=data(id);if(d?.version!==3||(!dx&&!dy))return;
  view(id);d.launch=authoredLaunch(id,d);d.stale=!!d.capture;setData(id,d);
  if(objects.get(d.ballId))objects.update(d.ballId,{x:d.launch.x,y:d.launch.y});invalidateUpcoming(id);
 });
 const unsubscribeLifecycle=containers.subscribeLifecycle(({type,container:c})=>{
  if(c.presentation.type!=='simple-bouncer')return;
  pending.delete(c.id);throws.delete(c.id);previews.delete(c.id);flights.delete(c.id);
  const ball=objects.get(c.interactionData?.ballId);if(ball?.captureId!==c.id)return;
  const other=containers.list().find(other=>other.interactionData?.ballId===ball.id);
  if(type==='remove'&&!other)objects.remove(ball.id);
  else objects.update(ball.id,{captureId:other?.id||null,captureToyId:other?.internalToyIds[0]||null,motion:{vx:0,vy:0}});
 });
 const handles=()=>[];
 function migrateLegacy(){
  for(const c of containers.list().filter(c=>c.presentation.type==='simple-bouncer'&&c.interactionData?.version===2)){
   const old=c.interactionData,start=old.startPosition||old.launch||c.bounds,target=old.targetPosition||{x:start.x+(old.launch?.vx||100),y:start.y+(old.launch?.vy||0)},panel=panels(c.id)[0];
   const instrument=old.instrument||panel?.dataset.instrument||panel?.__dgAuthoredNotes?.[0]?.instrument||DEFAULT_CANNON_INSTRUMENT;
   containers.move(c.id,start.x,start.y);containers.resize(c.id,CANNON_SIZE,CANNON_SIZE);
   const {startPosition,targetPosition,...rest}=old;setData(c.id,{...rest,version:3,instrument,direction:aimDirection(start,target)});
   if(panel){const notes=(panel.__dgAuthoredNotes||[]).map(({instrument:legacy,...note})=>note),steps=Number(panel.dataset.steps)||8;
    writeMusic(panel,normalizeAuthoredState({steps,instrument,preserveSourceRegister:true,authoredDurationTicks:old.capture?.durationTicks||old.bars*384,authoredNotes:notes,nodes:{active:Array(steps).fill(true)},strokes:[],meta:{preserveNodesOverStrokes:true}}));publish(panel,'simple-bouncer-cannon-migration');}
   if(objects.get(old.ballId))objects.update(old.ballId,{instrument});
  }

  for(const c of containers.list().filter(c=>c.presentation.type==='simple-bouncer'&&![2,3].includes(c.interactionData?.version))){
   const old=c.interactionData,dx=c.bounds.x+16,dy=c.bounds.y+126,ids=new Map();
   for(const cube of old.cubes||[]){const next=objects.addCube(cube.x+dx,cube.y+dy,{sourceMidi:cube.sourceMidi,instrument:cube.instrument});ids.set(cube.id,next.id);}
   const capture=structuredClone(old.capture);if(capture)for(const p of capture.trajectory){p.x+=dx;p.y+=dy;}
   const first=capture?.trajectory[0]||{x:dx+40,y:dy+100},ball=objects.addBall(first.x,first.y),ps=panels(c.id);
   for(const p of ps){for(const n of p.__dgAuthoredNotes||[])if(ids.has(n.cubeId))n.cubeId=ids.get(n.cubeId);publish(p,'simple-bouncer-board-migration');}
   const notes=ps.flatMap(p=>p.__dgAuthoredNotes||[]),d={...empty(),bars:old.bars||1,cubeIds:[...new Set(notes.map(n=>n.cubeId).filter(Boolean))],ballId:ball.id,launch:boardLaunch(first,{x:first.x+100,y:first.y}),capture,stale:!!old.stale};
   d.direction={x:1,y:0};d.instrument=ps[0]?.dataset.instrument||DEFAULT_CANNON_INSTRUMENT;containers.move(c.id,first.x,first.y);setData(c.id,d);objects.update(ball.id,{captureId:c.id,captureToyId:ps[0]?.id||null,instrument:d.instrument});containers.resize(c.id,CANNON_SIZE,CANNON_SIZE);
   for(const p of ps){const steps=Number(p.dataset.steps)||8,notes=(p.__dgAuthoredNotes||[]).map(({instrument:legacy,...note})=>note);
    writeMusic(p,normalizeAuthoredState({steps,instrument:d.instrument,preserveSourceRegister:true,authoredDurationTicks:d.capture?.durationTicks||d.bars*384,authoredNotes:notes,nodes:{active:Array(steps).fill(true)},strokes:[],meta:{preserveNodesOverStrokes:true}}));publish(p,'simple-bouncer-cannon-migration');}
  }
  // Rebuild runtime ball links and validate references after every load.
  for(const c of containers.list().filter(c=>c.presentation.type==='simple-bouncer')){
   const d=c.interactionData;if(!d)continue;d.ballMode=ballMode(d.ballMode);
   d.brokenReferences=[...(d.cubeIds||[]),d.ballId].filter(id=>id&&!objects.get(id)&&!getCollisionObjects().some(o=>o.id===id));
   if(d.brokenReferences.length)d.stale=true;
   setData(c.id,d);
   if(objects.get(d.ballId))objects.update(d.ballId,{captureId:c.id,captureToyId:c.internalToyIds[0]||null,ballMode:d.ballMode,motion:{vx:0,vy:0}});
  }
 }
 return {scheduleReceiverHits,resetReceiverAdmissions:()=>receiverAdmissions.clear(),subscribe:fn=>containers.subscribe(fn),prediction,cubeResponses,handles,cannon,setAim,setInstrument,editHandle,create,data,panels,objects,recording,busy,setBars,clear,throwBall,view,ballView,migrateLegacy,resetSessions:()=>{pending.clear();throws.clear();previews.clear();flights.clear();syncHooks();},dispose:id=>{pending.delete(id);throws.delete(id);previews.delete(id);flights.delete(id);},destroy:()=>{offReceivers();unsubscribe();unsubscribeContainers();unsubscribeLifecycle();unsubscribeHooks();for(const h of hooks.values()){if(h.panel.__sequencerPatternAtTick===h.provider)h.panel.__sequencerPatternAtTick=h.original;delete h.panel.__simpleBouncerLive;}hooks.clear();}};
}
