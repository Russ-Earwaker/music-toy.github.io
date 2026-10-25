import {gravityTeachingFlight} from './gravity-ball-teaching.js';
import {contextualTriggerHint,hintCube} from './simple-hint-placement.js';
import {trajectoryPoints} from './trajectory-presentation.js';
import {DRAW_LABEL_STYLE} from './draw-label-style.js';

// Pure presentation geometry, never passed to a drawing/music/model API.
export const DRAW_DEMO_PATH='M 35 175 C 90 240 175 220 170 140 C 165 75 80 85 100 145 C 125 210 230 145 260 90 C 300 20 375 65 350 125 C 325 190 235 210 275 245 C 315 280 390 215 410 180';
export function boardHintBox(viewport,screenToWorld){
 const a=screenToWorld({x:viewport.left,y:viewport.top}),b=screenToWorld({x:viewport.right??viewport.left+viewport.width,y:viewport.bottom??viewport.top+viewport.height});
 const width=Math.max(1,Math.min(780,(b.x-a.x)*.84,(b.y-a.y)*1.35));
 return {x:(a.x+b.x-width)/2,y:(a.y+b.y)/2-150*width/440,width};
}
// Score a few visible board regions against presentation rectangles only. This
// never contributes bounds to the model or asks layout to move an object.
export function interactionHintBox(viewport,screenToWorld,obstacles=[]){
 const base=boardHintBox(viewport,screenToWorld),a=screenToWorld({x:viewport.left,y:viewport.top}),b=screenToWorld({x:viewport.right??viewport.left+viewport.width,y:viewport.bottom??viewport.top+viewport.height});
 const width=Math.min(base.width,600,(b.x-a.x)*.55),height=width*300/440;
 const candidates=[];
 for(const fy of [.5,.22,.78])for(const fx of [.5,.2,.8]){
  const x=Math.max(a.x,Math.min(b.x-width,a.x+(b.x-a.x)*fx-width/2)),y=Math.max(a.y,Math.min(b.y-height,a.y+(b.y-a.y)*fy-height/2));
  const overlap=obstacles.reduce((sum,r)=>sum+Math.max(0,Math.min(x+width,r.x+r.width+20)-Math.max(x,r.x-20))*Math.max(0,Math.min(y+height,r.y+r.height+20)-Math.max(y,r.y-20)),0);
  candidates.push({x,y,width,score:overlap+Math.abs(fx-.5)+Math.abs(fy-.5)});
 }
 const {score,...box}=candidates.sort((a,b)=>a.score-b.score)[0];return box;
}
export const SIMPLE_PLACE_HINT_DELAY=1500;
const boardHints=new WeakMap();
export function createBoardInteractionHint({getWorld,getViewport,screenToWorld,label='DRAW',demo='draw',delay=0,getCubes=()=>[],ballMode='normal'}){
 const world=getWorld();boardHints.get(world)?.dispose();
 const convert=p=>screenToWorld({...p,clientX:p.x,clientY:p.y});
 const hint=createSimpleInteractionHint(world,{label,demo,ballMode});
 const placement=()=>{
  const rect=getViewport().getBoundingClientRect();
  if(demo==='draw')return {box:boardHintBox(rect,convert)};
  const cubes=getCubes(),canonical=new Map(cubes.map(c=>{const r=hintCube(c);return [r.id,{id:r.id,x:r.left,y:r.top,width:r.width,height:r.height}];}));
  const obstacles=[...(world.querySelectorAll?.('.toy-panel,.art-toy-panel,.container-toy,.simple-container-handle,.physical-object,.simple-ripple-object,.simple-drum-object,.surface-hit,.string-surface-handle,.heartbeat-toy')||[])].filter(n=>!n.hidden&&(typeof getComputedStyle!=='function'||getComputedStyle(n).visibility!=='hidden'&&getComputedStyle(n).display!=='none')).map(n=>{
   if(canonical.has(n.id))return canonical.get(n.id);
   const r=n.getBoundingClientRect(),a=convert({x:r.left,y:r.top}),b=convert({x:r.right,y:r.bottom});return {id:n.id,x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y};
  });
  for(const r of canonical.values())if(!obstacles.some(o=>o.id===r.id))obstacles.push(r);
  const a=convert({x:rect.left,y:rect.top}),b=convert({x:rect.right??rect.left+rect.width,y:rect.bottom??rect.top+rect.height});
  const context=contextualTriggerHint({area:{x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y},cubes,obstacles,demo,preferLateral:ballMode==='gravity'});
  return context||{box:interactionHintBox(rect,convert,obstacles)};
 };
 const initial=placement();hint.setContext(initial);hint.show({box:initial.box,delay});
 const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{const next=placement();hint.setContext(next);hint.position(next.box);});observer?.observe(getViewport());
 const api={layer:hint.layer,hide:hint.hide,dispose(){observer?.disconnect();hint.dispose();if(boardHints.get(world)===api)boardHints.delete(world);}};
 boardHints.set(world,api);return api;
}
export function createSimpleInteractionHint(parent,{label:prompt='DRAW',demo='draw',ballMode='normal',motionQuery=window.matchMedia?.('(prefers-reduced-motion: reduce)')||{matches:true,addEventListener(){},removeEventListener(){}}}={}){
 const layer=document.createElement('div');layer.className='draw-onboarding simple-interaction-hint';layer.dataset.demo=demo;layer.dataset.ballMode=ballMode;layer.hidden=true;layer.setAttribute('aria-hidden','true');
 const label=document.createElement('span');label.className='draw-onboarding-label';label.textContent=prompt;Object.assign(label.style,DRAW_LABEL_STYLE);
 let updateContext=()=>{};
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 440 300');
 const trail=document.createElementNS(ns,'path');trail.setAttribute('d',DRAW_DEMO_PATH);trail.setAttribute('pathLength','515');trail.classList.add('draw-onboarding-trail');
 const sweep=document.createElementNS(ns,'animate');sweep.setAttribute('attributeName','stroke-dashoffset');sweep.setAttribute('values','75;75;-440;-440');sweep.setAttribute('keyTimes','0;0.12;0.64;1');sweep.setAttribute('dur','6s');sweep.setAttribute('repeatCount','indefinite');trail.append(sweep);
 const dot=document.createElementNS(ns,'circle');dot.setAttribute('r','4');dot.classList.add('draw-onboarding-dot');
 const motion=document.createElementNS(ns,'animateMotion');motion.setAttribute('path',DRAW_DEMO_PATH);motion.setAttribute('dur','6s');motion.setAttribute('keyTimes','0;0.12;0.64;1');motion.setAttribute('keyPoints','0;0;1;1');motion.setAttribute('calcMode','linear');motion.setAttribute('repeatCount','indefinite');dot.append(motion);
 if(demo==='draw')svg.append(trail,dot);
 else if(demo==='tap'){
  const contact=document.createElementNS(ns,'circle');contact.classList.add('interaction-hint-contact');contact.setAttribute('cx','220');contact.setAttribute('cy','180');contact.setAttribute('r','6');svg.append(contact);
  const expansions=[];
  for(const radius of [55,90]){const ring=document.createElementNS(ns,'circle');ring.classList.add('simple-ripple-wave','interaction-hint-wave');for(const [key,value]of Object.entries({cx:220,cy:180,r:radius}))ring.setAttribute(key,value);
   const expand=document.createElementNS(ns,'animate');for(const [k,v]of Object.entries({attributeName:'r',values:'0;0;'+radius+';'+radius,keyTimes:'0;0.18;0.78;1',dur:'6s',repeatCount:'indefinite'}))expand.setAttribute(k,v);
   const fade=document.createElementNS(ns,'animate');for(const [k,v]of Object.entries({attributeName:'opacity',values:'0;0;.7;0;0',keyTimes:'0;0.16;0.24;0.8;1',dur:'6s',repeatCount:'indefinite'}))fade.setAttribute(k,v);ring.append(expand,fade);svg.append(ring);expansions.push(expand);
  }
  updateContext=context=>{if(context.tapRadius)expansions.forEach((expand,i)=>{const radius=context.tapRadius*(i ? .65 : 1);expand.setAttribute('values',`0;0;${radius};${radius}`);});};
 }else if(demo==='swipe'){
  const points=[{x:90,y:215},{x:350,y:115}];
  const prediction=document.createElementNS(ns,'polyline');prediction.classList.add('physical-path-prediction','interaction-hint-trajectory');prediction.setAttribute('points',trajectoryPoints(points));svg.append(prediction);
  const drag=document.createElementNS(ns,'line');drag.classList.add('physical-launch-preview','interaction-hint-drag');for(const [k,v]of Object.entries({x1:90,y1:215,x2:350,y2:115}))drag.setAttribute(k,v);
  for(const [axis,end]of [['x',350],['y',115]]){const animate=document.createElementNS(ns,'animate');for(const [k,v]of Object.entries({attributeName:axis+'2',values:(axis==='x'?'90;90;':'215;215;')+end+';'+end,keyTimes:'0;0.12;0.42;1',dur:'6s',repeatCount:'indefinite'}))animate.setAttribute(k,v);drag.append(animate);}svg.append(drag);
  const origin=document.createElementNS(ns,'circle');origin.classList.add('interaction-hint-origin');origin.setAttribute('cx','90');origin.setAttribute('cy','215');origin.setAttribute('r','8');svg.append(origin);
  motion.setAttribute('path','M90 215 L350 115');motion.setAttribute('keyTimes','0;0.44;0.78;1');
  updateContext=context=>{if(!context.end)return;const a=context.origin,flight=ballMode==='gravity'?gravityTeachingFlight(a,context.end,context.worldScale||1):null,b=flight?.aim||context.end;prediction.setAttribute('points',trajectoryPoints(flight?.points||[a,b]));for(const axis of ['x','y']){origin.setAttribute('c'+axis,a[axis]);drag.setAttribute(axis+'1',a[axis]);drag.setAttribute(axis+'2',b[axis]);const animation=[...drag.children].find(n=>n.getAttribute('attributeName')===axis+'2');animation?.setAttribute('values',`${a[axis]};${a[axis]};${b[axis]};${b[axis]}`);}motion.setAttribute('path',flight?.points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ')||`M${a.x} ${a.y} L${b.x} ${b.y}`);};
  dot.classList.add('interaction-hint-ball');dot.setAttribute('r','6');svg.append(dot);
 }
 layer.append(label,svg);parent.append(layer);
 const reduce=()=>{layer.classList.toggle('draw-onboarding-reduced',motionQuery.matches);if(motionQuery.matches||layer.hidden){svg.pauseAnimations?.();if(motionQuery.matches)svg.setCurrentTime?.(3);}else svg.unpauseAnimations?.();};
 motionQuery.addEventListener('change',reduce);reduce();
 let timer=null;
 function hide(){clearTimeout(timer);timer=null;layer.hidden=true;svg.pauseAnimations?.();}
 function position(box){Object.assign(layer.style,{left:box.x+'px',top:box.y+'px',width:box.width+'px'});}
 return {layer,position,setContext(context){updateContext(context.targetId?{...context,worldScale:context.box?.width/440||1}:{origin:{x:90,y:215},end:{x:350,y:115},tapRadius:90,...context,worldScale:context.box?.width/440||1});for(const key of ['targetCubeId','originX','originY','endX','endY'])delete layer.dataset[key];if(context.targetId){layer.dataset.targetCubeId=context.targetId;layer.dataset.originX=String(context.worldOrigin.x);layer.dataset.originY=String(context.worldOrigin.y);layer.dataset.endX=String(context.worldEnd.x);layer.dataset.endY=String(context.worldEnd.y);}},show({box,delay=0}={}){hide();if(box)position(box);
  const reveal=()=>{timer=null;layer.hidden=false;reduce();svg.setCurrentTime?.(motionQuery.matches?3:0);};if(delay)timer=setTimeout(reveal,delay);else reveal();
 },hide,dispose(){hide();motionQuery.removeEventListener('change',reduce);layer.remove();}};
}
