import {pointSegmentDistance} from './free-play-silence.js';
export const SCISSORS_RADIUS=24,HEAL_RADIUS=48,SCISSORS_SWIPE_SLOP=12;
const key=n=>`${n.lineId}:${n.id}`;
// Points and candidates are in authored local layout units, never screen pixels.
export function createScissorsStroke(start){
 const points=[start],seen=new Set();let excursion=0,processed=0;
 return {points,get isSwipe(){return excursion>=SCISSORS_SWIPE_SLOP;},
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
 };
}
export function nearestCutGap(point,gaps,radius=HEAL_RADIUS){
 return gaps.map(g=>({...g,distance:Math.min(...g.anchors.map(a=>Math.hypot(a.x-point.x,a.y-point.y)))}))
  .filter(g=>g.distance<=radius).sort((a,b)=>a.distance-b.distance||key(a).localeCompare(key(b)))[0]||null;
}
