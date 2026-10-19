import {pointSegmentDistance} from './free-play-silence.js';
export const SCISSORS_RADIUS=24,HEAL_RADIUS=48,SCISSORS_SWIPE_SLOP=12;
const key=n=>`${n.lineId}:${n.id}`;
const cross=(a,b)=>a.x*b.y-a.y*b.x;
function intersection(a,b,c,d){
 const r={x:b.x-a.x,y:b.y-a.y},s={x:d.x-c.x,y:d.y-c.y},q={x:c.x-a.x,y:c.y-a.y},den=cross(r,s);
 if(Math.abs(den)<1e-9)return null; // Collinear drags and distant near misses are not crossings.
 const t=cross(q,s)/den,u=cross(q,r)/den;
 return t>=0&&t<=1&&u>=0&&u<=1?{t,u}:null;
}
// Segment progress retains authored path order, including coiled/self-crossing lines.
// Arc lengths are measured on the visible string; gaps never invent a crossing.
export function scissorsFallback(points,nodes,paths){
 const hits=[],seen=new Set(),crossings=new Set();
 for(const {lineId,segments} of paths){
  let distance=0;const edges=[];
  for(const segment of segments)for(let i=1;i<segment.length;i++){
   const a=segment[i-1],b=segment[i],length=Math.hypot(b.x-a.x,b.y-a.y);
   edges.push({a,b,length,distance});distance+=length;
  }
  const at=progress=>{const edge=edges.find(e=>progress>=e.a.progress-1e-9&&progress<=e.b.progress+1e-9);return edge?edge.distance+edge.length*(progress-edge.a.progress)/(edge.b.progress-edge.a.progress||1):null;};
  const ordered=nodes.filter(n=>n.lineId===lineId).sort((a,b)=>a.progress-b.progress);
  const crossed=[];
  for(let i=1;i<points.length;i++)for(const edge of edges){
   const hit=intersection(points[i-1],points[i],edge.a,edge.b);if(!hit)continue;
   if(hit.t<1e-9||hit.t>1-1e-9){
    const before=hit.t<1e-9?points[i-2]:points[i-1],after=hit.t<1e-9?points[i]:points[i+1];
    if(!before||!after)continue;
    const direction={x:edge.b.x-edge.a.x,y:edge.b.y-edge.a.y};
    if(cross(direction,{x:before.x-edge.a.x,y:before.y-edge.a.y})*cross(direction,{x:after.x-edge.a.x,y:after.y-edge.a.y})>=-1e-9)continue;
   }
   const progress=edge.a.progress+(edge.b.progress-edge.a.progress)*hit.u;
   crossed.push({progress,distance:edge.distance+edge.length*hit.u,order:i+hit.t});
  }
  crossed.sort((a,b)=>a.order-b.order);
  for(const crossing of crossed){
   const crossingKey=lineId+':'+Math.round(crossing.progress*1e6);if(crossings.has(crossingKey))continue;crossings.add(crossingKey);
   const before=ordered.findLast(n=>n.progress<=crossing.progress),after=ordered.find(n=>n.progress>=crossing.progress);
   if(!before||!after)continue; // No fallback on an empty tail beyond musical content.
   const candidates=[...new Set([before,after])].filter(n=>!n.scissorMuted&&!seen.has(key(n)))
    .map(node=>({node,distance:at(node.progress)})).filter(n=>n.distance!==null)
    .sort((a,b)=>Math.abs(a.distance-crossing.distance)-Math.abs(b.distance-crossing.distance)||key(a.node).localeCompare(key(b.node)));
   if(candidates.length){const node=candidates[0].node;hits.push(node);seen.add(key(node));}
  }
 }
 return hits;
}
// Points and candidates are in authored local layout units, never screen pixels.
export function createScissorsStroke(start){
 const points=[start],seen=new Set();let excursion=0,processed=0;
 return {points,get isSwipe(){return excursion>=SCISSORS_SWIPE_SLOP;},get hasDirectHits(){return seen.size>0;},
  add(point,nodes){const previous=points.at(-1),distance=Math.hypot(point.x-previous.x,point.y-previous.y);if(distance>1e-9){points.push(point);excursion=Math.max(excursion,Math.hypot(point.x-start.x,point.y-start.y));}
   if(excursion<SCISSORS_SWIPE_SLOP)return [];
   const hits=[];
   for(let i=processed;i<points.length-1;i++){
    const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y;
    const crossed=nodes.filter(n=>!n.scissorMuted&&!seen.has(key(n))&&pointSegmentDistance(n,a,b)<=SCISSORS_RADIUS)
     .sort((u,v)=>((u.x-v.x)*dx+(u.y-v.y)*dy)||key(u).localeCompare(key(v)));
    for(const node of crossed){seen.add(key(node));hits.push(node);}
   }processed=points.length-1;return hits;
  },
  finish(nodes,paths=[]){if(excursion<SCISSORS_SWIPE_SLOP||seen.size)return [];const hits=scissorsFallback(points,nodes,paths);for(const node of hits)seen.add(key(node));return hits;},
 };
}
export function nearestCutGap(point,gaps,radius=HEAL_RADIUS){
 return gaps.map(g=>({...g,distance:Math.min(...g.anchors.map(a=>Math.hypot(a.x-point.x,a.y-point.y)))}))
  .filter(g=>g.distance<=radius).sort((a,b)=>a.distance-b.distance||key(a).localeCompare(key(b)))[0]||null;
}
