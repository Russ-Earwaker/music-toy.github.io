// Optional, asynchronous timing. No forced completion and at most three pending queries.
export function createFluidGPUTimer(gl){
 const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),pending=[];let current=null,gpuMs=null,samples=0,total=0;
 function poll(){
  if(!ext)return;
  while(pending.length&&gl.getQueryParameter(pending[0],gl.QUERY_RESULT_AVAILABLE)){
   const query=pending.shift();if(!gl.getParameter(ext.GPU_DISJOINT_EXT)){gpuMs=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;samples++;total+=gpuMs;}gl.deleteQuery(query);
  }
 }
 return {
  begin(){poll();if(ext&&!current&&pending.length<3){current=gl.createQuery();if(current)gl.beginQuery(ext.TIME_ELAPSED_EXT,current);}},
  end(){if(current){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(current);current=null;}},
  destroy(){if(current){gl.endQuery(ext.TIME_ELAPSED_EXT);gl.deleteQuery(current);current=null;}for(const query of pending)gl.deleteQuery(query);pending.length=0;},
  get gpuMs(){return gpuMs;},get meanMs(){return samples?total/samples:null;},get samples(){return samples;},get supported(){return !!ext;}
 };
}
