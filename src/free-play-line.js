import {buildPalette,midiToName} from './note-helpers.js';
import {patternOriginTick} from './source-phase.js';
import {DEFAULT_DRAWGRID_STEPS,drawgridLoopLengthTicks} from './drawgrid/dg-pattern-length.js';

export const LINE_STEP_COUNT=DEFAULT_DRAWGRID_STEPS;
export const LINE_DURATION_TICKS=drawgridLoopLengthTicks(LINE_STEP_COUNT);
export const LINE_STEP_TICKS=LINE_DURATION_TICKS/LINE_STEP_COUNT;
export const LINE_MIN_LENGTH=.03;
export const LINE_MAX_LENGTH=4;
export const LINE_MAX_TICKS=LINE_DURATION_TICKS*4;
export const lineDurationTicks=length=>length<LINE_MIN_LENGTH?0:Math.max(1,Math.round(Math.min(length,LINE_MAX_LENGTH)/LINE_MAX_LENGTH*LINE_MAX_TICKS));
export const SAFE_LINE_MIDI=Object.freeze(buildPalette(48)); // C-major pentatonic, C3–A5.
export const FREE_PLAY_PITCH_CLASSES=Object.freeze([...new Set(SAFE_LINE_MIDI.map(midi=>midi%12))]);
export const clamp01=n=>Math.max(0,Math.min(1,n));
export function linePitch(y){
 const target=SAFE_LINE_MIDI[0]+(1-clamp01(y))*(SAFE_LINE_MIDI.at(-1)-SAFE_LINE_MIDI[0]);
 return SAFE_LINE_MIDI.reduce((a,b)=>Math.abs(b-target)<Math.abs(a-target)?b:a);
}
export function measureLine(points,metric={width:1,height:1},maximum=Infinity){
 const path={points:[],distances:[],totalLength:0,metric:{width:Math.max(.001,metric.width||1),height:Math.max(.001,metric.height||1)}};
 for(const input of points||[]){
  if(!Number.isFinite(input.x)||!Number.isFinite(input.y))continue;
  const p={x:clamp01(input.x),y:clamp01(input.y)},last=path.points.at(-1);
  const length=last?Math.hypot((p.x-last.x)*path.metric.width,(p.y-last.y)*path.metric.height):0;
  if(last&&length<1e-9)continue;
  if(path.totalLength>=maximum)break;
  if(last&&path.totalLength+length>maximum){const t=(maximum-path.totalLength)/length;p.x=last.x+(p.x-last.x)*t;p.y=last.y+(p.y-last.y)*t;path.totalLength=maximum;}
  else path.totalLength+=length;
  path.points.push(p);path.distances.push(path.totalLength);
 }
 return path;
}
export function linePointAt(path,distance){
 if(!path.points.length)return {x:0,y:0};
 const target=Math.max(0,Math.min(path.totalLength,distance));
 if(target===path.totalLength)return {...path.points.at(-1)};
 let lo=0,hi=path.distances.length-1;
 while(lo<hi){const mid=(lo+hi)>>1;if(path.distances[mid]<target)lo=mid+1;else hi=mid;}
 if(lo===0)return {...path.points[0]};
 const a=path.points[lo-1],b=path.points[lo],span=path.distances[lo]-path.distances[lo-1],t=span?(target-path.distances[lo-1])/span:0;
 return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
}
export function createLineSource(points,metric){
 // Logical coordinates always use the fixed unit square, independent of the
 // canvas aspect, CSS pixels and device scale. Metric is retained for old saves.
 const path=measureLine(points,{width:1,height:1},LINE_MAX_LENGTH),events=[];
 const durationTicks=lineDurationTicks(path.totalLength);
 if(durationTicks){
  const count=Math.ceil(durationTicks/LINE_STEP_TICKS);
  for(let i=0;i<count;i++){
   const pathDistance=i*LINE_STEP_TICKS/durationTicks*path.totalLength,p=linePointAt(path,pathDistance),midi=linePitch(p.y);
   events.push({...p,midi,note:midiToName(midi),offsetTick:Math.round(i*LINE_STEP_TICKS),pathDistance});
  }
 }
 return {version:3,instrument:'PIANO',musicalRole:'melody',durationTicks,path,events};
}
// Native event-provider interface consumed by the existing note scheduler.
export function lineEventsInWindow(source,instance,fromTick,toTick){
 if(!instance?.active||!source?.events?.length)return [];
 const duration=source.durationTicks,origin=patternOriginTick(instance),from=Math.max(fromTick,instance.startTick),to=Math.min(toTick,instance.endTick??Infinity),result=[];
 for(let nodeIndex=0;nodeIndex<source.events.length;nodeIndex++){
  const node=source.events[nodeIndex];
  let loop=Math.max(0,Math.ceil((from-origin-node.offsetTick)/duration));
  for(let tick=origin+loop*duration+node.offsetTick;tick<to;tick=origin+(++loop)*duration+node.offsetTick)
   if(tick>=from)result.push({...node,nodeIndex,eventTick:tick,eventKey:`line-node:${nodeIndex}`});
 }
 return result.sort((a,b)=>a.eventTick-b.eventTick);
}
export function linePlaybackPhase(instance,transportTick){
 if(!instance?.active||transportTick<instance.startTick||transportTick>=(instance.endTick??Infinity))return null;
 const duration=instance.loopLengthTicks||LINE_DURATION_TICKS;
 return ((transportTick-patternOriginTick(instance))%duration+duration)%duration/duration;
}
