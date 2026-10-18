import {instrumentColour} from './instrument-colours.js';
const NS='http://www.w3.org/2000/svg';
export function relationshipTargets(panel,panels,getMaster){
 const shared=panel.dataset?.sharedDefinitionId;
 if(shared)return panels.filter(p=>p.dataset?.sharedDefinitionId===shared);
 const master=panel.dataset?.masterToyId ? getMaster(panel.dataset.masterToyId) : panel;
 if(!master)return [panel];
 return [master,...panels.filter(p=>p!==master && (p.dataset?.masterToyId===master.id || (master.dataset?.sharedDefinitionId && p.dataset?.sharedDefinitionId===master.dataset.sharedDefinitionId)))];
}
export function createRelationshipReveal({getPanels,getMaster,getHost=p=>p.parentElement,getCentre=p=>({x:p.offsetLeft+p.offsetWidth/2,y:p.offsetTop+p.offsetHeight/2}),getColour=p=>instrumentColour(p.dataset.instrument||'')}){
 let layer=null,timer=null,flashed=[],down=null;
 let recentTap=null;
 const listeners=[];
 const listen=(type,handler)=>{document.addEventListener(type,handler,true);listeners.push([type,handler]);};
 const targetPanel=e=>{if(e.target?.closest?.('button,input,select,a'))return null;const panel=e.target?.closest?.('.toy-header')?.closest?.('.toy-panel');return panel&&getPanels().includes(panel)?panel:null;};
 // Overview and drag handlers can consume events before they reach a header.
 // Observe the tap first, without preventing any normal toy interaction.
 listen('pointerdown',e=>{
  down=null;if(e.button!=null&&e.button!==0)return;
  const panel=targetPanel(e);if(panel)down={panel,id:e.pointerId,x:e.clientX,y:e.clientY};
 });
 listen('pointerup',e=>{
  const tap=down;down=null;
  if(tap&&tap.id===e.pointerId){recentTap={panel:tap.panel,at:Date.now()};if(Math.hypot(e.clientX-tap.x,e.clientY-tap.y)<=8)show(tap.panel);}
 });
 listen('click',e=>{const panel=targetPanel(e);if(panel&&!(recentTap?.panel===panel&&Date.now()-recentTap.at<500))show(panel);});
 listen('pointercancel',()=>{down=null;});
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
 function prepare(){} // Header taps are delegated, including restored/new views.
 return {show,prepare,clear,dispose(){clear();down=recentTap=null;for(const [type,handler]of listeners)document.removeEventListener?.(type,handler,true);}};
}
