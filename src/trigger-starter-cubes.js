export const STARTER_CUBE_RADIUS=650;
export const STARTER_CUBE_OFFSETS=Object.freeze([[-110,-50],[110,15],[0,170]]);

export function triggerCreationPoint({viewport,screenToWorld}){
 const rect=viewport.getBoundingClientRect(),x=rect.left+rect.width*.47,y=rect.top+rect.height*.52;
 return screenToWorld({clientX:x,clientY:y,x,y});
}

// Shared, independent canonical Cubes. No trigger ownership or private copies.
export function seedTriggerCubes({objects,center}){
 const nearby=objects.list('cube').some(c=>c.boardObject?.capabilities.triggerReceiver&&Number.isFinite(c.boardObject.capabilities.pitchSource?.midi)&&Math.hypot(c.x-center.x,c.y-center.y)<=STARTER_CUBE_RADIUS);
 if(nearby)return [];
 return STARTER_CUBE_OFFSETS.map(([dx,dy])=>objects.addCube(center.x+dx,center.y+dy,{scatter:true}));
}
