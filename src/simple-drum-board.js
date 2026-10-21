import {decorateCircularControl} from './circular-control.js';
import {expressiveControl,setExpressiveControlsVisible} from './expressive-toy-chrome.js';
import {openInstrumentPicker,closeInstrumentPicker} from './instrument-picker.js';
import {getDisplayNameForId} from './instrument-catalog.js';
import {installVolumeUI,syncVolumeUI} from './baseToy/volume-ui.js';
import {setToyVolume,setToyMuted} from './audio-core.js';
import {installTapOrDrag} from './tap-or-drag.js';
import {DRUM_SIZE} from './simple-drum.js';

export function installSimpleDrumBoard({objects,controller,getWorld,getViewport,screenToWorld,unlock,canInteract=()=>true,onArm=()=>{},onDirty=()=>{}}){
 const root=document.createElement('div');root.className='simple-drum-layer';getWorld().append(root);
 const cards=new Map();let armed=false,placement=null;
 function cancel(){armed=false;placement=null;document.body.classList.remove('simple-drum-armed');}
 function arm(){if(!canInteract())return false;onArm();armed=!armed;document.body.classList.toggle('simple-drum-armed',armed);return armed;}
 async function play(id){
  await unlock();if(!objects.get(id)||!controller.activate(id))return;
  const entry=cards.get(id);if(!entry)return;entry.animation?.cancel();
  entry.animation=entry.pad.animate?.([{transform:'scale(.9)',filter:'brightness(1.7)'},{transform:'scale(1)',filter:'brightness(1)'}],{duration:140,easing:'ease-out'});
 }
 function render(){
  const present=new Set();for(const o of objects.list()){
   present.add(o.id);let entry=cards.get(o.id);
   if(!entry){
    const card=document.createElement('section');card.id=o.id;card.className='simple-drum-object expressive-toy';card.setAttribute('aria-label','Simple Drum');card.dataset.controlsVisible='0';
    const handle=expressiveControl(document.createElement('button'),{kind:'drag',label:'Simple Drum controls'});handle.setAttribute('aria-expanded','false');card.append(handle);
    const pad=document.createElement('button');pad.type='button';pad.className='simple-drum-pad';pad.setAttribute('aria-label','Play drum');pad.title='Tap to play; drag to move';pad.textContent='DRUM';card.append(pad);
    const controls=document.createElement('div');controls.className='expressive-toy-controls simple-drum-controls';card.append(controls);
    const instrument=decorateCircularControl(document.createElement('button'),{label:'Choose drum instrument',asset:'T_ButtonInstruments'}),name=document.createElement('span');name.className='drum-instrument-name';instrument.append(name);controls.append(instrument);
    let choosing=false;
    instrument.onclick=async()=>{if(choosing)return;choosing=true;try{const choice=await openInstrumentPicker({panel:card,toyId:o.id});if(choice&&objects.get(o.id))objects.update(o.id,{instrument:choice.value||choice});}finally{choosing=false;}};
    card.dataset.toyVolume=String(o.authoredState.volume);card.dataset.toyMuted=o.authoredState.muted?'1':'0';
    const volume=document.createElement('div');volume.className='art-toy-volume';controls.append(volume);installVolumeUI(volume,{panel:card});
    const gesture=onTap=>({getPosition:()=>objects.get(o.id)?.transform||o.transform,screenToWorld,canInteract,
     move:(x,y)=>objects.update(o.id,{x,y}),onTap,
     onDragStart:e=>window.ToySpawner?.beginPanelDrag?.({panel:card,pointerId:e.pointerId,remove:()=>objects.remove(o.id)}),
     onDragMove:e=>window.ToySpawner?.updatePanelDrag?.({clientX:e.clientX,clientY:e.clientY}),
     onDragEnd:(e,canceled)=>window.ToySpawner?.endPanelDrag?.({clientX:e.clientX,clientY:e.clientY,pointerId:e.pointerId,canceled}),
    });
    const offPad=installTapOrDrag(pad,gesture(()=>void play(o.id)));
    const offHandle=installTapOrDrag(handle,gesture(()=>setExpressiveControlsVisible(card,card.dataset.controlsVisible!=='1')));
    card.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape')setExpressiveControlsVisible(card,false);};
    root.append(card);entry={card,pad,dispose(){offPad();offHandle();closeInstrumentPicker(card);entry.animation?.cancel();card.remove();}};cards.set(o.id,entry);
   }
   const {card}=entry;Object.assign(card.style,{left:o.transform.x+'px',top:o.transform.y+'px',width:DRUM_SIZE+'px',height:DRUM_SIZE+'px'});card.dataset.instrument=o.authoredState.instrument;
   card.querySelector('.drum-instrument-name').textContent=getDisplayNameForId(o.authoredState.instrument)||o.authoredState.instrument;
   setToyVolume(o.id,o.authoredState.volume);setToyMuted(o.id,o.authoredState.muted);syncVolumeUI(card,{volume:o.authoredState.volume,muted:o.authoredState.muted});
  }
  for(const [id,entry]of cards)if(!present.has(id)){entry.dispose();cards.delete(id);}
 }
 const down=e=>{
  if(e.target.closest?.('.toy-spawner-art,.toy-spawner-logic,.toy-spawner-game,.palette-handle')){cancel();return;}
  if(!armed||!canInteract()||e.button>0||placement||!getViewport().contains(e.target)||e.target.closest?.('button,input,select,a,.toy-panel,.art-toy-panel,.container-toy,.heartbeat-toy,.simple-ripple-object,.simple-drum-object'))return;
  e.preventDefault();e.stopImmediatePropagation();placement={pointerId:e.pointerId,x:e.clientX,y:e.clientY};getViewport().setPointerCapture?.(e.pointerId);
 };
 const up=e=>{
  if(e.pointerId!==placement?.pointerId)return;const p=placement;placement=null;e.preventDefault();e.stopImmediatePropagation();
  if(Math.hypot(e.clientX-p.x,e.clientY-p.y)<6)objects.create(screenToWorld({x:e.clientX,y:e.clientY}));
 };
 const interrupted=()=>{placement=null;};
 const escape=e=>{if(e.key==='Escape')cancel();};
 const volumeChanged=e=>{const id=e.detail?.toyId;if(objects.get(id))objects.update(id,e.type==='toy-volume'?{volume:e.detail.value}:{muted:e.detail.muted});};
 const off=objects.subscribe(()=>{render();onDirty();});
 window.addEventListener('pointerdown',down,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',interrupted);window.addEventListener('blur',cancel);window.addEventListener('keydown',escape);window.addEventListener('scene:new',cancel);window.addEventListener('scene:load',cancel);window.addEventListener('toy-volume',volumeChanged);window.addEventListener('toy-mute',volumeChanged);
 render();
 return {arm,cancel,get active(){return armed;},dispose(){cancel();off();for(const entry of cards.values())entry.dispose();root.remove();window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',interrupted);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',escape);window.removeEventListener('scene:new',cancel);window.removeEventListener('scene:load',cancel);window.removeEventListener('toy-volume',volumeChanged);window.removeEventListener('toy-mute',volumeChanged);}};
}
