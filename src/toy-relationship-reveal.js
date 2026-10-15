import {instrumentColour} from './instrument-colours.js';
const NS='http://www.w3.org/2000/svg';
export function relationshipTargets(panel,panels,getMaster){
 const master=panel.dataset?.masterToyId ? getMaster(panel.dataset.masterToyId) : panel;
 if(!master)return [];
 return [master,...panels.filter(p=>p!==master && (p.dataset?.masterToyId===master.id || (master.dataset?.sharedDefinitionId && p.dataset?.sharedDefinitionId===master.dataset.sharedDefinitionId)))];
}
export function createRelationshipReveal({getPanels,getMaster,getHost=p=>p.parentElement,getCentre=p=>({x:p.offsetLeft+p.offsetWidth/2,y:p.offsetTop+p.offsetHeight/2}),getColour=p=>instrumentColour(p.dataset.instrument||'')}){
 let layer=null,timer=null,flashed=[],down=null;
 const bound=new WeakSet();
 document.addEventListener('pointerup',e=>{
  const tap=down;down=null;
  if(tap&&tap.id===e.pointerId&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)<=8)show(tap.panel);
 },true);
 document.addEventListener('pointercancel',()=>{down=null;},true);
 function clear(){clearTimeout(timer);layer?.remove();layer=null;for(const p of flashed)p.classList.remove('relationship-flash');flashed=[];}
 function show(panel){
  clear();const targets=relationshipTargets(panel,getPanels(),getMaster);if(targets.length<2)return;
  const master=targets[0],colour=getColour(master);
  flashed=targets;
  // Commit the cleared animation before re-adding it: rapid taps otherwise
  // keep the same CSS animation running (or leave it at its faded endpoint).
  for(const p of flashed){p.style.setProperty('--relationship-colour',colour);void p.offsetWidth;p.classList.add('relationship-flash');}
  const host=getHost(master);if(!host)return;
  layer=document.createElementNS(NS,'svg');layer.classList.add('relationship-tethers');layer.setAttribute('aria-hidden','true');
  // Same world coordinate space as toys, with no topology or hit targets.
  layer.style.setProperty('--relationship-colour',colour);host.prepend(layer);
  const a=getCentre(master);
  for(const p of targets.slice(1).slice(0,12)){
   const b=getCentre(p),path=document.createElementNS(NS,'path');
   path.setAttribute('d',`M ${a.x} ${a.y} Q ${(a.x+b.x)/2} ${Math.min(a.y,b.y)-60} ${b.x} ${b.y}`);layer.append(path);
  }
  timer=setTimeout(clear,1800);
 }
 function prepare(){for(const panel of getPanels()){
  const header=panel.querySelector('.toy-header');if(!header||bound.has(header))continue;bound.add(header);
  header.addEventListener('pointerdown',e=>{if(e.target.closest('button,input,select,a'))return;down={panel,id:e.pointerId,x:e.clientX,y:e.clientY};},{passive:true,capture:true});
  header.addEventListener('click',e=>{
   if(e.target.closest('button,input,select,a'))return;
   if(e.detail===0)show(panel);
  });
 }}
 return {show,prepare,clear};
}
