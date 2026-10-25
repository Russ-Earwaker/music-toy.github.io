import {prepareBoardDrawing} from './simple-draw-placement.js';
import {createBoardInteractionHint} from './simple-interaction-hint.js';
// Temporary input only: no graph object, notes, transport or persisted state.
export function installSimpleDrawCreation({getViewport,getWorld,screenToWorld,commit,unlock=()=>{},canCreate=()=>true,onArm=()=>{}}){
 let armed=false,pointer=null,points=[],overlay=null,path=null,heartbeatId,containerId,capped=false;
 let onboarding=null;
 const hint=document.createElement('p');hint.className='simple-draw-creation-hint';hint.hidden=true;hint.textContent='Draw on the board. Release to make a toy. Esc to cancel.';document.body.append(hint);
 function clear(){const captured=pointer;pointer=null;if(captured!==null&&getViewport()?.hasPointerCapture(captured))getViewport().releasePointerCapture(captured);overlay?.remove();overlay=path=null;points=[];capped=false;}
 function cancel(){clear();armed=false;hint.hidden=true;onboarding?.dispose();onboarding=null;document.body.classList.remove('simple-draw-creating');}
 function arm(options={}){cancel();if(!canCreate())return;onArm();heartbeatId=options.heartbeatId;containerId=options.containerId;armed=true;onboarding=createBoardInteractionHint({getWorld,getViewport,screenToWorld,delay:options.delay||0});document.body.classList.add('simple-draw-creating');}
 function swallow(e){e.preventDefault();e.stopImmediatePropagation();}
 function move(e){if(e.pointerId!==pointer)return;swallow(e);if(capped)return;const p=screenToWorld({x:e.clientX,y:e.clientY}),last=points.at(-1);if(Math.hypot(p.x-last.x,p.y-last.y)<.5)return;points.push(p);
  const prepared=prepareBoardDrawing(points);if(prepared?.source.path.totalLength>=4){const {source,bounds,contentSpace:s}=prepared;points=source.path.points.map(p=>({x:bounds.x+s.x+p.x*s.width,y:bounds.y+s.y+p.y*s.height}));capped=true;}
  path.setAttribute('d',points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' '));}
 window.addEventListener('pointerdown',e=>{
  if(armed&&!canCreate()){cancel();return;}
  if(!armed||pointer!==null||e.button!==0)return;
  if(!getViewport()?.contains(e.target)||e.target.closest('button,input,select,.toy-panel,.container-toy,.structure-toy,.heartbeat-toy')){onboarding?.hide();return;}
  onboarding?.hide();
  swallow(e);unlock();pointer=e.pointerId;points=[screenToWorld({x:e.clientX,y:e.clientY})];
  overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');overlay.classList.add('simple-draw-creation-stroke');path=document.createElementNS(overlay.namespaceURI,'path');path.setAttribute('fill','none');path.setAttribute('stroke','#79dbff');path.setAttribute('stroke-width','6');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');overlay.append(path);getWorld().append(overlay);getViewport().setPointerCapture(pointer);
 },true);
 window.addEventListener('pointermove',move,true);
 window.addEventListener('pointerup',e=>{if(e.pointerId!==pointer)return;move(e);swallow(e);const prepared=prepareBoardDrawing(points);cancel();if(prepared)void commit(prepared,{heartbeatId,containerId}).catch(error=>{hint.textContent=error.message;hint.hidden=false;});},true);
 window.addEventListener('pointercancel',e=>{if(e.pointerId===pointer)cancel();},true);
 window.addEventListener('lostpointercapture',e=>{if(e.pointerId===pointer)cancel();},true);
 window.addEventListener('blur',cancel);
 window.addEventListener('keydown',e=>{if(armed&&e.key==='Escape'){swallow(e);cancel();}},true);
 window.addEventListener('scene:new',cancel);window.addEventListener('scene:load',cancel);
 return {arm,cancel,get active(){return armed;},get targetId(){return armed?containerId:null;}};
}
