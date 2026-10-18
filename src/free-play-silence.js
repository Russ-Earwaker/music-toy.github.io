import {seededRandom} from './drawgrid/dg-random-silence.js';
// Reversible authored silence; presentation never changes pitch, time or geometry.
export const eventMuted=event=>!!(event.scissorMuted||event.paintCovered);
export function updateSilence(notes,{cuts,paint,coveredIds}){
 let changed=false;
 for(const note of notes){
  const cut=cuts?.[note.id]??!!note.scissorMuted;
  const covered=coveredIds?coveredIds.includes(note.id):paint?paintCoverage(paint,note.id):!!note.paintCovered;
  if(cut!==!!note.scissorMuted||covered!==!!note.paintCovered)changed=true;
  note.scissorMuted=cut;note.paintCovered=covered;
 }
 return changed;
}
export function pointSegmentDistance(p,a,b){
 const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);
}
export function paintCoverage(paint,id){return (paint||[]).some(s=>s.notes.includes(id));}
export function splatDroplets(splat){
 const random=seededRandom(splat.seed);
 return [{x:0,y:0,r:1},...Array.from({length:11},()=>{const angle=random()*Math.PI*2,d=.6+random()*1.1;return {x:Math.cos(angle)*d,y:Math.sin(angle)*d,r:.12+random()*.35};})];
}
export function splatCovers(splat,p,center,width,height){
 return paintShapes(splat,{x:center.x/width,y:center.y/height}).some(shape=>paintShapeContains(shape,{x:p.x/width,y:p.y/height}));
}
// One fixed logical space for interaction, rendering and canonical coverage.
// CSS dimensions and transient string/sag animation never set note state.
export function paintShapes(splat,center={x:splat.x,y:splat.y}){
 return splatDroplets(splat).map(d=>({x:center.x+d.x*splat.radius*.6,y:center.y+d.y*splat.radius,rx:d.r*splat.radius*.6,ry:d.r*splat.radius}));
}
export const paintShapeContains=(s,p,padding=0)=>Math.pow((p.x-s.x)/(s.rx+padding),2)+Math.pow((p.y-s.y)/(s.ry+padding),2)<=1+1e-12;
export function drawPaintShapes(ctx,shapes,width,height,alpha=1){
 ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle='#05070b';
 for(const s of shapes){ctx.beginPath();ctx.ellipse(s.x*width,s.y*height,s.rx*width,s.ry*height,0,0,Math.PI*2);ctx.fill();}ctx.restore();
}
