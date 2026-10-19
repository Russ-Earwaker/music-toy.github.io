import {createPitchCurve} from './pitch-curve.js';
import {linePointAt,clamp01,LINE_MAX_TICKS} from './free-play-line.js';
import {eventMuted,paintShapes,drawPaintShapes} from './free-play-silence.js';
import {drawGridLineColor} from './drawgrid/dg-line-style.js';

// Interpolate geometric heights, independently of MIDI and the board's pitch rows.
// Include musical nodes so the smooth contour passes through their original Y.
function createStraightenedCurve(source){
 const distances=[...new Set([...source.path.distances,...source.events.map(e=>e.pathDistance)])].sort((a,b)=>a-b);
 // The shared Hermite helper interpolates scalars; here those scalars are Y,
 // not pitches. Keep the original path immutable for exact Re-coil restoration.
 const curve=createPitchCurve(distances.map(d=>({offsetTick:d,sourceMidi:linePointAt(source.path,d).y})),source.path.totalLength);
 return progress=>({x:.06+clamp01(progress)*.88*source.durationTicks/LINE_MAX_TICKS,y:curve(clamp01(progress)*source.path.totalLength)});
}
export const straightenedLinePoint=(source,progress)=>createStraightenedCurve(source)(progress);

export function linePresentationPoint(source,progress,morph=0,curve){
 const p=linePointAt(source.path,clamp01(progress)*source.path.totalLength);
 if(!morph)return p;
 const target=(curve||createStraightenedCurve(source))(progress);
 return {x:p.x+(target.x-p.x)*morph,y:p.y+(target.y-p.y)*morph};
}
export function linePresentation(source,morph=0){
 if(!morph)return source;
 const curve=createStraightenedCurve(source);
 const distances=[...new Set([...source.path.distances,...source.events.map(e=>e.pathDistance),...Array.from({length:513},(_,i)=>i/512*source.path.totalLength)])].sort((a,b)=>a-b);
 const path={...source.path,distances,points:distances.map(d=>linePresentationPoint(source,d/source.path.totalLength,morph,curve))};
 return {...source,path,events:source.events.map(e=>{
  const progress=e.pathDistance/source.path.totalLength,original=linePointAt(source.path,e.pathDistance);
  const targetX=.06+clamp01(progress)*.88*source.durationTicks/LINE_MAX_TICKS;
  return {...e,x:original.x+(targetX-original.x)*morph,y:original.y};
 })};
}

