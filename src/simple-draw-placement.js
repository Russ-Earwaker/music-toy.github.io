import {createLineSource} from './free-play-line.js';
import {authoredBounds,fitAuthoredBounds,SIMPLE_DRAW_INSETS} from './container-fit.js';
export function prepareBoardDrawing(points){
 const raw=authoredBounds(points);if(!raw)return null;
 const width=Math.max(1068,raw.width),height=Math.max(520,raw.height),origin={x:raw.x+(raw.width-width)/2,y:raw.y+(raw.height-height)/2};
 const source=createLineSource(points.map(p=>({x:(p.x-origin.x)/width,y:(p.y-origin.y)/height})));
 if(!source.events.length)return null;
 const content=authoredBounds(source.path.points.map(p=>({x:origin.x+p.x*width,y:origin.y+p.y*height}))),bounds=fitAuthoredBounds(content,{insets:SIMPLE_DRAW_INSETS});
 return {source,bounds,contentSpace:{x:origin.x-bounds.x,y:origin.y-bounds.y,width,height}};
}
export function drawingAuthoredBounds(path,space,bounds){return authoredBounds(path.points.map(p=>({x:bounds.x+space.x+p.x*space.width,y:bounds.y+space.y+p.y*space.height})));}
