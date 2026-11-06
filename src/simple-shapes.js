// One geometry definition for board rendering, collisions, bounds and previews.
const star=Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,r=i%2?.23:.5;return {x:Math.cos(a)*r,y:Math.sin(a)*r};});
function normalize(points){
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),l=Math.min(...xs),r=Math.max(...xs),t=Math.min(...ys),b=Math.max(...ys);
 return points.map(p=>({x:(p.x-l)/(r-l)-.5,y:(p.y-t)/(b-t)-.5}));
}
export const simpleShapes=Object.freeze([
 {id:'cube',label:'Cube',geometry:'box'},
 {id:'circle',label:'Circle',geometry:'circle'},
 {id:'triangle',label:'Triangle',geometry:'polygon',points:[{x:0,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}]},
 {id:'diamond',label:'Diamond',geometry:'polygon',points:[{x:0,y:-.5},{x:.5,y:0},{x:0,y:.5},{x:-.5,y:0}]},
 {id:'hexagon',label:'Hex',geometry:'polygon',points:[{x:-.25,y:-.5},{x:.25,y:-.5},{x:.5,y:0},{x:.25,y:.5},{x:-.25,y:.5},{x:-.5,y:0}]},
 {id:'star',label:'Star',geometry:'polygon',points:normalize(star)},
].map(shape=>Object.freeze({...shape,preview:`shape:${shape.id}`,points:shape.points&&Object.freeze(shape.points.map(Object.freeze))})));
export function shapeDefinition(type='cube'){
 const shape=simpleShapes.find(s=>s.id===type);if(!shape)throw Error('Unknown placement shape: '+type);return shape;
}
export function shapeBounds(type,width=58,height=58){
 const shape=shapeDefinition(type);
 if(shape.geometry==='circle')return {radius:Math.min(width,height)/2};
 return {width,height,...(shape.points?{polygon:shape.points.map(p=>({x:p.x*width,y:p.y*height}))}:{})};
}
export function shapeClip(type){
 const shape=shapeDefinition(type);
 return shape.geometry==='circle'?'circle(50%)':shape.points?`polygon(${shape.points.map(p=>`${(p.x+.5)*100}% ${(p.y+.5)*100}%`).join(',')})`:'none';
}
export function shapePreviewGeometry(type){
 const shape=shapeDefinition(type);
 if(shape.geometry==='circle')return '<circle cx="32" cy="25" r="17"/>';
 if(!shape.points)return '<path d="M15 8h34v34H15Z"/>';
 return `<path d="M${shape.points.map(p=>`${32+p.x*34} ${25+p.y*34}`).join('L')}Z"/>`;
}
export function pointInPolygon(point,polygon){
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
