import {surfaceVoice} from './receiver-surface.js';
// Shared authored spatial schema. Existing stores are adapters, not duplicate owners.
export const BOARD_OBJECT_VERSION=1;
let idSerial=0;
// LAN HTTP pages may lack randomUUID. These IDs need uniqueness, not secrecy.
export function createBoardObjectId(prefix){
 const suffix=globalThis.crypto?.randomUUID?.()??`${Date.now().toString(36)}-${(++idSerial).toString(36)}-${Math.random().toString(36).slice(2)}`;
 return `${prefix}${suffix}`;
}
export const CAPABILITIES=Object.freeze(['draggable','physicsBody','triggerEmitter','triggerReceiver','pitchSource','instrumentSource','loopSource','playable','decorative']);
const kinds={
 cube:s=>({draggable:{},physicsBody:{shape:'box'},triggerReceiver:{},pitchSource:{midi:s.pitch}}),
 cannon:s=>({draggable:{},triggerEmitter:{},instrumentSource:{instrumentId:s.instrument}}),
 ripple:s=>({draggable:{},triggerEmitter:{},instrumentSource:{instrumentId:s.instrument}}),
 drum:s=>({draggable:{},playable:{midi:s.pitch??60},instrumentSource:{instrumentId:s.instrument},triggerReceiver:{soundSource:'receiver'},loopSource:{}}),
 'simple-paint':()=>({draggable:{},loopSource:{}}),
 'decorative-art':()=>({draggable:{},decorative:{}}),
 ball:()=>({draggable:{},physicsBody:{shape:'circle'}}),
 string:()=>({draggable:{},playable:{},triggerReceiver:{soundSource:'receiver'},instrumentSource:{}}),
 strum:()=>({draggable:{},playable:{},triggerReceiver:{soundSource:'receiver'},instrumentSource:{}}),
};
export function createBoardObject(kind,{id,transform={x:0,y:0,rotation:0},bounds={},appearance={},references={},owns=[],authoredState={},capabilities}={}){
 if(!kinds[kind])throw Error(`Unknown board object kind: ${kind}`);
 if(capabilities&&Object.keys(capabilities).some(key=>!CAPABILITIES.includes(key)))throw Error('Unknown board object capability');
 if(!id)id=createBoardObjectId(`board:${kind}:`);
 return structuredClone({version:BOARD_OBJECT_VERSION,id,kind,transform:{rotation:0,...transform},bounds,appearance,capabilities:capabilities??kinds[kind](authoredState),references:{cubeIds:[],triggerIds:[],...references},owns,authoredState});
}
export const boardObjectKinds=Object.freeze(Object.keys(kinds));
export function physicalBoardObject(o){
 return createBoardObject(o.kind,{id:o.id,transform:{x:o.x,y:o.y,rotation:o.rotation||0},bounds:o.kind==='cube'?{width:o.width,height:o.height}:{radius:o.radius},appearance:o.color?{color:o.color}:{},authoredState:o.kind==='cube'?{pitch:o.sourceMidi}:{}});
}
export function containerBoardObject(c){
 const kind=c.presentation.type==='simple-bouncer'?'cannon':c.presentation.type==='simple-draw'?'simple-paint':null;
 if(!kind)return null;
 const d=c.interactionData||{};
 return createBoardObject(kind,{id:c.id,transform:{x:c.bounds.x,y:c.bounds.y},bounds:{width:c.bounds.width,height:c.bounds.height},owns:[...c.internalObjectIds],references:{cubeIds:d.cubeIds||[],triggerIds:d.ballId?[d.ballId]:[]},authoredState:kind==='cannon'?{ballMode:d.ballMode||'normal',direction:d.direction||{x:1,y:0},speed:Math.hypot(d.launch?.vx||0,d.launch?.vy||0)||840,instrument:d.instrument||'KALIMBA',phraseLength:d.bars||1}: {contentIds:[...c.internalToyIds]}});
}
export function artBoardObject(panel){
 return createBoardObject('decorative-art',{id:panel.id,transform:{x:parseFloat(panel.style.left)||0,y:parseFloat(panel.style.top)||0},bounds:{width:parseFloat(panel.style.width)||220,height:parseFloat(panel.style.height)||220},authoredState:{artKind:panel.dataset.artToy}});
}
export function referenceIntegrity(object,get){
 return Object.entries(object.references).flatMap(([role,ids])=>ids.filter(id=>!get(id)).map(id=>({id,role,status:'missing'})));
}
// No kind checks: receiver sound policy owns pitch/chord, timbre and gain.
// The default Cube policy retains receiver pitch plus emitter instrument.
export function resolveBoardInteraction(emitter,receiver,timeSeconds,contact={}){
 const e=emitter?.capabilities,r=receiver?.capabilities;
 if(e?.triggerEmitter&&r?.triggerReceiver?.soundSource==='receiver'){
  const direct=resolvePlayableActivation(receiver,timeSeconds,contact);if(!direct)return null;
  return {...direct,timeSeconds,instrument:direct.instrument,emitterId:emitter.id,receiverId:receiver.id,soundSource:'receiver',sourceId:receiver.id,volume:direct.volume,muted:direct.muted};
 }
 if(!e?.triggerEmitter||!r?.triggerReceiver||!Number.isFinite(r.pitchSource?.midi)||typeof e.instrumentSource?.instrumentId!=='string'||!e.instrumentSource.instrumentId.trim()||!Number.isFinite(timeSeconds))return null;
 return {timeSeconds,sourceMidi:r.pitchSource.midi,instrument:e.instrumentSource.instrumentId,emitterId:emitter.id,receiverId:receiver.id};
}

// Direct performance is independent of trigger contacts and transport clocks.
export function resolvePlayableActivation(object,timeSeconds,contact={}){
 const c=object?.capabilities,instrument=c?.instrumentSource?.instrumentId;
 if(!c?.playable||typeof instrument!=='string'||!instrument.trim()||!Number.isFinite(timeSeconds))return null;
 const voice=surfaceVoice(object,contact),sourceMidi=voice?.sourceMidi??c.playable.midi??60,volume=object.authoredState?.volume??1,muted=object.authoredState?.muted??false;
 if(!Number.isFinite(sourceMidi)||!Number.isFinite(volume)||volume<0||volume>1)return null;
 return {...(voice||{}),sourceId:object.id,instrument,sourceMidi,volume,muted:!!muted,timeSeconds};
}
