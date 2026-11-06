export const HIGH_LIQUID=Object.freeze({splatDiameter:18,blurWorld:3,calmOpacity:0});
export const splatVertex=`#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec4 point;
layout(location=1) in float opacity;
layout(location=2) in vec3 flow;
uniform vec2 viewport;
uniform vec2 pixelScale;
uniform int marker;
out float energy;
out float fade;
out vec2 direction;
out float speed;
out float pressure;
out float stretch;
out vec2 rasterCorrection;
void main(){
 gl_Position=vec4(point.x/viewport.x*2.0-1.0,1.0-point.y/viewport.y*2.0,0,1);
 speed=clamp(length(flow.xy)/105.0,0.0,1.0);stretch=marker==1?1.0:1.0+speed*.35;
 float pixels=max(pixelScale.x,pixelScale.y);rasterCorrection=vec2(pixels)/pixelScale;
 gl_PointSize=(marker==1?point.z:point.z*${HIGH_LIQUID.splatDiameter.toFixed(1)}*stretch)*pixels;
 direction=vec2(flow.x,-flow.y);energy=point.w;fade=opacity;pressure=flow.z;
}`;
export const splatFragment=`#version 300 es
precision highp float;
precision highp int;
uniform int marker;
uniform vec3 colour;
in float energy;
in float fade;
in vec2 direction;
in float speed;
in float pressure;
in float stretch;
in vec2 rasterCorrection;
out vec4 result;
void main(){
 vec2 p=(gl_PointCoord-vec2(.5))*rasterCorrection;float r=length(p)*2.0;
 if(marker==1){if(r>1.0)discard;float a=smoothstep(.82,.90,r)*(1.0-smoothstep(.94,1.0,r))*.2*fade;result=vec4(colour*a,a);return;}
 vec2 axis=length(direction)>.001?normalize(direction):vec2(1,0);
 r=length(vec2(dot(p,axis),dot(p,vec2(-axis.y,axis.x))*stretch))*2.0;if(r>1.0)discard;
 float mass=exp(-r*r*3.5)*.055*fade/stretch;
 // Separate channels: density, advected disturbance, velocity, compact pressure.
 // A moving but untouched parcel has zero disturbance and remains invisible.
 result=vec4(mass,mass*energy,mass*speed,mass*pressure);
}`;
export const screenVertex=`#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.0-1.0,0,1);}`;
export const blurFragment=`#version 300 es
precision highp float;
uniform sampler2D field;
uniform vec2 axis;
in vec2 uv;
out vec4 result;
void main(){
 result=texture(field,uv)*.227027;
 result+=(texture(field,uv+axis*1.384615)+texture(field,uv-axis*1.384615))*.316216;
 result+=(texture(field,uv+axis*3.230769)+texture(field,uv-axis*3.230769))*.070270;
}`;
export const shadeFragment=`#version 300 es
precision highp float;
uniform sampler2D field;
uniform vec2 texel;
uniform vec3 colour;
uniform vec4 domain;
in vec2 uv;
out vec4 result;
void main(){
 vec2 q=(uv-domain.xy)/domain.zw;
 if(any(lessThan(q,vec2(0)))||any(greaterThan(q,vec2(1)))){result=vec4(0);return;}
 vec4 f=texture(field,q);float density=f.r;
 float disturbance=clamp(f.g/max(density,.012),0.0,1.0);
 float disturbed=smoothstep(.018,.65,disturbance);
 float flow=clamp(f.b/max(density,.012),0.0,1.0);
 float pressure=clamp(f.a/max(density,.012),0.0,1.0);
 float body=smoothstep(.012,.14,density);
 float dx=texture(field,q+vec2(texel.x,0)).r-texture(field,q-vec2(texel.x,0)).r;
 float dy=texture(field,q+vec2(0,texel.y)).r-texture(field,q-vec2(0,texel.y)).r;
 float gradient=length(vec2(dx,dy))/max(.04,density);
 float edge=smoothstep(.06,.65,gradient)*disturbed*body;
 float compressed=pressure*disturbed*body;
 float a=body*disturbed*(.24+flow*.08)+edge*.46+compressed*.15;
 // Rich interior, pale edges/front. All light is gated by transported disturbance.
 vec3 tint=mix(colour,vec3(1),clamp(edge*.48+compressed*.3+flow*disturbed*.06,0.0,.68));
 float shoulder=smoothstep(.003,.05,density)*disturbed*.035;
 a=clamp(a+shoulder,0.0,.84);result=vec4(tint*a,a);
}`;
