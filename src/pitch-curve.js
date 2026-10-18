// Shape-preserving cubic Hermite interpolation in authored musical time.
export function createPitchCurve(notes,durationTicks){
 const knots=notes.map(n=>({t:n.offsetTick,y:n.sourceMidi??n.midi})).sort((a,b)=>a.t-b.t);
 if(knots.length&&knots.at(-1).t<durationTicks)knots.push({t:durationTicks,y:knots.at(-1).y});
 const slope=i=>{const a=knots[i],b=knots[i+1];return b&&b.t>a.t?(b.y-a.y)/(b.t-a.t):0;};
 const tangents=knots.map((_,i)=>{
  if(!i)return slope(0);if(i===knots.length-1)return slope(i-1);
  const a=slope(i-1),b=slope(i);if(a*b<=0)return 0;
  const before=knots[i].t-knots[i-1].t,after=knots[i+1].t-knots[i].t,w1=2*after+before,w2=after+2*before;
  return (w1+w2)/(w1/a+w2/b);
 });
 return tick=>{
  if(!knots.length)return 60;if(knots.length===1)return knots[0].y;
  let i=0;while(i<knots.length-2&&tick>knots[i+1].t)i++;
  const a=knots[i],b=knots[i+1],span=b.t-a.t;if(!span)return b.y;
  const u=Math.max(0,Math.min(1,(tick-a.t)/span)),u2=u*u,u3=u2*u;
  return (2*u3-3*u2+1)*a.y+(u3-2*u2+u)*span*tangents[i]+(-2*u3+3*u2)*b.y+(u3-u2)*span*tangents[i+1];
 };
}
