import {stringTap} from './string-surface.js';

export function stringLocalPoint(object,point){
 const x=point.x-object.transform.x,y=point.y-object.transform.y,c=Math.cos(object.transform.rotation),s=Math.sin(object.transform.rotation);
 return {x:x*c+y*s,y:-x*s+y*c};
}
// Presentation/input geometry only: never added to authored bounds or physics.
export function stringRunways(object,{coarse=false}={}){
 // Local x is longitudinal (frets); local y is the perpendicular strum axis.
 const length=object.bounds.length,lanes=object.capabilities.playable.surface.segments;
 const negativeEdge=lanes[0].a.y-16,positiveEdge=lanes.at(-1).a.y+16;
 const depth=Math.max(coarse?160:120,(positiveEdge-negativeEdge)*(coarse?2:1.5));
 return [-1,1].map(normal=>({normal,x:-length/2,y:normal<0?negativeEdge-depth:positiveEdge,width:length,height:depth}));
}
export function stringInputHit(object,point,options={}){
 const local=stringLocalPoint(object,point),half=object.bounds.length/2;
 const hit=Math.abs(local.x)<=half+1e-8?stringTap(object,point,16):null;
 if(hit)return {object,hit,playable:true,distance:hit.distance};
 const runway=stringRunways(object,options).find(r=>local.x>=r.x&&local.x<=r.x+r.width&&local.y>=r.y&&local.y<=r.y+r.height);
 if(!runway)return null;
 return {object,runway,playable:false,distance:Math.min(...object.capabilities.playable.surface.segments.map(s=>Math.abs(local.y-s.a.y)))};
}
export function chooseStringSurface(objects,point,{targetId,selectedIds=new Set(),...options}={}){
 const hits=objects.map((o,order)=>{const hit=stringInputHit(o,point,options);return hit&&{...hit,order};}).filter(Boolean);
 return hits.sort((a,b)=>Number(b.playable)-Number(a.playable)||
  Number(b.playable&&b.object.id===targetId)-Number(a.playable&&a.object.id===targetId)||
  Number(selectedIds.has(b.object.id))-Number(selectedIds.has(a.object.id))||a.distance-b.distance||b.order-a.order)[0]||null;
}
