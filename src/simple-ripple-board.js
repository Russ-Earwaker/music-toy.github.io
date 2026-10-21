import {decorateCircularControl} from './circular-control.js';
import {expressiveControl,setExpressiveControlsVisible} from './expressive-toy-chrome.js';
import {openInstrumentPicker,closeInstrumentPicker} from './instrument-picker.js';
import {getDisplayNameForId} from './instrument-catalog.js';
import {RIPPLE_SIZE} from './simple-ripple.js';
import {installVolumeUI,syncVolumeUI} from './baseToy/volume-ui.js';
import {setToyVolume,setToyMuted} from './audio-core.js';

// Only input/presentation lives here. Wave animation never schedules a note.
export function installSimpleRippleBoard({objects,controller,getWorld,getViewport,screenToWorld,now,unlock,canInteract=()=>true,onArm=()=>{},seedCubes=()=>{},onDirty=()=>{}}){
 const world=getWorld(),root=document.createElement('div');root.className='simple-ripple-layer';world.append(root);
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('simple-ripple-waves');root.append(svg);
 const cards=new Map(),rings=new Map();let armed=false,placement=null,frame;
 async function emit(id){await unlock();if(objects.get(id))controller.emit(id);}
 function cancel(){armed=false;placement=null;document.body.classList.remove('simple-ripple-armed');}
 function arm(){if(!canInteract())return false;onArm();armed=!armed;if(armed)seedCubes();document.body.classList.toggle('simple-ripple-armed',armed);return armed;}
 function render(){
  const present=new Set();
  for(const o of objects.list()){
   present.add(o.id);let card=cards.get(o.id);
   if(!card){
    card=document.createElement('section');card.id=o.id;card.className='simple-ripple-object expressive-toy';card.setAttribute('aria-label','Simple Ripple');card.dataset.controlsVisible='0';
    const handle=expressiveControl(document.createElement('button'),{kind:'drag',label:'Simple Ripple controls'});handle.setAttribute('aria-expanded','false');card.append(handle);
    const body=document.createElement('button');body.type='button';body.className='simple-ripple-trigger';body.setAttribute('aria-label','Ripple controls');body.title='Loops with Heartbeat';body.textContent='◎';body.onclick=()=>{void unlock();setExpressiveControlsVisible(card,card.dataset.controlsVisible!=='1');};card.append(body);
    const controls=document.createElement('div');controls.className='expressive-toy-controls simple-ripple-controls';card.append(controls);
    const instrument=decorateCircularControl(document.createElement('button'),{label:'Choose ripple instrument',asset:'T_ButtonInstruments'}),name=document.createElement('span');name.className='ripple-instrument-name';instrument.append(name);controls.append(instrument);
    let choosing=false;
    instrument.onclick=async()=>{if(choosing)return;choosing=true;try{const choice=await openInstrumentPicker({panel:card,toyId:o.id});if(choice&&objects.get(o.id))objects.update(o.id,{instrument:choice.value||choice});}finally{choosing=false;}};
    card.dataset.toyVolume=String(o.authoredState.volume);card.dataset.toyMuted=o.authoredState.muted?'1':'0';
    const volume=document.createElement('div');volume.className='art-toy-volume';controls.append(volume);installVolumeUI(volume,{panel:card});
    const length=document.createElement('label');length.className='ripple-length';length.textContent='Period';
    const period=document.createElement('select');period.setAttribute('aria-label','Simple Ripple period');
    for(let i=1;i<=4;i++){const option=document.createElement('option');option.value=String(i);option.textContent=i+(i===1?' loop':' loops');period.append(option);}
    period.onchange=()=>objects.update(o.id,{periodLoops:Number(period.value)});length.append(period);controls.append(length);
    const toggle=()=>setExpressiveControlsVisible(card,card.dataset.controlsVisible!=='1');
    let suppressClick=false;
    handle.onclick=e=>{e.stopPropagation();if(!suppressClick||e.detail===0)toggle();suppressClick=false;};
    handle.onpointerdown=e=>{
     if(e.button>0||!canInteract())return;e.preventDefault();e.stopPropagation();handle.setPointerCapture(e.pointerId);
     suppressClick=false;const start=screenToWorld(e),position=objects.get(o.id).transform;let moved=false;
     const move=ev=>{if(ev.pointerId!==e.pointerId)return;ev.stopPropagation();const p=screenToWorld(ev);
      if(!moved&&Math.hypot(ev.clientX-e.clientX,ev.clientY-e.clientY)<6)return;
      if(!moved){moved=true;window.ToySpawner?.beginPanelDrag?.({panel:card,pointerId:e.pointerId,remove:()=>objects.remove(o.id)});}
      objects.update(o.id,{x:position.x+p.x-start.x,y:position.y+p.y-start.y});window.ToySpawner?.updatePanelDrag?.({clientX:ev.clientX,clientY:ev.clientY});
     };
     const end=ev=>{if(ev.pointerId!==e.pointerId)return;handle.removeEventListener('pointermove',move);for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.removeEventListener(type,end);
      suppressClick=moved;if(moved)window.ToySpawner?.endPanelDrag?.({clientX:ev.clientX,clientY:ev.clientY,pointerId:ev.pointerId,canceled:ev.type!=='pointerup'});
     };
     handle.addEventListener('pointermove',move);for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(type,end);
    };
    card.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape')setExpressiveControlsVisible(card,false);};
    root.append(card);cards.set(o.id,card);
   }
   Object.assign(card.style,{left:o.transform.x+'px',top:o.transform.y+'px',width:RIPPLE_SIZE+'px',height:RIPPLE_SIZE+'px'});card.dataset.instrument=o.authoredState.instrument;
   card.querySelector('select').value=String(o.authoredState.periodLoops);
   card.querySelector('.ripple-instrument-name').textContent=getDisplayNameForId(o.authoredState.instrument)||o.authoredState.instrument;
   setToyVolume(o.id,o.authoredState.volume);setToyMuted(o.id,o.authoredState.muted);syncVolumeUI(card,{volume:o.authoredState.volume,muted:o.authoredState.muted});
  }
  for(const [id,card]of cards)if(!present.has(id)){closeInstrumentPicker(card);card.remove();cards.delete(id);}
 }
 const unsubscribe=objects.subscribe(()=>{render();onDirty();});
 function animate(){
  const present=new Set();for(const wave of controller.visibleWaves(now())){
   present.add(wave.id);let ring=rings.get(wave.id);if(!ring){ring=document.createElementNS(ns,'circle');ring.classList.add('simple-ripple-wave');svg.append(ring);rings.set(wave.id,ring);}
   ring.setAttribute('cx',wave.origin.x);ring.setAttribute('cy',wave.origin.y);ring.setAttribute('r',wave.radius);ring.style.opacity=String(1-wave.radius/wave.maxRadius);
  }
  for(const [id,ring]of rings)if(!present.has(id)){ring.remove();rings.delete(id);}frame=requestAnimationFrame(animate);
 }
 const down=e=>{
  if(e.target.closest?.('.toy-spawner-art,.toy-spawner-logic,.toy-spawner-game,.palette-handle')){cancel();return;}
  if(!armed||!canInteract()||e.button>0||!getViewport().contains(e.target)||e.target.closest?.('button,input,select,a,.toy-panel,.art-toy-panel,.container-toy,.heartbeat-toy,.simple-ripple-object'))return;
  e.preventDefault();e.stopImmediatePropagation();placement={pointerId:e.pointerId,x:e.clientX,y:e.clientY};
 };
 const up=e=>{if(e.pointerId!==placement?.pointerId)return;const p=placement;placement=null;e.preventDefault();e.stopImmediatePropagation();if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>6)return;const point=screenToWorld(e);const o=objects.create(point);cancel();void emit(o.id);};
 const escape=e=>{if(e.key==='Escape')cancel();};
 const load=()=>{cancel();controller.reset();};
 const volumeChanged=e=>{const id=e.detail?.toyId;if(objects.get(id))objects.update(id,e.type==='toy-volume'?{volume:e.detail.value}:{muted:e.detail.muted});};
 window.addEventListener('toy-volume',volumeChanged);window.addEventListener('toy-mute',volumeChanged);
 window.addEventListener('pointerdown',down,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);window.addEventListener('keydown',escape);window.addEventListener('scene:load',load);window.addEventListener('scene:new',load);
 render();animate();
 return {arm,cancel,emit,dispose(){cancel();controller.reset();unsubscribe();cancelAnimationFrame(frame);root.remove();window.removeEventListener('toy-volume',volumeChanged);window.removeEventListener('toy-mute',volumeChanged);window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',escape);window.removeEventListener('scene:load',load);window.removeEventListener('scene:new',load);}};
}
