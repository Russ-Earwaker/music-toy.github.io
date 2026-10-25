// One board-facing API over existing canonical stores. No second graph or music store.
import {referenceIntegrity} from './board-object.js';
export function createBoardObjectLayer({objects,containers,ripples,drums,strings,artPanels=()=>[],createCannon,createPaint,createArt,removeArt=()=>false}){
 const list=()=>[...objects.list().map(o=>o.boardObject),...containers.list().map(c=>c.boardObject).filter(Boolean),...artPanels().map(p=>p.boardObject).filter(Boolean),...(ripples?.list()||[]),...(drums?.list()||[]),...(strings?.list()||[])];
 const get=id=>list().find(o=>o.id===id)||null;
 const factories={cube:({x=0,y=0,...options})=>objects.addCube(x,y,options),cannon:createCannon,ripple:ripples?.create,drum:drums?.create,string:options=>strings?.create({...options,kind:'string'}),strum:options=>strings?.create({...options,kind:'strum'}),'simple-paint':createPaint,'decorative-art':createArt};
 function create(kind,options={}){if(!factories[kind])throw Error(`Unsupported creation kind: ${kind}`);const result=factories[kind](options);return result?.boardObject||(result?.capabilities?result:null);}
 function move(id,x,y){
  if(![x,y].every(Number.isFinite))return null;
  if(strings?.get(id))strings.update(id,{x,y});
  else if(drums?.get(id))drums.update(id,{x,y});
  else if(ripples?.get(id))ripples.update(id,{x,y});
  else if(objects.get(id))objects.update(id,{x,y});
  else if(containers.get(id))containers.move(id,x,y);
  else {const panel=artPanels().find(p=>p.id===id);if(!panel)return null;panel.style.left=`${x}px`;panel.style.top=`${y}px`;}
  return get(id);
 }
 function remove(id){if(strings?.get(id))return strings.remove(id);if(drums?.get(id))return drums.remove(id);if(ripples?.get(id))return ripples.remove(id);if(objects.get(id))return objects.remove(id);if(containers.get(id))return containers.remove(id);return removeArt(artPanels().find(p=>p.id===id));}
 return {get,list,create,move,remove,references:id=>{const o=get(id);return o?referenceIntegrity(o,get):[];},snapshot:list};
}
