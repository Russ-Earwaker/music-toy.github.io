// One clockwise circumference is the full canonical Drum period; zero is noon.
export function drumRingPoint(tick,periodLoops){
 const angle=tick/(periodLoops*384)*Math.PI*2;
 return {x:64+58*Math.sin(angle),y:64-58*Math.cos(angle),angle};
}
