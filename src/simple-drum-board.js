import {drumRingPoint} from './simple-drum-ring.js';
import {decorateCircularControl} from './circular-control.js';
import {expressiveControl,setExpressiveControlsVisible} from './expressive-toy-chrome.js';
import {openInstrumentPicker,closeInstrumentPicker} from './instrument-picker.js';
import {getDisplayNameForId} from './instrument-catalog.js';
import {installVolumeUI,syncVolumeUI} from './baseToy/volume-ui.js';
import {setToyVolume,setToyMuted} from './audio-core.js';
import {installTapOrDrag} from './tap-or-drag.js';
import {DRUM_SIZE} from './simple-drum.js';
import {createDrumSet} from './simple-drum-set.js';
import {triggerCreationPoint} from './trigger-starter-cubes.js';

export function installSimpleDrumBoard({objects,controller,getWorld,getViewport,screenToWorld,unlock,canInteract=()=>true,onArm=()=>{},onDirty=()=>{}}){
 const root=document.createElement('div');root.className='simple-drum-layer';getWorld().append(root);
 const cards=new Map();let armed=false,placement=null,frame;
 function positionControls(card){
  if(card.dataset.controlsVisible!=='1')return;
  const controls=card.querySelector('.simple-drum-controls');controls.style.top='118px';controls.style.bottom='auto';controls.style.left='0px';
  const rect=controls.getBoundingClientRect(),scale=card.getBoundingClientRect().width/DRUM_SIZE||1;
  if(rect.bottom>window.innerHeight-16){controls.style.top='auto';controls.style.bottom='calc(100% + 18px)';}
  if(rect.right>window.innerWidth-16)controls.style.left=(window.innerWidth-16-rect.right)/scale+'px';
 }
 function cancel(){armed=false;placement=null;document.body.classList.remove('simple-drum-armed');}
 function arm(){if(!canInteract())return false;onArm();armed=!armed;document.body.classList.toggle('simple-drum-armed',armed);return armed;}
 async function play(id){
  await unlock();if(objects.get(id))controller.activate(id);
 }
 function hit({sourceId:id,eventTick,activationSource}){
  const entry=cards.get(id);if(!entry)return;entry.animation?.cancel();
  if(activationSource!=='trigger'){const o=objects.get(id),slot=(eventTick%(o.authoredState.periodLoops*384))/48;entry.card.querySelectorAll('.has-hit').forEach(marker=>{if(Number(marker.dataset.slot)===slot)marker.animate?.([{opacity:1,strokeWidth:5},{opacity:.95,strokeWidth:1}],{duration:220});});}
  entry.animation=entry.pad.animate?.([{transform:'scale(.9)',filter:'brightness(1.7)'},{transform:'scale(1)',filter:'brightness(1)'}],{duration:140,easing:'ease-out'});
 }
 function render(){
  const present=new Set();for(const o of objects.list()){
   present.add(o.id);let entry=cards.get(o.id);
   if(!entry){
    const card=document.createElement('section');card.id=o.id;card.className='simple-drum-object expressive-toy';card.setAttribute('aria-label','Simple Drum');card.dataset.controlsVisible='0';
    const handle=expressiveControl(document.createElement('button'),{kind:'drag',label:'Simple Drum controls'});handle.setAttribute('aria-expanded','false');card.append(handle);
    const pad=document.createElement('button');pad.type='button';pad.className='simple-drum-pad';pad.setAttribute('aria-label','Play drum');pad.title='Tap to add a looping hit; drag to move';pad.textContent='DRUM';card.append(pad);
    const controls=document.createElement('div');controls.className='expressive-toy-controls simple-drum-controls';card.append(controls);
    const instrument=decorateCircularControl(document.createElement('button'),{label:'Choose drum instrument',asset:'T_ButtonInstruments'}),name=document.createElement('span');name.className='drum-instrument-name';instrument.append(name);controls.append(instrument);
    let choosing=false;
    instrument.onclick=async()=>{if(choosing)return;choosing=true;try{const choice=await openInstrumentPicker({panel:card,toyId:o.id});if(choice&&objects.get(o.id))objects.update(o.id,{instrument:choice.value||choice});}finally{choosing=false;}};
    card.dataset.toyVolume=String(o.authoredState.volume);card.dataset.toyMuted=o.authoredState.muted?'1':'0';
    const volume=document.createElement('div');volume.className='art-toy-volume';controls.append(volume);installVolumeUI(volume,{panel:card});
    const length=document.createElement('label');length.className='drum-period';length.textContent='Period';
    const period=document.createElement('select');period.setAttribute('aria-label','Drum period');
    for(let i=1;i<=4;i++){const option=document.createElement('option');option.value=String(i);option.textContent=i+(i===1?' loop':' loops');period.append(option);}period.onchange=()=>objects.update(o.id,{periodLoops:Number(period.value)});length.append(period);controls.append(length);
    const clear=expressiveControl(document.createElement('button'),{kind:'clear',label:'Clear Drum pattern'});clear.classList.add('drum-clear');clear.onclick=()=>controller.clearPattern(o.id);controls.append(clear);
    const ring=document.createElementNS('http://www.w3.org/2000/svg','svg');ring.setAttribute('viewBox','0 0 128 128');ring.setAttribute('aria-label','Drum recorded rhythm');ring.classList.add('drum-ring');card.append(ring);
    const gesture=onTap=>({getPosition:()=>objects.get(o.id)?.transform||o.transform,screenToWorld,canInteract,
     move:(x,y)=>objects.update(o.id,{x,y}),onTap,
     onDragStart:e=>window.ToySpawner?.beginPanelDrag?.({panel:card,pointerId:e.pointerId,remove:()=>objects.remove(o.id)}),
     onDragMove:e=>window.ToySpawner?.updatePanelDrag?.({clientX:e.clientX,clientY:e.clientY}),
     onDragEnd:(e,canceled)=>window.ToySpawner?.endPanelDrag?.({clientX:e.clientX,clientY:e.clientY,pointerId:e.pointerId,canceled}),
    });
    const offPad=installTapOrDrag(pad,gesture(()=>void play(o.id)));
    const offHandle=installTapOrDrag(handle,gesture(()=>{setExpressiveControlsVisible(card,card.dataset.controlsVisible!=='1');positionControls(card);}));
    card.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape')setExpressiveControlsVisible(card,false);};
    root.append(card);entry={card,pad,dispose(){offPad();offHandle();closeInstrumentPicker(card);entry.animation?.cancel();card.remove();}};cards.set(o.id,entry);
   }
   const {card}=entry;Object.assign(card.style,{left:o.transform.x+'px',top:o.transform.y+'px',width:DRUM_SIZE+'px',height:DRUM_SIZE+'px'});card.dataset.instrument=o.authoredState.instrument;entry.pad.textContent=o.authoredState.label;
   card.querySelector('select').value=String(o.authoredState.periodLoops);
   const ring=card.querySelector('.drum-ring'),key=JSON.stringify([o.authoredState.periodLoops,o.authoredState.pattern.authoredNotes]);
   if(ring.dataset.pattern!==key){
    ring.dataset.pattern=key;ring.replaceChildren();
    const circle=(className,tick,radius)=>{const node=document.createElementNS('http://www.w3.org/2000/svg','circle'),p=drumRingPoint(tick,o.authoredState.periodLoops);node.setAttribute('class',className);node.setAttribute('cx',p.x);node.setAttribute('cy',p.y);node.setAttribute('r',radius);ring.append(node);return node;};
    for(let col=0;col<o.authoredState.periodLoops*8;col++){
     const active=o.authoredState.pattern.authoredNotes.some(n=>n.col===col),cell=circle('drum-slot'+(active?' has-hit':'')+(col%8===0?' bar-start':''),col*48,active?4:1.6);cell.dataset.slot=String(col);
    }
    entry.playhead=circle('drum-playhead',0,2.6);
   }
   card.querySelector('.drum-instrument-name').textContent=getDisplayNameForId(o.authoredState.instrument)||o.authoredState.instrument;
   setToyVolume(o.id,o.authoredState.volume);setToyMuted(o.id,o.authoredState.muted);syncVolumeUI(card,{volume:o.authoredState.volume,muted:o.authoredState.muted});
   positionControls(card);
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
 const offHits=controller.subscribe?.(hit)||(()=>{});
 function animate(){for(const [id,entry]of cards){const phase=controller.phase(id),o=objects.get(id),p=drumRingPoint(phase.tick,o.authoredState.periodLoops);entry.playhead.setAttribute('cx',p.x);entry.playhead.setAttribute('cy',p.y);entry.playhead.dataset.tick=String(phase.tick);}frame=requestAnimationFrame(animate);}
 window.addEventListener('pointerdown',down,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',interrupted);window.addEventListener('blur',cancel);window.addEventListener('keydown',escape);window.addEventListener('scene:new',cancel);window.addEventListener('scene:load',cancel);window.addEventListener('toy-volume',volumeChanged);window.addEventListener('toy-mute',volumeChanged);
 render();if(controller.phase)animate();
 return {arm,cancel,createSet(){if(!canInteract())return [];onArm();cancel();return createDrumSet(objects,triggerCreationPoint({viewport:getViewport(),screenToWorld}));},get active(){return armed;},dispose(){cancel();off();offHits();if(frame)cancelAnimationFrame(frame);for(const entry of cards.values())entry.dispose();root.remove();window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',interrupted);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',escape);window.removeEventListener('scene:new',cancel);window.removeEventListener('scene:load',cancel);window.removeEventListener('toy-volume',volumeChanged);window.removeEventListener('toy-mute',volumeChanged);}};
}
