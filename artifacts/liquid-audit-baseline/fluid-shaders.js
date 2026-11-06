export const fieldVertex=`#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.0-1.0,0,1);}`;

export const solverFragment=`#version 300 es
precision highp float;
precision highp int;
uniform sampler2D velocity;
uniform sampler2D material;
uniform sampler2D pressure;
uniform sampler2D divergence;
uniform int pass;
uniform vec2 extent;
uniform vec2 origin;
uniform vec2 shift;
uniform vec2 pointer;
uniform vec2 pointerVelocity;
uniform float radius;
uniform float brushActive;
uniform float dt;
uniform float cell;
uniform float maxSpeed;
uniform float viscosity;
uniform float densityDiffusion;
uniform float velocityDecay;
uniform float disturbanceDecay;
uniform float heightRecovery;
uniform float heightSmoothing;
uniform float surfaceDepth;
uniform vec2 strokeStart;
in vec2 uv;
out vec4 result;
vec4 fetch(sampler2D t,ivec2 p,vec4 outside){ivec2 size=textureSize(t,0);if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,size)))return outside;return texelFetch(t,p,0);}
// Explicit bilinear sampling: no float-linear extension dependency.
vec4 sampleField(sampler2D t,vec2 q,vec4 outside){
 vec2 pos=q*vec2(textureSize(t,0))-.5;ivec2 p=ivec2(floor(pos));vec2 f=fract(pos);
 return mix(mix(fetch(t,p,outside),fetch(t,p+ivec2(1,0),outside),f.x),mix(fetch(t,p+ivec2(0,1),outside),fetch(t,p+ivec2(1,1),outside),f.x),f.y);
}
bool solid(ivec2 p){vec2 q=(vec2(p)+.5)*cell+origin;return brushActive>.5&&distance(q,pointer)<radius;}
vec2 wallVelocity(ivec2 p){ivec2 size=textureSize(velocity,0);if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,size)))return vec2(0);return solid(p)?pointerVelocity:texelFetch(velocity,p,0).xy;}
float neighbourPressure(ivec2 p,float center){ivec2 size=textureSize(pressure,0);if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,size))||solid(p))return center;return texelFetch(pressure,p,0).x;}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);vec2 world=origin+uv*extent;
 if(pass==0){
  vec2 q=uv+shift/extent;
  vec2 v=sampleField(velocity,q,vec4(0)).xy;
  vec2 advected=sampleField(velocity,q-v*dt/extent,vec4(0)).xy;
  vec2 texel=1.0/vec2(textureSize(velocity,0));
  vec2 lap=sampleField(velocity,q+vec2(texel.x,0),vec4(0)).xy+sampleField(velocity,q-vec2(texel.x,0),vec4(0)).xy+
   sampleField(velocity,q+vec2(0,texel.y),vec4(0)).xy+sampleField(velocity,q-vec2(0,texel.y),vec4(0)).xy-4.0*v;
  v=(advected+lap*viscosity*dt/(cell*cell))*exp(-velocityDecay*dt);
  if(brushActive>.5){
   vec2 delta=world-pointer;float d=length(delta);vec2 n=delta/max(d,.001);
   float boundary=1.0-smoothstep(cell*.3,cell*2.5,abs(d-radius));
   float normal=max(0.0,dot(pointerVelocity,n));
   vec2 wall=n*normal*.7+pointerVelocity*.18;
   v=mix(v,wall,boundary*(1.0-exp(-18.0*dt)));
   if(d<radius)v=pointerVelocity;
  }
  v*=min(1.0,maxSpeed/max(length(v),.001));result=vec4(v,0,1);return;
 }
 if(pass==1){
  if(solid(p)){result=vec4(0);return;}
  float div=(wallVelocity(p+ivec2(1,0)).x-wallVelocity(p-ivec2(1,0)).x+wallVelocity(p+ivec2(0,1)).y-wallVelocity(p-ivec2(0,1)).y)/(2.0*cell);
  result=vec4(div,0,0,1);return;
 }
 if(pass==2){
  if(solid(p)){result=vec4(0);return;}
  float center=texelFetch(pressure,p,0).x;
  float sum=neighbourPressure(p+ivec2(1,0),center)+neighbourPressure(p-ivec2(1,0),center)+neighbourPressure(p+ivec2(0,1),center)+neighbourPressure(p-ivec2(0,1),center);
  float value=(sum-texelFetch(divergence,p,0).x*cell*cell)*.25;
  result=vec4(value,0,0,1);return;
 }
 if(pass==3){
  vec2 v=texelFetch(velocity,p,0).xy;float center=texelFetch(pressure,p,0).x;
  v-=vec2(neighbourPressure(p+ivec2(1,0),center)-neighbourPressure(p-ivec2(1,0),center),neighbourPressure(p+ivec2(0,1),center)-neighbourPressure(p-ivec2(0,1),center))/(2.0*cell);
  if(solid(p))v=pointerVelocity;
  ivec2 size=textureSize(velocity,0);if(p.x==0||p.x==size.x-1)v.x=0.0;if(p.y==0||p.y==size.y-1)v.y=0.0;
  v*=min(1.0,maxSpeed/max(length(v),.001));result=vec4(v,0,1);return;
 }
 // R: density, G: lifecycle activity, B: signed height in world units.
 vec2 v=texelFetch(velocity,p,0).xy;
 vec2 back=uv+shift/extent-v*dt/extent;
 vec3 m=sampleField(material,back,vec4(1,0,0,1)).rgb;
 vec2 texel=1.0/vec2(textureSize(material,0));
 vec3 neighbours=sampleField(material,back+vec2(texel.x,0),vec4(1,0,0,1)).rgb+
 sampleField(material,back-vec2(texel.x,0),vec4(1,0,0,1)).rgb+
 sampleField(material,back+vec2(0,texel.y),vec4(1,0,0,1)).rgb+
 sampleField(material,back-vec2(0,texel.y),vec4(1,0,0,1)).rgb;
 m.r=clamp(m.r+(neighbours.r-4.0*m.r)*densityDiffusion*dt/(cell*cell),0.0,1.4);
 // Diffusion closes the groove geometrically; damping relaxes it toward flat.
 m.b=(m.b+(neighbours.b-4.0*m.b)*heightSmoothing*dt/(cell*cell))*exp(-dt/heightRecovery);
 m.g*=exp(-dt/disturbanceDecay);
 if(brushActive>.5){
  vec2 delta=world-pointer;float d=length(delta),speed=length(pointerVelocity);
  vec2 axis=speed>.001?pointerVelocity/speed:vec2(1,0);
  float forward=dot(delta,axis),side=abs(dot(delta,vec2(-axis.y,axis.x)));
  float motion=smoothstep(0.0,8.0,speed),fast=clamp(speed/320.0,0.0,1.0);
  // Swept contact connects even sparse, fast pointer samples.
  vec2 segment=pointer-strokeStart;
  float along=clamp(dot(world-strokeStart,segment)/max(dot(segment,segment),.0001),0.0,1.0);
  float swept=distance(world,strokeStart+segment*along);
  // Circular world-space kernel, C2-continuous at center and rim.
  // Squared radial distance avoids a flat central plateau and grid-aligned corners.
  float radial=clamp(swept*swept/(radius*radius),0.0,1.0);
  float groove=1.0-radial*radial*radial*(radial*(radial*6.0-15.0)+10.0);
  float bow=exp(-pow((forward-radius*.83)/(radius*.30),2.0)-pow(side/(radius*.8),2.0));
  float ridges=exp(-pow((side-radius*.88)/(radius*.22),2.0))*exp(-pow((forward+radius*.28)/(radius*1.12),2.0));
  float target=surfaceDepth*(-groove*.72+bow*(.50+fast*.65)+ridges*.48)*motion;
  float contact=max(groove,max(bow,ridges))*motion;
  m.b=mix(m.b,target,(1.0-exp(-32.0*dt))*contact);
  m.r*=smoothstep(radius-cell*.5,radius+cell*.5,d);
 }
 m.g=max(m.g,clamp(abs(m.b)/surfaceDepth,0.0,1.0));
 result=vec4(m,1);
}`;

