import {decorateCircularControl,createTrashControl} from './circular-control.js';
import {expressiveControl} from './expressive-toy-chrome.js';

// Informational capture chrome. All cubes, balls and gestures live on the board.
export function installSimpleBouncerSurface(host,{controller,id,arm,remove}){
 const scene=document.createElement('section');scene.className='simple-bouncer-surface';scene.setAttribute('aria-label','Board-space Bouncer capture');
 const controls=document.createElement('div');controls.className='simple-bouncer-controls';
 const record=decorateCircularControl(document.createElement('button'),{label:'Record Throw',icon:'throw'});
 const caption=document.createElement('span');caption.className='bouncer-control-label';caption.textContent='Record Throw';record.append(caption);controls.append(record);
 const length=document.createElement('label');length.className='bouncer-length';length.append(document.createTextNode('Length '));
 const bars=document.createElement('select');bars.setAttribute('aria-label','Simple Bouncer length');for(let i=1;i<=4;i++){const option=document.createElement('option');option.value=String(i);option.textContent=`${i} ${i===1?'bar':'bars'}`;bars.append(option);}length.append(bars);controls.append(length);
 const clear=expressiveControl(document.createElement('button'),{kind:'clear',label:'Clear capture'});controls.append(clear);
 const trash=createTrashControl();trash.setAttribute('aria-label','Delete Simple Bouncer');controls.append(trash);
 const title=document.createElement('strong');title.textContent='Board throw';const status=document.createElement('p');status.setAttribute('role','status');scene.append(controls,title,status);host.append(scene);
 let active=false,disposed=false,frame;
 record.onclick=()=>arm({containerId:id,ballId:controller.data(id).ballId});bars.onchange=()=>controller.setBars(id,Number(bars.value));clear.onclick=()=>controller.clear(id);trash.onclick=remove;
 controls.addEventListener('keydown',e=>e.stopPropagation());
 function draw(){if(!active||disposed||!controller.data(id))return;const v=controller.view(id),d=v.data;record.disabled=bars.disabled=v.recording;bars.value=String(d.bars);
  const hits=controller.panels(id)[0]?.__dgAuthoredNotes?.length||0;
  const text=d.brokenReferences?.length?'A referenced object was deleted. Captured music still plays.':d.stale?'Shared cubes changed. Previous music still plays; record a new throw.':v.recording?'Recording a board throw. Objects are locked for this phrase.':d.capture?`${hits} hits · ${d.bars} ${d.bars===1?'bar':'bars'}. Physics belongs to the whole board.`:'Drag a Ball or choose Record Throw. Cubes remain shared board objects.';
  if(status.textContent!==text)status.textContent=text;frame=requestAnimationFrame(draw);
 }
 return {setActive(value){if(active===value)return;active=value;if(active)draw();else cancelAnimationFrame(frame);},dispose(){disposed=true;active=false;cancelAnimationFrame(frame);controls.remove();scene.remove();}};
}