export function lineHighlight(source,phase){
 // Musical time and cumulative distance share one normalized progress value.
 const distance=clamp01(phase??0)*source.path.totalLength,points=[];
 for(let i=0;i<source.path.points.length;i++){
  if(source.path.distances[i]>distance)break;
  points.push(source.path.points[i]);
 }
 if(source.path.points.length)points.push(linePointAt(source.path,distance));
 return {distance,points,tip:linePointAt(source.path,distance)};
}
export function paintLinePath(ctx,points,w,h){
 if(!points.length)return;
 ctx.beginPath();ctx.moveTo(points[0].x*w,points[0].y*h);
 for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x*w,points[i].y*h);
 ctx.stroke();
}
export function looseEndMotion(seconds,side=1){
 if(!Number.isFinite(seconds))return {x:0,y:32};
 const t=Math.max(0,seconds),damping=Math.exp(-3.8*t);
 return {x:side*22*damping*Math.sin(11*t),y:32*(1-Math.exp(-7*t))+26*damping*Math.sin(11*t)};
}
function cutProfiles(source,motion,now=0){
 const positions=source.events.map(e=>e.pathDistance/source.path.totalLength);
 return source.events.flatMap((event,i)=>{
  const state=motion?.get(event.id),t=Math.min(1,Math.max(0,(now-(state?.mendAt??-Infinity))/350));
  const amount=event.scissorMuted?(state&&now<state.cutAt?0:1):state&&!state.cut?1-t*t*(3-2*t):0;
  return amount>0?[{id:event.id,y:event.y,at:positions[i],amount,elapsed:state?(now-state.cutAt)/1000:Infinity,radius:Math.min(.055,...positions.map(p=>Math.abs(p-positions[i])).filter(d=>d>1e-9).map(d=>d*.8))}]:[];
 });
}
export function stringPoint(source,progress,morph=0,height=600,curve,cuts=cutProfiles(source)){
 const p=linePresentationPoint(source,progress,morph,curve);
 let droop=0,swing=0;
 for(const {at,radius,elapsed=Infinity,amount=1,y} of cuts){
  const distance=Math.abs(progress-at);
  if(distance<radius){
   const weight=Math.pow(Math.max(0,1-Math.max(0,distance-.012)/Math.max(.001,radius-.012)),2),pose=looseEndMotion(elapsed,progress<at?-1:1);
   droop=Math.max(droop,(pose.y+Math.max(0,(y-p.y)*height))/height*weight*amount);
   swing+=pose.x/height*weight*amount;
  }
 }
 return {x:p.x+swing,y:p.y+droop};
}
export function cutEnds(source,event,morph,width,height,motion,now=0){
 const progress=event.pathDistance/source.path.totalLength;
 const profiles=cutProfiles(source,motion,now);
 return [-1,1].map(side=>{const p=stringPoint(source,clamp01(progress+side*.012),morph,height,undefined,profiles);return {x:p.x*width,y:p.y*height};});
}
export function stringSegments(source,morph,height,phase=1,motion,now=0){
 const curve=morph?createStraightenedCurve(source):null;
 const profiles=cutProfiles(source,motion,now),cuts=profiles.map(c=>({at:c.at,gap:.012*c.amount}));
 const distances=[...new Set([...source.path.distances.map(d=>d/source.path.totalLength),...Array.from({length:513},(_,i)=>i/512),...cuts.flatMap(c=>[clamp01(c.at-c.gap),clamp01(c.at+c.gap)]),clamp01(phase)])].sort((a,b)=>a-b);
 const segments=[];let segment=[];
 for(const p of distances){
  if(p>phase)break;
  if(cuts.some(c=>Math.abs(p-c.at)<c.gap-1e-9)){if(segment.length)segments.push(segment);segment=[];continue;}
  // Adjacent cuts can leave no sample in the gap; split by interval too.
  const previous=segment.at(-1)?.progress;
  if(previous!=null&&cuts.some(c=>previous<=c.at-c.gap+1e-9&&p>=c.at+c.gap-1e-9)){segments.push(segment);segment=[];}
  segment.push({...stringPoint(source,p,morph,height,curve,profiles),progress:p});
 }
 if(segment.length)segments.push(segment);return segments;
}
export function paintCenter(source,splat,morph,width,height){
 if(splat.space==='surface-v2')return {x:splat.x*width,y:splat.y*height};
 const p=linePresentationPoint(source,splat.progress,morph);return {x:(p.x+splat.dx)*width,y:(p.y+splat.dy)*height};
}
export function drawLinePaint(ctx,source,morph,width,height){
 for(const splat of source.paint||[]){const center=paintCenter(source,splat,morph,1,1);drawPaintShapes(ctx,paintShapes(splat,center),width,height);}
}
export function drawMusicalLine(ctx,original,{width:w,height:h,phase=null,age=Infinity,flashes=new Map(),now=0,color=drawGridLineColor(0),morph=0,motion,points=true}={}){
 const paintSegments=progress=>{for(const points of stringSegments(original,morph,h,progress,motion,now))paintLinePath(ctx,points,w,h);};
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=6;ctx.strokeStyle=color;ctx.globalAlpha=.28;ctx.shadowColor=color;ctx.shadowBlur=8;
 paintSegments(1);ctx.globalAlpha=1;
 if(phase!==null){
  ctx.shadowColor=color;ctx.shadowBlur=14;ctx.strokeStyle=color;ctx.lineWidth=5;
  ctx.globalAlpha=.65+.12*Math.sin(now/170);paintSegments(phase);ctx.globalAlpha=1;
  ctx.lineWidth=2;ctx.strokeStyle='#e8fff8';ctx.shadowBlur=20;ctx.globalAlpha=.6;paintSegments(phase);ctx.globalAlpha=1;
 }
 ctx.restore();
 if(points)drawMusicalPoints(ctx,original,{width:w,height:h,age,flashes,now,color,morph});
}
// Kept separate so surface paint cannot obscure the playable/cuttable markers.
export function drawMusicalPoints(ctx,original,{width:w,height:h,age=Infinity,flashes=new Map(),now=0,color=drawGridLineColor(0),morph=0}={}){
 const source=linePresentation(original,morph);ctx.save();
 for(let i=0;i<source.events.length;i++){
  const node=source.events[i],bloom=clamp01((age-i*22)/160);if(!bloom)continue;
  const muted=eventMuted(node),flash=muted?0:clamp01(1-(now-(flashes.get(i)??-Infinity))/320);
  const r=(muted?4.5:4.8+flash*5.3)*bloom,x=node.x*w,y=node.y*h;
  ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.fillStyle='#0b1624';
  ctx.beginPath();ctx.arc(x,y,r+2,0,Math.PI*2);ctx.fill();
  ctx.shadowColor=muted?'#d9e9f5':color;ctx.shadowBlur=muted?5:17+flash*24;
  ctx.strokeStyle=node.scissorMuted?'#f6b6a8':node.paintCovered?'#d9e9f5':'#e8f7ff';ctx.lineWidth=1.4;
  ctx.fillStyle=muted?'#172332':flash?'#fff8d0':color;
  ctx.beginPath();
  if(node.paintCovered){ctx.moveTo(x,y-r-1);ctx.lineTo(x+r+1,y);ctx.lineTo(x,y+r+1);ctx.lineTo(x-r-1,y);ctx.closePath();}
  else ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fill();ctx.stroke();
  if(node.scissorMuted){ctx.shadowBlur=0;ctx.beginPath();ctx.moveTo(x-r*.65,y+r*.65);ctx.lineTo(x+r*.65,y-r*.65);ctx.stroke();}
  else if(!muted){ctx.fillStyle='#f2fcff';ctx.beginPath();ctx.arc(x,y,Math.max(1.6,r*.36),0,Math.PI*2);ctx.fill();}
  if(flash>.15){ctx.strokeStyle='#fff8d0';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(x-r*1.8,y);ctx.lineTo(x+r*1.8,y);ctx.moveTo(x,y-r*1.8);ctx.lineTo(x,y+r*1.8);ctx.stroke();}
 }
 ctx.restore();
}