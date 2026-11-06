// Shared world-space gestures: both comparison backends receive identical samples.
export const gestures={
 press:{duration:2000,point:()=>({x:0,y:0})},
 slow:{duration:3600,point:t=>({x:-110+Math.min(t*.06,220),y:0})},
 fast:{duration:1040,point:t=>({x:-260+Math.min(t*.5,520),y:0})},
 pause:{duration:1900,point:t=>({x:-110+Math.min(t*.24,220),y:0})},
 turn:{duration:1760,point:t=>{const a=Math.min(t*.25,440);return a<220?{x:-110+a,y:-80}:{x:110,y:-80+a-220};}},
 loop:{duration:3500,point:t=>({x:Math.cos(t*.0018)*100,y:Math.sin(t*.0018)*85})},
 curve:{duration:3600,point:t=>{const x=Math.min(t*.10,360);return {x:-180+x,y:70*Math.sin(x/360*Math.PI)};}},
 reverse:{duration:4000,point:t=>{const a=(t*.16)%640;return {x:-160+(a<320?a:640-a),y:0};}},
 longStraight:{duration:3000,point:t=>({x:-300+Math.min(t*.2,600),y:0})},
 longCurve:{duration:3600,point:t=>{const u=Math.min(t/3600,1);return {x:-270+540*u,y:100*Math.sin(u*Math.PI*1.8)};}},
 diagonal:{duration:3000,point:t=>{const u=Math.min(t/3000,1);return {x:-180+360*u,y:-180+360*u};}},
 shallow:{duration:3000,point:t=>{const u=Math.min(t/3000,1);return {x:-260+520*u,y:-60+120*u};}},
 vertical:{duration:3000,point:t=>({x:0,y:-170+Math.min(t/3000,1)*340})},
 slowLong:{duration:6000,point:t=>({x:-240+Math.min(t*.08,480),y:0})},
 tightCurve:{duration:2200,point:t=>({x:Math.cos(t/2200*Math.PI*2)*65,y:Math.sin(t/2200*Math.PI*2)*65})}
};
