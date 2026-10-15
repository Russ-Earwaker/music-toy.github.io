import {createRelationshipReveal} from './toy-relationship-reveal.js';
import {ensureMasterName} from './toy-instances.js';
import {getCurrentPlaybackOccurrence,withPlaybackOccurrence} from './playback-context.js';
import {linkToyAudioBus,getToyVolumeRaw,isToyMuted,setToyVolume,setToyMuted} from './audio-core.js';

// Definitions own authored data, numbering and audio. Live editors supply the
// existing toy-specific renderer/scheduler, never the shared data identity.
export function createLinkedToyViewController({getPanels,getMaster,createView,capture,apply,register,changed,focus,remove,syncVolumeUI=()=>{}}){
 const models=new Map(),providers=new WeakMap(),patterns=new WeakMap(),bound=new WeakSet(),applying=new WeakSet(),presentations=new WeakMap();let paused=false;
 const audioId=p=>p.__audioToyId||p.dataset.audiotoyid||p.id;
 function model(p){
  if(!p)return null;
  const attached=p.__sharedToyDefinition;if(attached&&models.get(attached.id)===attached&&p.dataset.sharedDefinitionId===attached.id)return attached;
  const legacy=p.dataset.masterToyId?getMaster(p.dataset.masterToyId):null;
  const id=p.dataset.sharedDefinitionId||legacy?.dataset.sharedDefinitionId||('toy-definition:'+(legacy||p).id);
  if(p.dataset.sharedDefinitionId!==id)p.dataset.sharedDefinitionId=id;if(legacy&&legacy.dataset.sharedDefinitionId!==id)legacy.dataset.sharedDefinitionId=id;
  let m=models.get(id);
  if(!m){
   const initial=legacy||p,saved=initial.__linkedDefinitionData;
   m={id,state:structuredClone(saved?.state||initial.__linkedInitialState||capture(initial)),revision:0,bus:saved?.bus||'shared-audio:'+id,name:saved?.name||ensureMasterName(initial,getPanels()),serial:saved?.serial||Number(initial.dataset.instanceSerial)||0,views:new Set()};
   models.set(id,m);
   m.representative=initial;
   Object.defineProperty(m,'source',{get:()=>{if(m.representative?.isConnected!==false)return m.representative;return m.representative=[...m.views].map(getMaster).find(q=>q?.isConnected!==false&&q?.dataset.sharedDefinitionId===id);}});
   setToyVolume(m.bus,saved?.volume??getToyVolumeRaw(audioId(initial)));setToyMuted(m.bus,saved?.muted??isToyMuted(audioId(initial)));
  }
  m.views.add(p.id);p.__sharedToyDefinition=m;p.__sharedToyState=m.state;return m;
 }
 const root=p=>model(p)?.source;
 const family=p=>{if(!p?.dataset.sharedDefinitionId&&!p?.dataset.masterToyId)return getPanels().filter(q=>q===p||q.dataset.masterToyId===p?.id);const m=model(p);return m?getPanels().filter(q=>q.isConnected!==false&&(q.dataset.sharedDefinitionId===m.id||q.dataset.masterToyId===m.source?.id)):[];};
 const reveal=createRelationshipReveal({getPanels,getMaster});
 function install(p){
  if(bound.has(p))return;bound.add(p);
  const own={};for(const key of ['__sequencerSchedule','__sequencerEventsInWindow','__sequencerScheduleEvent']){
   Object.defineProperty(p,key,{configurable:true,get(){const source=root(p),m=model(p),driver=m?.playbackEditor?.isConnected?m.playbackEditor:source,fn=providers.get(driver)?.[key];return typeof fn==='function'?(...args)=>{
    const occurrence=getCurrentPlaybackOccurrence();
    if(key!=='__sequencerEventsInWindow'&&patterns.has(driver))driver.__seqPatternActive=m.sharedPattern||patterns.get(driver)||null;
    return withPlaybackOccurrence({...occurrence,instanceToyId:p.id,masterToyId:source.id,sharedDefinitionId:m.id,sourceAudioToyId:m.bus},()=>fn(...args));
   }:undefined;},set:fn=>{own[key]=fn;}});
  }
  providers.set(p,own);
  for(const type of ['drawgrid:update','loopgrid:update','toy:instrument','toy-instrument','toy:role','toy:transpose'])p.addEventListener(type,e=>{if(e.detail?.activityOnly)return;queueMicrotask(()=>edit(p));});
  for(const type of ['input','change','click','pointerup'])p.addEventListener(type,()=>queueMicrotask(()=>edit(p)));
 }
 // Preserve the already-initialized provider before replacing its accessors.
 function bind(p){if(bound.has(p))return;const own=Object.fromEntries(['__sequencerSchedule','__sequencerEventsInWindow','__sequencerScheduleEvent'].map(k=>[k,p[k]])),initial=p.__seqPattern;let revision=p.__seqRev||0;install(p);Object.assign(providers.get(p),own);patterns.set(p,initial);
  Object.defineProperty(p,'__seqRev',{configurable:true,get:()=>model(p)?.revision||revision,set:value=>{revision=value;}});
  Object.defineProperty(p,'__seqPattern',{configurable:true,get:()=>{const m=model(p),driver=m?.playbackEditor?.isConnected?m.playbackEditor:root(p);return m?.sharedPattern||patterns.get(driver);},set:value=>patterns.set(p,value)});
 }
 async function hydrate(p,m){
  if(applying.has(p))return;applying.add(p);const revision=m.revision;
  try{
   if(p.dataset.toy==='drawgrid')while(!p.__drawToy&&p.isConnected)await new Promise(resolve=>setTimeout(resolve,0));
   if(p.isConnected)await apply(p,structuredClone(m.state));
  }finally{applying.delete(p);delete p.__linkedInitialState;if(m.revision!==revision)void hydrate(p,m);}
 }
 function presentation(p,m){
  m.views.add(p.id);p.__sharedToyDefinition=m;p.__sharedToyState=m.state;
  const name=m.name,label=p.querySelector('.master-name,.instance-name'),header=p.querySelector('.toy-header');
  const volume=getToyVolumeRaw(m.bus),muted=isToyMuted(m.bus),number=p.dataset.linkedCopyNumber||p.dataset.instanceNumber||'',text=name+(number?'.'+number:'');
  const key=JSON.stringify([m.id,m.revision,name,number,volume,muted]);
  const previous=presentations.get(p);
  if(previous?.key===key&&previous.header===header&&previous.label===label&&(!label||label.textContent===text)&&(!header||header.querySelector('.linked-copy-marker')))return;
  presentations.set(p,{key,header,label});
  p.dataset.sharedDefinitionId=m.id;p.dataset.linkedView='1';
  for(const key of ['instrument','musicalRole','localTranspose','instrumentPitchShift','instrumentNote','instrumentOctave'])if(m.state[key]!=null)p.dataset[key]=String(m.state[key]);
  if(p.dataset.toy==='drawgrid'&&m.state.steps)p.dataset.steps=String(m.state.steps);
  if(p.dataset.instanceNumber&&!p.dataset.linkedCopyNumber)p.dataset.linkedCopyNumber=p.dataset.instanceNumber;
  if(label)label.textContent=text;
  if(header&&!header.querySelector('.linked-copy-marker')){const marker=document.createElement('span');marker.className='linked-copy-marker';marker.textContent='↔';marker.title='Linked Copy';marker.setAttribute('aria-label','Linked Copy');header.append(marker);}
  linkToyAudioBus(audioId(p),m.bus);p.dataset.toyVolume=String(volume);p.dataset.toyMuted=String(muted);syncVolumeUI(p,{volume,muted});
 }
 function edit(p){
  if(paused||applying.has(p)||!p.isConnected)return;
  const members=family(p);if(members.length<2&&!p.dataset.sharedDefinitionId)return;const m=model(p),state=capture(p);
  if(JSON.stringify(state)===JSON.stringify(m.state))return;
  m.state=structuredClone(state);m.revision++;m.playbackEditor=p;m.sharedPattern=patterns.get(p);for(const view of members)view.__sharedToyState=m.state;
  for(const peer of members){presentation(peer,m);if(peer!==p){void hydrate(peer,m);peer.classList.remove('linked-edit-flash');void peer.offsetWidth;peer.classList.add('linked-edit-flash');setTimeout(()=>peer.classList.remove('linked-edit-flash'),650);}}
  changed();
 }
 function prepare(){
  reveal.prepare();if(paused)return;
  for(const p of getPanels())if(p.dataset.sharedDefinitionId||p.dataset.masterToyId||family(p).length>1){bind(p);presentation(p,model(p));}
 }
 function create(masterOrId,options={}){
  let source=root(typeof masterOrId==='string'?getMaster(masterOrId):masterOrId);if(!source)throw new Error('Missing linked definition.');
  const m=model(source);bind(source);
  // A new family starts at .1/.2; old copy suffixes stay untouched.
  presentation(source,m);
  const p=createView(source,options);bind(p);
  p.dataset.masterToyId=source.id;p.dataset.instanceNumber=String(options.instanceNumber||++m.serial);m.serial=Math.max(m.serial,Number(p.dataset.instanceNumber));
  p.dataset.linkedCopyNumber=String(options.linkedCopyNumber||p.dataset.instanceNumber);
  for(const key of ['autoArrangeOwner','structureInstanceId','structureMasterChildId'])if(options[key])p.dataset[key]=options[key];
  p.dataset.sharedDefinitionId=options.sharedDefinitionId||m.id;
  source.dataset.instanceSerial=String(Math.max(Number(source.dataset.instanceSerial)||0,Number(p.dataset.instanceNumber)));
  presentation(p,m);void hydrate(p,m);register(p);changed();if(options.focus)focus(p);return p;
 }
 function beforeDelete(p){
  const source=root(p),members=family(p).filter(q=>q!==p),record=model(p);record?.views.delete(p.id);
  if(!members.length){if(record)models.delete(record.id);return;}
  if(!source||source!==p)return;
  const next=members.sort((a,b)=>Number(a.dataset.linkedCopyNumber)-Number(b.dataset.linkedCopyNumber))[0],m=model(p);
  delete next.dataset.masterToyId;delete next.dataset.instanceNumber;
  delete next.dataset.autoArrangeOwner;
  next.dataset.toyName=source.dataset.toyName;next.dataset.instanceSerial=source.dataset.instanceSerial;
  for(const key of ['autoArrangeOrigin','autoArrangeFill','autoArrangeFillHeartbeat'])if(source.dataset[key])next.dataset[key]=source.dataset[key];
  for(const q of members)if(q!==next)q.dataset.masterToyId=next.id;
  m.views.delete(p.id);m.representative=next;next.__sharedToyState=m.state;if(m.playbackEditor===p)m.playbackEditor=next;for(const q of members)presentation(q,m);
  return {from:p.id,to:next.id,sharedDefinitionId:m.id};
 }
 for(const type of ['toy-volume','toy-mute'])window.addEventListener(type,e=>{
  if(paused)return;const p=getPanels().find(p=>p.id===e.detail?.toyId||p.dataset.toyid===e.detail?.toyId);if(!p||family(p).length<2)return;
  const m=model(p);if(type==='toy-volume')setToyVolume(m.bus,e.detail.value);else setToyMuted(m.bus,e.detail.muted);
  for(const peer of family(p))presentation(peer,m);changed();
 });
 return {adopt:p=>{const m=model(p);bind(p);if(!p.dataset.linkedCopyNumber)p.dataset.linkedCopyNumber=String(++m.serial);p.dataset.instanceSerial=String(m.serial);presentation(p,m);return p;},definitions:()=>[...models.values()],create,prepare,canDelete:()=>true,hasPeers:p=>family(p).length>1,beforeDelete,removeOwned:owner=>{for(const p of [...getPanels()])if(p.dataset.masterToyId&&p.dataset.autoArrangeOwner===owner)remove(p);},reveal:reveal.show,pause:()=>{paused=true;models.clear();for(const p of getPanels())delete p.__sharedToyState;},resume:()=>{models.clear();paused=false;prepare();for(const p of getPanels())if(p.dataset.sharedDefinitionId)void hydrate(p,model(p));},edit};
}
// TODO: Make Independent — clone the authored definition for one visible copy.
