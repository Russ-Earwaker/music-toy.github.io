import {selectDrawGridSilence,seededRandom} from './drawgrid/dg-random-silence.js';
import {canonicalLineNodes,evaluateScenePaint} from './free-play-paint.js';

export function planSilenceChaos(lines,tool,seed,existing=[]){
 const random=seededRandom(seed),plans=[],targets=[];
 let paint=existing.filter(s=>tool!=='paint'||s.randomTool!=='paint');
 for(const line of lines){
  const previous=new Set(line.randomCutIds||[]),nodes=canonicalLineNodes(line);
  const baseCovered=new Set(evaluateScenePaint(lines,paint).coveredIds);
  const eligible=nodes.filter(n=>tool==='scissors'?!n.paintCovered&&(!n.scissorMuted||previous.has(n.id)):!n.scissorMuted&&!baseCovered.has(n.id));
  const steps=Math.max(8,Math.ceil(line.source.durationTicks/384)*8);
  const selected=selectDrawGridSilence(eligible.map(n=>({...n,col:n.offsetTick/48})),{steps,random});
  if(tool==='scissors'){
   const cuts=Object.fromEntries([...previous].map(id=>[id,false]));for(const id of selected)cuts[id]=true;
   plans.push({lineId:line.id,cuts,randomCutIds:selected,randomSeed:seed});
   targets.push(...nodes.filter(n=>selected.includes(n.id)).map(n=>({...n,lineId:line.id})));
  }else{
   for(const id of selected){
    if(evaluateScenePaint(lines,paint).coveredIds.includes(id))continue;
    const node=nodes.find(n=>n.id===id),neighbors=lines.flatMap(canonicalLineNodes).filter(n=>n.id!==id).map(n=>Math.hypot((n.x-node.x)/.6,n.y-node.y)).filter(d=>d>1e-8);
    const stamp={id:`random-paint-${seed}-${id}`,seed:Math.floor(random()*4294967296),x:node.x,y:node.y,radius:Math.min(.045,...neighbors.map(d=>d*.27)),space:'surface-v2',owner:line.id,randomTool:'paint'};
    const result=evaluateScenePaint(lines,[...paint,stamp]);
    if(eligible.every(n=>result.coveredIds.includes(n.id)))continue;
    paint.push(stamp);targets.push({...node,lineId:line.id});
   }
  }
 }
 if(tool==='paint'){
  // Cosmetic spots use the same geometric coverage test, and are accepted only
  // away from every node. They cannot silently change the selected target set.
  for(let i=0;i<3;i++){
   const stamp={id:`random-cosmetic-${seed}-${i}`,seed:Math.floor(random()*4294967296),x:.08+random()*.84,y:.08+random()*.84,radius:.012,space:'surface-v2',owner:lines[0]?.id,randomTool:'paint'};
   if(!evaluateScenePaint(lines,[stamp]).coveredIds.length)paint.push(stamp);
  }
  // Co-located voices are physically covered together. Report all actual
  // targets, rather than hiding extra coverage behind a cached selection.
  const actual=evaluateScenePaint(lines,paint.filter(s=>s.randomTool==='paint'));
  targets.splice(0,targets.length,...actual.nodes.filter(n=>actual.coveredIds.includes(n.id)));
 }
 return {seed,tool,plans,paint,targets};
}
