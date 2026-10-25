const clamp=n=>Math.max(0,Math.min(1,n));
export function surfaceRegions(count=8){return Array.from({length:count},(_,index)=>({index,start:index/count,end:(index+1)/count}));}
export function surfaceRegionIndex(surface,progress){
 const p=clamp(progress??.5),regions=surface.regions||surfaceRegions(surface.voices[0].length);
 return regions.find(r=>p<r.end-1e-9)?.index??regions.at(-1).index;
}
export function worldSegment(object,segment){
 const {x,y,rotation=0}=object.transform||{x:0,y:0},c=Math.cos(rotation),s=Math.sin(rotation);
 const point=p=>({x:x+p.x*c-p.y*s,y:y+p.x*s+p.y*c});return {...segment,a:point(segment.a),b:point(segment.b)};
}
export function projectSegment(point,a,b){const dx=b.x-a.x,dy=b.y-a.y,progress=clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1));const position={x:a.x+dx*progress,y:a.y+dy*progress};return {progress,position,distance:Math.hypot(point.x-position.x,point.y-position.y)};}
export function surfaceContact(object,contact={}){
 // Trigger envelopes may contain stale pitch/region fields. Only their nested
 // geometric contact participates in receiver-side sound selection.
 contact=contact?.contact||contact||{};
 const segments=object.capabilities?.playable?.surface?.segments||[];
 if(!segments.length)return contact;
 if(Number.isFinite(contact.localPosition?.x)&&Number.isFinite(contact.localPosition?.y)){
  const hit=segments.map(s=>({...projectSegment(contact.localPosition,s.a,s.b),lane:s.lane})).sort((a,b)=>a.distance-b.distance||a.lane-b.lane)[0];
  return {...hit,localPosition:hit.position,position:worldSegment(object,{a:hit.position,b:hit.position}).a};
 }
 if(Number.isFinite(contact.progress)&&Number.isInteger(contact.lane))return {lane:contact.lane,progress:clamp(contact.progress)};
 const point=contact.position||object.transform||{x:0,y:0};
 return segments.map(segment=>{const s=worldSegment(object,segment);return {...projectSegment(point,s.a,s.b),lane:segment.lane};}).sort((a,b)=>a.distance-b.distance||a.lane-b.lane)[0]||contact;
}
export function surfaceVoice(object,contact={}){
 const surface=object.capabilities?.playable?.surface;if(!surface)return null;
 const hit=surfaceContact(object,contact),lane=Math.max(0,Math.min(surface.voices.length-1,hit.lane||0)),regions=surface.voices[lane],region=surfaceRegionIndex(surface,hit.progress);
 const progress=clamp(hit.progress??.5),segment=surface.segments[lane],localPosition={x:segment.a.x+(segment.b.x-segment.a.x)*progress,y:segment.a.y+(segment.b.y-segment.a.y)*progress};
 return {lane,region,progress,contact:{lane,progress,localPosition},sourceMidis:[...regions[region]],sourceMidi:regions[region][0]};
}
// Continuous swept circle against a finite capsule, including the end caps.
export function sweepCapsule(ball,velocity,segment,radius,limit){
 const {a,b}=segment,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)return null;
 const tx=dx/length,ty=dy/length,nx=-ty,ny=tx,p=projectSegment(ball,a,b),vx=velocity.x,vy=velocity.y;
 if(p.distance<radius-1e-8){const ux=p.distance?(ball.x-p.position.x)/p.distance:(vx*nx+vy*ny>0?-nx:nx),uy=p.distance?(ball.y-p.position.y)/p.distance:(vx*nx+vy*ny>0?-ny:ny);return {time:0,nx:ux,ny:uy,overlap:radius-p.distance};}
 const hits=[],x=(ball.x-a.x)*tx+(ball.y-a.y)*ty,y=(ball.x-a.x)*nx+(ball.y-a.y)*ny,vn=vx*nx+vy*ny;
 for(const sign of [-1,1]){const time=(sign*radius-y)/vn,along=x+(vx*tx+vy*ty)*time;if(vn*sign<0&&time>=-1e-10&&time<=limit&&along>=0&&along<=length)hits.push({time:Math.max(0,time),nx:sign*nx,ny:sign*ny});}
 for(const end of [a,b]){const qx=ball.x-end.x,qy=ball.y-end.y,A=vx*vx+vy*vy,B=qx*vx+qy*vy,C=qx*qx+qy*qy-radius*radius,D=B*B-A*C;if(D<0||!A)continue;const time=(-B-Math.sqrt(D))/A;if(time>=-1e-10&&time<=limit){const x=qx+vx*time,y=qy+vy*time,d=Math.hypot(x,y);hits.push({time:Math.max(0,time),nx:x/d,ny:y/d});}}
 return hits.sort((a,b)=>a.time-b.time)[0]||null;
}