export const compositeFragment=`#version 300 es
precision highp float;
uniform sampler2D material;
uniform sampler2D velocity;
uniform sampler2D pressure;
uniform sampler2D background;
uniform float hasBackground;
uniform vec2 viewport;
uniform vec3 camera;
uniform vec2 origin;
uniform vec2 extent;
uniform vec3 colour;
uniform vec2 cursor;
uniform float drawing;
in vec2 uv;
out vec4 result;
vec4 sampleLinear(sampler2D t,vec2 q){vec2 size=vec2(textureSize(t,0)),p=q*size-.5;ivec2 a=ivec2(floor(p));vec2 f=fract(p);ivec2 limit=ivec2(size)-1;return mix(mix(texelFetch(t,clamp(a,ivec2(0),limit),0),texelFetch(t,clamp(a+ivec2(1,0),ivec2(0),limit),0),f.x),mix(texelFetch(t,clamp(a+ivec2(0,1),ivec2(0),limit),0),texelFetch(t,clamp(a+ivec2(1,1),ivec2(0),limit),0),f.x),f.y);}
// Cubic B-spline reconstruction of height removes bilinear cell seams from
// surface normals without spreading the simulated wake or changing contact size.
vec2 surfaceSlope(vec2 q,vec2 worldCell){
 vec2 size=vec2(textureSize(material,0)),p=q*size-.5,f=fract(p);
 ivec2 base=ivec2(floor(p)),limit=ivec2(size)-1;
 vec2 f2=f*f,f3=f2*f;
 vec4 wx=vec4(pow(1.0-f.x,3.0),3.0*f3.x-6.0*f2.x+4.0,-3.0*f3.x+3.0*f2.x+3.0*f.x+1.0,f3.x)/6.0;
 vec4 wy=vec4(pow(1.0-f.y,3.0),3.0*f3.y-6.0*f2.y+4.0,-3.0*f3.y+3.0*f2.y+3.0*f.y+1.0,f3.y)/6.0;
 // Analytic derivatives of the same smooth reconstruction: 16 fetches total.
 vec4 dx=vec4(-3.0*pow(1.0-f.x,2.0),9.0*f2.x-12.0*f.x,-9.0*f2.x+6.0*f.x+3.0,3.0*f2.x)/6.0;
 vec4 dy=vec4(-3.0*pow(1.0-f.y,2.0),9.0*f2.y-12.0*f.y,-9.0*f2.y+6.0*f.y+3.0,3.0*f2.y)/6.0;
 vec2 slope=vec2(0);
 for(int y=0;y<4;y++)for(int x=0;x<4;x++){
  float h=texelFetch(material,clamp(base+ivec2(x-1,y-1),ivec2(0),limit),0).b;
  slope+=h*vec2(dx[x]*wy[y],wx[x]*dy[y]);
 }
 return slope/worldCell;
}
void main(){
 vec2 screen=vec2(uv.x,1.0-uv.y)*viewport,world=(screen-camera.xy)/camera.z,q=(world-origin)/extent;
 vec4 outputColour=vec4(0);
 if(all(greaterThan(q,vec2(0)))&&all(lessThan(q,vec2(1)))){
  vec2 texel=1.0/vec2(textureSize(material,0)),worldCell=extent*texel;
  // Shade signed surface geometry rather than an activity halo.
  vec2 slope=surfaceSlope(q,worldCell);
  vec3 normal=normalize(vec3(-slope*2.2,1.0));
  float shape=smoothstep(.002,.075,length(slope));
  vec3 light=normalize(vec3(-.6,-.8,1.3)),halfway=normalize(light+vec3(0,0,1));
  float diffuse=dot(normal,light)-light.z;
  float highlight=max(0.0,pow(max(0.0,dot(normal,halfway)),55.0)-pow(halfway.z,55.0))*.55*shape;
  float shadow=max(0.0,-diffuse)*.26*shape;
  // Optical displacement is world-sized and scales with the board camera.
  vec2 offset=slope*14.0*camera.z;
  vec3 refracted=texture(background,clamp(screen/viewport+offset/viewport,vec2(0),vec2(1))).rgb;
  float mask=shape*.82*hasBackground;
  vec3 accent=mix(vec3(1),colour,.045)*highlight;
  float alpha=mask+(highlight+shadow)*(1.0-mask);
  outputColour=vec4(refracted*(1.0-shadow)*mask+accent,clamp(alpha,0.0,1.0));
 }
 float r=length(screen-cursor);float marker=(1.0-smoothstep(.4,1.1,abs(r-3.0)))*.25*drawing;
 result=outputColour+vec4(colour*marker,marker)*(1.0-outputColour.a);
}`;

export const reductionFragment=`#version 300 es
precision highp float;
precision highp int;
uniform sampler2D source;
uniform sampler2D velocity;
uniform int first;
out vec4 result;
void main(){
 if(first==2){result=texelFetch(source,ivec2(0),0);return;}
 ivec2 base=ivec2(gl_FragCoord.xy)*2,limit=textureSize(source,0)-1;vec2 peak=vec2(0);
 for(int y=0;y<2;y++)for(int x=0;x<2;x++){
  ivec2 p=min(base+ivec2(x,y),limit);vec4 value=texelFetch(source,p,0);
  vec2 v=first==1?vec2(value.g,length(texelFetch(velocity,p,0).xy)/320.0):value.rg;peak=max(peak,v);
 }
 result=vec4(peak,0,1);
}`;
