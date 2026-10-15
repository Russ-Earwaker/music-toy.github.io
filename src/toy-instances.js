import {createRelationshipReveal} from './toy-relationship-reveal.js';
import {toyLoopLengthTicks} from './drawgrid/dg-pattern-length.js';
import {ensurePlaybackInstance,getPlaybackInstance} from './playback-instances.js';
import {getCurrentPlaybackOccurrence,withPlaybackOccurrence} from './playback-context.js';
import {setToyVolume,setToyMuted,getToyVolumeRaw,isToyMuted} from './audio-core.js';
import {instrumentColour} from './instrument-colours.js';

export function attachInstancePlayback(panel,master,sync=()=>{}){
 for(const key of ['__seqRev','__seqPattern','__gridState','__drawToy'])Object.defineProperty(panel,key,{configurable:true,get:()=>master[key]});
 for(const key of ['__sequencerSchedule','__sequencerEventsInWindow','__sequencerScheduleEvent'])Object.defineProperty(panel,key,{configurable:true,get:()=>typeof master[key]==='function'? (...args)=>{
  sync(panel);const occurrence=getCurrentPlaybackOccurrence();
  if(key!=='__sequencerEventsInWindow'&&master.__seqPattern!==undefined)master.__seqPatternActive=master.__seqPattern||null;
  return withPlaybackOccurrence(occurrence?{...occurrence,instanceToyId:panel.id,masterToyId:master.id,sourceAudioToyId:master.__audioToyId||master.dataset?.audiotoyid||master.id}:null,()=>master[key](...args));
 }:undefined});
}

export const toyFamilyName=type=>({drawgrid:'Draw',loopgrid:'Rhythm','loopgrid-drum':'Rhythm',bouncer:'Bouncer',rippler:'Rippler',chordwheel:'Wheel'}[type] || 'Toy');
export function ensureMasterName(panel,panels){
 if(panel.dataset.toyName)return panel.dataset.toyName;
 const prefix=toyFamilyName(panel.dataset.toy),used=new Set(panels.filter(p=>!p.dataset.masterToyId).map(p=>p.dataset.toyName));
 let index=1;while(used.has(`${prefix} ${index}`))index++;
 return panel.dataset.toyName=`${prefix} ${index}`;
}
export function nextInstanceNumber(master,panels){
 const highest=Math.max(0,Number(master.dataset.instanceSerial)||0,...panels.filter(p=>p.dataset.masterToyId===master.id).map(p=>Number(p.dataset.instanceNumber)||0));
 master.dataset.instanceSerial=String(highest+1);return highest+1;
}
export function validateInstanceLinks(snapshot){
 const toys=snapshot?.toys||[],byId=new Map(toys.map(t=>[t.id,t])),numbers=new Set();
 if(toys.some(t=>t.masterToyId)&&byId.size!==toys.length)throw new Error('Duplicate linked toy identity');
 for(const toy of toys.filter(t=>t.masterToyId)){
  const master=byId.get(toy.masterToyId),number=Number(toy.instanceNumber),key=toy.masterToyId+'|'+number;
  if(!master||master.masterToyId)throw new Error('Missing or invalid Master: '+toy.masterToyId);
  if(!Number.isInteger(number)||number<1||numbers.has(key))throw new Error('Invalid Instance number: '+toy.id);
  numbers.add(key);
 }
 return snapshot;
}
// Pure, idempotent scene migration. Each old use becomes its own ordinary leaf.
export function migrateSourceUses(snapshot){
 if(!snapshot?.connections?.some(c=>c.to.portId==='pattern'))return snapshot;
 const snap=structuredClone(snapshot),masters=new Map(snap.toys.map(t=>[t.id,t])),ids=new Set(snap.toys.map(t=>t.id));
 for(const edge of snap.connections){
  if(edge.to.portId!=='pattern')continue;
  const master=masters.get(edge.to.objectId);if(!master)throw new Error(`Missing Master for saved use: ${edge.to.objectId}`);
  const n=Math.max(Number(master.instanceSerial)||0,...snap.toys.filter(t=>t.masterToyId===master.id).map(t=>Number(t.instanceNumber)||0))+1;
  master.instanceSerial=n;
  let id=`instance:${edge.id}`;while(ids.has(id))id+=':1';ids.add(id);
  const parent=snap.structureToys?.find(s=>s.id===edge.from.objectId),owner=parent?.autoArrange?.owner;
  snap.toys.push({id,type:master.type,masterToyId:master.id,instanceNumber:n,...(owner?{autoArrangeOwner:owner}:{}),ownerArtToyId:master.ownerArtToyId||null,
   ui:{left:`${(parent?.x||0)+440}px`,top:`${(parent?.y||0)+Number(edge.from.portId.split(':')[1]||0)*220}px`,width:'240px',height:'160px'},state:{}});
  edge.to={objectId:id,portId:'input'};
 }
 return snap;
}

