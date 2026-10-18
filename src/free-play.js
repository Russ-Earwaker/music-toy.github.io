import {createLineSource,clamp01,LINE_MAX_LENGTH} from './free-play-line.js';




// No audition callback exists in this input layer. Only a completed stroke
// crosses into the musical model; cancel/lost capture never creates a source.
export function createLineDrawing({complete,change=()=>{}}){
 let stroke=null;
 return {
  begin(point){if(stroke)return false;stroke={points:[point],metric:{width:1,height:1},totalLength:0,capped:false};change(stroke);return true;},
  move(point){if(stroke&&!stroke.capped){const last=stroke.points.at(-1),p={x:clamp01(point.x),y:clamp01(point.y)},length=Math.hypot(p.x-last.x,p.y-last.y);if(length<1e-9)return;const remaining=LINE_MAX_LENGTH-stroke.totalLength,t=Math.min(1,remaining/length);stroke.points.push({x:last.x+(p.x-last.x)*t,y:last.y+(p.y-last.y)*t});stroke.totalLength=length>=remaining?LINE_MAX_LENGTH:stroke.totalLength+length;stroke.capped=stroke.totalLength>=LINE_MAX_LENGTH;change(stroke);}},
  release(point){if(!stroke)return null;this.move(point);const finished=stroke;stroke=null;change(null);const source=createLineSource(finished.points);if(source.events.length)complete(source);return source;},
  cancel(){stroke=null;change(null);},
  get stroke(){return stroke;},
 };
}
