import {linePresentation,paintCenter} from './free-play-line-visual.js';
import {paintShapes,paintShapeContains} from './free-play-silence.js';

export function canonicalLineNodes(line){return linePresentation(line.source,line.straightened?1:0).events;}
export function paintOwnerAt(lines,point){
 let owner=null,distance=Infinity;
 for(const line of lines)for(const node of canonicalLineNodes(line)){
  const d=Math.hypot((node.x-point.x)/.6,node.y-point.y);
  if(d<distance){distance=d;owner=line.id;}
 }
 return owner;
}
export function collectScenePaint(lines,surface=[]){
 const seen=new Set(),result=[];
 for(const line of [...lines,{source:{paint:surface},surface:true}])for(const stamp of line.source.paint||[]){
  if(seen.has(stamp.id))continue;seen.add(stamp.id);
  const center=stamp.space==='surface-v2'||line.surface?stamp:paintCenter(line.source,stamp,line.straightened?1:0,1,1);
  result.push({...stamp,x:center.x,y:center.y,space:'surface-v2',owner:line.id||null});
 }
 return result.sort((a,b)=>(a.order||0)-(b.order||0));
}
export function evaluateScenePaint(lines,stamps){
 const nodes=lines.flatMap(line=>canonicalLineNodes(line).map(n=>({...n,lineId:line.id})));
 const paint=stamps.map(stamp=>{const shapes=paintShapes(stamp);return {...stamp,notes:nodes.filter(n=>shapes.some(s=>paintShapeContains(s,n))).map(n=>n.id)};});
 const covered=new Set(paint.flatMap(s=>s.notes));
 return {paint,coveredIds:[...covered],nodes};
}
export function topPaintAt(stamps,point){
 return [...stamps].reverse().find(stamp=>paintShapes(stamp).some(s=>paintShapeContains(s,point,.016)));
}
