// Split the normal four-bar generator's authored output into four ordinary
// one-bar toys. No phrase notes remain outside the resulting toy states.
export function splitDrawgridPhrase(state){
 if(state.steps!==32)throw new Error('A four-part phrase needs 32 generated steps.');
 const at=(points,x)=>{
  const right=points.findIndex(p=>p.nx>=x);
  if(right<=0)return {...points[Math.max(0,right)],nx:x};
  const a=points[right-1],b=points[right],t=(x-a.nx)/(b.nx-a.nx||1);
  return {nx:x,ny:a.ny+(b.ny-a.ny)*t};
 };
 return Array.from({length:4},(_,bar)=>{
  const start=bar/4,end=(bar+1)/4;
  const strokes=(state.strokes||[]).flatMap(stroke=>{
   const points=stroke.ptsN||stroke.__ptsN||[];
   if(!points.length||points[0].nx>end||points.at(-1).nx<start)return [];
   const a=Math.max(start,points[0].nx),b=Math.min(end,points.at(-1).nx);
   return [{...stroke,ptsN:[at(points,a),...points.filter(p=>p.nx>a&&p.nx<b),at(points,b)].map(p=>({nx:(p.nx-start)*4,ny:p.ny}))}];
  });
  return structuredClone({...state,steps:8,strokes,nodes:Object.fromEntries(Object.entries(state.nodes||{}).map(([key,values])=>[key,values.slice(bar*8,bar*8+8)])),manualOverrides:(state.manualOverrides||[]).slice(bar*8,bar*8+8),meta:{preserveNodesOverStrokes:true}});
 });
}
