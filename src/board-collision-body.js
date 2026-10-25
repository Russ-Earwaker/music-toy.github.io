import {worldSegment} from './receiver-surface.js';
// Collision adaptation is capability/geometry based, independent of toy kind.
export function boardCollisionBody(o){
 if(!o.capabilities?.triggerReceiver)return null;
 return {id:o.id,x:o.transform.x,y:o.transform.y,radius:o.bounds.radius,width:o.bounds.width,height:o.bounds.height,
  ...(o.capabilities.physicsBody?.segments?{segments:o.capabilities.physicsBody.segments.map(s=>worldSegment(o,s)),surfaceRadius:o.capabilities.physicsBody.radius||0}:{}),
  sourceMidi:o.capabilities.pitchSource?.midi??o.capabilities.playable?.midi,boardObject:o};
}
