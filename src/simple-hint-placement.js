// Read-only board geometry. No layout repair, physics or authored state.
export function hintCube(cube){
 const x=cube.x??cube.transform?.x,y=cube.y??cube.transform?.y,width=cube.width??cube.bounds?.width??58,height=cube.height??cube.bounds?.height??58;
 return {id:cube.id,x,y,width,height,left:x-width/2,top:y-height/2};
}
const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
function crosses(a,b,r){
 let low=0,high=1;
 for(const axis of ['x','y']){const size=axis==='x'?'width':'height',d=b[axis]-a[axis];if(Math.abs(d)<1e-9){if(a[axis]<r[axis]||a[axis]>r[axis]+r[size])return false;continue;}
  const u=(r[axis]-a[axis])/d,v=(r[axis]+r[size]-a[axis])/d;low=Math.max(low,Math.min(u,v));high=Math.min(high,Math.max(u,v));if(low>high)return false;
 }return true;
}
export function contextualTriggerHint({area,cubes,obstacles=[],demo='swipe',preferLateral=false}){
 const center={x:area.x+area.width/2,y:area.y+area.height/2};
 const visible=cubes.map(hintCube).filter(c=>Number.isFinite(c.x)&&Number.isFinite(c.y)&&c.left>=area.x&&c.left+c.width<=area.x+area.width&&c.top>=area.y&&c.top+c.height<=area.y+area.height)
  .filter(c=>!obstacles.some(r=>r.id!==c.id&&c.x>=r.x&&c.x<=r.x+r.width&&c.y>=r.y&&c.y<=r.y+r.height))
  .sort((a,b)=>Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y)||a.id.localeCompare(b.id)).slice(0,8);
 if(!visible.length)return null;
 const width=Math.min(460,area.width*.48,area.height*1.1),height=width*300/440,candidates=[];
 for(const c of visible){
  const left=c.left-width-32,right=c.left+c.width+32,top=c.top-height-32,bottom=c.top+c.height+32;
  const positions=[[left,c.y-width*180/440],[right,c.y-width*180/440],[c.x-width/2,top],[c.x-width/2,bottom],[left,top],[right,top],[left,bottom],[right,bottom]];
  for(const radius of [width*.65,width*.95,width*1.2])for(let i=0;i<16;i++){const angle=i*Math.PI/8;positions.push([c.x+Math.cos(angle)*radius-width/2,c.y+Math.sin(angle)*radius-width*180/440]);}
  for(const [rawX,rawY]of positions){
   const box={x:Math.max(area.x,Math.min(area.x+area.width-width,rawX)),y:Math.max(area.y,Math.min(area.y+area.height-height,rawY)),width},rect={...box,height};
   const origin={x:box.x+width/2,y:box.y+width*180/440},dx=c.x-origin.x,dy=c.y-origin.y,distance=Math.hypot(dx,dy),ux=dx/(distance||1),uy=dy/(distance||1);
   if(distance<100)continue;
   const edge=Math.min(c.width/2/(Math.abs(ux)||1e-12),c.height/2/(Math.abs(uy)||1e-12))+10;
   const end={x:c.x-ux*edge,y:c.y-uy*edge};
   const caption={x:box.x+width*.18,y:box.y+height*.03,width:width*.64,height:width*.18};
   const covering=obstacles.reduce((sum,r)=>sum+overlap(rect,r),0),textOverlap=obstacles.reduce((sum,r)=>sum+overlap(caption,r),0),blocked=demo==='swipe'?obstacles.filter(r=>r.id!==c.id&&crosses(origin,end,r)).length:0;
   const approachPenalty=preferLateral?((Math.abs(dx)<Math.max(100,Math.abs(dy))?1e9:0)+(distance<600?1e8:0)+Math.max(0,600-distance)*1000):0;
   const score=approachPenalty+covering*1000+textOverlap*5000+blocked*1e7+distance+Math.hypot(c.x-center.x,c.y-center.y)*.08;
   candidates.push({box,targetId:c.id,target:{x:c.x,y:c.y},worldOrigin:origin,worldEnd:end,origin:{x:220,y:180},end:{x:(end.x-box.x)*440/width,y:(end.y-box.y)*440/width},tapRadius:Math.hypot(end.x-origin.x,end.y-origin.y)*440/width,score});
  }
 }
 if(!candidates.length)return null;
 const {score,...best}=candidates.sort((a,b)=>a.score-b.score||a.targetId.localeCompare(b.targetId))[0];return best;
}
