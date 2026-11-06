// Lagrangian disturbance field: scalar energy travels with the liquid parcel,
// not with the pointer or a screen-space trail. Density/velocity remain separate.
export function createAdvectedDisturbance(count,{decaySeconds=1.05}={}){
 const values=new Float32Array(count);
 return {
  values,
  inject(index,displacement,pointerSpeed){
   if(displacement<=0||pointerSpeed<=0)return;
   const strength=.3+.7*Math.min(1,pointerSpeed/300);
   values[index]=Math.min(1,values[index]+displacement/10*strength);
  },
  decay(dt){const factor=Math.exp(-dt/decaySeconds);for(let i=0;i<count;i++)values[i]*=factor;},
  clear(index){values[index]=0;},
  // Reconstruct/sample the advected field at the current material position.
  site(index,particle){return {x:particle.x,y:particle.y,energy:values[index]};},
  get peak(){let peak=0;for(const v of values)peak=Math.max(peak,v);return peak;}
 };
}