export function createToyInstanceController({getPanels,getMaster,register,changed,focus,remove}){
 const reveal=createRelationshipReveal({getPanels,getMaster});
 const masters=()=>getPanels().filter(p=>!p.dataset.masterToyId);
 function sync(panel){
  const master=getMaster(panel.dataset.masterToyId);if(!master)return false;
  const name=ensureMasterName(master,masters());
  panel.dataset.toyName=`${name}.${panel.dataset.instanceNumber}`;
  const label=panel.querySelector('.instance-name');if(label.textContent!==panel.dataset.toyName)label.textContent=panel.dataset.toyName;
  const instrument=master.dataset.instrument||'';
  const instrumentLabel=panel.querySelector('.instance-instrument');if(instrumentLabel.textContent!==instrument)instrumentLabel.textContent=instrument;
  // Playback policy remains source-owned; these are derived presentation values.
  for(const key of ['steps','instrument','musicalRole','localTranspose','toyVolume','toyMuted','instrumentPitchShift']){
   if(master.dataset[key]!=null){if(panel.dataset[key]!==master.dataset[key])panel.dataset[key]=master.dataset[key];}else if(key in panel.dataset)delete panel.dataset[key];
  }
  const colourKey=instrument+'|'+master.style.cssText+'|'+master.className;
  if(panel.__masterColourKey!==colourKey){
   panel.style.setProperty('--instrument-colour',instrumentColour(instrument));panel.dataset.instrumentColour=instrumentColour(instrument);
   const styles=getComputedStyle(master);
   for(const key of ['--toy-color','--toy-accent','--instrument-color','--toy-header-color'])panel.style.setProperty(key,styles.getPropertyValue(key));
   const header=master.querySelector('.toy-header');if(header)panel.querySelector('.toy-header').style.background=getComputedStyle(header).background;
   panel.__masterColourKey=colourKey;
  }
  const audioId=master.__audioToyId||master.dataset.audiotoyid||master.id;
  const volume=getToyVolumeRaw(audioId),muted=isToyMuted(audioId);
  if(panel.__masterVolume!==volume){setToyVolume(panel.id,volume);panel.__masterVolume=volume;}
  if(panel.__masterMuted!==muted){setToyMuted(panel.id,muted);panel.__masterMuted=muted;}
  ensurePlaybackInstance(panel.id,{loopLengthTicks:toyLoopLengthTicks(master,getPlaybackInstance(master.id))});
  return true;
 }
 function create(masterOrId,options={}){
  let master=typeof masterOrId==='string'?getMaster(masterOrId):masterOrId;
  if(master?.dataset.masterToyId)master=getMaster(master.dataset.masterToyId);
  if(!master)throw new Error('Cannot create an Instance without its Master.');
  const panel=document.createElement('section');panel.className=`toy-panel toy-instance ${master.dataset.toy}-instance`;
  panel.id=options.id||`instance-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  panel.dataset.toy=master.dataset.toy;panel.dataset.masterToyId=master.id;
  panel.dataset.positionSource='auto';
  panel.dataset.instanceNumber=String(options.instanceNumber||nextInstanceNumber(master,getPanels()));
  master.dataset.instanceSerial=String(Math.max(Number(master.dataset.instanceSerial)||0,Number(panel.dataset.instanceNumber)));
  if(options.autoArrangeOwner)panel.dataset.autoArrangeOwner=options.autoArrangeOwner;
  if(options.structureInstanceId)panel.dataset.structureInstanceId=options.structureInstanceId;
  if(options.structureMasterChildId)panel.dataset.structureMasterChildId=options.structureMasterChildId;
  if(master.dataset.artOwnerId)panel.dataset.artOwnerId=master.dataset.artOwnerId;
  Object.assign(panel.style,{position:'absolute',width:'240px',height:'160px',left:options.ui?.left||`${(parseFloat(master.style.left)||0)+master.offsetWidth+80}px`,top:options.ui?.top||master.style.top||'0px'});
  panel.innerHTML='<header class="toy-header" data-drag-handle="1"><strong class="instance-name"></strong><span class="instance-marker">INSTANCE</span></header><div class="toy-body instance-body"><span class="instance-instrument"></span><div class="instance-actions"><button type="button" class="toy-btn instance-duplicate">Duplicate</button><button type="button" class="toy-btn instance-master">See Master</button></div></div>';
  panel.querySelector('.instance-duplicate').addEventListener('click',e=>{e.stopPropagation();create(master,{focus:true,ui:{left:`${parseFloat(panel.style.left)+300}px`,top:panel.style.top}});});
  panel.querySelector('.instance-master').addEventListener('click',e=>{e.stopPropagation();reveal.show(panel);focus(master);});
  panel.addEventListener('dblclick',e=>{e.stopPropagation();reveal.show(panel);focus(master);});
  panel.__sequencerStep=()=>{panel.classList.add('instance-playing');clearTimeout(panel.__instanceFlash);panel.__instanceFlash=setTimeout(()=>panel.classList.remove('instance-playing'),140);};
  // Read the source at each unscheduled call. Never copy authored state or call
  // its visual step: the Instance is the visible playback object.
  attachInstancePlayback(panel,master,sync);
  (options.containerEl||master.parentElement).append(panel);sync(panel);register(panel);changed();if(options.focus)focus(panel);return panel;
 }
 function prepare(){reveal.prepare();for(const p of getPanels())if(p.dataset.masterToyId)sync(p);else{const name=ensureMasterName(p,masters());const label=p.querySelector('.master-name');if(label&&label.textContent!==name)label.textContent=name;}}
 function canDelete(panel){return !!panel.dataset.masterToyId||!getPanels().some(p=>p.dataset.masterToyId===panel.id);}
 function removeOwned(owner){for(const p of [...getPanels()])if(p.dataset.masterToyId&&p.dataset.autoArrangeOwner===owner)remove(p);}
 return {create,prepare,canDelete,removeOwned,reveal:reveal.show};
}
