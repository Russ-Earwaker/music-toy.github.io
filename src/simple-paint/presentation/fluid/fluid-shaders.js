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
uniform sampler2D contact;
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
uniform float velocityDecay;
uniform float disturbanceDecay;
uniform float heightRecovery;
uniform float heightSmoothing;
uniform float wakeDiffusion;
uniform float restDepth;
uniform float pressRate;
uniform float closureDiffusion;
uniform float lateLevelingDiffusion;
uniform vec2 strokeStart;
in vec2 uv;
out vec4 result;
vec4 fetch(sampler2D t,ivec2 p,vec4 outside){ivec2 size=textureSize(t,0);if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,size)))return outside;return texelFetch(t,p,0);}
// Explicit bilinear sampling: no float-linear extension dependency.
vec4 sampleField(sampler2D t,vec2 q,vec4 outside){
 vec2 pos=q*vec2(textureSize(t,0))-.5;ivec2 p=ivec2(floor(pos));vec2 f=fract(pos);
 return mix(mix(fetch(t,p,outside),fetch(t,p+ivec2(1,0),outside),f.x),mix(fetch(t,p+ivec2(0,1),outside),fetch(t,p+ivec2(1,1),outside),f.x),f.y);
}
float contactCoverage(ivec2 p){vec2 q=(vec2(p)+.5)*cell+origin;return brushActive*(1.0-smoothstep(radius-cell*.75,radius+cell*.75,distance(q,pointer)));}
bool solid(ivec2 p){vec2 q=(vec2(p)+.5)*cell+origin;return brushActive>.5&&distance(q,pointer)<radius;}
vec2 wallVelocity(ivec2 p){ivec2 size=textureSize(velocity,0);if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,size)))return vec2(0);return mix(texelFetch(velocity,p,0).xy,pointerVelocity,contactCoverage(p));}
float neighbourPressure(ivec2 p,float center){ivec2 size=textureSize(pressure,0);if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,size))||solid(p))return center;return texelFetch(pressure,p,0).x;}
vec2 closestStroke(vec2 w){vec2 segment=pointer-strokeStart;float t=clamp(dot(w-strokeStart,segment)/max(dot(segment,segment),.0001),0.0,1.0);return strokeStart+segment*t;}
float pressKernel(vec2 w){float t=clamp((distance(w,closestStroke(w))/radius-.4)/.6,0.0,1.0);return 1.0-t*t*t*(t*(t*6.0-15.0)+10.0);}
ivec2 ridgeOffset(int i){float angle=float(i)*.3926990817;return ivec2(round(vec2(cos(angle),sin(angle))*radius*1.15/cell));}
float ridgeWeight(vec2 w){
 vec2 delta=w-closestStroke(w);float d=length(delta);
 float annulus=smoothstep(radius*.70,radius*1.02,d)*exp(-pow((d-radius*1.1)/(radius*.26),2.0));
 float speed=length(pointerVelocity),fast=clamp(speed/320.0,0.0,1.0);vec2 axis=pointerVelocity/max(speed,.001),n=delta/max(d,.001);
 float side=1.0-pow(dot(n,axis),2.0),front=max(0.0,dot(n,axis))*exp(-dot(w-pointer,w-pointer)/(radius*radius*3.0));
 return annulus*(1.0+fast*(side+front*.6));
}
float mobility(float age){return mix(heightSmoothing,closureDiffusion,smoothstep(heightRecovery*.15,heightRecovery*.6,age))+lateLevelingDiffusion*smoothstep(heightRecovery*.4,heightRecovery*.9,age);}
// Antisymmetric, positivity-limited depth flux. The nine-point diffusion is
// pressure-driven leveling; upwind face transport follows the existing velocity.
float incomingDepth(ivec2 p,ivec2 o,vec4 center,vec2 v){
 ivec2 size=textureSize(material,0),n=p+o;if(any(lessThan(n,ivec2(0)))||any(greaterThanEqual(n,size)))return 0.0;
 vec4 neighbour=fetch(material,n+ivec2(round(shift/cell)),vec4(1,0,0,8));
 float dc=max(0.0,restDepth+center.b),dn=max(0.0,restDepth+neighbour.b);
 bool axial=o.x==0||o.y==0;float weight=axial?4.0/6.0:1.0/6.0;
 float flux=(mobility(center.a)+mobility(neighbour.a))*.5*(dn-dc)*weight/(cell*cell);
 if(axial){vec2 nv=texelFetch(velocity,n,0).xy;float speed=dot((v+nv)*.5,vec2(o));// Depth-averaged base drag: a nearly exposed channel has very little slip.
  speed*=min(dc,dn)/max(min(dc,dn)+restDepth*2.0,.001);flux-=speed*(speed>=0.0?dc:dn)/cell;}
 return clamp(flux,-dc/max(8.0*dt,.00001),dn/max(8.0*dt,.00001));
}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);vec2 world=origin+(vec2(p)+.5)*cell;
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
   v=mix(v,pointerVelocity,1.0-smoothstep(radius-cell*.75,radius+cell*.75,d));
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
  // The finger is a moving wall, not liquid travelling inside the cleared hole.
  v=mix(v,vec2(0),contactCoverage(p));
  ivec2 size=textureSize(velocity,0);if(p.x==0||p.x==size.x-1)v.x=0.0;if(p.y==0||p.y==size.y-1)v.y=0.0;
  v*=min(1.0,maxSpeed/max(length(v),.001));result=vec4(v,0,1);return;
 }
 if(pass==5){
  vec4 m=texelFetch(material,p,0);float depth=max(0.0,restDepth+m.b);
  float kernel=brushActive*pressKernel(world),target=restDepth*(1.0-kernel);
  float response=1.0-exp(-(pressRate*dt+distance(pointer,strokeStart)/radius*.8)*kernel);
  float removed=max(0.0,depth-target)*response,totalWeight=0.0;
  if(removed<=.000001)removed=0.0;
  if(removed>.000001)for(int i=0;i<16;i++)totalWeight+=ridgeWeight(world+vec2(ridgeOffset(i))*cell);
  result=vec4(removed,totalWeight,kernel,0);return;
 }
 if(pass==6){
  vec4 m=texelFetch(material,p,0),c=texelFetch(contact,p,0);float deposited=0.0;
  float weight=ridgeWeight(world);
  if(brushActive>.5&&weight>.000001)for(int i=0;i<16;i++){
   vec4 source=fetch(contact,p-ridgeOffset(i),vec4(0));
   deposited+=source.r*weight/max(source.g,.00001);
  }
  // Every source distributes its actual removal using its own normalization.
  // This conserves displaced volume; repeated holding cannot emit fresh liquid.
  float depth=max(0.0,restDepth+m.b-c.r+deposited);
  m.b=depth-restDepth;m.r=depth/restDepth;
  float energy=(c.r+deposited)/restDepth;
  m.g=clamp(m.g+(1.0-m.g)*(1.0-exp(-energy*8.0)),0.0,1.0);
  if(energy>.00001)m.a=min(m.a,.08/max(energy*8.0,.001));
  // A held finger sustains a viscous meniscus; after release this constraint
  // vanishes and the same conservative flux levels it inward.
  if(brushActive>.5&&(c.b>.01||weight>.05))m.a=min(m.a,.1);
  result=m;return;
 }
 // R: depth/restDepth, G: memory, B: depth-restDepth, A: deformation age.
 // Keep the calm depth exact; depth never falls below the solid base.
 vec2 q=uv+shift/extent;vec4 center=fetch(material,p+ivec2(round(shift/cell)),vec4(1,0,0,8));
 vec2 v=texelFetch(velocity,p,0).xy;
 float localDepth=max(0.0,restDepth+center.b);vec2 memoryVelocity=v*localDepth/max(localDepth+restDepth*2.0,.001);
 vec2 back=q-memoryVelocity*dt/extent;vec4 m=sampleField(material,back,vec4(1,0,0,8));
 float flux=0.0;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)if(x!=0||y!=0)flux+=incomingDepth(p,ivec2(x,y),center,v);
 float depth=max(0.0,restDepth+center.b+dt*flux);
 m.b=depth-restDepth;m.r=depth/restDepth;
 vec2 texel=1.0/vec2(textureSize(material,0));
 float neighbours=sampleField(material,back+vec2(texel.x,0),vec4(1,0,0,8)).g+sampleField(material,back-vec2(texel.x,0),vec4(1,0,0,8)).g+
 sampleField(material,back+vec2(0,texel.y),vec4(1,0,0,8)).g+sampleField(material,back-vec2(0,texel.y),vec4(1,0,0,8)).g;
 float diagonal=sampleField(material,back+texel,vec4(1,0,0,8)).g+sampleField(material,back-texel,vec4(1,0,0,8)).g+
 sampleField(material,back+vec2(texel.x,-texel.y),vec4(1,0,0,8)).g+sampleField(material,back+vec2(-texel.x,texel.y),vec4(1,0,0,8)).g;
 float memoryLap=(neighbours*4.0+diagonal-20.0*m.g)/6.0;
 m.a=min(16.0,m.a+dt);m.g=max(0.0,m.g+memoryLap*wakeDiffusion*dt/(cell*cell));
 m.g*=exp(-dt*(1.0/(disturbanceDecay*mix(.65,1.2,clamp(m.g,0.0,1.0)))+smoothstep(1.5,3.8,m.a)*1.6));
 result=m;
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
uniform float domainFadeWorld;
uniform float restDepth;
uniform int debugView;
in vec2 uv;
out vec4 result;
vec4 sampleLinear(sampler2D t,vec2 q){vec2 size=vec2(textureSize(t,0)),p=q*size-.5;ivec2 a=ivec2(floor(p));vec2 f=fract(p);ivec2 limit=ivec2(size)-1;return mix(mix(texelFetch(t,clamp(a,ivec2(0),limit),0),texelFetch(t,clamp(a+ivec2(1,0),ivec2(0),limit),0),f.x),mix(texelFetch(t,clamp(a+ivec2(0,1),ivec2(0),limit),0),texelFetch(t,clamp(a+ivec2(1,1),ivec2(0),limit),0),f.x),f.y);}
// Cubic B-spline reconstruction of height removes bilinear cell seams from
// surface normals without spreading the simulated wake or changing contact size.
vec4 surfaceSample(vec2 q,vec2 worldCell,out vec2 slope,out float curvature){
 vec2 size=vec2(textureSize(material,0)),p=q*size-.5,f=fract(p);
 ivec2 base=ivec2(floor(p)),limit=ivec2(size)-1;
 vec2 f2=f*f,f3=f2*f;
 vec4 wx=vec4(pow(1.0-f.x,3.0),3.0*f3.x-6.0*f2.x+4.0,-3.0*f3.x+3.0*f2.x+3.0*f.x+1.0,f3.x)/6.0;
 vec4 wy=vec4(pow(1.0-f.y,3.0),3.0*f3.y-6.0*f2.y+4.0,-3.0*f3.y+3.0*f2.y+3.0*f.y+1.0,f3.y)/6.0;
 // Analytic derivatives of the same smooth reconstruction: 16 fetches total.
 vec4 dx=vec4(-3.0*pow(1.0-f.x,2.0),9.0*f2.x-12.0*f.x,-9.0*f2.x+6.0*f.x+3.0,3.0*f2.x)/6.0;
 vec4 dy=vec4(-3.0*pow(1.0-f.y,2.0),9.0*f2.y-12.0*f.y,-9.0*f2.y+6.0*f.y+3.0,3.0*f2.y)/6.0;
 // Second derivatives come from the same sixteen samples, not extra textures.
 vec4 ddx=vec4(1.0-f.x,3.0*f.x-2.0,1.0-3.0*f.x,f.x);
 vec4 ddy=vec4(1.0-f.y,3.0*f.y-2.0,1.0-3.0*f.y,f.y);
 slope=vec2(0);curvature=0.0;vec4 value=vec4(0);
 for(int y=0;y<4;y++)for(int x=0;x<4;x++){
  vec4 parcel=texelFetch(material,clamp(base+ivec2(x-1,y-1),ivec2(0),limit),0);
  value+=parcel*wx[x]*wy[y];float h=parcel.b;
  slope+=h*vec2(dx[x]*wy[y],wx[x]*dy[y]);
  curvature+=h*(ddx[x]*wy[y]/(worldCell.x*worldCell.x)+wx[x]*ddy[y]/(worldCell.y*worldCell.y));
 }
 slope/=worldCell;return value;
}
void main(){
 vec2 screen=vec2(uv.x,1.0-uv.y)*viewport,world=(screen-camera.xy)/camera.z,q=(world-origin)/extent;
 vec4 outputColour=vec4(0);
 if(all(greaterThan(q,vec2(0)))&&all(lessThan(q,vec2(1)))){
  vec2 texel=1.0/vec2(textureSize(material,0)),worldCell=extent*texel;
  vec2 slope;float curvature;vec4 surface=surfaceSample(q,worldCell,slope,curvature);
  // Influence vanishes smoothly before the rectangular texture boundary. Apply
  // the mask to height as well as its derivative, so optics match geometry.
  vec2 edgeWorld=min(q,1.0-q)*extent;
  vec2 edge=smoothstep(vec2(0),vec2(domainFadeWorld),edgeWorld);
  vec2 t=clamp(edgeWorld/domainFadeWorld,0.0,1.0);
  vec2 edgeDerivative=6.0*t*(1.0-t)/domainFadeWorld*sign(.5-q);
  float domainMask=edge.x*edge.y;
  slope=slope*domainMask+surface.b*edgeDerivative*edge.yx;
  float height=surface.b*domainMask,memory=surface.g*domainMask;
  float liquidDepth=max(0.0,restDepth+height);
  float wet=smoothstep(restDepth*.01,restDepth*.25,liquidDepth);
  float depthRefraction=1.5*liquidDepth/max(liquidDepth+restDepth*.5,.0001);
  float slopeMagnitude=length(slope),displacement=abs(height);
  // Memory amplifies real, shallow geometry; exactly flat remembered liquid has
  // zero physicalMask and remains invisible. No lifetime/geometry changes here.
  float physicalMask=1.0-exp(-displacement*.32-slopeMagnitude*12.0);
  float memoryPhysicalGate=1.0-exp(-displacement*2.0-slopeMagnitude*28.0);
  float recent=sqrt(clamp(memory*2.5,0.0,1.0))*memoryPhysicalGate;
  float edgeStrength=1.0-exp(-slopeMagnitude*(12.0+recent*36.0)-abs(curvature)*domainMask*(7.0+recent*10.0));
  float bodyStrength=1.0-exp(-displacement*.13);
  float optical=1.0-exp(-slopeMagnitude*10.0-displacement*.07-recent*.5);
  float normalGain=2.2*(1.0+recent*1.2);
  vec3 normal=normalize(vec3(-slope*normalGain,1.0));
  vec3 light=normalize(vec3(-.6,-.8,1.3)),halfway=normalize(light+vec3(0,0,1));
  float spec=pow(max(0.0,dot(normal,halfway)),42.0),flatSpec=pow(halfway.z,42.0);
  float highlight=max(0.0,spec-flatSpec)*.38*optical;
  vec2 slopeDirection=slope/max(slopeMagnitude,.00001);
  float edgeLight=.4+.6*pow(dot(slopeDirection,normalize(vec2(-.6,-.8))),2.0);
  float meniscus=edgeStrength*(.10+.14*recent)*edgeLight;
  meniscus+=(1.0-exp(-abs(curvature)*domainMask*30.0))*.10*physicalMask;
  float shadow=max(0.0,light.z-dot(normal,light))*.16*optical*wet;
  float baseBoundary=(1.0-smoothstep(restDepth*.25,restDepth*.65,liquidDepth))*smoothstep(restDepth*.01,restDepth*.12,liquidDepth);
  float contactMeniscus=edgeStrength*baseBoundary*.045*wet;
  // The optical path itself vanishes against the solid base. Limit ridge
  // lensing so base artwork bends rather than folding into detached patches.
  float opticalPath=min(6.0,liquidDepth*.65);
  vec2 offsetWorld=slope*(22.0+recent*36.0)*depthRefraction*wet;
  offsetWorld/=sqrt(1.0+dot(offsetWorld,offsetWorld)/max(opticalPath*opticalPath,.00001));
  vec2 offset=offsetWorld*camera.z;
  vec3 refracted=texture(background,clamp(screen/viewport+offset/viewport,vec2(0),vec2(1))).rgb;
  // This coverage replaces the background with refracted BACKGROUND, not white
  // body opacity. Height adds restrained signed thickness contrast.
  float mask=min(.95,1.0-exp(-displacement*.9-slopeMagnitude*24.0-recent))*hasBackground*wet;
  float signedThickness=height/(displacement+2.0)*(.7+.3*bodyStrength);
  vec3 transmitted=clamp(refracted*(1.0+signedThickness*.065-shadow),0.0,1.0);
  // Raised liquid catches the main reflection; a filling depression should
  // not become a floating bright patch. Its base boundary has its own thin rim.
  float depthReflection=smoothstep(0.0,restDepth,liquidDepth);
  float sheen=clamp((highlight+meniscus)*wet*depthReflection+contactMeniscus,0.0,.42);
  float tint=debugView==8?0.0:mix(.05,.10,recent);
  vec3 reflection=mix(vec3(1),colour,tint)*sheen;
  float alpha=mask+(sheen+shadow)*(1.0-mask);
  outputColour=vec4(transmitted*mask*(1.0-sheen)+reflection,clamp(alpha,0.0,1.0));
  if(debugView==6)outputColour=vec4(refracted*mask,mask);
  if(debugView==7)outputColour=vec4(reflection,sheen);
  // Development-only comparison diagnostics; never selected by production.
  if(debugView==1)outputColour=vec4(vec3(.5)+vec3(-height*.025,0,height*.025),1);
  if(debugView==2)outputColour=vec4(vec3(memory),1);
  if(debugView==3)outputColour=vec4(vec3(length(sampleLinear(velocity,q).xy)/320.0),1);
  if(debugView==4)outputColour=vec4(vec3(domainMask),1);
  if(debugView==5)outputColour=vec4(normal*.5+.5,1);
  if(debugView==10)outputColour=vec4(min(vec2(1),abs(offsetWorld)/4.0),0,1);
  if(debugView==9){float d=liquidDepth/restDepth;vec3 depthColour=d<1.0?mix(vec3(.27,.10,.025),vec3(.12,.46,.66),d):mix(vec3(.12,.46,.66),vec3(1,.83,.38),1.0-exp(-(d-1.0)));outputColour=vec4(depthColour,1); }
 }
 // Pointer feedback belongs to the board UI; liquid cues come from geometry.
 result=outputColour;
}`;

export const reductionFragment=`#version 300 es
precision highp float;
precision highp int;
uniform sampler2D source;
uniform sampler2D velocity;
uniform int first;
uniform float restDepth;
out vec4 result;
void main(){
 if(first==2){result=texelFetch(source,ivec2(0),0);return;}
 ivec2 base=ivec2(gl_FragCoord.xy)*2,limit=textureSize(source,0)-1;vec2 peak=vec2(0);
 for(int y=0;y<2;y++)for(int x=0;x<2;x++){
  ivec2 p=min(base+ivec2(x,y),limit);vec4 value=texelFetch(source,p,0);
  vec2 v=first==1?vec2(max(value.g,abs(value.b)/restDepth),length(texelFetch(velocity,p,0).xy)/320.0):value.rg;peak=max(peak,v);
 }
 result=vec4(peak,0,1);
}`;
