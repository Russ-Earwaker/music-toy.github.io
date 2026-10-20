import {decorateCircularControl} from './circular-control.js';
import {openInstrumentPicker} from './instrument-picker.js';
import {getDisplayNameForId} from './instrument-catalog.js';
import {CANNON_BARREL_LENGTH} from './simple-bouncer-physics.js';

// Only the cannon and revealed controls are visible. The wrapper owns music,
// not a physical play area; cubes and the moving ball live on the main board.
export function installSimpleBouncerSurface(host,{controller,id,arm,screenToWorld,picker=openInstrumentPicker}){
 const card=host.closest('.container-toy'),header=card.querySelector('header');
 const barrel=document.createElement('div');barrel.className='cannon-barrel';barrel.setAttribute('aria-hidden','false');
 const muzzle=document.createElement('button');muzzle.type='button';muzzle.className='cannon-aim';muzzle.setAttribute('aria-label','Aim cannon');muzzle.title='Drag to aim';barrel.append(muzzle);header.append(barrel);
 const controls=document.createElement('div');controls.className='simple-bouncer-controls';host.append(controls);
 const ball=decorateCircularControl(document.createElement('button'),{label:'Ball',icon:'throw'}),cube=decorateCircularControl(document.createElement('button'),{label:'Cube',icon:'cube'});
 for(const [button,label]of [[ball,'Ball'],[cube,'Cube']]){const caption=document.createElement('span');caption.className='cannon-tool-label';caption.textContent=label;button.append(caption);}
 ball.dataset.toyType='physical-ball';cube.dataset.toyType='physical-cube';ball.onclick=()=>arm({mode:'ball',seed:false});cube.onclick=()=>arm({mode:'cube',seed:false});controls.append(ball,cube);
 const instrument=decorateCircularControl(document.createElement('button'),{label:'Choose cannon instrument',asset:'T_ButtonInstruments'});controls.append(instrument);
 const instrumentName=document.createElement('span');instrumentName.className='cannon-instrument-name';instrument.append(instrumentName);
 let choosing=false;
 instrument.onclick=async()=>{if(choosing)return;choosing=true;try{card.dataset.instrument=controller.data(id).instrument;const internal=controller.panels(id)[0];const selected=await picker({panel:card,toyId:internal?.__audioToyId||internal?.id||id});if(selected&&controller.data(id))controller.setInstrument(id,selected.value||selected);}finally{choosing=false;}};
 const length=document.createElement('label');length.className='bouncer-length';length.append(document.createTextNode('Phrase length'));
 const bars=document.createElement('select');bars.setAttribute('aria-label','Simple Bouncer length');for(let i=1;i<=4;i++){const option=document.createElement('option');option.value=String(i);option.textContent=`${i} ${i===1?'bar':'bars'}`;bars.append(option);}length.append(bars);controls.append(length);bars.onchange=()=>{if(controller.setBars(id,Number(bars.value)))void controller.throwBall(id);};
 controls.addEventListener('keydown',e=>e.stopPropagation());
 muzzle.addEventListener('pointerdown',e=>{
  e.stopPropagation();if(e.button>0)return;e.preventDefault();muzzle.setPointerCapture(e.pointerId);
  const move=ev=>{if(ev.pointerId!==e.pointerId)return;ev.stopPropagation();ev.preventDefault();controller.setAim(id,screenToWorld(ev));draw();};
  const end=ev=>{if(ev.pointerId!==e.pointerId)return;ev.stopPropagation();muzzle.removeEventListener('pointermove',move);for(const type of ['pointerup','pointercancel','lostpointercapture'])muzzle.removeEventListener(type,end);};
  muzzle.addEventListener('pointermove',move);for(const type of ['pointerup','pointercancel','lostpointercapture'])muzzle.addEventListener(type,end);
 });
 let active=false,disposed=false,frame;
 function draw(){if(disposed||!controller.data(id))return;const d=controller.data(id),c=controller.cannon(id);if(!c)return;
  barrel.style.transform=`rotate(${Math.atan2(c.direction.y,c.direction.x)}rad)`;barrel.style.setProperty('--barrel-length',CANNON_BARREL_LENGTH+'px');
  bars.value=String(d.bars);const name=getDisplayNameForId(d.instrument)||d.instrument;instrument.title=`Choose Instrument: ${name}`;instrumentName.textContent=name;card.dataset.instrument=d.instrument;
 }
 function animate(){if(!active||disposed)return;draw();frame=requestAnimationFrame(animate);}
 const unsubscribe=controller.subscribe(draw);draw();
 return {setActive(value){if(active===value)return;active=value;if(active)animate();else cancelAnimationFrame(frame);},dispose(){disposed=true;unsubscribe();cancelAnimationFrame(frame);controls.remove();barrel.remove();}};
}
